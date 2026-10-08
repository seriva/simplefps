// Browser/Node globals GoFront does not predeclare.
declare namespace Reflect {
	function construct(target: any, args: any[]): any;
}
declare var Image: any;
declare var process: any;
declare var globalThis: any;

// Typed WebGPU handles. Optional WebIDL parameters are declared as fixed
// parameters because GoFront enforces arity; callers pass nil for dictionaries
// they do not need (WebIDL treats null as an empty dictionary).
interface GPUBuffer {
	label: string;
	destroy(): void;
}

interface GPUTexture {
	label: string;
	width: number;
	height: number;
	createView(descriptor: any): GPUTextureView;
	destroy(): void;
}

interface GPUTextureView {
	label: string;
}

interface GPUSampler {
	label: string;
}

interface GPUShaderModule {
	label: string;
}

interface GPUBindGroupLayout {
	label: string;
}

interface GPUPipelineLayout {
	label: string;
}

interface GPUBindGroup {
	label: string;
}

interface GPURenderPipeline {
	label: string;
}

interface GPUComputePipeline {
	label: string;
}

interface GPUCommandBuffer {
	label: string;
}

interface GPURenderPassEncoder {
	setPipeline(pipeline: GPURenderPipeline): void;
	setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets: any): void;
	setVertexBuffer(slot: number, buffer: GPUBuffer): void;
	setIndexBuffer(buffer: GPUBuffer, indexFormat: string): void;
	setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
	draw(vertexCount: number, instanceCount: number, firstVertex: number, firstInstance: number): void;
	drawIndexed(indexCount: number, instanceCount: number, firstIndex: number, baseVertex: number, firstInstance: number): void;
	end(): void;
}

interface GPUComputePassEncoder {
	setPipeline(pipeline: GPUComputePipeline): void;
	setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets: any): void;
	dispatchWorkgroups(x: number, y: number, z: number): void;
	end(): void;
}

interface GPUCommandEncoder {
	beginRenderPass(descriptor: any): GPURenderPassEncoder;
	beginComputePass(descriptor: any): GPUComputePassEncoder;
	finish(descriptor: any): GPUCommandBuffer;
}

interface GPUCanvasContext {
	configure(configuration: any): void;
	getCurrentTexture(): GPUTexture;
}
