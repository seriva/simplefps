package rendering

import (
	"../mathx"
	"js:./interop.d.ts"
)

// Package-level scratch (zero per-frame allocation).
var (
	ambientScratch = &mathx.Vec3{}
	// ambientVec is the current frame's ambient colour (rgb, a=1).
	ambientVec = []float32{0, 0, 0, 1}
	// Bounding-box overlay colours per draw list.
	debugWhite    = []float32{1, 1, 1, 1}
	debugYellow   = []float32{1, 1, 0, 1}
	boundsRed     = []float32{1, 0, 0, 1}
	boundsGreen   = []float32{0, 1, 0, 1}
	boundsYellow  = []float32{1, 1, 0, 1}
	boundsBlue    = []float32{0, 0, 1, 1}
	boundsMagenta = []float32{1, 0, 1, 1}
	boundsCyan    = []float32{0, 1, 1, 1}
	boundsOrange  = []float32{1, 0.5, 0, 1}
	// boundsScratch is the matrix reused by drawBounds/drawLightBounds.
	boundsScratch = mathx.NewMat4()
	// Kawase blur: offsets below zero select the identity copy.
	blurIdentityOffset = float32(-1)
	// blurWorkgroup matches @workgroup_size(8, 8, 1) in WgslKawaseBlur.
	blurWorkgroup = 8
)

// passResources holds the pre-built render pass descriptors and the pass
// input bind groups for the current render targets. Descriptors are plain
// JS objects; the swapchain-bound ones get their view patched per frame.
type passResources struct {
	gbuffer     map[string]any
	shadow      map[string]any
	fpsGeom     map[string]any
	lighting    map[string]any
	transparent map[string]any
	postScratch map[string]any
	postSwap    map[string]any
	fsrEasu     map[string]any
	fsrRcas     map[string]any
	debug       map[string]any

	// Attachments whose clearValue/view are patched per frame.
	gbufferColor0 map[string]any
	lightingColor map[string]any
	postSwapColor map[string]any
	fsrRcasColor  map[string]any
	debugColor    map[string]any
	gbufferClear  []float32
	lightingClear []float32

	deferredBG            GPUBindGroup
	postBG                GPUBindGroup
	postDirt              *Texture
	postDirtVersion       int
	easuBG                GPUBindGroup
	rcasBG                GPUBindGroup
	blurLightToScratch    GPUBindGroup
	blurScratchToLight    GPUBindGroup
	blurEmissiveToScratch GPUBindGroup
	blurScratchToEmissive GPUBindGroup
}

func colorAttachment(view GPUTextureView, clear []float32) map[string]any {
	a := map[string]any{"view": view, "storeOp": "store"}
	if clear != nil {
		a["loadOp"] = "clear"
		a["clearValue"] = clear
	} else {
		a["loadOp"] = "load"
	}
	return a
}

func depthAttachment(view GPUTextureView, clear bool) map[string]any {
	a := map[string]any{"view": view, "depthStoreOp": "store"}
	if clear {
		a["depthLoadOp"] = "clear"
		a["depthClearValue"] = 1.0
	} else {
		a["depthLoadOp"] = "load"
	}
	return a
}

func renderPass(label string, colors []any, depth map[string]any) map[string]any {
	d := map[string]any{"label": label, "colorAttachments": colors}
	if depth != nil {
		d["depthStencilAttachment"] = depth
	}
	return d
}

var (
	clearBlack = []float32{0, 0, 0, 1}
	clearWhite = []float32{1, 1, 1, 1}
	clearZero  = []float32{0, 0, 0, 0}
)

