package systems

import "testing"

// fakeConn mimics the PeerJS DataConnection surface used by Network.
type fakeConn struct {
	peer     string
	open     bool
	closed   bool
	handlers map[string]any
	sent     []any
}

func newFakeConn(peer string, open bool) *fakeConn {
	return &fakeConn{peer: peer, open: open, handlers: map[string]any{}, sent: make([]any, 0)}
}

func (c *fakeConn) on(event string, handler any) { c.handlers[event] = handler }
func (c *fakeConn) send(data any)                { c.sent = append(c.sent, data) }
func (c *fakeConn) close()                       { c.closed = true }

func (c *fakeConn) emit(event string, arg any) {
	h := c.handlers[event]
	if h != nil {
		h(arg)
	}
}

// fakePeer mimics the PeerJS Peer surface used by Network.
type fakePeer struct {
	id        string
	destroyed bool
	handlers  map[string]any
	options   any
	outgoing  []*fakeConn
}

func newFakePeer() *fakePeer {
	return &fakePeer{handlers: map[string]any{}, outgoing: make([]*fakeConn, 0)}
}

func (p *fakePeer) on(event string, handler any) { p.handlers[event] = handler }
func (p *fakePeer) destroy()                     { p.destroyed = true }

func (p *fakePeer) connect(peerID string, options any) any {
	c := newFakeConn(peerID, false)
	p.outgoing = append(p.outgoing, c)
	return c
}

func (p *fakePeer) emit(event string, arg any) {
	h := p.handlers[event]
	if h != nil {
		h(arg)
	}
}

func (p *fakePeer) factory() PeerFactory {
	return func(options any) any {
		p.options = options
		return p
	}
}

func TestNetworkIdleDefaults(t *testing.T) {
	n := NewNetwork()
	if n.Role != NetRoleNone || n.IsConnected() || n.PeerID() != "" || n.ClientCount() != 0 {
		t.Error("new network must be idle")
	}
	// No-ops without a connection.
	n.Broadcast(map[string]any{})
	n.SendPosition(map[string]any{})
	n.Disconnect()
}

async func TestNetworkHostResolvesWhenPeerOpens(t *testing.T) {
	n := NewNetwork()
	fp := newFakePeer()
	n.NewPeer = fp.factory()

	pending := n.Host()
	if n.Role != NetRoleHost || !n.IsConnected() {
		t.Fatal("Host must adopt the host role before the peer opens")
	}
	if fp.options == nil || fp.options.config == nil || fp.options.config.iceServers.length != 2 {
		t.Error("Peer must be constructed with the ICE config")
	}

	fp.id = "host-1"
	fp.emit("open", "host-1")
	id := await pending
	if id != "host-1" || n.PeerID() != "host-1" {
		t.Errorf("expected host id 'host-1', got %q / %q", id, n.PeerID())
	}

	// A second Host() call is rejected.
	again := await n.Host()
	if again != "" {
		t.Error("Host while connected must resolve to empty id")
	}
}

async func TestNetworkHostResolvesEmptyOnError(t *testing.T) {
	n := NewNetwork()
	fp := newFakePeer()
	n.NewPeer = fp.factory()

	pending := n.Host()
	fp.emit("error", "boom")
	if id := await pending; id != "" {
		t.Errorf("expected empty id on error, got %q", id)
	}
}

func TestNetworkHostWithoutPeerJS(t *testing.T) {
	n := NewNetwork()
	n.NewPeer = func(options any) any { return nil }
	n.Host()
	if n.Role != NetRoleNone || n.IsConnected() {
		t.Error("missing PeerJS must leave the network idle")
	}
}

async func TestNetworkHostRelaysPositionsAndBroadcasts(t *testing.T) {
	n := NewNetwork()
	fp := newFakePeer()
	n.NewPeer = fp.factory()

	gotPeer := ""
	var gotData any
	n.OnPeerPosition = func(peerID string, data any) {
		gotPeer = peerID
		gotData = data
	}
	disconnected := ""
	n.OnPeerDisconnect = func(peerID string) { disconnected = peerID }

	pending := n.Host()
	fp.emit("open", "host-1")
	await pending

	// One client already open, one that opens later.
	c1 := newFakeConn("client-a", true)
	c2 := newFakeConn("client-b", false)
	fp.emit("connection", c1)
	fp.emit("connection", c2)
	if n.ClientCount() != 1 {
		t.Fatalf("expected 1 ready client, got %d", n.ClientCount())
	}
	c2.emit("open", nil)
	c2.open = true
	c2.emit("open", nil) // duplicate open must not double-register
	if n.ClientCount() != 2 {
		t.Fatalf("expected 2 ready clients, got %d", n.ClientCount())
	}

	// Position packets are routed to the callback; other types are ignored.
	c1.emit("data", map[string]any{"type": NetMsgState, "payload": 1})
	if gotPeer != "" {
		t.Error("STATE packets must be ignored on the host")
	}
	payload := map[string]any{"pos": []float64{1, 2, 3}}
	c1.emit("data", map[string]any{"type": NetMsgPosition, "payload": payload})
	if gotPeer != "client-a" || gotData == nil || gotData.pos[1] != 2 {
		t.Error("POS payload not relayed to OnPeerPosition")
	}

	// Broadcast only reaches open connections.
	c2.open = false
	state := map[string]any{"players": []any{}}
	n.Broadcast(state)
	if len(c1.sent) != 1 || len(c2.sent) != 0 {
		t.Fatalf("broadcast reached %d/%d connections", len(c1.sent), len(c2.sent))
	}
	pkt := c1.sent[0]
	if pkt["type"] != NetMsgState || pkt.payload != state {
		t.Error("broadcast packet must wrap the state in a STATE message")
	}

	// Close removes the client and notifies.
	c1.emit("close", nil)
	if n.ClientCount() != 1 || disconnected != "client-a" {
		t.Error("closed client must be removed and reported")
	}

	n.Disconnect()
	if !fp.destroyed || n.IsConnected() || n.ClientCount() != 0 || n.Role != NetRoleNone {
		t.Error("Disconnect must destroy the peer and reset state")
	}
}

