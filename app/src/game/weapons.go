package game

import (
	"math"

	"../engine"
	"../engine/assets"
	"../engine/physics"
	"../engine/scene"
	"../engine/systems"
	"js:./interop.d.ts"
)

// nowMs returns the high-resolution clock in milliseconds.
func nowMs() float64 {
	if performance != nil && performance.now != nil {
		now := performance.now()
		return now.(float64)
	}
	return 0
}

// Weapon switch phases.
const (
	SwitchNone = iota
	SwitchLower
	SwitchRaise
)

// WeaponSystem owns the first-person view models and their procedural
// animation (weapons.js): idle sway, movement bob, recoil spring, landing /
// jump impulses and the lower/raise switch sequence.
type WeaponSystem struct {
	Scene       *scene.Scene
	Camera      *systems.Camera
	Projectiles *ProjectileSystem

	List     []*scene.MeshEntity // indexed by weapon index
	Unlocked []bool
	Selected int

	firing      bool
	firingStart float64
	firingTimer float32
	lastFiredAt float64

	isMoving      bool
	isGrounded    bool
	movementBlend float32

	recoilPos float32
	recoilVel float32

	switchPhase     int
	switchStartTime float64
	switchNextIndex int

	// Scratch, allocation-free per frame.
	weaponDir   physics.Vec3
	weaponPos   physics.Vec3
	weaponUp    physics.Vec3
	lookTarget  physics.Vec3
	translation physics.Vec3
	scaleVec    physics.Vec3
}

var (
	rotY180    = ToRadian(180)
	rotXNeg2p5 = ToRadian(-2.5)
)

// NewWeaponSystem creates an empty weapon system bound to scene and camera.
func NewWeaponSystem(s *scene.Scene, camera *systems.Camera, projectiles *ProjectileSystem) *WeaponSystem {
	w := &WeaponSystem{
		Scene:           s,
		Camera:          camera,
		Projectiles:     projectiles,
		List:            make([]*scene.MeshEntity, 0),
		Unlocked:        make([]bool, 0),
		Selected:        -1,
		isGrounded:      true,
		lastFiredAt:     math.Inf(-1),
		switchNextIndex: -1,
	}
	w.scaleVec.Set(WeaponScaleBaseX, WeaponScaleBaseY, WeaponScaleBaseZ)
	return w
}

// Load creates one hidden FPS mesh entity per WeaponConfig and selects the
// default weapon (plasma pistol).
func (w *WeaponSystem) Load() {
	w.List = make([]*scene.MeshEntity, len(WeaponConfigs))
	for i := 0; i < len(WeaponConfigs); i++ {
		cfg := &WeaponConfigs[i]
		mesh := assets.GlobalResources.GetMesh(cfg.Mesh)
		entity := scene.NewMeshEntity(scene.TypeFPSMesh, nil, mesh, func(e scene.Entity, frameTime float32) bool {
			w.animate(e.(*scene.MeshEntity), cfg, frameTime)
			return true
		}, 1)
		entity.Base.UserData = cfg
		entity.Base.Visible = false
		w.List[cfg.Index] = entity
		if w.Scene != nil {
			w.Scene.AddEntity(entity)
		}
	}
	w.Unlocked = make([]bool, len(w.List))
	w.selectDefault()
}

func (w *WeaponSystem) selectDefault() {
	for i := 0; i < len(w.Unlocked); i++ {
		w.Unlocked[i] = false
	}
	if len(w.List) == 0 {
		w.Selected = -1
		return
	}
	if WeaponPlasmaPistol < len(w.List) {
		w.Selected = WeaponPlasmaPistol
	} else {
		w.Selected = 0
	}
	w.Unlocked[w.Selected] = true
	w.hideAll()
	w.List[w.Selected].Base.Visible = true
}

func (w *WeaponSystem) hideAll() {
	for i := 0; i < len(w.List); i++ {
		w.List[i].Base.Visible = false
	}
}

