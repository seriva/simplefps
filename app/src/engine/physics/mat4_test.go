package physics

import (
	"math"
	"testing"
)

func matApprox(a, b float32) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.001
}

func TestMat4Identity(t *testing.T) {
	m := NewMat4()
	if m[0] != 1 || m[5] != 1 || m[10] != 1 || m[15] != 1 {
		t.Errorf("NewMat4 not identity")
	}
	if m[1] != 0 || m[4] != 0 || m[12] != 0 {
		t.Errorf("NewMat4 non-diagonal not zero")
	}

	m[0] = 99
	Mat4Identity(m)
	if m[0] != 1 {
		t.Errorf("Mat4Identity failed")
	}
}

func TestMat4CopyAndClone(t *testing.T) {
	m := NewMat4()
	m[0] = 2
	m[12] = 5

	c := Mat4Clone(m)
	if c[0] != 2 || c[12] != 5 {
		t.Errorf("Mat4Clone failed")
	}

	dest := NewMat4()
	Mat4Copy(dest, m)
	if dest[0] != 2 || dest[12] != 5 {
		t.Errorf("Mat4Copy failed")
	}
}

func TestMat4Multiply(t *testing.T) {
	a := NewMat4()
	b := NewMat4()
	out := NewMat4()

	Mat4Multiply(out, a, b)
	if out[0] != 1 || out[5] != 1 || out[10] != 1 || out[15] != 1 {
		t.Errorf("Identity multiply failed")
	}

	// Translation * Scale
	v := Vec3{X: 10, Y: 20, Z: 30}
	s := Vec3{X: 2, Y: 3, Z: 4}
	Mat4FromTranslation(a, &v)
	Mat4FromScaling(b, &s)

	Mat4Multiply(out, a, b)
	// Column-major: out = a * b
	if !matApprox(out[0], 2) || !matApprox(out[5], 3) || !matApprox(out[10], 4) {
		t.Errorf("Scale component incorrect in multiply")
	}
	if !matApprox(out[12], 10) || !matApprox(out[13], 20) || !matApprox(out[14], 30) {
		t.Errorf("Translation component incorrect in multiply")
	}
}

func TestMat4Invert(t *testing.T) {
	m := NewMat4()
	v := Vec3{X: 3, Y: -4, Z: 5}
	Mat4FromTranslation(m, &v)

	inv := NewMat4()
	res := Mat4Invert(inv, m)
	if res == nil {
		t.Fatalf("Mat4Invert returned nil for invertible matrix")
	}
	if !matApprox(inv[12], -3) || !matApprox(inv[13], 4) || !matApprox(inv[14], -5) {
		t.Errorf("Inverted translation incorrect: %f, %f, %f", inv[12], inv[13], inv[14])
	}

	// Singular matrix
	var zeroMat Mat4 = make([]float32, 16)
	if Mat4Invert(inv, zeroMat) != nil {
		t.Errorf("Singular matrix should return nil on invert")
	}
}

func TestMat4TranslateAndScale(t *testing.T) {
	m := NewMat4()
	v := Vec3{X: 1, Y: 2, Z: 3}
	s := Vec3{X: 4, Y: 5, Z: 6}

	Mat4Translate(m, m, &v)
	if m[12] != 1 || m[13] != 2 || m[14] != 3 {
		t.Errorf("Mat4Translate failed: got %f, %f, %f", m[12], m[13], m[14])
	}

	Mat4Scale(m, m, &s)
	if m[0] != 4 || m[5] != 5 || m[10] != 6 {
		t.Errorf("Mat4Scale failed")
	}
}

