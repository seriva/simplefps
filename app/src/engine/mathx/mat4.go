//gofront:target both
package mathx

import (
	"math"
)

// Mat4 represents a 4x4 matrix in column-major order backed by []float32.
type Mat4 = []float32

// NewMat4 creates a new identity Mat4.
func NewMat4() Mat4 {
	m := make([]float32, 16)
	m[0] = 1
	m[5] = 1
	m[10] = 1
	m[15] = 1
	return m
}

// Mat4Clone creates a clone of source matrix a.
func Mat4Clone(a Mat4) Mat4 {
	out := make([]float32, 16)
	copy(out, a)
	return out
}

// Mat4Copy copies matrix a into out.
func Mat4Copy(out, a Mat4) Mat4 {
	copy(out, a)
	return out
}

// Mat4FromValues creates a new Mat4 with given values.
func Mat4FromValues(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33 float32) Mat4 {
	out := make([]float32, 16)
	out[0] = m00
	out[1] = m01
	out[2] = m02
	out[3] = m03
	out[4] = m10
	out[5] = m11
	out[6] = m12
	out[7] = m13
	out[8] = m20
	out[9] = m21
	out[10] = m22
	out[11] = m23
	out[12] = m30
	out[13] = m31
	out[14] = m32
	out[15] = m33
	return out
}

// Mat4Set sets the components of out.
func Mat4Set(out Mat4, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33 float32) Mat4 {
	out[0] = m00
	out[1] = m01
	out[2] = m02
	out[3] = m03
	out[4] = m10
	out[5] = m11
	out[6] = m12
	out[7] = m13
	out[8] = m20
	out[9] = m21
	out[10] = m22
	out[11] = m23
	out[12] = m30
	out[13] = m31
	out[14] = m32
	out[15] = m33
	return out
}

// Mat4Identity resets out to an identity matrix.
func Mat4Identity(out Mat4) Mat4 {
	out[0] = 1
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = 1
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = 1
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4Transpose transposes matrix a and stores in out.
func Mat4Transpose(out, a Mat4) Mat4 {
	a01, a02, a03 := a[1], a[2], a[3]
	a12, a13 := a[6], a[7]
	a23 := a[11]

	out[0] = a[0]
	out[1] = a[4]
	out[2] = a[8]
	out[3] = a[12]
	out[4] = a01
	out[5] = a[5]
	out[6] = a[9]
	out[7] = a[13]
	out[8] = a02
	out[9] = a12
	out[10] = a[10]
	out[11] = a[14]
	out[12] = a03
	out[13] = a13
	out[14] = a23
	out[15] = a[15]
	return out
}

// Mat4Invert inverts matrix a and stores the result in out.
// Returns out, or nil if matrix is not invertible.
func Mat4Invert(out, a Mat4) Mat4 {
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]
	a30, a31, a32, a33 := a[12], a[13], a[14], a[15]

	b00 := a00*a11 - a01*a10
	b01 := a00*a12 - a02*a10
	b02 := a00*a13 - a03*a10
	b03 := a01*a12 - a02*a11
	b04 := a01*a13 - a03*a11
	b05 := a02*a13 - a03*a12
	b06 := a20*a31 - a21*a30
	b07 := a20*a32 - a22*a30
	b08 := a20*a33 - a23*a30
	b09 := a21*a32 - a22*a31
	b10 := a21*a33 - a23*a31
	b11 := a22*a33 - a23*a32

	det := b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06
	if det == 0 {
		return nil
	}
	det = 1.0 / det

	out[0] = (a11*b11 - a12*b10 + a13*b09) * det
	out[1] = (a02*b10 - a01*b11 - a03*b09) * det
	out[2] = (a31*b05 - a32*b04 + a33*b03) * det
	out[3] = (a22*b04 - a21*b05 - a23*b03) * det
	out[4] = (a12*b08 - a10*b11 - a13*b07) * det
	out[5] = (a00*b11 - a02*b08 + a03*b07) * det
	out[6] = (a32*b02 - a30*b05 - a33*b01) * det
	out[7] = (a20*b05 - a22*b02 + a23*b01) * det
	out[8] = (a10*b10 - a11*b08 + a13*b06) * det
	out[9] = (a01*b08 - a00*b10 - a03*b06) * det
	out[10] = (a30*b04 - a31*b02 + a33*b00) * det
	out[11] = (a21*b02 - a20*b04 - a23*b00) * det
	out[12] = (a11*b07 - a10*b09 - a12*b06) * det
	out[13] = (a00*b09 - a01*b07 + a02*b06) * det
	out[14] = (a31*b01 - a30*b03 - a32*b00) * det
	out[15] = (a20*b03 - a21*b01 + a22*b00) * det
	return out
}

