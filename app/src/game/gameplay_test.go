package game

import (
	"math"
	"testing"

	"../engine/assets"
	"../engine/mathx"
	"../engine/rendering"
	"../engine/scene"
	"../engine/systems"
	"js:./interop.d.ts"
)

func approx(a, b, eps float32) bool {
	d := a - b
	return d < eps && d > -eps
}

func newTestScene() (*scene.Scene, *systems.Camera) {
	cam := systems.NewCamera()
	return scene.NewScene(cam), cam
}

// unitQuad builds a 2-triangle mesh in the XZ plane at y=0 spanning [-1,1].
func unitQuad() *rendering.Mesh {
	verts := []float32{-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1}
	idx := []uint32{0, 2, 1, 0, 3, 2}
	groups := []rendering.IndexGroup{rendering.IndexGroup{Material: "none", Array: idx}}
	return rendering.NewMesh(nil, verts, nil, nil, nil, groups)
}

// ---------------------------------------------------------------------------
// gamedefs
// ---------------------------------------------------------------------------

func TestOscillate(t *testing.T) {
	if !approx(Oscillate(0, 1000, 2), 2, 1e-5) {
		t.Errorf("cos(0)*2 = %f", Oscillate(0, 1000, 2))
	}
	if !approx(Oscillate(1000, 1000, 2), -2, 1e-5) {
		t.Errorf("cos(pi)*2 = %f", Oscillate(1000, 1000, 2))
	}
	if !approx(OscillateSin(500, 1000, 3), 3, 1e-5) {
		t.Errorf("sin(pi/2)*3 = %f", OscillateSin(500, 1000, 3))
	}
	if !approx(ToDegree(ToRadian(90)), 90, 1e-4) {
		t.Error("ToDegree/ToRadian round trip")
	}
}

func TestWeaponDefs(t *testing.T) {
	if len(WeaponConfigs) != WeaponCount {
		t.Fatalf("expected %d weapon configs", WeaponCount)
	}
	for i := 0; i < len(WeaponConfigs); i++ {
		if WeaponConfigs[i].Index != i {
			t.Errorf("weapon %d out of order", i)
		}
	}
	if WeaponIndexByType("plasma_pistol") != WeaponPlasmaPistol || WeaponIndexByType("health") != -1 {
		t.Error("WeaponIndexByType mismatch")
	}
	if !IsWeaponType("laser_gatling") || IsWeaponType("armor") {
		t.Error("IsWeaponType mismatch")
	}
	if len(PickupDefs) != 3+WeaponCount {
		t.Errorf("expected %d pickup defs, got %d", 3+WeaponCount, len(PickupDefs))
	}
	if !PickupDefs["pulse_cannon"].HasSpotlight || !approx(PickupDefs["pulse_cannon"].Scale, 1.4, 1e-6) {
		t.Error("weapon pickup defaults not applied")
	}
	if PickupDefs["health"].HasSpotlight || !PickupDefs["health"].HasYOffset {
		t.Error("consumable pickup defaults mismatch")
	}
}

// ---------------------------------------------------------------------------
// player
// ---------------------------------------------------------------------------

func TestPlayerClampingAndReset(t *testing.T) {
	p := NewPlayerState()
	changes := 0
	p.OnChange = func(h, a, am int) { changes++ }

	p.AddHealth(50)
	if p.Health != PlayerMaxHealth {
		t.Errorf("health should clamp at %d, got %d", PlayerMaxHealth, p.Health)
	}
	p.AddArmor(30)
	p.AddArmor(90)
	if p.Armor != PlayerMaxArmor {
		t.Errorf("armor should clamp, got %d", p.Armor)
	}
	p.AddAmmo(25)
	if p.Ammo != 75 {
		t.Errorf("ammo = %d, want 75", p.Ammo)
	}
	p.Reset()
	if p.Health != PlayerDefaultHealth || p.Armor != PlayerDefaultArmor || p.Ammo != PlayerDefaultAmmo {
		t.Error("reset did not restore defaults")
	}
	if changes != 5 {
		t.Errorf("OnChange fired %d times, want 5", changes)
	}
}

// ---------------------------------------------------------------------------
// weapons
// ---------------------------------------------------------------------------