// buildPassResources creates descriptors + input bind groups for the
// current render targets (called by AllocateBuffers).
func (r *Renderer) buildPassResources() {
	b := r.Backend
	p := &passResources{
		gbufferClear:  []float32{0, 0, 0, 1},
		lightingClear: []float32{0, 0, 0, 1},
	}
	g := &r.GBuffer

	p.gbufferColor0 = colorAttachment(g.WorldPosition.View, p.gbufferClear)
	p.gbuffer = renderPass("gbuffer", []any{
		p.gbufferColor0,
		colorAttachment(g.Normal.View, clearZero),
		colorAttachment(g.Color.View, p.gbufferClear),
		colorAttachment(g.Emissive.View, clearZero),
	}, depthAttachment(r.Depth.View, true))

	p.shadow = renderPass("shadow", []any{
		colorAttachment(r.Shadow.View, clearWhite),
	}, depthAttachment(r.Depth.View, false))

	p.fpsGeom = renderPass("fps-geometry", []any{
		colorAttachment(g.WorldPosition.View, nil),
		colorAttachment(g.Normal.View, nil),
		colorAttachment(g.Color.View, nil),
		colorAttachment(g.Emissive.View, nil),
	}, depthAttachment(r.Depth.View, false))

	p.lightingColor = colorAttachment(r.Light.View, p.lightingClear)
	p.lighting = renderPass("lighting", []any{p.lightingColor}, nil)

	p.transparent = renderPass("transparent", []any{
		colorAttachment(r.Light.View, nil),
	}, depthAttachment(r.Depth.View, false))

	p.postScratch = renderPass("postprocess-scratch", []any{
		colorAttachment(r.Scratch.View, clearBlack),
	}, nil)
	p.postSwapColor = colorAttachment(nil, clearBlack)
	p.postSwap = renderPass("postprocess", []any{p.postSwapColor}, nil)

	if r.FsrEasu != nil {
		p.fsrEasu = renderPass("fsr-easu", []any{
			colorAttachment(r.FsrEasu.View, nil),
		}, nil)
		p.fsrRcasColor = colorAttachment(nil, nil)
		p.fsrRcas = renderPass("fsr-rcas", []any{p.fsrRcasColor}, nil)
		p.easuBG = b.CreateBindGroup("fsr-easu-input", r.Layouts.Sampled, []any{
			bindingEntry(0, b.ClampSampler),
			bindingEntry(1, r.Scratch.View),
		})
		p.rcasBG = b.CreateBindGroup("fsr-rcas-input", r.Layouts.Sampled, []any{
			bindingEntry(0, b.ClampSampler),
			bindingEntry(1, r.FsrEasu.View),
		})
	}

	p.debugColor = colorAttachment(nil, nil)
	p.debug = renderPass("debug", []any{p.debugColor}, nil)

	p.deferredBG = b.CreateBindGroup("deferred-input", r.Layouts.Deferred, []any{
		bindingEntry(0, g.WorldPosition.View),
		bindingEntry(1, g.Normal.View),
		bindingEntry(2, g.Color.View),
	})

	p.blurLightToScratch = r.blurBindGroup("blur-light-scratch", r.Light, r.Scratch)
	p.blurScratchToLight = r.blurBindGroup("blur-scratch-light", r.Scratch, r.Light)
	p.blurEmissiveToScratch = r.blurBindGroup("blur-emissive-scratch", g.Emissive, r.Scratch)
	p.blurScratchToEmissive = r.blurBindGroup("blur-scratch-emissive", r.Scratch, g.Emissive)

	r.passes = p
}

func (r *Renderer) blurBindGroup(label string, src, dst *Texture) GPUBindGroup {
	b := r.Backend
	return b.CreateBindGroup(label, r.Layouts.Blur, []any{
		bindingEntry(0, b.ClampSampler),
		bindingEntry(1, src.View),
		bindingEntry(2, dst.View),
	})
}

// postProcessBindGroup returns the group-1 inputs of the post-processing
// pass, rebuilt when the dirt texture (or its content) changes.
func (r *Renderer) postProcessBindGroup(dirt *Texture) GPUBindGroup {
	p := r.passes
	v := versionOf(dirt)
	if p.postBG != nil && p.postDirt == dirt && p.postDirtVersion == v {
		return p.postBG
	}
	b := r.Backend
	p.postBG = b.CreateBindGroup("postprocess-input", r.Layouts.PostProcess, []any{
		bindingEntry(0, b.ClampSampler),
		bindingEntry(1, r.GBuffer.Color.View),
		bindingEntry(2, r.Light.View),
		bindingEntry(3, r.GBuffer.Emissive.View),
		bindingEntry(4, viewOf(dirt, b)),
		bindingEntry(5, r.Shadow.View),
		bindingEntry(6, r.GBuffer.Normal.View),
	})
	p.postDirt = dirt
	p.postDirtVersion = v
	return p.postBG
}

