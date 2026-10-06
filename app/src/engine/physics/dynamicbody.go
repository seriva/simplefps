package physics

import (
	"math"

	"../collision"
	"../mathx"
)

// RaycastProvider queries static world collision geometry (implemented by
// scene.Scene). The returned result is owned by the provider and only valid
// until the next call.
type RaycastProvider interface {
	RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ float32, options *collision.RayOptions) *collision.RaycastResult
}

var (
	_dbRaycastResult   collision.RaycastResult
	_dbBothSidesOption = collision.RayOptions{SkipBackfaces: false, CollisionFilterMask: 1, Mode: collision.RayModeClosest}
)

// raycastStatic queries p, or returns the reset miss scratch when p is nil.
func raycastStatic(p RaycastProvider, fromX, fromY, fromZ, toX, toY, toZ float32, options *collision.RayOptions, miss *collision.RaycastResult) *collision.RaycastResult {
	if p == nil {
		miss.Reset()
		return miss
	}
	return p.RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ, options)
}

// DynamicBodyConfig contains parameters for initializing a DynamicBody.
type DynamicBodyConfig struct {
	Velocity       *mathx.Vec3
	Gravity        float32
	Restitution    float32
	Radius         float32
	MinBounceSpeed float32
	OnBounce       func(hp, hn *mathx.Vec3, newSpeed float32)
	OnRest         func(pos *mathx.Vec3)
}

// DynamicBody represents a bouncing projectile or physics sphere using raycasts.
type DynamicBody struct {
	// Provider supplies static world raycasts; nil means no collision.
	Provider       RaycastProvider
	Position       mathx.Vec3
	Velocity       mathx.Vec3
	Gravity        float32
	Restitution    float32
	Radius         float32
	MinBounceSpeed float32
	BounceCount    int
	OnBounce       func(hp, hn *mathx.Vec3, newSpeed float32)
	OnRest         func(pos *mathx.Vec3)
	IsResting      bool
}

// NewDynamicBody creates a DynamicBody with initial position and optional configuration.
func NewDynamicBody(position *mathx.Vec3, config *DynamicBodyConfig) *DynamicBody {
	body := &DynamicBody{
		Gravity:        300,
		Restitution:    0.6,
		Radius:         3.0,
		MinBounceSpeed: 50,
	}
	if position != nil {
		body.Position.Copy(position)
	}
	if config != nil {
		if config.Velocity != nil {
			body.Velocity.Copy(config.Velocity)
		}
		if config.Gravity != 0 {
			body.Gravity = config.Gravity
		}
		if config.Restitution != 0 {
			body.Restitution = config.Restitution
		}
		if config.Radius != 0 {
			body.Radius = config.Radius
		}
		if config.MinBounceSpeed != 0 {
			body.MinBounceSpeed = config.MinBounceSpeed
		}
		body.OnBounce = config.OnBounce
		body.OnRest = config.OnRest
	}
	return body
}

// Update simulates one frame of movement, gravity, and bounces.
func (body *DynamicBody) Update(frameTime float32) bool {
	if body.IsResting {
		return false
	}

	dt := frameTime / 1000.0 // Convert to seconds

	// Apply gravity to velocity
	body.Velocity.Y -= body.Gravity * dt

	vx := body.Velocity.X
	vy := body.Velocity.Y
	vz := body.Velocity.Z
	speedSq := vx*vx + vy*vy + vz*vz
	speed := float32(math.Sqrt(float64(speedSq)))

	dist := speed * dt

	// Minimum lookahead to prevent tunneling when moving slowly
	minLookahead := float32(5.0)
	lookahead := dist
	if lookahead < minLookahead {
		lookahead = minLookahead
	}

	var dirX, dirY, dirZ float32
	if speed > 0.001 {
		dirX = vx / speed
		dirY = vy / speed
		dirZ = vz / speed
	} else {
		dirX = 0
		dirY = -1
		dirZ = 0
	}

	result := raycastStatic(body.Provider,
		body.Position.X,
		body.Position.Y,
		body.Position.Z,
		body.Position.X+dirX*lookahead,
		body.Position.Y+dirY*lookahead,
		body.Position.Z+dirZ*lookahead,
		&_dbBothSidesOption,
		&_dbRaycastResult,
	)

	if result.HasHit && result.Distance <= (dist+body.Radius) {
		hp := &result.HitPointWorld
		hn := &result.HitNormalWorld

		body.BounceCount++

		// If too slow, just stop (prevents floor tunneling)
		if speed < body.MinBounceSpeed {
			body.IsResting = true
			body.Position.X = hp.X + hn.X*body.Radius
			body.Position.Y = hp.Y + hn.Y*body.Radius
			body.Position.Z = hp.Z + hn.Z*body.Radius
			body.Velocity.X = 0
			body.Velocity.Y = 0
			body.Velocity.Z = 0

			if body.OnRest != nil {
				body.OnRest(&body.Position)
			}
			return false
		}

		// Reflect: v' = v - 2(v·n)n
		dot := dirX*hn.X + dirY*hn.Y + dirZ*hn.Z
		rx := dirX - 2*dot*hn.X
		ry := dirY - 2*dot*hn.Y
		rz := dirZ - 2*dot*hn.Z

		newSpeed := speed * body.Restitution
		body.Velocity.X = rx * newSpeed
		body.Velocity.Y = ry * newSpeed
		body.Velocity.Z = rz * newSpeed

		body.Position.X = hp.X + hn.X*body.Radius
		body.Position.Y = hp.Y + hn.Y*body.Radius
		body.Position.Z = hp.Z + hn.Z*body.Radius

		if body.OnBounce != nil {
			body.OnBounce(hp, hn, newSpeed)
		}
	} else {
		body.Position.X += vx * dt
		body.Position.Y += vy * dt
		body.Position.Z += vz * dt
	}

	return true
}