// Mat4Determinant calculates the determinant of matrix a.
func Mat4Determinant(a Mat4) float32 {
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]
	a30, a31, a32, a33 := a[12], a[13], a[14], a[15]

	b0 := a00*a11 - a01*a10
	b1 := a00*a12 - a02*a10
	b2 := a01*a12 - a02*a11
	b3 := a20*a31 - a21*a30
	b4 := a20*a32 - a22*a30
	b5 := a21*a32 - a22*a31
	b6 := a00*b5 - a01*b4 + a02*b3
	b7 := a10*b5 - a11*b4 + a12*b3
	b8 := a20*b2 - a21*b1 + a22*b0
	b9 := a30*b2 - a31*b1 + a32*b0

	return a13*b6 - a03*b7 + a33*b8 - a23*b9
}

// Mat4Multiply multiplies matrices a and b and stores the result in out.
func Mat4Multiply(out, a, b Mat4) Mat4 {
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]
	a30, a31, a32, a33 := a[12], a[13], a[14], a[15]

	b0 := b[0]
	b1 := b[1]
	b2 := b[2]
	b3 := b[3]
	out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[4]
	b1 = b[5]
	b2 = b[6]
	b3 = b[7]
	out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[8]
	b1 = b[9]
	b2 = b[10]
	b3 = b[11]
	out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[12]
	b1 = b[13]
	b2 = b[14]
	b3 = b[15]
	out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33
	return out
}

// Mat4Mul is an alias for Mat4Multiply.
func Mat4Mul(out, a, b Mat4) Mat4 {
	return Mat4Multiply(out, a, b)
}

// Mat4Translate translates matrix a by vector v and stores the result in out.
func Mat4Translate(out, a Mat4, v *Vec3) Mat4 {
	x, y, z := v.X, v.Y, v.Z
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]

	out[0] = a00
	out[1] = a01
	out[2] = a02
	out[3] = a03
	out[4] = a10
	out[5] = a11
	out[6] = a12
	out[7] = a13
	out[8] = a20
	out[9] = a21
	out[10] = a22
	out[11] = a23
	out[12] = a00*x + a10*y + a20*z + a[12]
	out[13] = a01*x + a11*y + a21*z + a[13]
	out[14] = a02*x + a12*y + a22*z + a[14]
	out[15] = a03*x + a13*y + a23*z + a[15]
	return out
}

// Mat4Scale scales matrix a by vector v and stores in out.
func Mat4Scale(out, a Mat4, v *Vec3) Mat4 {
	x, y, z := v.X, v.Y, v.Z
	out[0] = a[0] * x
	out[1] = a[1] * x
	out[2] = a[2] * x
	out[3] = a[3] * x
	out[4] = a[4] * y
	out[5] = a[5] * y
	out[6] = a[6] * y
	out[7] = a[7] * y
	out[8] = a[8] * z
	out[9] = a[9] * z
	out[10] = a[10] * z
	out[11] = a[11] * z
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]
	return out
}