func (r *Renderer) sampleAmbient(scene SceneSource) {
	scene.Ambient(ambientScratch)
	ambientVec[0] = ambientScratch.X
	ambientVec[1] = ambientScratch.Y
	ambientVec[2] = ambientScratch.Z
	p := r.passes
	p.gbufferClear[0] = ambientScratch.X
	p.gbufferClear[1] = ambientScratch.Y
	p.gbufferClear[2] = ambientScratch.Z
	p.lightingClear[0] = ambientScratch.X
	p.lightingClear[1] = ambientScratch.Y
	p.lightingClear[2] = ambientScratch.Z
}

// Render draws one full frame: world geometry into the G-buffer, drop
// shadows, FPS geometry, deferred lighting, transparents, emissive blur,
// post-processing, optional FSR and the debug overlay. All inputs are
// required; the frame is skipped if any is missing.
func (r *Renderer) Render(cam *CameraView, scene SceneSource, opts *RenderOptions, time float32) {
	if r.Backend == nil || cam == nil || scene == nil || opts == nil || r.passes == nil || !r.Ready() {
		return
	}
	b := r.Backend
	b.BeginFrame()
	r.Stats.Reset()
	r.Objects.reset()
	r.Bones.Count = 0
	r.ProceduralDetail = opts.ProceduralDetail

	r.sampleAmbient(scene)
	r.UpdateFrameDataUBO(cam, time, opts.ProceduralDetail)

	r.worldGeomPass(scene)
	r.shadowPass(scene)
	r.fpsGeomPass(scene)
	r.lightingPass(cam, scene, opts)
	r.simulateParticles(scene)
	r.transparentPass(scene)
	r.blurImage(r.GBuffer.Emissive, r.passes.blurEmissiveToScratch, r.passes.blurScratchToEmissive, opts.EmissiveIterations, opts.EmissiveOffset)
	r.postProcessingPass(opts)
	if opts.DoFSR && r.FsrEasu != nil {
		r.fsrPass(opts)
	}
	r.debugPass(scene)

	r.flushRings()
	b.EndFrame()
}

// drawList draws every item of list with the current pipeline.
func drawList(r *Renderer, list *DrawList, mode MaterialMode) {
	for i := 0; i < list.Count; i++ {
		list.Items[i].Draw(r, mode)
	}
}

// drawListCounted is drawList plus mesh/triangle stats accounting.
func drawListCounted(r *Renderer, list *DrawList, mode MaterialMode) {
	for i := 0; i < list.Count; i++ {
		d := list.Items[i]
		d.Draw(r, mode)
		r.Stats.MeshCount++
		r.Stats.TriangleCount += d.TriangleCount()
	}
}

// worldGeomPass fills the G-buffer: skybox (depth off), opaque meshes, FPS
// meshes, then skinned meshes. FPS meshes are drawn here at full depth range
// so they occlude and receive lighting like world geometry, and again by
// fpsGeomPass in the near depth range so view models layer over the world.
func (r *Renderer) worldGeomPass(scene SceneSource) {
	r.beginPass(r.passes.gbuffer)
	r.viewport(r.Width, r.Height, 0.1, 1.0)

	r.SetPipeline(r.Pipelines.Skybox)
	drawList(r, scene.Skyboxes(), ModeAll)

	r.SetPipeline(r.Pipelines.Geometry)
	drawListCounted(r, scene.Meshes(), ModeOpaque)
	drawList(r, scene.FPSMeshes(), ModeOpaque)

	r.SetPipeline(r.Pipelines.SkinnedGeometry)
	drawListCounted(r, scene.SkinnedMeshes(), ModeOpaque)
	r.endPass()
}

func (r *Renderer) fpsGeomPass(scene SceneSource) {
	fps := scene.FPSMeshes()
	if fps.Count == 0 {
		return
	}
	r.beginPass(r.passes.fpsGeom)
	r.viewport(r.Width, r.Height, 0.0, 0.1)
	r.SetPipeline(r.Pipelines.Geometry)
	drawList(r, fps, ModeAll)
	r.endPass()
}

// drawShadows draws every caster in list with the current pipeline.
func (r *Renderer) drawShadows(list *DrawList) {
	for i := 0; i < list.Count; i++ {
		list.Items[i].DrawShadow(r)
	}
}

// shadowPass renders flattened drop shadows into the R8 shadow map. The
// shadow pipelines use the empty group-1 layout.
func (r *Renderer) shadowPass(scene SceneSource) {
	r.beginPass(r.passes.shadow)
	r.viewport(r.Width, r.Height, 0.1, 1.0)
	r.BindGroup1(r.emptyBG)
	r.SetPipeline(r.Pipelines.EntityShadows)
	r.drawShadows(scene.Meshes())
	r.SetPipeline(r.Pipelines.SkinnedEntityShadows)
	r.drawShadows(scene.SkinnedMeshes())
	r.endPass()
}

