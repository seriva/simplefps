import { Console } from "../engine/core/engine.js";
import { NetworkClient } from "../engine/networking/networkclient.js";
import { GameServer } from "../server/gameserver.js";
import Game from "./game.js";
import { RemotePlayer } from "./remoteplayer.js";

// Private state
let _server = null;
let _client = null;
const _remotePlayers = new Map(); // id -> RemotePlayer
let _myClientId = null;
let _isHost = false;

// Helpers
const _onInit = (payload) => {
	// payload: { id, pos }
	// Teleport local player to server-assigned spawn point
	Console.log(`[Multiplayer] Received Init. Teleporting to ${payload.pos}`);
	const controller = Game.getController();
	if (controller && payload.pos) {
		controller.body.position.set(
			payload.pos[0],
			payload.pos[1],
			payload.pos[2],
		);
		controller.body.velocity.set(0, 0, 0);
		// Sync visual
		controller.syncCamera(0);
		// Reset "air time" or other physics state if needed
		controller.wasGrounded = true; // prevent fall damage on spawn?
	}
};

const _onStateUpdate = (state, _ts) => {
	// state: { players: [ { id, pos, vel, rot } ], time }

	// Update players
	const activeIds = new Set();

	if (state.players) {
		// Console.log(`[Multiplayer] State players: ${state.players.length}`);
		for (const pState of state.players) {
			// Skip myself (Client Side Prediction handles me)
			if (pState.id === _myClientId) {
				// Console.log(`[Multiplayer] Skipping self: ${pState.id}`);
				continue;
			}

			activeIds.add(pState.id);

			let remote = _remotePlayers.get(pState.id);
			if (!remote) {
				Console.log(
					`[Multiplayer] Creating Remote Player: ${pState.id} at ${pState.pos}`,
				);
				remote = new RemotePlayer(pState.id, pState.pos);
				_remotePlayers.set(pState.id, remote);
			}

			remote.updateState(pState);
		}
	}

	// Remove disconnected players
	for (const [id, player] of _remotePlayers) {
		if (!activeIds.has(id)) {
			player.destroy();
			_remotePlayers.delete(id);
		}
	}
};

// Public API
const Multiplayer = {
	async init(mapName = "demo") {
		if (_server || _client) return; // Already initialized

		Console.log("[Multiplayer] Initializing Local Server...");
		_server = new GameServer();
		_isHost = true;
		_myClientId = "host"; // Default ID for local play

		// Load map data
		const response = await fetch(`resources/arenas/${mapName}/config.arena`);
		const mapData = await response.json();

		// Get current position (if re-initializing?)
		// Usually init is called on game load, so no player yet.
		// But if we support map change, we might need it.
		// For now: Fresh start

		_server.startLocal(mapData);
	},

	async host() {
		if (!_server) {
			Console.error("[Multiplayer] Server not running locally!");
			return;
		}

		Console.log("[Multiplayer] Enabling Networking...");
		const hostId = await _server.enableNetworking();

		Console.log(`[Multiplayer] Host Started! ID: ${hostId}`);
		Console.log(`[Multiplayer] Share this ID to others.`);

		// We are already connected locally as 'host'.
		// Do we need to change our ID to the PeerID?
		// Or can we keep 'host'?
		// The clients will see us with ID 'host' if we broadcast it?
		// Wait, NetworkHost broadcasts state.

		// In GameServer._broadcastState:
		// this.players.forEach((p, id) => { ... })
		// Our ID is 'host'.
		// So clients will see a player with ID 'host'.

		// Clients connect with their PeerID.

		return hostId;
	},

	async join(hostId) {
		if (_client) return;

		if (_server) {
			Console.log("[Multiplayer] Stopping Local Server to Join...");
			_server.stop();
			_server = null;
			_isHost = false;
		}

		Console.log(`[Multiplayer] Joining ${hostId}...`);
		_client = new NetworkClient({
			onStateUpdate: _onStateUpdate,
			onInit: _onInit,
		});

		await _client.connect(hostId);
		_myClientId = _client.peer.id;
		Console.log(`[Multiplayer] Joined! My ID: ${_myClientId}`);
	},

	update(dt) {
		// Update Server
		if (_server) {
			_server.update(dt);
		}

		// Update Remote Players
		_remotePlayers.forEach((p) => {
			p.update(dt);
		});
	},

	sendInput(input) {
		if (_server) {
			// Local Play: Direct Input
			_server.handleInput("host", input);
		} else if (_client) {
			_client.sendInput(input);
		}
	},
};

export default Multiplayer;
