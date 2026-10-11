package assets

import (
	"../animation"
	"../rendering"
	"js:./interop.d.ts"
)

const materialNameSize = 64

// MeshData is the decoded payload of a .mesh/.bmesh/.smesh/.sbmesh file
// before GPU buffers are created.
type MeshData struct {
	Vertices    []float32
	UVs         []float32
	Normals     []float32
	LightmapUVs []float32
	Indices     []rendering.IndexGroup

	// Skinned data (versions >= 3 / >= 5); empty for rigid meshes.
	Joints       []animation.JointDef
	JointIndices []uint8
	JointWeights []float32
}

// HasSkeleton reports whether the file carried joint definitions.
func (md *MeshData) HasSkeleton() bool { return len(md.Joints) > 0 }

// ParseBinaryMesh decodes the binary mesh format, including the optional
// skinning section (joints, weights, skeleton) appended by the exporter.
//
// Header (u32 each): version, vertexCount, uvCount, lightmapUVCount (v>=2,
// otherwise a reserved word), normalCount, indexGroupCount, and for v>=3
// jointCount, weightCount. Then float arrays vertices, uvs, lightmapUVs (v==2
// only), normals; per index group a 64-byte material name, u32 indexCount and
// the u32 indices (groups with zero indices are dropped). Skinned files
// append joints (i32 parent, 3×f32 pos, 4×f32 rot), null-terminated joint
// names, legacy per-vertex weights (skipped) and for v>=5 GPU skinning data:
// u8[nVerts*4] joint indices and f32[nVerts*4] weights.
func ParseBinaryMesh(data []byte) *MeshData {
	r := NewBinaryReader(data)
	version := int(r.ReadUint32())
	vertexCount := int(r.ReadUint32())
	uvCount := int(r.ReadUint32())

	lightmapUVCount := 0
	if version >= 2 {
		lightmapUVCount = int(r.ReadUint32())
	} else {
		r.ReadUint32()
	}

	normalCount := int(r.ReadUint32())
	indexGroupCount := int(r.ReadUint32())

	jointCount := 0
	weightCount := 0
	hasSkeletal := version >= 3
	hasWeightNormals := version >= 4
	hasGPUSkinning := version >= 5
	if hasSkeletal {
		jointCount = int(r.ReadUint32())
		weightCount = int(r.ReadUint32())
	}

	md := &MeshData{}
	md.Vertices = r.ReadFloat32Array(vertexCount)
	md.UVs = r.ReadFloat32Array(uvCount)
	if version == 2 {
		md.LightmapUVs = r.ReadFloat32Array(lightmapUVCount)
	} else {
		md.LightmapUVs = make([]float32, 0)
	}
	md.Normals = r.ReadFloat32Array(normalCount)

	md.Indices = make([]rendering.IndexGroup, 0)
	for i := 0; i < indexGroupCount; i++ {
		name := r.ReadString(materialNameSize)
		indexCount := int(r.ReadUint32())
		if indexCount == 0 {
			continue
		}
		arr := r.ReadUint32Array(indexCount)
		if name == "" {
			name = "none"
		}
		md.Indices = append(md.Indices, rendering.IndexGroup{Material: name, Array: arr})
	}

	if hasSkeletal && jointCount > 0 {
		md.Joints = make([]animation.JointDef, jointCount)
		for i := 0; i < jointCount; i++ {
			j := &md.Joints[i]
			j.Parent = int(r.ReadInt32())
			px := r.ReadFloat32()
			py := r.ReadFloat32()
			pz := r.ReadFloat32()
			j.Pos = []float32{px, py, pz}
			rx := r.ReadFloat32()
			ry := r.ReadFloat32()
			rz := r.ReadFloat32()
			rw := r.ReadFloat32()
			j.Rot = []float32{rx, ry, rz, rw}
		}
		for i := 0; i < jointCount; i++ {
			md.Joints[i].Name = r.ReadStringNullTerminated()
		}

		// Legacy CPU weight data (file format compatibility): per vertex a
		// u32 vertex index, u32 count, then count × (u32 joint, 4×f32 [, 3×f32]).
		perWeight := 4 + 4*4
		if hasWeightNormals {
			perWeight += 3 * 4
		}
		for i := 0; i < weightCount; i++ {
			r.ReadUint32()
			count := int(r.ReadUint32())
			r.Skip(count * perWeight)
		}

		if hasGPUSkinning {
			numVertices := len(md.Vertices) / 3
			md.JointIndices = r.ReadUint8Array(numVertices * 4)
			md.JointWeights = r.ReadFloat32Array(numVertices * 4)
		}
	}

	return md
}

