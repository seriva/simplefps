//gofront:target wasm
package collision

import (
	"errors"

	"../mathx"
)

var (
	ErrInvalidVertices  = errors.New("collision: vertices length must be a multiple of 3")
	ErrInvalidIndices   = errors.New("collision: indices length must be a multiple of 3")
	ErrInvalidFlags     = errors.New("collision: triangleFlags length does not match triangle count")
	ErrIndexOutOfBounds = errors.New("collision: index out of vertex bounds")
)

var (
	_tmVa mathx.Vec3
	_tmVb mathx.Vec3
	_tmVc mathx.Vec3
	_tmN  mathx.Vec3
	_tmAb mathx.Vec3
	_tmCb mathx.Vec3
)

const (
	BroadphaseSpatialHashMap  = 0
	BroadphaseSpatialHashFlat = 1
)

type pendingIndexData struct {
	data   []int32
	offset int
}

// Trimesh represents a collision triangle mesh with spatial hash acceleration.
type Trimesh struct {
	AABB             mathx.BoundingBox
	Vertices         []float32
	Indices          []int32
	TriangleFlags    []byte
	spatialHash      *spatialHash
	broadphase       int
	normals          []float32
	pendingVertices  [][]float32
	pendingIndices   []pendingIndexData
	pendingFlags     [][]byte
	totalVertexCount int
	dirty            bool
}

// NewTrimesh creates a Trimesh populated with vertices, indices, and optional per-triangle flags.
func NewTrimesh(vertices []float32, indices []int32, triangleFlags []byte) (*Trimesh, error) {
	if len(vertices)%3 != 0 {
		return nil, ErrInvalidVertices
	}
	if len(indices)%3 != 0 {
		return nil, ErrInvalidIndices
	}
	if len(triangleFlags) > 0 && len(triangleFlags) != len(indices)/3 {
		return nil, ErrInvalidFlags
	}

	numVerts := int32(len(vertices) / 3)
	for _, idx := range indices {
		if idx < 0 || idx >= numVerts {
			return nil, ErrIndexOutOfBounds
		}
	}

	tm := &Trimesh{
		broadphase: BroadphaseSpatialHashMap,
	}

	if len(vertices) > 0 && len(indices) > 0 {
		tm.Vertices = make([]float32, len(vertices))
		copy(tm.Vertices, vertices)
		tm.Indices = make([]int32, len(indices))
		copy(tm.Indices, indices)
		tm.normals = make([]float32, len(indices))
		if len(triangleFlags) > 0 {
			tm.TriangleFlags = make([]byte, len(triangleFlags))
			copy(tm.TriangleFlags, triangleFlags)
		}
		tm.updateNormals()
		tm.AABB.SetFromPoints(tm.Vertices)
		tm.BuildSpatialHash(0)
	} else {
		tm.Vertices = make([]float32, 0)
		tm.Indices = make([]int32, 0)
		tm.normals = make([]float32, 0)
	}

	return tm, nil
}

// NewEmptyTrimesh creates an empty Trimesh ready to receive multiple meshes via AddMesh and Finalize.
func NewEmptyTrimesh() *Trimesh {
	return &Trimesh{
		broadphase: BroadphaseSpatialHashMap,
		Vertices:   make([]float32, 0),
		Indices:    make([]int32, 0),
		normals:    make([]float32, 0),
	}
}

// AddMesh queues mesh geometry to be merged when Finalize is called.
func (tm *Trimesh) AddMesh(vertices []float32, indices []int32, triangleFlags []byte) error {
	if len(vertices)%3 != 0 {
		return ErrInvalidVertices
	}
	if len(indices)%3 != 0 {
		return ErrInvalidIndices
	}
	if len(triangleFlags) > 0 && len(triangleFlags) != len(indices)/3 {
		return ErrInvalidFlags
	}

	numVerts := int32(len(vertices) / 3)
	for _, idx := range indices {
		if idx < 0 || idx >= numVerts {
			return ErrIndexOutOfBounds
		}
	}

	vertexOffset := tm.totalVertexCount
	tm.pendingVertices = append(tm.pendingVertices, vertices)
	tm.pendingIndices = append(tm.pendingIndices, pendingIndexData{data: indices, offset: vertexOffset})
	tm.pendingFlags = append(tm.pendingFlags, triangleFlags)
	tm.totalVertexCount += len(vertices) / 3
	tm.dirty = true
	return nil
}

