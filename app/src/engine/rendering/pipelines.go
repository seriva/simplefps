package rendering

import (
	"gofront/webgpu"
)

// Layouts holds every webgpu.BindGroupLayout the renderer uses (see wgsl.go for
// the per-group contract).
type Layouts struct {
	Frame         webgpu.BindGroupLayout
	Material      webgpu.BindGroupLayout
	Deferred      webgpu.BindGroupLayout
	Blur          webgpu.BindGroupLayout
	PostProcess   webgpu.BindGroupLayout
	Sampled       webgpu.BindGroupLayout
	Sprite        webgpu.BindGroupLayout
	Particle      webgpu.BindGroupLayout
	Empty         webgpu.BindGroupLayout
	Object        webgpu.BindGroupLayout
	SkinnedObject webgpu.BindGroupLayout
	Lighting      webgpu.BindGroupLayout
}

// Pipeline is a pre-baked webgpu.RenderPipeline plus the object bind group it
// expects at group 2 and an optional cull-disabled twin for double-sided
// materials.
type Pipeline struct {
	Label    string
	GPU      webgpu.RenderPipeline
	ObjectBG webgpu.BindGroup
	Skinned  bool
	CullOff  *Pipeline
}

// Pipelines is the renderer's immutable pipeline set, created once at Init.
type Pipelines struct {
	Geometry             *Pipeline
	Skybox               *Pipeline
	SkinnedGeometry      *Pipeline
	EntityShadows        *Pipeline
	SkinnedEntityShadows *Pipeline
	DirectionalLight     *Pipeline
	PointLight           *Pipeline
	SpotLight            *Pipeline
	Transparent          *Pipeline
	Billboard            *Pipeline
	InstancedBillboard   *Pipeline
	PostProcessSwapchain *Pipeline
	PostProcessScratch   *Pipeline
	FsrEasu              *Pipeline
	FsrRcas              *Pipeline
	Debug                *Pipeline
	SkinnedDebug         *Pipeline

	KawaseBlur     webgpu.ComputePipeline
	ParticleUpdate webgpu.ComputePipeline
}

const stageVF = ShaderStageVertex | ShaderStageFragment
const stageAll = ShaderStageVertex | ShaderStageFragment | ShaderStageCompute

func (r *Renderer) createLayouts() {
	b := r.Backend
	l := &Layouts{}
	l.Frame = b.CreateBindGroupLayout("frame", []webgpu.BindGroupLayoutEntry{
		layoutBuffer(0, stageAll, "uniform", false),
	})
	l.Material = b.CreateBindGroupLayout("material", []webgpu.BindGroupLayoutEntry{
		layoutBuffer(0, stageVF, "uniform", false),
		layoutSampler(1, ShaderStageFragment),
		layoutTexture(2, ShaderStageFragment, "float"),
		layoutTexture(3, ShaderStageFragment, "float"),
		layoutTexture(4, ShaderStageFragment, "float"),
		layoutTexture(5, ShaderStageFragment, "float"),
		layoutTexture(6, ShaderStageFragment, "float"),
		layoutTexture(7, ShaderStageFragment, "float"),
		layoutSampler(8, ShaderStageFragment),
	})
	l.Deferred = b.CreateBindGroupLayout("deferred", []webgpu.BindGroupLayoutEntry{
		layoutTexture(0, ShaderStageFragment, "float"),
		layoutTexture(1, ShaderStageFragment, "float"),
		layoutTexture(2, ShaderStageFragment, "float"),
	})
	l.Blur = b.CreateBindGroupLayout("blur", []webgpu.BindGroupLayoutEntry{
		layoutSampler(0, ShaderStageCompute),
		layoutTexture(1, ShaderStageCompute, "float"),
		layoutStorageTexture(2, ShaderStageCompute, FormatRGBA8),
	})
	l.PostProcess = b.CreateBindGroupLayout("postprocess", []webgpu.BindGroupLayoutEntry{
		layoutSampler(0, ShaderStageFragment),
		layoutTexture(1, ShaderStageFragment, "float"),
		layoutTexture(2, ShaderStageFragment, "float"),
		layoutTexture(3, ShaderStageFragment, "float"),
		layoutTexture(4, ShaderStageFragment, "float"),
		layoutTexture(5, ShaderStageFragment, "float"),
		layoutTexture(6, ShaderStageFragment, "float"),
	})
	l.Sampled = b.CreateBindGroupLayout("sampled", []webgpu.BindGroupLayoutEntry{
		layoutSampler(0, ShaderStageFragment),
		layoutTexture(1, ShaderStageFragment, "float"),
	})
	l.Sprite = b.CreateBindGroupLayout("sprite", []webgpu.BindGroupLayoutEntry{
		layoutSampler(0, ShaderStageFragment),
		layoutTexture(1, ShaderStageFragment, "float"),
	})
	l.Particle = b.CreateBindGroupLayout("particle", []webgpu.BindGroupLayoutEntry{
		layoutBuffer(0, ShaderStageCompute, "storage", false),
		layoutBuffer(1, ShaderStageCompute, "storage", false),
		layoutBuffer(2, ShaderStageCompute, "read-only-storage", false),
	})
	l.Empty = b.CreateBindGroupLayout("empty", []webgpu.BindGroupLayoutEntry{})
	l.Object = b.CreateBindGroupLayout("object", []webgpu.BindGroupLayoutEntry{
		layoutBuffer(0, stageAll, "uniform", true),
	})
	l.SkinnedObject = b.CreateBindGroupLayout("skinned-object", []webgpu.BindGroupLayoutEntry{
		layoutBuffer(0, stageAll, "uniform", true),
		layoutBuffer(1, ShaderStageVertex, "read-only-storage", false),
	})
	l.Lighting = b.CreateBindGroupLayout("lighting", []webgpu.BindGroupLayoutEntry{
		layoutBuffer(0, ShaderStageFragment, "uniform", false),
		layoutBuffer(1, ShaderStageFragment, "read-only-storage", false),
	})
	r.Layouts = l
}