func TestWeaponsLoadSelectionAndSwitch(t *testing.T) {
	s, cam := newTestScene()
	w := NewWeaponSystem(s, cam, nil)
	w.Load()

	if len(w.List) != WeaponCount || w.Selected != WeaponPlasmaPistol {
		t.Fatalf("default selection: %d", w.Selected)
	}
	_, fpsCount := s.GetEntities(scene.TypeFPSMesh)
	if fpsCount != WeaponCount {
		t.Errorf("expected %d FPS mesh entities in scene, got %d", WeaponCount, fpsCount)
	}
	for i := 0; i < len(w.List); i++ {
		if w.List[i].Base.Visible != (i == WeaponPlasmaPistol) {
			t.Errorf("visibility of weapon %d wrong", i)
		}
	}
	if !w.IsUnlocked(WeaponPlasmaPistol) || w.IsUnlocked(WeaponGrenadeLauncher) || w.IsUnlocked(99) {
		t.Error("unlock state mismatch")
	}

	// Only one weapon unlocked: cycling does nothing.
	w.SelectNext()
	w.SelectPrevious()
	if w.IsSwitching() {
		t.Error("cycling with a single weapon must not switch")
	}

	// Unlocking auto-switches via LOWER -> RAISE.
	w.Unlock(WeaponGrenadeLauncher)
	if !w.IsSwitching() || w.switchPhase != SwitchLower || w.switchNextIndex != WeaponGrenadeLauncher {
		t.Fatal("unlock should start lowering")
	}
	w.Unlock(WeaponGrenadeLauncher) // idempotent
	w.Unlock(WeaponPulseCannon)     // blocked while switching, but unlocked
	if w.switchNextIndex != WeaponGrenadeLauncher || !w.IsUnlocked(WeaponPulseCannon) {
		t.Error("switch target must not change mid-switch")
	}

	entity := w.List[w.Selected]
	// Half-way through lowering.
	w.switchStartTime = nowMs() - float64(SwitchDuration)*0.5
	entity.Update(16)
	if w.Selected != WeaponPlasmaPistol || w.switchPhase != SwitchLower {
		t.Error("models must not swap before the lower phase completes")
	}
	// Lower complete: swap and start raising.
	w.switchStartTime = nowMs() - float64(SwitchDuration) - 1
	entity.Update(16)
	if w.Selected != WeaponGrenadeLauncher || w.switchPhase != SwitchRaise {
		t.Fatalf("expected swap to grenade launcher, selected=%d phase=%d", w.Selected, w.switchPhase)
	}
	if w.List[WeaponPlasmaPistol].Base.Visible || !w.List[WeaponGrenadeLauncher].Base.Visible {
		t.Error("visibility not swapped")
	}
	// Raise complete.
	w.switchStartTime = nowMs() - float64(SwitchDuration) - 1
	w.List[w.Selected].Update(16)
	if w.IsSwitching() {
		t.Error("switch should be finished")
	}

	// Cycling across unlocked weapons wraps.
	w.SelectPrevious() // from 0 -> pulse cannon (4)
	if w.switchNextIndex != WeaponPulseCannon {
		t.Errorf("SelectPrevious target = %d", w.switchNextIndex)
	}

	// Reset restores the default loadout.
	w.Reset()
	if w.Selected != WeaponPlasmaPistol || w.IsUnlocked(WeaponGrenadeLauncher) || w.IsSwitching() {
		t.Error("reset mismatch")
	}
}

