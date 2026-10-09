package game

import (
	"../engine"
	"../engine/assets"
	"../engine/mathx"
	"../engine/physics"
	"../engine/scene"
	"../engine/systems"
	"js:./interop.d.ts"
)

// Fixed-step simulation (game.js).
const (
	FixedDT  = float32(1.0 / 120.0)
	MaxAccum = float32(0.1) // matches the engine's 100ms frame cap
)

// Game ties the gameplay systems together: arena, player controller,
// weapons, projectiles and pickups, driven by a fixed-step update loop.
type Game struct {
	Scene       *scene.Scene
	Camera      *systems.Camera
	Player      *PlayerState
	Projectiles *ProjectileSystem
	Weapons     *WeaponSystem
	Pickups     *PickupSystem
	Arena       *Arena
	Controls    *Controls
	Controller  *physics.FPSController
	Multiplayer *Multiplayer

	accum float32

	onJump any
}

// NewGame builds the gameplay systems around a scene and camera.
func NewGame(s *scene.Scene, camera *systems.Camera) *Game {
	g := &Game{
		Scene:  s,
		Camera: camera,
		Player: GlobalPlayer,
	}
	g.Projectiles = NewProjectileSystem(s, camera)
	g.Weapons = NewWeaponSystem(s, camera, g.Projectiles)
	g.Pickups = NewPickupSystem(g.Player)
	g.Arena = NewArena(s, camera, g.Pickups)
	g.Controls = NewControls(g.Weapons)
	g.Multiplayer = NewMultiplayer(s, camera)

	g.Pickups.OnWeaponCollected = func(pickupType string) {
		if idx := WeaponIndexByType(pickupType); idx >= 0 {
			g.Weapons.Unlock(idx)
		}
	}
	g.Pickups.IsWeaponUnlocked = func(idx int) bool {
		return g.Weapons.IsUnlocked(idx)
	}
	g.Player.OnChange = func(health, armor, ammo int) {
		GlobalHUD.Update(health, armor, ammo)
	}
	g.Arena.OnLoadStart = func() { GlobalLoading.Toggle(true) }
	g.Arena.OnLoadEnd = func() { GlobalLoading.Toggle(false) }
	GlobalState.CanPause = func() bool {
		return g.Multiplayer == nil || !g.Multiplayer.IsConnected()
	}
	return g
}

// Init installs the scene as the render source, binds the controller (if
// already spawned) and registers the jump listener.
func (g *Game) Init() {
	g.bindController()
	engine.ActiveScene = g.Scene
	g.Multiplayer.Init()

	if window != nil && g.onJump == nil {
		g.onJump = func(e any) { g.Jump() }
		window.addEventListener("game:jump", g.onJump)
	}
}

// bindController points the FPS controller at the scene's static world for
// raycasts. The camera pose is copied in and out each frame (see Update).
func (g *Game) bindController() {
	if g.Controller == nil {
		return
	}
	if g.Scene != nil {
		g.Controller.Provider = g.Scene.StaticWorld()
	}
}

// syncCameraIn copies the camera pose into the (WASM-owned) controller pose.
func (g *Game) syncCameraIn() {
	pose := &g.Controller.Camera
	pose.Position.Copy(&g.Camera.Position)
	pose.Direction.Copy(&g.Camera.Direction)
	pose.Up.Copy(&g.Camera.UpVector)
}

// syncCameraOut copies the pose SyncCamera / noclip produced back to the camera.
func (g *Game) syncCameraOut() {
	pose := &g.Controller.Camera
	g.Camera.Position.Copy(&pose.Position)
	g.Camera.UpVector.Copy(&pose.Up)
}

// Dispose removes the jump listener and tears down networking.
func (g *Game) Dispose() {
	g.Multiplayer.Disconnect()
	if GlobalState.CanPause != nil {
		GlobalState.CanPause = nil
	}
	if window != nil && g.onJump != nil {
		window.removeEventListener("game:jump", g.onJump)
		g.onJump = nil
	}
}

// Jump makes the player jump when gameplay input is allowed.
func (g *Game) Jump() {
	if !CanUseGameplayInput() || g.Controller == nil {
		return
	}
	g.Controller.Jump()
}

