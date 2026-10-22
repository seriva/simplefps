package animation

import (
	"math"
	"testing"

	"../mathx"
)

// fixtureJointDefs is a 6-joint skeleton with two roots, a branching spine
// and non-identity bind rotations, so every path of the world chain
// (root copy, parent multiply, siblings) is exercised.
func fixtureJointDefs() []JointDef {
	return []JointDef{
		{Name: "root", Parent: -1, Pos: []float32{0.25, 1.5, -0.75}, Rot: []float32{0, 0.38268343, 0, 0.9238795}},
		{Name: "spine", Parent: 0, Pos: []float32{0.3, 2.6, -0.5}, Rot: []float32{0.1305262, 0.3696438, 0.0499525, 0.9186972}},
		{Name: "head", Parent: 1, Pos: []float32{0.35, 3.4, -0.45}, Rot: []float32{0.2588190, 0, 0, 0.9659258}},
		{Name: "armL", Parent: 1, Pos: []float32{-0.6, 2.9, -0.4}, Rot: []float32{0, 0, 0.5, 0.8660254}},
		{Name: "armR", Parent: 1, Pos: []float32{1.2, 2.9, -0.6}, Rot: []float32{0, 0, -0.5, 0.8660254}},
		{Name: "prop", Parent: -1, Pos: []float32{-2, 0.5, 3}, Rot: []float32{0.5, 0.5, 0.5, 0.5}},
	}
}

// fixturePoses returns three poses for the fixture skeleton: the bind pose
// and two deterministic (LCG) perturbations with normalized rotations.
func fixturePoses(s *Skeleton) []*Pose {
	poses := make([]*Pose, 3)
	seed := uint32(2024)
	next := func() float32 {
		seed = seed*1664525 + 1013904223
		return float32(seed>>8)/float32(1<<23) - 1
	}
	for p := 0; p < 3; p++ {
		pose := NewPose(s.JointCount)
		pose.SetBindPose(s)
		if p > 0 {
			for j := 0; j < s.JointCount; j++ {
				x, y, z, w := next(), next(), next(), next()+1.5
				inv := float32(1 / math.Sqrt(float64(x*x+y*y+z*z+w*w)))
				pose.SetJointTransform(j,
					pose.Positions[j*3]+next(), pose.Positions[j*3+1]+next(), pose.Positions[j*3+2]+next(),
					x*inv, y*inv, z*inv, w*inv)
			}
		}
		poses[p] = pose
	}
	return poses
}

func TestWorldMatricesMatchScalarFixture(t *testing.T) {
	s := NewSkeleton(fixtureJointDefs())
	poses := fixturePoses(s)
	for p := 0; p < 3; p++ {
		world := s.GetWorldMatrices(poses[p])
		if len(world) != s.JointCount {
			t.Fatalf("pose %d: %d world matrices, want %d", p, len(world), s.JointCount)
		}
		for j := 0; j < s.JointCount; j++ {
			for k := 0; k < 16; k++ {
				want := fixtureWorldBits[(p*s.JointCount+j)*16+k]
				if got := math.Float32bits(world[j][k]); got != want {
					t.Fatalf("pose %d joint %d [%d]: bits 0x%08x, want 0x%08x", p, j, k, got, want)
				}
			}
		}
	}
}

func TestSkinMatricesMatchScalarFixture(t *testing.T) {
	s := NewSkeleton(fixtureJointDefs())
	poses := fixturePoses(s)
	for p := 0; p < 3; p++ {
		s.ComputeSkinningMatrices(poses[p])
		n := s.SkinJointCount()
		if n != s.JointCount {
			t.Fatalf("pose %d: wrote %d joints, want %d", p, n, s.JointCount)
		}
		for i := 0; i < n*16; i++ {
			want := fixtureSkinBits[p*n*16+i]
			if got := math.Float32bits(SkinMatrices[i]); got != want {
				t.Fatalf("pose %d joint %d [%d]: bits 0x%08x, want 0x%08x", p, i/16, i%16, got, want)
			}
		}
	}
}

