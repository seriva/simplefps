//gofront:target wasm
package kern

// Palette kernel canary: one skinning palette frame, 64 joints of
// world × inverseBind (column-major, mathx.Mat4 layout) published into a
// shared.Float32, in the two data layouts of engine/animation:
//   - scalar: []float32 matrices (mathx.Mat4), mathx.Mat4Multiply into a
//     scratch matrix, then a 16-float copy into the shared buffer — today's
//     Skeleton.ComputeSkinningMatrices;
//   - SIMD: matrices packed as four F32x4 columns (mat4c), multiplied column
//     by column and stored with simd.StoreF32x4.
// Both follow mathx.Mat4Multiply's operation order, so the outputs are
// bit-identical.

import (
	"gofront/shared"
	"gofront/simd"
)

const Joints = 64

var OutScalar = shared.NewFloat32(Joints * 16)
var OutSimd = shared.NewFloat32(Joints * 16)

type mat4c struct {
	c0, c1, c2, c3 simd.F32x4
}

var world [][]float32
var invBind [][]float32
var scratch []float32
var worldC []mat4c
var invBindC []mat4c

// Seed builds both layouts from the same deterministic values in [-1, 1).
func Seed(seed int) {
	world = make([][]float32, Joints)
	invBind = make([][]float32, Joints)
	worldC = make([]mat4c, Joints)
	invBindC = make([]mat4c, Joints)
	scratch = make([]float32, 16)
	s := uint32(seed)
	for j := 0; j < Joints; j++ {
		w := make([]float32, 16)
		b := make([]float32, 16)
		for k := 0; k < 16; k++ {
			s = s*1664525 + 1013904223
			w[k] = float32(s>>8)/float32(1<<23) - 1
			s = s*1664525 + 1013904223
			b[k] = float32(s>>8)/float32(1<<23) - 1
		}
		world[j] = w
		invBind[j] = b
		pack(&worldC[j], w)
		pack(&invBindC[j], b)
	}
}

func pack(out *mat4c, m []float32) {
	out.c0 = simd.NewF32x4(m[0], m[1], m[2], m[3])
	out.c1 = simd.NewF32x4(m[4], m[5], m[6], m[7])
	out.c2 = simd.NewF32x4(m[8], m[9], m[10], m[11])
	out.c3 = simd.NewF32x4(m[12], m[13], m[14], m[15])
}

// mul is mathx.Mat4Multiply (out = a × b), unrolled the same way.
func mul(out, a, b []float32) {
	a00, a01, a02, a03 := a[0], a[1], a[2], a[3]
	a10, a11, a12, a13 := a[4], a[5], a[6], a[7]
	a20, a21, a22, a23 := a[8], a[9], a[10], a[11]
	a30, a31, a32, a33 := a[12], a[13], a[14], a[15]
	var b0, b1, b2, b3 float32
	b0 = b[0]
	b1 = b[1]
	b2 = b[2]
	b3 = b[3]
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
}

// column returns a × b's column for b's column (x, y, z, w).
func column(a *mat4c, b simd.F32x4) simd.F32x4 {
	return a.c0.Mul(simd.Splat(b.Lane(0))).
		Add(a.c1.Mul(simd.Splat(b.Lane(1)))).
		Add(a.c2.Mul(simd.Splat(b.Lane(2)))).
		Add(a.c3.Mul(simd.Splat(b.Lane(3))))
}

// PaletteScalar computes `frames` palettes with scalar math.
func PaletteScalar(frames int) {
	for f := 0; f < frames; f++ {
		for j := 0; j < Joints; j++ {
			mul(scratch, world[j], invBind[j])
			base := j * 16
			for k := 0; k < 16; k++ {
				OutScalar[base+k] = scratch[k]
			}
		}
	}
}

// PaletteSimd computes `frames` palettes with F32x4 columns.
func PaletteSimd(frames int) {
	for f := 0; f < frames; f++ {
		for j := 0; j < Joints; j++ {
			a := &worldC[j]
			b := &invBindC[j]
			base := j * 16
			simd.StoreF32x4(OutSimd, base, column(a, b.c0))
			simd.StoreF32x4(OutSimd, base+4, column(a, b.c1))
			simd.StoreF32x4(OutSimd, base+8, column(a, b.c2))
			simd.StoreF32x4(OutSimd, base+12, column(a, b.c3))
		}
	}
}
