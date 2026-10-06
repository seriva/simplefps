//gofront:target wasm
package collision

import "../mathx"

const (
	RayModeClosest = 1
	RayModeAny     = 2
	RayModeAll     = 4

	// MaxRayQueryResults caps candidate triangles per raycast; excess candidates are dropped.
	MaxRayQueryResults = 4096
)

var (
	_itNormal      mathx.Vec3
	_itTriangles   = make([]int, MaxRayQueryResults)
	_itVector      mathx.Vec3
	_itLocalDir    mathx.Vec3
	_itLocalFrom   mathx.Vec3
	_itLocalTo     mathx.Vec3
	_itWorldPoint  mathx.Vec3
	_itWorldNormal mathx.Vec3
	_itV0          mathx.Vec3
	_itV1          mathx.Vec3
	_itV2          mathx.Vec3
	_itA           mathx.Vec3
	_itB           mathx.Vec3
	_itC           mathx.Vec3
	_itIntersectPt mathx.Vec3
	_itInvMatrix   = mathx.NewMat4()
	_itInvDir      mathx.Vec3
)

// RaycastResult stores the outcome of a raycast query.
type RaycastResult struct {
	RayFromWorld   mathx.Vec3
	RayToWorld     mathx.Vec3
	HitNormalWorld mathx.Vec3
	HitPointWorld  mathx.Vec3
	HasHit         bool
	Shape          interface{}
	Body           interface{}
	HitFaceIndex   int
	Distance       float32
	ShouldStop     bool
}

// Reset clears the result fields for re-use without allocation.
func (r *RaycastResult) Reset() {
	r.RayFromWorld.Zero()
	r.RayToWorld.Zero()
	r.HitNormalWorld.Zero()
	r.HitPointWorld.Zero()
	r.HasHit = false
	r.Shape = nil
	r.Body = nil
	r.HitFaceIndex = -1
	r.Distance = -1
	r.ShouldStop = false
}

// RayOptions specifies configuration options for ray queries.
type RayOptions struct {
	SkipBackfaces       bool
	CollisionFilterMask int
	Mode                int
}

// Ray represents a 3D ray segment with origin and endpoint.
type Ray struct {
	From                 mathx.Vec3
	To                   mathx.Vec3
	Direction            mathx.Vec3
	Precision            float32
	SkipBackfaces        bool
	CollisionFilterMask  int
	CollisionFilterGroup int
	Mode                 int
	Result               RaycastResult
	HasHit               bool
	Callback             func(*RaycastResult)
}

// NewRay creates and initializes a Ray between from and to.
func NewRay(from, to *mathx.Vec3) *Ray {
	r := &Ray{
		Precision:            0.0001,
		SkipBackfaces:        false,
		CollisionFilterMask:  -1,
		CollisionFilterGroup: -1,
		Mode:                 RayModeAny,
	}
	if from != nil {
		r.From.Copy(from)
	}
	if to != nil {
		r.To.Copy(to)
	}
	r.UpdateDirection()
	return r
}

// UpdateDirection recalculates the normalized ray direction from From and To.
func (ray *Ray) UpdateDirection() {
	ray.Direction.Sub(&ray.To, &ray.From)
	ray.Direction.Normalize(&ray.Direction)
}

