package game

import (
	"../engine/mathx"
	"js:./interop.d.ts"
)

// IsVec3 reports whether v is a JS array-like holding at least three finite
// numbers (netvalidation.js). Network payloads are untrusted, so every
// position/rotation is validated before use.
func IsVec3(v any) bool {
	switch a := v.(type) {
	case []float64:
		return len(a) >= 3 &&
			Number.isFinite(a[0]) == true &&
			Number.isFinite(a[1]) == true &&
			Number.isFinite(a[2]) == true
	case []float32:
		return len(a) >= 3 &&
			Number.isFinite(float64(a[0])) == true &&
			Number.isFinite(float64(a[1])) == true &&
			Number.isFinite(float64(a[2])) == true
	case []any:
		return len(a) >= 3 &&
			Number.isFinite(a[0]) == true &&
			Number.isFinite(a[1]) == true &&
			Number.isFinite(a[2]) == true
	}
	return false
}

// CopyVec3 copies three components between plain JS number arrays.
func CopyVec3(dst, src []float64) {
	dst[0] = src[0]
	dst[1] = src[1]
	dst[2] = src[2]
}

// Vec3FromAny writes a validated (see IsVec3) array-like into dst.
func Vec3FromAny(dst *mathx.Vec3, v any) {
	switch a := v.(type) {
	case []float64:
		dst.X = float32(a[0])
		dst.Y = float32(a[1])
		dst.Z = float32(a[2])
	case []float32:
		dst.X = a[0]
		dst.Y = a[1]
		dst.Z = a[2]
	case []any:
		dst.X = float32(a[0].(float64))
		dst.Y = float32(a[1].(float64))
		dst.Z = float32(a[2].(float64))
	}
}

// Vec3ToArray writes v into a plain JS number array for serialisation.
func Vec3ToArray(dst []float64, v *mathx.Vec3) {
	dst[0] = float64(v.X)
	dst[1] = float64(v.Y)
	dst[2] = float64(v.Z)
}
