package systems

import (
	"js:../../dependencies/peerjs.d.ts"
	"js:./interop.d.ts"
)

// Network message types carried in the PeerJS payload's "type" field.
const (
	NetMsgPosition = "POS"   // client -> host: own position
	NetMsgState    = "STATE" // host -> clients: all positions
)

// Network roles.
const (
	NetRoleNone = iota
	NetRoleHost
	NetRoleClient
)

// NetConnectTimeoutMs bounds how long a client waits for the host connection.
const NetConnectTimeoutMs = 10000

// PeerFactory constructs a PeerJS Peer from an options object. Injectable so
// tests can supply a fake transport; nil falls back to DefaultPeerFactory.
type PeerFactory func(options any) any

// DefaultPeerFactory instantiates window.Peer (exposed by the vendor bundle),
// or returns nil when PeerJS is not loaded.
func DefaultPeerFactory(options any) any {
	ctor := globalThis.Peer
	if ctor == nil {
		return nil
	}
	return Reflect.construct(ctor, []any{nil, options})
}

// newPeerOptions builds the Peer constructor options with the STUN servers.
func newPeerOptions() any {
	return map[string]any{
		"config": map[string]any{
			"iceServers": []any{
				map[string]any{"urls": "stun:stun.l.google.com:19302"},
				map[string]any{"urls": "stun:stun1.l.google.com:19302"},
			},
		},
	}
}

// deferred pairs a pending Promise with its resolve function.
type deferred struct {
	promise any
	resolve any
}

func newDeferred() *deferred {
	d := &deferred{}
	d.promise = Reflect.construct(Promise, []any{func(res any, rej any) {
		d.resolve = res
	}})
	return d
}

// Network is the PeerJS wrapper for both the host and client roles. The host
// keeps one DataConnection per client and relays state; a client holds a
// single connection to the host.
type Network struct {
	Role int

	// OnStateUpdate receives the host's STATE payload (client role).
	OnStateUpdate func(state any)
	// OnPeerPosition receives a client's POS payload (host role).
	OnPeerPosition func(peerID string, data any)
	// OnPeerDisconnect fires when a client connection closes (host role).
	OnPeerDisconnect func(peerID string)

	// NewPeer overrides the Peer constructor (tests); nil uses DefaultPeerFactory.
	NewPeer PeerFactory

	peer           PeerClient
	hostConnection PeerDataConnection
	clients        []PeerDataConnection
	clientCount    int
	connectTimer   any

	// Reused outgoing packets.
	statePacket map[string]any
	posPacket   map[string]any
}

// NewNetwork creates an idle Network.
func NewNetwork() *Network {
	return &Network{
		Role:        NetRoleNone,
		clients:     make([]PeerDataConnection, 8),
		statePacket: map[string]any{"type": NetMsgState, "payload": nil},
		posPacket:   map[string]any{"type": NetMsgPosition, "payload": nil},
	}
}

func (n *Network) createPeer() PeerClient {
	factory := n.NewPeer
	if factory == nil {
		factory = DefaultPeerFactory
	}
	return factory(newPeerOptions())
}

// Host opens a Peer and resolves to its id once the signalling server
// assigns one, or "" when the peer fails to open.
async func (n *Network) Host() string {
	if n.peer != nil {
		GlobalConsole.Warn("[Network] Already connected")
		return ""
	}
	peer := n.createPeer()
	if peer == nil {
		GlobalConsole.Error("[Network] PeerJS is not available")
		return ""
	}
	n.Role = NetRoleHost
	n.peer = peer

	d := newDeferred()
	peer.on("open", func(id string) {
		GlobalConsole.Log("[Network] Hosting. ID: " + id)
		d.resolve(id)
	})
	peer.on("connection", func(conn PeerDataConnection) {
		n.handleClientConnection(conn)
	})
	peer.on("error", func(err any) {
		GlobalConsole.Error("[Network] Error: " + String(err))
		d.resolve("")
	})
	id := await d.promise
	return id
}

// Connect opens a Peer and connects it to hostID; resolves to true once the
// data channel is open, false on error or after NetConnectTimeoutMs.
async func (n *Network) Connect(hostID string) bool {
	if n.peer != nil {
		GlobalConsole.Warn("[Network] Already connected")
		return false
	}
	peer := n.createPeer()
	if peer == nil {
		GlobalConsole.Error("[Network] PeerJS is not available")
		return false
	}
	n.Role = NetRoleClient
	n.peer = peer

	d := newDeferred()
	settled := false
	finish := func(ok bool) {
		if settled {
			return
		}
		settled = true
		n.clearConnectTimer()
		d.resolve(ok)
	}
	peer.on("open", func(id string) {
		GlobalConsole.Log("[Network] My ID: " + id)
		n.connectToHost(hostID, finish)
	})
	peer.on("error", func(err any) {
		GlobalConsole.Error("[Network] Error: " + String(err))
		finish(false)
	})
	ok := await d.promise
	return ok
}

