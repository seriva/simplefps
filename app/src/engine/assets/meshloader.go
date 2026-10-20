package assets

import (
	"encoding/json"

	"../animation"
	"../rendering"
	"./decoder"
)

const materialNameSize = 64

// MeshData is the decoded payload of a .mesh/.bmesh/.smesh/.sbmesh file
// before GPU buffers are created.
type MeshData = decoder.MeshData

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
		Indices:     make([]decoder.MeshIndexGroup, 0),
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
			md.Indices = append(md.Indices, decoder.MeshIndexGroup{Material: name, Array: arr})
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
	indices := make([]rendering.IndexGroup, len(md.Indices))
	for i := 0; i < len(md.Indices); i++ {
		indices[i] = rendering.IndexGroup{Material: md.Indices[i].Material, Array: md.Indices[i].Array}
	}
	return rendering.NewMesh(b, md.Vertices, md.UVs, md.Normals, md.LightmapUVs, indices)
}

// BuildSkinnedMesh uploads decoded skinned mesh data and builds its skeleton
// (nil when the file has no joints).
func BuildSkinnedMesh(b *rendering.Backend, md *MeshData) (*rendering.SkinnedMesh, *animation.Skeleton) {
	indices := make([]rendering.IndexGroup, len(md.Indices))
	for i := 0; i < len(md.Indices); i++ {
		indices[i] = rendering.IndexGroup{Material: md.Indices[i].Material, Array: md.Indices[i].Array}
	}
	sm := rendering.NewSkinnedMesh(b, md.Vertices, md.UVs, md.Normals, indices, md.JointIndices, md.JointWeights)
	var skeleton *animation.Skeleton
	if md.HasSkeleton() {
		skeleton = animation.NewSkeleton(md.Joints)
	}
	return sm, skeleton
}
