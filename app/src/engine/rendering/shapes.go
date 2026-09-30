package rendering

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
}
