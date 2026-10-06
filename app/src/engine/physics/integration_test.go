package physics

import (
	"testing"

	"../collision"
	"../mathx"
	"js:./interop.d.ts"
)

// gridFloor builds an n×n quad grid at height y spanning [0, size] on X and Z,
// wound CCW when viewed from +Y (normal +Y).
func gridFloor(n int, size, y float32) *collision.Trimesh {
	verts := make([]float32, 0, (n+1)*(n+1)*3)
	idx := make([]int32, 0, n*n*6)
	step := size / float32(n)
	for zi := 0; zi <= n; zi++ {
		for xi := 0; xi <= n; xi++ {
			verts = append(verts, float32(xi)*step, y, float32(zi)*step)
		}
	}
	row := int32(n + 1)
	for zi := 0; zi < n; zi++ {
		for xi := 0; xi < n; xi++ {
			a := int32(zi)*row + int32(xi)
			b := a + 1
			c := a + row
			d := c + 1
			idx = append(idx, a, c, d, a, d, b)
		}
	}
	return collision.NewTrimesh(verts, idx, nil)
}

// wallX appends a vertical wall at x spanning z∈[z0,z1], y∈[y0,y1], facing -X.
func wallX(tm *collision.Trimesh, x, z0, z1, y0, y1 float32) {
	verts := []float32{
		x, y0, z0,
		x, y1, z0,
		x, y1, z1,
		x, y0, z1,
	}
	idx := []int32{0, 2, 1, 0, 3, 2}
	tm.AddMesh(verts, idx, nil)
}

// trimeshRaycaster is a RaycastProvider over a single mesh using one reused
// collision.Ray so the provider itself does not allocate.
type trimeshRaycaster struct {
	tm  *collision.Trimesh
	ray *collision.Ray
}

func newTrimeshRaycaster(tm *collision.Trimesh) *trimeshRaycaster {
	ray := collision.NewRay(nil, nil)
	ray.Mode = collision.RayModeClosest
	return &trimeshRaycaster{tm: tm, ray: ray}
}

func (p *trimeshRaycaster) RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ float32, options *collision.RayOptions) *collision.RaycastResult {
	ray := p.ray
	ray.From.Set(fromX, fromY, fromZ)
	ray.To.Set(toX, toY, toZ)
	ray.UpdateDirection()
	ray.HasHit = false
	ray.Result.Reset()
	ray.SkipBackfaces = options != nil && options.SkipBackfaces
	ray.IntersectTrimesh(p.tm, nil)
	return &ray.Result
}

func TestFPSControllerLandsOnTrimesh(t *testing.T) {
	tm := gridFloor(8, 1600, 0)

	spawn := mathx.Vec3{X: 800, Y: 200, Z: 800}
	ctrl := NewFPSController(&spawn, nil)
	ctrl.Provider = newTrimeshRaycaster(tm)
	dt := float32(1.0 / 120.0)
	for i := 0; i < 600; i++ {
		ctrl.Update(dt)
	}
	if !ctrl.IsGrounded() {
		t.Fatal("Controller should be grounded after falling onto the floor")
	}
	// Feet rest on the floor: center = floor + radius.
	if !floatApprox(ctrl.Position.Y, ctrl.Config.Radius) {
		t.Errorf("Expected Y = radius (%f), got %f", ctrl.Config.Radius, ctrl.Position.Y)
	}
	if ctrl.Velocity.Y != 0 {
		t.Errorf("Expected zero vertical velocity when grounded, got %f", ctrl.Velocity.Y)
	}
}

func TestFPSControllerBlockedByWall(t *testing.T) {
	tm := collision.NewEmptyTrimesh()
	floor := gridFloor(4, 1600, 0)
	tm.AddMesh(floor.Vertices, floor.Indices, nil)
	// Tall wall at x = 1000 across the whole floor.
	wallX(tm, 1000, -100, 1700, -10, 400)
	tm.Finalize()

	spawn := mathx.Vec3{X: 800, Y: 0, Z: 800}
	ctrl := NewFPSController(&spawn, nil)
	ctrl.Provider = newTrimeshRaycaster(tm)
	ctrl.Grounded = true
	ctrl.WasGrounded = true

	camFwd := mathx.Vec3{X: 1, Y: 0, Z: 0}
	camRight := mathx.Vec3{X: 0, Y: 0, Z: -1}
	dt := float32(1.0 / 120.0)
	for i := 0; i < 240; i++ {
		ctrl.Move(0, 1, &camFwd, &camRight, dt)
		ctrl.Update(dt)
	}
	// Two seconds at MaxSpeed would travel ~720 units; the wall must stop us.
	if ctrl.Position.X > 1000-ctrl.Config.Radius+1 {
		t.Errorf("Controller penetrated wall: X = %f", ctrl.Position.X)
	}
	if ctrl.Position.X < 900 {
		t.Errorf("Controller should have approached the wall, X = %f", ctrl.Position.X)
	}
	if !ctrl.IsGrounded() {
		t.Error("Controller should remain grounded while sliding along the wall")
	}
}

