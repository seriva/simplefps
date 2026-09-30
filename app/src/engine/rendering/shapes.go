package rendering

import "math"

// Shapes contains shared geometric primitives used across passes.
type Shapes struct {
	ScreenQuad       *Mesh
	SkyBox           *Mesh
	SpotlightVolume  *Mesh
	PointLightVolume *Mesh
	BoundingBoxMesh  *Mesh
	BillboardQuad    *Mesh
}

// GlobalShapes stores the singleton geometry primitives.
var GlobalShapes = &Shapes{}

// InitShapes builds shared primitive meshes on the active GPU backend.
func InitShapes() {
	// Screen Quad
	GlobalShapes.ScreenQuad = NewMesh(
		[]float32{-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0},
		nil,
		nil,
		nil,
		[]IndexGroup{
			{Material: "none", Array: []uint32{0, 1, 2, 2, 1, 3}},
		},
	)

	// Billboard Quad
	GlobalShapes.BillboardQuad = NewMesh(
		[]float32{-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0},
		[]float32{0, 1, 1, 1, 0, 0, 1, 0},
		nil,
		nil,
		[]IndexGroup{
			{Material: "none", Array: []uint32{0, 1, 2, 2, 1, 3}},
		},
	)

	// SkyBox
	GlobalShapes.SkyBox = NewMesh(
		[]float32{
			// Front
			1, 1, 1, 1, -1, 1, -1, -1, 1, -1, 1, 1,
			// Back
			1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1,
			// Top
			1, 1, 1, -1, 1, 1, -1, 1, -1, 1, 1, -1,
			// Bottom
			1, -1, 1, 1, -1, -1, -1, -1, -1, -1, -1, 1,
			// Right
			1, 1, 1, 1, 1, -1, 1, -1, -1, 1, -1, 1,
			// Left
			-1, 1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1,
		},
		[]float32{
			0, 0, 0, 1, 1, 1, 1, 0,
			1, 0, 0, 0, 0, 1, 1, 1,
			0, 0, 0, 1, 1, 1, 1, 0,
			0, 0, 0, 1, 1, 1, 1, 0,
			1, 0, 0, 0, 0, 1, 1, 1,
			0, 0, 0, 1, 1, 1, 1, 0,
		},
		nil,
		nil,
		[]IndexGroup{
			{Material: "none", Array: []uint32{0, 1, 2, 3, 0, 2}},
			{Material: "none", Array: []uint32{4, 5, 6, 7, 4, 6}},
			{Material: "none", Array: []uint32{8, 9, 10, 11, 8, 10}},
			{Material: "none", Array: []uint32{12, 13, 14, 15, 12, 14}},
			{Material: "none", Array: []uint32{16, 17, 18, 19, 16, 18}},
			{Material: "none", Array: []uint32{20, 21, 22, 23, 20, 22}},
		},
	)

	// BoundingBox Wireframe Mesh
	bbIndices := make([]uint32, 24)
	for i := 0; i < 24; i++ {
		bbIndices[i] = uint32(i)
	}
	GlobalShapes.BoundingBoxMesh = NewMesh(
		[]float32{
			-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5,
			-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5,
			-0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
		},
		nil,
		nil,
		nil,
		[]IndexGroup{
			{Material: "none", Array: bbIndices},
		},
	)

	GlobalShapes.SpotlightVolume = buildSpotlightVolume()
	GlobalShapes.PointLightVolume = buildPointLightVolume()
}

// buildSpotlightVolume builds a unit cone: apex at origin, 32-segment base
// circle of radius 1 at z = -1. Scaled per light by radius/range.
func buildSpotlightVolume() *Mesh {
	const segments = 32
	verts := make([]float32, (segments+1)*3)
	for i := 0; i < segments; i++ {
		a := float64(i) * 2 * math.Pi / segments
		o := (i + 1) * 3
		verts[o] = float32(math.Cos(a))
		verts[o+1] = float32(math.Sin(a))
		verts[o+2] = -1
	}
	idx := make([]uint32, 0, segments*6)
	// Base fan (vertex 1 as pivot), facing -Z.
	for i := 2; i <= segments; i++ {
		next := uint32(i + 1)
		if i == segments {
			next = 1
		}
		idx = append(idx, 1, uint32(i), next)
	}
	// Side fan from apex.
	for i := 1; i <= segments; i++ {
		next := uint32(i + 1)
		if i == segments {
			next = 1
		}
		idx = append(idx, 0, next, uint32(i))
	}
	return NewMesh(verts, nil, nil, nil, []IndexGroup{{Material: "none", Array: idx}})
}

// buildPointLightVolume builds a unit UV sphere with 9 latitude rings of 8
// segments plus two poles (74 vertices). Scaled per light by size.
func buildPointLightVolume() *Mesh {
	const rings = 9
	const segments = 8
	verts := make([]float32, 0, (rings*segments+2)*3)
	verts = append(verts, 0, 1, 0)
	for r := 0; r < rings; r++ {
		theta := float64(r+1) * math.Pi / float64(rings+1)
		st := math.Sin(theta)
		ct := float32(math.Cos(theta))
		for s := 0; s < segments; s++ {
			phi := float64(s) * 2 * math.Pi / segments
			verts = append(verts, float32(st*math.Cos(phi)), ct, float32(st*math.Sin(phi)))
		}
	}
	verts = append(verts, 0, -1, 0)
	south := uint32(rings*segments + 1)

	idx := make([]uint32, 0, segments*6*rings)
	ring := func(r, s int) uint32 { return uint32(1 + r*segments + (s % segments)) }
	for s := 0; s < segments; s++ {
		idx = append(idx, 0, ring(0, s), ring(0, s+1))
	}
	for r := 0; r < rings-1; r++ {
		for s := 0; s < segments; s++ {
			a0 := ring(r, s)
			a1 := ring(r, s+1)
			b0 := ring(r+1, s)
			b1 := ring(r+1, s+1)
			idx = append(idx, a1, a0, b0, a1, b0, b1)
		}
	}
	for s := 0; s < segments; s++ {
		idx = append(idx, south, ring(rings-1, s+1), ring(rings-1, s))
	}
	return NewMesh(verts, nil, nil, nil, []IndexGroup{{Material: "none", Array: idx}})
}

// DisposeShapes frees allocated primitive meshes.
func DisposeShapes() {
	if GlobalShapes.ScreenQuad != nil {
		GlobalShapes.ScreenQuad.Dispose()
		GlobalShapes.ScreenQuad = nil
	}
	if GlobalShapes.BillboardQuad != nil {
		GlobalShapes.BillboardQuad.Dispose()
		GlobalShapes.BillboardQuad = nil
	}
	if GlobalShapes.SkyBox != nil {
		GlobalShapes.SkyBox.Dispose()
		GlobalShapes.SkyBox = nil
	}
	if GlobalShapes.BoundingBoxMesh != nil {
		GlobalShapes.BoundingBoxMesh.Dispose()
		GlobalShapes.BoundingBoxMesh = nil
	}
	if GlobalShapes.SpotlightVolume != nil {
		GlobalShapes.SpotlightVolume.Dispose()
		GlobalShapes.SpotlightVolume = nil
	}
	if GlobalShapes.PointLightVolume != nil {
		GlobalShapes.PointLightVolume.Dispose()
		GlobalShapes.PointLightVolume = nil
	}
}
