//gofront:target wasm
package decoder

import (
	"encoding/binary"
	"math"
	"testing"
)

type testBinWriter struct {
	buf []byte
	off int
}

func newTestBinWriter(size int) *testBinWriter {
	return &testBinWriter{buf: make([]byte, size), off: 0}
}

func (w *testBinWriter) u32(v int) {
	binary.LittleEndian.PutUint32(w.buf[w.off:], uint32(v))
	w.off += 4
}

func (w *testBinWriter) i32(v int) {
	binary.LittleEndian.PutUint32(w.buf[w.off:], uint32(v))
	w.off += 4
}

func (w *testBinWriter) f32(v float32) {
	binary.LittleEndian.PutUint32(w.buf[w.off:], math.Float32bits(v))
	w.off += 4
}

func (w *testBinWriter) str(s string, length int) {
	copy(w.buf[w.off:], []byte(s))
	w.off += length
}

func (w *testBinWriter) strNull(s string) {
	copy(w.buf[w.off:], []byte(s))
	w.off += len(s)
	w.buf[w.off] = 0
	w.off++
}

func (w *testBinWriter) u8(b byte) {
	w.buf[w.off] = b
	w.off++
}

func (w *testBinWriter) bytes() []byte {
	return w.buf[:w.off]
}

func TestParseBinaryMeshVersion2(t *testing.T) {
	w := newTestBinWriter(1024)
	w.u32(2) // version 2: has lightmaps
	w.u32(3) // 3 vertices
	w.u32(2) // 2 UVs
	w.u32(2) // 2 lightmap UVs
	w.u32(3) // 3 normals
	w.u32(1) // 1 index group

	// Vertices
	w.f32(1.0)
	w.f32(2.0)
	w.f32(3.0)
	// UVs
	w.f32(0.5)
	w.f32(0.5)
	// Lightmap UVs
	w.f32(0.25)
	w.f32(0.25)
	// Normals
	w.f32(0.0)
	w.f32(1.0)
	w.f32(0.0)

	// Index group: 64-byte name, u32 count, u32 indices
	w.str("metal", materialNameSize)
	w.u32(3)
	w.u32(0)
	w.u32(1)
	w.u32(2)

	md := ParseBinaryMesh(w.bytes())
	if md == nil {
		t.Fatal("expected non-nil MeshData")
	}
	if len(md.Vertices) != 3 || md.Vertices[0] != 1.0 {
		t.Errorf("vertices mismatch: length %d, first %f", len(md.Vertices), md.Vertices[0])
	}
	if len(md.LightmapUVs) != 2 || md.LightmapUVs[0] != 0.25 {
		t.Errorf("lightmaps mismatch: length %d, first %f", len(md.LightmapUVs), md.LightmapUVs[0])
	}
	if len(md.Indices) != 1 || md.Indices[0].Material != "metal" || len(md.Indices[0].Array) != 3 {
		t.Errorf("indices mismatch: length %d", len(md.Indices))
	}
}

func TestParseBinaryMeshSkinnedVersion5(t *testing.T) {
	w := newTestBinWriter(2048)
	w.u32(5) // version 5: skeletal + GPU skinning
	w.u32(3) // 3 vertices (1 vertex = 3 floats)
	w.u32(2) // 2 UVs
	w.u32(0) // lightmap UVs reserved/unused
	w.u32(3) // 3 normals
	w.u32(0) // 0 index groups
	w.u32(1) // 1 joint
	w.u32(0) // 0 legacy weights

	// Geometry
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)
	w.f32(0)

	// Joint 0: parent -1, pos (1,2,3), rot (0,0,0,1)
	w.i32(-1)
	w.f32(1)
	w.f32(2)
	w.f32(3)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)

	// Joint name
	w.strNull("root")

	// GPU skinning: 1 vertex -> 4 u8 joint indices, 4 f32 weights
	w.u8(0)
	w.u8(0)
	w.u8(0)
	w.u8(0)
	w.f32(1.0)
	w.f32(0.0)
	w.f32(0.0)
	w.f32(0.0)

	md := ParseBinaryMesh(w.bytes())
	if !md.HasSkeleton() || len(md.Joints) != 1 {
		t.Fatalf("expected 1 joint, got %d", len(md.Joints))
	}
	if md.Joints[0].Name != "root" || md.Joints[0].Parent != -1 {
		t.Errorf("joint def mismatch: name %s, parent %d", md.Joints[0].Name, md.Joints[0].Parent)
	}
	if len(md.JointIndices) != 4 || len(md.JointWeights) != 4 || md.JointWeights[0] != 1.0 {
		t.Errorf("skinning data mismatch: %d indices, %d weights", len(md.JointIndices), len(md.JointWeights))
	}
}

func TestParseBinaryMeshMalformedJointCount(t *testing.T) {
	w := newTestBinWriter(64)
	w.u32(3)        // version 3: skeletal
	w.u32(0)        // vertexCount
	w.u32(0)        // uvCount
	w.u32(0)        // reserved
	w.u32(0)        // normalCount
	w.u32(0)        // indexGroupCount
	w.u32(1000000)  // jointCount (malformed: buffer has 0 bytes left)
	w.u32(0)        // weightCount

	md := ParseBinaryMesh(w.bytes())
	if md == nil {
		t.Fatal("expected non-nil MeshData")
	}
	if md.HasSkeleton() || len(md.Joints) != 0 {
		t.Errorf("expected no joints, got %d", len(md.Joints))
	}
}

func TestParseBinaryMeshLegacyWeightOverflow(t *testing.T) {
	w := newTestBinWriter(128)
	w.u32(3) // version 3
	w.u32(0) // vertexCount
	w.u32(0) // uvCount
	w.u32(0) // reserved
	w.u32(0) // normalCount
	w.u32(0) // indexGroupCount
	w.u32(1) // jointCount = 1
	w.u32(1) // weightCount = 1

	// Joint 0: 32 bytes + null-terminated name
	w.i32(-1)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)
	w.strNull("j0")

	// Weight 0: vertexIndex=0, count=0x7fffffff (overflow attempt)
	w.u32(0)
	w.u32(0x7fffffff)

	md := ParseBinaryMesh(w.bytes())
	if md == nil {
		t.Fatal("expected non-nil MeshData")
	}
}

func TestParseBinaryMeshTruncatedIndexGroups(t *testing.T) {
	w := newTestBinWriter(64)
	w.u32(1) // version 1
	w.u32(0) // vertexCount
	w.u32(0) // uvCount
	w.u32(0) // reserved
	w.u32(0) // normalCount
	w.u32(5) // promised 5 index groups, but 0 bytes follow

	md := ParseBinaryMesh(w.bytes())
	if md == nil {
		t.Fatal("expected non-nil MeshData")
	}
	if len(md.Indices) != 0 {
		t.Errorf("expected 0 indices, got %d", len(md.Indices))
	}
}
