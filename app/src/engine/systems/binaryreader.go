package systems

import "js:./interop.d.ts"

// Shared decoder; constructing one per string was the old hot-path cost.
var _brDecoder = Reflect.construct(globalThis.TextDecoder, []any{})

// BinaryReader provides sequential little-endian decoding over a byte slice.
type BinaryReader struct {
	Data   []byte
	Offset int

	view DataView
	buf  any // underlying ArrayBuffer of Data
	base int // byteOffset of Data within buf
}

// NewBinaryReader creates a new BinaryReader wrapping the provided byte slice.
func NewBinaryReader(data []byte) *BinaryReader {
	var u8 any = data
	br := &BinaryReader{Data: data, buf: u8.buffer, base: u8.byteOffset.(int)}
	br.view = Reflect.construct(globalThis.DataView, []any{u8.buffer, u8.byteOffset, u8.byteLength}).(DataView)
	return br
}

// ReadUint8 reads a single unsigned 8-bit byte.
func (br *BinaryReader) ReadUint8() byte {
	if br.Offset >= len(br.Data) {
		return 0
	}
	b := br.Data[br.Offset]
	br.Offset++
	return b
}

// ReadInt8 reads a single signed 8-bit integer.
func (br *BinaryReader) ReadInt8() int8 {
	if br.Offset >= len(br.Data) {
		return 0
	}
	v := br.view.getInt8(br.Offset)
	br.Offset++
	return v
}

// ReadUint16 reads a 16-bit unsigned integer.
func (br *BinaryReader) ReadUint16() uint16 {
	if br.Offset+2 > len(br.Data) {
		return 0
	}
	v := br.view.getUint16(br.Offset, true)
	br.Offset += 2
	return v
}

// ReadInt16 reads a 16-bit signed integer.
func (br *BinaryReader) ReadInt16() int16 {
	if br.Offset+2 > len(br.Data) {
		return 0
	}
	v := br.view.getInt16(br.Offset, true)
	br.Offset += 2
	return v
}

// ReadUint32 reads a 32-bit unsigned integer.
func (br *BinaryReader) ReadUint32() uint32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	v := br.view.getUint32(br.Offset, true)
	br.Offset += 4
	return v
}

// ReadInt32 reads a 32-bit signed integer.
func (br *BinaryReader) ReadInt32() int32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	v := br.view.getInt32(br.Offset, true)
	br.Offset += 4
	return v
}

// ReadFloat32 reads a 32-bit IEEE-754 float.
func (br *BinaryReader) ReadFloat32() float32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	v := br.view.getFloat32(br.Offset, true)
	br.Offset += 4
	return v
}

// ReadFloat32Array reads count float32 elements into a new, independent slice.
func (br *BinaryReader) ReadFloat32Array(count int) []float32 {
	if count <= 0 {
		return make([]float32, 0)
	}
	if br.Offset+count*4 > len(br.Data) {
		count = (len(br.Data) - br.Offset) / 4
	}
	view := Reflect.construct(globalThis.Float32Array, []any{br.buf, br.base + br.Offset, count})
	res := Reflect.construct(globalThis.Float32Array, []any{view}).([]float32)
	br.Offset += count * 4
	return res
}

// ReadUint32Array reads count uint32 elements into a new, independent slice.
func (br *BinaryReader) ReadUint32Array(count int) []uint32 {
	if count <= 0 {
		return make([]uint32, 0)
	}
	if br.Offset+count*4 > len(br.Data) {
		count = (len(br.Data) - br.Offset) / 4
	}
	view := Reflect.construct(globalThis.Uint32Array, []any{br.buf, br.base + br.Offset, count})
	res := Reflect.construct(globalThis.Uint32Array, []any{view}).([]uint32)
	br.Offset += count * 4
	return res
}

// ReadUint8Array copies count bytes into a new slice and advances the offset.
func (br *BinaryReader) ReadUint8Array(count int) []byte {
	if count <= 0 {
		return make([]byte, 0)
	}
	end := br.Offset + count
	if end > len(br.Data) {
		end = len(br.Data)
	}
	res := make([]byte, end-br.Offset)
	copy(res, br.Data[br.Offset:end])
	br.Offset = end
	return res
}

// ReadString reads a fixed-length string, trimming at the first null byte.
func (br *BinaryReader) ReadString(length int) string {
	end := br.Offset + length
	if end > len(br.Data) {
		end = len(br.Data)
	}
	nullIdx := end
	for i := br.Offset; i < end; i++ {
		if br.Data[i] == 0 {
			nullIdx = i
			break
		}
	}
	str := _brDecoder.decode(br.Data[br.Offset:nullIdx]).(string)
	br.Offset = end
	return str
}

// ReadStringNullTerminated reads characters until encountering a null byte.
func (br *BinaryReader) ReadStringNullTerminated() string {
	start := br.Offset
	for br.Offset < len(br.Data) && br.Data[br.Offset] != 0 {
		br.Offset++
	}
	str := _brDecoder.decode(br.Data[start:br.Offset]).(string)
	if br.Offset < len(br.Data) {
		br.Offset++ // Skip null byte
	}
	return str
}

// Seek sets the read cursor offset, clamped to the data bounds.
func (br *BinaryReader) Seek(offset int) {
	if offset < 0 {
		offset = 0
	}
	if offset > len(br.Data) {
		offset = len(br.Data)
	}
	br.Offset = offset
}

// Skip advances the read cursor offset by bytes.
func (br *BinaryReader) Skip(bytes int) {
	br.Seek(br.Offset + bytes)
}

// GetOffset returns the current read cursor position.
func (br *BinaryReader) GetOffset() int {
	return br.Offset
}

// GetBytes returns the underlying byte slice.
func (br *BinaryReader) GetBytes() []byte {
	return br.Data
}

// Remaining returns how many unread bytes are available.
func (br *BinaryReader) Remaining() int {
	rem := len(br.Data) - br.Offset
	if rem < 0 {
		return 0
	}
	return rem
}