// Vertex buffer layouts --------------------------------------------------

func vertexAttr(location, offset int, format string) webgpu.VertexAttribute {
	return map[string]any{"shaderLocation": location, "offset": offset, "format": format}
}

func vertexBuffer(stride int, location int, format string, stepInstance bool) webgpu.VertexBufferLayout {
	step := "vertex"
	if stepInstance {
		step = "instance"
	}
	return map[string]any{
		"arrayStride": stride,
		"stepMode":    step,
		"attributes": []webgpu.VertexAttribute{
			vertexAttr(location, 0, format),
		},
	}
}

func meshVertexLayout() []webgpu.VertexBufferLayout {
	return []webgpu.VertexBufferLayout{
		vertexBuffer(12, 0, "float32x3", false),
		vertexBuffer(8, 1, "float32x2", false),
		vertexBuffer(12, 2, "float32x3", false),
		vertexBuffer(8, 3, "float32x2", false),
	}
}

func skinnedVertexLayout() []webgpu.VertexBufferLayout {
	return []webgpu.VertexBufferLayout{
		vertexBuffer(12, 0, "float32x3", false),
		vertexBuffer(8, 1, "float32x2", false),
		vertexBuffer(12, 2, "float32x3", false),
		vertexBuffer(4, 4, "uint8x4", false),
		vertexBuffer(16, 5, "float32x4", false),
	}
}

// ParticleInstanceStride is the byte stride of one particle instance record
// (pos vec3, scale, rotation, opacity).
const ParticleInstanceStride = 24

func particleVertexLayout() []webgpu.VertexBufferLayout {
	var inst webgpu.VertexBufferLayout = map[string]any{
		"arrayStride": ParticleInstanceStride,
		"stepMode":    "instance",
		"attributes": []webgpu.VertexAttribute{
			vertexAttr(2, 0, "float32x3"),
			vertexAttr(3, 12, "float32"),
			vertexAttr(4, 16, "float32"),
			vertexAttr(5, 20, "float32"),
		},
	}
	return []webgpu.VertexBufferLayout{
		vertexBuffer(12, 0, "float32x3", false),
		vertexBuffer(8, 1, "float32x2", false),
		inst,
	}
}

// Blend / target / depth helpers ------------------------------------------

