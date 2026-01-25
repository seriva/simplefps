export class BinaryReader {
	constructor(buffer) {
		this.dataView = new DataView(buffer);
		this.bytes = new Uint8Array(buffer);
		this.offset = 0;
	}

	readUint32() {
		const value = this.dataView.getUint32(this.offset, true);
		this.offset += 4;
		return value;
	}

	readInt32() {
		const value = this.dataView.getInt32(this.offset, true);
		this.offset += 4;
		return value;
	}

	readFloat32() {
		const value = this.dataView.getFloat32(this.offset, true);
		this.offset += 4;
		return value;
	}

	readFloat32Array(count) {
		if (count === 0) return new Float32Array(0);
		// Create a view first
		const view = new Float32Array(
			this.bytes.buffer,
			this.bytes.byteOffset + this.offset,
			count,
		);
		// Copy to new buffer to avoid sharing the large original buffer
		const result = new Float32Array(view);
		this.offset += count * 4;
		return result;
	}

	readUint8Array(count) {
		const result = this.bytes.slice(this.offset, this.offset + count);
		this.offset += count;
		return result;
	}

	readString(length) {
		let str = "";
		const end = this.offset + length;
		for (let i = this.offset; i < end; i++) {
			if (this.bytes[i] === 0) break;
			str += String.fromCharCode(this.bytes[i]);
		}
		this.offset += length; // Always advance by fixed length
		return str;
	}

	readStringNullTerminated() {
		let str = "";
		while (this.offset < this.bytes.length && this.bytes[this.offset] !== 0) {
			str += String.fromCharCode(this.bytes[this.offset++]);
		}
		this.offset++; // Skip null terminator
		return str;
	}

	seek(offset) {
		this.offset = offset;
	}

	skip(bytes) {
		this.offset += bytes;
	}

	getOffset() {
		return this.offset;
	}
}
