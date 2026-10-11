package rendering

import (
	"../mathx"
	"js:./interop.d.ts"
)

// ObjectRing is the CPU staging area for the per-draw ObjectData uniform
// (group 2, binding 0). Draws allocate a 256-byte slot with NextObject,
// fill it through the Object* setters and the whole used range is uploaded
// once in EndFrame.
type ObjectRing struct {
	Data   []float32
	Buffer GPUBuffer
	Count  int
	cur    int
	// offsets is the one-element dynamic-offset list passed to setBindGroup.
	offsets  []int
	overflow bool
}

func newObjectRing() *ObjectRing {
	return &ObjectRing{
		Data:    make([]float32, ObjectRingSlots*ObjectFloats),
		offsets: make([]int, 1),
	}
}

func (o *ObjectRing) reset() {
	o.Count = 0
	o.cur = 0
}

// Slot returns the float offset of the current object.
func (o *ObjectRing) Slot() int { return o.cur }

// NextObject allocates the next ObjectData slot and zeroes its parameters.
// When the ring is exhausted the last slot is reused (and the overflow flag
// set) so the frame still renders.
func (r *Renderer) NextObject() {
	o := r.Objects
	if o.Count >= ObjectRingSlots {
		o.overflow = true
		o.cur = ObjectRingSlots - 1
	} else {
		o.cur = o.Count
		o.Count++
	}
	base := o.cur * ObjectFloats
	for i := objProbe; i < objMisc+4; i++ {
		o.Data[base+i] = 0
	}
}

// ObjectWorld writes the world matrix of the current object.
func (r *Renderer) ObjectWorld(m mathx.Mat4) {
	base := r.Objects.cur * ObjectFloats
	d := r.Objects.Data
	for i := 0; i < 16; i++ {
		d[base+i] = m[i]
	}
}

// ObjectProbe writes probe colour (rgb) and shadow height (a).
func (r *Renderer) ObjectProbe(x, y, z, w float32) {
	r.objectVec4(objProbe, x, y, z, w)
}

// ObjectParams writes params0..2 (index 0..2) of the current object.
func (r *Renderer) ObjectParams(index int, x, y, z, w float32) {
	r.objectVec4(objParams0+index*4, x, y, z, w)
}

// ObjectParamsVec writes params[index] from a []float32 (len >= 4).
func (r *Renderer) ObjectParamsVec(index int, v []float32) {
	r.objectVec4(objParams0+index*4, v[0], v[1], v[2], v[3])
}

func (r *Renderer) objectVec4(off int, x, y, z, w float32) {
	base := r.Objects.cur*ObjectFloats + off
	d := r.Objects.Data
	d[base] = x
	d[base+1] = y
	d[base+2] = z
	d[base+3] = w
}

// ObjectValue reads float i of slot (test/diagnostic accessor).
func (r *Renderer) ObjectValue(slot, i int) float32 {
	return r.Objects.Data[slot*ObjectFloats+i]
}

// BoneRing stages the skinning matrices (group 2, binding 1 storage).
type BoneRing struct {
	Data   []float32
	Buffer GPUBuffer
	Count  int // matrices used this frame
}

func newBoneRing() *BoneRing {
	return &BoneRing{Data: make([]float32, BoneRingFloats)}
}

// ObjectBones appends bones (16 floats per matrix) to the bone ring and
// points the current object's misc.x at the first one. Returns false when
// the ring is full (the object then skins with the first matrices).
func (r *Renderer) ObjectBones(bones []float32) bool {
	n := len(bones) / 16
	ring := r.Bones
	base := r.Objects.cur*ObjectFloats + objMisc
	if ring.Count+n > BoneRingMats {
		r.Objects.Data[base] = 0
		return false
	}
	start := ring.Count * 16
	d := ring.Data
	for i := 0; i < n*16; i++ {
		d[start+i] = bones[i]
	}
	r.Objects.Data[base] = float32(ring.Count)
	ring.Count += n
	return true
}

// flushRings uploads the used ObjectData slots and bone matrices.
func (r *Renderer) flushRings() {
	o := r.Objects
	if o.Count > 0 && o.Buffer != nil {
		r.Backend.WriteBufferRange(o.Buffer, 0, o.Data, o.Count*ObjectFloats)
	}
	if r.Bones.Count > 0 && r.Bones.Buffer != nil {
		r.Backend.WriteBufferRange(r.Bones.Buffer, 0, r.Bones.Data, r.Bones.Count*16)
	}
	if o.overflow {
		o.overflow = false
		if console != nil && console.warn != nil {
			console.warn("[rendering] ObjectRing overflow: more than 4096 draws in one frame")
		}
	}
}

// LightingData stages the transparent-pass light list (group 3): a small
// uniform header (ambient, counts) and a storage array of Light records,
// points first then spots.
type LightingData struct {
	Header     []float32
	Data       []float32
	HeaderBuf  GPUBuffer
	LightsBuf  GPUBuffer
	PointCount int
	SpotCount  int
}

