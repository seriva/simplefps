import { Peer } from "../../dependencies/peerjs.js";
import { Console } from "../core/engine.js";
import { NETWORK_MESSAGES } from "./networkhost.js";

export class NetworkClient {
	constructor(options = {}) {
		this.onStateUpdate = options.onStateUpdate || (() => {});
		this.peer = null;
		this.conn = null;
	}

	async connect(hostId) {
		return new Promise((resolve, reject) => {
			const iceConfig = {
				iceServers: [
					{ urls: "stun:stun.l.google.com:19302" },
					{ urls: "stun:stun1.l.google.com:19302" },
				],
			};

			this.peer = new Peer(undefined, { config: iceConfig });

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
		Console.log(`[NetworkClient] Connecting to: ${hostId}`);
		this.conn = this.peer.connect(hostId, { reliable: true });

		this.conn.on("open", () => {
			Console.log(`[NetworkClient] Connected!`);
			resolve();
		});

		this.conn.on("data", (data) => {
			if (data.type === NETWORK_MESSAGES.STATE) {
				this.onStateUpdate(data.payload);
			}
		});

		this.conn.on("close", () => {
			Console.log(`[NetworkClient] Disconnected`);
		});

		this.conn.on("error", (err) => {
			Console.error(`[NetworkClient] Error: ${err}`);
			reject(err);
		});
	}

	sendPosition(posData) {
		if (this.conn?.open) {
			this.conn.send({
				type: NETWORK_MESSAGES.POSITION,
				payload: posData,
			});
		}
	}

	disconnect() {
		if (this.conn) this.conn.close();
		if (this.peer) this.peer.destroy();
		this.conn = null;
		this.peer = null;
	}
}
