package plainjs

// Mentions "gofront/simd" only in a comment and a string, never as an import.
const Note = "gofront/simd is wasm-only"

func Sum(a, b float32) float32 {
	return a + b
}
