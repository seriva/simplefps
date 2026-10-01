package game

import "math"

// ============================================================================
// Game Definitions & Configuration (gamedefs.js)
// ============================================================================

// Oscillate returns cos(pi * time/period) * amplitude: a value swinging
// between -amplitude and +amplitude.
func Oscillate(time, period, amplitude float32) float32 {
	return float32(math.Cos(math.Pi*float64(time/period))) * amplitude
}

// OscillateSin is Oscillate with a sine wave.
func OscillateSin(time, period, amplitude float32) float32 {
	return float32(math.Sin(math.Pi*float64(time/period))) * amplitude
}

// ToRadian converts degrees to radians.
func ToRadian(deg float32) float32 {
	return deg * float32(math.Pi) / 180
}

// ToDegree converts radians to degrees.
func ToDegree(rad float32) float32 {
	return rad * 180 / float32(math.Pi)
}

// ----------------------------------------------------------------------------
// Player
// ----------------------------------------------------------------------------

const (
	PlayerDefaultHealth = 100
	PlayerDefaultArmor  = 0
	PlayerDefaultAmmo   = 50
	PlayerMaxHealth     = 100
	PlayerMaxArmor      = 100
	PlayerMaxAmmo       = 100
)

// ----------------------------------------------------------------------------
// Weapons
// ----------------------------------------------------------------------------

// Weapon indices (order of the FPS mesh list).
const (
	WeaponGrenadeLauncher = 0
	WeaponEnergyScepter   = 1
	WeaponLaserGatling    = 2
	WeaponPlasmaPistol    = 3
	WeaponPulseCannon     = 4
	WeaponCount           = 5
)

// WeaponConfig describes one weapon's view model.
type WeaponConfig struct {
	Mesh       string
	Index      int
	PickupType string
	// View-model position offset relative to WeaponPositionBase.
	OffsetX, OffsetY, OffsetZ float32
}

// WeaponConfigs is ordered by Index.
var WeaponConfigs = []WeaponConfig{
	WeaponConfig{Mesh: "meshes/grenade_launcher/grenade_launcher.bmesh", Index: WeaponGrenadeLauncher, PickupType: "grenade_launcher"},
	WeaponConfig{Mesh: "meshes/energy_scepter/energy_sceptre.bmesh", Index: WeaponEnergyScepter, PickupType: "energy_scepter"},
	WeaponConfig{Mesh: "meshes/laser_gatling/laser_gatling.bmesh", Index: WeaponLaserGatling, PickupType: "laser_gatling", OffsetY: -0.05},
	WeaponConfig{Mesh: "meshes/plasma_pistol/plasma_pistol.bmesh", Index: WeaponPlasmaPistol, PickupType: "plasma_pistol"},
	WeaponConfig{Mesh: "meshes/pulse_cannon/pulse_cannon.bmesh", Index: WeaponPulseCannon, PickupType: "pulse_cannon"},
}

// WeaponIndexByType maps a pickup type name to its weapon index, or -1.
func WeaponIndexByType(pickupType string) int {
	for i := 0; i < len(WeaponConfigs); i++ {
		if WeaponConfigs[i].PickupType == pickupType {
			return WeaponConfigs[i].Index
		}
	}
	return -1
}

// IsWeaponType reports whether the pickup type names a weapon.
func IsWeaponType(pickupType string) bool {
	return WeaponIndexByType(pickupType) >= 0
}

// Projectile configuration (PROJECTILE_CONFIG).
const (
	ProjectileMesh           = "meshes/ball.mesh"
	ProjectileMeshScale      = float32(33)
	ProjectileVelocity       = float32(1200)
	ProjectileBarrelOffset   = float32(8) // units right of centre, matches the barrel
	ProjectileLightRadius    = float32(110)
	ProjectileLightIntensity = float32(4)
)

// ProjectileLightColor is the projectile glow colour.
var ProjectileLightColor = []float32{0.988, 0.31, 0.051}

// Explosion configuration (EXPLOSION_CONFIG).
const (
	ExplosionTexture    = "meshes/explosion.webp"
	ExplosionGridSize   = 4
	ExplosionFrameCount = 16
	ExplosionDuration   = float32(450)
	ExplosionScale      = float32(80)
	SparkTexture        = "meshes/spark.webp"
)

