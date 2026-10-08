package engine

import (
	"strings"
	"testing"

	"./mathx"
	"./rendering"
	"./rendering/fakegpu"
	"./systems"
)

// engineNopScene is an empty SceneSource standing in for the game scene.
type engineNopScene struct {
	draw  *rendering.DrawList
	light *rendering.LightList
}

func newEngineNopScene() *engineNopScene {
	return &engineNopScene{draw: rendering.NewDrawList(1), light: rendering.NewLightList(1)}
}

func (s *engineNopScene) Ambient(out *mathx.Vec3) {
	out.X = 0
	out.Y = 0
	out.Z = 0
}
func (s *engineNopScene) Skyboxes() *rendering.DrawList          { return s.draw }
func (s *engineNopScene) Meshes() *rendering.DrawList            { return s.draw }
func (s *engineNopScene) FPSMeshes() *rendering.DrawList         { return s.draw }
func (s *engineNopScene) SkinnedMeshes() *rendering.DrawList     { return s.draw }
func (s *engineNopScene) DirectionalLights() *rendering.DrawList { return s.draw }
func (s *engineNopScene) PointLights() *rendering.LightList      { return s.light }
func (s *engineNopScene) SpotLights() *rendering.LightList       { return s.light }
func (s *engineNopScene) Billboards() *rendering.DrawList        { return s.draw }
func (s *engineNopScene) ParticleEmitters() *rendering.DrawList  { return s.draw }
func (s *engineNopScene) Transparent() *rendering.DrawList       { return s.draw }

// newEngineBackend builds a rendering.Backend driven by the fake GPU device.
func newEngineBackend() (*fakegpu.Device, *rendering.Backend) {
	dev := fakegpu.NewDevice()
	b := rendering.NewBackend()
	b.Canvas = map[string]any{"clientWidth": 320, "clientHeight": 240, "width": 320, "height": 240}
	var d any = dev
	var ctx any = fakegpu.NewContext(dev, 320, 240)
	b.InitWithDevice(d, ctx)
	return dev, b
}

func TestBackendInitFailsWithoutWebGPU(t *testing.T) {
	// Headless Node has no WebGPU, so InitBackend must report ok=false.
	called := false
	InitBackend(func(b *rendering.Backend, ok bool) {
		called = true
		if ok {
			t.Error("Expected InitBackend to fail in headless environment without WebGPU")
		}
		if b != nil {
			t.Error("Expected nil backend on failure")
		}
	})
	if !called {
		t.Fatal("Expected onReady callback to be called")
	}
}

func TestEngineInitGracefulWithoutWebGPU(t *testing.T) {
	ready := false
	Init(func() { ready = true })
	if !ready {
		t.Fatal("Expected Init onReady to be called even when WebGPU is unavailable")
	}
}

func TestEngineLifecycle(t *testing.T) {
	dev, b := newEngineBackend()
	InitWithBackend(b)
	if CurrentBackend != b || GetBackend() != b {
		t.Fatal("Expected CurrentBackend to be set")
	}
	if ActiveRenderer == nil || !ActiveRenderer.Ready() {
		t.Fatal("Expected ActiveRenderer to be initialized and ready")
	}
	if ActiveCamera == nil {
		t.Fatal("Expected ActiveCamera to be initialized")
	}
	if len(dev.Pipelines) == 0 {
		t.Error("renderer init must create pipelines on the device")
	}

	Pause(true)
	if !IsPaused() {
		t.Error("Expected engine to be paused")
	}
	Pause(false)
	if IsPaused() {
		t.Error("Expected engine to be unpaused")
	}

	gameUpdated := false
	alwaysUpdated := false
	SetCallbacks(
		func(dt float32) { gameUpdated = true },
		func(dt float32) { alwaysUpdated = true },
	)

	FrameStep(1000.0)
	FrameStep(1016.0)
	ActiveScene = newEngineNopScene()
	dev.ResetFrame()
	RenderFrame(1.016)
	ActiveScene = nil
	if dev.Submits != 1 {
		t.Errorf("RenderFrame must submit one command buffer, got %d", dev.Submits)
	}

	if !gameUpdated {
		t.Error("Expected gameUpdate callback to be called")
	}
	if !alwaysUpdated {
		t.Error("Expected alwaysUpdate callback to be called")
	}

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

func TestSettingsSyncToBackend(t *testing.T) {
	_, b := newEngineBackend()
	InitWithBackend(b)
	defer Dispose()

	s := systems.ActiveSettings
	s.RenderScale = 0.5
	s.DoFSR = true
	syncBackendSettings()
	if b.RenderScale != 0.5 || !b.DoFSR {
		t.Errorf("backend settings not synced: scale=%v fsr=%v", b.RenderScale, b.DoFSR)
	}
}

func TestEngineConsoleCommands(t *testing.T) {
	_, b := newEngineBackend()
	InitWithBackend(b)
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
	_, b := newEngineBackend()
	InitWithBackend(b)
	defer Dispose()

	ActiveScene = nil
	if err := Start(); err != ErrNoScene {
		t.Fatalf("Start without ActiveScene must return ErrNoScene, got %v", err)
	}
	if rafId != nil {
		t.Error("Start must not schedule a frame without a scene")
	}

	ActiveScene = newEngineNopScene()
	defer func() { ActiveScene = nil }()
	if err := Start(); err != nil {
		t.Fatalf("Start with a scene must succeed, got %v", err)
	}
	Stop()
}
