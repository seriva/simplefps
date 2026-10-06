package game

import (
	"testing"

	"../engine/mathx"
	"../engine/scene"
	"../engine/systems"
	"js:./interop.d.ts"
)

// ---------------------------------------------------------------------------
// PeerJS fakes (duck-typed against dependencies/peerjs.d.ts)
// ---------------------------------------------------------------------------

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

type fakePeer struct {
	id        string
	destroyed bool
	handlers  map[string]any
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

func newTestMultiplayer() (*Multiplayer, *fakePeer, *systems.Camera) {
	s, cam := newTestScene()
	fp := newFakePeer()
	mp := NewMultiplayer(s, cam)
	mp.NewPeer = func(options any) any { return fp }
	return mp, fp, cam
}

func posPacket(x, y, z float64) map[string]any {
	return map[string]any{"type": systems.NetMsgPosition, "payload": map[string]any{
		"pos": []float64{x, y, z},
		"rot": []float64{0, 90, 0},
	}}
}

func playerEntry(id string, x, y, z float64) map[string]any {
	return map[string]any{"id": id, "pos": []float64{x, y, z}, "rot": []float64{0, 0, 0}}
}

func meshCount(s *scene.Scene) int {
	_, n := s.GetEntities(scene.TypeMesh)
	return n
}

// ---------------------------------------------------------------------------
// netvalidation
// ---------------------------------------------------------------------------

func TestIsVec3(t *testing.T) {
	if !IsVec3([]float64{1, 2, 3}) || !IsVec3([]float32{1, 2, 3}) || !IsVec3([]any{1, 2, 3, 4}) {
		t.Error("numeric array-likes of length >= 3 must validate")
	}
	if IsVec3(nil) || IsVec3([]float64{1, 2}) || IsVec3("abc") || IsVec3(42) {
		t.Error("short, non-array or non-numeric values must be rejected")
	}
	var nan any = globalThis.NaN
	if IsVec3([]any{1, nan, 3}) || IsVec3([]any{1, "2", 3}) || IsVec3([]any{nil, 2, 3}) {
		t.Error("non-finite or non-number components must be rejected")
	}

	v := mathx.Vec3{}
	Vec3FromAny(&v, []float64{1.5, -2, 3})
	if v.X != 1.5 || v.Y != -2 || v.Z != 3 {
		t.Errorf("Vec3FromAny = %v", v)
	}
	out := []float64{0, 0, 0}
	Vec3ToArray(out, &v)
	dst := []float64{0, 0, 0}
	CopyVec3(dst, out)
	if dst[0] != 1.5 || dst[1] != -2 || dst[2] != 3 {
		t.Errorf("round trip = %v", dst)
	}
}

// ---------------------------------------------------------------------------
// remoteplayer
// ---------------------------------------------------------------------------

func TestRemotePlayerEasesAndDestroys(t *testing.T) {
	s, _ := newTestScene()
	start := mathx.Vec3{X: 0, Y: 10, Z: 0}
	rp := NewRemotePlayer(s, "p1", &start)
	if meshCount(s) != 1 || !rp.Entity.Base.CastShadow {
		t.Fatal("remote player must add a shadow-casting mesh entity")
	}
	if rp.Entity.Base.BaseMatrix[12] != 0 || rp.Entity.Base.BaseMatrix[13] != 10 || rp.Entity.Base.BaseMatrix[0] != RemotePlayerScale {
		t.Error("initial transform must place the scaled mesh at the spawn position")
	}

	rp.SetTarget(100, 10, 0)
	rp.Update(1.0 / 60.0)
	first := rp.Current.X
	if first <= 0 || first >= 100 {
		t.Fatalf("first step must move toward target, got %f", first)
	}
	for i := 0; i < 600; i++ {
		rp.Update(1.0 / 60.0)
	}
	if !approx(rp.Current.X, 100, 0.01) {
		t.Errorf("expected convergence to 100, got %f", rp.Current.X)
	}
	m := rp.Entity.Base.BaseMatrix
	if !approx(m[12], rp.Current.X, 1e-4) || m[0] != RemotePlayerScale || m[5] != RemotePlayerScale {
		t.Error("base matrix must be translation * uniform scale")
	}

	rp.Destroy()
	if meshCount(s) != 0 {
		t.Error("Destroy must remove the mesh entity")
	}
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

func TestMultiplayerApplyState(t *testing.T) {
	mp, _, _ := newTestMultiplayer()
	mp.myID = "me"

	mp.ApplyState(nil)
	mp.ApplyState(map[string]any{"players": "nope"})
	if mp.RemoteCount() != 0 {
		t.Fatal("invalid states must be ignored")
	}

	mp.ApplyState(map[string]any{"players": []any{
		playerEntry("me", 1, 1, 1),
		playerEntry("a", 10, 0, 0),
		playerEntry("b", 0, 20, 0),
		map[string]any{"id": "bad", "pos": []float64{1}, "rot": []float64{0, 0, 0}},
		map[string]any{"pos": []float64{1, 2, 3}, "rot": []float64{0, 0, 0}},
		nil,
	}})
	if mp.RemoteCount() != 2 || mp.Remote("me") != nil || mp.Remote("bad") != nil {
		t.Fatalf("expected proxies for a and b only, got %d", mp.RemoteCount())
	}
	if a := mp.Remote("a"); a == nil || a.Current.X != 10 || a.Target.X != 10 {
		t.Error("new proxy must spawn at its reported position")
	}
	if meshCount(mp.Scene) != 2 {
		t.Errorf("expected 2 proxy meshes, got %d", meshCount(mp.Scene))
	}

	// Retarget a, drop b.
	mp.ApplyState(map[string]any{"players": []any{playerEntry("a", 50, 0, 0)}})
	if mp.RemoteCount() != 1 || mp.Remote("b") != nil {
		t.Fatal("absent players must be removed")
	}
	a := mp.Remote("a")
	if a.Target.X != 50 || a.Current.X != 10 {
		t.Error("existing proxy must retarget without snapping")
	}
	mp.UpdateAt(0.1, 0)
	if a.Current.X <= 10 || a.Current.X >= 50 {
		t.Error("UpdateAt must ease proxies even when offline")
	}
	if meshCount(mp.Scene) != 1 {
		t.Errorf("expected 1 proxy mesh, got %d", meshCount(mp.Scene))
	}
}

async func TestMultiplayerHostFlow(t *testing.T) {
	mp, fp, cam := newTestMultiplayer()
	cam.Position.Set(1, 2, 3)
	cam.Rotation.Set(10, 20, 30)

	pending := mp.Host()
	if mp.IsConnected() {
		t.Fatal("must not be connected before the peer opens")
	}
	if again := await mp.Host(); again != "" {
		t.Error("Host while a connection is pending must be refused")
	}
	if joined := await mp.Join("x"); joined {
		t.Error("Join while a connection is pending must be refused")
	}
	fp.id = "host-1"
	fp.emit("open", "host-1")
	id := await pending
	if id != "host-1" || !mp.IsConnected() || !mp.IsHost() || mp.MyID() != HostPlayerID {
		t.Fatalf("host setup failed: id=%q", id)
	}
	if again := await mp.Host(); again != "" {
		t.Error("second Host must be refused")
	}

	// A client joins and reports a position.
	conn := newFakeConn("client-a", true)
	fp.emit("connection", conn)
	conn.emit("data", posPacket(100, 0, 0))
	conn.emit("data", map[string]any{"type": systems.NetMsgPosition, "payload": map[string]any{"pos": []float64{1}, "rot": nil}})
	if mp.PeerCount() != 1 {
		t.Fatalf("expected 1 tracked peer, got %d", mp.PeerCount())
	}

	// First tick broadcasts host + client and spawns the client's proxy.
	mp.UpdateAt(0.016, 1000)
	if len(conn.sent) != 1 {
		t.Fatalf("expected 1 broadcast, got %d", len(conn.sent))
	}
	pkt := conn.sent[0]
	players := pkt.payload.players
	if pkt["type"] != systems.NetMsgState || players.length != 2 {
		t.Fatalf("unexpected STATE packet")
	}
	if players[0].id != HostPlayerID || players[0].pos[0] != 1 || players[0].pos[2] != 3 || players[0].rot[1] != 20 {
		t.Error("host entry must carry the camera transform")
	}
	if players[1].id != "client-a" || players[1].pos[0] != 100 || players[1].rot[1] != 90 {
		t.Error("client entry must carry the last reported transform")
	}
	if mp.RemoteCount() != 1 || mp.Remote("client-a") == nil || mp.Remote(HostPlayerID) != nil {
		t.Error("host must render a proxy for the client but not itself")
	}

	// Throttled: no second packet within the interval.
	mp.UpdateAt(0.016, 1010)
	if len(conn.sent) != 1 {
		t.Error("updates must be throttled to NetUpdateIntervalMs")
	}

	// Packet objects are reused between ticks.
	mp.UpdateAt(0.016, 1100)
	if len(conn.sent) != 2 || conn.sent[1] != conn.sent[0] || conn.sent[1].payload != conn.sent[0].payload {
		t.Error("broadcast must reuse the STATE packet")
	}

	// Client leaves: dropped from the packet and its proxy removed.
	conn.emit("close", nil)
	if mp.PeerCount() != 0 {
		t.Fatal("closed client must be untracked")
	}
	mp.UpdateAt(0.016, 1200)
	if conn.sent[0].payload.players.length != 1 || mp.RemoteCount() != 0 || meshCount(mp.Scene) != 0 {
		t.Error("left client must disappear from the state and the scene")
	}

	mp.Disconnect()
	if mp.IsConnected() || mp.IsHost() || mp.MyID() != "" || !fp.destroyed {
		t.Error("Disconnect must reset state and destroy the peer")
	}
	mp.Disconnect() // idempotent
}

async func TestMultiplayerHostFailure(t *testing.T) {
	mp, fp, _ := newTestMultiplayer()
	pending := mp.Host()
	fp.emit("error", "signalling down")
	if id := await pending; id != "" || mp.IsConnected() || !fp.destroyed {
		t.Error("failed host must resolve empty and tear down the peer")
	}
}

async func TestMultiplayerJoinFlow(t *testing.T) {
	mp, fp, cam := newTestMultiplayer()
	cam.Position.Set(5, 6, 7)

	pending := mp.Join("host-1")
	fp.id = "client-x"
	fp.emit("open", "client-x")
	conn := fp.outgoing[0]
	conn.open = true
	conn.emit("open", nil)
	ok := await pending
	if !ok || !mp.IsConnected() || mp.IsHost() || mp.MyID() != "client-x" {
		t.Fatalf("join failed: ok=%v id=%q", ok, mp.MyID())
	}

	mp.UpdateAt(0.016, 1000)
	mp.UpdateAt(0.016, 1001)
	if len(conn.sent) != 1 {
		t.Fatalf("expected 1 throttled POS packet, got %d", len(conn.sent))
	}
	pkt := conn.sent[0]
	if pkt["type"] != systems.NetMsgPosition || pkt.payload.pos[0] != 5 || pkt.payload.pos[2] != 7 {
		t.Error("client must send the camera position")
	}
	cam.Position.Set(8, 6, 7)
	mp.UpdateAt(0.016, 1100)
	if len(conn.sent) != 2 || conn.sent[1].payload != conn.sent[0].payload || pkt.payload.pos[0] != 8 {
		t.Error("client must reuse and refresh the POS payload")
	}

	// Host state: own entry is skipped, host gets a proxy.
	conn.emit("data", map[string]any{"type": systems.NetMsgState, "payload": map[string]any{"players": []any{
		playerEntry(HostPlayerID, 0, 0, 0),
		playerEntry("client-x", 8, 6, 7),
	}}})
	if mp.RemoteCount() != 1 || mp.Remote(HostPlayerID) == nil {
		t.Error("client must render the host proxy only")
	}

	if joined := await mp.Join("other"); joined {
		t.Error("second Join must be refused")
	}

	mp.Disconnect()
	if !conn.closed || !fp.destroyed || mp.RemoteCount() != 0 || meshCount(mp.Scene) != 0 {
		t.Error("Disconnect must close the connection and remove proxies")
	}
}

async func TestMultiplayerJoinFailure(t *testing.T) {
	mp, fp, _ := newTestMultiplayer()
	pending := mp.Join("host-1")
	fp.emit("open", "client-x")
	fp.outgoing[0].emit("error", "refused")
	if ok := await pending; ok || mp.IsConnected() || !fp.destroyed {
		t.Error("failed join must resolve false and tear down the peer")
	}
}

func TestMultiplayerConsoleCommands(t *testing.T) {
	mp, _, _ := newTestMultiplayer()
	mp.NewPeer = func(options any) any { return nil }
	mp.Init()
	c := systems.GlobalConsole
	if got := c.ExecuteCmd("join"); got != "Usage: join <hostId>" {
		t.Errorf("join without id = %q", got)
	}
	if got := c.ExecuteCmd("join abc"); got != "" {
		t.Errorf("join abc = %q", got)
	}
	if got := c.ExecuteCmd("host"); got != "" {
		t.Errorf("host = %q", got)
	}
	if mp.IsConnected() {
		t.Error("commands without PeerJS must leave multiplayer offline")
	}
}
