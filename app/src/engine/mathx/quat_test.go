//gofront:target both
package mathx

import (
	"math"
	"testing"
)

func quatApprox(a, b float32) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.001
}

func TestQuatIdentity(t *testing.T) {
	var q Quat
	q.Identity()
	if q.X != 0 || q.Y != 0 || q.Z != 0 || q.W != 1 {
		t.Errorf("Quat identity failed")
	}
}

func TestQuatMultiply(t *testing.T) {
	var a, b, out Quat
	a.Identity()
	b.Identity()
	out.Multiply(&a, &b)
	if out.X != 0 || out.Y != 0 || out.Z != 0 || out.W != 1 {
		t.Errorf("Quat multiply identity failed")
	}

	// 90 deg rotation around X
	var qx Quat
	axisX := Vec3{X: 1, Y: 0, Z: 0}
	qx.FromAxisAngle(&axisX, float32(math.Pi/2.0))
	out.Multiply(&qx, &a)
	if !quatApprox(out.X, float32(math.Sin(math.Pi/4.0))) || !quatApprox(out.W, float32(math.Cos(math.Pi/4.0))) {
		t.Errorf("Quat multiply failed: got %f, %f, %f, %f", out.X, out.Y, out.Z, out.W)
	}
}

func TestQuatSlerp(t *testing.T) {
	var a, b, out Quat
	a.Identity()
	axisY := Vec3{X: 0, Y: 1, Z: 0}
	b.FromAxisAngle(&axisY, float32(math.Pi/2.0))

	// Halfway slerp should be 45 deg rotation around Y
	out.Slerp(&a, &b, 0.5)
	expectedAngle := float32(math.Pi / 4.0)
	expectedY := float32(math.Sin(float64(expectedAngle) / 2.0))
	expectedW := float32(math.Cos(float64(expectedAngle) / 2.0))

	if !quatApprox(out.Y, expectedY) || !quatApprox(out.W, expectedW) {
		t.Errorf("Quat slerp failed: got %f, %f expected %f, %f", out.Y, out.W, expectedY, expectedW)
	}
}

func TestQuatNormalize(t *testing.T) {
	q := Quat{X: 1, Y: 2, Z: 3, W: 4}
	var out Quat
	out.Normalize(&q)
	lenVal := out.Length()
	if !quatApprox(lenVal, 1.0) {
		t.Errorf("Quat normalize length is %f, expected 1.0", lenVal)
	}
}

