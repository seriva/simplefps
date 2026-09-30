package webgl

import (
	"testing"
)

func TestStateCaching(t *testing.T) {
	backend := NewWebGLBackend()
	backend.GL = map[string]any{
		"BLEND":      1,
		"DEPTH_TEST": 2,
		"CULL_FACE":  3,
		"ONE":        1,
		"ZERO":       0,
		"LEQUAL":     1,
		"BACK":       1,
		"FRONT":      2,
		"enable":     func(cap any) {},
		"disable":    func(cap any) {},
		"blendFunc":  func(s, d any) {},
		"depthMask":  func(w any) {},
		"depthFunc":  func(f any) {},
		"cullFace":   func(f any) {},
	}

	if backend.BlendEnabled != nil {
		t.Error("Expected initial BlendEnabled to be nil")
	}

	backend.SetBlendState(true, "src_alpha", "one_minus_src_alpha")

	if backend.BlendEnabled != true {
		t.Error("Expected BlendEnabled to be true")
	}
	if backend.BlendSrc != "src_alpha" {
		t.Error("Expected BlendSrc to be src_alpha")
	}

	// It should early return next time
	backend.SetBlendState(true, "src_alpha", "one_minus_src_alpha")
	if backend.BlendEnabled != true {
		t.Error("Expected BlendEnabled to remain true")
	}
}
