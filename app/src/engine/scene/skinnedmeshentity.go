package scene

import (
	"../animation"
	"../mathx"
	"../rendering"
)

var (
	skinnedTempMatrix = mathx.NewMat4()
	skinnedLocalBB    = mathx.NewBoundingBox()
	skinnedBBMin      = &mathx.Vec3{}
	skinnedBBMax      = &mathx.Vec3{}
	skinnedJointPos   = &mathx.Vec3{}
	skeletonColor     = []float32{0, 1, 0, 1}
)

// SkinnedMeshEntity renders a GPU-skinned mesh driven by an AnimationPlayer.
type SkinnedMeshEntity struct {
	Base            EntityBase
	Mesh            *rendering.SkinnedMesh
	Skeleton        *animation.Skeleton
	AnimationPlayer *animation.AnimationPlayer
	Scale           float32

	// Shadow and Probe are refreshed by the Scene for visible entities;
	// mutate their fields in place.
	Shadow shadowState
	Probe  probeCache

	boneMatrices []float32
	skeletonMesh *rendering.Mesh
}

// NewSkinnedMeshEntity creates a skinned entity; skeleton may be nil (renders nothing).
func NewSkinnedMeshEntity(position *mathx.Vec3, mesh *rendering.SkinnedMesh, skeleton *animation.Skeleton, update UpdateCallback, scale float32) *SkinnedMeshEntity {
	e := &SkinnedMeshEntity{Mesh: mesh, Skeleton: skeleton, Scale: scale}
	initBase(&e.Base, TypeSkinnedMesh, update)
	e.Base.CastShadow = false
	if position != nil {
		mathx.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	meshScaleVec.Set(scale, scale, scale)
	mathx.Mat4Scale(e.Base.BaseMatrix, e.Base.BaseMatrix, meshScaleVec)

	if skeleton != nil {
		e.AnimationPlayer = animation.NewAnimationPlayer(skeleton)
		e.boneMatrices = make([]float32, rendering.MaxJoints*16)
	}
	return e
}

func (e *SkinnedMeshEntity) GetBase() *EntityBase { return &e.Base }

// PlayAnimation starts anim on the player (no-op without a skeleton).
func (e *SkinnedMeshEntity) PlayAnimation(anim *animation.Animation, reset bool) {
	if e.AnimationPlayer == nil || anim == nil {
		return
	}
	e.AnimationPlayer.Play(anim, reset)
}

// StopAnimation resets the player to the bind pose.
func (e *SkinnedMeshEntity) StopAnimation() {
	if e.AnimationPlayer != nil {
		e.AnimationPlayer.Stop()
	}
}

// BoneMatrices exposes the flat skinning matrix buffer uploaded each frame.
func (e *SkinnedMeshEntity) BoneMatrices() []float32 { return e.boneMatrices }

func (e *SkinnedMeshEntity) Update(frameTime float32) bool {
	if !e.Base.Visible {
		return true
	}
	if e.AnimationPlayer != nil && e.Skeleton != nil {
		pose := e.AnimationPlayer.Update(frameTime / 1000)
		n := e.Skeleton.ComputeSkinningMatrices(pose) * 16
		if n > len(e.boneMatrices) {
			n = len(e.boneMatrices)
		}
		for k := 0; k < n; k++ {
			e.boneMatrices[k] = animation.SkinMatrices[k]
		}
	}
	keep := baseUpdate(e, frameTime)
	e.UpdateBoundingVolume()
	return keep
}

func (e *SkinnedMeshEntity) Draw(r *rendering.Renderer, mode rendering.MaterialMode) {
	if e.boneMatrices == nil || e.Mesh == nil {
		return
	}
	mathx.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.NextObject()
	r.ObjectWorld(skinnedTempMatrix)
	setObjectProbe(r, &e.Probe)
	r.ObjectBones(e.boneMatrices)
	e.Mesh.Draw(r, true, mode, true)
}

func (e *SkinnedMeshEntity) DrawShadow(r *rendering.Renderer) {
	if e.boneMatrices == nil || !e.Base.CastShadow || e.Mesh == nil {
		return
	}
	if e.Shadow.HeightState != ShadowHeightValid {
		return
	}
	mathx.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	amb := r.Ambient()
	r.NextObject()
	r.ObjectWorld(skinnedTempMatrix)
	r.ObjectProbe(amb[0], amb[1], amb[2], e.Shadow.Height)
	r.ObjectBones(e.boneMatrices)
	e.Mesh.Draw(r, false, rendering.ModeAll, true)
}

// DrawWireframe draws the animated wireframe with the skinned debug
// pipeline, restoring the debug pipeline afterwards.
func (e *SkinnedMeshEntity) DrawWireframe(r *rendering.Renderer) {
	if e.boneMatrices == nil || e.Mesh == nil {
		return
	}
	mathx.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.SetPipeline(r.Pipelines.SkinnedDebug)
	r.NextObject()
	r.ObjectWorld(skinnedTempMatrix)
	r.ObjectParamsVec(0, r.DebugColor())
	r.ObjectBones(e.boneMatrices)
	e.Mesh.DrawWireframe(r, true)
	r.SetPipeline(r.Pipelines.Debug)
}

func (e *SkinnedMeshEntity) Simulate(r *rendering.Renderer, pass rendering.GPUComputePassEncoder) {}

func (e *SkinnedMeshEntity) Bounds() *mathx.BoundingBox { return e.Base.BoundingBox }
func (e *SkinnedMeshEntity) CastsShadow() bool            { return e.Base.CastShadow }

func (e *SkinnedMeshEntity) TriangleCount() int {
	if e.Mesh == nil {
		return 0
	}
	return e.Mesh.BaseMesh.TriangleCount
}

func (e *SkinnedMeshEntity) initSkeletonMesh(b *rendering.Backend) {
	if e.skeletonMesh != nil || e.Skeleton == nil {
		return
	}
	count := 0
	for i := 0; i < e.Skeleton.JointCount; i++ {
		if e.Skeleton.Joints[i].Parent >= 0 {
			count++
		}
	}
	indices := make([]uint32, count*2)
	c := 0
	for i := 0; i < e.Skeleton.JointCount; i++ {
		p := e.Skeleton.Joints[i].Parent
		if p >= 0 {
			indices[c] = uint32(p)
			indices[c+1] = uint32(i)
			c += 2
		}
	}
	vertices := make([]float32, e.Skeleton.JointCount*3)
	groups := []rendering.IndexGroup{rendering.IndexGroup{Material: "none", Array: indices}}
	e.skeletonMesh = rendering.NewMesh(b, vertices, nil, nil, nil, groups)
}

// DrawSkeleton draws joint-to-parent lines in the current pose with the
// debug pipeline (green).
func (e *SkinnedMeshEntity) DrawSkeleton(r *rendering.Renderer) {
	if e.Skeleton == nil || e.AnimationPlayer == nil {
		return
	}
	e.initSkeletonMesh(r.Backend)
	if e.skeletonMesh == nil {
		return
	}
	world := e.Skeleton.GetWorldMatrices(e.AnimationPlayer.GetPose())
	verts := e.skeletonMesh.Vertices
	for i := 0; i < e.Skeleton.JointCount; i++ {
		mathx.Mat4GetTranslation(skinnedJointPos, world[i])
		verts[i*3] = skinnedJointPos.X
		verts[i*3+1] = skinnedJointPos.Y
		verts[i*3+2] = skinnedJointPos.Z
	}
	e.skeletonMesh.UpdateVertexBuffer(verts)

	mathx.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	r.NextObject()
	r.ObjectWorld(skinnedTempMatrix)
	r.ObjectParamsVec(0, skeletonColor)
	e.skeletonMesh.Draw(r, false, rendering.ModeAll)
}

// UpdateBoundingVolume uses the animation's per-frame bounds when available,
// else the mesh AABB.
func (e *SkinnedMeshEntity) UpdateBoundingVolume() {
	if e.AnimationPlayer == nil {
		return
	}
	mathx.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	bounds := e.AnimationPlayer.GetCurrentBounds()
	if bounds != nil {
		skinnedBBMin.Set(bounds.Min[0], bounds.Min[1], bounds.Min[2])
		skinnedBBMax.Set(bounds.Max[0], bounds.Max[1], bounds.Max[2])
		skinnedLocalBB.Set(skinnedBBMin, skinnedBBMax)
	} else if e.Mesh != nil && e.Mesh.BaseMesh.BoundingBox != nil {
		skinnedLocalBB.Set(&e.Mesh.BaseMesh.BoundingBox.Min, &e.Mesh.BaseMesh.BoundingBox.Max)
	} else {
		e.Base.BoundingBox = nil
		return
	}
	if e.Base.BoundingBox == nil {
		e.Base.BoundingBox = mathx.NewBoundingBox()
	}
	skinnedLocalBB.TransformInto(skinnedTempMatrix, e.Base.BoundingBox)
}

// IsPlaying reports whether an animation is running.
func (e *SkinnedMeshEntity) IsPlaying() bool {
	return e.AnimationPlayer != nil && e.AnimationPlayer.IsPlaying()
}

// GetAnimationProgress returns 0..1 progress of the current clip.
func (e *SkinnedMeshEntity) GetAnimationProgress() float32 {
	if e.AnimationPlayer == nil {
		return 0
	}
	return e.AnimationPlayer.GetProgress()
}

// SetAnimationSpeed sets the playback rate multiplier.
func (e *SkinnedMeshEntity) SetAnimationSpeed(speed float32) {
	if e.AnimationPlayer != nil {
		e.AnimationPlayer.Speed = speed
	}
}

// SetAnimationLoop toggles looping playback.
func (e *SkinnedMeshEntity) SetAnimationLoop(loop bool) {
	if e.AnimationPlayer != nil {
		e.AnimationPlayer.Loop = loop
	}
}

func (e *SkinnedMeshEntity) Dispose() {
	baseDispose(&e.Base)
	e.AnimationPlayer = nil
	e.boneMatrices = nil
	e.Mesh = nil
	if e.skeletonMesh != nil {
		e.skeletonMesh.Dispose()
		e.skeletonMesh = nil
	}
}