// NewLightingData allocates staging for MaxSceneLights lights.
func NewLightingData() *LightingData {
	return &LightingData{
		Header: make([]float32, LightingDataFloats),
		Data:   make([]float32, MaxSceneLights*LightFloats),
	}
}

// Reset clears the counts; stale records beyond the counts are never read.
func (l *LightingData) Reset() {
	l.PointCount = 0
	l.SpotCount = 0
}

// Count is the number of lights staged this frame.
func (l *LightingData) Count() int { return l.PointCount + l.SpotCount }

// AddPointLight appends a point light. Points must be added before spots;
// returns false when the list is full or a spot was already added.
func (l *LightingData) AddPointLight(x, y, z, size, cr, cg, cb, intensity float32) bool {
	if l.SpotCount > 0 || l.Count() >= MaxSceneLights {
		return false
	}
	base := l.Count() * LightFloats
	d := l.Data
	d[base] = x
	d[base+1] = y
	d[base+2] = z
	d[base+3] = size
	d[base+4] = cr
	d[base+5] = cg
	d[base+6] = cb
	d[base+7] = intensity
	d[base+8] = 0
	d[base+9] = 0
	d[base+10] = 0
	d[base+11] = 0
	l.PointCount++
	return true
}

// AddSpotLight appends a spot light; returns false when the list is full.
func (l *LightingData) AddSpotLight(x, y, z, rng, cr, cg, cb, intensity, dx, dy, dz, cutoff float32) bool {
	if l.Count() >= MaxSceneLights {
		return false
	}
	base := l.Count() * LightFloats
	d := l.Data
	d[base] = x
	d[base+1] = y
	d[base+2] = z
	d[base+3] = rng
	d[base+4] = cr
	d[base+5] = cg
	d[base+6] = cb
	d[base+7] = intensity
	d[base+8] = dx
	d[base+9] = dy
	d[base+10] = dz
	d[base+11] = cutoff
	l.SpotCount++
	return true
}

// Upload writes ambient + counts and the used light records.
func (l *LightingData) Upload(r *Renderer, ambient []float32) {
	l.Header[0] = ambient[0]
	l.Header[1] = ambient[1]
	l.Header[2] = ambient[2]
	l.Header[3] = 1
	l.Header[4] = float32(l.PointCount)
	l.Header[5] = float32(l.SpotCount)
	if r == nil || r.Backend == nil || l.HeaderBuf == nil {
		return
	}
	r.Backend.WriteBuffer(l.HeaderBuf, 0, l.Header)
	if l.Count() > 0 {
		r.Backend.WriteBufferRange(l.LightsBuf, 0, l.Data, l.Count()*LightFloats)
	}
}

// LightScore pairs a light index with its contribution score for sorting.
type LightScore struct {
	Index int
	Score float32
}

// LightSorter sorts lights by intensity/distance² without per-frame allocation.
// Entries[0:Count] are valid after Add; Sort orders them by descending Score.
type LightSorter struct {
	Entries []LightScore
	Count   int
}

// NewLightSorter pre-allocates room for capacity lights.
func NewLightSorter(capacity int) *LightSorter {
	return &LightSorter{Entries: make([]LightScore, capacity)}
}

// Begin resets the sorter for a new frame.
func (s *LightSorter) Begin() {
	s.Count = 0
}

// Add records a light's contribution score (see LightDrawable.LightScore).
// The buffer doubles when full so no visible light is ever dropped.
func (s *LightSorter) Add(index int, score float32) {
	if s.Count >= len(s.Entries) {
		newCap := len(s.Entries) * 2
		if newCap < 8 {
			newCap = 8
		}
		grown := make([]LightScore, newCap)
		for i := 0; i < s.Count; i++ {
			grown[i].Index = s.Entries[i].Index
			grown[i].Score = s.Entries[i].Score
		}
		s.Entries = grown
	}
	s.Entries[s.Count].Index = index
	s.Entries[s.Count].Score = score
	s.Count++
}

// ContributionScore is the default LightScore: intensity / distance² to cam.
func ContributionScore(x, y, z, intensity float32, cam *mathx.Vec3) float32 {
	dx := x - cam.X
	dy := y - cam.Y
	dz := z - cam.Z
	d2 := dx*dx + dy*dy + dz*dz
	if d2 == 0 {
		d2 = 1
	}
	return intensity / d2
}

// Sort orders Entries[0:Count] by descending score (in-place insertion sort;
// light counts are small and this avoids comparator closures/allocations).
func (s *LightSorter) Sort() {
	e := s.Entries
	for i := 1; i < s.Count; i++ {
		for j := i; j > 0 && e[j].Score > e[j-1].Score; j-- {
			idx := e[j].Index
			sc := e[j].Score
			e[j].Index = e[j-1].Index
			e[j].Score = e[j-1].Score
			e[j-1].Index = idx
			e[j-1].Score = sc
		}
	}
}
