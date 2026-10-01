package game

import (
	"../engine"
	"../engine/assets"
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

	// Scratch.
	horizontalForward physics.Vec3
	strafeDir         physics.Vec3
	origin            physics.Vec3
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
	return g
}

// Init binds the camera to the physics controller, installs the scene as the
// render source and registers the jump listener.
func (g *Game) Init() {
	if g.Camera != nil {
		physics.ActiveCameraPos = &g.Camera.Position
		physics.ActiveCameraDir = &g.Camera.Direction
		physics.ActiveCameraUp = &g.Camera.UpVector
	}
	engine.ActiveScene = g.Scene
	g.Multiplayer.Init()

	if window != nil && g.onJump == nil {
		g.onJump = func(e any) { g.Jump() }
		window.addEventListener("game:jump", g.onJump)
	}
}

// Dispose removes the jump listener and tears down networking.
func (g *Game) Dispose() {
	g.Multiplayer.Disconnect()
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
	if !CanUseGameplayInput() {
		g.accum = 0
		if g.Scene != nil {
			g.Scene.Update(frameTime)
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
	}

	if g.Camera != nil {
		g.horizontalForward.Copy(&g.Camera.Direction)
		g.horizontalForward.Y = 0
		g.horizontalForward.Normalize(&g.horizontalForward)
		g.strafeDir.RotateY(&g.horizontalForward, &g.origin, ToRadian(-90))
	}

	g.accum += ft
	if g.accum > MaxAccum {
		g.accum = MaxAccum
	}
	for g.accum >= FixedDT {
		if g.Controller != nil {
			g.Controller.Update(FixedDT)
			g.Controller.Move(strafe, move, &g.horizontalForward, &g.strafeDir, FixedDT)
		}
		g.Projectiles.Update(FixedDT)
		g.accum -= FixedDT
	}

	if g.Controller != nil {
		g.Controller.SyncCamera(ft)
		g.Pickups.Update(&g.Controller.Position)
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
	return NewGame(s, camera)
}