func TestWeaponsAnimationTransform(t *testing.T) {
	s, cam := newTestScene()
	cam.SetPosition(10, 20, 30)
	cam.SetRotation(0, 0, 0)
	cam.Update()
	w := NewWeaponSystem(s, cam, nil)
	w.Load()
	entity := w.List[w.Selected]

	w.SetIsMoving(true)
	w.SetIsGrounded(true)
	w.OnLand()
	if !approx(w.recoilVel, LandImpulse, 1e-6) {
		t.Error("OnLand impulse")
	}
	w.OnJump()

	for i := 0; i < 10; i++ {
		entity.Update(16)
	}
	if w.movementBlend <= 0 {
		t.Error("movement blend should grow while moving on the ground")
	}
	m := entity.Base.AniMatrix
	// The view model must end up near the camera (translation column).
	if math.Abs(float64(m[12]-10)) > 2 || math.Abs(float64(m[13]-20)) > 2 || math.Abs(float64(m[14]-30)) > 2 {
		t.Errorf("weapon not anchored to camera: %f %f %f", m[12], m[13], m[14])
	}
	for i := 0; i < 16; i++ {
		if math.IsNaN(float64(m[i])) {
			t.Fatal("NaN in weapon matrix")
		}
	}

	// Airborne: blend decays towards zero.
	w.SetIsGrounded(false)
	before := w.movementBlend
	entity.Update(16)
	if w.movementBlend >= before {
		t.Error("movement blend should fade while airborne")
	}

	// Looking straight up must not produce NaN (safe up vector).
	cam.Direction.Set(0, 1, 0)
	entity.Update(16)
	for i := 0; i < 16; i++ {
		if math.IsNaN(float64(m[i])) {
			t.Fatal("NaN in weapon matrix when looking up")
		}
	}
}

func TestWeaponsShootCooldown(t *testing.T) {
	s, cam := newTestScene()
	ps := NewProjectileSystem(s, cam)
	w := NewWeaponSystem(s, cam, ps)
	w.Load()

	if !w.Shoot() {
		t.Fatal("first shot should fire")
	}
	if ps.Count() != 1 {
		t.Errorf("projectile count = %d", ps.Count())
	}
	if w.Shoot() {
		t.Error("second shot must be blocked while firing")
	}
	// Recoil finished but cooldown pending.
	w.firing = false
	if w.Shoot() {
		t.Error("cooldown must block")
	}
	w.lastFiredAt = nowMs() - float64(FireCooldown) - 1
	if !w.Shoot() {
		t.Error("shot should fire after cooldown")
	}
	if ps.Count() != 2 {
		t.Errorf("projectile count = %d", ps.Count())
	}
}

// ---------------------------------------------------------------------------
// projectiles
// ---------------------------------------------------------------------------

func TestProjectileLifecycle(t *testing.T) {
	s, cam := newTestScene()
	cam.SetPosition(0, 0, 0)
	cam.Direction.Set(0, 0, -1)
	ps := NewProjectileSystem(s, cam)

	p := ps.Fire()
	if p == nil || ps.Count() != 1 {
		t.Fatal("fire failed")
	}
	// Spawn: 30 ahead, barrel offset to the right (+X for -Z forward), 5 down.
	if !approx(p.Body.Position.Z, -30, 1e-3) || !approx(p.Body.Position.Y, -5, 1e-3) || !approx(p.Body.Position.X, ProjectileBarrelOffset, 1e-3) {
		t.Errorf("spawn position %f %f %f", p.Body.Position.X, p.Body.Position.Y, p.Body.Position.Z)
	}
	if !approx(p.Body.Velocity.Z, -ProjectileVelocity, 1e-3) {
		t.Errorf("velocity %f", p.Body.Velocity.Z)
	}
	if s.EntityCount() != 2 {
		t.Errorf("mesh + light expected in scene, got %d", s.EntityCount())
	}

	// No static geometry: the projectile flies freely.
	ps.Update(FixedDT)
	if p.Body.Position.Z >= -30 {
		t.Error("projectile should have moved forward")
	}
	m := p.Entity.Base.AniMatrix
	if !approx(m[12], p.Body.Position.X, 1e-4) || !approx(m[0], ProjectileMeshScale, 1e-4) {
		t.Error("entity transform not following body")
	}
	if !approx(p.Light.Base.AniMatrix[14], p.Body.Position.Z, 1e-4) {
		t.Error("light not following body")
	}

	// Lifetime expiry explodes and removes mesh + light, adds explosion entities.
	p.Elapsed = ProjectileLifetime + 1
	ps.Update(FixedDT)
	if ps.Count() != 0 {
		t.Error("expired projectile should be removed")
	}
	_, lights := s.GetEntities(scene.TypePointLight)
	_, billboards := s.GetEntities(scene.TypeAnimatedBillboard)
	_, emitters := s.GetEntities(scene.TypeParticleEmitter)
	_, meshes := s.GetEntities(scene.TypeMesh)
	if lights != 1 || billboards != 4 || emitters != 1 || meshes != 0 {
		t.Errorf("explosion entities: lights=%d billboards=%d emitters=%d meshes=%d", lights, billboards, emitters, meshes)
	}

	// Resting body explodes too.
	p2 := ps.Fire()
	p2.Body.IsResting = true
	ps.Update(FixedDT)
	if ps.Count() != 0 {
		t.Error("resting projectile should explode")
	}

	ps.Fire()
	ps.Fire()
	ps.Reset()
	if ps.Count() != 0 {
		t.Error("reset should clear projectiles")
	}
	_, meshes = s.GetEntities(scene.TypeMesh)
	if meshes != 0 {
		t.Error("reset should remove projectile meshes from the scene")
	}

	// Flash light decays and asks for removal.
	s.Update(1000)
	_, lights = s.GetEntities(scene.TypePointLight)
	if lights != 0 {
		t.Errorf("flash lights should decay, got %d", lights)
	}
}

