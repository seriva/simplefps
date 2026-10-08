// Package fakegpu is an in-memory stand-in for a WebGPU device. It records
// the calls the rendering package makes (pipelines, bind groups, draws,
// dispatches, buffer writes) so unit tests can assert on them without a
// browser. Method and field names are lowercase on purpose: the rendering
// package calls them through the WebGPU-shaped interfaces in interop.d.ts,
// which compile to plain JS property access.
package fakegpu

// DrawRecord captures one draw/drawIndexed call.
type DrawRecord struct {
	Pass          string
	Pipeline      string
	ObjectOffset  int
	IndexCount    int
	VertexCount   int
	InstanceCount int
	Group1        string
}

// DispatchRecord captures one dispatchWorkgroups call.
type DispatchRecord struct {
	Pipeline     string
	ObjectOffset int
	X            int
	Y            int
	Z            int
	Group1       string
}

// PassRecord captures the begin of a render/compute pass.
type PassRecord struct {
	Label   string
	Compute bool
}

// FakeBuffer is a fake GPUBuffer.
type FakeBuffer struct {
	label     string
	size      int
	usage     int
	destroyed bool
	dev       *Device
}

func (b *FakeBuffer) destroy() { b.destroyed = true }

// Label returns the descriptor label.
func (b *FakeBuffer) Label() string { return b.label }

// Size returns the byte size.
func (b *FakeBuffer) Size() int { return b.size }

// Destroyed reports whether destroy() was called.
func (b *FakeBuffer) Destroyed() bool { return b.destroyed }

// FakeTexture is a fake GPUTexture.
type FakeTexture struct {
	label     string
	width     int
	height    int
	format    string
	mipLevels int
	usage     int
	destroyed bool
	dev       *Device
}

func (t *FakeTexture) createView(desc any) any {
	t.dev.Views++
	return &FakeTextureView{texture: t}
}
func (t *FakeTexture) destroy() { t.destroyed = true }

// Label returns the descriptor label.
func (t *FakeTexture) Label() string { return t.label }

// Format returns the texture format.
func (t *FakeTexture) Format() string { return t.format }

// Destroyed reports whether destroy() was called.
func (t *FakeTexture) Destroyed() bool { return t.destroyed }

// FakeTextureView is a fake GPUTextureView.
type FakeTextureView struct {
	label   string
	texture *FakeTexture
}

// FakeSampler is a fake GPUSampler.
type FakeSampler struct {
	label string
	desc  any
}

// FakeShaderModule is a fake GPUShaderModule.
type FakeShaderModule struct {
	label string
	code  string
}

// Code returns the WGSL source.
func (m *FakeShaderModule) Code() string { return m.code }

// FakeBindGroupLayout is a fake GPUBindGroupLayout.
type FakeBindGroupLayout struct {
	label   string
	entries int
}

// FakePipelineLayout is a fake GPUPipelineLayout.
type FakePipelineLayout struct {
	label  string
	groups int
}

// FakeBindGroup is a fake GPUBindGroup.
type FakeBindGroup struct {
	label   string
	layout  any
	entries int
}

// Label returns the descriptor label.
func (g *FakeBindGroup) Label() string { return g.label }

// FakePipeline is a fake GPURenderPipeline / GPUComputePipeline.
type FakePipeline struct {
	label   string
	compute bool
	desc    any
}

func (p *FakePipeline) getBindGroupLayout(index int) any {
	return &FakeBindGroupLayout{label: p.label + "-auto"}
}

// Label returns the descriptor label.
func (p *FakePipeline) Label() string { return p.label }

// Desc returns the raw descriptor.
func (p *FakePipeline) Desc() any { return p.desc }

// FakeCommandBuffer is a fake GPUCommandBuffer.
type FakeCommandBuffer struct {
	label string
}

// FakeRenderPass is a fake GPURenderPassEncoder.
type FakeRenderPass struct {
	dev          *Device
	label        string
	pipeline     string
	objectOffset int
	group1       string
	ended        bool
}

func (p *FakeRenderPass) setPipeline(pipeline any) {
	p.dev.SetPipelineCalls++
	if pipeline != nil {
		p.pipeline = pipeline.label.(string)
	}
}

func (p *FakeRenderPass) setBindGroup(index int, bg any, offsets any) {
	p.dev.SetBindGroupCalls++
	if index == 2 && offsets != nil && offsets.length.(int) > 0 {
		p.objectOffset = offsets[0].(int)
	}
	if index == 1 && bg != nil {
		p.group1 = bg.label.(string)
	}
}

func (p *FakeRenderPass) setVertexBuffer(slot int, buffer any) { p.dev.SetVertexBufferCalls++ }
func (p *FakeRenderPass) setIndexBuffer(buffer any, format string) {
	p.dev.SetIndexBufferCalls++
}
func (p *FakeRenderPass) setViewport(x, y, w, h, minDepth, maxDepth float64) {
	p.dev.LastViewportMinDepth = minDepth
	p.dev.LastViewportMaxDepth = maxDepth
}

