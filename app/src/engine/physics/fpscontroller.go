package physics

import (
	"math"
)

const (
	JumpThreshold     = float32(50.0)
	LandTimeThreshold = float32(0.15)
	MaxVelocityChange = float32(100.0)
	CoyoteTime        = float32(0.2)
	Gravity           = float32(9.82 * 80.0)
	StepHeight        = float32(50.0)
	GroundDecel       = float32(25.0)
	DampXZK           = float32(-3.912023) // math.Log(0.02)
	DampYK            = float32(-0.010050) // math.Log(0.99)
	DampRollK         = float32(-6.907755) // math.Log(0.001)
	NoclipSpeed       = float32(500.0)
)

var (
	_worldUp                 = Vec3{X: 0, Y: 1, Z: 0}
	_fcRightVector           Vec3
	_fcWishDir               Vec3
	_fcNoclipDir             Vec3
	_fcRaycastResult         RaycastResult
	_horizontalCheckHeights  = [3]float32{0, 0.35, -0.35}
	_radialDirs = [8][2]float32{
		{1, 0},
		{-1, 0},
		{0, 1},
		{0, -1},
		{0.70710678, 0.70710678},
		{-0.70710678, 0.70710678},
		{0.70710678, -0.70710678},
		{-0.70710678, -0.70710678},
	}
	_noclip bool
)

// CameraPose aliases the camera vectors the controller writes to (SyncCamera)
// and reads from (noclip).
type CameraPose struct {
	Position  *Vec3
	Direction *Vec3
	Up        *Vec3
}

// ToggleNoclip toggles noclip mode and returns the new state.
func ToggleNoclip() bool {
	_noclip = !_noclip
	return _noclip
}

// SetNoclip sets noclip mode.
func SetNoclip(enabled bool) {
	_noclip = enabled
}

// IsNoclip returns whether noclip mode is enabled.
func IsNoclip() bool {
	return _noclip
}

// FPSControllerConfig specifies tuning parameters for the FPS controller.
type FPSControllerConfig struct {
	Radius             float32
	Height             float32
	EyeHeight          float32
	JumpVelocity       float32
	GroundAcceleration float32
	AirAcceleration    float32
	MaxSpeed           float32
	OnLand             func()
	OnJump             func()
	WobbleFrequency    float32
	WobbleIntensity    float32
}

// DefaultFPSControllerConfig returns default tuning for character physics.
func DefaultFPSControllerConfig() FPSControllerConfig {
	return FPSControllerConfig{
		Radius:             35,
		Height:             60,
		EyeHeight:          56,
		JumpVelocity:       320,
		GroundAcceleration: 4000,
		AirAcceleration:    200,
		MaxSpeed:           360,
		WobbleFrequency:    8,
		WobbleIntensity:    1,
	}
}

// FPSController implements a Quake-style kinematic character controller.
type FPSController struct {
	// Provider supplies static world raycasts; nil means no collision.
	Provider RaycastProvider
	// Camera is the pose SyncCamera drives; nil disables SyncCamera and noclip movement.
	Camera *CameraPose

	Config      FPSControllerConfig
	Position    Vec3
	Velocity    Vec3
	Grounded    bool
	WasGrounded bool
	AirTime     float32
	BobPhase    float32
	CurrentRoll float32

	// Camera smoothing
	SmoothX    float32
	SmoothY    float32
	SmoothZ    float32
	SmoothInit bool
	LandingDip float32
	BobOffsetX float32
	BobOffsetY float32
}

