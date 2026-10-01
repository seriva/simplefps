package engine

import (
	"strings"
	"testing"

	"./physics"
	"./rendering"
	"./systems"
)

// nopScene is an empty SceneSource standing in for the game scene (twin of
// rendering's nopScene; test files cannot be shared across packages).
type nopScene struct {
	draw  *rendering.DrawList
	light *rendering.LightList
}

func newNopScene() *nopScene {
	return &nopScene{draw: rendering.NewDrawList(1), light: rendering.NewLightList(1)}
}

func (s *nopScene) Ambient(out *physics.Vec3) {
	out.X = 0
	out.Y = 0
	out.Z = 0
}
func (s *nopScene) Skyboxes() *rendering.DrawList          { return s.draw }
func (s *nopScene) Meshes() *rendering.DrawList            { return s.draw }
func (s *nopScene) FPSMeshes() *rendering.DrawList         { return s.draw }
func (s *nopScene) SkinnedMeshes() *rendering.DrawList     { return s.draw }
func (s *nopScene) DirectionalLights() *rendering.DrawList { return s.draw }
func (s *nopScene) PointLights() *rendering.LightList      { return s.light }
func (s *nopScene) SpotLights() *rendering.LightList       { return s.light }
func (s *nopScene) Billboards() *rendering.DrawList        { return s.draw }
func (s *nopScene) ParticleEmitters() *rendering.DrawList  { return s.draw }
func (s *nopScene) Transparent() *rendering.DrawList       { return s.draw }

func TestBackendSelection(t *testing.T) {
	// Headless Node has no WebGPU, so selection must land on WebGL2.
	var backend rendering.RenderBackend
	SelectBackend(false, func(b rendering.RenderBackend) { backend = b })
	if backend == nil {
		t.Fatal("Expected backend instance")
	}
	if backend.Name() != "webgl2" {
		t.Errorf("Expected 'webgl2', got '%s'", backend.Name())
	}
}

func TestBackendSelectionFallsBackFromWebGPU(t *testing.T) {
	// preferWebGPU=true in headless must fall back to WebGL2 and still call back.
	var backend rendering.RenderBackend
	called := false
	SelectBackend(true, func(b rendering.RenderBackend) {
		called = true
		backend = b
	})
	if !called {
		t.Fatal("Expected onReady to be called")
	}
	if backend == nil || backend.Name() != "webgl2" {
		t.Fatal("Expected WebGL2 fallback backend")
	}
}

func TestEngineLifecycle(t *testing.T) {
	ready := false
	Init(false, func() { ready = true })
	if !ready {
		t.Fatal("Expected Init onReady to be called")
	}
	if CurrentBackend == nil {
		t.Fatal("Expected CurrentBackend to be set")
	}
	if ActiveRenderer == nil {
		t.Fatal("Expected ActiveRenderer to be initialized")
	}
	if ActiveCamera == nil {
		t.Fatal("Expected ActiveCamera to be initialized")
	}

	Pause(true)
	if !IsPaused() {
		t.Error("Expected engine to be paused")
	}
	Pause(false)
	if IsPaused() {
		t.Error("Expected engine to be unpaused")
	}

	// Test Callbacks & FrameStep
	gameUpdated := false
	alwaysUpdated := false
	SetCallbacks(
		func(dt float32) { gameUpdated = true },
		func(dt float32) { alwaysUpdated = true },
	)

	FrameStep(1000.0)
	FrameStep(1016.0)
	ActiveScene = newNopScene()
	RenderFrame(1.016)
	ActiveScene = nil

	if !gameUpdated {
		t.Error("Expected gameUpdate callback to be called")
	}
	if !alwaysUpdated {
		t.Error("Expected alwaysUpdate callback to be called")
	}

	// When paused, gameUpdate shouldn't run, but alwaysUpdate should
	Pause(true)
	gameUpdated = false
	alwaysUpdated = false
	FrameStep(1032.0)
	if gameUpdated {
		t.Error("Expected gameUpdate NOT to be called when paused")
	}
	if !alwaysUpdated {
		t.Error("Expected alwaysUpdate to be called even when paused")
	}

	Dispose()
	if CurrentBackend != nil {
		t.Error("Expected CurrentBackend to be cleaned up after dispose")
	}
	if ActiveRenderer != nil {
		t.Error("Expected ActiveRenderer to be cleaned up after dispose")
	}
}

func TestEngineConsoleCommands(t *testing.T) {
	Init(false, nil)
	defer Dispose()
	c := systems.GlobalConsole

	if res := c.ExecuteCmd("settings"); !strings.Contains(res, "\"RenderScale\"") {
		t.Errorf("settings should dump JSON, got %q", res)
	}
	if res := c.ExecuteCmd("sstore"); res != "settings stored" {
		t.Errorf("sstore result %q", res)
	}
	first := c.ExecuteCmd("tnc")
	second := c.ExecuteCmd("tnc")
	if first == second || (first != "noclip on" && first != "noclip off") {
		t.Errorf("tnc should toggle, got %q then %q", first, second)
	}

	d := ActiveRenderer.Debug
	if c.ExecuteCmd("twf") != "wireframes on" || !d.ShowWireframes {
		t.Error("twf must flip ActiveRenderer.Debug.ShowWireframes on")
	}
	if c.ExecuteCmd("twf") != "wireframes off" || d.ShowWireframes {
		t.Error("twf must flip ActiveRenderer.Debug.ShowWireframes off")
	}
	c.ExecuteCmd("tbv")
	c.ExecuteCmd("tlv")
	c.ExecuteCmd("tsk")
	if !d.ShowBoundingVolumes || !d.ShowLightVolumes || !d.ShowSkeleton {
		t.Error("tbv/tlv/tsk must write through to the live debug options")
	}
}

func TestStartRequiresScene(t *testing.T) {
	Init(false, nil)
	defer Dispose()

	ActiveScene = nil
	if err := Start(); err != ErrNoScene {
		t.Fatalf("Start without ActiveScene must return ErrNoScene, got %v", err)
	}
	if rafId != nil {
		t.Error("Start must not schedule a frame without a scene")
	}

	ActiveScene = newNopScene()
	defer func() { ActiveScene = nil }()
	if err := Start(); err != nil {
		t.Fatalf("Start with a scene must succeed, got %v", err)
	}
	Stop()
}
