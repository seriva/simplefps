package assets

import (
	"encoding/json"

	"../animation"
	"../rendering"
	"./decoder"
)

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

// copyMeshArrays copies the index groups and vertex streams shared by rigid
// and skinned meshes, so the GPU mesh does not alias the decoded data.
func copyMeshArrays(md *MeshData) ([]rendering.IndexGroup, []float32, []float32, []float32) {
	indices := make([]rendering.IndexGroup, len(md.Indices))
	for i := 0; i < len(md.Indices); i++ {
		arr := make([]uint32, len(md.Indices[i].Array))
		copy(arr, md.Indices[i].Array)
		indices[i] = rendering.IndexGroup{Material: md.Indices[i].Material, Array: arr}
	}
	verts := make([]float32, len(md.Vertices))
	copy(verts, md.Vertices)
	uvs := make([]float32, len(md.UVs))
	copy(uvs, md.UVs)
	normals := make([]float32, len(md.Normals))
	copy(normals, md.Normals)
	return indices, verts, uvs, normals
}

// BuildMesh uploads decoded rigid mesh data to the GPU.
func BuildMesh(b *rendering.Backend, md *MeshData) *rendering.Mesh {
	if md == nil {
		return nil
	}
	indices, verts, uvs, normals := copyMeshArrays(md)
	lmUVs := make([]float32, len(md.LightmapUVs))
	copy(lmUVs, md.LightmapUVs)

	return rendering.NewMesh(b, verts, uvs, normals, lmUVs, indices)
}

// BuildSkinnedMesh uploads decoded skinned mesh data and builds its skeleton
// (nil when the file has no joints).
func BuildSkinnedMesh(b *rendering.Backend, md *MeshData) (*rendering.SkinnedMesh, *animation.Skeleton) {
	if md == nil {
		return nil, nil
	}
	indices, verts, uvs, normals := copyMeshArrays(md)
	jointIndices := make([]uint8, len(md.JointIndices))
	copy(jointIndices, md.JointIndices)
	jointWeights := make([]float32, len(md.JointWeights))
	copy(jointWeights, md.JointWeights)

	sm := rendering.NewSkinnedMesh(b, verts, uvs, normals, indices, jointIndices, jointWeights)
	var skeleton *animation.Skeleton
	if md.HasSkeleton() {
		skeleton = animation.NewSkeleton(md.Joints)
	}
	return sm, skeleton
}