// NewFPSController creates an FPSController at spawnPos with optional configuration.
func NewFPSController(spawnPos *Vec3, config *FPSControllerConfig) *FPSController {
	cfg := DefaultFPSControllerConfig()
	if config != nil {
		if config.Radius != 0 {
			cfg.Radius = config.Radius
		}
		if config.Height != 0 {
			cfg.Height = config.Height
		}
		if config.EyeHeight != 0 {
			cfg.EyeHeight = config.EyeHeight
		}
		if config.JumpVelocity != 0 {
			cfg.JumpVelocity = config.JumpVelocity
		}
		if config.GroundAcceleration != 0 {
			cfg.GroundAcceleration = config.GroundAcceleration
		}
		if config.AirAcceleration != 0 {
			cfg.AirAcceleration = config.AirAcceleration
		}
		if config.MaxSpeed != 0 {
			cfg.MaxSpeed = config.MaxSpeed
		}
		if config.WobbleFrequency != 0 {
			cfg.WobbleFrequency = config.WobbleFrequency
		}
		if config.WobbleIntensity != 0 {
			cfg.WobbleIntensity = config.WobbleIntensity
		}
		cfg.OnLand = config.OnLand
		cfg.OnJump = config.OnJump
	}

	c := &FPSController{
		Config:      cfg,
		WasGrounded: true,
	}

	if spawnPos != nil {
		c.Position.Set(spawnPos.X, spawnPos.Y+cfg.Height*0.5, spawnPos.Z)
	} else {
		c.Position.Set(0, cfg.Height*0.5, 0)
	}

	return c
}

// IsGrounded returns true if the controller is standing on a solid surface.
func (c *FPSController) IsGrounded() bool {
	return c.Grounded
}

// Update simulates fixed-timestep character physics and vertical integration.
func (c *FPSController) Update(frameTime float32) {
	if _noclip {
		return
	}

	c.integratePhysics(frameTime)

	if c.Grounded {
		if !c.WasGrounded && c.AirTime > LandTimeThreshold {
			if c.Config.OnLand != nil {
				c.Config.OnLand()
			}
			dip := c.AirTime * 3.0
			if dip > 8.0 {
				dip = 8.0
			}
			c.LandingDip = dip
		}
		c.AirTime = 0

		dampingFactorXZ := float32(math.Exp(float64(DampXZK * frameTime)))
		c.Velocity.X *= dampingFactorXZ
		c.Velocity.Z *= dampingFactorXZ
	} else {
		c.AirTime += frameTime
	}

	c.WasGrounded = c.Grounded
	c.Velocity.Y *= float32(math.Exp(float64(DampYK * frameTime)))
}

// Move applies player WASD input relative to camera forward and right directions.
func (c *FPSController) Move(strafe, move float32, cameraForward, cameraRight *Vec3, frameTime float32) {
	if _noclip {
		c.noclipMove(strafe, move, cameraForward, cameraRight, frameTime)
		return
	}

	_fcWishDir.Zero()
	_fcWishDir.ScaleAndAdd(&_fcWishDir, cameraForward, move)
	_fcWishDir.ScaleAndAdd(&_fcWishDir, cameraRight, strafe)
	_fcWishDir.Y = 0

	wishDirLen := _fcWishDir.Length()
	if wishDirLen > 0.001 {
		_fcWishDir.Scale(&_fcWishDir, 1.0/wishDirLen)
	}

	cappedLen := wishDirLen
	if cappedLen > 1.0 {
		cappedLen = 1.0
	}
	wishSpeed := c.Config.MaxSpeed * cappedLen

	if c.Grounded {
		c.applyGroundMovement(&_fcWishDir, wishSpeed, frameTime)
	} else {
		c.accelerate(&_fcWishDir, wishSpeed, c.Config.AirAcceleration, frameTime)
	}
}

// Jump triggers a vertical jump impulse if grounded or within coyote time.
func (c *FPSController) Jump() {
	if c.Grounded || c.AirTime < CoyoteTime {
		c.Velocity.Y = c.Config.JumpVelocity
		c.Grounded = false
		if c.Config.OnJump != nil {
			c.Config.OnJump()
		}
		c.AirTime = CoyoteTime
	}
}

func (c *FPSController) applyGroundMovement(wishDir *Vec3, wishSpeed, dt float32) {
	if wishSpeed < 0.1 {
		decelAlpha := 1.0 - float32(math.Exp(float64(-GroundDecel*dt)))
		c.Velocity.X *= (1.0 - decelAlpha)
		c.Velocity.Z *= (1.0 - decelAlpha)
		if c.Velocity.X > -1 && c.Velocity.X < 1 {
			c.Velocity.X = 0
		}
		if c.Velocity.Z > -1 && c.Velocity.Z < 1 {
			c.Velocity.Z = 0
		}
		return
	}
	c.accelerate(wishDir, wishSpeed, c.Config.GroundAcceleration, dt)
}

