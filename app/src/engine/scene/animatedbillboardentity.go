package scene

import (
	"math"

	"../physics"
	"../rendering"
)

// ProgressFunc maps normalised lifetime progress (0..1) to a modifier.
type ProgressFunc func(progress float32) float32

// BillboardConfig configures an AnimatedBillboardEntity.
type BillboardConfig struct {
	Texture    *rendering.Texture
	Duration   float32 // ms (default 1000)
	GridSize   int     // sprite sheet columns/rows (default 1)
	FrameCount int     // frames in the sheet (default 1)
	Scale      float32 // world size (default 1)
	TimeOffset float32 // ms, negative delays start
	Rotation   float32 // radians, in-plane
	ScaleFn    ProgressFunc
	OpacityFn  ProgressFunc
}

var (
	bbTempMatrix  = physics.NewMat4()
	bbWorldPos    = &physics.Vec3{}
	bbBoxMin      = &physics.Vec3{}
	bbBoxMax      = &physics.Vec3{}
	bbFrameOffset = make([]float32, 2)
	bbFrameScale  = make([]float32, 2)
)

// AnimatedBillboardEntity is a camera-facing sprite-sheet quad with a finite lifetime.
// The camera view matrix is provided by the Scene through CameraView.
type AnimatedBillboardEntity struct {
	Base       EntityBase
	CameraView physics.Mat4

	time       float32
	duration   float32
	gridSize   int
	frameCount int
	scale      float32
	cosR       float32
	sinR       float32
	texture    *rendering.Texture
	scaleFn    ProgressFunc
	opacityFn  ProgressFunc
}

// NewAnimatedBillboardEntity creates a billboard at position.
func NewAnimatedBillboardEntity(position *physics.Vec3, cfg *BillboardConfig) *AnimatedBillboardEntity {
	e := &AnimatedBillboardEntity{
		duration:   1000,
		gridSize:   1,
		frameCount: 1,
		scale:      1,
	}
	initBase(&e.Base, TypeAnimatedBillboard, nil)
	rotation := float32(0)
	if cfg != nil {
		e.texture = cfg.Texture
		if cfg.Duration > 0 {
			e.duration = cfg.Duration
		}
		if cfg.GridSize > 0 {
			e.gridSize = cfg.GridSize
		}
		if cfg.FrameCount > 0 {
			e.frameCount = cfg.FrameCount
		}
		if cfg.Scale > 0 {
			e.scale = cfg.Scale
		}
		e.time = cfg.TimeOffset
		e.scaleFn = cfg.ScaleFn
		e.opacityFn = cfg.OpacityFn
		rotation = cfg.Rotation
	}
	e.cosR = float32(math.Cos(float64(rotation)))
	e.sinR = float32(math.Sin(float64(rotation)))
	if position != nil {
		physics.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	e.UpdateBoundingVolume()
	return e
}

func (e *AnimatedBillboardEntity) GetBase() *EntityBase { return &e.Base }

// Update advances the lifetime; returns false once the duration has elapsed.
func (e *AnimatedBillboardEntity) Update(frameTime float32) bool {
	e.time += frameTime
	baseUpdate(e, frameTime)
	return e.time < e.duration
}

// Time returns the elapsed lifetime in ms.
func (e *AnimatedBillboardEntity) Time() float32 { return e.time }

// Draw draws the billboard with the bound billboard shader.
func (e *AnimatedBillboardEntity) Draw(r *rendering.Renderer, sh *rendering.Shader, mode string) {
	quad := r.Shapes.BillboardQuad
	if e.texture == nil || e.time <= 0 || sh == nil || quad == nil {
		return
	}
	progress := e.time / e.duration
	if progress > 1 {
		progress = 1
	}
	frameIndex := int(progress * float32(e.frameCount))
	if frameIndex > e.frameCount-1 {
		frameIndex = e.frameCount - 1
	}
	cellSize := float32(1) / float32(e.gridSize)
	col := frameIndex % e.gridSize
	row := frameIndex / e.gridSize
	opacity := float32(1)
	if e.opacityFn != nil {
		opacity = e.opacityFn(progress)
	}
	scale := e.scale
	if e.scaleFn != nil {
		scale *= e.scaleFn(progress)
	}

	physics.Mat4Multiply(bbTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	physics.Mat4GetTranslation(bbWorldPos, bbTempMatrix)

	var rx, ry, rz, ux, uy, uz float32
	if e.CameraView != nil {
		v := e.CameraView
		rx = v[0]
		ry = v[4]
		rz = v[8]
		ux = v[1]
		uy = v[5]
		uz = v[9]
	} else {
		rx = 1
		uy = 1
	}
	c := e.cosR
	ss := e.sinR
	lrx := rx*c + ux*ss
	lry := ry*c + uy*ss
	lrz := rz*c + uz*ss
	lux := -rx*ss + ux*c
	luy := -ry*ss + uy*c
	luz := -rz*ss + uz*c

	physics.Mat4Set(bbTempMatrix,
		lrx*scale, lry*scale, lrz*scale, 0,
		lux*scale, luy*scale, luz*scale, 0,
		0, 0, 0, 0,
		bbWorldPos.X, bbWorldPos.Y, bbWorldPos.Z, 1)

	sh.SetMat4("matWorld", bbTempMatrix)
	bbFrameOffset[0] = float32(col) * cellSize
	bbFrameOffset[1] = float32(row) * cellSize
	sh.SetVec2("uFrameOffset", bbFrameOffset)
	bbFrameScale[0] = cellSize
	bbFrameScale[1] = cellSize
	sh.SetVec2("uFrameScale", bbFrameScale)
	sh.SetFloat("uOpacity", opacity)

	e.texture.Bind(0)
	quad.RenderSingle(false, "triangles", "all", sh)
	rendering.UnbindTextureRange(r.Backend, 0, 1)
}

func (e *AnimatedBillboardEntity) DrawShadow(r *rendering.Renderer, sh *rendering.Shader)    {}
func (e *AnimatedBillboardEntity) DrawWireframe(r *rendering.Renderer, sh *rendering.Shader) {}
func (e *AnimatedBillboardEntity) DrawSkeleton(r *rendering.Renderer, sh *rendering.Shader)  {}
func (e *AnimatedBillboardEntity) Bounds() *physics.BoundingBox                             { return e.Base.BoundingBox }
func (e *AnimatedBillboardEntity) TriangleCount() int                                       { return 0 }
func (e *AnimatedBillboardEntity) CastsShadow() bool                                        { return false }

// UpdateBoundingVolume uses the maximum scale as a bounding radius.
func (e *AnimatedBillboardEntity) UpdateBoundingVolume() {
	r := e.scale
	physics.Mat4Multiply(bbTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	physics.Mat4GetTranslation(bbWorldPos, bbTempMatrix)
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = physics.NewBoundingBox()
	}
	bbBoxMin.Set(bbWorldPos.X-r, bbWorldPos.Y-r, bbWorldPos.Z-r)
	bbBoxMax.Set(bbWorldPos.X+r, bbWorldPos.Y+r, bbWorldPos.Z+r)
	e.Base.BoundingBox.Set(bbBoxMin, bbBoxMax)
}

func (e *AnimatedBillboardEntity) Dispose() {
	baseDispose(&e.Base)
	e.texture = nil
}