func (p *FakeRenderPass) draw(vertexCount, instanceCount, firstVertex, firstInstance int) {
	p.dev.Draws = append(p.dev.Draws, DrawRecord{
		Pass: p.label, Pipeline: p.pipeline, ObjectOffset: p.objectOffset,
		VertexCount: vertexCount, InstanceCount: instanceCount, Group1: p.group1,
	})
}

func (p *FakeRenderPass) drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance int) {
	p.dev.Draws = append(p.dev.Draws, DrawRecord{
		Pass: p.label, Pipeline: p.pipeline, ObjectOffset: p.objectOffset,
		IndexCount: indexCount, InstanceCount: instanceCount, Group1: p.group1,
	})
}

func (p *FakeRenderPass) end() { p.ended = true }

// FakeComputePass is a fake GPUComputePassEncoder.
type FakeComputePass struct {
	dev          *Device
	pipeline     string
	objectOffset int
	group1       string
	ended        bool
}

func (p *FakeComputePass) setPipeline(pipeline any) {
	if pipeline != nil {
		p.pipeline = pipeline.label.(string)
	}
}

func (p *FakeComputePass) setBindGroup(index int, bg any, offsets any) {
	if index == 2 && offsets != nil && offsets.length.(int) > 0 {
		p.objectOffset = offsets[0].(int)
	}
	if index == 1 && bg != nil {
		p.group1 = bg.label.(string)
	}
}

func (p *FakeComputePass) dispatchWorkgroups(x, y, z int) {
	p.dev.Dispatches = append(p.dev.Dispatches, DispatchRecord{
		Pipeline: p.pipeline, ObjectOffset: p.objectOffset, X: x, Y: y, Z: z, Group1: p.group1,
	})
}

func (p *FakeComputePass) end() { p.ended = true }

// FakeCommandEncoder is a fake GPUCommandEncoder.
type FakeCommandEncoder struct {
	dev *Device
}

func (e *FakeCommandEncoder) beginRenderPass(desc any) any {
	label := ""
	if desc != nil && desc.label != nil {
		label = desc.label.(string)
	}
	e.dev.Passes = append(e.dev.Passes, PassRecord{Label: label})
	return &FakeRenderPass{dev: e.dev, label: label}
}

func (e *FakeCommandEncoder) beginComputePass(desc any) any {
	e.dev.Passes = append(e.dev.Passes, PassRecord{Label: "compute", Compute: true})
	return &FakeComputePass{dev: e.dev}
}

func (e *FakeCommandEncoder) finish(desc any) any {
	return &FakeCommandBuffer{}
}

// FakeQueue is a fake GPUQueue.
type FakeQueue struct {
	dev *Device
}

func (q *FakeQueue) writeBuffer(buffer any, offset int, data any, dataOffset any, size any) {
	q.dev.BufferWrites++
	if buffer != nil {
		q.dev.LastWrittenBuffer = buffer.label.(string)
	}
	if size != nil {
		q.dev.LastWriteCount = size.(int)
	} else if data != nil && data.length != nil {
		q.dev.LastWriteCount = data.length.(int)
	}
}

func (q *FakeQueue) writeTexture(dst any, data any, layout any, size any) {
	q.dev.TextureWrites++
}

func (q *FakeQueue) copyExternalImageToTexture(src any, dst any, size any) {
	q.dev.ImageCopies++
}

func (q *FakeQueue) submit(buffers any) {
	q.dev.Submits++
}

// Device is a fake GPUDevice that records resource creation and encoding.
type Device struct {
	queue *FakeQueue

	Buffers           []*FakeBuffer
	Textures          []*FakeTexture
	Pipelines         []*FakePipeline
	BindGroups        []*FakeBindGroup
	ShaderModules     []*FakeShaderModule
	Views             int
	Samplers          int
	Passes            []PassRecord
	Draws             []DrawRecord
	Dispatches        []DispatchRecord
	BufferWrites      int
	TextureWrites     int
	ImageCopies       int
	Submits           int
	Destroyed         bool
	LastWrittenBuffer string
	LastWriteCount    int

	SetPipelineCalls     int
	SetBindGroupCalls    int
	SetVertexBufferCalls int
	SetIndexBufferCalls  int
	LastViewportMinDepth float64
	LastViewportMaxDepth float64
}

// NewDevice creates an empty recording device.
func NewDevice() *Device {
	d := &Device{
		Buffers:       make([]*FakeBuffer, 0),
		Textures:      make([]*FakeTexture, 0),
		Pipelines:     make([]*FakePipeline, 0),
		BindGroups:    make([]*FakeBindGroup, 0),
		ShaderModules: make([]*FakeShaderModule, 0),
		Passes:        make([]PassRecord, 0),
		Draws:         make([]DrawRecord, 0),
		Dispatches:    make([]DispatchRecord, 0),
	}
	d.queue = &FakeQueue{dev: d}
	return d
}

func labelOf(desc any) string {
	if desc != nil && desc.label != nil {
		return desc.label.(string)
	}
	return ""
}

func (d *Device) createBuffer(desc any) any {
	b := &FakeBuffer{label: labelOf(desc), size: desc.size.(int), usage: desc.usage.(int), dev: d}
	d.Buffers = append(d.Buffers, b)
	return b
}