func (c *FPSController) accelerate(wishDir *Vec3, wishSpeed, acceleration, dt float32) {
	currentSpeed := c.Velocity.X*wishDir.X + c.Velocity.Z*wishDir.Z
	addSpeed := wishSpeed - currentSpeed
	if addSpeed <= 0 {
		return
	}

	accelSpeed := acceleration * dt
	if addSpeed < accelSpeed {
		accelSpeed = addSpeed
	}
	if accelSpeed > MaxVelocityChange {
		accelSpeed = MaxVelocityChange
	}

	c.Velocity.X += wishDir.X * accelSpeed
	c.Velocity.Z += wishDir.Z * accelSpeed
}

func (c *FPSController) integratePhysics(dt float32) {
	c.Velocity.Y -= Gravity * dt
	if c.Velocity.Y < -2000 {
		c.Velocity.Y = -2000
	}

	dx := c.Velocity.X * dt
	dy := c.Velocity.Y * dt
	dz := c.Velocity.Z * dt
	startX := c.Position.X
	startY := c.Position.Y
	startZ := c.Position.Z

	// 1. Resolve horizontal collision using iterative wall sliding
	slideX, slideZ := c.resolveHorizontalCollision(startX, startY, startZ, dx, dz)

	// Skip depenetration when stationary on ground to save raycasts
	absDx := dx
	if absDx < 0 {
		absDx = -absDx
	}
	absDz := dz
	if absDz < 0 {
		absDz = -absDz
	}
	isRestingGrounded := c.Grounded && c.WasGrounded && absDx <= 0.001 && absDz <= 0.001

	if !isRestingGrounded {
		slideX, slideZ = c.resolveDepenetration(slideX, slideZ, startY)
	}

	uncollidedDistSq := dx*dx + dz*dz
	slidDistSq := (slideX-startX)*(slideX-startX) + (slideZ-startZ)*(slideZ-startZ)

	stepped := false
	if c.Grounded && slidDistSq < (uncollidedDistSq-0.1) {
		stepped = c.tryStepClimb(startX, startY, startZ, dx, dz, slideX, slideZ)
	}

	if !stepped {
		c.Position.X = slideX
		c.Position.Z = slideZ
		c.Position.Y = c.resolveGroundCollision(slideX, slideZ, startY, dy)
	}

	c.resolveCeilingCollision(c.Position.X, startY, c.Position.Z)
}

func (c *FPSController) resolveHorizontalCollision(startX, startY, startZ, dx, dz float32) (float32, float32) {
	x := startX
	z := startZ
	curDx := dx
	curDz := dz
	radius := c.Config.Radius

	for iter := 0; iter < 3; iter++ {
		hDistSq := curDx*curDx + curDz*curDz
		if hDistSq <= 0.000001 {
			break
		}
		horizontalDist := float32(math.Sqrt(float64(hDistSq)))

		dirX := curDx / horizontalDist
		dirZ := curDz / horizontalDist
		rayLength := horizontalDist + radius + 2.0

		hitWall := false
		var wallNormalX, wallNormalZ float32
		closestHitDist := float32(math.Inf(1))

		for h := 0; h < 3; h++ {
			checkY := startY + _horizontalCheckHeights[h]*c.Config.Height*0.5
			result := raycastStatic(c.Provider,
				x, checkY, z,
				x+dirX*rayLength, checkY, z+dirZ*rayLength,
				nil, &_fcRaycastResult,
			)

			if result.HasHit {
				hp := &result.HitPointWorld
				hdx := hp.X - x
				hdz := hp.Z - z
				hitDist := float32(math.Sqrt(float64(hdx*hdx + hdz*hdz)))
				if hitDist < closestHitDist {
					closestHitDist = hitDist
					hitWall = true
					wallNormalX = result.HitNormalWorld.X
					wallNormalZ = result.HitNormalWorld.Z
				}
			}
		}

		if hitWall {
			safeMoveDist := closestHitDist - radius - 1.0
			if safeMoveDist < 0 {
				safeMoveDist = 0
			}
			x += dirX * safeMoveDist
			z += dirZ * safeMoveDist

			normLen := float32(math.Sqrt(float64(wallNormalX*wallNormalX + wallNormalZ*wallNormalZ)))
			if normLen > 0.001 {
				nx := wallNormalX / normLen
				nz := wallNormalZ / normLen

				// Slide velocity
				velDot := c.Velocity.X*nx + c.Velocity.Z*nz
				if velDot < 0 {
					c.Velocity.X -= velDot * nx
					c.Velocity.Z -= velDot * nz
				}

				// Slide remaining displacement
				dispDot := curDx*nx + curDz*nz
				if dispDot < 0 {
					curDx -= dispDot * nx
					curDz -= dispDot * nz
				}
			} else {
				break
			}
		} else {
			x += curDx
			z += curDz
			break
		}
	}

	return x, z
}

