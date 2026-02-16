import { Camera, Console } from "../engine/engine.js";
import { Network } from "../engine/systems/network.js";
import { RemotePlayer } from "./remoteplayer.js";

// ============================================================================
// Private State
// ============================================================================

// Network throttling configuration
const UPDATE_INTERVAL = 1000 / 30; // 30 updates per second
let _lastUpdateTime = 0;

let _network = null; // Unified Network instance
const _remotePlayers = new Map(); // peerId -> RemotePlayer
let _myId = null;
let _isHost = false;

// Track positions from all peers (host only)
const _peerPositions = new Map(); // peerId -> { pos, rot }

// ============================================================================
// State Update Handler (called when receiving positions from network)
// ============================================================================

const _onStateUpdate = (state) => {
	// state: { players: [{ id, pos, rot }] }
	if (!state.players) return;

	const activeIds = new Set();

	for (const player of state.players) {
		// Skip ourselves
		if (player.id === _myId) continue;

		activeIds.add(player.id);

		let remote = _remotePlayers.get(player.id);
		if (!remote) {
			Console.log(`[Multiplayer] New player: ${player.id}`);
			remote = new RemotePlayer(player.id, player.pos);
			_remotePlayers.set(player.id, remote);
		}

		remote.updateState(player);
	}

	// Remove disconnected players
	for (const [id, player] of _remotePlayers) {
		if (!activeIds.has(id)) {
			Console.log(`[Multiplayer] Player left: ${id}`);
			player.destroy();
			_remotePlayers.delete(id);
		}
	}
};

// ============================================================================
// Position callbacks for NetworkHost
// ============================================================================

const _onPeerPosition = (peerId, data) => {
	// Store position from a peer (host only)
	_peerPositions.set(peerId, {
		pos: data.pos,
		rot: data.rot,
	});
};

const _onPeerDisconnect = (peerId) => {
	_peerPositions.delete(peerId);
};

// ============================================================================
// Public API
// ============================================================================

const Multiplayer = {
	host: async () => {
		if (_network) {
			Console.warn("[Multiplayer] Already hosting or connected");
			return null;
		}

		_network = new Network();
		const hostId = await _network.host({
			onPeerPosition: _onPeerPosition,
			onPeerDisconnect: _onPeerDisconnect,
		});

		_myId = "host";
		_isHost = true;

		Console.log(`[Multiplayer] Hosting! Share this ID: ${hostId}`);
		return hostId;
	},

	join: async (hostId) => {
		if (_network) {
			Console.warn("[Multiplayer] Already hosting or connected");
			return;
		}

		_network = new Network();
		await _network.connect(hostId, {
			onStateUpdate: _onStateUpdate,
		});

		_myId = _network.getPeerId();
		_isHost = false;

		Console.log(`[Multiplayer] Joined! My ID: ${_myId}`);
	},

	update: (dt) => {
		// Throttle network updates to reduce bandwidth
		const now = performance.now();
		if (now - _lastUpdateTime >= UPDATE_INTERVAL) {
			_lastUpdateTime = now;

			// Get our current position from the camera
			const myPos = Camera.position;
			const myRot = Camera.rotation;

			if (_isHost && _network) {
				// Host: Collect all positions and broadcast
				const players = [{ id: "host", pos: [...myPos], rot: [...myRot] }];

				// Add all connected peers
				for (const [peerId, data] of _peerPositions) {
					players.push({ id: peerId, pos: data.pos, rot: data.rot });
				}

				// Broadcast combined state to all clients
				_network.broadcast({ players });

				// Also update our own view of remote players
				_onStateUpdate({ players });
			} else if (_network) {
				// Client: Send our position to host
				_network.sendPosition({
					pos: [...myPos],
					rot: [...myRot],
				});
			}
		}

		// Update all remote player visuals (lerping)
		for (const remote of _remotePlayers.values()) {
			remote.update(dt);
		}
	},

	isConnected: () => {
		return _network !== null;
	},

	disconnect: () => {
		if (_network) {
			_network.disconnect();
			_network = null;
		}
		_remotePlayers.forEach((p) => {
			p.destroy();
		});
		_remotePlayers.clear();
		_peerPositions.clear();
		_myId = null;
		_isHost = false;
		_lastUpdateTime = 0;
		Console.log("[Multiplayer] Disconnected");
	},
};

// Console commands
Console.registerCmd("host", () => Multiplayer.host());
Console.registerCmd("join", (id) => {
	if (!id) {
		Console.log("Usage: join <hostId>");
		return;
	}
	Multiplayer.join(id);
});

export default Multiplayer;