func TestWorldMatricesAfterSkinning(t *testing.T) {
	// GetWorldMatrices after ComputeSkinningMatrices on another pose must
	// reflect its own pose, not the last skinned one.
	s := NewSkeleton(fixtureJointDefs())
	poses := fixturePoses(s)
	s.ComputeSkinningMatrices(poses[2])
	world := s.GetWorldMatrices(poses[1])
	for j := 0; j < s.JointCount; j++ {
		for k := 0; k < 16; k++ {
			want := fixtureWorldBits[(s.JointCount+j)*16+k]
			if got := math.Float32bits(world[j][k]); got != want {
				t.Fatalf("joint %d [%d]: bits 0x%08x, want 0x%08x", j, k, got, want)
			}
		}
	}
}

func TestSkinningClampsAtMaxSkinJoints(t *testing.T) {
	// A 70-joint chain: every joint is written to the world matrices, but
	// only the first MaxSkinJoints palettes are published.
	joints := 70
	defs := make([]JointDef, joints)
	for i := 0; i < joints; i++ {
		defs[i] = JointDef{Name: "j", Parent: i - 1,
			Pos: []float32{float32(i) * 0.1, float32(i) * 0.05, 0},
			Rot: []float32{0, 0.08715574, 0, 0.9961947}}
	}
	s := NewSkeleton(defs)
	poses := fixturePoses(s)
	pose := poses[2]

	world := s.GetWorldMatrices(pose)
	if len(world) != joints {
		t.Fatalf("world matrices = %d, want %d", len(world), joints)
	}
	want := make([]uint32, MaxSkinJoints*16)
	skin := mathx.NewMat4()
	for i := 0; i < MaxSkinJoints; i++ {
		mathx.Mat4Multiply(skin, world[i], s.InverseBindMatrices[i])
		for k := 0; k < 16; k++ {
			want[i*16+k] = math.Float32bits(skin[k])
		}
	}

	s.ComputeSkinningMatrices(pose)
	n := s.SkinJointCount()
	if n != MaxSkinJoints {
		t.Fatalf("joints written = %d, want %d", n, MaxSkinJoints)
	}
	for i := 0; i < n*16; i++ {
		if got := math.Float32bits(SkinMatrices[i]); got != want[i] {
			t.Fatalf("joint %d [%d]: bits 0x%08x, want 0x%08x", i/16, i%16, got, want[i])
		}
	}
}

