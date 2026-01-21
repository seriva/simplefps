import { Camera, Console } from "../engine/core/engine.js";
import { NetworkClient } from "../engine/networking/networkclient.js";
import { NetworkHost } from "../engine/networking/networkhost.js";
import { RemotePlayer } from "./remoteplayer.js";

// ============================================================================
// Private State
// ============================================================================

let _host = null; // NetworkHost (if hosting)
let _client = null; // NetworkClient (if joined)
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
		if (_host || _client) {
			Console.warn("[Multiplayer] Already hosting or connected");
			return null;
		}

		_host = new NetworkHost({
			onPeerPosition: _onPeerPosition,
			onPeerDisconnect: _onPeerDisconnect,
		});

		const hostId = await _host.start();
		_myId = "host";
		_isHost = true;

		Console.log(`[Multiplayer] Hosting! Share this ID: ${hostId}`);
		return hostId;
	},

	join: async (hostId) => {
		if (_host || _client) {
			Console.warn("[Multiplayer] Already hosting or connected");
			return;
		}

		_client = new NetworkClient({
			onStateUpdate: _onStateUpdate,
		});

		await _client.connect(hostId);
		_myId = _client.peer.id;
		_isHost = false;

		Console.log(`[Multiplayer] Joined! My ID: ${_myId}`);
	},

	update: (dt) => {
		// Get our current position from the camera
		const myPos = Camera.position;
		const myRot = Camera.rotation;

		if (_isHost && _host) {
			// Host: Collect all positions and broadcast
			const players = [{ id: "host", pos: [...myPos], rot: [...myRot] }];

			// Add all connected peers
			for (const [peerId, data] of _peerPositions) {
				players.push({ id: peerId, pos: data.pos, rot: data.rot });
			}

			// Broadcast combined state to all clients
			_host.broadcast({ players });

			// Also update our own view of remote players
			_onStateUpdate({ players });
		} else if (_client) {
			// Client: Send our position to host
			_client.sendPosition({
				pos: [...myPos],
				rot: [...myRot],
			});
		}

		// Update all remote player visuals (lerping)
		for (const remote of _remotePlayers.values()) {
			remote.update(dt);
		}
	},

	isConnected: () => {
		return _isHost || _client !== null;
	},

	disconnect: () => {
		if (_host) {
			_host.stop();
			_host = null;
		}
		if (_client) {
			_client.disconnect();
			_client = null;
		}
		_remotePlayers.forEach((p) => {
			p.destroy();
		});
		_remotePlayers.clear();
		_peerPositions.clear();
		_myId = null;
		_isHost = false;
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