// ---------------------------------------------------------------------------
// pickups
// ---------------------------------------------------------------------------

func TestPickupCreateCollectRespawn(t *testing.T) {
	assets.GlobalResources.Register(PickupDefs["health"].MeshName, &assets.Entry{Kind: assets.KindMesh, Mesh: unitQuad()})

	player := NewPlayerState()
	player.Health = 50
	ps := NewPickupSystem(player)

	if ps.CreatePickup("bogus", mathx.NewVec3(0, 0, 0)) != nil {
		t.Error("unknown pickup type should be rejected")
	}

	health := ps.CreatePickup("health", mathx.NewVec3(100, 0, 0))
	if len(health) != 2 {
		t.Fatalf("health pickup should have mesh + point light, got %d", len(health))
	}
	if _, ok := health[1].(*scene.PointLightEntity); !ok {
		t.Error("consumable pickup should use a point light")
	}
	if !health[0].GetBase().CastShadow {
		t.Error("pickup mesh should cast a shadow")
	}

	unlocked := false
	collectedType := ""
	ps.OnWeaponCollected = func(pt string) { collectedType = pt }
	ps.IsWeaponUnlocked = func(idx int) bool { return unlocked }
	weapon := ps.CreatePickup("pulse_cannon", mathx.NewVec3(0, 0, 500))
	if len(weapon) != 2 {
		t.Fatalf("weapon pickup entities = %d", len(weapon))
	}
	if _, ok := weapon[1].(*scene.SpotLightEntity); !ok {
		t.Error("weapon pickup should use a spot light")
	}
	if len(ps.Pickups()) != 2 {
		t.Fatal("two pickups tracked")
	}

	// Animate: entity callbacks build a valid matrix.
	for i := 0; i < len(health); i++ {
		health[i].Update(16)
		health[i].Update(16)
		m := health[i].GetBase().AniMatrix
		if !approx(m[0], 1, 1e-4) && !approx(m[0]*m[0]+m[2]*m[2], 1, 1e-3) {
			t.Error("pickup matrix should be a scaled rotation")
		}
	}
	weapon[1].Update(16)

	now := float64(10000)
	// Far away: nothing happens.
	ps.UpdateAt(mathx.NewVec3(0, 0, 0), now)
	if ps.Pickups()[0].Collected || player.Health != 50 {
		t.Error("out-of-range pickup collected")
	}
	// In range: collect, hide, schedule respawn.
	ps.UpdateAt(mathx.NewVec3(100, 10, 0), now)
	hp := ps.Pickups()[0]
	if !hp.Collected || player.Health != 75 || health[0].GetBase().Visible || health[1].GetBase().Visible {
		t.Error("health pickup not collected properly")
	}
	if hp.RespawnAt != now+PickupRespawnTime {
		t.Error("respawn time mismatch")
	}
	// Still collected before respawn.
	ps.UpdateAt(mathx.NewVec3(100, 10, 0), now+1000)
	if !hp.Collected {
		t.Error("should stay collected before respawn")
	}
	// Respawn: visible again, grows in.
	respawnNow := now + PickupRespawnTime
	player.Health = PlayerMaxHealth // cannot pick up at full health
	ps.UpdateAt(mathx.NewVec3(100, 10, 0), respawnNow)
	if hp.Collected || !health[0].GetBase().Visible || hp.SpawnScale != 0 {
		t.Error("pickup should respawn at scale 0")
	}
	ps.UpdateAt(mathx.NewVec3(100, 10, 0), respawnNow+250)
	if hp.SpawnScale <= 0 || hp.SpawnScale >= 1 {
		t.Errorf("mid respawn scale = %f", hp.SpawnScale)
	}
	ps.UpdateAt(mathx.NewVec3(100, 10, 0), respawnNow+600)
	if hp.SpawnScale != 1 || hp.RespawnAnimationStart != 0 || hp.Collected {
		t.Error("respawn animation should finish; full-health player must not collect")
	}

	// Weapon pickup: gated by unlock state.
	unlocked = true
	ps.UpdateAt(mathx.NewVec3(0, 0, 500), now)
	if ps.Pickups()[1].Collected {
		t.Error("unlocked weapon must not be collected")
	}
	unlocked = false
	ps.UpdateAt(mathx.NewVec3(0, 0, 500), now)
	if !ps.Pickups()[1].Collected || collectedType != "pulse_cannon" {
		t.Error("weapon pickup should fire the callback")
	}

	ps.Reset()
	if len(ps.Pickups()) != 0 {
		t.Error("reset should clear pickups")
	}
}

