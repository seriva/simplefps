import { Peer } from "../../dependencies/peerjs.js";
import { Console } from "../core/engine.js";

// Message types
export const NETWORK_MESSAGES = {
	POSITION: "POS", // Client sends their position
	STATE: "STATE", // Host broadcasts all positions
};

export class NetworkHost {
	constructor(options = {}) {
		this.onPeerPosition = options.onPeerPosition || (() => {});
		this.onPeerDisconnect = options.onPeerDisconnect || (() => {});

		this.peer = null;
		this.connections = new Map(); // peerId -> DataConnection
		this.hostId = null;
	}

	async start() {
		return new Promise((resolve, reject) => {
			const iceConfig = {
				iceServers: [
					{ urls: "stun:stun.l.google.com:19302" },
					{ urls: "stun:stun1.l.google.com:19302" },
				],
			};

			this.peer = new Peer(undefined, { config: iceConfig });

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
				reject(err);
			});
		});
	}

	_handleConnection(conn) {
		Console.log(`[NetworkHost] Player connected: ${conn.peer}`);

		const setupPeer = () => {
			this.connections.set(conn.peer, conn);
			Console.log(`[NetworkHost] Player ready: ${conn.peer}`);
		};

		if (conn.open) {
			setupPeer();
		} else {
			conn.on("open", setupPeer);
		}

		conn.on("data", (data) => {
			if (data.type === NETWORK_MESSAGES.POSITION) {
				this.onPeerPosition(conn.peer, data.payload);
			}
		});

		conn.on("close", () => {
			Console.log(`[NetworkHost] Player disconnected: ${conn.peer}`);
			this.connections.delete(conn.peer);
			this.onPeerDisconnect(conn.peer);
		});

		conn.on("error", (err) => {
			Console.error(`[NetworkHost] Connection error: ${err}`);
		});
	}

	broadcast(state) {
		const packet = {
			type: NETWORK_MESSAGES.STATE,
			payload: state,
		};

		for (const conn of this.connections.values()) {
			if (conn.open) {
				conn.send(packet);
			}
		}
	}

	stop() {
		if (this.peer) {
			this.peer.destroy();
			this.peer = null;
		}
		this.connections.clear();
		this.hostId = null;
	}
}
