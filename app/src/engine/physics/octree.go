package physics

import (
	"math"
)

var (
	_octTmpAABB    BoundingBox
	_octInvDir     Vec3
	_octQueryQueue = make([]*OctreeNode, 0, 64)
	_childOffsets  = [8][3]float32{
		{0, 0, 0},
		{1, 0, 0},
		{1, 1, 0},
		{1, 1, 1},
		{0, 1, 1},
		{0, 0, 1},
		{1, 0, 1},
		{0, 1, 0},
	}
)

// IntersectRayAABB tests intersection between a ray and an AABB using the Slab method.
func IntersectRayAABB(aabb *BoundingBox, origin, invDir *Vec3, maxDist float32) bool {
	min := &aabb.Min
	max := &aabb.Max

	var tmin, tmax, tymin, tymax, tzmin, tzmax float32

	if invDir.X >= 0 {
		tmin = (min.X - origin.X) * invDir.X
		tmax = (max.X - origin.X) * invDir.X
	} else {
		tmin = (max.X - origin.X) * invDir.X
		tmax = (min.X - origin.X) * invDir.X
	}

	if invDir.Y >= 0 {
		tymin = (min.Y - origin.Y) * invDir.Y
		tymax = (max.Y - origin.Y) * invDir.Y
	} else {
		tymin = (max.Y - origin.Y) * invDir.Y
		tymax = (min.Y - origin.Y) * invDir.Y
	}

	if tmin > tymax || tymin > tmax {
		return false
	}

	if tymin > tmin {
		tmin = tymin
	}
	if tymax < tmax {
		tmax = tymax
	}

	if invDir.Z >= 0 {
		tzmin = (min.Z - origin.Z) * invDir.Z
		tzmax = (max.Z - origin.Z) * invDir.Z
	} else {
		tzmin = (max.Z - origin.Z) * invDir.Z
		tzmax = (min.Z - origin.Z) * invDir.Z
	}

	if tmin > tzmax || tzmin > tmax {
		return false
	}

	if tzmin > tmin {
		tmin = tzmin
	}
	if tzmax < tmax {
		tmax = tzmax
	}

	return tmax >= 0 && tmin <= maxDist
}

// OctreeNode represents a spatial partitioning node containing elements and child nodes.
type OctreeNode struct {
	Root     *OctreeNode
	AABB     BoundingBox
	Data     []int
	Children []*OctreeNode
	MaxDepth int
}

// Octree is an alias for the root OctreeNode.
type Octree = OctreeNode

// NewOctree creates a new root octree with given bounding box and maximum tree depth.
func NewOctree(aabb *BoundingBox, maxDepth int) *Octree {
	if maxDepth <= 0 {
		maxDepth = 8
	}
	oct := &OctreeNode{
		Data:     make([]int, 0),
		Children: make([]*OctreeNode, 0),
		MaxDepth: maxDepth,
	}
	if aabb != nil {
		oct.AABB.Copy(aabb)
	}
	return oct
}

// Reset clears all data and child nodes.
func (node *OctreeNode) Reset() {
	if node.Data != nil {
		node.Data = node.Data[:0]
	} else {
		node.Data = make([]int, 0)
	}
	if node.Children != nil {
		node.Children = node.Children[:0]
	} else {
		node.Children = make([]*OctreeNode, 0)
	}
}

// Insert adds an element index into the octree at the deepest containing node.
func (node *OctreeNode) Insert(aabb *BoundingBox, elementData int, level int) bool {
	if !node.AABB.Contains(aabb) {
		return false
	}

	maxDepth := node.MaxDepth
	if maxDepth == 0 && node.Root != nil {
		maxDepth = node.Root.MaxDepth
	}
	if maxDepth == 0 {
		maxDepth = 8
	}

	if level < maxDepth {
		freshSubdivision := len(node.Children) == 0
		if freshSubdivision {
			node.Subdivide()
		}

		for i := 0; i < 8; i++ {
			if node.Children[i].Insert(aabb, elementData, level+1) {
				return true
			}
		}

		if freshSubdivision {
			node.Children = node.Children[:0]
		}
	}

	node.Data = append(node.Data, elementData)
	return true
}

