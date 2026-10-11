package scene

import (
	"../mathx"
	"../rendering"
)

// GPU particle record (12 floats = 48 bytes, matches WgslParticleUpdate):
//   pos(3) duration | vel(3) life | scale gravity rotation pad
const (
	pX        = 0
	pY        = 1
	pZ        = 2
	pDuration = 3
	pVX       = 4
	pVY       = 5
	pVZ       = 6
	pLife     = 7
	pScale    = 8
	pGravity  = 9
	pRotation = 10
	pStride   = 12

	// Instance record (6 floats = 24 bytes, rendering.ParticleInstanceStride).
	particleFloatsPerInstance = 6

	particleInitialCapacity = 128
	// particleLUTSize is the number of (scale, opacity) curve samples.
	particleLUTSize = 32
	// particleWorkgroup matches @workgroup_size(64) in WgslParticleUpdate.
	particleWorkgroup = 64
)

// ParticleEmitterEntity simulates a burst of textured billboard particles on
// the GPU: spawned records are uploaded once, a compute dispatch integrates
// them and writes the instance buffer, and one instanced draw renders them.
// Lifetimes are also tracked on the CPU so the emitter removes itself once
// every particle is dead. Slots are never reused (burst semantics): dead
// particles get zero-size instances until the emitter is removed.
type ParticleEmitterEntity struct {
	Base EntityBase

	particleData []float32
	count        int // spawned (high-water)
	live         int // life > 0
	capacity     int
	texture      *rendering.Texture
	scaleFn      ProgressFunc
	opacityFn    ProgressFunc
	// pendingMs accumulates frame time until the next GPU simulate.
	pendingMs float32

	backend        *rendering.Backend
	particleBuffer rendering.GPUBuffer
	instanceBuffer rendering.GPUBuffer
	curveBuffer    rendering.GPUBuffer
	bindGroup      rendering.GPUBindGroup
	gpuCapacity    int
	uploaded       int
	curve          []float32
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
	e.buildCurve()
	return e
}

// buildCurve samples the scale/opacity progress functions into the LUT.
func (e *ParticleEmitterEntity) buildCurve() {
	e.curve = make([]float32, particleLUTSize*2)
	for i := 0; i < particleLUTSize; i++ {
		progress := float32(i) / float32(particleLUTSize-1)
		s := float32(1)
		if e.scaleFn != nil {
			s = e.scaleFn(progress)
		}
		o := float32(1)
		if e.opacityFn != nil {
			o = e.opacityFn(progress)
		}
		e.curve[i*2] = s
		e.curve[i*2+1] = o
	}
}

func (e *ParticleEmitterEntity) GetBase() *EntityBase { return &e.Base }

// Count returns the number of live particles.
func (e *ParticleEmitterEntity) Count() int { return e.live }

// SpawnedCount returns the number of particle slots in use (live or dead).
func (e *ParticleEmitterEntity) SpawnedCount() int { return e.count }

// AddParticle spawns a particle; durationMs is its lifetime.
func (e *ParticleEmitterEntity) AddParticle(position, velocity *mathx.Vec3, durationMs, startScale, gravity, rotation float32) {
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
	p[base+pDuration] = durationMs
	p[base+pVX] = velocity.X
	p[base+pVY] = velocity.Y
	p[base+pVZ] = velocity.Z
	p[base+pLife] = durationMs
	p[base+pScale] = startScale
	p[base+pGravity] = gravity
	p[base+pRotation] = rotation
	p[base+11] = 0
	e.count++
	e.live++
}

// Update ages particles on the CPU (for removal) and banks the frame time
// for the GPU integration; false when every particle is dead.
func (e *ParticleEmitterEntity) Update(frameTime float32) bool {
	p := e.particleData
	live := 0
	for i := 0; i < e.count; i++ {
		base := i * pStride
		if p[base+pLife] > 0 {
			p[base+pLife] -= frameTime
			if p[base+pLife] > 0 {
				live++
			}
		}
	}
	e.live = live
	e.pendingMs += frameTime
	baseUpdate(e, frameTime)
	return e.live > 0
}

