package scene

import (
	"testing"

	"../mathx"
)

// A grid with one probe along an axis has no upper neighbour on that axis:
// the sample must stay on the single probe layer instead of reading past it.
func TestLightGridSingleProbeAxis(t *testing.T) {
	g := NewLightGrid()
	data := make([]byte, 12)
	for i := range data {
		data[i] = 255
	}
	if !g.Load(&LightGridConfig{Origin: []float32{0, 0, 0}, Counts: []int{1, 2, 2}, Step: []float32{10, 10, 10}}, data) {
		t.Fatal("Load rejected a 1×2×2 grid")
	}
	out := make([]float32, 3)
	g.GetAmbient(&mathx.Vec3{X: 3, Y: 5, Z: -5}, out)
	for c, v := range out {
		if !approx(v, 1) {
			t.Fatalf("channel %d = %v, want 1", c, v)
		}
	}
}

func TestLightGridRejectsEmptyAxis(t *testing.T) {
	g := NewLightGrid()
	if g.Load(&LightGridConfig{Origin: []float32{0, 0, 0}, Counts: []int{0, 2, 2}, Step: []float32{10, 10, 10}}, make([]byte, 12)) {
		t.Fatal("Load accepted a count of 0")
	}
	if g.HasData() {
		t.Fatal("grid kept data after a rejected Load")
	}
}