// ParseJSONMesh decodes the legacy JSON mesh format:
// {vertices, uvs, normals, lightmapUVs, indices:[{material, array}],
// skeleton:{joints:[{name,parent,pos,rot}]}, gpuJointIndices, gpuJointWeights}.
func ParseJSONMesh(text string) *MeshData {
	parsed := JSON.parse(text)
	md := &MeshData{}
	if parsed == nil {
		md.Vertices = make([]float32, 0)
		md.UVs = make([]float32, 0)
		md.Normals = make([]float32, 0)
		md.LightmapUVs = make([]float32, 0)
		md.Indices = make([]rendering.IndexGroup, 0)
		return md
	}
	md.Vertices = toFloat32Slice(parsed.vertices)
	md.UVs = toFloat32Slice(parsed.uvs)
	md.Normals = toFloat32Slice(parsed.normals)
	md.LightmapUVs = toFloat32Slice(parsed.lightmapUVs)

	md.Indices = make([]rendering.IndexGroup, 0)
	if parsed.indices != nil {
		groups := parsed.indices.([]any)
		for i := 0; i < len(groups); i++ {
			g := groups[i]
			name := "none"
			if g.material != nil {
				name = g.material.(string)
			}
			md.Indices = append(md.Indices, rendering.IndexGroup{Material: name, Array: toUint32Slice(g.array)})
		}
	}

	if parsed.skeleton != nil && parsed.skeleton.joints != nil {
		joints := parsed.skeleton.joints.([]any)
		md.Joints = make([]animation.JointDef, len(joints))
		for i := 0; i < len(joints); i++ {
			src := joints[i]
			j := &md.Joints[i]
			if src.name != nil {
				j.Name = src.name.(string)
			}
			j.Parent = -1
			if src.parent != nil {
				j.Parent = int(src.parent.(float64))
			}
			j.Pos = toFloat32Slice(src.pos)
			j.Rot = toFloat32Slice(src.rot)
		}
	}

	if parsed.gpuJointIndices != nil && parsed.gpuJointWeights != nil {
		md.JointIndices = toUint8Slice(parsed.gpuJointIndices)
		md.JointWeights = toFloat32Slice(parsed.gpuJointWeights)
	}
	return md
}

// BuildMesh uploads decoded rigid mesh data to the GPU.
func BuildMesh(b *rendering.Backend, md *MeshData) *rendering.Mesh {
	return rendering.NewMesh(b, md.Vertices, md.UVs, md.Normals, md.LightmapUVs, md.Indices)
}

// BuildSkinnedMesh uploads decoded skinned mesh data and builds its skeleton
// (nil when the file has no joints).
func BuildSkinnedMesh(b *rendering.Backend, md *MeshData) (*rendering.SkinnedMesh, *animation.Skeleton) {
	sm := rendering.NewSkinnedMesh(b, md.Vertices, md.UVs, md.Normals, md.Indices, md.JointIndices, md.JointWeights)
	var skeleton *animation.Skeleton
	if md.HasSkeleton() {
		skeleton = animation.NewSkeleton(md.Joints)
	}
	return sm, skeleton
}

func toFloat32Slice(v any) []float32 {
	if v == nil {
		return make([]float32, 0)
	}
	return Reflect.construct(globalThis.Float32Array, []any{v}).([]float32)
}

func toUint32Slice(v any) []uint32 {
	if v == nil {
		return make([]uint32, 0)
	}
	return Reflect.construct(globalThis.Uint32Array, []any{v}).([]uint32)
}

func toUint8Slice(v any) []uint8 {
	if v == nil {
		return make([]uint8, 0)
	}
	return Reflect.construct(globalThis.Uint8Array, []any{v}).([]uint8)
}
