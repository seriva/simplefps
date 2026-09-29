package systems

import (
	"math"
)

// Float32FromBits decodes an IEEE-754 32-bit floating point value from its raw uint32 bit pattern.
func Float32FromBits(u uint32) float32 {
	sign := (u >> 31) != 0
	exp := (u >> 23) & 0xff
	mant := u & 0x7fffff

	if exp == 0 && mant == 0 {
		if sign {
			return -0.0
		}
		return 0.0
	}
	if exp == 255 {
		if mant == 0 {
			if sign {
				return float32(math.Inf(-1))
			}
			return float32(math.Inf(1))
		}
		return float32(math.NaN())
	}

	var val float64
	if exp > 0 {
		val = (1.0 + float64(mant)/8388608.0) * math.Pow(2.0, float64(int(exp)-127))
	} else {
		// Subnormal
		val = (float64(mant) / 8388608.0) * math.Pow(2.0, -126.0)
	}

	if sign {
		return float32(-val)
	}
	return float32(val)
}

// BinaryReader provides sequential binary decoding over a byte slice.
type BinaryReader struct {
	Data   []byte
	Offset int
}

// NewBinaryReader creates a new BinaryReader wrapping the provided byte slice.
func NewBinaryReader(data []byte) *BinaryReader {
	return &BinaryReader{
		Data:   data,
		Offset: 0,
	}
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
	u := br.ReadUint8()
	if u >= 128 {
		return int8(int(u) - 256)
	}
	return int8(u)
}

// ReadUint16 reads a 16-bit unsigned integer in little-endian format.
func (br *BinaryReader) ReadUint16() uint16 {
	if br.Offset+2 > len(br.Data) {
		return 0
	}
	b0 := uint16(br.Data[br.Offset])
	b1 := uint16(br.Data[br.Offset+1])
	br.Offset += 2
	return b0 | (b1 << 8)
}

// ReadInt16 reads a 16-bit signed integer in little-endian format.
func (br *BinaryReader) ReadInt16() int16 {
	u := br.ReadUint16()
	if u >= 32768 {
		return int16(int(u) - 65536)
	}
	return int16(u)
}

// ReadUint32 reads a 32-bit unsigned integer in little-endian format.
func (br *BinaryReader) ReadUint32() uint32 {
	if br.Offset+4 > len(br.Data) {
		return 0
	}
	b0 := uint32(br.Data[br.Offset])
	b1 := uint32(br.Data[br.Offset+1])
	b2 := uint32(br.Data[br.Offset+2])
	b3 := uint32(br.Data[br.Offset+3])
	br.Offset += 4
	return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
}

// ReadInt32 reads a 32-bit signed integer in little-endian format.
func (br *BinaryReader) ReadInt32() int32 {
	return int32(br.ReadUint32())
}

// ReadFloat32 reads a 32-bit IEEE-754 float in little-endian format.
func (br *BinaryReader) ReadFloat32() float32 {
	bits := br.ReadUint32()
	return Float32FromBits(bits)
}

// ReadFloat32Array reads count float32 elements into a slice.
func (br *BinaryReader) ReadFloat32Array(count int) []float32 {
	if count <= 0 {
		return make([]float32, 0)
	}
	res := make([]float32, count)
	for i := 0; i < count; i++ {
		res[i] = br.ReadFloat32()
	}
	return res
}

// ReadUint32Array reads count uint32 elements into a slice.
func (br *BinaryReader) ReadUint32Array(count int) []uint32 {
	if count <= 0 {
		return make([]uint32, 0)
	}
	res := make([]uint32, count)
	for i := 0; i < count; i++ {
		res[i] = br.ReadUint32()
	}
	return res
}

// ReadUint8Array returns a sub-slice of count bytes advancing the offset.
func (br *BinaryReader) ReadUint8Array(count int) []byte {
	if count <= 0 {
		return make([]byte, 0)
	}
	end := br.Offset + count
	if end > len(br.Data) {
		end = len(br.Data)
	}
	res := br.Data[br.Offset:end]
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

// Seek sets the read cursor offset.
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
