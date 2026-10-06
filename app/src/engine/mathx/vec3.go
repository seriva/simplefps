//gofront:target both
package mathx

import (
	"math"
)

// Vec3 represents a 3-dimensional vector of 32-bit floats.
type Vec3 struct {
	X float32
	Y float32
	Z float32
}

// NewVec3 allocates and initializes a new Vec3.
func NewVec3(x, y, z float32) *Vec3 {
	return &Vec3{X: x, Y: y, Z: z}
}

// Set sets the components of this Vec3.
func (out *Vec3) Set(x, y, z float32) *Vec3 {
	out.X = x
	out.Y = y
	out.Z = z
	return out
}

// Copy copies the components of src into out.
func (out *Vec3) Copy(src *Vec3) *Vec3 {
	out.X = src.X
	out.Y = src.Y
	out.Z = src.Z
	return out
}

// Clone creates a clone of this Vec3.
func (out *Vec3) Clone() *Vec3 {
	return &Vec3{X: out.X, Y: out.Y, Z: out.Z}
}

// Zero sets all components to zero.
func (out *Vec3) Zero() *Vec3 {
	out.X = 0
	out.Y = 0
	out.Z = 0
	return out
}

// Add adds a and b and stores the result in out.
func (out *Vec3) Add(a, b *Vec3) *Vec3 {
	out.X = a.X + b.X
	out.Y = a.Y + b.Y
	out.Z = a.Z + b.Z
	return out
}

// Sub subtracts b from a and stores the result in out.
func (out *Vec3) Sub(a, b *Vec3) *Vec3 {
	out.X = a.X - b.X
	out.Y = a.Y - b.Y
	out.Z = a.Z - b.Z
	return out
}

// Subtract is an alias for Sub.
func (out *Vec3) Subtract(a, b *Vec3) *Vec3 {
	return out.Sub(a, b)
}

// Multiply multiplies components of a and b.
func (out *Vec3) Multiply(a, b *Vec3) *Vec3 {
	out.X = a.X * b.X
	out.Y = a.Y * b.Y
	out.Z = a.Z * b.Z
	return out
}

// Divide divides components of a by b.
func (out *Vec3) Divide(a, b *Vec3) *Vec3 {
	out.X = a.X / b.X
	out.Y = a.Y / b.Y
	out.Z = a.Z / b.Z
	return out
}

// Scale scales vector a by scalar s and stores the result in out.
func (out *Vec3) Scale(a *Vec3, s float32) *Vec3 {
	out.X = a.X * s
	out.Y = a.Y * s
	out.Z = a.Z * s
	return out
}

// ScaleAndAdd adds a and (b * s) and stores the result in out.
func (out *Vec3) ScaleAndAdd(a, b *Vec3, s float32) *Vec3 {
	out.X = a.X + b.X*s
	out.Y = a.Y + b.Y*s
	out.Z = a.Z + b.Z*s
	return out
}

// Negate negates components of a.
func (out *Vec3) Negate(a *Vec3) *Vec3 {
	out.X = -a.X
	out.Y = -a.Y
	out.Z = -a.Z
	return out
}

// Cross computes cross product of a and b.
func (out *Vec3) Cross(a, b *Vec3) *Vec3 {
	ax := a.X
	ay := a.Y
	az := a.Z
	bx := b.X
	by := b.Y
	bz := b.Z
	out.X = ay*bz - az*by
	out.Y = az*bx - ax*bz
	out.Z = ax*by - ay*bx
	return out
}

// Dot computes the dot product of out and b.
func (out *Vec3) Dot(b *Vec3) float32 {
	return out.X*b.X + out.Y*b.Y + out.Z*b.Z
}

// Length returns the Euclidean length of the vector.
func (out *Vec3) Length() float32 {
	return float32(math.Sqrt(float64(out.X*out.X + out.Y*out.Y + out.Z*out.Z)))
}

// SquaredLength returns the squared Euclidean length of the vector.
func (out *Vec3) SquaredLength() float32 {
	return out.X*out.X + out.Y*out.Y + out.Z*out.Z
}

// Distance computes distance from out to b.
func (out *Vec3) Distance(b *Vec3) float32 {
	dx := out.X - b.X
	dy := out.Y - b.Y
	dz := out.Z - b.Z
	return float32(math.Sqrt(float64(dx*dx + dy*dy + dz*dz)))
}

// SquaredDistance computes squared distance from out to b.
func (out *Vec3) SquaredDistance(b *Vec3) float32 {
	dx := out.X - b.X
	dy := out.Y - b.Y
	dz := out.Z - b.Z
	return dx*dx + dy*dy + dz*dz
}

// Normalize normalizes vector a into out.
func (out *Vec3) Normalize(a *Vec3) *Vec3 {
	x := a.X
	y := a.Y
	z := a.Z
	lenSq := x*x + y*y + z*z
	if lenSq > 0 {
		inv := float32(1.0 / math.Sqrt(float64(lenSq)))
		out.X = x * inv
		out.Y = y * inv
		out.Z = z * inv
	} else {
		out.X = 0
		out.Y = 0
		out.Z = 0
	}
	return out
}

