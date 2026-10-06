//gofront:target wasm
package collision

import (
	"math"

	"../mathx"
)

var (
	_tmVa mathx.Vec3
	_tmVb mathx.Vec3
	_tmVc mathx.Vec3
	_tmN  mathx.Vec3
	_tmAb mathx.Vec3
	_tmCb mathx.Vec3
)

type pendingIndexData struct {
	Data   []int32
	Offset int
}

// Trimesh represents a collision triangle mesh with octree spatial acceleration.
type Trimesh struct {
	AABB             mathx.BoundingBox
	Tree             *Octree
	Vertices         []float32
	Indices          []int32
	Normals          []float32
	TriangleFlags    []byte
	pendingVertices  [][]float32
	pendingIndices   []pendingIndexData
	pendingFlags     [][]byte
	totalVertexCount int
	dirty            bool
}

// NewTrimesh creates a Trimesh populated with vertices, indices, and optional per-triangle flags.
func NewTrimesh(vertices []float32, indices []int32, triangleFlags []byte) *Trimesh {
	tm := &Trimesh{
		Tree: NewOctree(nil, 8),
	}

	if len(vertices) > 0 && len(indices) > 0 {
		tm.Vertices = make([]float32, len(vertices))
		copy(tm.Vertices, vertices)
		tm.Indices = make([]int32, len(indices))
		copy(tm.Indices, indices)
		tm.Normals = make([]float32, len(indices))
		if len(triangleFlags) > 0 {
			tm.TriangleFlags = make([]byte, len(triangleFlags))
			copy(tm.TriangleFlags, triangleFlags)
		}
		tm.UpdateNormals()
		tm.ComputeLocalAABB(&tm.AABB)
		tm.UpdateTree()
	} else {
		tm.Vertices = make([]float32, 0)
		tm.Indices = make([]int32, 0)
		tm.Normals = make([]float32, 0)
	}

	return tm
}

// NewEmptyTrimesh creates an empty Trimesh ready to receive multiple meshes via AddMesh and Finalize.
func NewEmptyTrimesh() *Trimesh {
	return &Trimesh{
		Tree:     NewOctree(nil, 8),
		Vertices: make([]float32, 0),
		Indices:  make([]int32, 0),
		Normals:  make([]float32, 0),
	}
}

// AddMesh queues mesh geometry to be merged when Finalize is called.
func (tm *Trimesh) AddMesh(vertices []float32, indices []int32, triangleFlags []byte) {
	vertexOffset := tm.totalVertexCount
	tm.pendingVertices = append(tm.pendingVertices, vertices)
	tm.pendingIndices = append(tm.pendingIndices, pendingIndexData{Data: indices, Offset: vertexOffset})
	tm.pendingFlags = append(tm.pendingFlags, triangleFlags)
	tm.totalVertexCount += len(vertices) / 3
	tm.dirty = true
}

