import { Camera, Console, Network } from "../engine/engine.js";
import { copyVec3, isVec3 } from "./netvalidation.js";
import { RemotePlayer } from "./remoteplayer.js";

// ============================================================================
// Private State
// ============================================================================

// Network throttling configuration
const _UPDATE_INTERVAL = 1000 / 30; // 30 updates per second
let _lastUpdateTime = 0;

let _network = null; // Unified Network instance
const _remotePlayers = new Map(); // peerId -> RemotePlayer
let _myId = null;
let _isHost = false;

// Track positions from all peers (host only)
const _peerPositions = new Map(); // peerId -> { pos, rot }

const _hostStatePacket = { players: [] };
const _hostSelfPlayer = {
	id: "host",
	pos: [0, 0, 0],
	rot: [0, 0, 0],
};
const _hostPeerPlayers = new Map();
const _clientPositionPacket = {
	pos: [0, 0, 0],
	rot: [0, 0, 0],
};

const _resetConnectionState = () => {
	_network = null;
	_remotePlayers.forEach((p) => {
		p.destroy();
	});
	_remotePlayers.clear();
	_peerPositions.clear();
	_hostPeerPlayers.clear();
	_myId = null;
	_isHost = false;
	_lastUpdateTime = 0;
};

// ============================================================================
// State Update Handler (called when receiving positions from network)
// ============================================================================

const _onStateUpdate = (state) => {
	// state: { players: [{ id, pos, rot }] }
	if (!state || !Array.isArray(state.players)) return;

	const activeIds = new Set();

	for (const player of state.players) {
		if (!player || !isVec3(player.pos) || !isVec3(player.rot)) continue;

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
	if (!data || !isVec3(data.pos) || !isVec3(data.rot)) return;

	// Store position from a peer (host only)
	let peerState = _peerPositions.get(peerId);
	if (!peerState) {
		peerState = {
			pos: [0, 0, 0],
			rot: [0, 0, 0],
		};
		_peerPositions.set(peerId, peerState);
	}

	copyVec3(peerState.pos, data.pos);
	copyVec3(peerState.rot, data.rot);
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

		const network = new Network();

		try {
			const hostId = await network.host({
				onPeerPosition: _onPeerPosition,
				onPeerDisconnect: _onPeerDisconnect,
			});

			_network = network;
			_myId = "host";
			_isHost = true;

			Console.log(`[Multiplayer] Hosting! Share this ID: ${hostId}`);
			return hostId;
		} catch (error) {
			network.disconnect();
			_resetConnectionState();
			throw error;
		}
	},

	join: async (hostId) => {
		if (_network) {
			Console.warn("[Multiplayer] Already hosting or connected");
			return;
		}

		const network = new Network();

		try {
			await network.connect(hostId, {
				onStateUpdate: _onStateUpdate,
			});

			_network = network;
			_myId = network.getPeerId();
			_isHost = false;

			Console.log(`[Multiplayer] Joined! My ID: ${_myId}`);
		} catch (error) {
			network.disconnect();
			_resetConnectionState();
			throw error;
		}
	},

	update: (dt) => {
		// Throttle network updates to reduce bandwidth
		const now = performance.now();
		if (now - _lastUpdateTime >= _UPDATE_INTERVAL) {
			_lastUpdateTime = now;

			// Get our current position from the camera
			const myPos = Camera.position;
			const myRot = Camera.rotation;

			if (_isHost && _network) {
				// Host: Collect all positions and broadcast (reusing packet objects)
				const players = _hostStatePacket.players;
				players.length = 0;

				copyVec3(_hostSelfPlayer.pos, myPos);
				copyVec3(_hostSelfPlayer.rot, myRot);
				players.push(_hostSelfPlayer);

				// Add all connected peers
				for (const [peerId, data] of _peerPositions) {
					if (!isVec3(data.pos) || !isVec3(data.rot)) continue;

					let packetPlayer = _hostPeerPlayers.get(peerId);
					if (!packetPlayer) {
						packetPlayer = {
							id: peerId,
							pos: [0, 0, 0],
							rot: [0, 0, 0],
						};
						_hostPeerPlayers.set(peerId, packetPlayer);
					}

					copyVec3(packetPlayer.pos, data.pos);
					copyVec3(packetPlayer.rot, data.rot);
					players.push(packetPlayer);
				}

				// Broadcast combined state to all clients
				_network.broadcast(_hostStatePacket);

				// Also update our own view of remote players
				_onStateUpdate(_hostStatePacket);
			} else if (_network) {
				// Client: Send our position to host
				copyVec3(_clientPositionPacket.pos, myPos);
				copyVec3(_clientPositionPacket.rot, myRot);
				_network.sendPosition(_clientPositionPacket);
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
			_resetConnectionState();
			Console.log("[Multiplayer] Disconnected");
		}
	},

	init() {
		Console.registerCmd("host", () => Multiplayer.host());
		Console.registerCmd("join", (id) => {
			if (!id) {
				Console.log("Usage: join <hostId>");
				return;
			}
			Multiplayer.join(id);
		});
	},
};

export { Multiplayer };
