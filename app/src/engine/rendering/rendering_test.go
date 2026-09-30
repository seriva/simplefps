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

	mesh := NewMesh(verts, nil, nil, nil, indices)
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

	sm := NewSkinnedMesh(verts, nil, nil, indices, joints, weights)
	if sm == nil {
		t.Fatal("Expected SkinnedMesh instance")
	}
	if len(sm.GPUJointIndices) != 8 || len(sm.GPUJointWeights) != 8 {
		t.Errorf("Unexpected joint buffer lengths: indices=%d weights=%d", len(sm.GPUJointIndices), len(sm.GPUJointWeights))
	}
}

func TestMaterialProperties(t *testing.T) {
	mat := NewMaterial("brick")
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
}

func TestShapesInitialization(t *testing.T) {
	InitShapes()
	if GlobalShapes.ScreenQuad == nil {
		t.Fatal("Expected ScreenQuad to be initialized")
	}
	if GlobalShapes.ScreenQuad.TriangleCount != 2 {
		t.Errorf("Expected ScreenQuad to have 2 triangles, got %d", GlobalShapes.ScreenQuad.TriangleCount)
	}
	if GlobalShapes.SkyBox == nil {
		t.Fatal("Expected SkyBox to be initialized")
	}
	if GlobalShapes.SkyBox.TriangleCount != 12 {
		t.Errorf("Expected SkyBox to have 12 triangles, got %d", GlobalShapes.SkyBox.TriangleCount)
	}
}

func TestRenderStats(t *testing.T) {
	ActiveRenderStats.MeshCount = 10
	ActiveRenderStats.LightCount = 5
	ActiveRenderStats.TriangleCount = 1000
	ClearRenderStats()
	if ActiveRenderStats.MeshCount != 0 || ActiveRenderStats.LightCount != 0 || ActiveRenderStats.TriangleCount != 0 {
		t.Errorf("Expected reset stats, got %+v", ActiveRenderStats)
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
