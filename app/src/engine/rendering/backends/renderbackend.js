class RenderBackend {
	// =========================================================================
	// Lifecycle
	// =========================================================================

	async init(_canvas) {
		throw new Error("RenderBackend.init() must be implemented");
	}

	dispose() {
		throw new Error("RenderBackend.dispose() must be implemented");
	}

	// =========================================================================
	// Frame Management
	// =========================================================================

	beginFrame() {}

	endFrame() {}

	// =========================================================================
	// Resource Creation
	// =========================================================================

	createTexture(_descriptor) {
		throw new Error("RenderBackend.createTexture() must be implemented");
	}

	createBuffer(_data, _usage) {
		throw new Error("RenderBackend.createBuffer() must be implemented");
	}

	createShaderProgram(_vertexOrWgslSrc, _fragmentSrcOrNull = null) {
		throw new Error("RenderBackend.createShaderProgram() must be implemented");
	}

	createUBO(_size, _bindingPoint) {
		throw new Error("RenderBackend.createUBO() must be implemented");
	}

	updateUBO(_ubo, _data, _offset = 0) {
		throw new Error("RenderBackend.updateUBO() must be implemented");
	}

	bindUniformBuffer(_ubo) {
		throw new Error("RenderBackend.bindUniformBuffer() must be implemented");
	}

	// =========================================================================
	// Framebuffer Management
	// =========================================================================

	createFramebuffer(_descriptor) {
		throw new Error("RenderBackend.createFramebuffer() must be implemented");
	}

	bindFramebuffer(_framebuffer) {
		throw new Error("RenderBackend.bindFramebuffer() must be implemented");
	}

	setFramebufferAttachment(
		_framebuffer,
		_attachment,
		_texture,
		_level = 0,
		_layer = 0,
	) {
		throw new Error(
			"RenderBackend.setFramebufferAttachment() must be implemented",
		);
	}

	// =========================================================================
	// Vertex State Management
	// =========================================================================

	createVertexState(_descriptor) {
		throw new Error("RenderBackend.createVertexState() must be implemented");
	}

	bindVertexState(_vertexState) {
		throw new Error("RenderBackend.bindVertexState() must be implemented");
	}

	deleteVertexState(_vertexState) {
		throw new Error("RenderBackend.deleteVertexState() must be implemented");
	}

	// =========================================================================
	// Resource Binding
	// =========================================================================

	bindTexture(_texture, _unit) {
		throw new Error("RenderBackend.bindTexture() must be implemented");
	}

	unbindTexture(_unit) {
		throw new Error("RenderBackend.unbindTexture() must be implemented");
	}

	bindShader(_shader) {
		throw new Error("RenderBackend.bindShader() must be implemented");
	}

	unbindShader() {
		throw new Error("RenderBackend.unbindShader() must be implemented");
	}

	// =========================================================================
	// Texture Management (Extended)
	// =========================================================================

	uploadTextureFromImage(_texture, _source) {
		throw new Error(
			"RenderBackend.uploadTextureFromImage() must be implemented",
		);
	}

	generateMipmaps(_texture) {
		throw new Error("RenderBackend.generateMipmaps() must be implemented");
	}

	setTextureWrapMode(_texture, _mode) {
		throw new Error("RenderBackend.setTextureWrapMode() must be implemented");
	}

	disposeTexture(_texture) {
		throw new Error("RenderBackend.disposeTexture() must be implemented");
	}

	setTextureAnisotropy(_texture, _level) {
		throw new Error("RenderBackend.setTextureAnisotropy() must be implemented");
	}

	// =========================================================================
	// State Management
	// =========================================================================

	setBlendState(_enabled, _srcFactor = "one", _dstFactor = "zero") {
		throw new Error("RenderBackend.setBlendState() must be implemented");
	}

	setDepthState(_testEnabled, _writeEnabled, _func = "lequal") {
		throw new Error("RenderBackend.setDepthState() must be implemented");
	}

	setCullState(_enabled, _face = "back") {
		throw new Error("RenderBackend.setCullState() must be implemented");
	}

	setViewport(_x, _y, _width, _height) {
		throw new Error("RenderBackend.setViewport() must be implemented");
	}

	setDepthRange(_near, _far) {
		throw new Error("RenderBackend.setDepthRange() must be implemented");
	}

	clear(_options) {
		throw new Error("RenderBackend.clear() must be implemented");
	}

	// =========================================================================
	// Drawing
	// =========================================================================

	drawIndexed(_indexBuffer, _indexCount, _indexOffset = 0, _mode = null) {
		throw new Error("RenderBackend.drawIndexed() must be implemented");
	}

	drawFullscreenQuad() {
		throw new Error("RenderBackend.drawFullscreenQuad() must be implemented");
	}

	// =========================================================================
	// Uniform Setters
	// =========================================================================

	setUniform(_name, _type, _value) {
		throw new Error("RenderBackend.setUniform() must be implemented");
	}

	// =========================================================================
	// Queries
	// =========================================================================

	getCapabilities() {
		return {};
	}

	isWebGPU() {
		return false;
	}

	getCanvas() {
		throw new Error("RenderBackend.getCanvas() must be implemented");
	}

	getWidth() {
		throw new Error("RenderBackend.getWidth() must be implemented");
	}

	getHeight() {
		throw new Error("RenderBackend.getHeight() must be implemented");
	}

	getAspectRatio() {
		return this.getWidth() / this.getHeight();
	}

	resize() {
		throw new Error("RenderBackend.resize() must be implemented");
	}
}

export default RenderBackend;
