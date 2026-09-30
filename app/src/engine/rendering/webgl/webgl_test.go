package webgl

import (
	"strings"
	"testing"

	"../" // rendering
)

func TestWebGLBackendCreation(t *testing.T) {
	backend := NewWebGLBackend()
	if backend.Name() != "webgl2" {
		t.Errorf("Expected backend name 'webgl2', got '%s'", backend.Name())
	}
	if backend.IsWebGPU() {
		t.Error("Expected IsWebGPU to return false")
	}
}

func TestGlslShaderSources(t *testing.T) {
	expectedShaders := []string{
		"geometry",
		"skinnedGeometry",
		"entityShadows",
		"skinnedEntityShadows",
		"directionalLight",
		"pointLight",
		"spotLight",
		"kawaseBlur",
		"postProcessing",
		"fsrEasu",
		"fsrRcas",
		"transparent",
		"debug",
		"skinnedDebug",
		"billboard",
		"instancedBillboard",
	}

	for _, name := range expectedShaders {
		def := GlslShaderSources[name]
		if len(def.Vertex) == 0 {
			t.Errorf("Empty vertex shader for %s", name)
		}
		if len(def.Fragment) == 0 {
			t.Errorf("Empty fragment shader for %s", name)
		}
	}
}

func TestWebGLInitShaders(t *testing.T) {
	backend := NewWebGLBackend()
	catalog := rendering.NewShaderCatalog()
	backend.InitShaders(catalog)

	if catalog.Geometry == nil {
		t.Error("Expected catalog.Geometry to be initialized")
	}
	if catalog.SkinnedGeometry == nil {
		t.Error("Expected catalog.SkinnedGeometry to be initialized")
	}
	if catalog.DirectionalLight == nil {
		t.Error("Expected catalog.DirectionalLight to be initialized")
	}
	if catalog.PointLight == nil {
		t.Error("Expected catalog.PointLight to be initialized")
	}
	if catalog.SpotLight == nil {
		t.Error("Expected catalog.SpotLight to be initialized")
	}
	if catalog.PostProcessing == nil {
		t.Error("Expected catalog.PostProcessing to be initialized")
	}
	if catalog.Debug == nil {
		t.Error("Expected catalog.Debug to be initialized")
	}
	if catalog.Transparent == nil {
		t.Error("Expected catalog.Transparent to be initialized")
	}
}

func TestWebGLBackendDefaults(t *testing.T) {
    backend := NewWebGLBackend()
    // State cache fields should start as nil/zero (ensuring first call always passes through)
    if backend.BlendEnabled != nil {
        t.Error("Expected BlendEnabled to start as nil")
    }
    if backend.DepthTest != nil {
        t.Error("Expected DepthTest to start as nil")
    }
    if backend.CullEnabled != nil {
        t.Error("Expected CullEnabled to start as nil")
    }
    if backend.RenderScale != 1.0 {
        t.Errorf("Expected RenderScale 1.0, got %f", backend.RenderScale)
    }
    caps := backend.GetCapabilities()
    if caps == nil {
        t.Fatal("Expected non-nil capabilities")
    }
}

func TestWebGLBackendIsNotWebGPU(t *testing.T) {
    backend := NewWebGLBackend()
    if backend.IsWebGPU() {
        t.Error("WebGL backend should not be WebGPU")
    }
}

// Uniform names set by rendering/renderpasses.go per screen-space pass must
// exist in the matching GLSL program, or WebGL silently drops them.
func TestPassUniformsExistInGlsl(t *testing.T) {
	passUniforms := map[string][]string{
		"postProcessing": {"colorBuffer", "lightBuffer", "emissiveBuffer", "dirtBuffer", "shadowBuffer", "normalBuffer",
			"emissiveMult", "gamma", "dirtIntensity", "shadowIntensity", "uAmbient"},
		"kawaseBlur": {"colorBuffer", "offset"},
		"fsrEasu":    {"colorBuffer", "con0"},
		"fsrRcas":    {"colorBuffer", "sharpness"},
	}
	for shader, uniforms := range passUniforms {
		def := GlslShaderSources[shader]
		src := def.Vertex + "\n" + def.Fragment
		for _, u := range uniforms {
			if !containsUniform(src, u) {
				t.Errorf("%s: uniform %q not declared in GLSL", shader, u)
			}
		}
	}
}

func containsUniform(src string, name string) bool {
	// Match "uniform <type> name;" or "uniform <type> name[N];" declarations.
	for _, decl := range strings.Split(src, ";") {
		decl = strings.TrimSpace(decl)
		pos := strings.Index(decl, "uniform ")
		if pos < 0 {
			continue
		}
		fields := strings.Fields(decl[pos:])
		if len(fields) < 3 {
			continue
		}
		last := fields[len(fields)-1]
		if last == name || strings.HasPrefix(last, name+"[") {
			return true
		}
	}
	return false
}
