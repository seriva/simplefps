//gofront:target wasm
package collision

import (
	"math"

	"../mathx"
)

type spatialHashMode int

const (
	spatialHashModeMap  spatialHashMode = 0
	spatialHashModeFlat spatialHashMode = 1
)

const (
	voxelOffset      = int32(1 << 20)
	voxelMask        = uint64((1 << 21) - 1)
	maxVoxelsPerTri  = 4096
)

func voxelKey(vx, vy, vz int32) uint64 {
	ux := uint64(vx+voxelOffset) & voxelMask
	uy := uint64(vy+voxelOffset) & voxelMask
	uz := uint64(vz+voxelOffset) & voxelMask
	return (uz << 42) | (uy << 21) | ux
}

var (
	_shInvDir mathx.Vec3
)

// spatialHash partitions triangles into discrete voxel cells.
type spatialHash struct {
	cellSize    float32
	invCellSize float32
	aabb        mathx.BoundingBox

	// Map-based storage: packed uint64 voxel coordinate -> triangle index list (internal to WASM)
	grid map[uint64][]int32

	// Flat grid storage: dense 1D slice of triangle index lists (internal to WASM)
	flatGrid [][]int32
	dimX     int32
	dimY     int32
	dimZ     int32
	minVx    int32
	minVy    int32
	minVz    int32
	maxVx    int32
	maxVy    int32
	maxVz    int32
	hasFlat  bool

	mode spatialHashMode

	// Stamp-based deduplication for zero-allocation candidate gathering
	queryStamp uint32
	lastQuery  []uint32

	// Diagnostics
	voxelCount int
	totalRefs  int
}

// rayAABBInterval tests intersection between a ray and an AABB using the Slab
// method and computes the entry and exit ray parameters (tStart, tEnd) along the
// ray segment [0, maxDist]. The bool result is false when the segment misses the box.
// Correctly guards against zero direction components to prevent 0.0 * Inf = NaN.
func rayAABBInterval(aabb *mathx.BoundingBox, origin, direction, invDir *mathx.Vec3, maxDist float32) (float32, float32, bool) {
	min := &aabb.Min
	max := &aabb.Max

	tmin := float32(0.0)
	tmax := maxDist

	// X slab
	if direction.X == 0 {
		if origin.X < min.X || origin.X > max.X {
			return 0, 0, false
		}
	} else {
		var t0, t1 float32
		if invDir.X >= 0 {
			t0 = (min.X - origin.X) * invDir.X
			t1 = (max.X - origin.X) * invDir.X
		} else {
			t0 = (max.X - origin.X) * invDir.X
			t1 = (min.X - origin.X) * invDir.X
		}
		if t0 > tmin {
			tmin = t0
		}
		if t1 < tmax {
			tmax = t1
		}
		if tmin > tmax {
			return 0, 0, false
		}
	}

	// Y slab
	if direction.Y == 0 {
		if origin.Y < min.Y || origin.Y > max.Y {
			return 0, 0, false
		}
	} else {
		var t0, t1 float32
		if invDir.Y >= 0 {
			t0 = (min.Y - origin.Y) * invDir.Y
			t1 = (max.Y - origin.Y) * invDir.Y
		} else {
			t0 = (max.Y - origin.Y) * invDir.Y
			t1 = (min.Y - origin.Y) * invDir.Y
		}
		if t0 > tmin {
			tmin = t0
		}
		if t1 < tmax {
			tmax = t1
		}
		if tmin > tmax {
			return 0, 0, false
		}
	}

	// Z slab
	if direction.Z == 0 {
		if origin.Z < min.Z || origin.Z > max.Z {
			return 0, 0, false
		}
	} else {
		var t0, t1 float32
		if invDir.Z >= 0 {
			t0 = (min.Z - origin.Z) * invDir.Z
			t1 = (max.Z - origin.Z) * invDir.Z
		} else {
			t0 = (max.Z - origin.Z) * invDir.Z
			t1 = (min.Z - origin.Z) * invDir.Z
		}
		if t0 > tmin {
			tmin = t0
		}
		if t1 < tmax {
			tmax = t1
		}
		if tmin > tmax {
			return 0, 0, false
		}
	}

	if tmax < 0 || tmin > maxDist {
		return 0, 0, false
	}

	tStart := tmin
	if tStart < 0 {
		tStart = 0
	}
	tEnd := tmax
	if tEnd > maxDist {
		tEnd = maxDist
	}

	return tStart, tEnd, true
}

