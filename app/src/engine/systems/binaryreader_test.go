package systems

import (
	"math"
	"testing"
)

func TestBinaryReaderSignedAndFloat(t *testing.T) {
	// int16 -2 = 0xfffe; int32 -1 = 0xffffffff; float32 -1.0 = 0xbf800000
	data := []byte{
		0xfe, 0xff,
		0xff, 0xff, 0xff, 0xff,
		0x00, 0x00, 0x80, 0xbf,
	}
	reader := NewBinaryReader(data)
	if v := reader.ReadInt16(); v != -2 {
		t.Errorf("ReadInt16 expected -2, got %d", v)
	}
	if v := reader.ReadInt32(); v != -1 {
		t.Errorf("ReadInt32 expected -1, got %d", v)
	}
	if v := reader.ReadFloat32(); v != -1.0 {
		t.Errorf("ReadFloat32 expected -1.0, got %f", v)
	}
	// Reads past the end return zero and do not advance.
	if v := reader.ReadUint32(); v != 0 {
		t.Errorf("ReadUint32 past end expected 0, got %d", v)
	}
	if reader.Remaining() != 0 {
		t.Errorf("Expected 0 remaining, got %d", reader.Remaining())
	}
}

func TestBinaryReaderSubsliceOffset(t *testing.T) {
	// A reader over a sub-slice must respect the slice's byteOffset.
	backing := []byte{0xaa, 0xbb, 0x00, 0x00, 0x80, 0x3f}
	reader := NewBinaryReader(backing[2:])
	if v := reader.ReadFloat32(); v != 1.0 {
		t.Errorf("Expected 1.0 from sub-slice, got %f", v)
	}
}

func TestBinaryReaderArraysAreCopies(t *testing.T) {
	data := []byte{1, 2, 3, 4, 0x00, 0x00, 0x80, 0x3f}
	reader := NewBinaryReader(data)

	bytes := reader.ReadUint8Array(4)
	bytes[0] = 99
	if data[0] != 1 {
		t.Error("ReadUint8Array must copy, not alias the source")
	}

	floats := reader.ReadFloat32Array(1)
	floats[0] = 5
	reader.Seek(4)
	if v := reader.ReadFloat32(); v != 1.0 {
		t.Errorf("ReadFloat32Array must copy; source changed to %f", v)
	}
}

func TestBinaryReaderIntegers(t *testing.T) {
	// Little endian bytes for:
	// uint8: 42
	// int8: -5 (251)
	// uint16: 1000 (0x03e8 -> [0xe8, 0x03])
	// uint32: 100000 (0x000186a0 -> [0xa0, 0x86, 0x01, 0x00])
	data := []byte{
		42,
		251,
		0xe8, 0x03,
		0xa0, 0x86, 0x01, 0x00,
	}

	reader := NewBinaryReader(data)
	if u8 := reader.ReadUint8(); u8 != 42 {
		t.Errorf("ReadUint8 expected 42, got %d", u8)
	}
	if i8 := reader.ReadInt8(); i8 != -5 {
		t.Errorf("ReadInt8 expected -5, got %d", i8)
	}
	if u16 := reader.ReadUint16(); u16 != 1000 {
		t.Errorf("ReadUint16 expected 1000, got %d", u16)
	}
	if u32 := reader.ReadUint32(); u32 != 100000 {
		t.Errorf("ReadUint32 expected 100000, got %d", u32)
	}
	if reader.Remaining() != 0 {
		t.Errorf("Expected 0 remaining bytes, got %d", reader.Remaining())
	}
}

func TestBinaryReaderFloats(t *testing.T) {
	// 1.0f (0x3f800000) in little endian: [0x00, 0x00, 0x80, 0x3f]
	// 2.5f (0x40200000) in little endian: [0x00, 0x00, 0x20, 0x40]
	data := []byte{
		0x00, 0x00, 0x80, 0x3f,
		0x00, 0x00, 0x20, 0x40,
	}

	reader := NewBinaryReader(data)
	floats := reader.ReadFloat32Array(2)
	if len(floats) != 2 {
		t.Fatalf("Expected 2 floats, got %d", len(floats))
	}
	if math.Abs(float64(floats[0]-1.0)) > 1e-6 {
		t.Errorf("Expected 1.0, got %f", floats[0])
	}
	if math.Abs(float64(floats[1]-2.5)) > 1e-6 {
		t.Errorf("Expected 2.5, got %f", floats[1])
	}
}

func TestBinaryReaderStrings(t *testing.T) {
	data := []byte{
		'H', 'e', 'l', 'l', 'o', 0, 'X', 'Y',
		'W', 'o', 'r', 'l', 'd', 0,
	}

	reader := NewBinaryReader(data)
	s1 := reader.ReadString(8)
	if s1 != "Hello" {
		t.Errorf("Expected 'Hello', got '%s'", s1)
	}
	s2 := reader.ReadStringNullTerminated()
	if s2 != "World" {
		t.Errorf("Expected 'World', got '%s'", s2)
	}
}

func TestBinaryReaderSeekAndSkip(t *testing.T) {
	data := []byte{1, 2, 3, 4, 5, 6}
	reader := NewBinaryReader(data)

	reader.Skip(2)
	if b := reader.ReadUint8(); b != 3 {
		t.Errorf("Expected 3 after skip, got %d", b)
	}
	reader.Seek(1)
	if b := reader.ReadUint8(); b != 2 {
		t.Errorf("Expected 2 after seek, got %d", b)
	}
	if reader.GetOffset() != 2 {
		t.Errorf("Expected offset 2, got %d", reader.GetOffset())
	}
}