// Finalize builds consolidated geometry, calculates normals, and generates the octree.
func (tm *Trimesh) Finalize() {
	if !tm.dirty {
		return
	}

	totalVertLen := 0
	totalIdxLen := 0
	for _, v := range tm.pendingVertices {
		totalVertLen += len(v)
	}
	for _, idx := range tm.pendingIndices {
		totalIdxLen += len(idx.Data)
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
		data := p.Data
		offset := int32(p.Offset)
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

	tm.Normals = make([]float32, len(tm.Indices))
	tm.UpdateNormals()
	tm.ComputeLocalAABB(&tm.AABB)
	tm.UpdateTree()
	tm.dirty = false
}

// Dispose frees geometry buffers.
func (tm *Trimesh) Dispose() {
	tm.Vertices = nil
	tm.Indices = nil
	tm.Normals = nil
	tm.Tree = nil
}

// UpdateTree constructs the octree partitioning from current triangles.
func (tm *Trimesh) UpdateTree() {
	tree := tm.Tree
	tree.Reset()
	tree.AABB.Copy(&tm.AABB)

	epsilon := float32(0.001)
	tree.AABB.Min.X -= epsilon
	tree.AABB.Min.Y -= epsilon
	tree.AABB.Min.Z -= epsilon
	tree.AABB.Max.X += epsilon
	tree.AABB.Max.Y += epsilon
	tree.AABB.Max.Z += epsilon

	var triangleAABB mathx.BoundingBox
	tmin := &triangleAABB.Min
	tmax := &triangleAABB.Max

	indices := tm.Indices
	vertices := tm.Vertices

	for i := 0; i < len(indices); i += 3 {
		i0 := indices[i] * 3
		i1 := indices[i+1] * 3
		i2 := indices[i+2] * 3

		ax := vertices[i0]
		ay := vertices[i0+1]
		az := vertices[i0+2]
		bx := vertices[i1]
		by := vertices[i1+1]
		bz := vertices[i1+2]
		cx := vertices[i2]
		cy := vertices[i2+1]
		cz := vertices[i2+2]

		// Min
		if ax < bx {
			if ax < cx {
				tmin.X = ax
			} else {
				tmin.X = cx
			}
		} else {
			if bx < cx {
				tmin.X = bx
			} else {
				tmin.X = cx
			}
		}

		if ay < by {
			if ay < cy {
				tmin.Y = ay
			} else {
				tmin.Y = cy
			}
		} else {
			if by < cy {
				tmin.Y = by
			} else {
				tmin.Y = cy
			}
		}

		if az < bz {
			if az < cz {
				tmin.Z = az
			} else {
				tmin.Z = cz
			}
		} else {
			if bz < cz {
				tmin.Z = bz
			} else {
				tmin.Z = cz
			}
		}

		// Max
		if ax > bx {
			if ax > cx {
				tmax.X = ax
			} else {
				tmax.X = cx
			}
		} else {
			if bx > cx {
				tmax.X = bx
			} else {
				tmax.X = cx
			}
		}

		if ay > by {
			if ay > cy {
				tmax.Y = ay
			} else {
				tmax.Y = cy
			}
		} else {
			if by > cy {
				tmax.Y = by
			} else {
				tmax.Y = cy
			}
		}

		if az > bz {
			if az > cz {
				tmax.Z = az
			} else {
				tmax.Z = cz
			}
		} else {
			if bz > cz {
				tmax.Z = bz
			} else {
				tmax.Z = cz
			}
		}

		tree.Insert(&triangleAABB, i/3, 0)
	}
	tree.RemoveEmptyNodes()
}

// UpdateNormals computes surface normals for all triangles in the mesh.
func (tm *Trimesh) UpdateNormals() {
	indices := tm.Indices
	vertices := tm.Vertices
	normals := tm.Normals

	for i := 0; i < len(indices); i += 3 {
		i0 := indices[i] * 3
		i1 := indices[i+1] * 3
		i2 := indices[i+2] * 3

		_tmVa.Set(vertices[i0], vertices[i0+1], vertices[i0+2])
		_tmVb.Set(vertices[i1], vertices[i1+1], vertices[i1+2])
		_tmVc.Set(vertices[i2], vertices[i2+1], vertices[i2+2])

		ComputeNormal(&_tmVb, &_tmVa, &_tmVc, &_tmN)

		normals[i] = _tmN.X
		normals[i+1] = _tmN.Y
		normals[i+2] = _tmN.Z
	}
}

// GetNormal retrieves the surface normal of triangle i into target.
func (tm *Trimesh) GetNormal(i int, target *mathx.Vec3) *mathx.Vec3 {
	i3 := i * 3
	target.X = tm.Normals[i3]
	target.Y = tm.Normals[i3+1]
	target.Z = tm.Normals[i3+2]
	return target
}

// GetVertex retrieves vertex coordinates of vertex index i into out.
func (tm *Trimesh) GetVertex(i int, out *mathx.Vec3) *mathx.Vec3 {
	i3 := i * 3
	out.X = tm.Vertices[i3]
	out.Y = tm.Vertices[i3+1]
	out.Z = tm.Vertices[i3+2]
	return out
}

// ComputeLocalAABB calculates the enclosing AABB for all vertices in the mesh.
func (tm *Trimesh) ComputeLocalAABB(aabb *mathx.BoundingBox) {
	vertices := tm.Vertices
	minX := float32(math.Inf(1))
	minY := float32(math.Inf(1))
	minZ := float32(math.Inf(1))
	maxX := float32(math.Inf(-1))
	maxY := float32(math.Inf(-1))
	maxZ := float32(math.Inf(-1))

	for i := 0; i < len(vertices); i += 3 {
		x := vertices[i]
		y := vertices[i+1]
		z := vertices[i+2]

		if x < minX {
			minX = x
		}
		if x > maxX {
			maxX = x
		}
		if y < minY {
			minY = y
		}
		if y > maxY {
			maxY = y
		}
		if z < minZ {
			minZ = z
		}
		if z > maxZ {
			maxZ = z
		}
	}

	aabb.Min.Set(minX, minY, minZ)
	aabb.Max.Set(maxX, maxY, maxZ)
}

// ComputeNormal calculates the normalized surface normal for triangle (va, vb, vc).
func ComputeNormal(va, vb, vc, target *mathx.Vec3) {
	_tmAb.Sub(vb, va)
	_tmCb.Sub(vc, vb)
	target.Cross(&_tmCb, &_tmAb)
	if target.SquaredLength() > 0 {
		target.Normalize(target)
	}
}