// Load loads the arena and spawns the player, weapons and pickups.
async func (g *Game) Load(mapName string) bool {
	g.accum = 0
	ok := await g.Arena.Load(mapName)
	if !ok {
		return false
	}
	g.SpawnPlayer()
	return true
}

// SpawnPlayer (re)creates the controller at the arena spawn point and resets
// the gameplay systems. Split from Load so tests can drive it synchronously.
func (g *Game) SpawnPlayer() {
	spawn := g.Arena.SpawnPoint
	if spawn == nil {
		spawn = &SpawnPoint{}
	}

	g.Controller = physics.NewFPSController(&spawn.Position, &physics.FPSControllerConfig{
		OnLand: func() { g.Weapons.OnLand() },
		OnJump: func() { g.Weapons.OnJump() },
	})
	g.bindController()

	if g.Camera != nil {
		g.Camera.SetRotation(0, ToDegree(spawn.Rotation.Y), 0)
	}

	g.Weapons.Load()
	g.Player.Reset()
	g.Weapons.Reset()
	g.Projectiles.Reset()
}

// Update is the per-frame gameplay tick (frameTime in ms): look, movement
// input, fixed-step physics, camera sync, pickups and scene update.
// Multiplayer is ticked separately via engine.SetCallbacks' always-update so
// networking continues while the engine is paused.
func (g *Game) Update(frameTime float32) {
	if engine.IsPaused() {
		return
	}

	if !CanUseGameplayInput() {
		g.accum = 0
		if g.Multiplayer != nil && g.Multiplayer.IsConnected() {
			if g.Scene != nil {
				g.Scene.Update(frameTime)
			}
		}
		return
	}

	ft := frameTime / 1000
	input := systems.GlobalInput
	settings := systems.ActiveSettings

	if g.Camera != nil {
		cursor := input.CursorMovement()
		g.Camera.AddRotation(cursor.Y*settings.LookSensitivity, -cursor.X*settings.LookSensitivity)
	}

	var strafe, move float32
	if input.IsDown(settings.Forward) {
		move += 1
	}
	if input.IsDown(settings.Backwards) {
		move -= 1
	}
	if input.IsDown(settings.Left) {
		strafe -= 1
	}
	if input.IsDown(settings.Right) {
		strafe += 1
	}

	g.Weapons.SetIsMoving(move != 0 || strafe != 0)
	if g.Controller != nil {
		g.Weapons.SetIsGrounded(g.Controller.IsGrounded())
		if g.Camera != nil {
			g.syncCameraIn()
		}
	}

	g.accum += ft
	if g.accum > MaxAccum {
		g.accum = MaxAccum
	}
	for g.accum >= FixedDT {
		if g.Controller != nil {
			g.Controller.Update(FixedDT)
			g.Controller.MoveWithCamera(strafe, move, FixedDT)
		}
		g.Projectiles.Update(FixedDT)
		g.accum -= FixedDT
	}

	if g.Controller != nil {
		g.Controller.SyncCamera(ft)
		if g.Camera != nil {
			g.syncCameraOut()
		}
		g.Pickups.Update(&g.Controller.Position)
	}

	// Refresh view/frustum now so scene culling sees this frame's camera pose
	// instead of last frame's (the engine's own Camera.Update runs after us).
	if g.Camera != nil {
		g.Camera.Update()
	}

	if g.Scene != nil {
		g.Scene.Update(frameTime)
	}
}

// NewDefaultGame creates the game around the engine's active camera and a new
// scene, wiring the resource loader to the loading screen.
func NewDefaultGame() *Game {
	camera := engine.ActiveCamera
	if camera == nil {
		camera = systems.NewCamera()
	}
	s := scene.NewScene(camera)
	assets.GlobalResources.OnLoadStart = func() { GlobalLoading.Toggle(true) }
	assets.GlobalResources.OnLoadEnd = func() { GlobalLoading.Toggle(false) }
	g := NewGame(s, camera)
	if engine.ActiveRenderer != nil {
		g.Arena.SkyboxMesh = engine.ActiveRenderer.Shapes.SkyBox
	}
	return g
}