// ---------------------------------------------------------------------------
// arena
// ---------------------------------------------------------------------------

const testArenaConfig = `{
	"skybox": 1,
	"chunks": ["arenas/test/geometry.bmesh"],
	"directional": {"direction": [0.5, 1.0, 0.3], "color": [0.125, 0.125, 0.15]},
	"lightGrid": {"src": "arenas/test/lightgrid.bin", "origin": [512, -128, 768], "counts": [19, 27, 7], "step": [64, 64, 128]},
	"spawnpoints": [
		{"position": [1232, 24, 288], "rotation": [0, 4.71238898038469, 0]},
		{"position": [1320, 24, 728], "rotation": [0, 2.356194490192345, 0]}
	],
	"pickups": [
		{"type": "health", "position": [10, 0, 20]},
		{"type": "grenade_launcher", "position": [30, 0, 40]}
	]
}`

func TestParseArenaConfig(t *testing.T) {
	cfg := ParseArenaConfig(testArenaConfig)
	if cfg == nil {
		t.Fatal("config should parse")
	}
	if cfg.Skybox != "1" || len(cfg.Chunks) != 1 || cfg.Chunks[0] != "arenas/test/geometry.bmesh" {
		t.Error("skybox/chunks mismatch")
	}
	if !cfg.HasDirectional || cfg.LightColor[2] != float32(0.15) || cfg.Direction[0] != 0.5 {
		t.Error("directional mismatch")
	}
	if cfg.LightGrid == nil || cfg.LightGrid.Src != "arenas/test/lightgrid.bin" || cfg.LightGrid.Counts[1] != 27 || cfg.LightGrid.Step[2] != 128 || cfg.LightGrid.Origin[0] != 512 {
		t.Error("light grid mismatch")
	}
	if len(cfg.SpawnPoints) != 2 || cfg.SpawnPoints[1].Position.Z != 728 || !approx(cfg.SpawnPoints[0].Rotation.Y, 4.71238898, 1e-5) {
		t.Error("spawn points mismatch")
	}
	if len(cfg.Pickups) != 2 || cfg.Pickups[1].Type != "grenade_launcher" || cfg.Pickups[1].Position.Z != 40 {
		t.Error("pickups mismatch")
	}

	minimal := ParseArenaConfig(`{"spawnpoint": {"position": [1, 2, 3]}, "directional": {}}`)
	if len(minimal.SpawnPoints) != 1 || minimal.SpawnPoints[0].Position.Y != 2 || minimal.LightGrid != nil || minimal.Skybox != "" {
		t.Error("minimal config mismatch")
	}
	if !minimal.HasDirectional || minimal.Direction[1] != 1.0 || minimal.LightColor[0] != 1.0 {
		t.Error("directional defaults not applied")
	}
	if ParseArenaConfig("null") != nil {
		t.Error("null config should be rejected")
	}
}