// Reset clears projectiles and restores the default loadout.
func (w *WeaponSystem) Reset() {
	if w.Projectiles != nil {
		w.Projectiles.Reset()
	}
	w.switchPhase = SwitchNone
	w.switchNextIndex = -1
	w.firing = false
	w.recoilPos = 0
	w.recoilVel = 0
	w.movementBlend = 0
	w.selectDefault()
}

// SetIsMoving flags player movement for the bob animation.
func (w *WeaponSystem) SetIsMoving(moving bool) { w.isMoving = moving }

// SetIsGrounded flags ground contact; airborne weapons stop swaying.
func (w *WeaponSystem) SetIsGrounded(grounded bool) { w.isGrounded = grounded }

// OnLand applies the landing impulse to the recoil spring.
func (w *WeaponSystem) OnLand() { w.recoilVel += LandImpulse }

// OnJump applies the jump impulse to the recoil spring.
func (w *WeaponSystem) OnJump() { w.recoilVel += JumpImpulse }

// IsUnlocked reports whether the weapon at index is available.
func (w *WeaponSystem) IsUnlocked(index int) bool {
	return index >= 0 && index < len(w.Unlocked) && w.Unlocked[index]
}

// IsSwitching reports whether a lower/raise sequence is in progress.
func (w *WeaponSystem) IsSwitching() bool {
	return w.switchPhase != SwitchNone
}

// Unlock makes the weapon available and switches to it.
func (w *WeaponSystem) Unlock(index int) {
	if index < 0 || index >= len(w.List) || w.Unlocked[index] {
		return
	}
	w.Unlocked[index] = true
	w.startSwitch(index)
}

func (w *WeaponSystem) startSwitch(nextIndex int) {
	if w.switchPhase != SwitchNone || nextIndex == w.Selected {
		return
	}
	w.switchPhase = SwitchLower
	w.switchStartTime = nowMs()
	w.switchNextIndex = nextIndex
}

// SelectNext switches to the next unlocked weapon (wrapping).
func (w *WeaponSystem) SelectNext() {
	count := len(w.List)
	for i := 1; i < count; i++ {
		idx := (w.Selected + i) % count
		if w.Unlocked[idx] {
			w.startSwitch(idx)
			return
		}
	}
}

// SelectPrevious switches to the previous unlocked weapon (wrapping).
func (w *WeaponSystem) SelectPrevious() {
	count := len(w.List)
	for i := 1; i < count; i++ {
		idx := (w.Selected - i + count) % count
		if w.Unlocked[idx] {
			w.startSwitch(idx)
			return
		}
	}
}

// Shoot fires a grenade if the weapon is not recoiling and the cooldown has
// elapsed. Returns true when a shot was fired.
func (w *WeaponSystem) Shoot() bool {
	now := nowMs()
	if w.firing {
		return false
	}
	if now-w.lastFiredAt < float64(FireCooldown) {
		return false
	}
	w.firing = true
	w.firingStart = now
	w.firingTimer = 0
	w.lastFiredAt = now

	assets.GlobalResources.Play("sounds/shoot.sfx")
	if w.Projectiles != nil {
		w.Projectiles.Fire()
	}
	return true
}

// animate is the per-frame callback of the visible view model.
func (w *WeaponSystem) animate(entity *scene.MeshEntity, cfg *WeaponConfig, frameTime float32) {
	base := &entity.Base
	base.AnimationTime += frameTime

	// Blend movement sway in/out; airborne forces it to zero.
	targetBlend := float32(0)
	if w.isMoving && w.isGrounded {
		targetBlend = 1
	}
	w.movementBlend += (targetBlend - w.movementBlend) * MovementFadeSpeed * frameTime

	// Recoil / landing spring (mass 1).
	dt := frameTime / 1000
	force := -LandSpringStiffness*w.recoilPos - LandSpringDamping*w.recoilVel
	w.recoilVel += force * dt
	w.recoilPos += w.recoilVel * dt

	switchOffset := w.updateSwitch(base)

	fire := w.calculateFire(frameTime)
	moveH := Oscillate(base.AnimationTime, HorizontalPeriod, AmplitudeHorizontalMove) * w.movementBlend
	moveV := -Oscillate(base.AnimationTime, VerticalPeriod, AmplitudeVerticalMove) * w.movementBlend
	idleH := Oscillate(base.AnimationTime, IdlePeriodHorizontal, AmplitudeIdleHorizontal)
	idleV := OscillateSin(base.AnimationTime, IdlePeriodVertical, AmplitudeIdleVertical)

	w.applyTransforms(entity, cfg, fire, moveH, moveV, idleH, idleV, w.recoilPos, switchOffset)
}

