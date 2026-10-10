package assets

import (
	"testing"

	"../animation"
)

func approxF(a, b float32) bool {
	d := a - b
	return d < 0.001 && d > -0.001
}

// float32 little-endian byte helpers (well-known IEEE-754 patterns).
func f32(v float32) []byte {
	switch v {
	case 0:
		return []byte{0, 0, 0, 0}
	case 1:
		return []byte{0x00, 0x00, 0x80, 0x3f}
	case -1:
		return []byte{0x00, 0x00, 0x80, 0xbf}
	case 2:
		return []byte{0x00, 0x00, 0x00, 0x40}
	case 0.5:
		return []byte{0x00, 0x00, 0x00, 0x3f}
	}
	return []byte{0, 0, 0, 0}
}

func u32(v int) []byte {
	return []byte{byte(v & 0xff), byte((v >> 8) & 0xff), byte((v >> 16) & 0xff), byte((v >> 24) & 0xff)}
}

func appendAll(dst []byte, parts ...[]byte) []byte {
	for _, p := range parts {
		dst = append(dst, p...)
	}
	return dst
}

func TestParseBinaryAnimationV1(t *testing.T) {
	// frameRate 4, 2 frames, 1 joint (frameRate must not be 2 — that's the v2 marker)
	data := appendAll(make([]byte, 0), u32(4), u32(2), u32(1))
	// frame 0: pos (0,0,0) rot identity
	data = appendAll(data, f32(0), f32(0), f32(0), f32(0), f32(0), f32(0), f32(1))
	// frame 1: pos (2,0,-1) rot identity
	data = appendAll(data, f32(2), f32(0), f32(-1), f32(0), f32(0), f32(0), f32(1))

	a := ParseBinaryAnimation("v1", data)
	if a.NumFrames != 2 || a.JointCount != 1 || a.FrameRate != 4 {
		t.Fatalf("header parse: %+v", a)
	}
	if !approxF(a.Duration, 0.25) {
		t.Errorf("Duration = %v", a.Duration)
	}
	if a.Bounds != nil {
		t.Error("v1 has no bounds")
	}
	out := animation.NewPose(1)
	a.Sample(0.125, out, false)
	if !approxF(out.Positions[0], 1) || !approxF(out.Positions[2], -0.5) {
		t.Errorf("sampled pos = %v", out.Positions)
	}
}

func TestParseBinaryAnimationV2WithBounds(t *testing.T) {
	data := appendAll(make([]byte, 0), u32(2), u32(1), u32(2), u32(1), u32(1))
	data = appendAll(data, f32(0), f32(0), f32(0), f32(0), f32(0), f32(0), f32(1))
	data = appendAll(data, f32(1), f32(1), f32(1), f32(0), f32(0), f32(0), f32(1))
	// bounds frame 0: (-1,-1,-1)..(1,1,1); frame 1: (0,0,0)..(2,2,2)
	data = appendAll(data, f32(-1), f32(-1), f32(-1), f32(1), f32(1), f32(1))
	data = appendAll(data, f32(0), f32(0), f32(0), f32(2), f32(2), f32(2))

	a := ParseBinaryAnimation("v2", data)
	if a.NumFrames != 2 || a.JointCount != 1 || a.FrameRate != 1 {
		t.Fatalf("header parse: %+v", a)
	}
	if a.Bounds == nil || len(a.Bounds) != 2 {
		t.Fatalf("expected 2 bounds, got %v", a.Bounds)
	}
	b := a.SampleBounds(0.5, false)
	if !approxF(b.Min[0], -0.5) || !approxF(b.Max[0], 1.5) {
		t.Errorf("bounds mid = %+v", b)
	}
}

func TestParseBinaryAnimationTruncated(t *testing.T) {
	// Header promises 2 frames × 1 joint but only one frame follows.
	data := appendAll(make([]byte, 0), u32(4), u32(2), u32(1))
	data = appendAll(data, f32(0), f32(0), f32(0), f32(0), f32(0), f32(0), f32(1))

	a := ParseBinaryAnimation("short", data)
	if a.NumFrames != 0 || a.Bounds != nil {
		t.Fatalf("truncated clip must decode as empty, got %d frames", a.NumFrames)
	}
	a.Sample(0.1, animation.NewPose(1), true) // must not panic
}