func TestArenaBuild(t *testing.T) {
	cfg := ParseArenaConfig(testArenaConfig)
	assets.GlobalResources.Register(cfg.Chunks[0], &assets.Entry{Kind: assets.KindMesh, Mesh: unitQuad()})
	assets.GlobalResources.Register(PickupDefs["health"].MeshName, &assets.Entry{Kind: assets.KindMesh, Mesh: unitQuad()})
	assets.GlobalResources.Register(PickupDefs["grenade_launcher"].MeshName, &assets.Entry{Kind: assets.KindMesh, Mesh: unitQuad()})

	s, cam := newTestScene()
	pickups := NewPickupSystem(NewPlayerState())
	a := NewArena(s, cam, pickups)

	paths := a.requiredResources(cfg)
	if len(paths) != 6 { // chunk, lightgrid, 2 pickups, npc mesh + anim
		t.Errorf("required resources = %d: %v", len(paths), paths)
	}

	a.Build(cfg)
	if a.SpawnPoint == nil || (a.SpawnPoint != cfg.SpawnPoints[0] && a.SpawnPoint != cfg.SpawnPoints[1]) {
		t.Fatal("spawn point should be one of the config spawn points")
	}
	if cam.Position.X != a.SpawnPoint.Position.X || !approx(cam.Rotation.Y, ToDegree(a.SpawnPoint.Rotation.Y), 1e-3) {
		t.Error("camera not placed at spawn")
	}
	_, skyboxes := s.GetEntities(scene.TypeSkybox)
	_, dirLights := s.GetEntities(scene.TypeDirectionalLight)
	_, meshes := s.GetEntities(scene.TypeMesh)
	_, pointLights := s.GetEntities(scene.TypePointLight)
	_, spotLights := s.GetEntities(scene.TypeSpotLight)
	if skyboxes != 1 || dirLights != 1 {
		t.Errorf("skybox=%d directional=%d", skyboxes, dirLights)
	}
	if meshes != 3 { // chunk + 2 pickup meshes
		t.Errorf("mesh entities = %d, want 3", meshes)
	}
	if pointLights != 1 || spotLights != 1 {
		t.Errorf("pickup lights: point=%d spot=%d", pointLights, spotLights)
	}
	if len(pickups.Pickups()) != 2 {
		t.Error("pickups not registered")
	}
	// NPC mesh is not loaded: no skinned entities, no crash.
	_, skinned := s.GetEntities(scene.TypeSkinnedMesh)
	if skinned != 0 {
		t.Error("no NPC without its mesh")
	}
	// The chunk quad sits at the origin: a ray there snaps to y=0, elsewhere it falls back.
	if a.groundHeight(0, 5, 0) != 0 {
		t.Error("ground height should snap to the static chunk")
	}
	if a.groundHeight(1000, 5, 1000) != 5 {
		t.Error("ground height should fall back to the input height without a hit")
	}

	// Rebuilding resets the scene rather than accumulating entities.
	a.Build(cfg)
	_, skyboxes = s.GetEntities(scene.TypeSkybox)
	if skyboxes != 1 {
		t.Error("rebuild should reset the scene")
	}
}

async func TestArenaLoadMissing(t *testing.T) {
	s, cam := newTestScene()
	a := NewArena(s, cam, NewPickupSystem(NewPlayerState()))
	starts := 0
	ends := 0
	a.OnLoadStart = func() { starts++ }
	a.OnLoadEnd = func() { ends++ }
	ok := await a.Load("does-not-exist")
	if ok || a.Config != nil {
		t.Error("missing arena must fail")
	}
	if starts != 1 || ends != 1 {
		t.Error("load hooks must bracket even a failed load")
	}
}

// ---------------------------------------------------------------------------
// game
// ---------------------------------------------------------------------------

