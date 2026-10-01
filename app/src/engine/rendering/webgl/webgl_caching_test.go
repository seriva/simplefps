package webgl

import (
	"testing"

	"../" // rendering
)

// fakeGL records every state call so tests can assert on what reached the GL.
type fakeGL struct {
	calls []string
}

func newFakeGL() (*fakeGL, map[string]any) {
	f := &fakeGL{}
	gl := map[string]any{
		"BLEND":               "BLEND",
		"DEPTH_TEST":          "DEPTH_TEST",
		"CULL_FACE":           "CULL_FACE",
		"POLYGON_OFFSET_FILL": "POLYGON_OFFSET_FILL",
		"ZERO":                "ZERO",
		"ONE":                 "ONE",
		"SRC_ALPHA":           "SRC_ALPHA",
		"ONE_MINUS_SRC_ALPHA": "ONE_MINUS_SRC_ALPHA",
		"DST_COLOR":           "DST_COLOR",
		"NEVER":               "NEVER",
		"LESS":                "LESS",
		"EQUAL":               "EQUAL",
		"LEQUAL":              "LEQUAL",
		"GREATER":             "GREATER",
		"NOTEQUAL":            "NOTEQUAL",
		"GEQUAL":              "GEQUAL",
		"ALWAYS":              "ALWAYS",
		"BACK":                "BACK",
		"FRONT":               "FRONT",
		"enable":              func(c any) { f.calls = append(f.calls, "enable:"+c.(string)) },
		"disable":             func(c any) { f.calls = append(f.calls, "disable:"+c.(string)) },
		"blendFunc":           func(s, d any) { f.calls = append(f.calls, "blendFunc:"+s.(string)+","+d.(string)) },
		"depthMask":           func(w any) { f.calls = append(f.calls, "depthMask:"+boolStr(w.(bool))) },
		"depthFunc":           func(fn any) { f.calls = append(f.calls, "depthFunc:"+fn.(string)) },
		"cullFace":            func(fc any) { f.calls = append(f.calls, "cullFace:"+fc.(string)) },
		"polygonOffset":       func(a, b any) { f.calls = append(f.calls, "polygonOffset") },
		"colorMask": func(r, g, b, a any) {
			f.calls = append(f.calls, "colorMask:"+boolStr(r.(bool))+boolStr(g.(bool))+boolStr(b.(bool))+boolStr(a.(bool)))
		},
	}
	return f, gl
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func (f *fakeGL) has(call string) bool {
	for _, c := range f.calls {
		if c == call {
			return true
		}
	}
	return false
}

func newStateBackend() (*WebGLBackend, *fakeGL) {
	backend := NewWebGLBackend()
	f, gl := newFakeGL()
	backend.GL = gl
	backend.initLookupTables()
	return backend, f
}

var testOpaque = &rendering.PipelineState{
	SrcFactor: rendering.BlendOne, DstFactor: rendering.BlendZero,
	DepthTest: true, DepthWrite: true, DepthFunc: rendering.DepthLEqual,
	Cull: true, CullFace: rendering.CullBack,
	ColorMask: rendering.ColorMaskAll,
}

func TestApplyStateCachesRedundantCalls(t *testing.T) {
	backend, f := newStateBackend()
	if backend.BlendEnabled != nil {
		t.Error("Expected initial BlendEnabled to be nil")
	}

	backend.ApplyState(testOpaque)
	if backend.State() != testOpaque {
		t.Error("State() should return the last applied preset")
	}
	if backend.BlendEnabled != false || backend.DepthTest != true || backend.CullEnabled != true {
		t.Error("cached state fields not updated")
	}
	for _, want := range []string{"disable:BLEND", "enable:DEPTH_TEST", "depthMask:1", "depthFunc:LEQUAL",
		"enable:CULL_FACE", "cullFace:BACK", "disable:POLYGON_OFFSET_FILL", "colorMask:1111"} {
		if !f.has(want) {
			t.Errorf("first ApplyState missed %q: %v", want, f.calls)
		}
	}

	// Same pointer: nothing should be issued.
	n := len(f.calls)
	backend.ApplyState(testOpaque)
	if len(f.calls) != n {
		t.Errorf("re-applying the same preset issued %d GL calls", len(f.calls)-n)
	}

	// Equal values but a different pointer: still nothing, thanks to field caching.
	clone := *testOpaque
	backend.ApplyState(&clone)
	if len(f.calls) != n {
		t.Errorf("applying an equal state issued %d GL calls: %v", len(f.calls)-n, f.calls[n:])
	}
	if backend.State() != &clone {
		t.Error("State() should track the most recent pointer")
	}
}

func TestApplyStateNilIsNoop(t *testing.T) {
	backend, f := newStateBackend()
	backend.ApplyState(testOpaque)
	n := len(f.calls)
	backend.ApplyState(nil)
	if len(f.calls) != n || backend.State() != testOpaque {
		t.Error("ApplyState(nil) must not touch the GL or the tracked state")
	}
}

func TestApplyStateMapsFields(t *testing.T) {
	cases := []struct {
		name  string
		state rendering.PipelineState
		want  []string
	}{
		{"blend src-alpha/one", rendering.PipelineState{Blend: true, SrcFactor: rendering.BlendSrcAlpha, DstFactor: rendering.BlendOne, ColorMask: rendering.ColorMaskAll},
			[]string{"enable:BLEND", "blendFunc:SRC_ALPHA,ONE"}},
		{"blend one-minus-src-alpha", rendering.PipelineState{Blend: true, SrcFactor: rendering.BlendSrcAlpha, DstFactor: rendering.BlendOneMinusSrcAlpha, ColorMask: rendering.ColorMaskAll},
			[]string{"blendFunc:SRC_ALPHA,ONE_MINUS_SRC_ALPHA"}},
		{"blend dst-color", rendering.PipelineState{Blend: true, SrcFactor: rendering.BlendDstColor, DstFactor: rendering.BlendZero, ColorMask: rendering.ColorMaskAll},
			[]string{"blendFunc:DST_COLOR,ZERO"}},
		{"depth test no write", rendering.PipelineState{DepthTest: true, DepthFunc: rendering.DepthLess, ColorMask: rendering.ColorMaskAll},
			[]string{"enable:DEPTH_TEST", "depthMask:0", "depthFunc:LESS"}},
		{"cull front", rendering.PipelineState{Cull: true, CullFace: rendering.CullFront, ColorMask: rendering.ColorMaskAll},
			[]string{"enable:CULL_FACE", "cullFace:FRONT"}},
		{"polygon offset", rendering.PipelineState{PolyOffset: true, OffsetFactor: -1, OffsetUnits: -1, ColorMask: rendering.ColorMaskAll},
			[]string{"enable:POLYGON_OFFSET_FILL", "polygonOffset"}},
		{"color mask none", rendering.PipelineState{},
			[]string{"colorMask:0000"}},
		{"color mask rgb", rendering.PipelineState{ColorMask: rendering.ColorMaskR | rendering.ColorMaskG | rendering.ColorMaskB},
			[]string{"colorMask:1110"}},
	}
	for _, tc := range cases {
		backend, f := newStateBackend()
		s := tc.state
		backend.ApplyState(&s)
		for _, w := range tc.want {
			if !f.has(w) {
				t.Errorf("%s: expected GL call %q, got %v", tc.name, w, f.calls)
			}
		}
	}
}

func TestDepthFuncMapping(t *testing.T) {
	funcs := map[rendering.DepthFunc]string{
		rendering.DepthNever:    "NEVER",
		rendering.DepthLess:     "LESS",
		rendering.DepthEqual:    "EQUAL",
		rendering.DepthLEqual:   "LEQUAL",
		rendering.DepthGreater:  "GREATER",
		rendering.DepthNotEqual: "NOTEQUAL",
		rendering.DepthGEqual:   "GEQUAL",
		rendering.DepthAlways:   "ALWAYS",
	}
	for fn, want := range funcs {
		backend, f := newStateBackend()
		backend.ApplyState(&rendering.PipelineState{DepthTest: true, DepthFunc: fn})
		if !f.has("depthFunc:" + want) {
			t.Errorf("%s: expected depthFunc:%s, got %v", string(fn), want, f.calls)
		}
	}
}