func (d *Device) createTexture(desc any) any {
	t := &FakeTexture{label: labelOf(desc), format: desc.format.(string), usage: desc.usage.(int), dev: d}
	t.width = desc.size.width.(int)
	t.height = desc.size.height.(int)
	if desc.mipLevelCount != nil {
		t.mipLevels = desc.mipLevelCount.(int)
	} else {
		t.mipLevels = 1
	}
	d.Textures = append(d.Textures, t)
	return t
}

func (d *Device) createSampler(desc any) any {
	d.Samplers++
	return &FakeSampler{desc: desc}
}

func (d *Device) createShaderModule(desc any) any {
	m := &FakeShaderModule{label: labelOf(desc), code: desc.code.(string)}
	d.ShaderModules = append(d.ShaderModules, m)
	return m
}

func (d *Device) createBindGroupLayout(desc any) any {
	return &FakeBindGroupLayout{label: labelOf(desc), entries: desc.entries.length.(int)}
}

func (d *Device) createPipelineLayout(desc any) any {
	return &FakePipelineLayout{label: labelOf(desc), groups: desc.bindGroupLayouts.length.(int)}
}

func (d *Device) createBindGroup(desc any) any {
	g := &FakeBindGroup{label: labelOf(desc), layout: desc.layout, entries: desc.entries.length.(int)}
	d.BindGroups = append(d.BindGroups, g)
	return g
}

func (d *Device) createRenderPipeline(desc any) any {
	// Mirror the browser: a present depthStencil must carry a format.
	ds := desc.depthStencil
	if ds != nil && ds.format == nil {
		panic("fakegpu: createRenderPipeline " + labelOf(desc) + ": depthStencil.format is undefined")
	}
	p := &FakePipeline{label: labelOf(desc), desc: desc}
	d.Pipelines = append(d.Pipelines, p)
	return p
}

func (d *Device) createComputePipeline(desc any) any {
	p := &FakePipeline{label: labelOf(desc), compute: true, desc: desc}
	d.Pipelines = append(d.Pipelines, p)
	return p
}

func (d *Device) createCommandEncoder() any {
	return &FakeCommandEncoder{dev: d}
}

func (d *Device) destroy() { d.Destroyed = true }

// ResetFrame clears the per-frame recordings (passes, draws, dispatches,
// counters) while keeping created resources.
func (d *Device) ResetFrame() {
	d.Passes = d.Passes[:0]
	d.Draws = d.Draws[:0]
	d.Dispatches = d.Dispatches[:0]
	d.BufferWrites = 0
	d.TextureWrites = 0
	d.Submits = 0
	d.SetPipelineCalls = 0
	d.SetBindGroupCalls = 0
	d.SetVertexBufferCalls = 0
	d.SetIndexBufferCalls = 0
}

// CountDraws returns the number of draws issued with the named pipeline.
func (d *Device) CountDraws(pipeline string) int {
	n := 0
	for i := 0; i < len(d.Draws); i++ {
		if d.Draws[i].Pipeline == pipeline {
			n++
		}
	}
	return n
}

// FirstDraw returns the index of the first draw with the named pipeline (-1 if none).
func (d *Device) FirstDraw(pipeline string) int {
	for i := 0; i < len(d.Draws); i++ {
		if d.Draws[i].Pipeline == pipeline {
			return i
		}
	}
	return -1
}

// PassIndex returns the index of the first pass with label (-1 if none).
func (d *Device) PassIndex(label string) int {
	for i := 0; i < len(d.Passes); i++ {
		if d.Passes[i].Label == label {
			return i
		}
	}
	return -1
}

// CountDispatches returns the number of dispatches with the named pipeline.
func (d *Device) CountDispatches(pipeline string) int {
	n := 0
	for i := 0; i < len(d.Dispatches); i++ {
		if d.Dispatches[i].Pipeline == pipeline {
			n++
		}
	}
	return n
}

// LiveBuffers counts buffers that have not been destroyed.
func (d *Device) LiveBuffers() int {
	n := 0
	for i := 0; i < len(d.Buffers); i++ {
		if !d.Buffers[i].destroyed {
			n++
		}
	}
	return n
}

// LiveTextures counts textures that have not been destroyed.
func (d *Device) LiveTextures() int {
	n := 0
	for i := 0; i < len(d.Textures); i++ {
		if !d.Textures[i].destroyed {
			n++
		}
	}
	return n
}

// Context is a fake GPUCanvasContext.
type Context struct {
	dev        *Device
	Configured int
	Width      int
	Height     int
}

// NewContext creates a fake canvas context producing w×h swapchain textures.
func NewContext(dev *Device, w, h int) *Context {
	return &Context{dev: dev, Width: w, Height: h}
}

func (c *Context) configure(cfg any) { c.Configured++ }

func (c *Context) getCurrentTexture() any {
	return &FakeTexture{label: "swapchain", width: c.Width, height: c.Height, format: "bgra8unorm", mipLevels: 1, dev: c.dev}
}