func TestGameSpawnAndUpdate(t *testing.T) {
	s, cam := newTestScene()
	g := NewGame(s, cam)
	g.Init()

	g.Arena.SpawnPoint = &SpawnPoint{}
	g.Arena.SpawnPoint.Position.Set(100, 0, 200)
	g.Arena.SpawnPoint.Rotation.Set(0, ToRadian(90), 0)
	g.SpawnPlayer()

	if g.Controller == nil || g.Controller.Position.X != 100 {
		t.Fatal("controller not spawned")
	}
	if g.Controller.Provider == nil {
		t.Error("controller raycast provider not set")
	}
	if !approx(cam.Rotation.Y, 90, 1e-3) {
		t.Errorf("camera yaw = %f", cam.Rotation.Y)
	}
	if len(g.Weapons.List) != WeaponCount || g.Weapons.Selected != WeaponPlasmaPistol {
		t.Error("weapons not loaded")
	}

	// Player stat changes reach the HUD hook without a DOM.
	g.Player.AddAmmo(10)

	// Menu state: no simulation, but the scene still updates.
	GlobalState.Current = StateMenu
	g.accum = 0.05
	g.Update(16)
	if g.accum != 0 {
		t.Error("accumulator should reset outside the game state")
	}

	// Game state: fixed steps consume the accumulator.
	GlobalState.Current = StateGame
	startY := g.Controller.Position.Y
	g.Update(50) // 50ms -> 6 fixed steps of 1/120s
	if g.accum >= FixedDT {
		t.Errorf("accumulator not consumed: %f", g.accum)
	}
	if g.Controller.Position.Y >= startY {
		t.Error("controller should fall without ground")
	}
	// The controller (WASM) pose is copied back to the camera after SyncCamera.
	if !approx(cam.Position.X, 100, 1e-3) || !approx(cam.Position.Z, 200, 1e-3) {
		t.Errorf("camera not synced from controller: %+v", cam.Position)
	}
	// Frame time above the cap is clamped.
	g.Update(1000)
	if g.accum >= FixedDT {
		t.Error("accumulator should stay below one step after a long frame")
	}

	// Weapon pickup path unlocks and switches.
	g.Pickups.OnWeaponCollected("laser_gatling")
	if !g.Weapons.IsUnlocked(WeaponLaserGatling) || !g.Weapons.IsSwitching() {
		t.Error("weapon pickup should unlock and switch")
	}
	if !g.Pickups.IsWeaponUnlocked(WeaponLaserGatling) || g.Pickups.IsWeaponUnlocked(WeaponPulseCannon) {
		t.Error("unlock query mismatch")
	}

	GlobalState.Current = StateMenu
	g.Jump() // guarded: no panic outside game state
	g.Dispose()
}

// ---------------------------------------------------------------------------
// controls / update (DOM-dependent parts are guarded)
// ---------------------------------------------------------------------------

func TestControlsGuards(t *testing.T) {
	s, cam := newTestScene()
	ps := NewProjectileSystem(s, cam)
	w := NewWeaponSystem(s, cam, ps)
	w.Load()
	w.Unlock(WeaponGrenadeLauncher)
	w.switchPhase = SwitchNone
	c := NewControls(w)

	GlobalState.Current = StateMenu
	c.Shoot()
	c.Scroll(-1)
	if ps.Count() != 0 || w.IsSwitching() {
		t.Error("controls must be inert outside the game state")
	}

	GlobalState.Current = StateGame
	c.Shoot()
	if ps.Count() != 1 {
		t.Error("shoot should fire in game state")
	}
	c.Scroll(-1)
	if !w.IsSwitching() {
		t.Error("scroll should cycle weapons in game state")
	}

	if document != nil {
		c.Init()
		c.Init() // idempotent
		if !c.initialized {
			t.Error("controls should initialise with a DOM")
		}
		c.Dispose()
		if c.initialized {
			t.Error("dispose should clear initialised flag")
		}
	} else {
		c.Init()
		if c.initialized {
			t.Error("controls must not initialise without a DOM")
		}
	}
	GlobalState.Current = StateMenu
}

func TestUpdateManagerWithoutServiceWorker(t *testing.T) {
	u := NewUpdateManager()
	u.Init() // no navigator.serviceWorker headless / jsdom
	if u.HasUpdate() {
		t.Error("no update should be pending")
	}
	u.Force() // no registration: no-op
	GlobalState.Current = StateMenu
	u.Update()
	if GlobalState.Current != StateGame {
		t.Error("Update without a waiting worker should enter the game")
	}
	GlobalState.Current = StateMenu
}
