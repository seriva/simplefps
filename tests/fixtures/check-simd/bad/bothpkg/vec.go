//gofront:target both
package bothpkg

import "gofront/simd"

// A both package also compiles to JS, so it gets the allocating fallback.
func Twice(v simd.F32x4) simd.F32x4 {
	return v.Add(v)
}
