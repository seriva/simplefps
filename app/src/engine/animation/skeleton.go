//gofront:target wasm
package animation

import (
	"math"

	"../mathx"
	"gofront/shared"
	"gofront/simd"
)

// MaxSkinJoints is the largest palette ComputeSkinningMatrices publishes; it must
// match the renderer's bone-ring slot (rendering.MaxJoints).
const MaxSkinJoints = 64

// SkinMatrices receives the result of the last ComputeSkinningMatrices call,
// 16 floats per joint, and is read from JS without copying.
var SkinMatrices = shared.NewFloat32(MaxSkinJoints * 16)

// Packed scratch matrices for the skinning chain (wasm package state; never
// visible to JS): [0] = local joint matrix, [1] = skin matrix. A slice
// rather than `var x mat4c` because GoFront 1.7.0 zero-initialises a
// package-level struct with F32x4 fields using an i32 constant, which fails
// WebAssembly validation; make() initialises v128 fields correctly.
var _scratchC = make([]mat4c, 2)

// skeletonPack holds one skeleton's matrices packed as F32x4 columns:
// invBindC mirrors InverseBindMatrices, worldC holds the last computed world
// matrices. GoFront 1.7.0 classifies every field of an exported wasm struct
// for the JS↔WASM boundary, unexported ones included, and F32x4 cannot cross
// it, so Skeleton refers to its pack by index into _packs instead of holding
// the slices itself. Packs live as long as the module (one per NewSkeleton,
// i.e. per loaded skinned mesh).
type skeletonPack struct {
	invBindC []mat4c
	worldC   []mat4c
}

var _packs []*skeletonPack

// JointDef is the raw joint description from a mesh file: object-space
// (global) bind pose position and rotation plus a parent index (-1 = root).
type JointDef struct {
	Name   string
	Parent int
	Pos    []float32 // x, y, z
	Rot    []float32 // x, y, z, w
}

// Joint is a skeleton joint with its precomputed local bind transform.
type Joint struct {
	Name           string
	Parent         int
	Index          int
	BindPoseMatrix mathx.Mat4
	LocalBindPos   mathx.Vec3
	LocalBindRot   mathx.Quat
}

// Skeleton owns joint hierarchy data and scratch matrices for posing.
//
// The skinning chain runs on packed F32x4 columns (mat4c) held in
// _packs[pack]. worldMatrices is the []mathx.Mat4 view of the packed world
// matrices, filled only by GetWorldMatrices (the debug path).
type Skeleton struct {
	Joints              []Joint
	JointCount          int
	InverseBindMatrices []mathx.Mat4

	worldMatrices []mathx.Mat4
	tempMatrix    mathx.Mat4
	pack          int
}

// NewSkeleton converts global-space joint definitions into a skeleton with
// local bind transforms and inverse bind matrices for skinning.
func NewSkeleton(defs []JointDef) *Skeleton {
	n := len(defs)
	s := &Skeleton{
		Joints:              make([]Joint, n),
		JointCount:          n,
		InverseBindMatrices: make([]mathx.Mat4, n),
		worldMatrices:       make([]mathx.Mat4, n),
		tempMatrix:          mathx.NewMat4(),
	}
	pack := &skeletonPack{
		invBindC: make([]mat4c, n),
		worldC:   make([]mat4c, n),
	}
	s.pack = len(_packs)
	_packs = append(_packs, pack)

	globalMatrices := make([]mathx.Mat4, n)
	localMatrix := mathx.NewMat4()
	parentInverse := mathx.NewMat4()
	q := &mathx.Quat{}
	v := &mathx.Vec3{}

	for i := 0; i < n; i++ {
		d := &defs[i]
		j := &s.Joints[i]
		j.Name = d.Name
		j.Parent = d.Parent
		j.Index = i

		q.Set(d.Rot[0], d.Rot[1], d.Rot[2], d.Rot[3])
		v.Set(d.Pos[0], d.Pos[1], d.Pos[2])
		global := mathx.NewMat4()
		mathx.Mat4FromRotationTranslation(global, q, v)
		globalMatrices[i] = global
		j.BindPoseMatrix = global

		if d.Parent >= 0 {
			mathx.Mat4Invert(parentInverse, globalMatrices[d.Parent])
			mathx.Mat4Multiply(localMatrix, parentInverse, global)
		} else {
			mathx.Mat4Copy(localMatrix, global)
		}

		mathx.Mat4GetTranslation(&j.LocalBindPos, localMatrix)
		mathx.Mat4GetRotation(&j.LocalBindRot, localMatrix)
		j.LocalBindRot.Normalize(&j.LocalBindRot)

		inv := mathx.NewMat4()
		mathx.Mat4Invert(inv, global)
		s.InverseBindMatrices[i] = inv
		fromMat4(&pack.invBindC[i], inv)

		s.worldMatrices[i] = mathx.NewMat4()
	}
	return s
}

