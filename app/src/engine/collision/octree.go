//gofront:target wasm
package collision

import "../mathx"

// MaxOctreeStackDepth bounds the explicit traversal stack; 8 children per level, so a
// depth-first walk of a tree with MaxDepth 8 never exceeds 8*7+1 live entries.
const MaxOctreeStackDepth = 128

var (
	_octTmpAABB    mathx.BoundingBox
	_octInvDir     mathx.Vec3
	_octQueryStack = make([]*OctreeNode, MaxOctreeStackDepth)
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
func IntersectRayAABB(aabb *mathx.BoundingBox, origin, invDir *mathx.Vec3, maxDist float32) bool {
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
	AABB     mathx.BoundingBox
	Data     []int
	Children []*OctreeNode
	MaxDepth int
}

// Octree is an alias for the root OctreeNode.
type Octree = OctreeNode

// NewOctree creates a new root octree with given bounding box and maximum tree depth.
func NewOctree(aabb *mathx.BoundingBox, maxDepth int) *Octree {
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
func (node *OctreeNode) Insert(aabb *mathx.BoundingBox, elementData int, level int) bool {
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

		for i := 0; i < len(node.Children); i++ {
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
		root = node
	}

	node.Children = make([]*OctreeNode, 8)
	for i := 0; i < 8; i++ {
		minX := l.X + _childOffsets[i][0]*halfDiagX
		minY := l.Y + _childOffsets[i][1]*halfDiagY
		minZ := l.Z + _childOffsets[i][2]*halfDiagZ

		child := &OctreeNode{
			Root:     root,
			MaxDepth: node.MaxDepth,
			Data:     make([]int, 0),
			Children: make([]*OctreeNode, 0),
			AABB: mathx.BoundingBox{
				Min: mathx.Vec3{X: minX, Y: minY, Z: minZ},
				Max: mathx.Vec3{X: minX + halfDiagX, Y: minY + halfDiagY, Z: minZ + halfDiagZ},
			},
		}
		node.Children[i] = child
	}
}

// AABBQuery writes element data intersecting aabb into out and returns the count.
// Results beyond len(out) are dropped; out must be pre-sized by the caller.
func (node *OctreeNode) AABBQuery(aabb *mathx.BoundingBox, out []int) int {
	count := 0
	limit := len(out)
	top := 0
	_octQueryStack[top] = node
	top++

	for top > 0 {
		top--
		curr := _octQueryStack[top]

		if curr.AABB.Overlaps(aabb) {
			data := curr.Data
			for i := 0; i < len(data) && count < limit; i++ {
				out[count] = data[i]
				count++
			}
			children := curr.Children
			for i := 0; i < len(children); i++ {
				if children[i] != nil && top < MaxOctreeStackDepth {
					_octQueryStack[top] = children[i]
					top++
				}
			}
		}
	}

	return count
}

// RayQuery writes elements intersecting the ray (transformed into tree-local space) into out.
func (node *OctreeNode) RayQuery(ray *Ray, treeTransform *mathx.Transform, out []int) int {
	treeTransform.PointToLocal(&ray.From, &_octTmpAABB.Min)
	treeTransform.VectorToLocal(&ray.Direction, &_octTmpAABB.Max)

	maxDist := ray.From.Distance(&ray.To)
	return node.RayQueryLocal(&_octTmpAABB.Min, &_octTmpAABB.Max, maxDist, out, nil)
}

// RayQueryLocal writes elements intersecting the local-space ray into out and returns the count.
func (node *OctreeNode) RayQueryLocal(origin, direction *mathx.Vec3, maxDist float32, out []int, invDir *mathx.Vec3) int {
	inv := invDir
	if inv == nil {
		_octInvDir.X = 1.0 / direction.X
		_octInvDir.Y = 1.0 / direction.Y
		_octInvDir.Z = 1.0 / direction.Z
		inv = &_octInvDir
	}

	count := 0
	limit := len(out)
	top := 0
	_octQueryStack[top] = node
	top++

	for top > 0 {
		top--
		curr := _octQueryStack[top]

		if IntersectRayAABB(&curr.AABB, origin, inv, maxDist) {
			data := curr.Data
			for i := 0; i < len(data) && count < limit; i++ {
				out[count] = data[i]
				count++
			}
			children := curr.Children
			for i := 0; i < len(children); i++ {
				if children[i] != nil && top < MaxOctreeStackDepth {
					_octQueryStack[top] = children[i]
					top++
				}
			}
		}
	}

	return count
}

// RemoveEmptyNodes removes leaves with no data and no children (build-time only).
func (node *OctreeNode) RemoveEmptyNodes() {
	kept := 0
	for i := 0; i < len(node.Children); i++ {
		child := node.Children[i]
		if child == nil {
			continue
		}
		child.RemoveEmptyNodes()
		if len(child.Children) == 0 && len(child.Data) == 0 {
			continue
		}
		node.Children[kept] = child
		kept++
	}
	node.Children = node.Children[:kept]
}
