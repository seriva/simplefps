//gofront:target wasm
package wasmpkg

import (
	"gofront/shared"
	"gofront/simd"
)

var Out = shared.NewFloat32(4)

func Store() {
	simd.StoreF32x4(Out, 0, simd.Splat(1))
}
