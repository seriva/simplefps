package plainjs

import (
	"testing"

	"gofront/simd"
)

// _test.go files are not checked.
func TestSum(t *testing.T) {
	_ = simd.Splat(1)
	if Sum(1, 2) != 3 {
		t.Fatal("sum")
	}
}