// computeWorldMatrices writes each joint's world matrix from a local pose
// into its pack's worldC, chaining packed columns with mulMat4c (bit-identical to the
// mathx.Mat4Multiply chain).
func (s *Skeleton) computeWorldMatrices(pose *Pose) {
	local := &_scratchC[0]
	worldC := _packs[s.pack].worldC
	positions := pose.Positions
	rotations := pose.Rotations

	for i := 0; i < s.JointCount; i++ {
		pi := i * 3
		ri := i * 4

		qx := rotations[ri]
		qy := rotations[ri+1]
		qz := rotations[ri+2]
		qw := rotations[ri+3]
		x2 := qx + qx
		y2 := qy + qy
		z2 := qz + qz
		xx := qx * x2
		xy := qx * y2
		xz := qx * z2
		yy := qy * y2
		yz := qy * z2
		zz := qz * z2
		wx := qw * x2
		wy := qw * y2
		wz := qw * z2

		local.c0 = simd.NewF32x4(1-(yy+zz), xy+wz, xz-wy, 0)
		local.c1 = simd.NewF32x4(xy-wz, 1-(xx+zz), yz+wx, 0)
		local.c2 = simd.NewF32x4(xz+wy, yz-wx, 1-(xx+yy), 0)
		local.c3 = simd.NewF32x4(positions[pi], positions[pi+1], positions[pi+2], 1)

		world := &worldC[i]
		parent := s.Joints[i].Parent
		if parent >= 0 {
			mulMat4c(world, &worldC[parent], local)
		} else {
			world.c0 = local.c0
			world.c1 = local.c1
			world.c2 = local.c2
			world.c3 = local.c3
		}
	}
}

// GetWorldMatrices returns per-joint world matrices for a pose. The returned
// slice is owned by the skeleton and overwritten on the next call. The
// packed world matrices are unpacked into it only here, so the per-frame
// skinning path never pays for the copy.
func (s *Skeleton) GetWorldMatrices(pose *Pose) []mathx.Mat4 {
	s.computeWorldMatrices(pose)
	worldC := _packs[s.pack].worldC
	for i := 0; i < s.JointCount; i++ {
		toMat4(s.worldMatrices[i], &worldC[i])
	}
	return s.worldMatrices
}

// ComputeSkinningMatrices writes world * inverseBind per joint into
// SkinMatrices (overwritten on the next call, by any skeleton) and returns the
// number of joints written (at most MaxSkinJoints).
func (s *Skeleton) ComputeSkinningMatrices(pose *Pose) int {
	s.computeWorldMatrices(pose)
	n := s.JointCount
	if n > MaxSkinJoints {
		n = MaxSkinJoints
	}
	pack := _packs[s.pack]
	skin := s.tempMatrix
	for i := 0; i < n; i++ {
		mulMat4c(&_scratchC[1], &pack.worldC[i], &pack.invBindC[i])
		toMat4(skin, &_scratchC[1])
		base := i * 16
		for k := 0; k < 16; k++ {
			SkinMatrices[base+k] = skin[k]
		}
	}
	return n
}

// Pose stores flat per-joint local positions (3 floats) and rotations (4 floats).
type Pose struct {
	JointCount int
	Positions  []float32
	Rotations  []float32
}

