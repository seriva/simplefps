package scene

import (
	"../animation"
	"../physics"
	"../rendering"
)

var (
	skinnedTempMatrix = physics.NewMat4()
	skinnedLocalBB    = physics.NewBoundingBox()
	skinnedBBMin      = &physics.Vec3{}
	skinnedBBMax      = &physics.Vec3{}
	skinnedJointPos   = &physics.Vec3{}
	debugWhite        = []float32{1, 1, 1, 1}
	debugGreen        = []float32{0, 1, 0, 1}
)

// SkinnedMeshEntity renders a GPU-skinned mesh driven by an AnimationPlayer.
type SkinnedMeshEntity struct {
	Base            EntityBase
	Mesh            *rendering.SkinnedMesh
	Skeleton        *animation.Skeleton
	AnimationPlayer *animation.AnimationPlayer
	Scale           float32

	boneMatrices []float32
	skeletonMesh *rendering.Mesh
}

// NewSkinnedMeshEntity creates a skinned entity; skeleton may be nil (renders nothing).
func NewSkinnedMeshEntity(position *physics.Vec3, mesh *rendering.SkinnedMesh, skeleton *animation.Skeleton, update UpdateCallback, scale float32) *SkinnedMeshEntity {
	e := &SkinnedMeshEntity{Mesh: mesh, Skeleton: skeleton, Scale: scale}
	initBase(&e.Base, TypeSkinnedMesh, update)
	e.Base.CastShadow = false
	if mesh != nil {
		e.Base.TriangleCount = mesh.BaseMesh.TriangleCount
	}
	if position != nil {
		physics.Mat4Translate(e.Base.BaseMatrix, e.Base.BaseMatrix, position)
	}
	meshScaleVec.Set(scale, scale, scale)
	physics.Mat4Scale(e.Base.BaseMatrix, e.Base.BaseMatrix, meshScaleVec)

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
		skin := e.Skeleton.ComputeSkinningMatrices(pose)
		n := len(skin)
		if n > rendering.MaxJoints {
			n = rendering.MaxJoints
		}
		for j := 0; j < n; j++ {
			m := skin[j]
			base := j * 16
			for k := 0; k < 16; k++ {
				e.boneMatrices[base+k] = m[k]
			}
		}
	}
	return baseUpdate(e, frameTime)
}

func (e *SkinnedMeshEntity) Render(probeColor []float32, renderMode string, shader *rendering.Shader) {
	if !e.Base.Visible || e.boneMatrices == nil || e.Mesh == nil || shader == nil {
		return
	}
	physics.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	shader.SetVec3("uProbeColor", probeColor)
	shader.SetMat4("matWorld", skinnedTempMatrix)
	shader.SetMat4Array("boneMatrices", e.boneMatrices)
	e.Mesh.RenderSingle(true, "triangles", renderMode, shader, true)
}

func (e *SkinnedMeshEntity) RenderShadow(renderMode string, shader *rendering.Shader) {
	if !e.Base.Visible || e.boneMatrices == nil || !e.Base.CastShadow || e.Mesh == nil || shader == nil {
		return
	}
	if e.Base.ShadowHeightState != ShadowHeightValid {
		return
	}
	physics.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	shader.SetMat4("matWorld", skinnedTempMatrix)
	shader.SetFloat("shadowHeight", e.Base.ShadowHeight)
	shader.SetMat4Array("boneMatrices", e.boneMatrices)
	e.Mesh.RenderSingle(false, "triangles", renderMode, shader, true)
}

// RenderWireFrame draws the animated wireframe via the skinnedDebug shader,
// falling back to the bind pose with the plain debug shader.
func (e *SkinnedMeshEntity) RenderWireFrame() {
	if !e.Base.Visible || e.boneMatrices == nil || e.Mesh == nil {
		return
	}
	physics.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	sd := rendering.Shaders.SkinnedDebug
	if sd == nil {
		if rendering.Shaders.Debug == nil {
			return
		}
		rendering.Shaders.Debug.SetMat4("matWorld", skinnedTempMatrix)
		e.Mesh.RenderWireframe(false)
		return
	}
	sd.Bind()
	sd.SetMat4("matWorld", skinnedTempMatrix)
	sd.SetMat4Array("boneMatrices", e.boneMatrices)
	sd.SetVec4("debugColor", debugWhite)
	e.Mesh.RenderWireframe(true)
	if rendering.Shaders.Debug != nil {
		rendering.Shaders.Debug.Bind()
	}
}

func (e *SkinnedMeshEntity) initSkeletonMesh() {
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
	e.skeletonMesh = rendering.NewMesh(vertices, nil, nil, nil, groups)
}

// RenderSkeleton draws joint-to-parent lines in the current pose (debug shader, green).
func (e *SkinnedMeshEntity) RenderSkeleton() {
	if !e.Base.Visible || e.Skeleton == nil || e.AnimationPlayer == nil || rendering.Shaders.Debug == nil {
		return
	}
	e.initSkeletonMesh()
	if e.skeletonMesh == nil {
		return
	}
	world := e.Skeleton.GetWorldMatrices(e.AnimationPlayer.GetPose())
	verts := e.skeletonMesh.Vertices
	for i := 0; i < e.Skeleton.JointCount; i++ {
		physics.Mat4GetTranslation(skinnedJointPos, world[i])
		verts[i*3] = skinnedJointPos.X
		verts[i*3+1] = skinnedJointPos.Y
		verts[i*3+2] = skinnedJointPos.Z
	}
	e.skeletonMesh.UpdateVertexBuffer(verts)

	physics.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
	sh := rendering.Shaders.Debug
	sh.Bind()
	sh.SetMat4("matWorld", skinnedTempMatrix)
	sh.SetVec4("debugColor", debugGreen)
	e.skeletonMesh.RenderSingle(false, "lines", "all", sh)
}

// UpdateBoundingVolume uses the animation's per-frame bounds when available,
// else the mesh AABB.
func (e *SkinnedMeshEntity) UpdateBoundingVolume() {
	if e.AnimationPlayer == nil {
		return
	}
	physics.Mat4Multiply(skinnedTempMatrix, e.Base.BaseMatrix, e.Base.AniMatrix)
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
		e.Base.BoundingBox = physics.NewBoundingBox()
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
