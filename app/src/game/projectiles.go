package game

import (
	"math"
	"math/rand"

	"../engine/assets"
	"../engine/physics"
	"../engine/scene"
	"../engine/systems"
)

// Projectile trajectory constants (_TRAJECTORY).
const (
	ProjectileSpeed    = float32(900)   // fallback units/s
	ProjectileGravity  = float32(300)   // arc curvature
	ProjectileLifetime = float32(15000) // ms
)

// Projectile is one live grenade: its mesh, glow light and physics body.
type Projectile struct {
	Entity    *scene.MeshEntity
	Light     *scene.PointLightEntity
	Body      *physics.DynamicBody
	Elapsed   float32 // ms
	MeshScale float32
}

// ProjectileSystem fires grenades from the camera and steps them on the fixed
// physics tick (projectiles.js). Explosions spawn a light flash, billboard
// cluster and spark emitter.
type ProjectileSystem struct {
	Scene  *scene.Scene
	Camera *systems.Camera

	active []*Projectile
	count  int

	// Scratch, to keep the per-tick path allocation-free.
	right    physics.Vec3
	spawnPos physics.Vec3
	velocity physics.Vec3
	scaleVec physics.Vec3
	worldUp  physics.Vec3
}

// NewProjectileSystem creates an empty system bound to a scene and camera.
func NewProjectileSystem(s *scene.Scene, camera *systems.Camera) *ProjectileSystem {
	ps := &ProjectileSystem{
		Scene:  s,
		Camera: camera,
		active: make([]*Projectile, 16),
	}
	ps.worldUp.Set(0, 1, 0)
	return ps
}

// Count returns the number of live projectiles.
func (ps *ProjectileSystem) Count() int {
	return ps.count
}

// Fire spawns a projectile in front of the camera, offset to the barrel.
func (ps *ProjectileSystem) Fire() *Projectile {
	if ps.Camera == nil {
		return nil
	}
	p := &ps.Camera.Position
	d := &ps.Camera.Direction

	// Right vector for the barrel offset.
	ps.right.Cross(d, &ps.worldUp)
	ps.right.Normalize(&ps.right)

	// Spawn well in front of the camera to avoid nearby geometry.
	ps.spawnPos.Set(
		p.X+d.X*30+ps.right.X*ProjectileBarrelOffset,
		p.Y+d.Y*30-5,
		p.Z+d.Z*30+ps.right.Z*ProjectileBarrelOffset,
	)

	proj := &Projectile{MeshScale: ProjectileMeshScale}
	proj.Entity = scene.NewMeshEntity(scene.TypeMesh, nil, assets.GlobalResources.GetMesh(ProjectileMesh), nil, 1)

	ps.velocity.Scale(d, ProjectileVelocity)
	proj.Body = physics.NewDynamicBody(&ps.spawnPos, &physics.DynamicBodyConfig{
		Velocity:       &ps.velocity,
		Gravity:        ProjectileGravity,
		Restitution:    0.6,
		Radius:         3.0,
		MinBounceSpeed: 50,
	})
	if ps.Scene != nil {
		proj.Body.Provider = ps.Scene
	}

	proj.Light = scene.NewPointLightEntity(nil, ProjectileLightRadius, ProjectileLightColor, ProjectileLightIntensity, nil)

	// Place the visuals at the spawn point immediately.
	ps.applyTransform(proj)

	ps.add(proj)
	if ps.Scene != nil {
		ps.Scene.AddEntity(proj.Entity)
		ps.Scene.AddEntity(proj.Light)
	}
	return proj
}

func (ps *ProjectileSystem) add(p *Projectile) {
	if ps.count < len(ps.active) {
		ps.active[ps.count] = p
	} else {
		ps.active = append(ps.active, p)
	}
	ps.count++
}

func (ps *ProjectileSystem) removeAt(i int) {
	p := ps.active[i]
	ps.count--
	ps.active[i] = ps.active[ps.count]
	ps.active[ps.count] = nil
	if ps.Scene != nil {
		ps.Scene.RemoveEntity(p.Light)
		ps.Scene.RemoveEntity(p.Entity)
	}
}

func (ps *ProjectileSystem) applyTransform(p *Projectile) {
	pos := &p.Body.Position
	physics.Mat4FromTranslation(p.Entity.Base.AniMatrix, pos)
	ps.scaleVec.Set(p.MeshScale, p.MeshScale, p.MeshScale)
	physics.Mat4Scale(p.Entity.Base.AniMatrix, p.Entity.Base.AniMatrix, &ps.scaleVec)
	physics.Mat4FromTranslation(p.Light.Base.AniMatrix, pos)
}

