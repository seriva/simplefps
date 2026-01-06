import Console from "../systems/console.js";
import { Backend } from "./backend.js";
import { ShaderSources as GlslShaderSources } from "./shaders/glsl.js";
import { WgslShaderSources } from "./shaders/wgsl.js";

// ============================================================================
// Public API
// ============================================================================

class Shader {
	constructor(backend, ...args) {
		this.backend = backend;

		// Simulate overloaded constructor based on backend type
		if (backend.isWebGPU?.()) {
			const [wgslSource] = args;
			// WGSL: (source, null) or just (source) if implementation handles it
			this.program = backend.createShaderProgram(wgslSource, null);
		} else {
			const [vertexSource, fragmentSource] = args;
			// GLSL: (vertex, fragment)
			this.program = backend.createShaderProgram(vertexSource, fragmentSource);
		}

		if (!this.program) {
			throw new Error("Failed to create shader program");
		}
	}

	bind() {
		this.backend.bindShader(this.program);
	}

	static unBind(backend) {
		backend.unbindShader();
	}

	setInt(id, value) {
		this.backend.setUniform(id, "int", value);
	}

	setMat4(id, mat) {
		this.backend.setUniform(id, "mat4", mat);
	}

	setFloat(id, value) {
		this.backend.setUniform(id, "float", value);
	}

	setVec2(id, vec) {
		this.backend.setUniform(id, "vec2", vec);
	}

	setVec3(id, vec) {
		this.backend.setUniform(id, "vec3", vec);
	}

	setVec4(id, vec) {
		this.backend.setUniform(id, "vec4", vec);
	}

	setVec3Array(id, array) {
		this.backend.setUniform(id, "vec3[]", array);
	}

	dispose() {
		if (this.backend.disposeShader) {
			this.backend.disposeShader(this.program);
		}
		this.program = null;
	}
}
const Shaders = {
	init: () => {
		const backend = Backend;
		const isWebGPU = backend.isWebGPU?.();
		const sources = isWebGPU ? WgslShaderSources : GlslShaderSources;

		for (const [name, source] of Object.entries(sources)) {
			try {
				if (isWebGPU) {
					Shaders[name] = new Shader(backend, source);
				} else {
					Shaders[name] = new Shader(backend, source.vertex, source.fragment);
				}
				Console.log(`Loaded shader: ${name} [${isWebGPU ? "WGSL" : "GLSL"}]`);
			} catch (_error) {
				Console.error(
					`Failed to load shader ${name}. Linker/Compiler Error might be above.`,
				);
			}
		}
	},
};

export { Shader, Shaders };