func TestMat4RotateX_Y_Z(t *testing.T) {
	m := NewMat4()
	halfPi := float32(math.Pi / 2.0)

	Mat4RotateX(m, m, halfPi)
	if !matApprox(m[5], 0) || !matApprox(m[6], 1) || !matApprox(m[9], -1) || !matApprox(m[10], 0) {
		t.Errorf("Mat4RotateX failed")
	}

	Mat4Identity(m)
	Mat4RotateY(m, m, halfPi)
	if !matApprox(m[0], 0) || !matApprox(m[2], -1) || !matApprox(m[8], 1) || !matApprox(m[10], 0) {
		t.Errorf("Mat4RotateY failed")
	}

	Mat4Identity(m)
	Mat4RotateZ(m, m, halfPi)
	if !matApprox(m[0], 0) || !matApprox(m[1], 1) || !matApprox(m[4], -1) || !matApprox(m[5], 0) {
		t.Errorf("Mat4RotateZ failed")
	}
}

func TestMat4FromQuat(t *testing.T) {
	q := Quat{X: 0, Y: 0, Z: 0, W: 1}
	m := NewMat4()
	Mat4FromQuat(m, &q)

	if m[0] != 1 || m[5] != 1 || m[10] != 1 || m[15] != 1 {
		t.Errorf("Mat4FromQuat identity failed")
	}
}

func TestMat4FromRotationTranslationScale(t *testing.T) {
	q := Quat{X: 0, Y: 0, Z: 0, W: 1}
	v := Vec3{X: 10, Y: 20, Z: 30}
	s := Vec3{X: 2, Y: 3, Z: 4}
	m := NewMat4()

	Mat4FromRotationTranslationScale(m, &q, &v, &s)
	if !matApprox(m[0], 2) || !matApprox(m[5], 3) || !matApprox(m[10], 4) {
		t.Errorf("Scaling incorrect")
	}
	if !matApprox(m[12], 10) || !matApprox(m[13], 20) || !matApprox(m[14], 30) {
		t.Errorf("Translation incorrect")
	}

	var extractedT Vec3
	var extractedS Vec3
	var extractedQ Quat

	Mat4GetTranslation(&extractedT, m)
	Mat4GetScaling(&extractedS, m)
	Mat4GetRotation(&extractedQ, m)

	if !matApprox(extractedT.X, 10) || !matApprox(extractedT.Y, 20) || !matApprox(extractedT.Z, 30) {
		t.Errorf("Mat4GetTranslation failed")
	}
	if !matApprox(extractedS.X, 2) || !matApprox(extractedS.Y, 3) || !matApprox(extractedS.Z, 4) {
		t.Errorf("Mat4GetScaling failed")
	}
	if !matApprox(extractedQ.W, 1) {
		t.Errorf("Mat4GetRotation failed")
	}
}

func TestMat4TransformVec3(t *testing.T) {
	m := NewMat4()
	v := Vec3{X: 5, Y: -3, Z: 2}
	Mat4FromTranslation(m, &v)

	p := Vec3{X: 1, Y: 1, Z: 1}
	var out Vec3
	out.TransformMat4(&p, m)

	if !matApprox(out.X, 6) || !matApprox(out.Y, -2) || !matApprox(out.Z, 3) {
		t.Errorf("TransformMat4 failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	var out2 Vec3
	Mat4TransformVec3(&out2, &p, m)
	if !matApprox(out2.X, 6) || !matApprox(out2.Y, -2) || !matApprox(out2.Z, 3) {
		t.Errorf("Mat4TransformVec3 failed: got %f, %f, %f", out2.X, out2.Y, out2.Z)
	}
}

func TestMat4LookAt(t *testing.T) {
	eye := Vec3{X: 0, Y: 0, Z: 5}
	center := Vec3{X: 0, Y: 0, Z: 0}
	up := Vec3{X: 0, Y: 1, Z: 0}

	view := NewMat4()
	Mat4LookAt(view, &eye, &center, &up)

	// Center in view space should be at (0, 0, -5)
	var centerView Vec3
	centerView.TransformMat4(&center, view)
	if !matApprox(centerView.X, 0) || !matApprox(centerView.Y, 0) || !matApprox(centerView.Z, -5) {
		t.Errorf("Mat4LookAt failed: centerView is %f, %f, %f", centerView.X, centerView.Y, centerView.Z)
	}
}
