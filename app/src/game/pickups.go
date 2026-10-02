package game

import (
	"strconv"

	"../engine/assets"
	"../engine/physics"
	"../engine/scene"
	"../engine/systems"
)

// Derived pickup constants (pickups.js).
const (
	pickupRespawnAnimationDuration = float64(500) // ms
	pickupLightRadius              = 1.8 * PickupScale
	pickupSpotlightOffsetY         = 2.5 * PickupScale
	pickupSpotlightRange           = 3.5 * PickupScale
	pickupOffsetY                  = 0.15 * PickupScale
)

// Pickup is one collectable placed in the arena.
type Pickup struct {
	Type     string
	Position physics.Vec3
	Entities []scene.Entity

	Collected             bool
	RespawnAt             float64 // ms timestamp
	RespawnAnimationStart float64 // ms timestamp, 0 when idle
	SpawnScale            float32 // 0..1 grow-in after respawn
}

// PickupSystem creates pickups and handles collection/respawn.
type PickupSystem struct {
	Player *PlayerState

	// OnWeaponCollected fires when a weapon pickup is taken.
	OnWeaponCollected func(pickupType string)
	// IsWeaponUnlocked gates weapon pickups (nil = always collectable).
	IsWeaponUnlocked func(index int) bool

	active []*Pickup

	// Scratch.
	upAxis   physics.Vec3
	bob      physics.Vec3
	scaleVec physics.Vec3
	center   physics.Vec3
}

// NewPickupSystem creates an empty pickup system for player.
func NewPickupSystem(player *PlayerState) *PickupSystem {
	ps := &PickupSystem{
		Player: player,
		active: make([]*Pickup, 0),
	}
	ps.upAxis.Set(0, 1, 0)
	return ps
}

// Pickups returns the live pickups.
func (ps *PickupSystem) Pickups() []*Pickup {
	return ps.active
}

// Reset forgets all pickups (entities are owned by the scene).
func (ps *PickupSystem) Reset() {
	ps.active = make([]*Pickup, 0)
}

// updateEntity writes the spin/bob/spawn-scale animation into e's AniMatrix.
func (ps *PickupSystem) updateEntity(p *Pickup, base *scene.EntityBase, frameTime, amplitude float32, rotate bool) {
	base.AnimationTime += frameTime
	m := base.AniMatrix
	physics.Mat4Identity(m)
	if rotate {
		physics.Mat4FromRotation(m, base.AnimationTime/PickupRotationSpeed, &ps.upAxis)
	}
	ps.bob.Set(0, Oscillate(base.AnimationTime, PickupRotationSpeed, amplitude), 0)
	physics.Mat4Translate(m, m, &ps.bob)
	ps.scaleVec.Set(p.SpawnScale, p.SpawnScale, p.SpawnScale)
	physics.Mat4Scale(m, m, &ps.scaleVec)
}

// CreatePickup builds the entities for a pickup of the given type at pos and
// tracks it for collection. Returns nil for unknown types. The caller adds
// the returned entities to the scene.
func (ps *PickupSystem) CreatePickup(pickupType string, pos *physics.Vec3) []scene.Entity {
	def, ok := PickupDefs[pickupType]
	if !ok {
		systems.GlobalConsole.Error("[Pickup] Invalid pickup type: " + pickupType)
		return nil
	}

	hoverHeight := pickupOffsetY
	if def.HasYOffset {
		hoverHeight = def.YOffset * PickupScale
	}
	meshScale := def.Scale * PickupScale

	p := &Pickup{Type: pickupType, SpawnScale: 1}
	p.Position.Copy(pos)

	mesh := assets.GlobalResources.GetMesh(def.MeshName)
	meshEntity := scene.NewMeshEntity(scene.TypeMesh, physics.NewVec3(pos.X, pos.Y+hoverHeight, pos.Z), mesh,
		func(e scene.Entity, frameTime float32) bool {
			ps.updateEntity(p, e.GetBase(), frameTime, PickupBobbingAmplitude/PickupScale, true)
			return true
		}, meshScale)
	meshEntity.Base.CastShadow = true

	entities := make([]scene.Entity, 0)
	entities = append(entities, meshEntity)

	if def.HasSpotlight {
		spotBaseY := pos.Y + pickupSpotlightOffsetY
		px := pos.X
		pz := pos.Z
		spot := scene.NewSpotLightEntity(
			physics.NewVec3(px, spotBaseY, pz),
			physics.NewVec3(0, -1, 0),
			def.LightColor,
			PickupSpotlightIntensity,
			PickupSpotlightAngle,
			pickupSpotlightRange,
			func(e scene.Entity, frameTime float32) bool {
				b := e.GetBase()
				b.AnimationTime += frameTime
				offset := Oscillate(b.AnimationTime, PickupRotationSpeed, PickupBobbingAmplitude)
				e.(*scene.SpotLightEntity).SetPosition(px, spotBaseY+offset, pz)
				return true
			})
		entities = append(entities, spot)
	} else {
		var lightOffsetX, lightOffsetZ float32
		if mesh != nil && mesh.BoundingBox != nil {
			mesh.BoundingBox.Center(&ps.center)
			lightOffsetX = ps.center.X * meshScale
			lightOffsetZ = ps.center.Z * meshScale
		} else {
			systems.GlobalConsole.Warn("[Pickup] Mesh bounding box not available for " + pickupType + ", using default light position")
		}
		light := scene.NewPointLightEntity(
			physics.NewVec3(pos.X+lightOffsetX, pos.Y+hoverHeight, pos.Z+lightOffsetZ),
			pickupLightRadius,
			def.LightColor,
			PickupLightIntensity,
			func(e scene.Entity, frameTime float32) bool {
				ps.updateEntity(p, e.GetBase(), frameTime, PickupBobbingAmplitude, false)
				return true
			})
		entities = append(entities, light)
	}

	p.Entities = entities
	ps.active = append(ps.active, p)
	return entities
}

