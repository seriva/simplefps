import { Console, Resources } from "../engine/core/engine.js";
import { NetworkHost } from "../engine/networking/networkhost.js";
import { PhysicsWorld } from "../shared/physicsworld.js";
import { SharedPlayerController } from "../shared/playercontroller.js";

// Tick rate for network updates
const TICK_RATE = 20; // Broadcast 20 times per second
const TICK_INTERVAL = 1000 / TICK_RATE;

export class GameServer {
	constructor() {
		this.physicsWorld = new PhysicsWorld();
		this.networkHost = new NetworkHost(this);

		// Map of peerId -> SharedPlayerController
		this.players = new Map();

		// Accumulator for broadcasting
		this.timeSinceLastBroadcast = 0;

		this.mapData = null;
	}

	startLocal(mapData, hostPosition = null) {
		this.mapData = mapData;

		// Initialize collision for the server world
		this._setupMapCollision(mapData);

		// Add Host Player (Local)
		// Use a fixed ID for local player initially, e.g., 'host-local'
		// When networking starts, we might want to update this ID or keep it?
		// PeerJS ID is only known after networking starts.
		// For simplicity, let's use a placeholder 'host' ID.
		// When PeerJS starts, we can map 'host' -> peerID, or just keep 'host'.
		this.addPlayer("host", hostPosition);

		Console.log("[GameServer] Local Server Started");
		return "host";
	}

	async enableNetworking() {
		if (this.networkHost.hostId) return this.networkHost.hostId;

		const hostId = await this.networkHost.start();
		Console.log(`[GameServer] Networking Enabled. Host ID: ${hostId}`);

		// Return the actual Peer ID
		return hostId;
	}

	stop() {
		this.networkHost.stop();
		this.players.forEach((p) => {
			p.destroy();
		});
		this.players.clear();
		// TODO: Clear physics world bodies
	}

	_setupMapCollision(mapData) {
		if (!mapData || !mapData.chunks) return;

		for (const chunkPath of mapData.chunks) {
			try {
				// We assume Resources are already loaded by the Game Client
				const mesh = Resources.get(chunkPath);
				if (mesh?.vertices && mesh.indices) {
					this.physicsWorld.addTrimesh(mesh.vertices, mesh.indices);
				}
			} catch (e) {
				Console.warn(
					`[GameServer] Failed to add collision for ${chunkPath}: ${e}`,
				);
			}
		}
	}

	addPlayer(id, overridePos = null) {
		// Find a spawn point
		let spawnPos = [0, 10, 0];

		if (overridePos) {
			spawnPos = overridePos;
		} else if (this.mapData?.spawnpoints) {
			const r = Math.floor(Math.random() * this.mapData.spawnpoints.length);
			const sp = this.mapData.spawnpoints[r];
			if (sp.position) spawnPos = [...sp.position];
		}

		const player = new SharedPlayerController(this.physicsWorld, spawnPos);
		this.players.set(id, player);
		Console.log(`[GameServer] Added player ${id} at ${spawnPos}`);
		return player;
	}

	removePlayer(id) {
		const player = this.players.get(id);
		if (player) {
			player.destroy();
			this.players.delete(id);
			Console.log(`[GameServer] Removed player ${id}`);
		}
	}

	handleInput(id, input) {
		const player = this.players.get(id);
		if (player) {
			// Apply input to the player controller
			// The SharedPlayerController needs an 'applyInput' method for this frame
			// We usually process inputs during the Update loop, but for now we can apply them immediately
			// OR store them and apply during the next physics step.

			// Note: SharedPlayerController.update(dt) does damping.
			// SharedPlayerController.applyInput(input, dt) applies acceleration.
			// We need to know 'dt' of the input.
			// The Input packet usually contains 'dt' or we assume server dt.

			// For simplicity: We store the latest input and apply it in the update loop?
			// BETTER: We apply it immediately for this frame-ish.
			// But we need 'dt'. Let's assume input comes with a desire to move for X ms?
			// Actually, usually Client sends "Holding W". Server applies acceleration for the duration of the tick.

			// State: We store the "Current Input" for the player.
			player.currentInput = input;

			// Or if input is "MoveDelta", we apply.
			// But FPSController usually works on "Is Key Down".
			// So 'input' should be: { moveX, moveZ, forwardDir, rightDir }
		}
	}

	// Override update to apply inputs
	update(dt) {
		// Apply inputs before stepping
		this.players.forEach((p, _id) => {
			if (p.currentInput) {
				// We don't have 'dt' from client, so we use server dt?
				// This makes movement dependent on tick rate if not careful.
				// Ideally input is "buttons held" and we simulate for 'dt'.
				p.applyInput(p.currentInput, dt);
				if (p.currentInput.jump) {
					p.jump();
					p.currentInput.jump = false; // Consumer jump
				}
			}
			p.update(dt);
		});

		this.physicsWorld.step(dt);

		this.timeSinceLastBroadcast += dt * 1000;
		if (this.timeSinceLastBroadcast >= TICK_INTERVAL) {
			this.timeSinceLastBroadcast = 0;
			this._broadcastState();
		}
	}

	_broadcastState() {
		const playersState = [];
		this.players.forEach((p, id) => {
			playersState.push({
				id: id,
				pos: p.getPosition(),
				vel: p.getVelocity(),
				// rotation? Player controller body is fixed rotation sphere.
				// Visual rotation (yaw) comes from input usually.
				// We should echo back the yaw/pitch so others can see it.
				rot: p.currentInput ? { yaw: p.currentInput.yaw || 0 } : { yaw: 0 },
			});
		});

		const state = {
			players: playersState,
			time: Date.now(),
		};

		if (this.networkHost.hostId) {
			Console.log(
				`[GameServer] Broadcasting state with ${playersState.length} players`,
			);
			this.networkHost.broadcast(state);
		} else {
			// Console.log("[GameServer] Skipping broadcast (no hostId)");
		}
	}
}
