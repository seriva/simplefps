package animation

import "math"

// Bounds is a per-frame axis-aligned bounding box.
type Bounds struct {
	Min [3]float32
	Max [3]float32
}

// Animation holds pre-baked per-frame poses (and optional per-frame bounds)
// and samples them with linear/slerp interpolation.
type Animation struct {
	Name       string
	FrameRate  float32
	NumFrames  int
	Duration   float32
	JointCount int
	Bounds     []Bounds // nil when the file carries no bounds

	FramePoses []*Pose

	boundsResult Bounds
	frame0       int
	frame1       int
	alpha        float32
}

// NewAnimation builds an animation from pre-built frame poses.
func NewAnimation(name string, frameRate float32, framePoses []*Pose, bounds []Bounds) *Animation {
	a := &Animation{
		Name:       name,
		FrameRate:  frameRate,
		FramePoses: framePoses,
		NumFrames:  len(framePoses),
		Bounds:     bounds,
	}
	if a.FrameRate <= 0 {
		a.FrameRate = 24
	}
	if a.NumFrames > 0 {
		a.Duration = float32(a.NumFrames-1) / a.FrameRate
		a.JointCount = framePoses[0].JointCount
	}
	if a.Name == "" {
		a.Name = "unnamed"
	}
	return a
}

// computeFrameInfo resolves time into two frame indices and a blend factor.
func (a *Animation) computeFrameInfo(time float32, loop bool) {
	if a.NumFrames <= 1 {
		a.frame0 = 0
		a.frame1 = 0
		a.alpha = 0
		return
	}

	t := time
	if loop && a.Duration > 0 {
		t = float32(math.Mod(float64(t), float64(a.Duration)))
		if t < 0 {
			t += a.Duration
		}
	} else {
		if t < 0 {
			t = 0
		}
		if t > a.Duration {
			t = a.Duration
		}
	}

	frameTime := t * a.FrameRate
	floor := float32(math.Floor(float64(frameTime)))
	f0 := int(floor)
	if f0 > a.NumFrames-1 {
		f0 = a.NumFrames - 1
	}
	f1 := f0 + 1
	if f1 > a.NumFrames-1 {
		f1 = a.NumFrames - 1
	}
	a.frame0 = f0
	a.frame1 = f1
	a.alpha = frameTime - floor
}

// Sample writes the interpolated pose at time into out.
func (a *Animation) Sample(time float32, out *Pose, loop bool) {
	if a.NumFrames == 0 {
		return
	}
	a.computeFrameInfo(time, loop)
	if a.alpha < 0.001 || a.frame0 == a.frame1 {
		out.CopyFrom(a.FramePoses[a.frame0])
	} else {
		PoseLerp(out, a.FramePoses[a.frame0], a.FramePoses[a.frame1], a.alpha)
	}
}

// SampleBounds returns the interpolated bounding box at time, or nil when the
// animation has no bounds. The result is owned by the animation.
func (a *Animation) SampleBounds(time float32, loop bool) *Bounds {
	if a.Bounds == nil || a.NumFrames == 0 {
		return nil
	}
	a.computeFrameInfo(time, loop)
	b0 := &a.Bounds[a.frame0]
	b1 := &a.Bounds[a.frame1]
	out := &a.boundsResult

	if a.alpha < 0.001 || a.frame0 == a.frame1 {
		for i := 0; i < 3; i++ {
			out.Min[i] = b0.Min[i]
			out.Max[i] = b0.Max[i]
		}
	} else {
		t := a.alpha
		for i := 0; i < 3; i++ {
			out.Min[i] = b0.Min[i] + (b1.Min[i]-b0.Min[i])*t
			out.Max[i] = b0.Max[i] + (b1.Max[i]-b0.Max[i])*t
		}
	}
	return out
}