func TestFPSControllerClimbsStep(t *testing.T) {
	// The lowest horizontal wall probe sits at radius - 0.35*height/2 = 24.5
	// above the feet, so a 20-unit riser is not treated as a wall and the
	// grounded snap (up to StepHeight) lifts the controller onto the platform.
	const stepY = float32(20)
	tm := collision.NewEmptyTrimesh()
	low := gridFloor(4, 800, 0)
	tm.AddMesh(low.Vertices, low.Indices, nil)
	// Raised platform from x = 800 onward.
	high := gridFloor(4, 800, stepY)
	for i := 0; i < len(high.Vertices); i += 3 {
		high.Vertices[i] += 800
	}
	tm.AddMesh(high.Vertices, high.Indices, nil)
	// Riser between the two levels.
	wallX(tm, 800, -100, 900, 0, stepY)
	tm.Finalize()

	spawn := mathx.Vec3{X: 600, Y: 0, Z: 400}
	ctrl := NewFPSController(&spawn, nil)
	ctrl.Provider = newTrimeshRaycaster(tm)
	ctrl.Grounded = true
	ctrl.WasGrounded = true

	camFwd := mathx.Vec3{X: 1, Y: 0, Z: 0}
	camRight := mathx.Vec3{X: 0, Y: 0, Z: -1}
	dt := float32(1.0 / 120.0)
	// ~1.5 s at MaxSpeed covers ~540 units: well past the riser at x = 800 but
	// short of the platform's far edge at x = 1600.
	for i := 0; i < 180; i++ {
		ctrl.Move(0, 1, &camFwd, &camRight, dt)
		ctrl.Update(dt)
	}
	if ctrl.Position.X < 900 {
		t.Errorf("Controller should have climbed onto the platform, X = %f", ctrl.Position.X)
	}
	if !floatApprox(ctrl.Position.Y, stepY+ctrl.Config.Radius) {
		t.Errorf("Expected Y = %f + radius, got %f", stepY, ctrl.Position.Y)
	}
	if !ctrl.IsGrounded() {
		t.Error("Controller should be grounded on the platform")
	}
}

// heapUsed returns the V8 heap size, or -1 when unavailable.
func heapUsed() int {
	if process == nil || process.memoryUsage == nil {
		return -1
	}
	return process.memoryUsage().heapUsed.(int)
}

func TestPhysicsStepDoesNotAllocate(t *testing.T) {
	if heapUsed() < 0 {
		t.Skip("process.memoryUsage unavailable")
	}
	// jsdom adds ~2 KB/step of unrelated churn to the heap counter; the budget
	// is only meaningful in the headless harness.
	if document != nil {
		t.Skip("heap measurement is only stable without --dom")
	}
	tm := gridFloor(16, 1600, 0)

	spawn := mathx.Vec3{X: 800, Y: 0, Z: 800}
	ctrl := NewFPSController(&spawn, nil)
	ctrl.Provider = newTrimeshRaycaster(tm)
	camFwd := mathx.Vec3{X: 0.7071, Y: 0, Z: 0.7071}
	camRight := mathx.Vec3{X: 0.7071, Y: 0, Z: -0.7071}
	dt := float32(1.0 / 120.0)

	step := func(n int) {
		for i := 0; i < n; i++ {
			ctrl.Move(0.3, 1, &camFwd, &camRight, dt)
			ctrl.Update(dt)
			if ctrl.Position.X > 1400 || ctrl.Position.Z > 1400 {
				ctrl.Position.X = 200
				ctrl.Position.Z = 200
			}
		}
	}
	step(600) // warm up JIT and settle onto the floor

	const trials = 7
	const stepsPerTrial = 2000
	deltas := make([]int, trials)
	for tr := 0; tr < trials; tr++ {
		before := heapUsed()
		step(stepsPerTrial)
		deltas[tr] = heapUsed() - before
	}
	// Median is robust to a GC landing inside one trial.
	for i := 1; i < trials; i++ {
		for j := i; j > 0 && deltas[j] < deltas[j-1]; j-- {
			deltas[j], deltas[j-1] = deltas[j-1], deltas[j]
		}
	}
	median := deltas[trials/2]
	// The whole step path (controller, raycasts, octree traversal, triangle
	// tests) must be allocation-free; allow slack for V8 bookkeeping only.
	const budget = 256 * 1024
	if median > budget {
		t.Errorf("Physics steps allocate: median heap delta %d bytes over %d steps (budget %d)", median, stepsPerTrial, budget)
	}
}