// triBoxOverlap tests intersection between a triangle and an AABB using the Separating Axis Theorem (Akenine-Möller).
func triBoxOverlap(ax, ay, az, bx, by, bz, cx, cy, cz float32, boxCenterX, boxCenterY, boxCenterZ, halfSize float32) bool {
	// Translate triangle vertices to box coordinate system (box center at 0, 0, 0)
	v0x := ax - boxCenterX
	v0y := ay - boxCenterY
	v0z := az - boxCenterZ

	v1x := bx - boxCenterX
	v1y := by - boxCenterY
	v1z := bz - boxCenterZ

	v2x := cx - boxCenterX
	v2y := cy - boxCenterY
	v2z := cz - boxCenterZ

	// Compute triangle edge vectors
	e0x := v1x - v0x
	e0y := v1y - v0y
	e0z := v1z - v0z

	e1x := v2x - v1x
	e1y := v2y - v1y
	e1z := v2z - v1z

	e2x := v0x - v2x
	e2y := v0y - v2y
	e2z := v0z - v2z

	// 1. Test 9 cross-product axes: e_i x box_axes
	fe0x := float32(math.Abs(float64(e0x)))
	fe0y := float32(math.Abs(float64(e0y)))
	fe0z := float32(math.Abs(float64(e0z)))

	// Axis a00 = (0, -e0z, e0y)
	p0 := v0y*e0z - v0z*e0y
	p2 := v2y*e0z - v2z*e0y
	rad := (fe0z + fe0y) * halfSize
	if minFloat32(p0, p2) > rad || maxFloat32(p0, p2) < -rad {
		return false
	}

	// Axis a01 = (e0z, 0, -e0x)
	p0 = -v0x*e0z + v0z*e0x
	p2 = -v2x*e0z + v2z*e0x
	rad = (fe0z + fe0x) * halfSize
	if minFloat32(p0, p2) > rad || maxFloat32(p0, p2) < -rad {
		return false
	}

	// Axis a02 = (-e0y, e0x, 0)
	p0 = v0x*e0y - v0y*e0x
	p2 = v2x*e0y - v2y*e0x
	rad = (fe0y + fe0x) * halfSize
	if minFloat32(p0, p2) > rad || maxFloat32(p0, p2) < -rad {
		return false
	}

	fe1x := float32(math.Abs(float64(e1x)))
	fe1y := float32(math.Abs(float64(e1y)))
	fe1z := float32(math.Abs(float64(e1z)))

	// Axis a10 = (0, -e1z, e1y)
	p0 = v0y*e1z - v0z*e1y
	p1 := v1y*e1z - v1z*e1y
	rad = (fe1z + fe1y) * halfSize
	if minFloat32(p0, p1) > rad || maxFloat32(p0, p1) < -rad {
		return false
	}

	// Axis a11 = (e1z, 0, -e1x)
	p0 = -v0x*e1z + v0z*e1x
	p1 = -v1x*e1z + v1z*e1x
	rad = (fe1z + fe1x) * halfSize
	if minFloat32(p0, p1) > rad || maxFloat32(p0, p1) < -rad {
		return false
	}

	// Axis a12 = (-e1y, e1x, 0)
	p0 = v0x*e1y - v0y*e1x
	p1 = v1x*e1y - v1y*e1x
	rad = (fe1y + fe1x) * halfSize
	if minFloat32(p0, p1) > rad || maxFloat32(p0, p1) < -rad {
		return false
	}

	fe2x := float32(math.Abs(float64(e2x)))
	fe2y := float32(math.Abs(float64(e2y)))
	fe2z := float32(math.Abs(float64(e2z)))

	// Axis a20 = (0, -e2z, e2y)
	p0 = v0y*e2z - v0z*e2y
	p1 = v1y*e2z - v1z*e2y
	rad = (fe2z + fe2y) * halfSize
	if minFloat32(p0, p1) > rad || maxFloat32(p0, p1) < -rad {
		return false
	}

	// Axis a21 = (e2z, 0, -e2x)
	p0 = -v0x*e2z + v0z*e2x
	p1 = -v1x*e2z + v1z*e2x
	rad = (fe2z + fe2x) * halfSize
	if minFloat32(p0, p1) > rad || maxFloat32(p0, p1) < -rad {
		return false
	}

	// Axis a22 = (-e2y, e2x, 0)
	p1 = v1x*e2y - v1y*e2x
	p2 = v2x*e2y - v2y*e2x
	rad = (fe2y + fe2x) * halfSize
	if minFloat32(p1, p2) > rad || maxFloat32(p1, p2) < -rad {
		return false
	}

	// 2. Test box face normals (X, Y, Z AABB overlap)
	if min3(v0x, v1x, v2x) > halfSize || max3(v0x, v1x, v2x) < -halfSize {
		return false
	}
	if min3(v0y, v1y, v2y) > halfSize || max3(v0y, v1y, v2y) < -halfSize {
		return false
	}
	if min3(v0z, v1z, v2z) > halfSize || max3(v0z, v1z, v2z) < -halfSize {
		return false
	}

	// 3. Test triangle normal plane
	nx := e0y*e1z - e0z*e1y
	ny := e0z*e1x - e0x*e1z
	nz := e0x*e1y - e0y*e1x

	d := -(nx*v0x + ny*v0y + nz*v0z)
	rad = (float32(math.Abs(float64(nx))) + float32(math.Abs(float64(ny))) + float32(math.Abs(float64(nz)))) * halfSize
	if d > rad || d < -rad {
		return false
	}

	return true
}