async func TestNetworkClientConnectsAndSendsPositions(t *testing.T) {
	n := NewNetwork()
	fp := newFakePeer()
	n.NewPeer = fp.factory()

	var gotState any
	n.OnStateUpdate = func(state any) { gotState = state }

	pending := n.Connect("host-1")
	if n.Role != NetRoleClient {
		t.Fatal("Connect must adopt the client role")
	}
	fp.id = "client-x"
	fp.emit("open", "client-x")
	if len(fp.outgoing) != 1 || fp.outgoing[0].peer != "host-1" {
		t.Fatal("peer open must connect to the host id")
	}
	conn := fp.outgoing[0]

	// Not open yet: sends are dropped.
	n.SendPosition(map[string]any{"pos": []float64{0, 0, 0}})
	if len(conn.sent) != 0 {
		t.Error("SendPosition before open must be dropped")
	}

	conn.open = true
	conn.emit("open", nil)
	ok := await pending
	if !ok || n.PeerID() != "client-x" {
		t.Fatalf("expected connect to resolve true, got %v", ok)
	}

	pos := map[string]any{"pos": []float64{1, 2, 3}}
	n.SendPosition(pos)
	if len(conn.sent) != 1 || conn.sent[0]["type"] != NetMsgPosition || conn.sent[0].payload != pos {
		t.Error("SendPosition must wrap the payload in a POS message")
	}

	// Broadcast is host-only.
	n.Broadcast(map[string]any{})
	if len(conn.sent) != 1 {
		t.Error("Broadcast must be ignored on a client")
	}

	// Incoming STATE is routed; other types ignored.
	conn.emit("data", map[string]any{"type": NetMsgPosition, "payload": 1})
	if gotState != nil {
		t.Error("POS packets must be ignored on the client")
	}
	state := map[string]any{"players": []any{}}
	conn.emit("data", map[string]any{"type": NetMsgState, "payload": state})
	if gotState != state {
		t.Error("STATE payload not relayed to OnStateUpdate")
	}

	n.Disconnect()
	if !conn.closed || !fp.destroyed || n.IsConnected() {
		t.Error("Disconnect must close the host connection and destroy the peer")
	}
}

async func TestNetworkClientConnectFailsOnError(t *testing.T) {
	n := NewNetwork()
	fp := newFakePeer()
	n.NewPeer = fp.factory()

	pending := n.Connect("host-1")
	fp.emit("open", "client-x")
	conn := fp.outgoing[0]
	if n.connectTimer == nil {
		t.Fatal("connect must arm the timeout")
	}
	conn.emit("error", "refused")
	conn.emit("open", nil) // late open must not flip the settled result
	if ok := await pending; ok {
		t.Error("connection error must resolve false")
	}
	if n.connectTimer != nil {
		t.Error("settling must clear the timeout")
	}

	// Peer-level error after connecting (e.g. peer-unavailable) also fails
	// and clears the timeout.
	n2 := NewNetwork()
	fp2 := newFakePeer()
	n2.NewPeer = fp2.factory()
	pending2 := n2.Connect("host-1")
	fp2.emit("open", "client-x")
	fp2.emit("error", "peer-unavailable")
	if ok := await pending2; ok || n2.connectTimer != nil {
		t.Error("peer error must resolve false and clear the timeout")
	}

	// Disconnect while pending clears the timeout too.
	n3 := NewNetwork()
	fp3 := newFakePeer()
	n3.NewPeer = fp3.factory()
	n3.Connect("host-1")
	fp3.emit("open", "client-x")
	n3.Disconnect()
	if n3.connectTimer != nil || !fp3.destroyed {
		t.Error("Disconnect while connecting must clear the timeout")
	}
}
