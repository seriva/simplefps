package scene

import (
	"../physics"
	"../rendering"
)

// Instance layout (6 floats = 24 bytes per particle):
//   slot 2: aInstancePos      (vec3, offset  0)
//   slot 3: aInstanceScale    (float, offset 12)
//   slot 4: aInstanceRotation (float, offset 16)
//   slot 5: aInstanceOpacity  (float, offset 20)
const (
	particleFloatsPerInstance = 6
	particleInstanceStride    = particleFloatsPerInstance * 4

	// Internal flat particle layout (11 floats per particle).
	pX        = 0
	pY        = 1
	pZ        = 2
	pVX       = 3
	pVY       = 4
	pVZ       = 5
	pDuration = 6
	pLife     = 7
	pScale    = 8
	pGravity  = 9
	pRotation = 10
	pStride   = 11

	particleInitialCapacity = 128
)

// ParticleEmitterEntity simulates a burst of textured billboard particles
// drawn with a single instanced draw call. It removes itself once empty.
type ParticleEmitterEntity struct {
	Base EntityBase

	particleData []float32
	count        int
	capacity     int
	texture      *rendering.Texture
	scaleFn      ProgressFunc
	opacityFn    ProgressFunc

	instanceBuffer any
	vertexState    any
	instanceData   []float32
}

// NewParticleEmitterEntity creates an empty emitter for texture.
func NewParticleEmitterEntity(texture *rendering.Texture, scaleFn, opacityFn ProgressFunc) *ParticleEmitterEntity {
	e := &ParticleEmitterEntity{
		texture:      texture,
		scaleFn:      scaleFn,
		opacityFn:    opacityFn,
		capacity:     particleInitialCapacity,
		particleData: make([]float32, particleInitialCapacity*pStride),
	}
	initBase(&e.Base, TypeParticleEmitter, nil)
	return e
}

func (e *ParticleEmitterEntity) GetBase() *EntityBase { return &e.Base }

// Count returns the number of live particles.
func (e *ParticleEmitterEntity) Count() int { return e.count }

// AddParticle spawns a particle; durationMs is its lifetime.
func (e *ParticleEmitterEntity) AddParticle(position, velocity *physics.Vec3, durationMs, startScale, gravity, rotation float32) {
	if e.count >= e.capacity {
		newCap := e.capacity * 2
		grown := make([]float32, newCap*pStride)
		for i := 0; i < len(e.particleData); i++ {
			grown[i] = e.particleData[i]
		}
		e.particleData = grown
		e.capacity = newCap
	}
	base := e.count * pStride
	p := e.particleData
	p[base+pX] = position.X
	p[base+pY] = position.Y
	p[base+pZ] = position.Z
	p[base+pVX] = velocity.X
	p[base+pVY] = velocity.Y
	p[base+pVZ] = velocity.Z
	p[base+pDuration] = durationMs
	p[base+pLife] = durationMs
	p[base+pScale] = startScale
	p[base+pGravity] = gravity
	p[base+pRotation] = rotation
	e.count++
}

// Update integrates particles and swap-removes dead ones; false when empty.
func (e *ParticleEmitterEntity) Update(frameTime float32) bool {
	dtSec := frameTime / 1000
	p := e.particleData
	for i := e.count - 1; i >= 0; i-- {
		base := i * pStride
		p[base+pLife] -= frameTime
		if p[base+pLife] > 0 {
			p[base+pVY] -= p[base+pGravity] * dtSec
			p[base+pX] += p[base+pVX] * dtSec
			p[base+pY] += p[base+pVY] * dtSec
			p[base+pZ] += p[base+pVZ] * dtSec
		} else {
			e.count--
			if i < e.count {
				lastBase := e.count * pStride
				for k := 0; k < pStride; k++ {
					p[base+k] = p[lastBase+k]
				}
			}
		}
	}
	baseUpdate(e, frameTime)
	return e.count > 0
}