// Ambient returns the current frame's ambient colour (for shadow probes).
func (r *Renderer) Ambient() []float32 {
	return ambientVec
}

// sortLights ranks the visible point and spot lights by contribution at the
// camera; the lighting pass draws in that order and the transparent pass
// packs the top entries into the light storage buffer.
func (r *Renderer) sortLights(cam *CameraView, scene SceneSource) {
	camPos := &cam.Position
	r.pointSorter.Begin()
	pl := scene.PointLights()
	for i := 0; i < pl.Count; i++ {
		r.pointSorter.Add(i, pl.Items[i].LightScore(camPos))
	}
	r.pointSorter.Sort()

	r.spotSorter.Begin()
	sl := scene.SpotLights()
	for i := 0; i < sl.Count; i++ {
		r.spotSorter.Add(i, sl.Items[i].LightScore(camPos))
	}
	r.spotSorter.Sort()
}

// drawLightsSorted draws list in sorter order and counts them.
func (r *Renderer) drawLightsSorted(list *LightList, sorter *LightSorter) {
	for i := 0; i < sorter.Count; i++ {
		list.Items[sorter.Entries[i].Index].Draw(r, ModeAll)
		r.Stats.LightCount++
	}
}

func (r *Renderer) lightingPass(cam *CameraView, scene SceneSource, opts *RenderOptions) {
	r.beginPass(r.passes.lighting)
	r.viewport(r.Width, r.Height, 0, 1)
	r.BindGroup1(r.passes.deferredBG)

	r.SetPipeline(r.Pipelines.DirectionalLight)
	drawList(r, scene.DirectionalLights(), ModeAll)

	r.sortLights(cam, scene)
	r.SetPipeline(r.Pipelines.PointLight)
	r.drawLightsSorted(scene.PointLights(), r.pointSorter)
	r.SetPipeline(r.Pipelines.SpotLight)
	r.drawLightsSorted(scene.SpotLights(), r.spotSorter)
	r.endPass()

	r.blurImage(r.Light, r.passes.blurLightToScratch, r.passes.blurScratchToLight, opts.LightBlurIterations, 0.2)
}

// uploadTransparentLighting packs the lights (sorted by lightingPass this
// frame, points first then spots) into the light storage buffer.
func (r *Renderer) uploadTransparentLighting(scene SceneSource) {
	r.Lighting.Reset()
	pl := scene.PointLights()
	for i := 0; i < r.pointSorter.Count; i++ {
		pl.Items[r.pointSorter.Entries[i].Index].AddToLighting(r.Lighting)
	}
	sl := scene.SpotLights()
	for i := 0; i < r.spotSorter.Count; i++ {
		sl.Items[r.spotSorter.Entries[i].Index].AddToLighting(r.Lighting)
	}
	r.Lighting.Upload(r, ambientVec)
}

// simulateParticles runs every emitter's compute update in one compute
// pass before the transparent pass reads the instance buffers.
func (r *Renderer) simulateParticles(scene SceneSource) {
	emitters := scene.ParticleEmitters()
	if emitters.Count == 0 {
		return
	}
	pass := r.Backend.Encoder.beginComputePass(nil)
	pass.setBindGroup(GroupFrame, r.frameBG, noOffsets)
	pass.setPipeline(r.Pipelines.ParticleUpdate)
	for i := 0; i < emitters.Count; i++ {
		emitters.Items[i].Simulate(r, pass)
	}
	pass.end()
}

// ComputeObjectOffset points group 2 of a compute pass at the current
// ObjectData slot (compute pipelines share the Object layout).
func (r *Renderer) ComputeObjectOffset(pass GPUComputePassEncoder) {
	o := r.Objects
	o.offsets[0] = o.cur * ObjectStride
	pass.setBindGroup(GroupObject, r.objectBG, o.offsets)
}

// ComputeBindGroup1 sets group 1 of a compute pass.
func (r *Renderer) ComputeBindGroup1(pass GPUComputePassEncoder, bg GPUBindGroup) {
	pass.setBindGroup(GroupMaterial, bg, noOffsets)
}