// Subdivide creates 8 octant children for this node.
func (node *OctreeNode) Subdivide() {
	l := &node.AABB.Min
	u := &node.AABB.Max

	halfDiagX := (u.X - l.X) * 0.5
	halfDiagY := (u.Y - l.Y) * 0.5
	halfDiagZ := (u.Z - l.Z) * 0.5

	root := node.Root
	if root == nil {
		root = &node
	}

	node.Children = make([]*OctreeNode, 8)
	for i := 0; i < 8; i++ {
		off := _childOffsets[i]
		minX := l.X + off[0]*halfDiagX
		minY := l.Y + off[1]*halfDiagY
		minZ := l.Z + off[2]*halfDiagZ

		child := &OctreeNode{
			Root:     root,
			MaxDepth: node.MaxDepth,
			Data:     make([]int, 0),
			Children: make([]*OctreeNode, 0),
			AABB: BoundingBox{
				Min: Vec3{X: minX, Y: minY, Z: minZ},
				Max: Vec3{X: minX + halfDiagX, Y: minY + halfDiagY, Z: minZ + halfDiagZ},
			},
		}
		node.Children[i] = child
	}
}

// AABBQuery collects all element data intersecting the given AABB.
func (node *OctreeNode) AABBQuery(aabb *BoundingBox, result []int) []int {
	_octQueryQueue = _octQueryQueue[:0]
	_octQueryQueue = append(_octQueryQueue, node)

	for len(_octQueryQueue) > 0 {
		idx := len(_octQueryQueue) - 1
		curr := _octQueryQueue[idx]
		_octQueryQueue = _octQueryQueue[:idx]

		if curr.AABB.Overlaps(aabb) {
			for _, d := range curr.Data {
				result = append(result, d)
			}
			for _, c := range curr.Children {
				if c != nil {
					_octQueryQueue = append(_octQueryQueue, c)
				}
			}
		}
	}

	return result
}

// RayQuery queries elements intersecting ray transformed into tree's local space.
func (node *OctreeNode) RayQuery(ray *Ray, treeTransform *Transform, result []int) []int {
	treeTransform.PointToLocal(&ray.From, &_octTmpAABB.Min)
	treeTransform.VectorToLocal(&ray.Direction, &_octTmpAABB.Max)

	maxDist := ray.From.Distance(&ray.To)
	return node.RayQueryLocal(&_octTmpAABB.Min, &_octTmpAABB.Max, maxDist, result, nil)
}

// RayQueryLocal queries elements intersecting ray in local coordinates.
func (node *OctreeNode) RayQueryLocal(origin, direction *Vec3, maxDist float32, result []int, invDir *Vec3) []int {
	inv := invDir
	if inv == nil {
		if direction.X != 0 {
			_octInvDir.X = 1.0 / direction.X
		} else {
			_octInvDir.X = float32(math.Inf(1))
		}
		if direction.Y != 0 {
			_octInvDir.Y = 1.0 / direction.Y
		} else {
			_octInvDir.Y = float32(math.Inf(1))
		}
		if direction.Z != 0 {
			_octInvDir.Z = 1.0 / direction.Z
		} else {
			_octInvDir.Z = float32(math.Inf(1))
		}
		inv = &_octInvDir
	}

	_octQueryQueue = _octQueryQueue[:0]
	_octQueryQueue = append(_octQueryQueue, node)

	for len(_octQueryQueue) > 0 {
		idx := len(_octQueryQueue) - 1
		curr := _octQueryQueue[idx]
		_octQueryQueue = _octQueryQueue[:idx]

		if IntersectRayAABB(&curr.AABB, origin, inv, maxDist) {
			for _, d := range curr.Data {
				result = append(result, d)
			}
			for _, c := range curr.Children {
				if c != nil {
					_octQueryQueue = append(_octQueryQueue, c)
				}
			}
		}
	}

	return result
}

// RemoveEmptyNodes removes leaves with no data and no children.
func (node *OctreeNode) RemoveEmptyNodes() {
	for i := len(node.Children) - 1; i >= 0; i-- {
		child := node.Children[i]
		if child != nil {
			child.RemoveEmptyNodes()
			if len(child.Children) == 0 && len(child.Data) == 0 {
				node.Children = append(node.Children[:i], node.Children[i+1:]...)
			}
		}
	}
}
