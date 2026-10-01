package rendering

// Shader wraps a compiled GPU shader program together with the backend that
// owns it.
type Shader struct {
	backend RenderBackend
	program any
}

// NewShader compiles and links a shader program on b (nil b yields a
// program-less shader usable in headless tests).
func NewShader(b RenderBackend, vertexOrWgsl, fragment string) *Shader {
	s := &Shader{backend: b}
	if b != nil {
		s.program = b.CreateShaderProgram(vertexOrWgsl, fragment)
	}
	return s
}

// Bind activates the shader program on the GPU pipeline.
func (s *Shader) Bind() {
	if s.program != nil && s.backend != nil {
		s.backend.BindShader(s.program)
	}
}

// SetInt sets an integer uniform.
func (s *Shader) SetInt(name string, value int) {
	if s.backend != nil {
		s.backend.SetUniform(name, "int", value)
	}
}

// SetFloat sets a float uniform.
func (s *Shader) SetFloat(name string, value float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "float", value)
	}
}

// SetVec2 sets a 2-component vector uniform.
func (s *Shader) SetVec2(name string, vec []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "vec2", vec)
	}
}

// SetVec3 sets a 3-component vector uniform.
func (s *Shader) SetVec3(name string, vec []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "vec3", vec)
	}
}

// SetVec4 sets a 4-component vector uniform.
func (s *Shader) SetVec4(name string, vec []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "vec4", vec)
	}
}

// SetMat4 sets a 4x4 matrix uniform.
func (s *Shader) SetMat4(name string, mat []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "mat4", mat)
	}
}

// SetVec3Array sets an array of 3-component vector uniforms.
func (s *Shader) SetVec3Array(name string, arr []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "vec3[]", arr)
	}
}

// SetFloatArray sets an array of float uniforms.
func (s *Shader) SetFloatArray(name string, arr []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "float[]", arr)
	}
}

// SetMat4Array sets an array of 4x4 matrix uniforms.
func (s *Shader) SetMat4Array(name string, arr []float32) {
	if s.backend != nil {
		s.backend.SetUniform(name, "mat4[]", arr)
	}
}

// Dispose releases the shader program.
func (s *Shader) Dispose() {
	if s.program != nil && s.backend != nil {
		s.backend.DisposeShader(s.program)
		s.program = nil
	}
}

// ShaderCatalog holds the 16 compiled shader programs of the pipeline.
type ShaderCatalog struct {
	Geometry             *Shader
	SkinnedGeometry      *Shader
	EntityShadows        *Shader
	SkinnedEntityShadows *Shader
	DirectionalLight     *Shader
	PointLight           *Shader
	SpotLight            *Shader
	KawaseBlur           *Shader
	PostProcessing       *Shader
	FsrEasu              *Shader
	FsrRcas              *Shader
	Transparent          *Shader
	Debug                *Shader
	SkinnedDebug         *Shader
	Billboard            *Shader
	InstancedBillboard   *Shader
}

// NewShaderCatalog creates an empty ShaderCatalog.
func NewShaderCatalog() *ShaderCatalog {
	return &ShaderCatalog{}
}
