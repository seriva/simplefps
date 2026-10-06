package animation

import (
	"testing"

	"../mathx"
)

func approx(a, b float32) bool {
	d := a - b
	return d < 0.001 && d > -0.001
}

// two-joint chain: root at origin, child at +1 X in global space.
func testJointDefs() []JointDef {
	return []JointDef{
		{Name: "root", Parent: -1, Pos: []float32{0, 0, 0}, Rot: []float32{0, 0, 0, 1}},
		{Name: "child", Parent: 0, Pos: []float32{1, 0, 0}, Rot: []float32{0, 0, 0, 1}},
	}
}

func TestSkeletonLocalBindFromGlobal(t *testing.T) {
	// Root translated by (0,2,0); child global at (1,2,0) → local (1,0,0).
	defs := []JointDef{
		{Name: "root", Parent: -1, Pos: []float32{0, 2, 0}, Rot: []float32{0, 0, 0, 1}},
		{Name: "child", Parent: 0, Pos: []float32{1, 2, 0}, Rot: []float32{0, 0, 0, 1}},
	}
	s := NewSkeleton(defs)
	if s.JointCount != 2 {
		t.Fatalf("JointCount = %d", s.JointCount)
	}
	c := s.Joints[1]
	if !approx(c.LocalBindPos.X, 1) || !approx(c.LocalBindPos.Y, 0) || !approx(c.LocalBindPos.Z, 0) {
		t.Errorf("child local bind pos = %+v, want (1,0,0)", c.LocalBindPos)
	}
	if !approx(c.LocalBindRot.W, 1) {
		t.Errorf("child local bind rot = %+v, want identity", c.LocalBindRot)
	}
	if !approx(s.InverseBindMatrices[1][12], -1) || !approx(s.InverseBindMatrices[1][13], -2) {
		t.Errorf("child inverse bind translation = (%v,%v)", s.InverseBindMatrices[1][12], s.InverseBindMatrices[1][13])
	}
}

func TestSkeletonBindPoseSkinIsIdentity(t *testing.T) {
	s := NewSkeleton(testJointDefs())
	pose := NewPose(s.JointCount)
	pose.SetBindPose(s)

	world := s.GetWorldMatrices(pose)
	if !approx(world[1][12], 1) {
		t.Errorf("child world X = %v, want 1", world[1][12])
	}

	skin := s.ComputeSkinningMatrices(pose)
	id := mathx.NewMat4()
	for j := 0; j < s.JointCount; j++ {
		for i := 0; i < 16; i++ {
			if !approx(skin[j][i], id[i]) {
				t.Fatalf("skin[%d][%d] = %v, want identity", j, i, skin[j][i])
			}
		}
	}
}

func TestSkeletonParentTransformPropagates(t *testing.T) {
	s := NewSkeleton(testJointDefs())
	pose := NewPose(s.JointCount)
	pose.SetBindPose(s)
	// Move root up by 3; child should follow.
	pose.Positions[1] = 3
	world := s.GetWorldMatrices(pose)
	if !approx(world[1][12], 1) || !approx(world[1][13], 3) {
		t.Errorf("child world = (%v,%v), want (1,3)", world[1][12], world[1][13])
	}
	skin := s.ComputeSkinningMatrices(pose)
	if !approx(skin[1][13], 3) {
		t.Errorf("child skin Y offset = %v, want 3", skin[1][13])
	}
}

func TestPoseLerp(t *testing.T) {
	a := NewPose(1)
	b := NewPose(1)
	a.SetJointTransform(0, 0, 0, 0, 0, 0, 0, 1)
	// 180° about Y: (0, 1, 0, 0)
	b.SetJointTransform(0, 2, 4, 6, 0, 1, 0, 0)
	out := NewPose(1)
	PoseLerp(out, a, b, 0.5)
	if !approx(out.Positions[0], 1) || !approx(out.Positions[1], 2) || !approx(out.Positions[2], 3) {
		t.Errorf("lerp positions = %v", out.Positions)
	}
	// halfway = 90° about Y: (0, √½, 0, √½)
	if !approx(out.Rotations[1], 0.7071) || !approx(out.Rotations[3], 0.7071) {
		t.Errorf("slerp rotation = %v", out.Rotations)
	}

	// Opposite-hemisphere quaternion is flipped so blending takes the short path.
	b.SetJointTransform(0, 0, 0, 0, 0, 0, 0, -1)
	PoseLerp(out, a, b, 0.5)
	if !approx(out.Rotations[3], 1) {
		t.Errorf("expected short-path slerp to identity, got %v", out.Rotations)
	}
}

func makeTestAnimation() *Animation {
	poses := make([]*Pose, 3)
	for f := 0; f < 3; f++ {
		poses[f] = NewPose(1)
		poses[f].SetJointTransform(0, float32(f)*10, 0, 0, 0, 0, 0, 1)
	}
	bounds := []Bounds{
		{Min: [3]float32{-1, -1, -1}, Max: [3]float32{1, 1, 1}},
		{Min: [3]float32{-2, -2, -2}, Max: [3]float32{2, 2, 2}},
		{Min: [3]float32{-3, -3, -3}, Max: [3]float32{3, 3, 3}},
	}
	return NewAnimation("walk", 10, poses, bounds)
}