func (r *Renderer) transparentPass(scene SceneSource) {
	transparent := scene.Transparent()
	billboards := scene.Billboards()
	emitters := scene.ParticleEmitters()
	if transparent.Count == 0 && billboards.Count == 0 && emitters.Count == 0 {
		return
	}
	r.beginPass(r.passes.transparent)
	r.viewport(r.Width, r.Height, 0.1, 1.0)

	if transparent.Count > 0 {
		r.uploadTransparentLighting(scene)
		r.Pass.setBindGroup(GroupLighting, r.lightingBG, noOffsets)
		r.SetPipeline(r.Pipelines.Transparent)
		drawList(r, transparent, ModeTranslucent)
	}

	r.SetPipeline(r.Pipelines.Billboard)
	drawList(r, billboards, ModeAll)
	r.SetPipeline(r.Pipelines.InstancedBillboard)
	drawList(r, emitters, ModeAll)
	r.endPass()
}

// drawBounds draws the AABB of every item in list with the debug pipeline.
func (r *Renderer) drawBounds(list *DrawList, color []float32) {
	box := r.Shapes.BoundingBoxMesh
	if box == nil || list.Count == 0 {
		return
	}
	for i := 0; i < list.Count; i++ {
		bb := list.Items[i].Bounds()
		if bb == nil {
			continue
		}
		r.NextObject()
		r.ObjectWorld(bb.TransformMatrix(boundsScratch))
		r.ObjectParamsVec(0, color)
		// BoundingBoxMesh indices are already a line list; DrawWireframe would re-pair them as triangle edges.
		box.Draw(r, false, ModeAll)
	}
}

// drawLightBounds is drawBounds for a LightList.
func (r *Renderer) drawLightBounds(list *LightList, color []float32) {
	box := r.Shapes.BoundingBoxMesh
	if box == nil || list.Count == 0 {
		return
	}
	for i := 0; i < list.Count; i++ {
		bb := list.Items[i].Bounds()
		if bb == nil {
			continue
		}
		r.NextObject()
		r.ObjectWorld(bb.TransformMatrix(boundsScratch))
		r.ObjectParamsVec(0, color)
		box.Draw(r, false, ModeAll)
	}
}

func drawWireframes(r *Renderer, list *DrawList) {
	for i := 0; i < list.Count; i++ {
		list.Items[i].DrawWireframe(r)
	}
}

// DebugColor returns the colour wireframe/skeleton draws should write into
// params0 of their ObjectData slot.
func (r *Renderer) DebugColor() []float32 {
	return r.debugColor
}

// debugPass draws bounding boxes, wireframes, light volumes and skeletons
// straight to the swapchain according to r.Debug.
func (r *Renderer) debugPass(scene SceneSource) {
	d := r.Debug
	if !d.ShowBoundingVolumes && !d.ShowWireframes && !d.ShowLightVolumes && !d.ShowSkeleton {
		return
	}
	r.passes.debugColor["view"] = r.Backend.SwapchainView
	r.beginPass(r.passes.debug)
	r.viewport(r.Backend.SwapchainWidth(), r.Backend.SwapchainHeight(), 0, 1)
	r.BindGroup1(r.emptyBG)
	r.SetPipeline(r.Pipelines.Debug)

	if d.ShowBoundingVolumes {
		r.drawBounds(scene.Meshes(), boundsRed)
		r.drawBounds(scene.FPSMeshes(), boundsGreen)
		r.drawBounds(scene.DirectionalLights(), boundsYellow)
		r.drawLightBounds(scene.PointLights(), boundsYellow)
		r.drawLightBounds(scene.SpotLights(), boundsYellow)
		r.drawBounds(scene.Skyboxes(), boundsBlue)
		r.drawBounds(scene.SkinnedMeshes(), boundsMagenta)
		r.drawBounds(scene.Billboards(), boundsCyan)
		r.drawBounds(scene.ParticleEmitters(), boundsOrange)
	}

	if d.ShowWireframes {
		r.debugColor = debugWhite
		drawWireframes(r, scene.Meshes())
		drawWireframes(r, scene.SkinnedMeshes())
		drawWireframes(r, scene.FPSMeshes())
		drawWireframes(r, scene.Skyboxes())
	}

	if d.ShowLightVolumes {
		r.debugColor = debugYellow
		pl := scene.PointLights()
		for i := 0; i < pl.Count; i++ {
			pl.Items[i].DrawWireframe(r)
		}
		sl := scene.SpotLights()
		for i := 0; i < sl.Count; i++ {
			sl.Items[i].DrawWireframe(r)
		}
	}

	if d.ShowSkeleton {
		r.debugColor = debugWhite
		skinned := scene.SkinnedMeshes()
		for i := 0; i < skinned.Count; i++ {
			skinned.Items[i].DrawSkeleton(r)
		}
	}
	r.endPass()
}

