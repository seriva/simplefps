//gofront:target wasm
package collision

import "../mathx"

// maxOctreeStackDepth bounds the explicit traversal stack; 8 children per level, so a
// depth-first walk of a tree with maxDepth 8 never exceeds 8*7+1 live entries.
const maxOctreeStackDepth = 128

var (
	_octInvDir     mathx.Vec3
	_octQueryStack = make([]*octreeNode, maxOctreeStackDepth)
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

// intersectRayAABB tests intersection between a ray and an AABB using the Slab method.
func intersectRayAABB(aabb *mathx.BoundingBox, origin, invDir *mathx.Vec3, maxDist float32) bool {
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

// octreeNode represents a spatial partitioning node containing elements and child nodes.
type octreeNode struct {
	root     *octreeNode
	aabb     mathx.BoundingBox
	data     []int
	children []*octreeNode
	maxDepth int
}

// newOctree creates a new root octree with given bounding box and maximum tree depth.
func newOctree(aabb *mathx.BoundingBox, maxDepth int) *octreeNode {
	if maxDepth <= 0 {
		maxDepth = 8
	}
	oct := &octreeNode{
		data:     make([]int, 0),
		children: make([]*octreeNode, 0),
		maxDepth: maxDepth,
	}
	if aabb != nil {
		oct.aabb.Copy(aabb)
	}
	return oct
}

// reset clears all data and child nodes.
func (node *octreeNode) reset() {
	if node.data != nil {
		node.data = node.data[:0]
	} else {
		node.data = make([]int, 0)
	}
	if node.children != nil {
		node.children = node.children[:0]
	} else {
		node.children = make([]*octreeNode, 0)
	}
}

// insert adds an element index into the octree at the deepest containing node.
func (node *octreeNode) insert(aabb *mathx.BoundingBox, elementData int, level int) bool {
	if !node.aabb.Contains(aabb) {
		return false
	}

	maxDepth := node.maxDepth
	if maxDepth == 0 && node.root != nil {
		maxDepth = node.root.maxDepth
	}
	if maxDepth == 0 {
		maxDepth = 8
	}

	if level < maxDepth {
		freshSubdivision := len(node.children) == 0
		if freshSubdivision {
			node.subdivide()
		}

		for i := 0; i < len(node.children); i++ {
			if node.children[i].insert(aabb, elementData, level+1) {
				return true
			}
		}

		if freshSubdivision {
			node.children = node.children[:0]
		}
	}

	node.data = append(node.data, elementData)
	return true
}

// subdivide creates 8 octant children for this node.
func (node *octreeNode) subdivide() {
	l := &node.aabb.Min
	u := &node.aabb.Max

	halfDiagX := (u.X - l.X) * 0.5
	halfDiagY := (u.Y - l.Y) * 0.5
	halfDiagZ := (u.Z - l.Z) * 0.5

	root := node.root
	if root == nil {
		root = node
	}

	node.children = make([]*octreeNode, 8)
	for i := 0; i < 8; i++ {
		minX := l.X + _childOffsets[i][0]*halfDiagX
		minY := l.Y + _childOffsets[i][1]*halfDiagY
		minZ := l.Z + _childOffsets[i][2]*halfDiagZ

		child := &octreeNode{
			root:     root,
			maxDepth: node.maxDepth,
			data:     make([]int, 0),
			children: make([]*octreeNode, 0),
			aabb: mathx.BoundingBox{
				Min: mathx.Vec3{X: minX, Y: minY, Z: minZ},
				Max: mathx.Vec3{X: minX + halfDiagX, Y: minY + halfDiagY, Z: minZ + halfDiagZ},
			},
		}
		node.children[i] = child
	}
}

// aabbQuery writes element data intersecting aabb into out and returns the count.
// Results beyond len(out) are dropped; out must be pre-sized by the caller.
func (node *octreeNode) aabbQuery(aabb *mathx.BoundingBox, out []int) int {
	count := 0
	limit := len(out)
	top := 0
	_octQueryStack[top] = node
	top++

	for top > 0 {
		top--
		curr := _octQueryStack[top]

		if curr.aabb.Overlaps(aabb) {
			data := curr.data
			for i := 0; i < len(data) && count < limit; i++ {
				out[count] = data[i]
				count++
			}
			children := curr.children
			for i := 0; i < len(children); i++ {
				if children[i] != nil && top < maxOctreeStackDepth {
					_octQueryStack[top] = children[i]
					top++
				}
			}
		}
	}

	return count
}

// rayQueryLocal writes elements intersecting the local-space ray into out and returns the count.
func (node *octreeNode) rayQueryLocal(origin, direction *mathx.Vec3, maxDist float32, out []int, invDir *mathx.Vec3) int {
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

		if intersectRayAABB(&curr.aabb, origin, inv, maxDist) {
			data := curr.data
			for i := 0; i < len(data) && count < limit; i++ {
				out[count] = data[i]
				count++
			}
			children := curr.children
			for i := 0; i < len(children); i++ {
				if children[i] != nil && top < maxOctreeStackDepth {
					_octQueryStack[top] = children[i]
					top++
				}
			}
		}
	}

	return count
}

// removeEmptyNodes removes leaves with no data and no children (build-time only).
func (node *octreeNode) removeEmptyNodes() {
	kept := 0
	for i := 0; i < len(node.children); i++ {
		child := node.children[i]
		if child == nil {
			continue
		}
		child.removeEmptyNodes()
		if len(child.children) == 0 && len(child.data) == 0 {
			continue
		}
		node.children[kept] = child
		kept++
	}
	node.children = node.children[:kept]
}