func (n *Network) handleClientConnection(conn PeerDataConnection) {
	GlobalConsole.Log("[Network] Player connected: " + conn.peer)

	if conn.open {
		n.addClient(conn)
	} else {
		conn.on("open", func() { n.addClient(conn) })
	}

	conn.on("data", func(data any) {
		if data == nil || data["type"] != NetMsgPosition {
			return
		}
		if n.OnPeerPosition != nil {
			n.OnPeerPosition(conn.peer, data.payload)
		}
	})
	conn.on("close", func() {
		GlobalConsole.Log("[Network] Player disconnected: " + conn.peer)
		n.removeClient(conn)
		if n.OnPeerDisconnect != nil {
			n.OnPeerDisconnect(conn.peer)
		}
	})
	conn.on("error", func(err any) {
		GlobalConsole.Error("[Network] Connection error: " + String(err))
	})
}

func (n *Network) addClient(conn PeerDataConnection) {
	for i := 0; i < n.clientCount; i++ {
		if n.clients[i] == conn {
			return
		}
	}
	if n.clientCount < len(n.clients) {
		n.clients[n.clientCount] = conn
	} else {
		n.clients = append(n.clients, conn)
	}
	n.clientCount++
	GlobalConsole.Log("[Network] Player ready: " + conn.peer)
}

func (n *Network) removeClient(conn PeerDataConnection) {
	for i := 0; i < n.clientCount; i++ {
		if n.clients[i] == conn {
			n.clientCount--
			n.clients[i] = n.clients[n.clientCount]
			n.clients[n.clientCount] = nil
			return
		}
	}
}

func (n *Network) clearConnectTimer() {
	if n.connectTimer != nil {
		clearTimeout(n.connectTimer)
		n.connectTimer = nil
	}
}

func (n *Network) connectToHost(hostID string, finish func(ok bool)) {
	n.connectTimer = setTimeout(func() {
		n.connectTimer = nil
		GlobalConsole.Error("[Network] Connection timed out")
		finish(false)
	}, NetConnectTimeoutMs)

	GlobalConsole.Log("[Network] Connecting to: " + hostID)
	conn := n.peer.connect(hostID, map[string]any{"reliable": true})
	n.hostConnection = conn

	conn.on("open", func() {
		GlobalConsole.Log("[Network] Connected!")
		finish(true)
	})
	conn.on("data", func(data any) {
		if data == nil || data["type"] != NetMsgState {
			return
		}
		if n.OnStateUpdate != nil {
			n.OnStateUpdate(data.payload)
		}
	})
	conn.on("close", func() {
		GlobalConsole.Log("[Network] Disconnected")
	})
	conn.on("error", func(err any) {
		GlobalConsole.Error("[Network] Error: " + String(err))
		finish(false)
	})
}

// Broadcast sends a STATE packet to every open client connection (host only).
func (n *Network) Broadcast(state any) {
	if n.Role != NetRoleHost {
		return
	}
	n.statePacket["payload"] = state
	for i := 0; i < n.clientCount; i++ {
		conn := n.clients[i]
		if conn.open {
			conn.send(n.statePacket)
		}
	}
}

// SendPosition sends a POS packet to the host (client only).
func (n *Network) SendPosition(posData any) {
	if n.Role != NetRoleClient || n.hostConnection == nil || !n.hostConnection.open {
		return
	}
	n.posPacket["payload"] = posData
	n.hostConnection.send(n.posPacket)
}

// Disconnect closes the host connection, destroys the peer and resets state.
func (n *Network) Disconnect() {
	n.clearConnectTimer()
	if n.hostConnection != nil {
		n.hostConnection.close()
		n.hostConnection = nil
	}
	if n.peer != nil {
		n.peer.destroy()
		n.peer = nil
	}
	for i := 0; i < n.clientCount; i++ {
		n.clients[i] = nil
	}
	n.clientCount = 0
	n.Role = NetRoleNone
}

// PeerID returns the local peer id, or "" when not connected.
func (n *Network) PeerID() string {
	if n.peer == nil {
		return ""
	}
	return n.peer.id
}

// IsConnected reports whether a Peer exists (hosting or joined).
func (n *Network) IsConnected() bool {
	return n.peer != nil
}

// ClientCount returns the number of ready client connections (host only).
func (n *Network) ClientCount() int {
	return n.clientCount
}