func (r *Renderer) postProcessingPass(opts *RenderOptions) {
	b := r.Backend
	bg := r.postProcessBindGroup(opts.Dirt)
	if opts.DoFSR && r.FsrEasu != nil {
		r.beginPass(r.passes.postScratch)
		r.viewport(r.Width, r.Height, 0, 1)
		r.SetPipeline(r.Pipelines.PostProcessScratch)
	} else {
		r.passes.postSwapColor["view"] = b.SwapchainView
		r.beginPass(r.passes.postSwap)
		r.viewport(b.SwapchainWidth(), b.SwapchainHeight(), 0, 1)
		r.SetPipeline(r.Pipelines.PostProcessSwapchain)
	}
	r.BindGroup1(bg)

	dirt := float32(0)
	if opts.DoDirt {
		dirt = opts.DirtIntensity
	}
	r.NextObject()
	r.ObjectParams(0, opts.Gamma, opts.EmissiveMult, dirt, opts.ShadowIntensity)
	r.ObjectParams(1, ambientVec[0], ambientVec[1], ambientVec[2], 1)
	r.DrawFullscreen()
	r.endPass()
}

func (r *Renderer) fsrPass(opts *RenderOptions) {
	b := r.Backend
	nw := r.FsrWidth
	nh := r.FsrHeight

	r.beginPass(r.passes.fsrEasu)
	r.viewport(nw, nh, 0, 1)
	r.BindGroup1(r.passes.easuBG)
	r.SetPipeline(r.Pipelines.FsrEasu)
	r.NextObject()
	r.ObjectParams(0, float32(r.Width), float32(r.Height), float32(nw), float32(nh))
	r.DrawFullscreen()
	r.endPass()

	sharp := opts.FsrSharpness
	if sharp == 0 {
		sharp = 0.2
	}
	r.passes.fsrRcasColor["view"] = b.SwapchainView
	r.beginPass(r.passes.fsrRcas)
	r.viewport(b.SwapchainWidth(), b.SwapchainHeight(), 0, 1)
	r.BindGroup1(r.passes.rcasBG)
	r.SetPipeline(r.Pipelines.FsrRcas)
	r.NextObject()
	r.ObjectParams(0, sharp, 0, 0, 0)
	r.DrawFullscreen()
	r.endPass()
}

// blurImage runs the Kawase compute blur: ping-pongs src through Scratch
// with growing offsets; odd iteration counts end with an identity copy back.
func (r *Renderer) blurImage(src *Texture, toScratch, fromScratch GPUBindGroup, iterations int, radius float32) {
	if iterations <= 0 || src == nil || r.Scratch == nil {
		return
	}
	groupsX := (r.Width + blurWorkgroup - 1) / blurWorkgroup
	groupsY := (r.Height + blurWorkgroup - 1) / blurWorkgroup
	pass := r.Backend.Encoder.beginComputePass(nil)
	pass.setBindGroup(GroupFrame, r.frameBG, noOffsets)
	pass.setPipeline(r.Pipelines.KawaseBlur)
	for i := 0; i < iterations; i++ {
		if i%2 == 0 {
			pass.setBindGroup(GroupMaterial, toScratch, noOffsets)
		} else {
			pass.setBindGroup(GroupMaterial, fromScratch, noOffsets)
		}
		r.NextObject()
		r.ObjectParams(0, float32(i+1)*radius, 0, 0, 0)
		r.ComputeObjectOffset(pass)
		pass.dispatchWorkgroups(groupsX, groupsY, 1)
	}
	if iterations%2 != 0 {
		pass.setBindGroup(GroupMaterial, fromScratch, noOffsets)
		r.NextObject()
		r.ObjectParams(0, blurIdentityOffset, 0, 0, 0)
		r.ComputeObjectOffset(pass)
		pass.dispatchWorkgroups(groupsX, groupsY, 1)
	}
	pass.end()
}
