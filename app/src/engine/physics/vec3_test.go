package physics

import (
	"testing"
)

func approx(a, b float32) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.0001
}

func TestVec3Basic(t *testing.T) {
	v := Vec3{X: 1, Y: 2, Z: 3}
	if v.X != 1 || v.Y != 2 || v.Z != 3 {
		t.Errorf("expected 1, 2, 3 got %f, %f, %f", v.X, v.Y, v.Z)
	}

	v.Set(4, 5, 6)
	if v.X != 4 || v.Y != 5 || v.Z != 6 {
		t.Errorf("Set failed: got %f, %f, %f", v.X, v.Y, v.Z)
	}

	c := v.Clone()
	if c.X != 4 || c.Y != 5 || c.Z != 6 {
		t.Errorf("Clone failed: got %f, %f, %f", c.X, c.Y, c.Z)
	}

	var cp Vec3
	cp.Copy(&v)
	if cp.X != 4 || cp.Y != 5 || cp.Z != 6 {
		t.Errorf("Copy failed: got %f, %f, %f", cp.X, cp.Y, cp.Z)
	}

	cp.Zero()
	if cp.X != 0 || cp.Y != 0 || cp.Z != 0 {
		t.Errorf("Zero failed")
	}
}

func TestVec3Arithmetic(t *testing.T) {
	a := Vec3{X: 1, Y: 2, Z: 3}
	b := Vec3{X: 4, Y: 5, Z: 6}
	var out Vec3

	out.Add(&a, &b)
	if out.X != 5 || out.Y != 7 || out.Z != 9 {
		t.Errorf("Add failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Sub(&b, &a)
	if out.X != 3 || out.Y != 3 || out.Z != 3 {
		t.Errorf("Sub failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Multiply(&a, &b)
	if out.X != 4 || out.Y != 10 || out.Z != 18 {
		t.Errorf("Multiply failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Divide(&out, &a)
	if out.X != 4 || out.Y != 5 || out.Z != 6 {
		t.Errorf("Divide failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Scale(&a, 2.5)
	if out.X != 2.5 || out.Y != 5.0 || out.Z != 7.5 {
		t.Errorf("Scale failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.ScaleAndAdd(&a, &b, 2.0)
	if out.X != 9 || out.Y != 12 || out.Z != 15 {
		t.Errorf("ScaleAndAdd failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Negate(&a)
	if out.X != -1 || out.Y != -2 || out.Z != -3 {
		t.Errorf("Negate failed")
	}
}

func TestVec3CrossAndDot(t *testing.T) {
	x := Vec3{X: 1, Y: 0, Z: 0}
	y := Vec3{X: 0, Y: 1, Z: 0}
	var z Vec3

	z.Cross(&x, &y)
	if !approx(z.X, 0) || !approx(z.Y, 0) || !approx(z.Z, 1) {
		t.Errorf("Cross failed: got %f, %f, %f", z.X, z.Y, z.Z)
	}

	dot := x.Dot(&y)
	if !approx(dot, 0) {
		t.Errorf("Dot perpendicular failed: got %f", dot)
	}

	dotSelf := x.Dot(&x)
	if !approx(dotSelf, 1) {
		t.Errorf("Dot parallel failed: got %f", dotSelf)
	}
}

func TestVec3LengthDistance(t *testing.T) {
	v := Vec3{X: 3, Y: 4, Z: 0}
	if !approx(v.Length(), 5.0) {
		t.Errorf("Length failed: got %f", v.Length())
	}
	if !approx(v.SquaredLength(), 25.0) {
		t.Errorf("SquaredLength failed: got %f", v.SquaredLength())
	}

	b := Vec3{X: 0, Y: 0, Z: 0}
	if !approx(v.Distance(&b), 5.0) {
		t.Errorf("Distance failed: got %f", v.Distance(&b))
	}
	if !approx(v.SquaredDistance(&b), 25.0) {
		t.Errorf("SquaredDistance failed: got %f", v.SquaredDistance(&b))
	}

	var norm Vec3
	norm.Normalize(&v)
	if !approx(norm.Length(), 1.0) {
		t.Errorf("Normalize failed: length is %f", norm.Length())
	}
	if !approx(norm.X, 0.6) || !approx(norm.Y, 0.8) || !approx(norm.Z, 0) {
		t.Errorf("Normalize components failed: got %f, %f, %f", norm.X, norm.Y, norm.Z)
	}
}

func TestVec3LerpMinMax(t *testing.T) {
	a := Vec3{X: 0, Y: 10, Z: 20}
	b := Vec3{X: 10, Y: 20, Z: 0}
	var out Vec3

	out.Lerp(&a, &b, 0.5)
	if !approx(out.X, 5) || !approx(out.Y, 15) || !approx(out.Z, 10) {
		t.Errorf("Lerp failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Min(&a, &b)
	if out.X != 0 || out.Y != 10 || out.Z != 0 {
		t.Errorf("Min failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}

	out.Max(&a, &b)
	if out.X != 10 || out.Y != 20 || out.Z != 20 {
		t.Errorf("Max failed: got %f, %f, %f", out.X, out.Y, out.Z)
	}
}
