package scene

import (
	"../mathx"
	"../systems"
)

// LightGridConfig describes the probe volume layout (arena config lightGrid block).
type LightGridConfig struct {
	Origin []float32 // world origin of probe (0,0,0)
	Counts []int     // probes along grid X, Y, Z
	Step   []float32 // world spacing per grid axis
}

// LightGrid samples baked RGB ambient probes with trilinear interpolation.
// Grid axes map to engine space as X→X, Y→-Z, Z→Y.
type LightGrid struct {
	data    []byte
	origin  [3]float32
	counts  [3]int
	step    [3]float32
	strideY int
	strideZ int
}

// NewLightGrid creates an empty grid (HasData false, samples white).
func NewLightGrid() *LightGrid {
	g := &LightGrid{}
	g.Reset()
	return g
}

// Reset drops probe data.
func (g *LightGrid) Reset() {
	g.data = nil
	g.origin[0] = 0
	g.origin[1] = 0
	g.origin[2] = 0
	g.counts[0] = 0
	g.counts[1] = 0
	g.counts[2] = 0
	g.step[0] = 64
	g.step[1] = 64
	g.step[2] = 64
	g.strideY = 0
	g.strideZ = 0
}

// HasData reports whether probe data is loaded.
func (g *LightGrid) HasData() bool { return g.data != nil }

// Load installs RGB probe bytes for cfg. Returns false (and keeps the grid
// empty) when the buffer is smaller than the configured probe count.
func (g *LightGrid) Load(cfg *LightGridConfig, data []byte) bool {
	g.Reset()
	if cfg == nil || len(cfg.Counts) < 3 || len(cfg.Origin) < 3 || len(cfg.Step) < 3 {
		systems.GlobalConsole.Warn("No light grid configuration found in arena config.")
		return false
	}
	total := cfg.Counts[0] * cfg.Counts[1] * cfg.Counts[2]
	if len(data) < total*3 {
		systems.GlobalConsole.Warn("LightGrid size mismatch: buffer too small.")
		return false
	}
	if len(data) > total*3 {
		systems.GlobalConsole.Warn("LightGrid size mismatch: using partial buffer.")
	}
	g.data = data
	for i := 0; i < 3; i++ {
		g.origin[i] = cfg.Origin[i]
		g.counts[i] = cfg.Counts[i]
		g.step[i] = cfg.Step[i]
	}
	g.strideY = g.counts[0]
	g.strideZ = g.counts[0] * g.counts[1]
	return true
}

func clampIndex(v, max int) int {
	if v < 0 {
		return 0
	}
	if v > max {
		return max
	}
	return v
}

func clamp01(v float32) float32 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

const byteToUnit = float32(1.0 / 255.0)

// GetAmbient writes the trilinearly interpolated probe colour at position into out.
func (g *LightGrid) GetAmbient(position *mathx.Vec3, out []float32) {
	if g.data == nil {
		out[0] = 1
		out[1] = 1
		out[2] = 1
		return
	}
	relX := position.X - g.origin[0]
	relY := position.Y - g.origin[1]
	relZ := position.Z - g.origin[2]

	fx := relX / g.step[0]
	fy := -relZ / g.step[1]
	fz := relY / g.step[2]

	x0 := clampIndex(floorInt(fx), g.counts[0]-2)
	y0 := clampIndex(floorInt(fy), g.counts[1]-2)
	z0 := clampIndex(floorInt(fz), g.counts[2]-2)
	x1 := x0 + 1
	y1 := y0 + 1
	z1 := z0 + 1

	wx := clamp01(fx - float32(x0))
	wy := clamp01(fy - float32(y0))
	wz := clamp01(fz - float32(z0))
	wx1 := 1 - wx
	wy1 := 1 - wy
	wz1 := 1 - wz

	d := g.data
	b000 := (z0*g.strideZ + y0*g.strideY + x0) * 3
	b100 := (z0*g.strideZ + y0*g.strideY + x1) * 3
	b010 := (z0*g.strideZ + y1*g.strideY + x0) * 3
	b110 := (z0*g.strideZ + y1*g.strideY + x1) * 3
	b001 := (z1*g.strideZ + y0*g.strideY + x0) * 3
	b101 := (z1*g.strideZ + y0*g.strideY + x1) * 3
	b011 := (z1*g.strideZ + y1*g.strideY + x0) * 3
	b111 := (z1*g.strideZ + y1*g.strideY + x1) * 3

	for c := 0; c < 3; c++ {
		cx00 := float32(d[b000+c])*wx1 + float32(d[b100+c])*wx
		cx10 := float32(d[b010+c])*wx1 + float32(d[b110+c])*wx
		cx01 := float32(d[b001+c])*wx1 + float32(d[b101+c])*wx
		cx11 := float32(d[b011+c])*wx1 + float32(d[b111+c])*wx
		cxy0 := cx00*wy1 + cx10*wy
		cxy1 := cx01*wy1 + cx11*wy
		out[c] = (cxy0*wz1 + cxy1*wz) * byteToUnit
	}
}

func floorInt(v float32) int {
	i := int(v)
	if float32(i) > v {
		i--
	}
	return i
}
