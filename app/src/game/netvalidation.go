package game

import (
	"../engine/physics"
	"js:./interop.d.ts"
)

// IsVec3 reports whether v is a JS array-like holding at least three finite
// numbers (netvalidation.js). Network payloads are untrusted, so every
// position/rotation is validated before use.
func IsVec3(v any) bool {
	if v == nil {
		return false
	}
	return v.length >= 3 &&
		Number.isFinite(v[0]) == true &&
		Number.isFinite(v[1]) == true &&
		Number.isFinite(v[2]) == true
}

// CopyVec3 copies three components between plain JS number arrays.
func CopyVec3(dst, src []float64) {
	dst[0] = src[0]
	dst[1] = src[1]
	dst[2] = src[2]
}

// Vec3FromAny writes a validated (see IsVec3) array-like into dst.
func Vec3FromAny(dst *physics.Vec3, v any) {
	dst.X = float32(v[0].(float64))
	dst.Y = float32(v[1].(float64))
	dst.Z = float32(v[2].(float64))
}

// Vec3ToArray writes v into a plain JS number array for serialisation.
func Vec3ToArray(dst []float64, v *physics.Vec3) {
	dst[0] = float64(v.X)
	dst[1] = float64(v.Y)
	dst[2] = float64(v.Z)
}
