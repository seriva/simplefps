import { Peer } from "../../dependencies/peerjs.js";
import { Console } from "../engine.js";

// Shared ICE configuration for STUN servers
const ICE_CONFIG = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
	],
};

// Message types
export const NETWORK_MESSAGES = {
	POSITION: "POS", // Client sends their position
	STATE: "STATE", // Host broadcasts all positions
};

export class Network {
	constructor() {
		this.peer = null;
		this.role = null; // 'host' or 'client'
		this.hostConnection = null; // Client's connection to host
		this.clientConnections = new Map(); // Host's connections to clients (peerId -> DataConnection)

		// Callbacks
		this.onStateUpdate = null;
		this.onPeerPosition = null;
		this.onPeerDisconnect = null;
	}

	// Start as host
	async host(callbacks = {}) {
		if (this.peer) {
			Console.warn("[Network] Already connected");
			return null;
		}

		this.onPeerPosition = callbacks.onPeerPosition || (() => {});
		this.onPeerDisconnect = callbacks.onPeerDisconnect || (() => {});
		this.role = "host";

		return new Promise((resolve, reject) => {
			this.peer = new Peer(undefined, { config: ICE_CONFIG });

			this.peer.on("open", (id) => {
				Console.log(`[Network] Hosting. ID: ${id}`);
				resolve(id);
			});

			this.peer.on("connection", (conn) => {
				this._handleClientConnection(conn);
			});

			this.peer.on("error", (err) => {
				Console.error(`[Network] Error: ${err}`);
				reject(err);
			});
		});
	}

	// Connect as client
	async connect(hostId, callbacks = {}) {
		if (this.peer) {
			Console.warn("[Network] Already connected");
			return;
		}

		this.onStateUpdate = callbacks.onStateUpdate || (() => {});
		this.role = "client";

		return new Promise((resolve, reject) => {
			this.peer = new Peer(undefined, { config: ICE_CONFIG });

			this.peer.on("open", (id) => {
				Console.log(`[Network] My ID: ${id}`);
				this._connectToHost(hostId, resolve, reject);
			});

			this.peer.on("error", (err) => {
				Console.error(`[Network] Error: ${err}`);
				reject(err);
			});
		});
	}

	_handleClientConnection(conn) {
		Console.log(`[Network] Player connected: ${conn.peer}`);

		const setupPeer = () => {
			this.clientConnections.set(conn.peer, conn);
			Console.log(`[Network] Player ready: ${conn.peer}`);
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
			Console.log(`[Network] Player disconnected: ${conn.peer}`);
			this.clientConnections.delete(conn.peer);
			this.onPeerDisconnect(conn.peer);
		});

		conn.on("error", (err) => {
			Console.error(`[Network] Connection error: ${err}`);
		});
	}

	_connectToHost(hostId, resolve, reject) {
		Console.log(`[Network] Connecting to: ${hostId}`);
		this.hostConnection = this.peer.connect(hostId, { reliable: true });

		this.hostConnection.on("open", () => {
			Console.log(`[Network] Connected!`);
			resolve();
		});

		this.hostConnection.on("data", (data) => {
			if (data.type === NETWORK_MESSAGES.STATE) {
				this.onStateUpdate(data.payload);
			}
		});

		this.hostConnection.on("close", () => {
			Console.log(`[Network] Disconnected`);
		});

		this.hostConnection.on("error", (err) => {
			Console.error(`[Network] Error: ${err}`);
			reject(err);
		});
	}

	// Host broadcasts state to all clients
	broadcast(state) {
		if (this.role !== "host") return;

		const packet = {
			type: NETWORK_MESSAGES.STATE,
			payload: state,
		};

		for (const conn of this.clientConnections.values()) {
			if (conn.open) {
				conn.send(packet);
			}
		}
	}

	// Client sends position to host
	sendPosition(posData) {
		if (this.role !== "client" || !this.hostConnection?.open) return;

		this.hostConnection.send({
			type: NETWORK_MESSAGES.POSITION,
			payload: posData,
		});
	}

	disconnect() {
		if (this.hostConnection) {
			this.hostConnection.close();
			this.hostConnection = null;
		}

		if (this.peer) {
			this.peer.destroy();
			this.peer = null;
		}

		this.clientConnections.clear();
		this.role = null;
	}

	getPeerId() {
		return this.peer?.id || null;
	}
}