// CanPickup reports whether the player benefits from the pickup type.
func (ps *PickupSystem) CanPickup(pickupType string) bool {
	switch pickupType {
	case "health":
		return ps.Player.Health < PlayerMaxHealth
	case "armor":
		return ps.Player.Armor < PlayerMaxArmor
	case "ammo":
		return ps.Player.Ammo < PlayerMaxAmmo
	}
	if idx := WeaponIndexByType(pickupType); idx >= 0 && ps.IsWeaponUnlocked != nil {
		return !ps.IsWeaponUnlocked(idx)
	}
	return true
}

// Apply grants the pickup's effect to the player.
func (ps *PickupSystem) Apply(pickupType string) {
	amount := PickupAmount(pickupType)
	if IsWeaponType(pickupType) {
		systems.GlobalConsole.Log("[Pickup] Collected: " + pickupType)
	} else {
		systems.GlobalConsole.Log("[Pickup] Collected: " + pickupType + " +" + strconv.Itoa(amount))
	}
	switch pickupType {
	case "health":
		ps.Player.AddHealth(amount)
	case "armor":
		ps.Player.AddArmor(amount)
	case "ammo":
		ps.Player.AddAmmo(amount)
	default:
		if IsWeaponType(pickupType) && ps.OnWeaponCollected != nil {
			ps.OnWeaponCollected(pickupType)
		}
	}
}

// Update handles respawns, the grow-in animation and collection against the
// player position.
func (ps *PickupSystem) Update(playerPos *physics.Vec3) {
	ps.UpdateAt(playerPos, nowMs())
}

// UpdateAt is Update with an explicit clock (ms).
func (ps *PickupSystem) UpdateAt(playerPos *physics.Vec3, now float64) {
	for i := 0; i < len(ps.active); i++ {
		p := ps.active[i]

		if p.Collected {
			if now >= p.RespawnAt {
				p.Collected = false
				p.RespawnAnimationStart = now
				p.SpawnScale = 0
				setVisible(p.Entities, true)
			}
			continue
		}

		if p.RespawnAnimationStart > 0 {
			progress := (now - p.RespawnAnimationStart) / pickupRespawnAnimationDuration
			if progress >= 1 {
				p.RespawnAnimationStart = 0
				p.SpawnScale = 1
			} else {
				t := float32(progress) - 1
				p.SpawnScale = t*t*t + 1 // cubic ease-out
			}
		}

		dx := playerPos.X - p.Position.X
		dy := playerPos.Y - p.Position.Y
		dz := playerPos.Z - p.Position.Z
		if dx*dx+dy*dy+dz*dz < PickupRadius*PickupRadius && ps.CanPickup(p.Type) {
			ps.Apply(p.Type)
			p.Collected = true
			p.RespawnAt = now + PickupRespawnTime
			setVisible(p.Entities, false)
		}
	}
}

func setVisible(entities []scene.Entity, visible bool) {
	for i := 0; i < len(entities); i++ {
		entities[i].GetBase().Visible = visible
	}
}
