package physics

import (
	"testing"

	"../collision"
	"../mathx"
)

// floorRaycaster is a RaycastProvider that reports a flat floor at Y = 0.
type floorRaycaster struct {
	res collision.RaycastResult
}

func (f *floorRaycaster) RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ float32, options *collision.RayOptions) *collision.RaycastResult {
	out := &f.res
	out.Reset()
	if toY <= 0 && fromY >= 0 {
		out.HasHit = true
		out.Distance = fromY
		out.HitPointWorld.Set(fromX, 0, fromZ)
		out.HitNormalWorld.Set(0, 1, 0) // Floor normal points +Y
	}
	return out
}

func TestDynamicBodyFreeFall(t *testing.T) {
	// No provider: no obstacles.
	pos := mathx.Vec3{X: 0, Y: 100, Z: 0}
	body := NewDynamicBody(&pos, &DynamicBodyConfig{
		Gravity: 100,
	})

	// 100ms update
	body.Update(100.0)

	// After 0.1s, velocity.Y should be -10, position.Y should drop
	if body.Velocity.Y >= 0 {
		t.Errorf("Expected negative Y velocity after fall, got %f", body.Velocity.Y)
	}
	if body.Position.Y >= 100 {
		t.Errorf("Expected position.Y to decrease, got %f", body.Position.Y)
	}
}

func TestDynamicBodyBounce(t *testing.T) {
	bounced := false
	var bounceSpeed float32

	pos := mathx.Vec3{X: 0, Y: 2, Z: 0}
	vel := mathx.Vec3{X: 0, Y: -100, Z: 0}
	body := NewDynamicBody(&pos, &DynamicBodyConfig{
		Velocity:       &vel,
		Restitution:    0.8,
		Radius:         1.0,
		MinBounceSpeed: 20,
		OnBounce: func(hp, hn *mathx.Vec3, newSpeed float32) {
			bounced = true
			bounceSpeed = newSpeed
		},
	})
	body.Provider = &floorRaycaster{}
	body.Gravity = 0

	body.Update(100.0)

	if !bounced {
		t.Errorf("Expected body to bounce against floor")
	}
	if bounceSpeed != 80.0 {
		t.Errorf("Expected bounce speed 80.0 (100 * 0.8), got %f", bounceSpeed)
	}
	if body.Velocity.Y <= 0 {
		t.Errorf("Expected upward velocity after bounce, got %f", body.Velocity.Y)
	}
}