// updateSwitch advances the lower/raise sequence and returns the Y offset.
func (w *WeaponSystem) updateSwitch(base *scene.EntityBase) float32 {
	if w.switchPhase == SwitchNone {
		return 0
	}
	now := nowMs()
	progress := float32((now - w.switchStartTime) / float64(SwitchDuration))
	if progress > 1 {
		progress = 1
	}
	ease := progress * progress * (3 - 2*progress) // smoothstep

	if w.switchPhase == SwitchLower {
		offset := ease * SwitchLowerY
		if progress >= 1 {
			// Swap models and start raising.
			if w.Selected >= 0 && w.Selected < len(w.List) {
				w.List[w.Selected].Base.Visible = false
			}
			w.Selected = w.switchNextIndex
			w.List[w.Selected].Base.Visible = true
			w.switchPhase = SwitchRaise
			w.switchStartTime = now
			w.recoilPos = 0
			w.recoilVel = 0
			base.AnimationTime = 0
		}
		return offset
	}

	offset := (1 - ease) * SwitchLowerY
	if progress >= 1 {
		w.switchPhase = SwitchNone
		w.switchNextIndex = -1
	}
	return offset
}

func (w *WeaponSystem) calculateFire(frameTime float32) float32 {
	if !w.firing {
		return 0
	}
	w.firingTimer += frameTime
	if nowMs()-w.firingStart > float64(FireDuration) {
		w.firing = false
	}
	return Oscillate(w.firingTimer, 1000, AmplitudeFire)
}

func (w *WeaponSystem) applyTransforms(entity *scene.MeshEntity, cfg *WeaponConfig, fire, moveH, moveV, idleH, idleV, land, switchOffset float32) {
	if w.Camera == nil {
		return
	}
	w.weaponDir.Copy(&w.Camera.Direction)
	w.weaponPos.Copy(&w.Camera.Position)

	// Avoid the look-at singularity when looking straight up/down.
	if math.Abs(float64(w.weaponDir.Y)) > 0.9999 {
		if w.weaponDir.Y > 0 {
			w.weaponUp.Set(0, 0, 1)
		} else {
			w.weaponUp.Set(0, 0, -1)
		}
	} else {
		w.weaponUp.Set(0, 1, 0)
	}

	m := entity.Base.AniMatrix
	physics.Mat4Identity(m)
	w.lookTarget.Add(&w.weaponPos, &w.weaponDir)
	physics.Mat4LookAt(m, &w.weaponPos, &w.lookTarget, &w.weaponUp)
	physics.Mat4Invert(m, m)

	// Pull the weapon toward the centre on wide screens (50% correction).
	aspect := engine.GetAspectRatio()
	targetFactor := 1.8 / float32(math.Max(1.8, float64(aspect)))
	aspectFactor := 0.5 + targetFactor*0.5

	var offX, offY, offZ float32
	if cfg != nil {
		offX = cfg.OffsetX
		offY = cfg.OffsetY
		offZ = cfg.OffsetZ
	}

	w.translation.Set(
		(WeaponPositionBaseX+offX)*aspectFactor+idleH+moveH,
		WeaponPositionBaseY+offY+idleV+moveV+land+switchOffset,
		WeaponPositionBaseZ+offZ+fire,
	)

	physics.Mat4Translate(m, m, &w.translation)
	physics.Mat4RotateY(m, m, rotY180)
	physics.Mat4RotateX(m, m, rotXNeg2p5)
	physics.Mat4Scale(m, m, &w.scaleVec)
}