func blendState(src, dst string) webgpu.BlendState {
	return map[string]any{
		"color": map[string]any{"srcFactor": src, "dstFactor": dst, "operation": "add"},
		"alpha": map[string]any{"srcFactor": src, "dstFactor": dst, "operation": "add"},
	}
}

func colorTarget(format string, blend webgpu.BlendState) webgpu.ColorTargetState {
	if blend != nil {
		return map[string]any{"format": format, "writeMask": ColorWriteAll, "blend": blend}
	}
	return map[string]any{"format": format, "writeMask": ColorWriteAll}
}

func depthState(write bool, compare string, bias int, slope float32) webgpu.DepthStencilState {
	return map[string]any{
		"format":              FormatDepth,
		"depthWriteEnabled":   write,
		"depthCompare":        compare,
		"depthBias":           bias,
		"depthBiasSlopeScale": slope,
		"depthBiasClamp":      float32(0),
	}
}

func gbufferTargets() []webgpu.ColorTargetState {
	return []webgpu.ColorTargetState{
		colorTarget(FormatRGBA16F, nil),
		colorTarget(FormatRGBA8, nil),
		colorTarget(FormatRGBA8, nil),
		colorTarget(FormatRGBA8, nil),
	}
}

type renderPipelineSpec struct {
	label    string
	module   webgpu.ShaderModule
	layout   webgpu.PipelineLayout
	buffers  []webgpu.VertexBufferLayout
	targets  []webgpu.ColorTargetState
	depth    webgpu.DepthStencilState // nil: no depthStencil
	topology string
	cull     string
	objectBG webgpu.BindGroup
	skinned  bool
}

func (r *Renderer) buildPipeline(s *renderPipelineSpec) *Pipeline {
	var gpu webgpu.RenderPipeline
	if s.depth != nil {
		gpu = r.Backend.Device.createRenderPipeline(map[string]any{
			"label":  s.label,
			"layout": s.layout,
			"vertex": map[string]any{"module": s.module, "entryPoint": "vs_main", "buffers": s.buffers},
			"fragment": map[string]any{
				"module":     s.module,
				"entryPoint": "fs_main",
				"targets":    s.targets,
			},
			"primitive":    map[string]any{"topology": s.topology, "cullMode": s.cull},
			"depthStencil": s.depth,
		})
	} else {
		gpu = r.Backend.Device.createRenderPipeline(map[string]any{
			"label":  s.label,
			"layout": s.layout,
			"vertex": map[string]any{"module": s.module, "entryPoint": "vs_main", "buffers": s.buffers},
			"fragment": map[string]any{
				"module":     s.module,
				"entryPoint": "fs_main",
				"targets":    s.targets,
			},
			"primitive": map[string]any{"topology": s.topology, "cullMode": s.cull},
		})
	}
	return &Pipeline{Label: s.label, GPU: gpu, ObjectBG: s.objectBG, Skinned: s.skinned}
}

// buildPipelineWithCullOff builds s plus its cull-disabled twin for
// double-sided materials.
func (r *Renderer) buildPipelineWithCullOff(s *renderPipelineSpec) *Pipeline {
	p := r.buildPipeline(s)
	twin := *s
	twin.cull = "none"
	twin.label = s.label + "-cull-off"
	p.CullOff = r.buildPipeline(&twin)
	return p
}