// Mat4Rotate rotates matrix a by rad radians around axis.
func Mat4Rotate(out, a Mat4, rad float32, axis *Vec3) Mat4 {
	x, y, z := axis.X, axis.Y, axis.Z
	lenSq := x*x + y*y + z*z
	if lenSq < 1e-12 {
		return nil
	}
	lenInv := float32(1.0 / math.Sqrt(float64(lenSq)))
	x *= lenInv
	y *= lenInv
	z *= lenInv

	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	t := 1.0 - c

	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]

	b00 := x*x*t + c
	b01 := y*x*t + z*s
	b02 := z*x*t - y*s
	b10 := x*y*t - z*s
	b11 := y*y*t + c
	b12 := z*y*t + x*s
	b20 := x*z*t + y*s
	b21 := y*z*t - x*s
	b22 := z*z*t + c

	out[0] = a00*b00 + a10*b01 + a20*b02
	out[1] = a01*b00 + a11*b01 + a21*b02
	out[2] = a02*b00 + a12*b01 + a22*b02
	out[3] = a03*b00 + a13*b01 + a23*b02
	out[4] = a00*b10 + a10*b11 + a20*b12
	out[5] = a01*b10 + a11*b11 + a21*b12
	out[6] = a02*b10 + a12*b11 + a22*b12
	out[7] = a03*b10 + a13*b11 + a23*b12
	out[8] = a00*b20 + a10*b21 + a20*b22
	out[9] = a01*b20 + a11*b21 + a21*b22
	out[10] = a02*b20 + a12*b21 + a22*b22
	out[11] = a03*b20 + a13*b21 + a23*b22
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]
	return out
}

// Mat4RotateX rotates matrix a by rad radians around X axis.
func Mat4RotateX(out, a Mat4, rad float32) Mat4 {
	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]

	out[0] = a[0]
	out[1] = a[1]
	out[2] = a[2]
	out[3] = a[3]
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]

	out[4] = a10*c + a20*s
	out[5] = a11*c + a21*s
	out[6] = a12*c + a22*s
	out[7] = a13*c + a23*s
	out[8] = a20*c - a10*s
	out[9] = a21*c - a11*s
	out[10] = a22*c - a12*s
	out[11] = a23*c - a13*s
	return out
}

// Mat4RotateY rotates matrix a by rad radians around Y axis.
func Mat4RotateY(out, a Mat4, rad float32) Mat4 {
	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]

	out[4] = a[4]
	out[5] = a[5]
	out[6] = a[6]
	out[7] = a[7]
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]

	out[0] = a00*c - a20*s
	out[1] = a01*c - a21*s
	out[2] = a02*c - a22*s
	out[3] = a03*c - a23*s
	out[8] = a00*s + a20*c
	out[9] = a01*s + a21*c
	out[10] = a02*s + a22*c
	out[11] = a03*s + a23*c
	return out
}

// Mat4RotateZ rotates matrix a by rad radians around Z axis.
func Mat4RotateZ(out, a Mat4, rad float32) Mat4 {
	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]

	out[8] = a[8]
	out[9] = a[9]
	out[10] = a[10]
	out[11] = a[11]
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]

	out[0] = a00*c + a10*s
	out[1] = a01*c + a11*s
	out[2] = a02*c + a12*s
	out[3] = a03*c + a13*s
	out[4] = a10*c - a00*s
	out[5] = a11*c - a01*s
	out[6] = a12*c - a02*s
	out[7] = a13*c - a03*s
	return out
}

// Mat4FromTranslation creates a matrix from translation vector v.
func Mat4FromTranslation(out Mat4, v *Vec3) Mat4 {
	out[0] = 1
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = 1
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = 1
	out[11] = 0
	out[12] = v.X
	out[13] = v.Y
	out[14] = v.Z
	out[15] = 1
	return out
}

