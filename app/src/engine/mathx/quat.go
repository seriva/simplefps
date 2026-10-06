//gofront:target both
package mathx

import (
	"math"
)

// Quat represents a quaternion (XYZW).
type Quat struct {
	X float32
	Y float32
	Z float32
	W float32
}

// NewQuat allocates and initializes a new quaternion.
func NewQuat(x, y, z, w float32) *Quat {
	return &Quat{X: x, Y: y, Z: z, W: w}
}

// Set sets quaternion components.
func (out *Quat) Set(x, y, z, w float32) *Quat {
	out.X = x
	out.Y = y
	out.Z = z
	out.W = w
	return out
}

// Identity sets the quaternion to identity (0, 0, 0, 1).
func (out *Quat) Identity() *Quat {
	out.X = 0
	out.Y = 0
	out.Z = 0
	out.W = 1
	return out
}

// Copy copies src to out.
func (out *Quat) Copy(src *Quat) *Quat {
	out.X = src.X
	out.Y = src.Y
	out.Z = src.Z
	out.W = src.W
	return out
}

// Clone creates a clone of this quaternion.
func (out *Quat) Clone() *Quat {
	return &Quat{X: out.X, Y: out.Y, Z: out.Z, W: out.W}
}

// Multiply multiplies quaternions a and b.
func (out *Quat) Multiply(a, b *Quat) *Quat {
	ax := a.X
	ay := a.Y
	az := a.Z
	aw := a.W
	bx := b.X
	by := b.Y
	bz := b.Z
	bw := b.W
	out.X = ax*bw + aw*bx + ay*bz - az*by
	out.Y = ay*bw + aw*by + az*bx - ax*bz
	out.Z = az*bw + aw*bz + ax*by - ay*bx
	out.W = aw*bw - ax*bx - ay*by - az*bz
	return out
}

// Mul is an alias for Multiply.
func (out *Quat) Mul(a, b *Quat) *Quat {
	return out.Multiply(a, b)
}

// Dot calculates dot product between out and b.
func (out *Quat) Dot(b *Quat) float32 {
	return out.X*b.X + out.Y*b.Y + out.Z*b.Z + out.W*b.W
}

// Length returns the magnitude of the quaternion.
func (out *Quat) Length() float32 {
	return float32(math.Sqrt(float64(out.X*out.X + out.Y*out.Y + out.Z*out.Z + out.W*out.W)))
}

// SquaredLength returns the squared magnitude of the quaternion.
func (out *Quat) SquaredLength() float32 {
	return out.X*out.X + out.Y*out.Y + out.Z*out.Z + out.W*out.W
}

// Normalize normalizes a quaternion.
func (out *Quat) Normalize(a *Quat) *Quat {
	x := a.X
	y := a.Y
	z := a.Z
	w := a.W
	lenSq := x*x + y*y + z*z + w*w
	if lenSq > 0 {
		inv := float32(1.0 / math.Sqrt(float64(lenSq)))
		out.X = x * inv
		out.Y = y * inv
		out.Z = z * inv
		out.W = w * inv
	} else {
		out.X = 0
		out.Y = 0
		out.Z = 0
		out.W = 1
	}
	return out
}

// Conjugate computes the conjugate of a.
func (out *Quat) Conjugate(a *Quat) *Quat {
	out.X = -a.X
	out.Y = -a.Y
	out.Z = -a.Z
	out.W = a.W
	return out
}

// Invert computes the inverse of quaternion a.
func (out *Quat) Invert(a *Quat) *Quat {
	a0 := a.X
	a1 := a.Y
	a2 := a.Z
	a3 := a.W
	dot := a0*a0 + a1*a1 + a2*a2 + a3*a3
	if dot != 0 {
		invDot := 1.0 / dot
		out.X = -a0 * invDot
		out.Y = -a1 * invDot
		out.Z = -a2 * invDot
		out.W = a3 * invDot
	} else {
		out.X = 0
		out.Y = 0
		out.Z = 0
		out.W = 0
	}
	return out
}

// FromAxisAngle sets out from a rotation axis and angle in radians.
func (out *Quat) FromAxisAngle(axis *Vec3, rad float32) *Quat {
	halfRad := rad * 0.5
	s := float32(math.Sin(float64(halfRad)))
	out.X = s * axis.X
	out.Y = s * axis.Y
	out.Z = s * axis.Z
	out.W = float32(math.Cos(float64(halfRad)))
	return out
}

// Slerp spherical-linearly interpolates between a and b by t.
func (out *Quat) Slerp(a, b *Quat, t float32) *Quat {
	ax := a.X
	ay := a.Y
	az := a.Z
	aw := a.W
	bx := b.X
	by := b.Y
	bz := b.Z
	bw := b.W

	cosom := ax*bx + ay*by + az*bz + aw*bw
	if cosom < 0 {
		cosom = -cosom
		bx = -bx
		by = -by
		bz = -bz
		bw = -bw
	}

	var scale0, scale1 float32
	if (1.0 - cosom) > 0.000001 {
		omega := float32(math.Acos(float64(cosom)))
		sinom := float32(math.Sin(float64(omega)))
		scale0 = float32(math.Sin(float64((1.0-t)*omega))) / sinom
		scale1 = float32(math.Sin(float64(t*omega))) / sinom
	} else {
		scale0 = 1.0 - t
		scale1 = t
	}

	out.X = scale0*ax + scale1*bx
	out.Y = scale0*ay + scale1*by
	out.Z = scale0*az + scale1*bz
	out.W = scale0*aw + scale1*bw
	return out
}

// RotationTo sets out to represent shortest rotation from vector a to b.
func (out *Quat) RotationTo(a, b *Vec3) *Quat {
	var tmp Vec3
	dot := a.Dot(b)
	if dot < -0.999999 {
		// cross(+X, a); fall back to cross(+Y, a) when a is parallel to X.
		tmp.Set(0, -a.Z, a.Y)
		if tmp.Length() < 0.000001 {
			tmp.Set(a.Z, 0, -a.X)
		}
		tmp.Normalize(&tmp)
		out.FromAxisAngle(&tmp, float32(math.Pi))
		return out
	} else if dot > 0.999999 {
		out.X = 0
		out.Y = 0
		out.Z = 0
		out.W = 1
		return out
	} else {
		tmp.Cross(a, b)
		out.X = tmp.X
		out.Y = tmp.Y
		out.Z = tmp.Z
		out.W = 1 + dot
		out.Normalize(out)
		return out
	}
}
