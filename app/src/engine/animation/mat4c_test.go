package animation

import (
	"math"
	"testing"

	"../mathx"
)

// lcgMat4 fills m with deterministic values in [-1, 1) from an LCG state and
// returns the advanced state.
func lcgMat4(m mathx.Mat4, s uint32) uint32 {
	for k := 0; k < 16; k++ {
		s = s*1664525 + 1013904223
		m[k] = float32(s>>8)/float32(1<<23) - 1
	}
	return s
}

func TestMulMat4cBitIdenticalToMat4Multiply(t *testing.T) {
	a := mathx.NewMat4()
	b := mathx.NewMat4()
	want := mathx.NewMat4()
	got := mathx.NewMat4()
	var ac, bc, oc mat4c
	s := uint32(12345)
	for pair := 0; pair < 1000; pair++ {
		s = lcgMat4(a, s)
		s = lcgMat4(b, s)
		mathx.Mat4Multiply(want, a, b)
		fromMat4(&ac, a)
		fromMat4(&bc, b)
		mulMat4c(&oc, &ac, &bc)
		toMat4(got, &oc)
		for k := 0; k < 16; k++ {
			if math.Float32bits(got[k]) != math.Float32bits(want[k]) {
				t.Fatalf("pair %d element %d: mulMat4c = %v, Mat4Multiply = %v", pair, k, got[k], want[k])
			}
		}
	}
}

func TestMulMat4cAliasedOutput(t *testing.T) {
	// out may alias a or b: every column of b is read before out is written.
	a := mathx.NewMat4()
	b := mathx.NewMat4()
	want := mathx.NewMat4()
	got := mathx.NewMat4()
	s := lcgMat4(a, 7)
	lcgMat4(b, s)
	mathx.Mat4Multiply(want, a, b)

	var ac, bc mat4c
	fromMat4(&ac, a)
	fromMat4(&bc, b)
	mulMat4c(&bc, &ac, &bc)
	toMat4(got, &bc)
	for k := 0; k < 16; k++ {
		if math.Float32bits(got[k]) != math.Float32bits(want[k]) {
			t.Fatalf("out=b element %d: %v, want %v", k, got[k], want[k])
		}
	}

	fromMat4(&ac, a)
	fromMat4(&bc, b)
	mulMat4c(&ac, &ac, &bc)
	toMat4(got, &ac)
	for k := 0; k < 16; k++ {
		if math.Float32bits(got[k]) != math.Float32bits(want[k]) {
			t.Fatalf("out=a element %d: %v, want %v", k, got[k], want[k])
		}
	}
}

func TestMat4cRoundTrip(t *testing.T) {
	m := mathx.NewMat4()
	back := mathx.NewMat4()
	var c mat4c
	s := uint32(99)
	for i := 0; i < 100; i++ {
		s = lcgMat4(m, s)
		fromMat4(&c, m)
		toMat4(back, &c)
		for k := 0; k < 16; k++ {
			if math.Float32bits(back[k]) != math.Float32bits(m[k]) {
				t.Fatalf("round %d element %d: %v, want %v", i, k, back[k], m[k])
			}
		}
	}
}