func minFloat32(a, b float32) float32 {
	if a < b {
		return a
	}
	return b
}

func maxFloat32(a, b float32) float32 {
	if a > b {
		return a
	}
	return b
}

func min3(a, b, c float32) float32 {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	return m
}

func max3(a, b, c float32) float32 {
	m := a
	if b > m {
		m = b
	}
	if c > m {
		m = c
	}
	return m
}

func min4(a, b, c, d float32) float32 {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	if d < m {
		m = d
	}
	return m
}

func max4(a, b, c, d float32) float32 {
	m := a
	if b > m {
		m = b
	}
	if c > m {
		m = c
	}
	if d > m {
		m = d
	}
	return m
}

// newSpatialHash constructs a spatial voxel hash partitioning the given triangles.
func newSpatialHash(vertices []float32, indices []int32, aabb *mathx.BoundingBox, cellSize float32) *spatialHash {
	numTriangles := len(indices) / 3
	if cellSize <= 0 {
		// Automatically select cell size based on average triangle dimensions
		if numTriangles > 0 {
			var sumDim float32
			for i := 0; i < numTriangles; i++ {
				i0 := indices[i*3] * 3
				i1 := indices[i*3+1] * 3
				i2 := indices[i*3+2] * 3

				ax, ay, az := vertices[i0], vertices[i0+1], vertices[i0+2]
				bx, by, bz := vertices[i1], vertices[i1+1], vertices[i1+2]
				cx, cy, cz := vertices[i2], vertices[i2+1], vertices[i2+2]

				tminX := ax
				if bx < tminX {
					tminX = bx
				}
				if cx < tminX {
					tminX = cx
				}
				tmaxX := ax
				if bx > tmaxX {
					tmaxX = bx
				}
				if cx > tmaxX {
					tmaxX = cx
				}

				tminY := ay
				if by < tminY {
					tminY = by
				}
				if cy < tminY {
					tminY = cy
				}
				tmaxY := ay
				if by > tmaxY {
					tmaxY = by
				}
				if cy > tmaxY {
					tmaxY = cy
				}

				tminZ := az
				if bz < tminZ {
					tminZ = bz
				}
				if cz < tminZ {
					tminZ = cz
				}
				tmaxZ := az
				if bz > tmaxZ {
					tmaxZ = bz
				}
				if cz > tmaxZ {
					tmaxZ = cz
				}

				dx := tmaxX - tminX
				dy := tmaxY - tminY
				dz := tmaxZ - tminZ

				maxD := dx
				if dy > maxD {
					maxD = dy
				}
				if dz > maxD {
					maxD = dz
				}
				sumDim += maxD
			}
			cellSize = sumDim / float32(numTriangles)
		}
		if cellSize <= 0.001 {
			cellSize = 1.0
		}
	}

	sh := &spatialHash{
		cellSize:    cellSize,
		invCellSize: 1.0 / cellSize,
		grid:        make(map[uint64][]int32),
		mode:        spatialHashModeMap,
		lastQuery:   make([]uint32, numTriangles),
	}

	if aabb != nil {
		sh.aabb.Copy(aabb)
		epsilon := float32(0.001)
		sh.aabb.Min.X -= epsilon
		sh.aabb.Min.Y -= epsilon
		sh.aabb.Min.Z -= epsilon
		sh.aabb.Max.X += epsilon
		sh.aabb.Max.Y += epsilon
		sh.aabb.Max.Z += epsilon
	}

	if numTriangles == 0 {
		return sh
	}

	first := true
	totalRefs := 0

	for i := 0; i < numTriangles; i++ {
		i0 := indices[i*3] * 3
		i1 := indices[i*3+1] * 3
		i2 := indices[i*3+2] * 3

		ax, ay, az := vertices[i0], vertices[i0+1], vertices[i0+2]
		bx, by, bz := vertices[i1], vertices[i1+1], vertices[i1+2]
		cx, cy, cz := vertices[i2], vertices[i2+1], vertices[i2+2]

		tminX := ax
		if bx < tminX {
			tminX = bx
		}
		if cx < tminX {
			tminX = cx
		}
		tmaxX := ax
		if bx > tmaxX {
			tmaxX = bx
		}
		if cx > tmaxX {
			tmaxX = cx
		}

		tminY := ay
		if by < tminY {
			tminY = by
		}
		if cy < tminY {
			tminY = cy
		}
		tmaxY := ay
		if by > tmaxY {
			tmaxY = by
		}
		if cy > tmaxY {
			tmaxY = cy
		}

		tminZ := az
		if bz < tminZ {
			tminZ = bz
		}
		if cz < tminZ {
			tminZ = cz
		}
		tmaxZ := az
		if bz > tmaxZ {
			tmaxZ = bz
		}
		if cz > tmaxZ {
			tmaxZ = cz
		}

		minVx := int32(math.Floor(float64(tminX * sh.invCellSize)))
		maxVx := int32(math.Floor(float64(tmaxX * sh.invCellSize)))
		minVy := int32(math.Floor(float64(tminY * sh.invCellSize)))
		maxVy := int32(math.Floor(float64(tmaxY * sh.invCellSize)))
		minVz := int32(math.Floor(float64(tminZ * sh.invCellSize)))
		maxVz := int32(math.Floor(float64(tmaxZ * sh.invCellSize)))

		if first {
			sh.minVx, sh.maxVx = minVx, maxVx
			sh.minVy, sh.maxVy = minVy, maxVy
			sh.minVz, sh.maxVz = minVz, maxVz
			first = false
		} else {
			if minVx < sh.minVx {
				sh.minVx = minVx
			}
			if maxVx > sh.maxVx {
				sh.maxVx = maxVx
			}
			if minVy < sh.minVy {
				sh.minVy = minVy
			}
			if maxVy > sh.maxVy {
				sh.maxVy = maxVy
			}
			if minVz < sh.minVz {
				sh.minVz = minVz
			}
			if maxVz > sh.maxVz {
				sh.maxVz = maxVz
			}
		}

		// Compute triangle normal
		e0x := bx - ax
		e0y := by - ay
		e0z := bz - az
		e1x := cx - ax
		e1y := cy - ay
		e1z := cz - az

		nx := e0y*e1z - e0z*e1y
		ny := e0z*e1x - e0x*e1z
		nz := e0x*e1y - e0y*e1x

		anx := float32(math.Abs(float64(nx)))
		any := float32(math.Abs(float64(ny)))
		anz := float32(math.Abs(float64(nz)))

		halfSize := sh.cellSize * 0.5
		triRefs := 0

		if any >= anx && any >= anz && any > 1e-7 {
			// Dominant axis: Y (mostly horizontal)
			for vz := minVz; vz <= maxVz && triRefs < maxVoxelsPerTri; vz++ {
				for vx := minVx; vx <= maxVx && triRefs < maxVoxelsPerTri; vx++ {
					x0 := float32(vx) * sh.cellSize
					x1 := x0 + sh.cellSize
					z0 := float32(vz) * sh.cellSize
					z1 := z0 + sh.cellSize

					y00 := ay - (nx*(x0-ax)+nz*(z0-az))/ny
					y10 := ay - (nx*(x1-ax)+nz*(z0-az))/ny
					y01 := ay - (nx*(x0-ax)+nz*(z1-az))/ny
					y11 := ay - (nx*(x1-ax)+nz*(z1-az))/ny

					cyMin := min4(y00, y10, y01, y11)
					cyMax := max4(y00, y10, y01, y11)
					if cyMin > tmaxY || cyMax < tminY {
						continue
					}
					if cyMin < tminY {
						cyMin = tminY
					}
					if cyMax > tmaxY {
						cyMax = tmaxY
					}

					subMinVy := int32(math.Floor(float64(cyMin * sh.invCellSize)))
					subMaxVy := int32(math.Floor(float64(cyMax * sh.invCellSize)))
					if subMinVy < minVy {
						subMinVy = minVy
					}
					if subMaxVy > maxVy {
						subMaxVy = maxVy
					}

					for vy := subMinVy; vy <= subMaxVy && triRefs < maxVoxelsPerTri; vy++ {
						boxCenterX := (float32(vx) + 0.5) * sh.cellSize
						boxCenterY := (float32(vy) + 0.5) * sh.cellSize
						boxCenterZ := (float32(vz) + 0.5) * sh.cellSize

						if triBoxOverlap(ax, ay, az, bx, by, bz, cx, cy, cz, boxCenterX, boxCenterY, boxCenterZ, halfSize) {
							k := voxelKey(vx, vy, vz)
							sh.grid[k] = append(sh.grid[k], int32(i))
							totalRefs++
							triRefs++
						}
					}
				}
			}
		} else if anx >= any && anx >= anz && anx > 1e-7 {
			// Dominant axis: X (mostly vertical along YZ)
			for vz := minVz; vz <= maxVz && triRefs < maxVoxelsPerTri; vz++ {
				for vy := minVy; vy <= maxVy && triRefs < maxVoxelsPerTri; vy++ {
					y0 := float32(vy) * sh.cellSize
					y1 := y0 + sh.cellSize
					z0 := float32(vz) * sh.cellSize
					z1 := z0 + sh.cellSize

					x00 := ax - (ny*(y0-ay)+nz*(z0-az))/nx
					x10 := ax - (ny*(y1-ay)+nz*(z0-az))/nx
					x01 := ax - (ny*(y0-ay)+nz*(z1-az))/nx
					x11 := ax - (ny*(y1-ay)+nz*(z1-az))/nx

					cxMin := min4(x00, x10, x01, x11)
					cxMax := max4(x00, x10, x01, x11)
					if cxMin > tmaxX || cxMax < tminX {
						continue
					}
					if cxMin < tminX {
						cxMin = tminX
					}
					if cxMax > tmaxX {
						cxMax = tmaxX
					}

					subMinVx := int32(math.Floor(float64(cxMin * sh.invCellSize)))
					subMaxVx := int32(math.Floor(float64(cxMax * sh.invCellSize)))
					if subMinVx < minVx {
						subMinVx = minVx
					}
					if subMaxVx > maxVx {
						subMaxVx = maxVx
					}

					for vx := subMinVx; vx <= subMaxVx && triRefs < maxVoxelsPerTri; vx++ {
						boxCenterX := (float32(vx) + 0.5) * sh.cellSize
						boxCenterY := (float32(vy) + 0.5) * sh.cellSize
						boxCenterZ := (float32(vz) + 0.5) * sh.cellSize

						if triBoxOverlap(ax, ay, az, bx, by, bz, cx, cy, cz, boxCenterX, boxCenterY, boxCenterZ, halfSize) {
							k := voxelKey(vx, vy, vz)
							sh.grid[k] = append(sh.grid[k], int32(i))
							totalRefs++
							triRefs++
						}
					}
				}
			}
		} else if anz >= anx && anz >= any && anz > 1e-7 {
			// Dominant axis: Z (mostly vertical along XY)
			for vy := minVy; vy <= maxVy && triRefs < maxVoxelsPerTri; vy++ {
				for vx := minVx; vx <= maxVx && triRefs < maxVoxelsPerTri; vx++ {
					x0 := float32(vx) * sh.cellSize
					x1 := x0 + sh.cellSize
					y0 := float32(vy) * sh.cellSize
					y1 := y0 + sh.cellSize

					z00 := az - (nx*(x0-ax)+ny*(y0-ay))/nz
					z10 := az - (nx*(x1-ax)+ny*(y0-ay))/nz
					z01 := az - (nx*(x0-ax)+ny*(y1-ay))/nz
					z11 := az - (nx*(x1-ax)+ny*(y1-ay))/nz

					czMin := min4(z00, z10, z01, z11)
					czMax := max4(z00, z10, z01, z11)
					if czMin > tmaxZ || czMax < tminZ {
						continue
					}
					if czMin < tminZ {
						czMin = tminZ
					}
					if czMax > tmaxZ {
						czMax = tmaxZ
					}

					subMinVz := int32(math.Floor(float64(czMin * sh.invCellSize)))
					subMaxVz := int32(math.Floor(float64(czMax * sh.invCellSize)))
					if subMinVz < minVz {
						subMinVz = minVz
					}
					if subMaxVz > maxVz {
						subMaxVz = maxVz
					}

					for vz := subMinVz; vz <= subMaxVz && triRefs < maxVoxelsPerTri; vz++ {
						boxCenterX := (float32(vx) + 0.5) * sh.cellSize
						boxCenterY := (float32(vy) + 0.5) * sh.cellSize
						boxCenterZ := (float32(vz) + 0.5) * sh.cellSize

						if triBoxOverlap(ax, ay, az, bx, by, bz, cx, cy, cz, boxCenterX, boxCenterY, boxCenterZ, halfSize) {
							k := voxelKey(vx, vy, vz)
							sh.grid[k] = append(sh.grid[k], int32(i))
							totalRefs++
							triRefs++
						}
					}
				}
			}
		} else {
			// Degenerate triangle fallback
			for vz := minVz; vz <= maxVz && triRefs < maxVoxelsPerTri; vz++ {
				for vy := minVy; vy <= maxVy && triRefs < maxVoxelsPerTri; vy++ {
					for vx := minVx; vx <= maxVx && triRefs < maxVoxelsPerTri; vx++ {
						k := voxelKey(vx, vy, vz)
						sh.grid[k] = append(sh.grid[k], int32(i))
						totalRefs++
						triRefs++
					}
				}
			}
		}
	}

	sh.voxelCount = len(sh.grid)
	sh.totalRefs = totalRefs

	// Prevent int32 overflow in dimension calculations
	dimX := int64(sh.maxVx) - int64(sh.minVx) + 1
	dimY := int64(sh.maxVy) - int64(sh.minVy) + 1
	dimZ := int64(sh.maxVz) - int64(sh.minVz) + 1

	if dimX > 0 && dimY > 0 && dimZ > 0 && dimX <= 5000 && dimY <= 5000 && dimZ <= 5000 {
		sh.dimX = int32(dimX)
		sh.dimY = int32(dimY)
		sh.dimZ = int32(dimZ)

		totalFlatCells := dimX * dimY * dimZ
		// Density guard: check occupancy density before allocating flatGrid:
		// If total cells <= 262,144 and density >= 10%, instantiate flatGrid.
		// Otherwise, skip flatGrid and rely on sh.grid map to avoid multi-megabyte sparse memory waste.
		density := float64(len(sh.grid)) / float64(totalFlatCells)
		if totalFlatCells > 0 && totalFlatCells <= 262144 && density >= 0.10 {
			flatCells := int(totalFlatCells)
			sh.flatGrid = make([][]int32, flatCells)
			sh.hasFlat = true

			dimXY := sh.dimX * sh.dimY
			for k, list := range sh.grid {
				vx := int32(k&voxelMask) - voxelOffset
				vy := int32((k>>21)&voxelMask) - voxelOffset
				vz := int32((k>>42)&voxelMask) - voxelOffset
				idx := (vz-sh.minVz)*dimXY + (vy-sh.minVy)*sh.dimX + (vx - sh.minVx)
				sh.flatGrid[idx] = list
			}
		}
	}

	return sh
}