func TestAnimationSampleInterpolatesAndClamps(t *testing.T) {
	a := makeTestAnimation()
	if !approx(a.Duration, 0.2) {
		t.Fatalf("Duration = %v, want 0.2", a.Duration)
	}
	out := NewPose(1)

	a.Sample(0.05, out, false)
	if !approx(out.Positions[0], 5) {
		t.Errorf("t=0.05 X = %v, want 5", out.Positions[0])
	}
	a.Sample(0.1, out, false)
	if !approx(out.Positions[0], 10) {
		t.Errorf("t=0.1 X = %v, want 10 (exact frame copy)", out.Positions[0])
	}
	// Non-loop clamps to last frame.
	a.Sample(5, out, false)
	if !approx(out.Positions[0], 20) {
		t.Errorf("clamped X = %v, want 20", out.Positions[0])
	}
	// Loop wraps: 0.25 mod 0.2 = 0.05.
	a.Sample(0.25, out, true)
	if !approx(out.Positions[0], 5) {
		t.Errorf("looped X = %v, want 5", out.Positions[0])
	}
	// Negative time wraps forward.
	a.Sample(-0.05, out, true)
	if !approx(out.Positions[0], 15) {
		t.Errorf("negative looped X = %v, want 15", out.Positions[0])
	}
}

func TestAnimationSampleBounds(t *testing.T) {
	a := makeTestAnimation()
	b := a.SampleBounds(0.05, false)
	if b == nil || !approx(b.Min[0], -1.5) || !approx(b.Max[2], 1.5) {
		t.Errorf("bounds at 0.05 = %+v", b)
	}
	b2 := a.SampleBounds(0.2, false)
	if b2 != b {
		t.Error("SampleBounds must reuse the same result object")
	}
	if !approx(b2.Max[0], 3) {
		t.Errorf("bounds at end = %+v", b2)
	}
	noBounds := NewAnimation("x", 10, a.FramePoses, nil)
	if noBounds.SampleBounds(0, true) != nil {
		t.Error("expected nil bounds when animation has none")
	}
}

func TestAnimationSingleFrame(t *testing.T) {
	p := NewPose(1)
	p.SetJointTransform(0, 7, 0, 0, 0, 0, 0, 1)
	a := NewAnimation("still", 24, []*Pose{p}, nil)
	if a.Duration != 0 {
		t.Errorf("single frame duration = %v", a.Duration)
	}
	out := NewPose(1)
	a.Sample(3, out, true)
	if out.Positions[0] != 7 {
		t.Errorf("single frame sample X = %v", out.Positions[0])
	}
	empty := NewAnimation("", 0, nil, nil)
	if empty.Name != "unnamed" || empty.FrameRate != 24 {
		t.Errorf("defaults: %+v", empty)
	}
	empty.Sample(1, out, true) // must not panic
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
	if !approx(a.Duration, 0.25) {
		t.Errorf("Duration = %v", a.Duration)
	}
	if a.Bounds != nil {
		t.Error("v1 has no bounds")
	}
	out := NewPose(1)
	a.Sample(0.125, out, false)
	if !approx(out.Positions[0], 1) || !approx(out.Positions[2], -0.5) {
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
	if !approx(b.Min[0], -0.5) || !approx(b.Max[0], 1.5) {
		t.Errorf("bounds mid = %+v", b)
	}
}

func TestAnimationPlayer(t *testing.T) {
	s := NewSkeleton(testJointDefs())
	p := NewAnimationPlayer(s)
	// starts in bind pose
	if !approx(p.Pose.Positions[3], 1) {
		t.Errorf("bind pose child X = %v", p.Pose.Positions[3])
	}
	if p.GetProgress() != 0 || p.GetDuration() != 0 || p.GetCurrentBounds() != nil {
		t.Error("idle player must report zero progress/duration/nil bounds")
	}

	poses := make([]*Pose, 3)
	for f := 0; f < 3; f++ {
		poses[f] = NewPose(2)
		poses[f].SetBindPose(s)
		poses[f].Positions[0] = float32(f) * 10
	}
	anim := NewAnimation("a", 10, poses, nil)

	p.Play(anim, true)
	p.Update(0.05)
	if !approx(p.Pose.Positions[0], 5) {
		t.Errorf("after 0.05s root X = %v, want 5", p.Pose.Positions[0])
	}
	if !approx(p.GetProgress(), 0.25) {
		t.Errorf("progress = %v", p.GetProgress())
	}

	p.Speed = 2
	p.Update(0.025)
	if !approx(p.CurrentTime, 0.1) {
		t.Errorf("speed-scaled time = %v", p.CurrentTime)
	}

	p.Pause()
	p.Update(1)
	if !approx(p.CurrentTime, 0.1) {
		t.Error("paused player advanced")
	}
	p.Resume()

	// non-loop stops at end
	p.Loop = false
	p.Update(5)
	if p.IsPlaying() || !approx(p.CurrentTime, anim.Duration) || !approx(p.GetProgress(), 1) {
		t.Errorf("non-loop end: playing=%v time=%v", p.Playing, p.CurrentTime)
	}
	if !approx(p.Pose.Positions[0], 20) {
		t.Errorf("end pose X = %v", p.Pose.Positions[0])
	}

	p.SeekProgress(0.5)
	if !approx(p.Pose.Positions[0], 10) {
		t.Errorf("seek X = %v", p.Pose.Positions[0])
	}

	p.Stop()
	if p.CurrentAnimation != nil || p.CurrentTime != 0 || !approx(p.Pose.Positions[0], 0) || !approx(p.Pose.Positions[3], 1) {
		t.Errorf("stop must restore bind pose: %+v", p.Pose.Positions)
	}

	// Play without reset keeps time.
	p.Seek(0.1)
	p.Play(anim, false)
	if !approx(p.CurrentTime, 0.1) {
		t.Error("play(reset=false) reset time")
	}
}