func (c *FPSController) tryStepClimb(startX, startY, startZ, dx, dz, slideX, slideZ float32) bool {
	savedVelX := c.Velocity.X
	savedVelZ := c.Velocity.Z

	stepUpY := startY + StepHeight

	movedX, movedZ := c.resolveHorizontalCollision(startX, stepUpY, startZ, dx, dz)

	landedY := c.resolveGroundCollision(movedX, movedZ, stepUpY, -StepHeight)

	// A: Check ceiling clearance at elevated position
	ceil1 := raycastStatic(c.Provider,
		movedX, stepUpY, movedZ,
		movedX, stepUpY+c.Config.Height*0.5, movedZ,
		nil, &_fcRaycastResult,
	)
	if ceil1.HasHit {
		c.Velocity.X = savedVelX
		c.Velocity.Z = savedVelZ
		return false
	}

	// B: Check ceiling clearance at landed position
	ceil2 := raycastStatic(c.Provider,
		movedX, landedY, movedZ,
		movedX, landedY+c.Config.Height*0.5, movedZ,
		nil, &_fcRaycastResult,
	)
	if ceil2.HasHit {
		c.Velocity.X = savedVelX
		c.Velocity.Z = savedVelZ
		return false
	}

	finalStepX, finalStepZ := c.resolveDepenetration(movedX, movedZ, landedY)

	slideDistSq := (slideX-startX)*(slideX-startX) + (slideZ-startZ)*(slideZ-startZ)
	stepDistSq := (finalStepX-startX)*(finalStepX-startX) + (finalStepZ-startZ)*(finalStepZ-startZ)

	if c.Grounded && landedY > (startY+1) && stepDistSq > (slideDistSq+0.1) {
		c.Position.X = finalStepX
		c.Position.Z = finalStepZ
		c.Position.Y = landedY
		return true
	}

	c.Velocity.X = savedVelX
	c.Velocity.Z = savedVelZ
	return false
}

func (c *FPSController) resolveDepenetration(x, z, y float32) (float32, float32) {
	radius := c.Config.Radius
	depenRadius := radius + 1.0
	radiusSq := radius * radius
	halfHeight := c.Config.Height * 0.5

	for h := 0; h < 3; h++ {
		checkY := y + _horizontalCheckHeights[h]*halfHeight

		for i := 0; i < 8; i++ {
			dirX := _radialDirs[i][0]
			dirZ := _radialDirs[i][1]
			result := raycastStatic(c.Provider,
				x, checkY, z,
				x+dirX*depenRadius, checkY, z+dirZ*depenRadius,
				nil, &_fcRaycastResult,
			)

			if result.HasHit {
				hp := &result.HitPointWorld
				hdx := hp.X - x
				hdz := hp.Z - z
				hitDistSq := hdx*hdx + hdz*hdz
				if hitDistSq < radiusSq {
					hitDist := float32(math.Sqrt(float64(hitDistSq)))
					pushDist := radius - hitDist + 1.0
					x -= dirX * pushDist
					z -= dirZ * pushDist
				}
			}
		}
	}

	return x, z
}