// Mat4FromScaling creates a matrix from scaling vector v.
func Mat4FromScaling(out Mat4, v *Vec3) Mat4 {
	out[0] = v.X
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = v.Y
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = v.Z
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4FromRotation creates a matrix from rotation angle rad around axis.
func Mat4FromRotation(out Mat4, rad float32, axis *Vec3) Mat4 {
	x, y, z := axis.X, axis.Y, axis.Z
	lenSq := x*x + y*y + z*z
	if lenSq < 1e-12 {
		return nil
	}
	lenInv := float32(1.0 / math.Sqrt(float64(lenSq)))
	x *= lenInv
	y *= lenInv
	z *= lenInv

	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	t := 1.0 - c

	out[0] = x*x*t + c
	out[1] = y*x*t + z*s
	out[2] = z*x*t - y*s
	out[3] = 0
	out[4] = x*y*t - z*s
	out[5] = y*y*t + c
	out[6] = z*y*t + x*s
	out[7] = 0
	out[8] = x*z*t + y*s
	out[9] = y*z*t - x*s
	out[10] = z*z*t + c
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4FromXRotation creates a matrix from angle rad around X axis.
func Mat4FromXRotation(out Mat4, rad float32) Mat4 {
	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	out[0] = 1
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = c
	out[6] = s
	out[7] = 0
	out[8] = 0
	out[9] = -s
	out[10] = c
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4FromYRotation creates a matrix from angle rad around Y axis.
func Mat4FromYRotation(out Mat4, rad float32) Mat4 {
	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	out[0] = c
	out[1] = 0
	out[2] = -s
	out[3] = 0
	out[4] = 0
	out[5] = 1
	out[6] = 0
	out[7] = 0
	out[8] = s
	out[9] = 0
	out[10] = c
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4FromZRotation creates a matrix from angle rad around Z axis.
func Mat4FromZRotation(out Mat4, rad float32) Mat4 {
	s := float32(math.Sin(float64(rad)))
	c := float32(math.Cos(float64(rad)))
	out[0] = c
	out[1] = s
	out[2] = 0
	out[3] = 0
	out[4] = -s
	out[5] = c
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = 1
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4FromQuat calculates a 4x4 matrix from quaternion q.
func Mat4FromQuat(out Mat4, q *Quat) Mat4 {
	x, y, z, w := q.X, q.Y, q.Z, q.W
	x2 := x + x
	y2 := y + y
	z2 := z + z
	xx := x * x2
	yx := y * x2
	yy := y * y2
	zx := z * x2
	zy := z * y2
	zz := z * z2
	wx := w * x2
	wy := w * y2
	wz := w * z2

	out[0] = 1.0 - yy - zz
	out[1] = yx + wz
	out[2] = zx - wy
	out[3] = 0
	out[4] = yx - wz
	out[5] = 1.0 - xx - zz
	out[6] = zy + wx
	out[7] = 0
	out[8] = zx + wy
	out[9] = zy - wx
	out[10] = 1.0 - xx - yy
	out[11] = 0
	out[12] = 0
	out[13] = 0
	out[14] = 0
	out[15] = 1
	return out
}

// Mat4FromRotationTranslation creates a matrix from rotation quaternion q and translation vector v.
func Mat4FromRotationTranslation(out Mat4, q *Quat, v *Vec3) Mat4 {
	x, y, z, w := q.X, q.Y, q.Z, q.W
	x2 := x + x
	y2 := y + y
	z2 := z + z
	xx := x * x2
	xy := x * y2
	xz := x * z2
	yy := y * y2
	yz := y * z2
	zz := z * z2
	wx := w * x2
	wy := w * y2
	wz := w * z2

	out[0] = 1.0 - (yy + zz)
	out[1] = xy + wz
	out[2] = xz - wy
	out[3] = 0
	out[4] = xy - wz
	out[5] = 1.0 - (xx + zz)
	out[6] = yz + wx
	out[7] = 0
	out[8] = xz + wy
	out[9] = yz - wx
	out[10] = 1.0 - (xx + yy)
	out[11] = 0
	out[12] = v.X
	out[13] = v.Y
	out[14] = v.Z
	out[15] = 1
	return out
}

// Mat4FromRotationTranslationScale creates a matrix from quaternion q, translation v, and scale s.
func Mat4FromRotationTranslationScale(out Mat4, q *Quat, v, s *Vec3) Mat4 {
	x, y, z, w := q.X, q.Y, q.Z, q.W
	x2 := x + x
	y2 := y + y
	z2 := z + z
	xx := x * x2
	xy := x * y2
	xz := x * z2
	yy := y * y2
	yz := y * z2
	zz := z * z2
	wx := w * x2
	wy := w * y2
	wz := w * z2
	sx, sy, sz := s.X, s.Y, s.Z

	out[0] = (1.0 - (yy + zz)) * sx
	out[1] = (xy + wz) * sx
	out[2] = (xz - wy) * sx
	out[3] = 0
	out[4] = (xy - wz) * sy
	out[5] = (1.0 - (xx + zz)) * sy
	out[6] = (yz + wx) * sy
	out[7] = 0
	out[8] = (xz + wy) * sz
	out[9] = (yz - wx) * sz
	out[10] = (1.0 - (xx + yy)) * sz
	out[11] = 0
	out[12] = v.X
	out[13] = v.Y
	out[14] = v.Z
	out[15] = 1
	return out
}

// Mat4FromRotationTranslationScaleOrigin creates a matrix from q, v, s around origin o.
func Mat4FromRotationTranslationScaleOrigin(out Mat4, q *Quat, v, s, o *Vec3) Mat4 {
	x, y, z, w := q.X, q.Y, q.Z, q.W
	x2 := x + x
	y2 := y + y
	z2 := z + z
	xx := x * x2
	xy := x * y2
	xz := x * z2
	yy := y * y2
	yz := y * z2
	zz := z * z2
	wx := w * x2
	wy := w * y2
	wz := w * z2
	sx, sy, sz := s.X, s.Y, s.Z
	ox, oy, oz := o.X, o.Y, o.Z

	out0 := (1.0 - (yy + zz)) * sx
	out1 := (xy + wz) * sx
	out2 := (xz - wy) * sx
	out4 := (xy - wz) * sy
	out5 := (1.0 - (xx + zz)) * sy
	out6 := (yz + wx) * sy
	out8 := (xz + wy) * sz
	out9 := (yz - wx) * sz
	out10 := (1.0 - (xx + yy)) * sz

	out[0] = out0
	out[1] = out1
	out[2] = out2
	out[3] = 0
	out[4] = out4
	out[5] = out5
	out[6] = out6
	out[7] = 0
	out[8] = out8
	out[9] = out9
	out[10] = out10
	out[11] = 0
	out[12] = v.X + ox - (out0*ox + out4*oy + out8*oz)
	out[13] = v.Y + oy - (out1*ox + out5*oy + out9*oz)
	out[14] = v.Z + oz - (out2*ox + out6*oy + out10*oz)
	out[15] = 1
	return out
}

// Mat4Perspective generates a perspective projection matrix (WebGL clip volume [-1, 1]).
func Mat4Perspective(out Mat4, fovy, aspect, near, far float32) Mat4 {
	f := float32(1.0 / math.Tan(float64(fovy)/2.0))
	out[0] = f / aspect
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = f
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[11] = -1
	out[12] = 0
	out[13] = 0
	out[15] = 0

	nf := 1.0 / (near - far)
	out[10] = (far + near) * nf
	out[14] = 2.0 * far * near * nf
	return out
}

// Mat4PerspectiveZO generates a perspective projection matrix for WebGPU (clip volume [0, 1]).
func Mat4PerspectiveZO(out Mat4, fovy, aspect, near, far float32) Mat4 {
	f := float32(1.0 / math.Tan(float64(fovy)/2.0))
	out[0] = f / aspect
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = f
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[11] = -1
	out[12] = 0
	out[13] = 0
	out[15] = 0

	nf := 1.0 / (near - far)
	out[10] = far * nf
	out[14] = far * near * nf
	return out
}

// Mat4Ortho generates an orthogonal projection matrix (WebGL clip volume [-1, 1]).
func Mat4Ortho(out Mat4, left, right, bottom, top, near, far float32) Mat4 {
	lr := 1.0 / (left - right)
	bt := 1.0 / (bottom - top)
	nf := 1.0 / (near - far)

	out[0] = -2.0 * lr
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = -2.0 * bt
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = 2.0 * nf
	out[11] = 0
	out[12] = (left + right) * lr
	out[13] = (top + bottom) * bt
	out[14] = (far + near) * nf
	out[15] = 1
	return out
}

// Mat4OrthoZO generates an orthogonal projection matrix for WebGPU (clip volume [0, 1]).
func Mat4OrthoZO(out Mat4, left, right, bottom, top, near, far float32) Mat4 {
	lr := 1.0 / (left - right)
	bt := 1.0 / (bottom - top)
	nf := 1.0 / (near - far)

	out[0] = -2.0 * lr
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = -2.0 * bt
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = nf
	out[11] = 0
	out[12] = (left + right) * lr
	out[13] = (top + bottom) * bt
	out[14] = near * nf
	out[15] = 1
	return out
}

// Mat4LookAt generates a view matrix looking from eye towards center with given up vector.
func Mat4LookAt(out Mat4, eye, center, up *Vec3) Mat4 {
	eyex, eyey, eyez := eye.X, eye.Y, eye.Z
	upx, upy, upz := up.X, up.Y, up.Z
	centerx, centery, centerz := center.X, center.Y, center.Z

	if float32(math.Abs(float64(eyex-centerx))) < 1e-6 &&
		float32(math.Abs(float64(eyey-centery))) < 1e-6 &&
		float32(math.Abs(float64(eyez-centerz))) < 1e-6 {
		return Mat4Identity(out)
	}

	z0 := eyex - centerx
	z1 := eyey - centery
	z2 := eyez - centerz
	lenZ := float32(1.0 / math.Sqrt(float64(z0*z0+z1*z1+z2*z2)))
	z0 *= lenZ
	z1 *= lenZ
	z2 *= lenZ

	x0 := upy*z2 - upz*z1
	x1 := upz*z0 - upx*z2
	x2 := upx*z1 - upy*z0
	lenX := float32(math.Sqrt(float64(x0*x0 + x1*x1 + x2*x2)))
	if lenX != 0 {
		lenX = 1.0 / lenX
		x0 *= lenX
		x1 *= lenX
		x2 *= lenX
	}

	y0 := z1*x2 - z2*x1
	y1 := z2*x0 - z0*x2
	y2 := z0*x1 - z1*x0
	lenY := float32(math.Sqrt(float64(y0*y0 + y1*y1 + y2*y2)))
	if lenY != 0 {
		lenY = 1.0 / lenY
		y0 *= lenY
		y1 *= lenY
		y2 *= lenY
	}

	out[0] = x0
	out[1] = y0
	out[2] = z0
	out[3] = 0
	out[4] = x1
	out[5] = y1
	out[6] = z1
	out[7] = 0
	out[8] = x2
	out[9] = y2
	out[10] = z2
	out[11] = 0
	out[12] = -(x0*eyex + x1*eyey + x2*eyez)
	out[13] = -(y0*eyex + y1*eyey + y2*eyez)
	out[14] = -(z0*eyex + z1*eyey + z2*eyez)
	out[15] = 1
	return out
}

// Mat4TargetTo generates a matrix that targets an eye position towards target.
func Mat4TargetTo(out Mat4, eye, target, up *Vec3) Mat4 {
	eyex, eyey, eyez := eye.X, eye.Y, eye.Z
	upx, upy, upz := up.X, up.Y, up.Z

	z0 := eyex - target.X
	z1 := eyey - target.Y
	z2 := eyez - target.Z
	lenSqZ := z0*z0 + z1*z1 + z2*z2
	if lenSqZ > 0 {
		lenInvZ := float32(1.0 / math.Sqrt(float64(lenSqZ)))
		z0 *= lenInvZ
		z1 *= lenInvZ
		z2 *= lenInvZ
	}

	x0 := upy*z2 - upz*z1
	x1 := upz*z0 - upx*z2
	x2 := upx*z1 - upy*z0
	lenSqX := x0*x0 + x1*x1 + x2*x2
	if lenSqX > 0 {
		lenInvX := float32(1.0 / math.Sqrt(float64(lenSqX)))
		x0 *= lenInvX
		x1 *= lenInvX
		x2 *= lenInvX
	}

	out[0] = x0
	out[1] = x1
	out[2] = x2
	out[3] = 0
	out[4] = z1*x2 - z2*x1
	out[5] = z2*x0 - z0*x2
	out[6] = z0*x1 - z1*x0
	out[7] = 0
	out[8] = z0
	out[9] = z1
	out[10] = z2
	out[11] = 0
	out[12] = eyex
	out[13] = eyey
	out[14] = eyez
	out[15] = 1
	return out
}

// Mat4GetTranslation extracts translation component from matrix into out.
func Mat4GetTranslation(out *Vec3, mat Mat4) *Vec3 {
	out.X = mat[12]
	out.Y = mat[13]
	out.Z = mat[14]
	return out
}

// Mat4GetScaling extracts scaling component from matrix into out.
func Mat4GetScaling(out *Vec3, mat Mat4) *Vec3 {
	m11 := mat[0]
	m12 := mat[1]
	m13 := mat[2]
	m21 := mat[4]
	m22 := mat[5]
	m23 := mat[6]
	m31 := mat[8]
	m32 := mat[9]
	m33 := mat[10]

	out.X = float32(math.Sqrt(float64(m11*m11 + m12*m12 + m13*m13)))
	out.Y = float32(math.Sqrt(float64(m21*m21 + m22*m22 + m23*m23)))
	out.Z = float32(math.Sqrt(float64(m31*m31 + m32*m32 + m33*m33)))
	return out
}

// Mat4GetRotation extracts rotation quaternion from matrix into out.
func Mat4GetRotation(out *Quat, mat Mat4) *Quat {
	var scaling Vec3
	Mat4GetScaling(&scaling, mat)

	is1 := float32(1.0) / scaling.X
	is2 := float32(1.0) / scaling.Y
	is3 := float32(1.0) / scaling.Z

	sm11 := mat[0] * is1
	sm12 := mat[1] * is2
	sm13 := mat[2] * is3
	sm21 := mat[4] * is1
	sm22 := mat[5] * is2
	sm23 := mat[6] * is3
	sm31 := mat[8] * is1
	sm32 := mat[9] * is2
	sm33 := mat[10] * is3

	trace := sm11 + sm22 + sm33
	if trace > 0 {
		S := float32(math.Sqrt(float64(trace+1.0))) * 2.0
		out.W = 0.25 * S
		out.X = (sm23 - sm32) / S
		out.Y = (sm31 - sm13) / S
		out.Z = (sm12 - sm21) / S
	} else if sm11 > sm22 && sm11 > sm33 {
		S := float32(math.Sqrt(float64(1.0+sm11-sm22-sm33))) * 2.0
		out.W = (sm23 - sm32) / S
		out.X = 0.25 * S
		out.Y = (sm12 + sm21) / S
		out.Z = (sm31 + sm13) / S
	} else if sm22 > sm33 {
		S := float32(math.Sqrt(float64(1.0+sm22-sm11-sm33))) * 2.0
		out.W = (sm31 - sm13) / S
		out.X = (sm12 + sm21) / S
		out.Y = 0.25 * S
		out.Z = (sm23 + sm32) / S
	} else {
		S := float32(math.Sqrt(float64(1.0+sm33-sm11-sm22))) * 2.0
		out.W = (sm12 - sm21) / S
		out.X = (sm31 + sm13) / S
		out.Y = (sm23 + sm32) / S
		out.Z = 0.25 * S
	}
	return out
}

// Mat4TransformVec3 transforms a with matrix m and stores result in out.
func Mat4TransformVec3(out, a *Vec3, m Mat4) *Vec3 {
	x := a.X
	y := a.Y
	z := a.Z
	w := m[3]*x + m[7]*y + m[11]*z + m[15]
	if w == 0 {
		w = 1.0
	}
	out.X = (m[0]*x + m[4]*y + m[8]*z + m[12]) / w
	out.Y = (m[1]*x + m[5]*y + m[9]*z + m[13]) / w
	out.Z = (m[2]*x + m[6]*y + m[10]*z + m[14]) / w
	return out
}