// getVoxelTrisMap retrieves triangle indices for a voxel from the map.
func (h *spatialHash) getVoxelTrisMap(vx, vy, vz int32) []int32 {
	return h.grid[voxelKey(vx, vy, vz)]
}

// getVoxelTrisFlat retrieves triangle indices for a voxel from flatGrid.
func (h *spatialHash) getVoxelTrisFlat(vx, vy, vz int32) []int32 {
	if vx < h.minVx || vx > h.maxVx || vy < h.minVy || vy > h.maxVy || vz < h.minVz || vz > h.maxVz {
		return nil
	}
	idx := (vz-h.minVz)*(h.dimX*h.dimY) + (vy-h.minVy)*h.dimX + (vx - h.minVx)
	return h.flatGrid[idx]
}

// getVoxelTris returns triangle indices for a voxel based on the active mode.
func (h *spatialHash) getVoxelTris(vx, vy, vz int32) []int32 {
	if h.mode == spatialHashModeFlat && h.hasFlat {
		return h.getVoxelTrisFlat(vx, vy, vz)
	}
	return h.getVoxelTrisMap(vx, vy, vz)
}

// rayQueryLocal traces the ray through the voxel grid using 3D DDA (Amanatides-Woo)
// and writes deduplicated candidate triangle indices into out. Returns the count.
func (h *spatialHash) rayQueryLocal(origin, direction *mathx.Vec3, maxDist float32, out []int, invDir *mathx.Vec3) int {
	inv := invDir
	if inv == nil {
		_shInvDir.X = 1.0 / direction.X
		_shInvDir.Y = 1.0 / direction.Y
		_shInvDir.Z = 1.0 / direction.Z
		inv = &_shInvDir
	}

	tStart, tEnd, hit := rayAABBInterval(&h.aabb, origin, direction, inv, maxDist)
	if !hit {
		return 0
	}

	xStart := origin.X + direction.X*tStart
	yStart := origin.Y + direction.Y*tStart
	zStart := origin.Z + direction.Z*tStart

	if xStart < h.aabb.Min.X {
		xStart = h.aabb.Min.X
	} else if xStart > h.aabb.Max.X {
		xStart = h.aabb.Max.X
	}
	if yStart < h.aabb.Min.Y {
		yStart = h.aabb.Min.Y
	} else if yStart > h.aabb.Max.Y {
		yStart = h.aabb.Max.Y
	}
	if zStart < h.aabb.Min.Z {
		zStart = h.aabb.Min.Z
	} else if zStart > h.aabb.Max.Z {
		zStart = h.aabb.Max.Z
	}

	xEnd := origin.X + direction.X*tEnd
	yEnd := origin.Y + direction.Y*tEnd
	zEnd := origin.Z + direction.Z*tEnd

	if xEnd < h.aabb.Min.X {
		xEnd = h.aabb.Min.X
	} else if xEnd > h.aabb.Max.X {
		xEnd = h.aabb.Max.X
	}
	if yEnd < h.aabb.Min.Y {
		yEnd = h.aabb.Min.Y
	} else if yEnd > h.aabb.Max.Y {
		yEnd = h.aabb.Max.Y
	}
	if zEnd < h.aabb.Min.Z {
		zEnd = h.aabb.Min.Z
	} else if zEnd > h.aabb.Max.Z {
		zEnd = h.aabb.Max.Z
	}

	vx := int32(math.Floor(float64(xStart * h.invCellSize)))
	vy := int32(math.Floor(float64(yStart * h.invCellSize)))
	vz := int32(math.Floor(float64(zStart * h.invCellSize)))

	endVx := int32(math.Floor(float64(xEnd * h.invCellSize)))
	endVy := int32(math.Floor(float64(yEnd * h.invCellSize)))
	endVz := int32(math.Floor(float64(zEnd * h.invCellSize)))

	var stepX, stepY, stepZ int32
	var tMaxX, tMaxY, tMaxZ float32
	var tDeltaX, tDeltaY, tDeltaZ float32

	if direction.X > 0 {
		stepX = 1
		nextBoundaryX := float32(vx+1) * h.cellSize
		tMaxX = tStart + (nextBoundaryX-xStart)*inv.X
		tDeltaX = h.cellSize * inv.X
	} else if direction.X < 0 {
		stepX = -1
		nextBoundaryX := float32(vx) * h.cellSize
		tMaxX = tStart + (nextBoundaryX-xStart)*inv.X
		tDeltaX = -h.cellSize * inv.X
	} else {
		stepX = 0
		tMaxX = float32(math.Inf(1))
		tDeltaX = float32(math.Inf(1))
	}

	if direction.Y > 0 {
		stepY = 1
		nextBoundaryY := float32(vy+1) * h.cellSize
		tMaxY = tStart + (nextBoundaryY-yStart)*inv.Y
		tDeltaY = h.cellSize * inv.Y
	} else if direction.Y < 0 {
		stepY = -1
		nextBoundaryY := float32(vy) * h.cellSize
		tMaxY = tStart + (nextBoundaryY-yStart)*inv.Y
		tDeltaY = -h.cellSize * inv.Y
	} else {
		stepY = 0
		tMaxY = float32(math.Inf(1))
		tDeltaY = float32(math.Inf(1))
	}

	if direction.Z > 0 {
		stepZ = 1
		nextBoundaryZ := float32(vz+1) * h.cellSize
		tMaxZ = tStart + (nextBoundaryZ-zStart)*inv.Z
		tDeltaZ = h.cellSize * inv.Z
	} else if direction.Z < 0 {
		stepZ = -1
		nextBoundaryZ := float32(vz) * h.cellSize
		tMaxZ = tStart + (nextBoundaryZ-zStart)*inv.Z
		tDeltaZ = -h.cellSize * inv.Z
	} else {
		stepZ = 0
		tMaxZ = float32(math.Inf(1))
		tDeltaZ = float32(math.Inf(1))
	}

	h.queryStamp++
	if h.queryStamp == 0 {
		h.queryStamp = 1
		for i := range h.lastQuery {
			h.lastQuery[i] = 0
		}
	}
	currentStamp := h.queryStamp

	count := 0
	limit := len(out)

	dx := endVx - vx
	if dx < 0 {
		dx = -dx
	}
	dy := endVy - vy
	if dy < 0 {
		dy = -dy
	}
	dz := endVz - vz
	if dz < 0 {
		dz = -dz
	}
	maxSteps := int(dx+dy+dz) + 2

	for step := 0; step < maxSteps; step++ {
		tris := h.getVoxelTris(vx, vy, vz)
		for i := 0; i < len(tris) && count < limit; i++ {
			tri := tris[i]
			if h.lastQuery[tri] != currentStamp {
				h.lastQuery[tri] = currentStamp
				out[count] = int(tri)
				count++
			}
		}

		if count >= limit {
			break
		}

		if vx == endVx && vy == endVy && vz == endVz {
			break
		}

		if tMaxX < tMaxY {
			if tMaxX < tMaxZ {
				if tMaxX > tEnd {
					break
				}
				vx += stepX
				tMaxX += tDeltaX
			} else {
				if tMaxZ > tEnd {
					break
				}
				vz += stepZ
				tMaxZ += tDeltaZ
			}
		} else {
			if tMaxY < tMaxZ {
				if tMaxY > tEnd {
					break
				}
				vy += stepY
				tMaxY += tDeltaY
			} else {
				if tMaxZ > tEnd {
					break
				}
				vz += stepZ
				tMaxZ += tDeltaZ
			}
		}
	}

	return count
}