// fixtureWorldBits holds math.Float32bits of GetWorldMatrices for the fixture
// skeleton, captured from the scalar mathx.Mat4Multiply path before the SIMD
// change: 3 poses × 6 joints × 16 floats.
var fixtureWorldBits = []uint32{
	0x3f3504f4, 0x00000000, 0xbf3504f2, 0x00000000, 0x00000000, 0x3f800000, 0x00000000, 0x00000000,
	0x3f3504f2, 0x00000000, 0x3f3504f4, 0x00000000, 0x3e800000, 0x3fc00000, 0xbf400000, 0x3f800000,
	0x3f38c16f, 0x3e40ce08, 0xbf2a85d3, 0x00000000, 0x3b9b0220, 0x3f75ff8c, 0x3e8db20a, 0x00000000,
	0x3f31333e, 0xbe4fc013, 0x3f314f2e, 0x00000000, 0x3e99999a, 0x40266666, 0xbf000000, 0x3f800000,
	0x3f800000, 0xb6000000, 0xb6500000, 0x00000000, 0x36570000, 0x3f5db3a0, 0x3f000061, 0x00000000,
	0x35e80000, 0xbf000060, 0x3f5db39e, 0x00000000, 0x3eb3349d, 0x40599988, 0xbee66610, 0x3f800000,
	0x3efffe3c, 0x3f5db459, 0xb7662000, 0x00000000, 0xbf5db45a, 0x3efffe3d, 0x372c0000, 0x00000000,
	0x37844000, 0x36e48000, 0x3f7fffff, 0x00000000, 0xbf199667, 0x40399953, 0xbecccd3c, 0x3f800000,
	0x3effffce, 0xbf5db3e5, 0xb7898000, 0x00000000, 0x3f5db3e5, 0x3effffcd, 0xb6f10000, 0x00000000,
	0x37728000, 0xb7308000, 0x3f800000, 0x00000000, 0x3f999852, 0x403999d0, 0xbf19991f, 0x3f800000,
	0x00000000, 0x3f800000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3f800000, 0x00000000,
	0x3f800000, 0x00000000, 0x00000000, 0x00000000, 0xc0000000, 0x3f000000, 0x40400000, 0x3f800000,
	0x3f34f856, 0xbd7121e0, 0xbf3470b8, 0x00000000, 0xbf13d2fd, 0x3f0706ed, 0xbf1f8933, 0x00000000,
	0x3ed1214f, 0x3f58f8ab, 0x3ead8010, 0x00000000, 0xbe0177e0, 0x401e8a86, 0xbe660870, 0x3f800000,
	0x3f08dfd1, 0x3f4d99ff, 0x3e869a29, 0x00000000, 0xbf198625, 0x3e10cfd4, 0x3f49a1f3, 0x00000000,
	0x3f186b7c, 0xbf142aa6, 0x3f0ea806, 0x00000000, 0xbf4a427a, 0x4051af92, 0xbfccd36d, 0x3f800000,
	0xbe8b4217, 0x3f121294, 0xbf465eac, 0x00000000, 0xbf42ec2a, 0xbf1eb90f, 0xbe41d5e8, 0x00000000,
	0xbf16a457, 0x3f09dc96, 0x3f1a648f, 0x00000000, 0xbf9efc5d, 0x408525b9, 0xbf919ade, 0x3f800000,
	0xbe2e98ee, 0x3f6f5c60, 0xbe9f363c, 0x00000000, 0xbe3ad8a1, 0x3e8f7194, 0x3f714478, 0x00000000,
	0x3f77e37c, 0x3e5ea6c6, 0x3dfb9272, 0x00000000, 0xbfc2b5a8, 0x40580df3, 0xc03fa2ad, 0x3f800000,
	0x3e9d5db1, 0x3f5d81a7, 0x3ecac78a, 0x00000000, 0xbf19d14c, 0xbe15ca4e, 0x3f492e5b, 0x00000000,
	0x3f3ce7b6, 0xbef58217, 0x3ef32a32, 0x00000000, 0xbf96db58, 0x4056757c, 0xbf836b54, 0x3f800000,
	0x3ee6cf4c, 0x3f6347db, 0x3dbd8488, 0x00000000, 0xbf26616b, 0x3ecb8824, 0xbf25d2a4, 0x00000000,
	0xbf1ca322, 0x3e6d6cff, 0x3f41975e, 0x00000000, 0xc031290c, 0x3f8edcea, 0x4058b62c, 0x3f800000,
	0x3f582e58, 0x3daedd1e, 0x3f075dbb, 0x00000000, 0x3ebe732a, 0x3f1de934, 0xbf3192d1, 0x00000000,
	0xbec55262, 0x3f484e41, 0x3efa6fdc, 0x00000000, 0x3ee82670, 0x3f43e8dc, 0xbfb2e55c, 0x3f800000,
	0x3f3f26a1, 0x3e4c0fef, 0x3f2276f2, 0x00000000, 0x3f1ad27e, 0x3e468750, 0xbf45be7d, 0x00000000,
	0xbe8dcefe, 0x3f75e819, 0x3cc69c50, 0x00000000, 0x3eeaea52, 0x400552a6, 0xbff9ac92, 0x3f800000,
	0xbe7e82cf, 0x3edf9efc, 0x3f5d53e0, 0x00000000, 0xbe8a88e9, 0x3f53632d, 0xbefd676f, 0x00000000,
	0xbf6e187e, 0xbeb6c11a, 0xbdb24a43, 0x00000000, 0x3fd5a1b2, 0x3fecf7de, 0xc01cebf8, 0x3f800000,
	0x3f314ba0, 0x3ef3ba82, 0x3f0abfe3, 0x00000000, 0xbef4a3f2, 0x3f5d9898, 0xbe194eb7, 0x00000000,
	0xbf0a5907, 0xbe1f02ca, 0x3f53b26e, 0x00000000, 0x3f8d6c04, 0x4015ae77, 0xc01a2bee, 0x3f800000,
	0x3f1e51aa, 0x3ec5d4d6, 0x3f2f2d2c, 0x00000000, 0x3f38f6b5, 0x3d80c600, 0xbf3040ec, 0x00000000,
	0xbe9e3c05, 0x3f6b9194, 0xbe760d9c, 0x00000000, 0x3f1e0f46, 0x4037db80, 0xc01bdc74, 0x3f800000,
	0x3e5ca12c, 0x3dc8f1b0, 0xbf78b8e3, 0x00000000, 0xbf49f30a, 0x3f1a99d5, 0xbde96050, 0x00000000,
	0x3f1357ef, 0x3f4a7e5a, 0x3e547fd0, 0x00000000, 0xc00eb7bc, 0xbecbafc4, 0x403749d3, 0x3f800000,
}