// View-model base transform.
const (
	WeaponPositionBaseX = float32(0.19)
	WeaponPositionBaseY = float32(-0.25)
	WeaponPositionBaseZ = float32(-0.45)
	WeaponScaleBaseX    = float32(1.05)
	WeaponScaleBaseY    = float32(1.05)
	WeaponScaleBaseZ    = float32(0.7) // squash depth to hide backfaces
)

// Weapon animation tuning (ANIMATION_CONFIG).
const (
	FireDuration            = float32(500) // ms recoil animation
	FireCooldown            = float32(900) // ms between shots
	HorizontalPeriod        = float32(350)
	VerticalPeriod          = float32(300)
	IdlePeriodHorizontal    = float32(1500)
	IdlePeriodVertical      = float32(1400)
	AmplitudeFire           = float32(0.12)
	AmplitudeHorizontalMove = float32(0.0125)
	AmplitudeVerticalMove   = float32(0.002)
	AmplitudeIdleHorizontal = float32(0.005)
	AmplitudeIdleVertical   = float32(0.01)
	MovementFadeSpeed       = float32(0.005)
	LandSpringStiffness     = float32(60)
	LandSpringDamping       = float32(8)
	LandImpulse             = float32(-0.6)
	JumpImpulse             = float32(0.35)
	SwitchDuration          = float32(150)  // ms per phase (lower or raise)
	SwitchLowerY            = float32(-0.4) // units to lower the weapon
)

// ----------------------------------------------------------------------------
// Pickups
// ----------------------------------------------------------------------------

// PickupDef describes a pickup's visuals.
type PickupDef struct {
	MeshName     string
	LightColor   []float32
	Scale        float32 // relative to PickupScale
	YOffset      float32 // relative to PickupScale; used when HasYOffset
	HasYOffset   bool
	HasSpotlight bool
}

// PickupDefs maps pickup type -> definition (PICKUP_MAP_BASE + weapons).
var PickupDefs = buildPickupDefs()

func buildPickupDefs() map[string]*PickupDef {
	defs := map[string]*PickupDef{
		"health": &PickupDef{MeshName: "meshes/health/health.bmesh", LightColor: []float32{1.0, 0.1, 0.1}, Scale: 1, YOffset: 0.01, HasYOffset: true},
		"armor":  &PickupDef{MeshName: "meshes/armor/armor.bmesh", LightColor: []float32{0, 0.352, 0.662}, Scale: 1, YOffset: 0.01, HasYOffset: true},
		"ammo":   &PickupDef{MeshName: "meshes/ammo/ammo.bmesh", LightColor: []float32{0.623, 0.486, 0.133}, Scale: 1, YOffset: 0.01, HasYOffset: true},
	}
	for i := 0; i < len(WeaponConfigs); i++ {
		w := WeaponConfigs[i]
		defs[w.PickupType] = &PickupDef{
			MeshName:     w.Mesh,
			LightColor:   []float32{1, 1, 1},
			Scale:        1.4,
			HasSpotlight: true,
		}
	}
	return defs
}

// PickupAmount returns the stat bonus for a consumable pickup type.
func PickupAmount(pickupType string) int {
	return 25
}

// Pickup constants (PICKUP_CONSTANTS).
const (
	PickupRadius             = float32(60)
	PickupRespawnTime        = float64(5000) // ms
	PickupScale              = float32(35)
	PickupRotationSpeed      = float32(1000)
	PickupBobbingAmplitude   = float32(2.5)
	PickupLightIntensity     = float32(3.0)
	PickupSpotlightIntensity = float32(0.6)
	PickupSpotlightAngle     = float32(30)
)

// ----------------------------------------------------------------------------
// Arena
// ----------------------------------------------------------------------------

const (
	ArenaNPCMesh        = "models/robot/robot.sbmesh"
	ArenaNPCAnim        = "models/robot/robot.banim"
	ArenaNPCScale       = float32(0.035)
	ArenaNPCMatrixScale = float32(10)
)

// ----------------------------------------------------------------------------
// Multiplayer
// ----------------------------------------------------------------------------

const (
	// NetUpdateIntervalMs throttles position packets to 30 Hz.
	NetUpdateIntervalMs = float64(1000.0 / 30.0)
	// HostPlayerID is the host's id inside STATE packets.
	HostPlayerID = "host"

	RemotePlayerMesh  = "meshes/ball.mesh"
	RemotePlayerScale = float32(33) // same size as the grenade projectile
	// RemotePlayerLerpDecay smooths remote positions (~0.1 s lag at 60 fps).
	RemotePlayerLerpDecay = float32(15)
)
