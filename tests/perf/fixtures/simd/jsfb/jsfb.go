//gofront:target js
package jsfb

// JS-fallback canary: gofront/simd in a js package lowers F32x4 to a frozen
// 4-number array, so every Mul/Add allocates. This is why AGENTS.md keeps
// gofront/simd in wasm packages only.

import "gofront/simd"

// MulAdd runs `ops` F32x4 multiply+add steps and returns lane 0.
func MulAdd(ops int) float32 {
	acc := simd.NewF32x4(0, 0, 0, 0)
	k := simd.NewF32x4(0.5, 0.25, 0.125, 0.0625)
	d := simd.NewF32x4(1, 2, 3, 4)
	for i := 0; i < ops; i++ {
		acc = acc.Mul(k).Add(d)
	}
	return acc.Lane(0)
}
