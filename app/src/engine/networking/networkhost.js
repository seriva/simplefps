import { Peer } from "../../dependencies/peerjs.js";
import { Console } from "../core/engine.js";

// Message Types
export const NETWORK_MESSAGES = {
	INPUT: "INPUT",
	STATE: "STATE",
	JOIN: "JOIN", // Optional explicit join
	INIT: "INIT", // Initial state sent to new player
};

export class NetworkHost {
	constructor(gameServer) {
		this.gameServer = gameServer;
		this.peer = null;
		this.connections = new Map(); // peerId -> DataConnection
		this.hostId = null;
	}

	async start() {
		return new Promise((resolve, reject) => {
			// ICE server configuration for better connectivity
			const iceConfig = {
				iceServers: [
					{ urls: "stun:stun.l.google.com:19302" },
					{ urls: "stun:stun1.l.google.com:19302" },
				],
			};

			this.peer = new Peer(undefined, { config: iceConfig, debug: 2 });

			this.peer.on("open", (id) => {
				Console.log(`[NetworkHost] Started. ID: ${id}`);
				this.hostId = id;
				resolve(id);
			});

			this.peer.on("connection", (conn) => {
				this._handleConnection(conn);
			});

			this.peer.on("error", (err) => {
				Console.error(`[NetworkHost] Error: ${err}`);
			});
		});
	}

	_handleConnection(conn) {
		Console.log(`[NetworkHost] Player connected: ${conn.peer}`);

		const setupPlayer = () => {
			Console.log(`[NetworkHost] Setting up player for: ${conn.peer}`);
			this.connections.set(conn.peer, conn);
			const player = this.gameServer.addPlayer(conn.peer);

			// Send initial configuration (Spawn Point)
			if (player) {
				const pos = player.getPosition();
				Console.log(`[NetworkHost] Sending INIT to ${conn.peer} at ${pos}`);
				conn.send({
					type: NETWORK_MESSAGES.INIT,
					payload: {
						id: conn.peer,
						pos: pos,
					},
				});
			}
		};

		// PeerJS quirk: connection might already be open
		if (conn.open) {
			setupPlayer();
		} else {
			conn.on("open", setupPlayer);
		}

		conn.on("data", (data) => {
			this._handleData(conn.peer, data);
		});

		conn.on("close", () => {
			Console.log(`[NetworkHost] Player disconnected: ${conn.peer}`);
			this.connections.delete(conn.peer);
			this.gameServer.removePlayer(conn.peer);
		});

		conn.on("error", (err) => {
			Console.error(`[NetworkHost] Connection error with ${conn.peer}: ${err}`);
		});
	}

	_handleData(peerId, data) {
		if (data.type === NETWORK_MESSAGES.INPUT) {
			this.gameServer.handleInput(peerId, data.payload);
		}
	}

	broadcast(state) {
		// Serialize state if needed, or send object directly (PeerJS handles JSON)
		const packet = {
			type: NETWORK_MESSAGES.STATE,
			payload: state,
			ts: Date.now(),
		};

		let sentCount = 0;
		for (const conn of this.connections.values()) {
			if (conn.open) {
				conn.send(packet);
				sentCount++;
			}
		}
		// if (sentCount > 0) Console.log(`[NetworkHost] Broadcasted to ${sentCount} clients`);
		if (sentCount > 0)
			Console.log(`[NetworkHost] Broadcasted to ${sentCount} clients`);
	}

	stop() {
		if (this.peer) {
			this.peer.destroy();
			this.peer = null;
		}
		this.connections.clear();
	}
}
