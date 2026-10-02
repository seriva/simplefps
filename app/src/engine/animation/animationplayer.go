package animation

// AnimationPlayer advances an animation over time and maintains the current
// local pose for a skeleton.
type AnimationPlayer struct {
	Skeleton         *Skeleton
	CurrentAnimation *Animation
	CurrentTime      float32
	Speed            float32
	Loop             bool
	Playing          bool
	Pose             *Pose
}

// NewAnimationPlayer creates a player initialised to the skeleton bind pose.
func NewAnimationPlayer(skeleton *Skeleton) *AnimationPlayer {
	p := &AnimationPlayer{
		Skeleton: skeleton,
		Speed:    1,
		Loop:     true,
		Pose:     NewPose(skeleton.JointCount),
	}
	p.Pose.SetBindPose(skeleton)
	return p
}

// Play starts an animation; reset restarts it from time zero.
func (p *AnimationPlayer) Play(anim *Animation, reset bool) {
	p.CurrentAnimation = anim
	if reset {
		p.CurrentTime = 0
	}
	p.Playing = true
}

// Pause halts time advancement without clearing the animation.
func (p *AnimationPlayer) Pause() { p.Playing = false }

// Resume continues a paused animation.
func (p *AnimationPlayer) Resume() { p.Playing = true }

// Stop clears the animation and returns to the bind pose.
func (p *AnimationPlayer) Stop() {
	p.Playing = false
	p.CurrentTime = 0
	p.CurrentAnimation = nil
	p.Pose.SetBindPose(p.Skeleton)
}

// Update advances by deltaTime seconds and re-samples the pose.
func (p *AnimationPlayer) Update(deltaTime float32) *Pose {
	if p.Playing && p.CurrentAnimation != nil {
		p.CurrentTime += deltaTime * p.Speed
		if !p.Loop && p.CurrentTime >= p.CurrentAnimation.Duration {
			p.CurrentTime = p.CurrentAnimation.Duration
			p.Playing = false
		}
		p.CurrentAnimation.Sample(p.CurrentTime, p.Pose, p.Loop)
	}
	return p.Pose
}

// GetPose returns the current local pose.
func (p *AnimationPlayer) GetPose() *Pose { return p.Pose }

// GetCurrentBounds returns the animation bounds at the current time, or nil.
func (p *AnimationPlayer) GetCurrentBounds() *Bounds {
	if p.CurrentAnimation == nil {
		return nil
	}
	return p.CurrentAnimation.SampleBounds(p.CurrentTime, p.Loop)
}

// IsPlaying reports whether time is advancing.
func (p *AnimationPlayer) IsPlaying() bool { return p.Playing }

// GetDuration returns the current animation duration in seconds (0 if none).
func (p *AnimationPlayer) GetDuration() float32 {
	if p.CurrentAnimation == nil {
		return 0
	}
	return p.CurrentAnimation.Duration
}

// GetProgress returns normalised playback progress in [0, 1].
func (p *AnimationPlayer) GetProgress() float32 {
	d := p.GetDuration()
	if d <= 0 {
		return 0
	}
	v := p.CurrentTime / d
	if v > 1 {
		v = 1
	}
	return v
}

// Seek jumps to an absolute time and re-samples the pose.
func (p *AnimationPlayer) Seek(time float32) {
	p.CurrentTime = time
	if p.CurrentAnimation != nil {
		p.CurrentAnimation.Sample(p.CurrentTime, p.Pose, p.Loop)
	}
}

// SeekProgress jumps to a normalised position in [0, 1].
func (p *AnimationPlayer) SeekProgress(progress float32) {
	p.Seek(progress * p.GetDuration())
}
