package wasmpkg

import "gofront/simd"

// A file without its own directive still belongs to the wasm package.
func double(v simd.F32x4) simd.F32x4 {
	return v.Add(v)
}
