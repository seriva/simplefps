package assets

import (
	"strconv"

	"../animation"
	"../systems"
)

// ParseBinaryAnimation decodes the .anim binary format.
//
// Version 1: frameRate(u32) numFrames(u32) numJoints(u32) frames...
// Version 2: 2(u32) frameRate(u32) numFrames(u32) numJoints(u32) hasBounds(u32)
// frames... [bounds...]. Each frame joint is pos(3×f32) rot(4×f32); each
// bounds entry is min(3×f32) max(3×f32). All little-endian.
func ParseBinaryAnimation(name string, data []byte) *animation.Animation {
	r := NewBinaryReader(data)
	first := r.ReadUint32()

	var frameRate, numFrames, numJoints int
	hasBounds := false
	if first == 2 {
		frameRate = int(r.ReadUint32())
		numFrames = int(r.ReadUint32())
		numJoints = int(r.ReadUint32())
		hasBounds = r.ReadUint32() == 1
	} else {
		frameRate = int(first)
		numFrames = int(r.ReadUint32())
		numJoints = int(r.ReadUint32())
	}

	// One bulk read + one WASM call instead of 8 boundary crossings per joint.
	frames := r.ReadFloat32Array(numFrames * numJoints * 7)
	if len(frames) < numFrames*numJoints*7 {
		systems.GlobalConsole.Error("[Animation] Truncated clip " + name + ": expected " + strconv.Itoa(numFrames*numJoints*7) + " floats, got " + strconv.Itoa(len(frames)))
		return animation.NewAnimation(name, float32(frameRate), nil, nil)
	}
	poses := animation.NewPosesFromFrames(frames, numFrames, numJoints)

	var bounds []animation.Bounds
	if hasBounds {
		bounds = make([]animation.Bounds, numFrames)
		for f := 0; f < numFrames; f++ {
			b := &bounds[f]
			b.Min[0] = r.ReadFloat32()
			b.Min[1] = r.ReadFloat32()
			b.Min[2] = r.ReadFloat32()
			b.Max[0] = r.ReadFloat32()
			b.Max[1] = r.ReadFloat32()
			b.Max[2] = r.ReadFloat32()
		}
	}

	return animation.NewAnimation(name, float32(frameRate), poses, bounds)
}
