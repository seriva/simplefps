package assets

import (
	"encoding/json"

	"../animation"
	"../rendering"
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

type rawJSONIndexGroup struct {
	Material string   `json:"material"`
	Array    []uint32 `json:"array"`
}

type rawJSONJoint struct {
	Name   string    `json:"name"`
	Parent *int      `json:"parent"`
	Pos    []float32 `json:"pos"`
	Rot    []float32 `json:"rot"`
}

type rawJSONSkeleton struct {
	Joints []rawJSONJoint `json:"joints"`
}

type rawJSONMesh struct {
	Vertices        []float32           `json:"vertices"`
	UVs             []float32           `json:"uvs"`
	Normals         []float32           `json:"normals"`
	LightmapUVs     []float32           `json:"lightmapUVs"`
	Indices         []rawJSONIndexGroup `json:"indices"`
	Skeleton        *rawJSONSkeleton    `json:"skeleton"`
	GPUJointIndices []uint8             `json:"gpuJointIndices"`
	GPUJointWeights []float32           `json:"gpuJointWeights"`
}

// ParseJSONMesh decodes the legacy JSON mesh format:
// {vertices, uvs, normals, lightmapUVs, indices:[{material, array}],
// skeleton:{joints:[{name,parent,pos,rot}]}, gpuJointIndices, gpuJointWeights}.
func ParseJSONMesh(text string) *MeshData {
	md := &MeshData{
		Vertices:    make([]float32, 0),
		UVs:         make([]float32, 0),
		Normals:     make([]float32, 0),
		LightmapUVs: make([]float32, 0),
		Indices:     make([]rendering.IndexGroup, 0),
	}
	var raw rawJSONMesh
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return md
	}
	if raw.Vertices != nil {
		md.Vertices = raw.Vertices
	}
	if raw.UVs != nil {
		md.UVs = raw.UVs
	}
	if raw.Normals != nil {
		md.Normals = raw.Normals
	}
	if raw.LightmapUVs != nil {
		md.LightmapUVs = raw.LightmapUVs
	}

	if raw.Indices != nil {
		for i := 0; i < len(raw.Indices); i++ {
			g := raw.Indices[i]
			name := g.Material
			if name == "" {
				name = "none"
			}
			arr := g.Array
			if arr == nil {
				arr = make([]uint32, 0)
			}
			md.Indices = append(md.Indices, rendering.IndexGroup{Material: name, Array: arr})
		}
	}

	if raw.Skeleton != nil && raw.Skeleton.Joints != nil {
		joints := raw.Skeleton.Joints
		md.Joints = make([]animation.JointDef, len(joints))
		for i := 0; i < len(joints); i++ {
			src := joints[i]
			j := &md.Joints[i]
			j.Name = src.Name
			j.Parent = -1
			if src.Parent != nil {
				j.Parent = *src.Parent
			}
			if src.Pos != nil {
				j.Pos = src.Pos
			} else {
				j.Pos = make([]float32, 0)
			}
			if src.Rot != nil {
				j.Rot = src.Rot
			} else {
				j.Rot = make([]float32, 0)
			}
		}
	}

	if raw.GPUJointIndices != nil && raw.GPUJointWeights != nil {
		md.JointIndices = raw.GPUJointIndices
		md.JointWeights = raw.GPUJointWeights
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

