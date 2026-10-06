package game

import (
	"../engine/mathx"
	"../engine/scene"
	"../engine/systems"
	"js:./interop.d.ts"
)

// peerState is the host's record of one client's last reported transform.
// packet aliases pos/rot so the broadcast reuses the same objects every tick.
type peerState struct {
	id     string
	pos    []float64
	rot    []float64
	packet map[string]any
}

func newPeerState(id string) *peerState {
	ps := &peerState{id: id, pos: []float64{0, 0, 0}, rot: []float64{0, 0, 0}}
	ps.packet = map[string]any{"id": id, "pos": ps.pos, "rot": ps.rot}
	return ps
}

// Multiplayer orchestrates hosting/joining, the 30 Hz position exchange and
// the RemotePlayer proxies (multiplayer.js). The host relays every client's
// position to all clients and renders proxies for them like any client.
type Multiplayer struct {
	Scene  *scene.Scene
	Camera *systems.Camera

	// NewPeer overrides the PeerJS constructor (tests); nil uses the vendor global.
	NewPeer systems.PeerFactory

	network    *systems.Network
	connecting bool
	myID       string
	isHost     bool
	lastUpdate float64

	remotes     []*RemotePlayer
	remoteCount int
	stateStamp  int

	// Host-only: per-client positions and the reused STATE packet.
	peers      []*peerState
	peerCount  int
	hostSelf   *peerState
	hostPacket map[string]any
	players    any // JS array inside hostPacket, reset in place each tick

	// Client-only: reused POS packet.
	clientSelf *peerState

	scratch mathx.Vec3
}

// NewMultiplayer creates an idle orchestrator for the given scene and camera.
func NewMultiplayer(s *scene.Scene, camera *systems.Camera) *Multiplayer {
	mp := &Multiplayer{
		Scene:      s,
		Camera:     camera,
		remotes:    make([]*RemotePlayer, 8),
		peers:      make([]*peerState, 8),
		hostSelf:   newPeerState(HostPlayerID),
		clientSelf: newPeerState(""),
		players:    []any{},
	}
	mp.hostPacket = map[string]any{"players": mp.players}
	return mp
}

// Init registers the host/join console commands.
func (mp *Multiplayer) Init() {
	c := systems.GlobalConsole
	c.RegisterCmd("host", func(args []string) string {
		mp.Host()
		return ""
	})
	c.RegisterCmd("join", func(args []string) string {
		if len(args) == 0 || args[0] == "" {
			return "Usage: join <hostId>"
		}
		mp.Join(args[0])
		return ""
	})
}

// IsConnected reports whether we are hosting or joined.
func (mp *Multiplayer) IsConnected() bool {
	return mp.network != nil
}

// IsHost reports whether this instance is the relay host.
func (mp *Multiplayer) IsHost() bool {
	return mp.isHost
}

// MyID returns our id as it appears in STATE packets ("" when offline).
func (mp *Multiplayer) MyID() string {
	return mp.myID
}

// RemoteCount returns the number of live remote proxies.
func (mp *Multiplayer) RemoteCount() int {
	return mp.remoteCount
}

// Remote returns the proxy for id, or nil.
func (mp *Multiplayer) Remote(id string) *RemotePlayer {
	for i := 0; i < mp.remoteCount; i++ {
		if mp.remotes[i].ID == id {
			return mp.remotes[i]
		}
	}
	return nil
}

func (mp *Multiplayer) newNetwork() *systems.Network {
	net := systems.NewNetwork()
	net.NewPeer = mp.NewPeer
	net.OnStateUpdate = func(state any) { mp.ApplyState(state) }
	net.OnPeerPosition = func(peerID string, data any) { mp.OnPeerPosition(peerID, data) }
	net.OnPeerDisconnect = func(peerID string) { mp.OnPeerDisconnect(peerID) }
	return net
}

// Host starts hosting and resolves to the shareable host id ("" on failure).
async func (mp *Multiplayer) Host() string {
	if mp.network != nil || mp.connecting {
		systems.GlobalConsole.Warn("[Multiplayer] Already hosting or connected")
		return ""
	}
	net := mp.newNetwork()
	mp.connecting = true
	hostID := await net.Host()
	mp.connecting = false
	if hostID == "" {
		net.Disconnect()
		return ""
	}
	mp.network = net
	mp.myID = HostPlayerID
	mp.isHost = true
	systems.GlobalConsole.Log("[Multiplayer] Hosting! Share this ID: " + hostID)
	return hostID
}

// Join connects to hostID and resolves to true once the channel is open.
async func (mp *Multiplayer) Join(hostID string) bool {
	if mp.network != nil || mp.connecting {
		systems.GlobalConsole.Warn("[Multiplayer] Already hosting or connected")
		return false
	}
	net := mp.newNetwork()
	mp.connecting = true
	ok := await net.Connect(hostID)
	mp.connecting = false
	if !ok {
		net.Disconnect()
		return false
	}
	mp.network = net
	mp.myID = net.PeerID()
	mp.isHost = false
	systems.GlobalConsole.Log("[Multiplayer] Joined! My ID: " + mp.myID)
	return true
}

// Disconnect leaves the session and removes every remote proxy.
func (mp *Multiplayer) Disconnect() {
	if mp.network == nil {
		return
	}
	mp.network.Disconnect()
	mp.reset()
	systems.GlobalConsole.Log("[Multiplayer] Disconnected")
}