func (r *Renderer) createPipelines() {
	b := r.Backend
	l := r.Layouts
	p := &Pipelines{}

	geometryPL := b.CreatePipelineLayout("geometry", []webgpu.BindGroupLayout{l.Frame, l.Material, l.Object})
	skinnedPL := b.CreatePipelineLayout("skinned-geometry", []webgpu.BindGroupLayout{l.Frame, l.Material, l.SkinnedObject})
	shadowPL := b.CreatePipelineLayout("shadow", []webgpu.BindGroupLayout{l.Frame, l.Empty, l.Object})
	skinnedShadowPL := b.CreatePipelineLayout("skinned-shadow", []webgpu.BindGroupLayout{l.Frame, l.Empty, l.SkinnedObject})
	lightPL := b.CreatePipelineLayout("light", []webgpu.BindGroupLayout{l.Frame, l.Deferred, l.Object})
	blurPL := b.CreatePipelineLayout("blur", []webgpu.BindGroupLayout{l.Frame, l.Blur, l.Object})
	postPL := b.CreatePipelineLayout("postprocess", []webgpu.BindGroupLayout{l.Frame, l.PostProcess, l.Object})
	sampledPL := b.CreatePipelineLayout("sampled", []webgpu.BindGroupLayout{l.Frame, l.Sampled, l.Object})
	transparentPL := b.CreatePipelineLayout("transparent", []webgpu.BindGroupLayout{l.Frame, l.Material, l.Object, l.Lighting})
	spritePL := b.CreatePipelineLayout("sprite", []webgpu.BindGroupLayout{l.Frame, l.Sprite, l.Object})
	particlePL := b.CreatePipelineLayout("particle", []webgpu.BindGroupLayout{l.Frame, l.Particle, l.Object})

	mod := func(label, code string) webgpu.ShaderModule { return b.CreateShaderModule(label, code) }

	objBG := r.objectBG
	skinBG := r.skinnedObjectBG

	// G-buffer geometry.
	geo := mod("geometry", WgslGeometry)
	p.Geometry = r.buildPipelineWithCullOff(&renderPipelineSpec{
		label: "geometry", module: geo, layout: geometryPL, buffers: meshVertexLayout(),
		targets: gbufferTargets(), depth: depthState(true, "less-equal", 0, 0),
		topology: "triangle-list", cull: "back", objectBG: objBG,
	})
	p.Skybox = r.buildPipelineWithCullOff(&renderPipelineSpec{
		label: "skybox", module: geo, layout: geometryPL, buffers: meshVertexLayout(),
		targets: gbufferTargets(), depth: depthState(false, "always", 0, 0),
		topology: "triangle-list", cull: "back", objectBG: objBG,
	})
	skinned := mod("skinned-geometry", WgslSkinnedGeometry)
	p.SkinnedGeometry = r.buildPipelineWithCullOff(&renderPipelineSpec{
		label: "skinned-geometry", module: skinned, layout: skinnedPL, buffers: skinnedVertexLayout(),
		targets: gbufferTargets(), depth: depthState(true, "less-equal", 0, 0),
		topology: "triangle-list", cull: "back", objectBG: skinBG, skinned: true,
	})

	// Drop shadows: depth-tested, no write, pulled towards the camera, no cull.
	shadowTargets := []webgpu.ColorTargetState{colorTarget(FormatR8, nil)}
	p.EntityShadows = r.buildPipeline(&renderPipelineSpec{
		label: "entity-shadows", module: mod("entity-shadows", WgslEntityShadows), layout: shadowPL,
		buffers: meshVertexLayout(), targets: shadowTargets, depth: depthState(false, "less-equal", -1, -1),
		topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	p.SkinnedEntityShadows = r.buildPipeline(&renderPipelineSpec{
		label: "skinned-entity-shadows", module: mod("skinned-entity-shadows", WgslSkinnedEntityShadows), layout: skinnedShadowPL,
		buffers: skinnedVertexLayout(), targets: shadowTargets, depth: depthState(false, "less-equal", -1, -1),
		topology: "triangle-list", cull: "none", objectBG: skinBG, skinned: true,
	})

	// Deferred lights accumulate additively into the light buffer (no depth).
	additive := []webgpu.ColorTargetState{colorTarget(FormatRGBA8, blendState("one", "one"))}
	p.DirectionalLight = r.buildPipeline(&renderPipelineSpec{
		label: "directional-light", module: mod("directional-light", WgslDirectionalLight), layout: lightPL,
		buffers: []webgpu.VertexBufferLayout{}, targets: additive, topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	p.PointLight = r.buildPipeline(&renderPipelineSpec{
		label: "point-light", module: mod("point-light", WgslPointLight), layout: lightPL,
		buffers: meshVertexLayout(), targets: additive, topology: "triangle-list", cull: "back", objectBG: objBG,
	})
	p.SpotLight = r.buildPipeline(&renderPipelineSpec{
		label: "spot-light", module: mod("spot-light", WgslSpotLight), layout: lightPL,
		buffers: meshVertexLayout(), targets: additive, topology: "triangle-list", cull: "back", objectBG: objBG,
	})

	// Transparents and sprites blend over the light buffer with depth test.
	p.Transparent = r.buildPipeline(&renderPipelineSpec{
		label: "transparent", module: mod("transparent", WgslTransparent), layout: transparentPL,
		buffers: meshVertexLayout(), targets: []webgpu.ColorTargetState{colorTarget(FormatRGBA8, blendState("src-alpha", "one-minus-src-alpha"))},
		depth: depthState(false, "less-equal", 0, 0), topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	spriteTargets := []webgpu.ColorTargetState{colorTarget(FormatRGBA8, blendState("src-alpha", "one"))}
	p.Billboard = r.buildPipeline(&renderPipelineSpec{
		label: "billboard", module: mod("billboard", WgslBillboard), layout: spritePL,
		buffers: meshVertexLayout(), targets: spriteTargets, depth: depthState(false, "less-equal", 0, 0),
		topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	p.InstancedBillboard = r.buildPipeline(&renderPipelineSpec{
		label: "instanced-billboard", module: mod("instanced-billboard", WgslInstancedBillboard), layout: spritePL,
		buffers: particleVertexLayout(), targets: spriteTargets, depth: depthState(false, "less-equal", 0, 0),
		topology: "triangle-list", cull: "none", objectBG: objBG,
	})

	// Fullscreen post-processing.
	post := mod("postprocessing", WgslPostProcessing)
	p.PostProcessSwapchain = r.buildPipeline(&renderPipelineSpec{
		label: "postprocess-swapchain", module: post, layout: postPL, buffers: []webgpu.VertexBufferLayout{},
		targets: []webgpu.ColorTargetState{colorTarget(b.Format, nil)}, topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	p.PostProcessScratch = r.buildPipeline(&renderPipelineSpec{
		label: "postprocess-scratch", module: post, layout: postPL, buffers: []webgpu.VertexBufferLayout{},
		targets: []webgpu.ColorTargetState{colorTarget(FormatRGBA8, nil)}, topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	p.FsrEasu = r.buildPipeline(&renderPipelineSpec{
		label: "fsr-easu", module: mod("fsr-easu", WgslFsrEasu), layout: sampledPL, buffers: []webgpu.VertexBufferLayout{},
		targets: []webgpu.ColorTargetState{colorTarget(FormatRGBA8, nil)}, topology: "triangle-list", cull: "none", objectBG: objBG,
	})
	p.FsrRcas = r.buildPipeline(&renderPipelineSpec{
		label: "fsr-rcas", module: mod("fsr-rcas", WgslFsrRcas), layout: sampledPL, buffers: []webgpu.VertexBufferLayout{},
		targets: []webgpu.ColorTargetState{colorTarget(b.Format, nil)}, topology: "triangle-list", cull: "none", objectBG: objBG,
	})

	// Debug overlay lines straight onto the swapchain.
	debugTargets := []webgpu.ColorTargetState{colorTarget(b.Format, nil)}
	p.Debug = r.buildPipeline(&renderPipelineSpec{
		label: "debug", module: mod("debug", WgslDebug), layout: shadowPL, buffers: meshVertexLayout(),
		targets: debugTargets, topology: "line-list", cull: "none", objectBG: objBG,
	})
	p.SkinnedDebug = r.buildPipeline(&renderPipelineSpec{
		label: "skinned-debug", module: mod("skinned-debug", WgslSkinnedDebug), layout: skinnedShadowPL, buffers: skinnedVertexLayout(),
		targets: debugTargets, topology: "line-list", cull: "none", objectBG: skinBG, skinned: true,
	})

	// Compute.
	p.KawaseBlur = b.Device.createComputePipeline(map[string]any{
		"label":   "kawase-blur",
		"layout":  blurPL,
		"compute": map[string]any{"module": mod("kawase-blur", WgslKawaseBlur), "entryPoint": "cs_main"},
	})
	p.ParticleUpdate = b.Device.createComputePipeline(map[string]any{
		"label":   "particle-update",
		"layout":  particlePL,
		"compute": map[string]any{"module": mod("particle-update", WgslParticleUpdate), "entryPoint": "cs_main"},
	})

	r.Pipelines = p
}
