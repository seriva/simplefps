package rendering

import (
	"testing"
)

func TestMeshCreationAndBoundingBox(t *testing.T) {
	verts := []float32{
		-1.0, -1.0, -1.0,
		1.0, 1.0, 1.0,
	}
	indices := []IndexGroup{
		{Material: "default", Array: []uint32{0, 1, 0}},
	}

	mesh := NewMesh(nil, verts, nil, nil, nil, indices)
	if mesh.BoundingBox == nil {
		t.Fatal("Expected bounding box to be computed")
	}
	if mesh.BoundingBox.Min.X != -1.0 || mesh.BoundingBox.Max.X != 1.0 {
		t.Errorf("Unexpected bounding box bounds: Min=%v Max=%v", mesh.BoundingBox.Min, mesh.BoundingBox.Max)
	}
	if mesh.TriangleCount != 1 {
		t.Errorf("Expected triangle count 1, got %d", mesh.TriangleCount)
	}
}

func TestSkinnedMeshCreation(t *testing.T) {
	verts := []float32{
		0.0, 0.0, 0.0,
		1.0, 1.0, 1.0,
	}
	indices := []IndexGroup{
		{Material: "skin", Array: []uint32{0, 1, 0}},
	}
	joints := []uint8{0, 0, 0, 0, 1, 0, 0, 0}
	weights := []float32{1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0}

	sm := NewSkinnedMesh(nil, verts, nil, nil, indices, joints, weights)
	if sm == nil {
		t.Fatal("Expected SkinnedMesh instance")
	}
	if len(sm.GPUJointIndices) != 8 || len(sm.GPUJointWeights) != 8 {
		t.Errorf("Unexpected joint buffer lengths: indices=%d weights=%d", len(sm.GPUJointIndices), len(sm.GPUJointWeights))
	}
}

func TestMaterialProperties(t *testing.T) {
	mat := NewMaterial(nil, "brick")
	if mat.Name != "brick" {
		t.Errorf("Expected material name 'brick', got '%s'", mat.Name)
	}
	if mat.GeomType != 1 {
		t.Errorf("Expected GeomType 1, got %d", mat.GeomType)
	}
	if mat.ReflectionStrength != 1.0 {
		t.Errorf("Expected ReflectionStrength 1.0, got %f", mat.ReflectionStrength)
	}
}

func TestRendererCreation(t *testing.T) {
	r := NewRenderer(nil)
	if r.Width != 0 || r.Height != 0 {
		t.Errorf("Expected 0x0 initial dimensions, got %dx%d", r.Width, r.Height)
	}
	if r.Shaders == nil || r.Shapes == nil || r.Stats == nil || r.Debug == nil {
		t.Error("NewRenderer must allocate Shaders, Shapes, Stats and Debug")
	}
}

func TestShapesInitialization(t *testing.T) {
	r := NewRenderer(nil)
	r.InitShapes()
	shapes := r.Shapes
	if shapes.ScreenQuad == nil {
		t.Fatal("Expected ScreenQuad to be initialized")
	}
	if shapes.ScreenQuad.TriangleCount != 2 {
		t.Errorf("Expected ScreenQuad to have 2 triangles, got %d", shapes.ScreenQuad.TriangleCount)
	}
	if shapes.SkyBox == nil {
		t.Fatal("Expected SkyBox to be initialized")
	}
	if shapes.SkyBox.TriangleCount != 12 {
		t.Errorf("Expected SkyBox to have 12 triangles, got %d", shapes.SkyBox.TriangleCount)
	}
	// Cone: 32-segment base fan (31 tris) + 32 side tris
	if shapes.SpotlightVolume == nil || shapes.SpotlightVolume.TriangleCount != 63 {
		t.Errorf("Expected SpotlightVolume with 63 triangles, got %+v", shapes.SpotlightVolume)
	}
	if len(shapes.SpotlightVolume.Vertices) != 33*3 {
		t.Errorf("Expected 33 cone vertices, got %d", len(shapes.SpotlightVolume.Vertices)/3)
	}
	// Sphere: 2 caps × 8 + 8 bands × 16
	if shapes.PointLightVolume == nil || shapes.PointLightVolume.TriangleCount != 144 {
		t.Errorf("Expected PointLightVolume with 144 triangles, got %+v", shapes.PointLightVolume)
	}
	if len(shapes.PointLightVolume.Vertices) != 74*3 {
		t.Errorf("Expected 74 sphere vertices, got %d", len(shapes.PointLightVolume.Vertices)/3)
	}
	// First ring vertex matches the hand-authored JS mesh (0.309, 0.9511, 0).
	v := shapes.PointLightVolume.Vertices
	if v[3] < 0.3085 || v[3] > 0.3095 || v[4] < 0.951 || v[4] > 0.9512 {
		t.Errorf("Unexpected first ring vertex %v %v %v", v[3], v[4], v[5])
	}
}

func TestRenderStats(t *testing.T) {
	r := NewRenderer(nil)
	r.Stats.MeshCount = 10
	r.Stats.LightCount = 5
	r.Stats.TriangleCount = 1000
	r.Stats.Reset()
	if r.Stats.MeshCount != 0 || r.Stats.LightCount != 0 || r.Stats.TriangleCount != 0 {
		t.Errorf("Expected reset stats, got %+v", r.Stats)
	}
}

func TestRenderResetsStats(t *testing.T) {
	_, r := newMockRenderer(8, 8, false, false)
	r.Stats.MeshCount = 3
	r.Render(newTestCamera(), nil, defaultRenderOptions(false), 0)
	if r.Stats.MeshCount != 0 {
		t.Errorf("Render must reset Stats at frame start, got MeshCount=%d", r.Stats.MeshCount)
	}
}

func TestDisposeReleasesShapes(t *testing.T) {
	mb, r := newMockRenderer(8, 8, false, false)
	r.Dispose()
	if r.Shapes.ScreenQuad != nil || r.Shapes.SkyBox != nil {
		t.Error("Renderer.Dispose must release the shared shapes")
	}
	if mb.Count("DeleteBuffer") == 0 {
		t.Error("disposing shapes must delete their GPU buffers")
	}
}


func TestRendererWithNilBackend(t *testing.T) {
    r := NewRenderer(nil)
    if r == nil {
        t.Fatal("Expected Renderer instance even with nil backend")
    }
    if r.Backend != nil {
        t.Error("Expected Backend to be nil")
    }
}
