package jspkg

import (
	"math"

	"gofront/simd"
)

// No //gofront:target directive: this is a js package, where F32x4 lowers to
// an allocating frozen array.
func Len(v simd.F32x4) float32 {
	return float32(math.Sqrt(float64(v.Dot4(v))))
}
