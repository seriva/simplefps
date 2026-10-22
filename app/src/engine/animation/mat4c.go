//gofront:target wasm
package animation

import (
	"../mathx"
	"gofront/simd"
)

// mat4c is a 4×4 matrix packed as four F32x4 columns, column-major like
// mathx.Mat4 (c0 = m[0..3], …, c3 = m[12..15]). Unlike a mathx.Mat4 (a GC
// []float32), its columns load and store as v128, so the skinning chain can
// run on WebAssembly SIMD. It never crosses the JS↔WASM boundary.
type mat4c struct {
	c0, c1, c2, c3 simd.F32x4
}

// fromMat4 packs a mathx.Mat4 into out.
func fromMat4(out *mat4c, m mathx.Mat4) {
	out.c0 = simd.NewF32x4(m[0], m[1], m[2], m[3])
	out.c1 = simd.NewF32x4(m[4], m[5], m[6], m[7])
	out.c2 = simd.NewF32x4(m[8], m[9], m[10], m[11])
	out.c3 = simd.NewF32x4(m[12], m[13], m[14], m[15])
}

// toMat4 unpacks c into the mathx.Mat4 out.
func toMat4(out mathx.Mat4, c *mat4c) {
	out[0] = c.c0.Lane(0)
	out[1] = c.c0.Lane(1)
	out[2] = c.c0.Lane(2)
	out[3] = c.c0.Lane(3)
	out[4] = c.c1.Lane(0)
	out[5] = c.c1.Lane(1)
	out[6] = c.c1.Lane(2)
	out[7] = c.c1.Lane(3)
	out[8] = c.c2.Lane(0)
	out[9] = c.c2.Lane(1)
	out[10] = c.c2.Lane(2)
	out[11] = c.c2.Lane(3)
	out[12] = c.c3.Lane(0)
	out[13] = c.c3.Lane(1)
	out[14] = c.c3.Lane(2)
	out[15] = c.c3.Lane(3)
}

// mulCol returns the column a × v for a column v of the right-hand matrix:
// a.c0·v.x + a.c1·v.y + a.c2·v.z + a.c3·v.w, summed left to right. That is
// the operation order of mathx.Mat4Multiply, so results are bit-identical.
func mulCol(a *mat4c, v simd.F32x4) simd.F32x4 {
	return a.c0.Mul(simd.Splat(v.Lane(0))).
		Add(a.c1.Mul(simd.Splat(v.Lane(1)))).
		Add(a.c2.Mul(simd.Splat(v.Lane(2)))).
		Add(a.c3.Mul(simd.Splat(v.Lane(3))))
}

// mulMat4c computes out = a × b (mathx.Mat4Multiply on packed columns). out
// may alias a or b: all four columns are computed before out is written.
func mulMat4c(out, a, b *mat4c) {
	c0 := mulCol(a, b.c0)
	c1 := mulCol(a, b.c1)
	c2 := mulCol(a, b.c2)
	c3 := mulCol(a, b.c3)
	out.c0 = c0
	out.c1 = c1
	out.c2 = c2
	out.c3 = c3
}
