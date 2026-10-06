//gofront:target both
package mathx

// Transform represents a 3D coordinate frame defined by position and orientation quaternion.
type Transform struct {
	Position   Vec3
	Quaternion Quat
}

// NewTransform creates a new identity Transform.
func NewTransform() *Transform {
	t := &Transform{}
	t.Quaternion.Identity()
	return t
}

// NewTransformFromValues creates a new Transform with initial position and quaternion.
func NewTransformFromValues(pos *Vec3, q *Quat) *Transform {
	t := NewTransform()
	if pos != nil {
		t.Position.Copy(pos)
	}
	if q != nil {
		t.Quaternion.Copy(q)
	}
	return t
}

// PointToLocal transforms a world point into local frame coordinates.
func (t *Transform) PointToLocal(worldPoint, result *Vec3) *Vec3 {
	return PointToLocalFrame(&t.Position, &t.Quaternion, worldPoint, result)
}

// PointToWorld transforms a local point into world frame coordinates.
func (t *Transform) PointToWorld(localPoint, result *Vec3) *Vec3 {
	return PointToWorldFrame(&t.Position, &t.Quaternion, localPoint, result)
}

// VectorToLocal transforms a world vector into local frame direction without translation.
func (t *Transform) VectorToLocal(worldVector, result *Vec3) *Vec3 {
	return VectorToLocalFrame(&t.Quaternion, worldVector, result)
}

// VectorToWorld transforms a local vector into world frame direction without translation.
func (t *Transform) VectorToWorld(localVector, result *Vec3) *Vec3 {
	return VectorToWorldFrame(&t.Quaternion, localVector, result)
}

// PointToLocalFrame transforms a point from world space into local frame defined by position and quaternion.
func PointToLocalFrame(position *Vec3, quaternion *Quat, worldPoint, result *Vec3) *Vec3 {
	result.Sub(worldPoint, position)
	result.TransformQuatConjugate(result, quaternion)
	return result
}

// PointToWorldFrame transforms a point from local frame defined by position and quaternion into world space.
func PointToWorldFrame(position *Vec3, quaternion *Quat, localPoint, result *Vec3) *Vec3 {
	result.TransformQuat(localPoint, quaternion)
	result.Add(result, position)
	return result
}

// VectorToWorldFrame transforms a direction vector from local frame into world space.
func VectorToWorldFrame(quaternion *Quat, localVector, result *Vec3) *Vec3 {
	result.TransformQuat(localVector, quaternion)
	return result
}

// VectorToLocalFrame transforms a direction vector from world space into local frame.
func VectorToLocalFrame(quaternion *Quat, worldVector, result *Vec3) *Vec3 {
	result.TransformQuatConjugate(worldVector, quaternion)
	return result
}
