//gofront:target wasm
package decoder

import (
	"encoding/binary"
	"math"
)

// BinaryReader provides sequential little-endian decoding over a byte slice.
type BinaryReader struct {
	Data   []byte
	Offset int
}

// NewBinaryReader creates a new BinaryReader wrapping the provided byte slice.
func NewBinaryReader(data []byte) *BinaryReader {
	return &BinaryReader{Data: data, Offset: 0}
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
	v := int8(br.Data[br.Offset])
	br.Offset++
	return v
}

// ReadUint16 reads a 16-bit unsigned integer.
func (br *BinaryReader) ReadUint16() uint16 {
	if br.Offset+2 > len(br.Data) {
		return 0
	}
	v := binary.LittleEndian.Uint16(br.Data[br.Offset:])
	br.Offset += 2
	return v
}

// ReadInt16 reads a 16-bit signed integer.
func (br *BinaryReader) ReadInt16() int16 {
	if br.Offset+2 > len(br.Data) {
		return 0
	}
	v := int16(binary.LittleEndian.Uint16(br.Data[br.Offset:]))
	br.Offset += 2
	return v
}

// ReadUint32 reads a 32-bit unsigned integer.
func (br *BinaryReader) ReadUint32() uint32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	v := binary.LittleEndian.Uint32(br.Data[br.Offset:])
	br.Offset += 4
	return v
}

// ReadInt32 reads a 32-bit signed integer.
func (br *BinaryReader) ReadInt32() int32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	v := int32(binary.LittleEndian.Uint32(br.Data[br.Offset:]))
	br.Offset += 4
	return v
}

// ReadFloat32 reads a 32-bit IEEE-754 float.
func (br *BinaryReader) ReadFloat32() float32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	bits := binary.LittleEndian.Uint32(br.Data[br.Offset:])
	br.Offset += 4
	return math.Float32frombits(bits)
}

// ReadFloat32Array reads count float32 elements into a new, independent slice.
func (br *BinaryReader) ReadFloat32Array(count int) []float32 {
	if count <= 0 {
		return make([]float32, 0)
	}
	if br.Offset+count*4 > len(br.Data) {
		count = (len(br.Data) - br.Offset) / 4
	}
	res := make([]float32, count)
	for i := 0; i < count; i++ {
		bits := binary.LittleEndian.Uint32(br.Data[br.Offset : br.Offset+4])
		res[i] = math.Float32frombits(bits)
		br.Offset += 4
	}
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
	res := make([]uint32, count)
	for i := 0; i < count; i++ {
		res[i] = binary.LittleEndian.Uint32(br.Data[br.Offset : br.Offset+4])
		br.Offset += 4
	}
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
	str := string(br.Data[br.Offset:nullIdx])
	br.Offset = end
	return str
}

// ReadStringNullTerminated reads characters until encountering a null byte.
func (br *BinaryReader) ReadStringNullTerminated() string {
	start := br.Offset
	for br.Offset < len(br.Data) && br.Data[br.Offset] != 0 {
		br.Offset++
	}
	str := string(br.Data[start:br.Offset])
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