func (mp *Multiplayer) reset() {
	mp.network = nil
	for i := 0; i < mp.remoteCount; i++ {
		mp.remotes[i].Destroy()
		mp.remotes[i] = nil
	}
	mp.remoteCount = 0
	for i := 0; i < mp.peerCount; i++ {
		mp.peers[i] = nil
	}
	mp.peerCount = 0
	mp.myID = ""
	mp.isHost = false
	mp.lastUpdate = 0
}

// Update exchanges positions at NetUpdateIntervalMs and eases the proxies;
// dt is in seconds. Runs every frame, including while paused.
func (mp *Multiplayer) Update(dt float32) {
	mp.UpdateAt(dt, performance.now())
}

// UpdateAt is Update with an explicit clock (ms) for deterministic tests.
func (mp *Multiplayer) UpdateAt(dt float32, nowMs float64) {
	if mp.network != nil && nowMs-mp.lastUpdate >= NetUpdateIntervalMs {
		mp.lastUpdate = nowMs
		if mp.isHost {
			mp.broadcastState()
		} else {
			mp.sendPosition()
		}
	}
	for i := 0; i < mp.remoteCount; i++ {
		mp.remotes[i].Update(dt)
	}
}

func (mp *Multiplayer) broadcastState() {
	if mp.Camera != nil {
		Vec3ToArray(mp.hostSelf.pos, &mp.Camera.Position)
		Vec3ToArray(mp.hostSelf.rot, &mp.Camera.Rotation)
	}
	players := mp.players
	players.length = 0
	players.push(mp.hostSelf.packet)
	for i := 0; i < mp.peerCount; i++ {
		players.push(mp.peers[i].packet)
	}
	mp.network.Broadcast(mp.hostPacket)
	// The host renders proxies from the same packet it just sent.
	mp.ApplyState(mp.hostPacket)
}

func (mp *Multiplayer) sendPosition() {
	if mp.Camera != nil {
		Vec3ToArray(mp.clientSelf.pos, &mp.Camera.Position)
		Vec3ToArray(mp.clientSelf.rot, &mp.Camera.Rotation)
	}
	mp.network.SendPosition(mp.clientSelf.packet)
}

// ApplyState consumes a STATE payload ({ players: [{ id, pos, rot }] }):
// spawns proxies for new ids, retargets known ones and removes absent ones.
func (mp *Multiplayer) ApplyState(state any) {
	if state == nil {
		return
	}
	players := state.players
	if players == nil || Array.isArray(players) != true {
		return
	}
	mp.stateStamp++
	count := players.length.(int)
	for i := 0; i < count; i++ {
		p := players[i]
		if p == nil || p.id == nil || !IsVec3(p.pos) || !IsVec3(p.rot) {
			continue
		}
		if p.id == mp.myID {
			continue
		}
		var id string = String(p.id)
		remote := mp.Remote(id)
		if remote == nil {
			systems.GlobalConsole.Log("[Multiplayer] New player: " + id)
			Vec3FromAny(&mp.scratch, p.pos)
			remote = NewRemotePlayer(mp.Scene, id, &mp.scratch)
			mp.addRemote(remote)
		}
		Vec3FromAny(&remote.Target, p.pos)
		remote.stamp = mp.stateStamp
	}
	for i := mp.remoteCount - 1; i >= 0; i-- {
		if mp.remotes[i].stamp != mp.stateStamp {
			systems.GlobalConsole.Log("[Multiplayer] Player left: " + mp.remotes[i].ID)
			mp.remotes[i].Destroy()
			mp.removeRemoteAt(i)
		}
	}
}

func (mp *Multiplayer) addRemote(rp *RemotePlayer) {
	if mp.remoteCount < len(mp.remotes) {
		mp.remotes[mp.remoteCount] = rp
	} else {
		mp.remotes = append(mp.remotes, rp)
	}
	mp.remoteCount++
}

func (mp *Multiplayer) removeRemoteAt(i int) {
	mp.remoteCount--
	mp.remotes[i] = mp.remotes[mp.remoteCount]
	mp.remotes[mp.remoteCount] = nil
}

// OnPeerPosition stores a client's POS payload ({ pos, rot }) for the next
// broadcast (host only).
func (mp *Multiplayer) OnPeerPosition(peerID string, data any) {
	if data == nil || !IsVec3(data.pos) || !IsVec3(data.rot) {
		return
	}
	ps := mp.peer(peerID)
	if ps == nil {
		ps = newPeerState(peerID)
		if mp.peerCount < len(mp.peers) {
			mp.peers[mp.peerCount] = ps
		} else {
			mp.peers = append(mp.peers, ps)
		}
		mp.peerCount++
	}
	for k := 0; k < 3; k++ {
		ps.pos[k] = data.pos[k].(float64)
		ps.rot[k] = data.rot[k].(float64)
	}
}

// OnPeerDisconnect forgets a client's position (host only).
func (mp *Multiplayer) OnPeerDisconnect(peerID string) {
	for i := 0; i < mp.peerCount; i++ {
		if mp.peers[i].id == peerID {
			mp.peerCount--
			mp.peers[i] = mp.peers[mp.peerCount]
			mp.peers[mp.peerCount] = nil
			return
		}
	}
}

func (mp *Multiplayer) peer(id string) *peerState {
	for i := 0; i < mp.peerCount; i++ {
		if mp.peers[i].id == id {
			return mp.peers[i]
		}
	}
	return nil
}

// PeerCount returns the number of clients whose position the host tracks.
func (mp *Multiplayer) PeerCount() int {
	return mp.peerCount
}