func (c *FPSController) resolveGroundCollision(finalX, finalZ, startY, dy float32) float32 {
	finalY := startY + dy
	c.Grounded = false

	radius := c.Config.Radius
	groundCheckDist := radius + StepHeight
	checkRadius := radius * 0.8

	rayStartY := startY
	rayEndY := rayStartY - groundCheckDist
	if c.WasGrounded {
		rayStartY += StepHeight * 0.5
		rayEndY -= StepHeight * 0.5
	}

	bestHitY := float32(math.Inf(-1))
	hasGroundHit := false

	for i := -1; i < 4; i++ {
		var ox, oz float32
		if i >= 0 {
			ox = _radialDirs[i][0] * checkRadius
			oz = _radialDirs[i][1] * checkRadius
		}

		result := raycastStatic(c.Provider,
			finalX+ox, rayStartY, finalZ+oz,
			finalX+ox, rayEndY, finalZ+oz,
			nil, &_fcRaycastResult,
		)

		if result.HasHit && result.HitPointWorld.Y > bestHitY {
			bestHitY = result.HitPointWorld.Y
			hasGroundHit = true
		}
	}

	if hasGroundHit && c.Velocity.Y <= JumpThreshold {
		distFromFeet := startY - radius - bestHitY

		snapUp := float32(2.0)
		snapDown := float32(5.0)
		if c.WasGrounded {
			snapUp = StepHeight
			snapDown = StepHeight
		} else if c.Velocity.Y <= 0 {
			snapUp = 20.0
			snapDown = 20.0
		}

		if distFromFeet > -snapUp && distFromFeet < snapDown {
			finalY = bestHitY + radius
			c.Velocity.Y = 0
			c.Grounded = true
		}
	}

	return finalY
}

func (c *FPSController) resolveCeilingCollision(finalX, startY, finalZ float32) {
	if c.Velocity.Y <= 0 {
		return
	}

	radius := c.Config.Radius
	result := raycastStatic(c.Provider,
		finalX, startY, finalZ,
		finalX, startY+radius+10.0, finalZ,
		nil, &_fcRaycastResult,
	)
	if result.HasHit {
		c.Velocity.Y = 0
	}
}

// SyncCamera updates camera smoothing, head bob, and roll on c.Camera.
func (c *FPSController) SyncCamera(frameTime float32) {
	cam := c.Camera
	if cam != nil && cam.Position != nil && cam.Direction != nil && cam.Up != nil {
		c.SyncCameraWith(cam.Position, cam.Direction, cam.Up, frameTime)
	}
}

// SyncCameraWith updates specific camera position, direction, and up-vectors.
func (c *FPSController) SyncCameraWith(camPos, camDir, camUp *Vec3, frameTime float32) {
	if _noclip {
		return
	}

	c.smoothPosition(frameTime)

	hSpeedSq := c.Velocity.X*c.Velocity.X + c.Velocity.Z*c.Velocity.Z
	horizontalSpeed := float32(math.Sqrt(float64(hSpeedSq)))

	c.updateHeadBob(horizontalSpeed, frameTime)

	eyeOffset := c.Config.EyeHeight - c.Config.Height*0.5
	camPos.X = c.SmoothX + c.BobOffsetX
	camPos.Y = c.SmoothY + eyeOffset + c.BobOffsetY - c.LandingDip
	camPos.Z = c.SmoothZ

	c.updateCameraRoll(camDir, camUp, horizontalSpeed, frameTime)
}

func (c *FPSController) smoothPosition(frameTime float32) {
	if !c.SmoothInit {
		c.SmoothX = c.Position.X
		c.SmoothY = c.Position.Y
		c.SmoothZ = c.Position.Z
		c.SmoothInit = true
	}

	alphaY := 1.0 - float32(math.Exp(float64(-25.0*frameTime)))
	alphaXZ := 1.0 - float32(math.Exp(float64(-40.0*frameTime)))

	c.SmoothX += (c.Position.X - c.SmoothX) * alphaXZ
	c.SmoothY += (c.Position.Y - c.SmoothY) * alphaY
	c.SmoothZ += (c.Position.Z - c.SmoothZ) * alphaXZ

	diffX := c.Position.X - c.SmoothX
	if diffX > -0.01 && diffX < 0.01 {
		c.SmoothX = c.Position.X
	}
	diffY := c.Position.Y - c.SmoothY
	if diffY > -0.01 && diffY < 0.01 {
		c.SmoothY = c.Position.Y
	}
	diffZ := c.Position.Z - c.SmoothZ
	if diffZ > -0.01 && diffZ < 0.01 {
		c.SmoothZ = c.Position.Z
	}

	c.LandingDip *= float32(math.Exp(float64(-10.0 * frameTime)))
	if c.LandingDip < 0.01 {
		c.LandingDip = 0
	}
}

