package engine

import (
	"strconv"

	"./physics"
	"./rendering"
	"./rendering/webgl"
	"./rendering/webgpu"
	"./systems"
)

var (
	gameUpdate   func(dt float32)
	alwaysUpdate func(dt float32)
	paused       = false
	initialized  = false

	lastTime  float64
	frameTime float32
	rafId     any

	resizeListener any

	ActiveCamera   *systems.Camera
	ActiveRenderer *rendering.Renderer
	CurrentBackend rendering.RenderBackend

	// ActiveScene is the SceneSource rendered each frame (set by Phase 5 / game code).
	ActiveScene rendering.SceneSource

	// DirtTexture is the lens-dirt overlay handed to the post-processing pass.
	DirtTexture *rendering.Texture

	renderOptions = &rendering.RenderOptions{}
	cameraView    = &rendering.CameraView{}
)

// SelectBackend picks WebGPU when preferred and available, otherwise WebGL2,
// and reports the initialised backend via onReady (WebGPU init is async).
func SelectBackend(preferWebGPU bool, onReady func(backend rendering.RenderBackend)) {
	useWebGL := func() {
		glBackend := webgl.NewWebGLBackend()
		glBackend.Init(func(ok bool) {
			onReady(glBackend)
		})
	}

	if preferWebGPU && navigator != nil && navigator.gpu != nil {
		gpuBackend := webgpu.NewWebGPUBackend()
		gpuBackend.Init(func(ok bool) {
			if ok {
				onReady(gpuBackend)
				return
			}
			useWebGL()
		})
		return
	}
	useWebGL()
}

// Resize updates viewport dimensions on backend, camera, and renderer.
func Resize() {
	if !initialized || CurrentBackend == nil {
		return
	}
	CurrentBackend.Resize()
	if ActiveCamera != nil {
		ActiveCamera.UpdateProjection(CurrentBackend.GetAspectRatio())
	}
	if ActiveRenderer != nil {
		ActiveRenderer.Resize(CurrentBackend.GetWidth(), CurrentBackend.GetHeight(), systems.ActiveSettings.DoFSR)
	}
}

// Init selects and initialises the GPU backend, then sets up shaders, geometry
// primitives, camera, and renderer. onReady fires once the engine is usable.
func Init(preferWebGPU bool, onReady func()) {
	SelectBackend(preferWebGPU, func(backend rendering.RenderBackend) {
		CurrentBackend = backend
		rendering.ActiveBackend = CurrentBackend
		syncBackendSettings()

		rendering.InitShaders()
		rendering.InitShapes()

		ActiveCamera = systems.NewCamera()
		ActiveCamera.IsWebGPU = CurrentBackend.IsWebGPU()

		ActiveRenderer = rendering.NewRenderer(CurrentBackend)
		ActiveRenderer.Init(CurrentBackend.GetWidth(), CurrentBackend.GetHeight(), systems.ActiveSettings.DoFSR)
		initialized = true

		if window != nil && window.addEventListener != nil && resizeListener == nil {
			resizeListener = func(evt any) { Resize() }
			window.addEventListener("resize", resizeListener)
		}
		systems.GlobalConsole.RegisterCmd("rscale", rscaleCmd)
		systems.GlobalConsole.RegisterCmd("stats", statsCmd)
		systems.GlobalConsole.RegisterCmd("settings", settingsCmd)
		systems.GlobalConsole.RegisterCmd("sstore", sstoreCmd)
		systems.GlobalConsole.RegisterCmd("tnc", tncCmd)
		systems.GlobalStats.Mount()
		systems.GlobalStats.SetBackendName(CurrentBackend.Name())
		if systems.ActiveSettings.ShowStats {
			systems.GlobalStats.Toggle(true)
		}

		Resize()
		if onReady != nil {
			onReady()
		}
	})
}

// statsCmd toggles the debug stats overlay.
func statsCmd(args []string) string {
	if systems.GlobalStats.Toggle(!systems.GlobalStats.IsVisible()) {
		return "stats on"
	}
	return "stats off"
}

// settingsCmd dumps the active settings as JSON.
func settingsCmd(args []string) string {
	return systems.ActiveSettings.ToJSON()
}

// sstoreCmd persists the active settings to localStorage.
func sstoreCmd(args []string) string {
	systems.ActiveSettings.Save()
	return "settings stored"
}

// tncCmd toggles noclip on the FPS controller.
func tncCmd(args []string) string {
	if physics.ToggleNoclip() {
		return "noclip on"
	}
	return "noclip off"
}

// rscaleCmd sets the render scale (0.2..1) and reallocates render targets.
func rscaleCmd(args []string) string {
	if len(args) == 0 {
		return "rscale " + strconv.FormatFloat(float64(systems.ActiveSettings.RenderScale), 'f', 2, 32)
	}
	v, err := strconv.ParseFloat(args[0], 32)
	if err != nil {
		return "usage: rscale <0.2..1>"
	}
	if v < 0.2 {
		v = 0.2
	}
	if v > 1.0 {
		v = 1.0
	}
	systems.ActiveSettings.RenderScale = float32(v)
	syncBackendSettings()
	Resize()
	return "rscale set to " + strconv.FormatFloat(v, 'f', 2, 32)
}

