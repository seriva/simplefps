import { Peer } from "../../dependencies/peerjs.js";
import { Console } from "../core/engine.js";
import { NETWORK_MESSAGES } from "./networkhost.js";

export class NetworkClient {
	constructor(options = {}) {
		this.onStateUpdate = options.onStateUpdate || (() => {});
		this.onInit = options.onInit || (() => {});
		this.peer = null;
		this.conn = null;
		this.frameSequence = 0;
	}

	async connect(hostId) {
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
				Console.log(`[NetworkClient] My ID: ${id}`);
				this._connectToHost(hostId, resolve, reject);
			});

			this.peer.on("error", (err) => {
				Console.error(`[NetworkClient] Error: ${err}`);
				reject(err);
			});
		});
	}

	_connectToHost(hostId, resolve, reject) {
		Console.log(`[NetworkClient] Connecting to host: ${hostId}`);
		// reliable: true helps with some WebRTC connection issues
		this.conn = this.peer.connect(hostId, { reliable: true });

		Console.log(
			`[NetworkClient] Connection state: ${this.conn.open ? "open" : "pending"}`,
		);

		this.conn.on("open", () => {
			Console.log(`[NetworkClient] Connected to Host!`);
			resolve();
		});

		this.conn.on("data", (data) => {
			this._handleData(data);
		});

		this.conn.on("close", () => {
			Console.log(`[NetworkClient] Disconnected from Host`);
			// Handle disconnection (return to menu?)
		});

		this.conn.on("error", (err) => {
			Console.error(`[NetworkClient] Connection error: ${err}`);
			reject(err);
		});
	}

	_handleData(data) {
		if (data.type === NETWORK_MESSAGES.STATE) {
			this.onStateUpdate(data.payload, data.ts);
		} else if (data.type === NETWORK_MESSAGES.INIT) {
			this.onInit(data.payload);
		}
	}

	sendInput(input) {
		if (this.conn && this.conn.open) {
			this.conn.send({
				type: NETWORK_MESSAGES.INPUT,
				payload: {
					...input,
					seq: this.frameSequence++,
				},
			});
		}
	}

	disconnect() {
		if (this.conn) {
			this.conn.close();
		}
		if (this.peer) {
			this.peer.destroy();
		}
	}
}