func (c *FPSController) updateHeadBob(horizontalSpeed, frameTime float32) {
	if horizontalSpeed > 10 && c.Grounded {
		speedFactor := horizontalSpeed / c.Config.MaxSpeed
		if speedFactor > 1.0 {
			speedFactor = 1.0
		}
		c.BobPhase += speedFactor * c.Config.WobbleFrequency * frameTime
		bobIntensity := c.Config.WobbleIntensity * speedFactor
		c.BobOffsetY = float32(math.Sin(float64(c.BobPhase))) * bobIntensity * 1.5
		c.BobOffsetX = float32(math.Sin(float64(c.BobPhase*2.0))) * bobIntensity * 0.8
	} else {
		bobDecay := float32(math.Exp(float64(-10.0 * frameTime)))
		c.BobOffsetX *= bobDecay
		c.BobOffsetY *= bobDecay
		c.BobPhase *= bobDecay
	}
}

func (c *FPSController) updateCameraRoll(camDir, camUp *Vec3, horizontalSpeed, frameTime float32) {
	targetRoll := float32(0.0)
	if horizontalSpeed > 10 && c.Grounded {
		speedFactor := horizontalSpeed / c.Config.MaxSpeed
		if speedFactor > 1.0 {
			speedFactor = 1.0
		}
		targetRoll = float32(math.Sin(float64(c.BobPhase))) * (c.Config.WobbleIntensity * float32(math.Pi) / 180.0) * speedFactor
	}

	smoothing := 1.0 - float32(math.Exp(float64(DampRollK*frameTime)))
	c.CurrentRoll += (targetRoll - c.CurrentRoll) * smoothing

	_fcRightVector.Cross(camDir, &_worldUp)
	_fcRightVector.Normalize(&_fcRightVector)

	cosRoll := float32(math.Cos(float64(c.CurrentRoll)))
	sinRoll := float32(math.Sin(float64(c.CurrentRoll)))

	camUp.X = _worldUp.X*cosRoll + _fcRightVector.X*sinRoll
	camUp.Y = _worldUp.Y*cosRoll + _fcRightVector.Y*sinRoll
	camUp.Z = _worldUp.Z*cosRoll + _fcRightVector.Z*sinRoll
	camUp.Normalize(camUp)
}

func (c *FPSController) noclipMove(inputX, inputZ float32, _cameraForward, cameraRight *Vec3, frameTime float32) {
	if c.Camera == nil || c.Camera.Direction == nil || c.Camera.Position == nil {
		return
	}
	camPos := c.Camera.Position

	_fcNoclipDir.Zero()
	_fcNoclipDir.ScaleAndAdd(&_fcNoclipDir, c.Camera.Direction, inputZ)
	_fcNoclipDir.ScaleAndAdd(&_fcNoclipDir, cameraRight, inputX)

	noclipLen := _fcNoclipDir.Length()
	if noclipLen > 0.001 {
		_fcNoclipDir.Scale(&_fcNoclipDir, 1.0/noclipLen)
	}

	speed := NoclipSpeed * frameTime
	camPos.X += _fcNoclipDir.X * speed
	camPos.Y += _fcNoclipDir.Y * speed
	camPos.Z += _fcNoclipDir.Z * speed

	c.Position.X = camPos.X
	c.Position.Y = camPos.Y - (c.Config.EyeHeight - c.Config.Height*0.5)
	c.Position.Z = camPos.Z
	c.Velocity.Zero()
}