// syncBackendSettings pushes RenderScale/DoFSR from Settings into the backend.
func syncBackendSettings() {
	s := systems.ActiveSettings
	if gl, ok := CurrentBackend.(*webgl.WebGLBackend); ok {
		gl.RenderScale = s.RenderScale
		gl.DoFSR = s.DoFSR
	}
	if gpu, ok := CurrentBackend.(*webgpu.WebGPUBackend); ok {
		gpu.RenderScale = s.RenderScale
		gpu.DoFSR = s.DoFSR
	}
}

// Pause pauses or unpauses gameplay simulation.
func Pause(p bool) {
	paused = p
}

// IsPaused returns whether gameplay simulation is currently paused.
func IsPaused() bool {
	return paused
}

// SetCallbacks registers game tick and always-update (multiplayer) callbacks.
func SetCallbacks(update func(dt float32), always func(dt float32)) {
	gameUpdate = update
	alwaysUpdate = always
}

// FrameStep executes a single tick of input, callbacks, and camera updates.
func FrameStep(now float64) {
	if lastTime == 0.0 {
		lastTime = now
	}
	dt := float32(now - lastTime)
	if dt > 100.0 {
		dt = 100.0
	}
	lastTime = now
	frameTime = dt

	systems.GlobalInput.Update()

	if alwaysUpdate != nil {
		alwaysUpdate(dt)
	}
	if !paused && gameUpdate != nil {
		gameUpdate(dt)
	}

	if ActiveCamera != nil {
		ActiveCamera.Update()
	}
}

// syncRenderOptions copies the live Settings into the per-frame RenderOptions.
func syncRenderOptions() {
	s := systems.ActiveSettings
	renderOptions.ProceduralDetail = s.ProceduralDetail
	renderOptions.ShadowBlurIterations = s.ShadowBlurIterations
	renderOptions.ShadowBlurOffset = s.ShadowBlurOffset
	renderOptions.LightBlurIterations = s.LightBlurIterations
	renderOptions.EmissiveIterations = s.EmissiveIteration
	renderOptions.EmissiveOffset = s.EmissiveOffset
	renderOptions.EmissiveMult = s.EmissiveMult
	renderOptions.Gamma = s.Gamma
	renderOptions.DoDirt = s.DoDirt
	renderOptions.DirtIntensity = s.DirtIntensity
	renderOptions.ShadowIntensity = s.ShadowIntensity
	renderOptions.DoFSR = s.DoFSR
	renderOptions.FsrSharpness = s.FsrSharpness
	renderOptions.Dirt = DirtTexture
}

// RenderFrame renders one frame with the active camera, scene and settings.
func RenderFrame(timeSeconds float32) {
	if ActiveRenderer == nil || ActiveCamera == nil {
		return
	}
	cameraView.Position = ActiveCamera.Position
	cameraView.View = ActiveCamera.View
	cameraView.Projection = ActiveCamera.Projection
	cameraView.ViewProjection = ActiveCamera.ViewProjection
	cameraView.InverseViewProjection = ActiveCamera.InverseViewProjection
	syncRenderOptions()
	rendering.ClearRenderStats()
	ActiveRenderer.Render(cameraView, ActiveScene, renderOptions, timeSeconds)
	rs := rendering.ActiveRenderStats
	systems.GlobalStats.SetRenderStats(rs.MeshCount, rs.LightCount, rs.TriangleCount)
}

// frameLoop is the animation frame callback.
func frameLoop() {
	if !initialized {
		return
	}
	var now float64
	if performance != nil && performance.now != nil {
		ts := performance.now()
		now = ts.(float64)
	}
	FrameStep(now)
	RenderFrame(float32(now * 0.001))
	if ActiveCamera != nil {
		systems.GlobalStats.Update(now, &ActiveCamera.Position)
	}
	if rafId != nil && window != nil && window.requestAnimationFrame != nil {
		rafId = window.requestAnimationFrame(frameLoop)
	}
}

// Start begins the requestAnimationFrame loop.
func Start() {
	if rafId == nil && window != nil && window.requestAnimationFrame != nil {
		systems.GlobalInput.ResetDelta()
		lastTime = 0
		rafId = window.requestAnimationFrame(frameLoop)
	}
}

// Stop pauses the requestAnimationFrame loop.
func Stop() {
	if rafId != nil && window != nil && window.cancelAnimationFrame != nil {
		window.cancelAnimationFrame(rafId)
		rafId = nil
	}
}

// GetCanvas returns the active rendering canvas.
func GetCanvas() any {
	if CurrentBackend == nil {
		return nil
	}
	return CurrentBackend.GetCanvas()
}

// GetAspectRatio returns the canvas aspect ratio.
func GetAspectRatio() float32 {
	if CurrentBackend == nil {
		return 1.0
	}
	return CurrentBackend.GetAspectRatio()
}

// GetBackend returns the active GPU render backend.
func GetBackend() rendering.RenderBackend {
	return CurrentBackend
}

// Dispose releases engine resources and halts the frame loop.
func Dispose() {
	Stop()
	if resizeListener != nil && window != nil && window.removeEventListener != nil {
		window.removeEventListener("resize", resizeListener)
	}
	resizeListener = nil
	systems.GlobalInput.Dispose()
	if ActiveRenderer != nil {
		ActiveRenderer.Dispose()
		ActiveRenderer = nil
	}
	if CurrentBackend != nil {
		CurrentBackend.Dispose()
		CurrentBackend = nil
		rendering.ActiveBackend = nil
	}
	initialized = false
}