// Update advances every projectile by fixedDt seconds. Projectiles explode
// when they come to rest or exceed their lifetime.
func (ps *ProjectileSystem) Update(fixedDt float32) {
	fixedDtMs := fixedDt * 1000
	for i := ps.count - 1; i >= 0; i-- {
		p := ps.active[i]
		p.Elapsed += fixedDtMs

		if p.Elapsed > ProjectileLifetime {
			ps.SpawnExplosion(&p.Body.Position)
			ps.removeAt(i)
			continue
		}

		p.Body.Update(fixedDtMs)

		if p.Body.IsResting {
			ps.SpawnExplosion(&p.Body.Position)
			ps.removeAt(i)
			continue
		}

		ps.applyTransform(p)
	}
}

// Reset removes all live projectiles without exploding them.
func (ps *ProjectileSystem) Reset() {
	for i := ps.count - 1; i >= 0; i-- {
		ps.removeAt(i)
	}
}

// SpawnExplosion adds a flash light, a billboard cluster and sparks at position.
func (ps *ProjectileSystem) SpawnExplosion(position *physics.Vec3) {
	if ps.Scene == nil {
		return
	}

	// 1. Point light flash, pulled slightly off the surface.
	flashPos := physics.NewVec3(position.X, position.Y, position.Z+10)
	flash := scene.NewPointLightEntity(flashPos, ExplosionScale*4.5, []float32{1.0, 0.5, 0.1}, 8, func(e scene.Entity, frameTime float32) bool {
		light := e.(*scene.PointLightEntity)
		light.Intensity -= (frameTime / 180) * 8 // decay over ~180ms
		return light.Intensity > 0
	})
	ps.Scene.AddEntity(flash)

	// 2. Billboard cluster scattered within a 22-unit radius.
	explosionTex := assets.GlobalResources.GetTexture(ExplosionTexture)
	for i := 0; i < 4; i++ {
		clusterPos := physics.NewVec3(
			position.X+(rand.Float32()-0.5)*22,
			position.Y+(rand.Float32()-0.5)*22,
			position.Z+(rand.Float32()-0.5)*22,
		)
		ps.Scene.AddEntity(scene.NewAnimatedBillboardEntity(clusterPos, &scene.BillboardConfig{
			Texture:    explosionTex,
			Duration:   ExplosionDuration,
			GridSize:   ExplosionGridSize,
			FrameCount: ExplosionFrameCount,
			Scale:      ExplosionScale * (0.8 + rand.Float32()*0.4),
			Rotation:   rand.Float32() * float32(math.Pi) * 2,
			TimeOffset: -rand.Float32() * 100,
			ScaleFn:    explosionScaleFn,
			OpacityFn:  explosionOpacityFn,
		}))
	}

	// 3. Flying sparks.
	emitter := scene.NewParticleEmitterEntity(assets.GlobalResources.GetTexture(SparkTexture), sparkScaleFn, sparkOpacityFn)
	sparkCount := 15 + rand.Intn(10)
	sparkVel := &physics.Vec3{}
	for i := 0; i < sparkCount; i++ {
		sparkVel.Set(
			(rand.Float32()-0.5)*1000,
			(rand.Float32()-0.5)*1000+400, // biased upwards
			(rand.Float32()-0.5)*1000,
		)
		emitter.AddParticle(position, sparkVel, 300+rand.Float32()*500, 1.0, 600.0, 0)
	}
	ps.Scene.AddEntity(emitter)

	assets.GlobalResources.Play("sounds/explosion.sfx")
}

func explosionScaleFn(progress float32) float32 {
	inv := 1.0 - progress
	ease := 1.0 - inv*inv*inv
	return 0.2 + 0.8*ease // pop outward
}

func explosionOpacityFn(progress float32) float32 {
	const fadeStart = float32(0.7)
	if progress < fadeStart {
		return 1.0
	}
	return 1.0 - (progress-fadeStart)/(1.0-fadeStart)
}

func sparkScaleFn(progress float32) float32 {
	return 20.0 * (1.0 - progress*progress*progress)
}

func sparkOpacityFn(progress float32) float32 {
	return 1.0 - progress
}