// ensureGPUState (re)creates the storage buffers and bind group when the
// spawned count outgrows them. Growth re-uploads every record from the CPU
// copy (positions of already-integrated particles restart from spawn), so
// bursts should spawn before their first frame.
func (e *ParticleEmitterEntity) ensureGPUState(r *rendering.Renderer) {
	if e.particleBuffer != nil && e.gpuCapacity >= e.count {
		return
	}
	b := r.Backend
	e.releaseGPU()
	e.backend = b
	newCap := e.gpuCapacity * 2
	if newCap < e.count {
		newCap = e.count
	}
	if newCap < particleInitialCapacity {
		newCap = particleInitialCapacity
	}
	e.gpuCapacity = newCap
	e.particleBuffer = b.CreateBuffer("particles", newCap*pStride*4, rendering.BufferUsageStorage, nil)
	e.instanceBuffer = b.CreateBuffer("particle-instances", newCap*rendering.ParticleInstanceStride, rendering.BufferUsageStorage|rendering.BufferUsageVertex, nil)
	e.curveBuffer = b.CreateFloatBuffer("particle-curve", e.curve, rendering.BufferUsageStorage)
	e.bindGroup = b.CreateBindGroup("particles", r.Layouts.Particle, []any{
		rendering.BindingEntry(0, rendering.BufferBinding(e.particleBuffer, newCap*pStride*4)),
		rendering.BindingEntry(1, rendering.BufferBinding(e.instanceBuffer, newCap*rendering.ParticleInstanceStride)),
		rendering.BindingEntry(2, rendering.BufferBinding(e.curveBuffer, len(e.curve)*4)),
	})
	e.uploaded = 0
}

// Simulate uploads newly spawned records and dispatches the compute update
// for every spawned slot with the banked frame time.
func (e *ParticleEmitterEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {
	if e.count == 0 || e.texture == nil || r.Backend == nil {
		return
	}
	e.ensureGPUState(r)
	if e.uploaded < e.count {
		r.Backend.WriteBufferSlice(e.particleBuffer, e.uploaded*pStride*4, e.particleData, e.uploaded*pStride, (e.count-e.uploaded)*pStride)
		e.uploaded = e.count
	}
	ms := e.pendingMs
	e.pendingMs = 0
	r.NextObject()
	r.ObjectParams(0, ms/1000, ms, float32(e.count), particleLUTSize)
	r.ComputeBindGroup1(pass, e.bindGroup)
	r.ComputeObjectOffset(pass)
	pass.dispatchWorkgroups((e.count+particleWorkgroup-1)/particleWorkgroup, 1, 1)
}

// Draw issues one instanced draw of the billboard quad over every spawned
// slot with the instanced-billboard pipeline.
func (e *ParticleEmitterEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	quad := r.Shapes.BillboardQuad
	if e.texture == nil || e.count == 0 || e.instanceBuffer == nil || quad == nil {
		return
	}
	r.NextObject()
	r.BindGroup1(e.texture.SpriteBindGroup(r))
	quad.DrawInstanced(r, e.instanceBuffer, e.count)
}

func (e *ParticleEmitterEntity) DrawShadow(r *rendering.Renderer)    {}
func (e *ParticleEmitterEntity) DrawWireframe(r *rendering.Renderer) {}
func (e *ParticleEmitterEntity) DrawSkeleton(r *rendering.Renderer)  {}
func (e *ParticleEmitterEntity) Bounds() *mathx.BoundingBox          { return e.Base.BoundingBox }
func (e *ParticleEmitterEntity) TriangleCount() int                    { return 0 }
func (e *ParticleEmitterEntity) CastsShadow() bool                     { return false }

func (e *ParticleEmitterEntity) releaseGPU() {
	if e.backend != nil {
		e.backend.DestroyBuffer(e.particleBuffer)
		e.backend.DestroyBuffer(e.instanceBuffer)
		e.backend.DestroyBuffer(e.curveBuffer)
	}
	e.particleBuffer = nil
	e.instanceBuffer = nil
	e.curveBuffer = nil
	e.bindGroup = nil
	e.gpuCapacity = 0
	e.uploaded = 0
}

func (e *ParticleEmitterEntity) Dispose() {
	baseDispose(&e.Base)
	e.releaseGPU()
	e.backend = nil
	e.count = 0
	e.live = 0
	e.particleData = nil
	e.texture = nil
}