// fixtureSkinBits holds math.Float32bits of SkinMatrices after
// ComputeSkinningMatrices for the fixture skeleton, captured from the scalar
// path before the SIMD change: 3 poses × 6 joints × 16 floats.
var fixtureSkinBits = []uint32{
	0x3f800000, 0x00000000, 0x33000000, 0x00000000, 0x00000000, 0x3f800000, 0x00000000, 0x00000000,
	0xb3000000, 0x00000000, 0x3f800000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3f800000,
	0x3f7ffcd5, 0x37918000, 0x00000000, 0x00000000, 0x37872000, 0x3f7fff8e, 0x36de0000, 0x00000000,
	0x36990000, 0x36d18000, 0x3f7ffc82, 0x00000000, 0xb7d2c000, 0x37800000, 0xb8378000, 0x3f7ffffe,
	0x3f800000, 0xb6000000, 0xb6500000, 0x00000000, 0x3600320a, 0x3f800000, 0x36e40000, 0x00000000,
	0x364ff57d, 0xb6e00000, 0x3f7fffff, 0x00000000, 0x36bf0000, 0xb6e00000, 0xb7a40000, 0x3f800000,
	0x3f800000, 0x37824000, 0xb784026a, 0x00000000, 0xb7828000, 0x3f7fffff, 0xb6e29694, 0x00000000,
	0x37844000, 0x36e48000, 0x3f7fffff, 0x00000000, 0x38d22000, 0xb6a00000, 0x36e40000, 0x3f800000,
	0x3f800000, 0xb5e80000, 0xb771db26, 0x00000000, 0x35e40000, 0x3f7fffff, 0x3731e830, 0x00000000,
	0x37728000, 0xb7308000, 0x3f800000, 0x00000000, 0xb8148000, 0x37180000, 0xb6ce0000, 0x3f800000,
	0x3f800000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3f800000, 0x00000000, 0x00000000,
	0x00000000, 0x00000000, 0x3f800000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3f800000,
	0x3f49e761, 0x3f0ec3e9, 0xbe847f7a, 0x00000000, 0xbf13d2fd, 0x3f0706ed, 0xbf1f8933, 0x00000000,
	0xbe581b20, 0x3f24141e, 0x3f3ceea2, 0x00000000, 0x3ec4bf2c, 0x4001bf74, 0x3faa074d, 0x3f800000,
	0x3f4b8c00, 0x3e37fa7e, 0x3f14441d, 0x00000000, 0xbf18ac64, 0x3ecf1e49, 0x3f317c86, 0x00000000,
	0xbde0b960, 0xbf658ad0, 0x3edb8c34, 0x00000000, 0x3eef29e8, 0x3fdc75bf, 0xc0572d66, 0x3f7ffffe,
	0xbe8b4217, 0x3f121294, 0xbf465eac, 0x00000000, 0xbebaf94a, 0xbf4e638e, 0xbeee5378, 0x00000000,
	0xbf63ebc7, 0x3e201f00, 0x3edaf512, 0x00000000, 0xbe9c9ef0, 0x40d8b942, 0x3f68a3a4, 0x3f800000,
	0x3d95079c, 0x3e66451d, 0xbf78bf28, 0x00000000, 0xbe74a0fe, 0x3f73274a, 0x3e4ec59c, 0x00000000,
	0x3f77e37c, 0x3e5ea6c6, 0x3dfb9272, 0x00000000, 0xbecb760c, 0x3f57e0e4, 0xc083a3de, 0x3f800000,
	0xbebbbca2, 0x3e9ca537, 0x3f60ec3c, 0x00000000, 0xbf110cdd, 0xbf528dd3, 0x3d4c8d28, 0x00000000,
	0x3f3ce7b6, 0xbef58217, 0x3ef32a32, 0x00000000, 0x3fac756a, 0x40a299af, 0xbff86f88, 0x3f800000,
	0xbf1ca322, 0x3e6d6cff, 0x3f41975e, 0x00000000, 0x3ee6cf4c, 0x3f6347db, 0x3dbd8488, 0x00000000,
	0xbf26616b, 0x3ecb8824, 0xbf25d2a4, 0x00000000, 0xc0111e82, 0xbd67fd00, 0x40d974e2, 0x3f800000,
	0x3ea632d6, 0x3f1d17ea, 0x3f3842da, 0x00000000, 0x3ebe732a, 0x3f1de934, 0xbf3192d1, 0x00000000,
	0xbf5ea07a, 0x3efc5cfa, 0xbce59d70, 0x00000000, 0xbf5681de, 0x3d667f10, 0xbf0ee0e5, 0x3f800000,
	0x3eb3366d, 0x3f4f41af, 0x3ef134c4, 0x00000000, 0x3f472617, 0x3ced3768, 0xbf20af8e, 0x00000000,
	0xbf059484, 0x3f1610c0, 0xbf1ea31a, 0x00000000, 0xbff70026, 0x4003b7e3, 0xbf45108c, 0x3f7ffffe,
	0xbe7e82cf, 0x3edf9efc, 0x3f5d53e0, 0x00000000, 0x3e6c3df0, 0x3f64c165, 0xbec52b08, 0x00000000,
	0xbf70d4a3, 0x3dd47850, 0xbea54d8e, 0x00000000, 0x3f0c5a84, 0xbfa581d4, 0xbfcb945c, 0x3f800000,
	0x3f429482, 0xbf02f9c6, 0x3ecd2236, 0x00000000, 0x3eb8c3b3, 0x3f5855e9, 0x3ec9fe91, 0x00000000,
	0xbf0a5907, 0xbe1f02ca, 0x3f53b26e, 0x00000000, 0x3e98b050, 0xbef64470, 0xc03ed700, 0x3f800000,
	0x3f6f57bf, 0x3e7d9788, 0xbe821a8e, 0x00000000, 0xbe328176, 0xbe9b3af7, 0xbf6fd585, 0x00000000,
	0xbe9e3c05, 0x3f6b9194, 0xbe760d9c, 0x00000000, 0xbe3cd250, 0x408038e0, 0x3ee27500, 0x3f800000,
	0x3f1357ef, 0x3f4a7e5a, 0x3e547fd0, 0x00000000, 0x3e5ca12c, 0x3dc8f1b0, 0xbf78b8e3, 0x00000000,
	0xbf49f30a, 0x3f1a99d5, 0xbde96050, 0x00000000, 0x3f970af4, 0xbf2d37ca, 0x408368f8, 0x3f800000,
}