// IntersectTrimesh tests ray intersection against triangles in a Trimesh.
func (ray *Ray) IntersectTrimesh(mesh *Trimesh, worldMatrix mathx.Mat4) {
	indices := mesh.Indices

	isIdentity := true
	if worldMatrix != nil {
		isIdentity = worldMatrix[0] == 1 &&
			worldMatrix[5] == 1 &&
			worldMatrix[10] == 1 &&
			worldMatrix[15] == 1 &&
			worldMatrix[1] == 0 &&
			worldMatrix[2] == 0 &&
			worldMatrix[3] == 0 &&
			worldMatrix[4] == 0 &&
			worldMatrix[6] == 0 &&
			worldMatrix[7] == 0 &&
			worldMatrix[8] == 0 &&
			worldMatrix[9] == 0 &&
			worldMatrix[11] == 0 &&
			worldMatrix[12] == 0 &&
			worldMatrix[13] == 0 &&
			worldMatrix[14] == 0
	}

	if isIdentity {
		_itLocalFrom.Copy(&ray.From)
		_itLocalTo.Copy(&ray.To)
		_itLocalDir.Copy(&ray.Direction)
	} else {
		mathx.Mat4Invert(_itInvMatrix, worldMatrix)
		_itLocalFrom.TransformMat4(&ray.From, _itInvMatrix)
		_itLocalTo.TransformMat4(&ray.To, _itInvMatrix)

		_itLocalDir.Sub(&_itLocalTo, &_itLocalFrom)
		_itLocalDir.Normalize(&_itLocalDir)
	}

	maxDist := _itLocalFrom.Distance(&_itLocalTo)

	// Float division by a zero component yields ±Inf, which IntersectRayAABB
	// handles; branching on a math.Inf constant made V8 box a heap number per cast.
	_itInvDir.X = 1.0 / _itLocalDir.X
	_itInvDir.Y = 1.0 / _itLocalDir.Y
	_itInvDir.Z = 1.0 / _itLocalDir.Z

	// Early rejection: Check if ray intersects the mesh's root bounding box
	if !IntersectRayAABB(&mesh.AABB, &_itLocalFrom, &_itInvDir, maxDist) {
		return
	}

	count := mesh.Tree.RayQueryLocal(&_itLocalFrom, &_itLocalDir, maxDist, _itTriangles, &_itInvDir)

	for i := 0; i < count && !ray.Result.ShouldStop; i++ {
		trianglesIndex := _itTriangles[i]
		mesh.GetNormal(trianglesIndex, &_itNormal)

		dot := _itLocalDir.Dot(&_itNormal)
		if dot > -0.000001 && dot < 0.000001 {
			continue // Parallel ray
		}

		isDoubleSided := false
		if len(mesh.TriangleFlags) > trianglesIndex {
			isDoubleSided = mesh.TriangleFlags[trianglesIndex] == 1
		}
		if ray.SkipBackfaces && !isDoubleSided && dot > 0 {
			continue
		}

		mesh.GetVertex(int(indices[trianglesIndex*3]), &_itA)

		_itVector.Sub(&_itA, &_itLocalFrom)
		scalar := _itNormal.Dot(&_itVector) / dot
		if scalar < 0 || scalar > maxDist {
			continue
		}

		if ray.Mode == RayModeClosest && ray.Result.HasHit && isIdentity && scalar > ray.Result.Distance {
			continue
		}

		_itIntersectPt.ScaleAndAdd(&_itLocalFrom, &_itLocalDir, scalar)

		mesh.GetVertex(int(indices[trianglesIndex*3+1]), &_itB)
		mesh.GetVertex(int(indices[trianglesIndex*3+2]), &_itC)

		var inTriangle bool
		if dot < 0 {
			inTriangle = RayPointInTriangle(&_itIntersectPt, &_itB, &_itA, &_itC)
		} else {
			inTriangle = RayPointInTriangle(&_itIntersectPt, &_itA, &_itB, &_itC)
		}

		if !inTriangle {
			continue
		}

		if isIdentity {
			_itWorldPoint.Copy(&_itIntersectPt)
			_itWorldNormal.Copy(&_itNormal)
		} else {
			_itWorldPoint.TransformMat4(&_itIntersectPt, worldMatrix)
			m := worldMatrix
			_itWorldNormal.X = _itNormal.X*m[0] + _itNormal.Y*m[4] + _itNormal.Z*m[8]
			_itWorldNormal.Y = _itNormal.X*m[1] + _itNormal.Y*m[5] + _itNormal.Z*m[9]
			_itWorldNormal.Z = _itNormal.X*m[2] + _itNormal.Y*m[6] + _itNormal.Z*m[10]
			_itWorldNormal.Normalize(&_itWorldNormal)
		}

		if dot > 0 {
			_itWorldNormal.Negate(&_itWorldNormal)
		}

		hitDistance := scalar
		if !isIdentity {
			hitDistance = ray.From.Distance(&_itWorldPoint)
		}

		if ray.SkipBackfaces && _itWorldNormal.Dot(&ray.Direction) > 0 {
			continue
		}
		result := &ray.Result
		result.HitFaceIndex = trianglesIndex
		if ray.Mode == RayModeClosest && result.HasHit && hitDistance >= result.Distance {
			continue
		}
		// Written inline: passing the float32 distance through a helper call made
		// V8 box it as a heap number per hit whenever the callee was not inlined.
		ray.HasHit = true
		result.RayFromWorld.Copy(&ray.From)
		result.RayToWorld.Copy(&ray.To)
		result.HitNormalWorld.Copy(&_itWorldNormal)
		result.HitPointWorld.Copy(&_itWorldPoint)
		result.Shape = mesh
		result.Body = nil
		result.Distance = hitDistance
		result.HasHit = true
		switch ray.Mode {
		case RayModeAll:
			if ray.Callback != nil {
				ray.Callback(result)
			}
		case RayModeAny:
			result.ShouldStop = true
		}
	}
}

// RayPointInTriangle tests if point p lies inside triangle defined by a, b, c.
func RayPointInTriangle(p, a, b, c *mathx.Vec3) bool {
	_itV0.Sub(c, a)
	_itV1.Sub(b, a)
	_itV2.Sub(p, a)

	dot00 := _itV0.Dot(&_itV0)
	dot01 := _itV0.Dot(&_itV1)
	dot02 := _itV0.Dot(&_itV2)
	dot11 := _itV1.Dot(&_itV1)
	dot12 := _itV1.Dot(&_itV2)

	u := dot11*dot02 - dot01*dot12
	v := dot00*dot12 - dot01*dot02
	denom := dot00*dot11 - dot01*dot01
	return u >= 0 && v >= 0 && (u+v) <= denom
}

// GetAABB calculates the bounding box enclosing the ray segment.
func (ray *Ray) GetAABB(result *mathx.BoundingBox) *mathx.BoundingBox {
	result.Min.Min(&ray.From, &ray.To)
	result.Max.Max(&ray.From, &ray.To)
	return result
}
