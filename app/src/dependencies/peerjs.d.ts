// Minimal PeerJS surface used by engine/systems/network.go.
// The vendor bundle (gofront prep / build) exposes the constructor as
// window.Peer; instances are created via Reflect.construct(globalThis.Peer, ...).

interface PeerDataConnection {
	peer: string;
	open: boolean;
	on(event: string, handler: any): void;
	send(data: any): void;
	close(): void;
}

interface PeerClient {
	id: string;
	destroyed: boolean;
	on(event: string, handler: any): void;
	connect(peerId: string, options: any): PeerDataConnection;
	destroy(): void;
}
