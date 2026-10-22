//gofront:target wasm
package tri

// 4-wide triangle canary: Möller–Trumbore ray/triangle test against four
// triangles at once (one triangle per F32x4 lane, SoA in shared.Float32),
// next to the scalar test of the same triangles. The original probe
// trapped on GoFront 1.7.0, so simd-kernels.js runs it only on >= 1.8.0.

import (
	"gofront/shared"
	"gofront/simd"
)

// Tris is the number of triangles; a multiple of 4.
const Tris = 1024

// SoA layout: 9 rows of Tris floats — v0.xyz, edge1.xyz, edge2.xyz.
var Soa = shared.NewFloat32(Tris * 9)

// Dist receives the closest hit distance: [0] from Scalar, [1] from Simd.
var Dist = shared.NewFloat32(2)

// Seed fills Soa with deterministic triangles around the origin.
func Seed(seed int) {
	s := uint32(seed)
	for i := 0; i < Tris*9; i++ {
		s = s*1664525 + 1013904223
		Soa[i] = float32(s>>8)/float32(1<<22) - 2
	}
}

// Scalar casts `rays` rays from (ox, oy, oz) along (dx, dy, dz) against
// every triangle and stores the closest hit distance in Dist[0].
func Scalar(rays int, ox, oy, oz, dx, dy, dz float32) {
	best := float32(1e30)
	for r := 0; r < rays; r++ {
		for t := 0; t < Tris; t++ {
			v0x, v0y, v0z := Soa[t], Soa[Tris+t], Soa[2*Tris+t]
			e1x, e1y, e1z := Soa[3*Tris+t], Soa[4*Tris+t], Soa[5*Tris+t]
			e2x, e2y, e2z := Soa[6*Tris+t], Soa[7*Tris+t], Soa[8*Tris+t]
			px := dy*e2z - dz*e2y
			py := dz*e2x - dx*e2z
			pz := dx*e2y - dy*e2x
			det := e1x*px + e1y*py + e1z*pz
			if det > -1e-6 && det < 1e-6 {
				continue
			}
			inv := 1 / det
			tx, ty, tz := ox-v0x, oy-v0y, oz-v0z
			u := (tx*px + ty*py + tz*pz) * inv
			if u < 0 || u > 1 {
				continue
			}
			qx := ty*e1z - tz*e1y
			qy := tz*e1x - tx*e1z
			qz := tx*e1y - ty*e1x
			v := (dx*qx + dy*qy + dz*qz) * inv
			if v < 0 || u+v > 1 {
				continue
			}
			d := (e2x*qx + e2y*qy + e2z*qz) * inv
			if d > 0 && d < best {
				best = d
			}
		}
	}
	Dist[0] = best
}

// Simd runs the same test four triangles at a time.
func Simd(rays int, ox, oy, oz, dx, dy, dz float32) {
	best := float32(1e30)
	Ox, Oy, Oz := simd.Splat(ox), simd.Splat(oy), simd.Splat(oz)
	Dx, Dy, Dz := simd.Splat(dx), simd.Splat(dy), simd.Splat(dz)
	for r := 0; r < rays; r++ {
		for t := 0; t < Tris; t += 4 {
			v0x := simd.LoadF32x4(Soa, t)
			v0y := simd.LoadF32x4(Soa, Tris+t)
			v0z := simd.LoadF32x4(Soa, 2*Tris+t)
			e1x := simd.LoadF32x4(Soa, 3*Tris+t)
			e1y := simd.LoadF32x4(Soa, 4*Tris+t)
			e1z := simd.LoadF32x4(Soa, 5*Tris+t)
			e2x := simd.LoadF32x4(Soa, 6*Tris+t)
			e2y := simd.LoadF32x4(Soa, 7*Tris+t)
			e2z := simd.LoadF32x4(Soa, 8*Tris+t)
			px := Dy.Mul(e2z).Sub(Dz.Mul(e2y))
			py := Dz.Mul(e2x).Sub(Dx.Mul(e2z))
			pz := Dx.Mul(e2y).Sub(Dy.Mul(e2x))
			det := e1x.Mul(px).Add(e1y.Mul(py)).Add(e1z.Mul(pz))
			tx, ty, tz := Ox.Sub(v0x), Oy.Sub(v0y), Oz.Sub(v0z)
			u := tx.Mul(px).Add(ty.Mul(py)).Add(tz.Mul(pz))
			qx := ty.Mul(e1z).Sub(tz.Mul(e1y))
			qy := tz.Mul(e1x).Sub(tx.Mul(e1z))
			qz := tx.Mul(e1y).Sub(ty.Mul(e1x))
			v := Dx.Mul(qx).Add(Dy.Mul(qy)).Add(Dz.Mul(qz))
			d := e2x.Mul(qx).Add(e2y.Mul(qy)).Add(e2z.Mul(qz))
			best = closer(best, det.Lane(0), u.Lane(0), v.Lane(0), d.Lane(0))
			best = closer(best, det.Lane(1), u.Lane(1), v.Lane(1), d.Lane(1))
			best = closer(best, det.Lane(2), u.Lane(2), v.Lane(2), d.Lane(2))
			best = closer(best, det.Lane(3), u.Lane(3), v.Lane(3), d.Lane(3))
		}
	}
	Dist[1] = best
}

// closer finishes one lane's test (unnormalised u, v, distance) and returns
// the closer of best and its hit distance.
func closer(best, det, u, v, d float32) float32 {
	if det > -1e-6 && det < 1e-6 {
		return best
	}
	inv := 1 / det
	ul := u * inv
	if ul < 0 || ul > 1 {
		return best
	}
	vl := v * inv
	if vl < 0 || ul+vl > 1 {
		return best
	}
	tl := d * inv
	if tl > 0 && tl < best {
		return tl
	}
	return best
}
