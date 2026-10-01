package rendering

import "testing"

func TestWithCullOffBuildsTwin(t *testing.T) {
	if stateOpaque.CullOff == nil || stateOpaque.CullOff.Cull {
		t.Fatal("stateOpaque must carry a CullOff twin with culling disabled")
	}
	tw := stateOpaque.CullOff
	if tw.Blend != stateOpaque.Blend || tw.DepthTest != stateOpaque.DepthTest || tw.DepthWrite != stateOpaque.DepthWrite ||
		tw.DepthFunc != stateOpaque.DepthFunc || tw.ColorMask != stateOpaque.ColorMask || tw.PolyOffset != stateOpaque.PolyOffset {
		t.Error("CullOff twin must match its parent in every field except Cull")
	}
	if tw.CullOff != nil {
		t.Error("the twin itself must not carry another twin")
	}
	if stateTransparent.CullOff != nil || stateShadow.CullOff != nil {
		t.Error("presets that already disable culling must not get a twin")
	}
}

func TestApplyStateNilIsIgnored(t *testing.T) {
	mb := newMockBackend(4, 4, false)
	mb.ApplyState(stateOpaque)
	mb.ApplyState(nil)
	if mb.State() != stateOpaque || mb.Count("ApplyState") != 1 {
		t.Error("ApplyState(nil) must be a no-op")
	}
}

// Double-sided groups draw with the pass state's CullOff twin and the pass
// state is restored on the way out, so the next entity sees the preset again.
func TestRenderIndicesTogglesCullForDoubleSided(t *testing.T) {
	mb, r := newMockRenderer(8, 8, false, false)
	verts := []float32{0, 0, 0, 1, 0, 0, 0, 1, 0}
	mesh := NewMesh(mb, verts, nil, nil, nil, []IndexGroup{
		{Material: "single", Array: []uint32{0, 1, 2}},
		{Material: "double", Array: []uint32{0, 1, 2}},
		{Material: "single2", Array: []uint32{0, 1, 2}},
	})
	mesh.MaterialLookup["single"] = NewMaterial(mb, "single")
	double := NewMaterial(mb, "double")
	double.DoubleSided = true
	mesh.MaterialLookup["double"] = double
	mesh.MaterialLookup["single2"] = NewMaterial(mb, "single2")

	mb.ApplyState(stateOpaque)
	mb.Reset()
	mesh.RenderIndices(true, TopoTriangles, ModeAll, r.Shaders.Geometry)

	var seq []*PipelineState
	draws := 0
	for _, c := range mb.Log {
		switch c.Name {
		case "ApplyState":
			seq = append(seq, c.Arg.(*PipelineState))
		case "DrawIndexed":
			draws++
		}
	}
	if draws != 3 {
		t.Errorf("draws = %d, want 3", draws)
	}
	if len(seq) != 2 || seq[0] != stateOpaque.CullOff || seq[1] != stateOpaque {
		t.Errorf("ApplyState sequence wrong: got %d calls", len(seq))
	}
	if mb.State() != stateOpaque {
		t.Error("pass state must be restored after rendering")
	}

	// Double-sided group last: the restore must still happen on exit.
	mesh.Indices[1], mesh.Indices[2] = mesh.Indices[2], mesh.Indices[1]
	mb.Reset()
	mesh.RenderIndices(true, TopoTriangles, ModeAll, r.Shaders.Geometry)
	if mb.State() != stateOpaque {
		t.Error("pass state must be restored when the double-sided group is last")
	}

	// Without a twin (pass already cull-free) nothing is toggled.
	mb.ApplyState(stateTransparent)
	mb.Reset()
	mesh.RenderIndices(true, TopoTriangles, ModeAll, r.Shaders.Geometry)
	if mb.Count("ApplyState") != 0 {
		t.Error("no state changes expected when the pass state has no CullOff twin")
	}
}