// NewPose allocates a pose with identity rotations.
func NewPose(jointCount int) *Pose {
	p := &Pose{
		JointCount: jointCount,
		Positions:  make([]float32, jointCount*3),
		Rotations:  make([]float32, jointCount*4),
	}
	for i := 0; i < jointCount; i++ {
		p.Rotations[i*4+3] = 1
	}
	return p
}

// NewPosesFromFrames builds numFrames poses from a flat per-frame, per-joint
// stream of pos(3) rot(4) floats, as stored in the .anim format.
func NewPosesFromFrames(frames []float32, numFrames, numJoints int) []*Pose {
	poses := make([]*Pose, numFrames)
	off := 0
	for f := 0; f < numFrames; f++ {
		p := NewPose(numJoints)
		for j := 0; j < numJoints; j++ {
			if off+7 > len(frames) {
				break
			}
			p.SetJointTransform(j, frames[off], frames[off+1], frames[off+2],
				frames[off+3], frames[off+4], frames[off+5], frames[off+6])
			off += 7
		}
		poses[f] = p
	}
	return poses
}

// SetJointTransform writes one joint's local position and rotation.
func (p *Pose) SetJointTransform(index int, px, py, pz, rx, ry, rz, rw float32) {
	pi := index * 3
	ri := index * 4
	p.Positions[pi] = px
	p.Positions[pi+1] = py
	p.Positions[pi+2] = pz
	p.Rotations[ri] = rx
	p.Rotations[ri+1] = ry
	p.Rotations[ri+2] = rz
	p.Rotations[ri+3] = rw
}

// SetBindPose resets the pose to the skeleton's local bind transforms.
func (p *Pose) SetBindPose(s *Skeleton) {
	for i := 0; i < s.JointCount; i++ {
		j := &s.Joints[i]
		p.SetJointTransform(i, j.LocalBindPos.X, j.LocalBindPos.Y, j.LocalBindPos.Z,
			j.LocalBindRot.X, j.LocalBindRot.Y, j.LocalBindRot.Z, j.LocalBindRot.W)
	}
}

// CopyFrom copies another pose's transforms into this one.
func (p *Pose) CopyFrom(other *Pose) {
	pos := other.Positions
	rot := other.Rotations
	for i := 0; i < len(pos); i++ {
		p.Positions[i] = pos[i]
	}
	for i := 0; i < len(rot); i++ {
		p.Rotations[i] = rot[i]
	}
}

// PoseLerp blends two poses into out: linear positions, slerp rotations.
func PoseLerp(out, a, b *Pose, t float32) {
	outPos := out.Positions
	outRot := out.Rotations
	aPos := a.Positions
	aRot := a.Rotations
	bPos := b.Positions
	bRot := b.Rotations

	for i := 0; i < out.JointCount; i++ {
		pi := i * 3
		ri := i * 4

		outPos[pi] = aPos[pi] + (bPos[pi]-aPos[pi])*t
		outPos[pi+1] = aPos[pi+1] + (bPos[pi+1]-aPos[pi+1])*t
		outPos[pi+2] = aPos[pi+2] + (bPos[pi+2]-aPos[pi+2])*t

		ax := aRot[ri]
		ay := aRot[ri+1]
		az := aRot[ri+2]
		aw := aRot[ri+3]
		bx := bRot[ri]
		by := bRot[ri+1]
		bz := bRot[ri+2]
		bw := bRot[ri+3]

		dot := ax*bx + ay*by + az*bz + aw*bw
		if dot < 0 {
			dot = -dot
			bx = -bx
			by = -by
			bz = -bz
			bw = -bw
		}

		var s0, s1 float32
		if 1.0-dot > 0.000001 {
			omega := math.Acos(float64(dot))
			sinOmega := math.Sin(omega)
			s0 = float32(math.Sin(float64(1-t)*omega) / sinOmega)
			s1 = float32(math.Sin(float64(t)*omega) / sinOmega)
		} else {
			s0 = 1 - t
			s1 = t
		}

		outRot[ri] = s0*ax + s1*bx
		outRot[ri+1] = s0*ay + s1*by
		outRot[ri+2] = s0*az + s1*bz
		outRot[ri+3] = s0*aw + s1*bw
	}
}
