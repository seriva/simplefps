package systems

import (
	"math"

	"../physics"
)

// CameraFrustumPlanes holds the 6 normalized bounding planes of the camera view frustum.
type CameraFrustumPlanes struct {
	Near   [4]float32
	Far    [4]float32
	Left   [4]float32
	Right  [4]float32
	Top    [4]float32
	Bottom [4]float32
}

func normalizePlane(plane [4]float32) [4]float32 {
	lenSq := plane[0]*plane[0] + plane[1]*plane[1] + plane[2]*plane[2]
	if lenSq > 0 {
		invLen := float32(1.0 / math.Sqrt(float64(lenSq)))
		return [4]float32{
			plane[0] * invLen,
			plane[1] * invLen,
			plane[2] * invLen,
			plane[3] * invLen,
		}
	}
	return plane
}

// Camera manages viewing transformations, projection matrices, and frustum culling.
type Camera struct {
	Position              physics.Vec3
	Rotation              physics.Vec3 // pitch (X), yaw (Y), roll (Z) in degrees
	Direction             physics.Vec3
	UpVector              physics.Vec3
	View                  physics.Mat4
	Projection            physics.Mat4
	ViewProjection        physics.Mat4
	InverseViewProjection physics.Mat4

	Fov       float32
	NearPlane float32
	FarPlane  float32
	IsWebGPU  bool

	FrustumPlanes CameraFrustumPlanes
	FrustumArray  [6][4]float32 // [0]=Left, [1]=Right, [2]=Bottom, [3]=Top, [4]=Near, [5]=Far

	// Pre-allocated scratch to avoid heap allocations in frame loops
	target physics.Vec3
}

// NewCamera creates an initialized Camera.
func NewCamera() *Camera {
	c := &Camera{
		Position:              *physics.NewVec3(0, 0, 0),
		Rotation:              *physics.NewVec3(0, 0, 0),
		Direction:             *physics.NewVec3(0, 0, 1),
		UpVector:              *physics.NewVec3(0, 1, 0),
		View:                  physics.NewMat4(),
		Projection:            physics.NewMat4(),
		ViewProjection:        physics.NewMat4(),
		InverseViewProjection: physics.NewMat4(),
		Fov:                   45.0,
		NearPlane:             0.1,
		FarPlane:              8192.0,
		IsWebGPU:              false,
		FrustumPlanes:         CameraFrustumPlanes{},
		FrustumArray: [6][4]float32{
			{0, 0, 0, 0},
			{0, 0, 0, 0},
			{0, 0, 0, 0},
			{0, 0, 0, 0},
			{0, 0, 0, 0},
			{0, 0, 0, 0},
		},
		target:                *physics.NewVec3(0, 0, 0),
	}
	c.UpdateDirection()
	return c
}

// SetProjection sets camera field of view and clipping planes.
func (c *Camera) SetProjection(fov, nearPlane, farPlane float32) {
	c.Fov = fov
	c.NearPlane = nearPlane
	c.FarPlane = farPlane
}

// UpdateProjection computes the perspective projection matrix for the given aspect ratio.
func (c *Camera) UpdateProjection(aspect float32) {
	fovyRad := c.Fov * float32(math.Pi/180.0)
	if c.IsWebGPU {
		physics.Mat4PerspectiveZO(c.Projection, fovyRad, aspect, c.NearPlane, c.FarPlane)
	} else {
		physics.Mat4Perspective(c.Projection, fovyRad, aspect, c.NearPlane, c.FarPlane)
	}
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
func (c *Camera) Translate(move *physics.Vec3) {
	c.Position.Add(&c.Position, move)
}

// Rotate adds angular rotation in degrees.
func (c *Camera) Rotate(rot *physics.Vec3) {
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
	physics.Mat4LookAt(c.View, &c.Position, &c.target, &c.UpVector)
	physics.Mat4Multiply(c.ViewProjection, c.Projection, c.View)

	m := c.ViewProjection

	// Left plane: row3 + row0
	c.FrustumPlanes.Left = normalizePlane([4]float32{
		m[3] + m[0],
		m[7] + m[4],
		m[11] + m[8],
		m[15] + m[12],
	})

	// Right plane: row3 - row0
	c.FrustumPlanes.Right = normalizePlane([4]float32{
		m[3] - m[0],
		m[7] - m[4],
		m[11] - m[8],
		m[15] - m[12],
	})

	// Bottom plane: row3 + row1
	c.FrustumPlanes.Bottom = normalizePlane([4]float32{
		m[3] + m[1],
		m[7] + m[5],
		m[11] + m[9],
		m[15] + m[13],
	})

	// Top plane: row3 - row1
	c.FrustumPlanes.Top = normalizePlane([4]float32{
		m[3] - m[1],
		m[7] - m[5],
		m[11] - m[9],
		m[15] - m[13],
	})

	// Near plane: WebGPU (0 <= z <= w) uses row2; WebGL (-w <= z <= w) uses row3 + row2
	if c.IsWebGPU {
		c.FrustumPlanes.Near = normalizePlane([4]float32{
			m[2],
			m[6],
			m[10],
			m[14],
		})
	} else {
		c.FrustumPlanes.Near = normalizePlane([4]float32{
			m[3] + m[2],
			m[7] + m[6],
			m[11] + m[10],
			m[15] + m[14],
		})
	}

	// Far plane: row3 - row2
	c.FrustumPlanes.Far = normalizePlane([4]float32{
		m[3] - m[2],
		m[7] - m[6],
		m[11] - m[10],
		m[15] - m[14],
	})

	// Copy into sequential array for frustum culling queries
	c.FrustumArray[0] = c.FrustumPlanes.Left
	c.FrustumArray[1] = c.FrustumPlanes.Right
	c.FrustumArray[2] = c.FrustumPlanes.Bottom
	c.FrustumArray[3] = c.FrustumPlanes.Top
	c.FrustumArray[4] = c.FrustumPlanes.Near
	c.FrustumArray[5] = c.FrustumPlanes.Far

	// Sync with global physics frustum planes for scene-wide culling
	physics.ActiveFrustumPlanes = c.FrustumArray

	physics.Mat4Invert(c.InverseViewProjection, c.ViewProjection)
}

// IsBoxInFrustum tests if an AABB intersects or lies within the camera frustum.
func (c *Camera) IsBoxInFrustum(box *physics.BoundingBox) bool {
	return box.IsVisibleWithPlanes(c.FrustumArray)
}