// Min sets out to component-wise min of a and b.
func (out *Vec3) Min(a, b *Vec3) *Vec3 {
	if a.X < b.X {
		out.X = a.X
	} else {
		out.X = b.X
	}
	if a.Y < b.Y {
		out.Y = a.Y
	} else {
		out.Y = b.Y
	}
	if a.Z < b.Z {
		out.Z = a.Z
	} else {
		out.Z = b.Z
	}
	return out
}

// Max sets out to component-wise max of a and b.
func (out *Vec3) Max(a, b *Vec3) *Vec3 {
	if a.X > b.X {
		out.X = a.X
	} else {
		out.X = b.X
	}
	if a.Y > b.Y {
		out.Y = a.Y
	} else {
		out.Y = b.Y
	}
	if a.Z > b.Z {
		out.Z = a.Z
	} else {
		out.Z = b.Z
	}
	return out
}

// Lerp linearly interpolates between a and b by t.
func (out *Vec3) Lerp(a, b *Vec3, t float32) *Vec3 {
	out.X = a.X + t*(b.X-a.X)
	out.Y = a.Y + t*(b.Y-a.Y)
	out.Z = a.Z + t*(b.Z-a.Z)
	return out
}

// TransformMat4 transforms a by matrix m with perspective divide.
func (out *Vec3) TransformMat4(a *Vec3, m Mat4) *Vec3 {
	x := a.X
	y := a.Y
	z := a.Z
	w := m[3]*x + m[7]*y + m[11]*z + m[15]
	if w == 0 {
		w = 1
	}
	out.X = (m[0]*x + m[4]*y + m[8]*z + m[12]) / w
	out.Y = (m[1]*x + m[5]*y + m[9]*z + m[13]) / w
	out.Z = (m[2]*x + m[6]*y + m[10]*z + m[14]) / w
	return out
}

// TransformQuat transforms a by quaternion q.
func (out *Vec3) TransformQuat(a *Vec3, q *Quat) *Vec3 {
	qx := q.X
	qy := q.Y
	qz := q.Z
	qw := q.W
	vx := a.X
	vy := a.Y
	vz := a.Z
	tx := 2 * (qy*vz - qz*vy)
	ty := 2 * (qz*vx - qx*vz)
	tz := 2 * (qx*vy - qy*vx)
	out.X = vx + qw*tx + (qy*tz - qz*ty)
	out.Y = vy + qw*ty + (qz*tx - qx*tz)
	out.Z = vz + qw*tz + (qx*ty - qy*tx)
	return out
}

// TransformQuatConjugate transforms a by the conjugate (inverse rotation) of unit
// quaternion q without materialising the conjugate.
func (out *Vec3) TransformQuatConjugate(a *Vec3, q *Quat) *Vec3 {
	qx := -q.X
	qy := -q.Y
	qz := -q.Z
	qw := q.W
	vx := a.X
	vy := a.Y
	vz := a.Z
	tx := 2 * (qy*vz - qz*vy)
	ty := 2 * (qz*vx - qx*vz)
	tz := 2 * (qx*vy - qy*vx)
	out.X = vx + qw*tx + (qy*tz - qz*ty)
	out.Y = vy + qw*ty + (qz*tx - qx*tz)
	out.Z = vz + qw*tz + (qx*ty - qy*tx)
	return out
}

// RotateX rotates vector a around origin along X-axis.
func (out *Vec3) RotateX(a, origin *Vec3, rad float32) *Vec3 {
	px := a.X - origin.X
	py := a.Y - origin.Y
	pz := a.Z - origin.Z
	c := float32(math.Cos(float64(rad)))
	s := float32(math.Sin(float64(rad)))
	rx := px
	ry := py*c - pz*s
	rz := py*s + pz*c
	out.X = rx + origin.X
	out.Y = ry + origin.Y
	out.Z = rz + origin.Z
	return out
}

// RotateY rotates vector a around origin along Y-axis.
func (out *Vec3) RotateY(a, origin *Vec3, rad float32) *Vec3 {
	px := a.X - origin.X
	py := a.Y - origin.Y
	pz := a.Z - origin.Z
	c := float32(math.Cos(float64(rad)))
	s := float32(math.Sin(float64(rad)))
	rx := pz*s + px*c
	ry := py
	rz := pz*c - px*s
	out.X = rx + origin.X
	out.Y = ry + origin.Y
	out.Z = rz + origin.Z
	return out
}

// RotateZ rotates vector a around origin along Z-axis.
func (out *Vec3) RotateZ(a, origin *Vec3, rad float32) *Vec3 {
	px := a.X - origin.X
	py := a.Y - origin.Y
	pz := a.Z - origin.Z
	c := float32(math.Cos(float64(rad)))
	s := float32(math.Sin(float64(rad)))
	rx := px*c - py*s
	ry := px*s + py*c
	rz := pz
	out.X = rx + origin.X
	out.Y = ry + origin.Y
	out.Z = rz + origin.Z
	return out
}