func (e *ParticleEmitterEntity) ensureGPUState(requiredSize int) {
	b := rendering.ActiveBackend
	quad := rendering.GlobalShapes.BillboardQuad
	if e.instanceBuffer != nil && len(e.instanceData) >= requiredSize {
		return
	}
	newSize := requiredSize * 2
	if newSize < 100*particleFloatsPerInstance {
		newSize = 100 * particleFloatsPerInstance
	}
	e.instanceData = make([]float32, newSize)
	if e.instanceBuffer != nil {
		b.DeleteBuffer(e.instanceBuffer)
	}
	if e.vertexState != nil {
		b.DeleteVertexState(e.vertexState)
	}
	e.instanceBuffer = b.CreateBuffer(e.instanceData, "vertex")
	e.vertexState = b.CreateVertexState(&rendering.VertexStateDescriptor{
		Attributes: []rendering.VertexAttribute{
			{Buffer: quad.VertexBuffer, Slot: 0, Size: 3, Type: "float", Offset: 0, Stride: 12},
			{Buffer: quad.UVBuffer, Slot: 1, Size: 2, Type: "float", Offset: 0, Stride: 8},
			{Buffer: e.instanceBuffer, Slot: 2, Size: 3, Type: "float", Divisor: 1, Stride: particleInstanceStride, Offset: 0},
			{Buffer: e.instanceBuffer, Slot: 3, Size: 1, Type: "float", Divisor: 1, Stride: particleInstanceStride, Offset: 12},
			{Buffer: e.instanceBuffer, Slot: 4, Size: 1, Type: "float", Divisor: 1, Stride: particleInstanceStride, Offset: 16},
			{Buffer: e.instanceBuffer, Slot: 5, Size: 1, Type: "float", Divisor: 1, Stride: particleInstanceStride, Offset: 20},
		},
		IndexBuffer: quad.Indices[0].IndexBuffer,
	})
}

// Render uploads per-instance data and issues one instanced draw.
func (e *ParticleEmitterEntity) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {
	n := e.count
	b := rendering.ActiveBackend
	sh := rendering.Shaders.InstancedBillboard
	quad := rendering.GlobalShapes.BillboardQuad
	if !e.Base.Visible || e.texture == nil || n == 0 || b == nil || sh == nil || quad == nil || len(quad.Indices) == 0 {
		return
	}
	requiredSize := n * particleFloatsPerInstance
	e.ensureGPUState(requiredSize)

	offset := 0
	p := e.particleData
	out := e.instanceData
	for i := 0; i < n; i++ {
		base := i * pStride
		progress := float32(1) - p[base+pLife]/p[base+pDuration]
		scaleMod := float32(1)
		if e.scaleFn != nil {
			scaleMod = e.scaleFn(progress)
		}
		opacityMod := float32(1)
		if e.opacityFn != nil {
			opacityMod = e.opacityFn(progress)
		}
		out[offset] = p[base+pX]
		out[offset+1] = p[base+pY]
		out[offset+2] = p[base+pZ]
		out[offset+3] = p[base+pScale] * scaleMod
		out[offset+4] = p[base+pRotation]
		out[offset+5] = opacityMod
		offset += particleFloatsPerInstance
	}

	// Whole buffer (<= 2x live data) rather than a per-frame subarray view.
	b.UpdateBuffer(e.instanceBuffer, e.instanceData, 0)

	sh.Bind()
	e.texture.Bind(0)
	b.BindVertexState(e.vertexState)
	b.DrawInstanced(quad.Indices[0].IndexBuffer, len(quad.Indices[0].Array), n)
	b.BindVertexState(nil)
	rendering.UnbindTextureRange(0, 1)
}

func (e *ParticleEmitterEntity) RenderShadow(renderMode string, shader *rendering.Shader) {}
func (e *ParticleEmitterEntity) RenderWireFrame()                                       {}
func (e *ParticleEmitterEntity) UpdateBoundingVolume()                                  {}

func (e *ParticleEmitterEntity) Dispose() {
	baseDispose(&e.Base)
	b := rendering.ActiveBackend
	if b != nil {
		if e.instanceBuffer != nil {
			b.DeleteBuffer(e.instanceBuffer)
		}
		if e.vertexState != nil {
			b.DeleteVertexState(e.vertexState)
		}
	}
	e.instanceBuffer = nil
	e.vertexState = nil
	e.count = 0
	e.particleData = nil
	e.instanceData = nil
	e.texture = nil
}
