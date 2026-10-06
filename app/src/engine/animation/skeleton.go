package animation

import (
	"math"

	"../mathx"

)

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
type Skeleton struct {
	Joints              []Joint
	JointCount          int
	InverseBindMatrices []mathx.Mat4

	worldMatrices []mathx.Mat4
	skinMatrices  []mathx.Mat4
	tempMatrix    mathx.Mat4
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
		skinMatrices:        make([]mathx.Mat4, n),
		tempMatrix:          mathx.NewMat4(),
	}

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

		s.worldMatrices[i] = mathx.NewMat4()
		s.skinMatrices[i] = mathx.NewMat4()
	}
	return s
}

// computeWorldMatrices writes each joint's world matrix from a local pose.
func (s *Skeleton) computeWorldMatrices(pose *Pose) []mathx.Mat4 {
	local := s.tempMatrix
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

		local[0] = 1 - (yy + zz)
		local[1] = xy + wz
		local[2] = xz - wy
		local[3] = 0
		local[4] = xy - wz
		local[5] = 1 - (xx + zz)
		local[6] = yz + wx
		local[7] = 0
		local[8] = xz + wy
		local[9] = yz - wx
		local[10] = 1 - (xx + yy)
		local[11] = 0
		local[12] = positions[pi]
		local[13] = positions[pi+1]
		local[14] = positions[pi+2]
		local[15] = 1

		world := s.worldMatrices[i]
		parent := s.Joints[i].Parent
		if parent >= 0 {
			mathx.Mat4Multiply(world, s.worldMatrices[parent], local)
		} else {
			mathx.Mat4Copy(world, local)
		}
	}
	return s.worldMatrices
}

// GetWorldMatrices returns per-joint world matrices for a pose. The returned
// slice is owned by the skeleton and overwritten on the next call.
func (s *Skeleton) GetWorldMatrices(pose *Pose) []mathx.Mat4 {
	return s.computeWorldMatrices(pose)
}

// ComputeSkinningMatrices returns world * inverseBind per joint. The returned
// slice is owned by the skeleton and overwritten on the next call.
func (s *Skeleton) ComputeSkinningMatrices(pose *Pose) []mathx.Mat4 {
	s.computeWorldMatrices(pose)
	for i := 0; i < s.JointCount; i++ {
		mathx.Mat4Multiply(s.skinMatrices[i], s.worldMatrices[i], s.InverseBindMatrices[i])
	}
	return s.skinMatrices
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
