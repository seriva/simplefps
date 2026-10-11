package systems

import (
	"math"

	"../mathx"

)

// Frustum plane offsets into Camera.FrustumPlanes (each plane is 4 floats: a, b, c, d).
const (
	FrustumLeft   = 0
	FrustumRight  = 4
	FrustumBottom = 8
	FrustumTop    = 12
	FrustumNear   = 16
	FrustumFar    = 20
)

// setPlane writes a normalized plane (a, b, c, d) into planes at offset off.
func setPlane(planes []float32, off int, a, b, c, d float32) {
	lenSq := a*a + b*b + c*c
	if lenSq > 0 {
		invLen := float32(1.0 / math.Sqrt(float64(lenSq)))
		a *= invLen
		b *= invLen
		c *= invLen
		d *= invLen
	}
	planes[off] = a
	planes[off+1] = b
	planes[off+2] = c
	planes[off+3] = d
}

// Camera manages viewing transformations, projection matrices, and frustum culling.
type Camera struct {
	Position              mathx.Vec3
	Rotation              mathx.Vec3 // pitch (X), yaw (Y), roll (Z) in degrees
	Direction             mathx.Vec3
	UpVector              mathx.Vec3
	View                  mathx.Mat4
	Projection            mathx.Mat4
	ViewProjection        mathx.Mat4
	InverseViewProjection mathx.Mat4

	Fov       float32
	NearPlane float32
	FarPlane  float32
	Aspect    float32

	// Six normalized planes, 4 floats each; see Frustum* offsets.
	FrustumPlanes []float32

	// Pre-allocated scratch to avoid heap allocations in frame loops
	target mathx.Vec3
}

// NewCamera creates an initialized Camera.
func NewCamera() *Camera {
	c := &Camera{
		Position:              *mathx.NewVec3(0, 0, 0),
		Rotation:              *mathx.NewVec3(0, 0, 0),
		Direction:             *mathx.NewVec3(0, 0, 1),
		UpVector:              *mathx.NewVec3(0, 1, 0),
		View:                  mathx.NewMat4(),
		Projection:            mathx.NewMat4(),
		ViewProjection:        mathx.NewMat4(),
		InverseViewProjection: mathx.NewMat4(),
		Fov:                   45.0,
		NearPlane:             0.1,
		FarPlane:              8192.0,
		FrustumPlanes:         make([]float32, mathx.FrustumPlaneCount*4),
		target:                *mathx.NewVec3(0, 0, 0),
	}
	c.UpdateDirection()
	return c
}

// SetProjection sets camera field of view and clipping planes, rebuilding the
// projection matrix if an aspect ratio is already known.
func (c *Camera) SetProjection(fov, nearPlane, farPlane float32) {
	c.Fov = fov
	c.NearPlane = nearPlane
	c.FarPlane = farPlane
	if c.Aspect > 0 {
		c.UpdateProjection(c.Aspect)
	}
}

// UpdateProjection computes the perspective projection matrix for the given aspect ratio.
func (c *Camera) UpdateProjection(aspect float32) {
	c.Aspect = aspect
	fovyRad := c.Fov * float32(math.Pi/180.0)
	mathx.Mat4PerspectiveZO(c.Projection, fovyRad, aspect, c.NearPlane, c.FarPlane)
}

// SetPosition sets world-space camera coordinates.
func (c *Camera) SetPosition(x, y, z float32) {
	c.Position.Set(x, y, z)
}

// SetRotation sets camera pitch, yaw, and roll in degrees.
func (c *Camera) SetRotation(pitch, yaw, roll float32) {
	c.Rotation.Set(pitch, yaw, roll)
	c.UpdateDirection()
}

// Translate adds a translation offset to the camera position.
func (c *Camera) Translate(move *mathx.Vec3) {
	c.Position.Add(&c.Position, move)
}

// Rotate adds angular rotation in degrees.
func (c *Camera) Rotate(rot *mathx.Vec3) {
	c.Rotation.Add(&c.Rotation, rot)
	c.UpdateDirection()
}

// AddRotation accumulates mouse look deltas, clamping pitch and wrapping yaw.
func (c *Camera) AddRotation(dx, dy float32) {
	c.Rotation.X += dx
	c.Rotation.Y += dy

	// Clamp vertical rotation (pitch) to 88 degrees to prevent gimbal lock singularity
	const maxVertical float32 = 88.0
	if c.Rotation.X > maxVertical {
		c.Rotation.X = maxVertical
	}
	if c.Rotation.X < -maxVertical {
		c.Rotation.X = -maxVertical
	}

	// Wrap horizontal rotation (yaw) to [0, 360)
	for c.Rotation.Y < 0 {
		c.Rotation.Y += 360.0
	}
	for c.Rotation.Y >= 360.0 {
		c.Rotation.Y -= 360.0
	}

	c.UpdateDirection()
}

// UpdateDirection recalculates the forward direction vector from current pitch and yaw.
func (c *Camera) UpdateDirection() {
	pitchRad := c.Rotation.X * float32(math.Pi/180.0)
	yawRad := c.Rotation.Y * float32(math.Pi/180.0)

	cosPitch := float32(math.Cos(float64(pitchRad)))
	sinPitch := float32(math.Sin(float64(pitchRad)))
	cosYaw := float32(math.Cos(float64(yawRad)))
	sinYaw := float32(math.Sin(float64(yawRad)))

	c.Direction.X = cosPitch * sinYaw
	c.Direction.Y = -sinPitch
	c.Direction.Z = cosPitch * cosYaw
	c.Direction.Normalize(&c.Direction)
}

// Update generates the view matrix, view-projection matrix, and extracts frustum planes.
func (c *Camera) Update() {
	c.target.Add(&c.Position, &c.Direction)
	mathx.Mat4LookAt(c.View, &c.Position, &c.target, &c.UpVector)
	mathx.Mat4Multiply(c.ViewProjection, c.Projection, c.View)

	m := c.ViewProjection
	p := c.FrustumPlanes

	setPlane(p, FrustumLeft, m[3]+m[0], m[7]+m[4], m[11]+m[8], m[15]+m[12])
	setPlane(p, FrustumRight, m[3]-m[0], m[7]-m[4], m[11]-m[8], m[15]-m[12])
	setPlane(p, FrustumBottom, m[3]+m[1], m[7]+m[5], m[11]+m[9], m[15]+m[13])
	setPlane(p, FrustumTop, m[3]-m[1], m[7]-m[5], m[11]-m[9], m[15]-m[13])

	// Near plane: WebGPU (0 <= z <= w) uses row2
	setPlane(p, FrustumNear, m[2], m[6], m[10], m[14])

	setPlane(p, FrustumFar, m[3]-m[2], m[7]-m[6], m[11]-m[10], m[15]-m[14])

	mathx.Mat4Invert(c.InverseViewProjection, c.ViewProjection)
}

// IsBoxInFrustum tests if an AABB intersects or lies within the camera frustum.
func (c *Camera) IsBoxInFrustum(box *mathx.BoundingBox) bool {
	return box.IsVisibleWithPlanes(c.FrustumPlanes)
}
