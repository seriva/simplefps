//gofront:target wasm
package decoder

import (
	"testing"

	"../../animation"
)

func approxF(a, b float32) bool {
	d := a - b
	return d < 0.001 && d > -0.001
}

func TestParseBinaryAnimationV1(t *testing.T) {
	// frameRate 4, 2 frames, 1 joint
	w := newTestBinWriter(256)
	w.u32(4) // frameRate
	w.u32(2) // numFrames
	w.u32(1) // numJoints

	// frame 0: pos (0,0,0), rot (0,0,0,1)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)

	// frame 1: pos (2,0,-1), rot (0,0,0,1)
	w.f32(2)
	w.f32(0)
	w.f32(-1)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)

	a := ParseBinaryAnimation("v1", w.bytes())
	if a.NumFrames != 2 || a.JointCount != 1 || a.FrameRate != 4 {
		t.Fatalf("header parse: frames %d, joints %d, fps %f", a.NumFrames, a.JointCount, a.FrameRate)
	}
	if !approxF(a.Duration, 0.25) {
		t.Errorf("Duration = %f", a.Duration)
	}
	if a.Bounds != nil {
		t.Error("v1 has no bounds")
	}
	out := animation.NewPose(1)
	a.Sample(0.125, out, false)
	if !approxF(out.Positions[0], 1) || !approxF(out.Positions[2], -0.5) {
		t.Errorf("sampled pos = (%f, %f, %f)", out.Positions[0], out.Positions[1], out.Positions[2])
	}
}

func TestParseBinaryAnimationV2WithBounds(t *testing.T) {
	w := newTestBinWriter(512)
	w.u32(2) // v2 marker
	w.u32(1) // frameRate
	w.u32(2) // numFrames
	w.u32(1) // numJoints
	w.u32(1) // hasBounds

	// frame 0
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)
	// frame 1
	w.f32(1)
	w.f32(1)
	w.f32(1)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)

	// bounds frame 0: (-1,-1,-1)..(1,1,1)
	w.f32(-1)
	w.f32(-1)
	w.f32(-1)
	w.f32(1)
	w.f32(1)
	w.f32(1)
	// bounds frame 1: (0,0,0)..(2,2,2)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(2)
	w.f32(2)
	w.f32(2)

	a := ParseBinaryAnimation("v2", w.bytes())
	if a.NumFrames != 2 || a.JointCount != 1 || a.FrameRate != 1 {
		t.Fatalf("header parse: frames %d, joints %d, fps %f", a.NumFrames, a.JointCount, a.FrameRate)
	}
	if a.Bounds == nil || len(a.Bounds) != 2 {
		t.Fatalf("expected 2 bounds, got %d", len(a.Bounds))
	}
	b := a.SampleBounds(0.5, false)
	if !approxF(b.Min[0], -0.5) || !approxF(b.Max[0], 1.5) {
		t.Errorf("bounds mid Min.X = %f, Max.X = %f", b.Min[0], b.Max[0])
	}
}

func TestParseBinaryAnimationTruncated(t *testing.T) {
	w := newTestBinWriter(128)
	w.u32(4) // frameRate
	w.u32(2) // numFrames promised
	w.u32(1) // numJoints promised
	// Only 1 frame provided
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)

	a := ParseBinaryAnimation("short", w.bytes())
	if a.NumFrames != 0 || a.Bounds != nil {
		t.Fatalf("truncated clip must decode as empty, got %d frames", a.NumFrames)
	}
	a.Sample(0.1, animation.NewPose(1), true) // must not panic
}

func TestParseBinaryAnimationZeroOrNegative(t *testing.T) {
	w := newTestBinWriter(64)
	w.u32(1) // frameRate
	w.u32(0) // numFrames = 0
	w.u32(5) // numJoints = 5

	a := ParseBinaryAnimation("zero", w.bytes())
	if a.NumFrames != 0 || a.FramePoses != nil {
		t.Errorf("expected empty animation, got %d frames", a.NumFrames)
	}
}

func TestParseBinaryAnimationMalformedBounds(t *testing.T) {
	w := newTestBinWriter(64)
	w.u32(2)       // v2
	w.u32(1)       // frameRate
	w.u32(1000000) // numFrames = 1,000,000 (malformed)
	w.u32(1)       // numJoints = 1
	w.u32(1)       // hasBounds = 1

	a := ParseBinaryAnimation("badbounds", w.bytes())
	if a.NumFrames != 0 || a.Bounds != nil {
		t.Errorf("expected empty animation, got %d frames", a.NumFrames)
	}
}

func TestParseBinaryAnimationOverflow(t *testing.T) {
	w := newTestBinWriter(64)
	w.u32(4)          // frameRate
	w.u32(0x80000000) // numFrames
	w.u32(0x80000000) // numJoints

	a := ParseBinaryAnimation("overflow", w.bytes())
	if a.NumFrames != 0 || a.FramePoses != nil {
		t.Errorf("expected empty animation on overflow, got %d frames", a.NumFrames)
	}
}