// stats returns total voxel count in map, total triangle references, and total flat cells.
func (h *spatialHash) stats() (voxels int, totalRefs int, flatCells int) {
	voxels = len(h.grid)
	totalRefs = h.totalRefs
	if h.hasFlat {
		flatCells = len(h.flatGrid)
	}
	return
}

// aabbQuery gathers candidate triangles overlapping the query bounding box.
func (h *spatialHash) aabbQuery(queryAABB *mathx.BoundingBox, out []int) int {
	minVx := int32(math.Floor(float64(queryAABB.Min.X * h.invCellSize)))
	maxVx := int32(math.Floor(float64(queryAABB.Max.X * h.invCellSize)))
	minVy := int32(math.Floor(float64(queryAABB.Min.Y * h.invCellSize)))
	maxVy := int32(math.Floor(float64(queryAABB.Max.Y * h.invCellSize)))
	minVz := int32(math.Floor(float64(queryAABB.Min.Z * h.invCellSize)))
	maxVz := int32(math.Floor(float64(queryAABB.Max.Z * h.invCellSize)))

	h.queryStamp++
	if h.queryStamp == 0 {
		h.queryStamp = 1
		for i := range h.lastQuery {
			h.lastQuery[i] = 0
		}
	}
	currentStamp := h.queryStamp
	count := 0
	limit := len(out)

	for vz := minVz; vz <= maxVz && count < limit; vz++ {
		for vy := minVy; vy <= maxVy && count < limit; vy++ {
			for vx := minVx; vx <= maxVx && count < limit; vx++ {
				tris := h.getVoxelTris(vx, vy, vz)
				for i := 0; i < len(tris) && count < limit; i++ {
					tri := tris[i]
					if h.lastQuery[tri] != currentStamp {
						h.lastQuery[tri] = currentStamp
						out[count] = int(tri)
						count++
					}
				}
			}
		}
	}

	return count
}