// Finalize builds consolidated geometry, calculates normals, and generates the octree.
func (tm *Trimesh) Finalize() error {
	if !tm.dirty {
		return nil
	}

	totalVertLen := 0
	totalIdxLen := 0
	for _, v := range tm.pendingVertices {
		if len(v)%3 != 0 {
			return ErrInvalidVertices
		}
		totalVertLen += len(v)
	}
	for idxIdx, idx := range tm.pendingIndices {
		if len(idx.data)%3 != 0 {
			return ErrInvalidIndices
		}
		flags := tm.pendingFlags[idxIdx]
		if len(flags) > 0 && len(flags) != len(idx.data)/3 {
			return ErrInvalidFlags
		}
		totalIdxLen += len(idx.data)
	}

	for i, p := range tm.pendingIndices {
		meshVerts := int32(len(tm.pendingVertices[i]) / 3)
		for _, idx := range p.data {
			if idx < 0 || idx >= meshVerts {
				return ErrIndexOutOfBounds
			}
		}
	}

	tm.Vertices = make([]float32, totalVertLen)
	tm.Indices = make([]int32, totalIdxLen)

	hasFlags := false
	for _, f := range tm.pendingFlags {
		if f != nil {
			hasFlags = true
		}
	}
	if hasFlags {
		tm.TriangleFlags = make([]byte, totalIdxLen/3)
	} else {
		tm.TriangleFlags = nil
	}

	vOffset := 0
	for _, v := range tm.pendingVertices {
		copy(tm.Vertices[vOffset:], v)
		vOffset += len(v)
	}

	iOffset := 0
	fOffset := 0
	for idxIdx := 0; idxIdx < len(tm.pendingIndices); idxIdx++ {
		p := tm.pendingIndices[idxIdx]
		flags := tm.pendingFlags[idxIdx]
		data := p.data
		offset := int32(p.offset)
		for i := 0; i < len(data); i++ {
			tm.Indices[iOffset+i] = data[i] + offset
		}

		if tm.TriangleFlags != nil {
			if flags != nil {
				copy(tm.TriangleFlags[fOffset:], flags)
			}
			fOffset += len(data) / 3
		}

		iOffset += len(data)
	}

	tm.pendingVertices = nil
	tm.pendingIndices = nil
	tm.pendingFlags = nil

	tm.normals = make([]float32, len(tm.Indices))
	tm.updateNormals()
	tm.AABB.SetFromPoints(tm.Vertices)
	tm.BuildSpatialHash(0)
	tm.dirty = false
	return nil
}

// AABBQuery gathers candidate triangles overlapping the query bounding box and writes them into out.
// Returns the number of candidate triangle indices written.
func (tm *Trimesh) AABBQuery(aabb *mathx.BoundingBox, out []int) int {
	if tm.spatialHash == nil || aabb == nil {
		return 0
	}
	return tm.spatialHash.aabbQuery(aabb, out)
}

// SetBroadphase selects the broadphase spatial acceleration structure:
// 0: BroadphaseSpatialHashMap (discrete [3]int32 voxel grid via map, default)
// 1: BroadphaseSpatialHashFlat (discrete [3]int32 voxel grid via flat array)
func (tm *Trimesh) SetBroadphase(bp int) {
	tm.broadphase = bp
	sh := tm.spatialHash
	if sh != nil {
		if bp == BroadphaseSpatialHashFlat {
			sh.mode = spatialHashModeFlat
		} else {
			sh.mode = spatialHashModeMap
		}
	}
}

// Broadphase returns the currently selected broadphase structure.
func (tm *Trimesh) Broadphase() int {
	return tm.broadphase
}

// BuildSpatialHash constructs or rebuilds the spatial hash from current geometry.
// Pass cellSize <= 0 to automatically size voxels based on average triangle bounds.
func (tm *Trimesh) BuildSpatialHash(cellSize float32) {
	if len(tm.Indices) == 0 {
		tm.spatialHash = nil
		return
	}
	sh := newSpatialHash(tm.Vertices, tm.Indices, &tm.AABB, cellSize)
	if tm.broadphase == BroadphaseSpatialHashFlat {
		sh.mode = spatialHashModeFlat
	} else {
		sh.mode = spatialHashModeMap
	}
	tm.spatialHash = sh
}

// SpatialHashStats returns voxel count, triangle reference count, and flat cell count.
func (tm *Trimesh) SpatialHashStats() (int, int, int) {
	sh := tm.spatialHash
	if sh == nil {
		return 0, 0, 0
	}
	voxels, refs, flatCells := sh.stats()
	return voxels, refs, flatCells
}

// updateNormals computes surface normals for all triangles in the mesh.
func (tm *Trimesh) updateNormals() {
	indices := tm.Indices
	vertices := tm.Vertices
	normals := tm.normals

	for i := 0; i < len(indices); i += 3 {
		i0 := indices[i] * 3
		i1 := indices[i+1] * 3
		i2 := indices[i+2] * 3

		_tmVa.Set(vertices[i0], vertices[i0+1], vertices[i0+2])
		_tmVb.Set(vertices[i1], vertices[i1+1], vertices[i1+2])
		_tmVc.Set(vertices[i2], vertices[i2+1], vertices[i2+2])

		computeNormal(&_tmVb, &_tmVa, &_tmVc, &_tmN)

		normals[i] = _tmN.X
		normals[i+1] = _tmN.Y
		normals[i+2] = _tmN.Z
	}
}

// getNormal retrieves the surface normal of triangle i into target.
func (tm *Trimesh) getNormal(i int, target *mathx.Vec3) {
	i3 := i * 3
	target.X = tm.normals[i3]
	target.Y = tm.normals[i3+1]
	target.Z = tm.normals[i3+2]
}

// getVertex retrieves vertex coordinates of vertex index i into out.
func (tm *Trimesh) getVertex(i int, out *mathx.Vec3) {
	i3 := i * 3
	out.X = tm.Vertices[i3]
	out.Y = tm.Vertices[i3+1]
	out.Z = tm.Vertices[i3+2]
}

// computeNormal calculates the normalized surface normal for triangle (va, vb, vc).
func computeNormal(va, vb, vc, target *mathx.Vec3) {
	_tmAb.Sub(vb, va)
	_tmCb.Sub(vc, vb)
	target.Cross(&_tmCb, &_tmAb)
	if target.SquaredLength() > 0 {
		target.Normalize(target)
	}
}
