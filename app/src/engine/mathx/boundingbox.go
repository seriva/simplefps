//gofront:target both
package mathx

import (
	"math"
)

// FrustumPlaneCount is the number of planes in a view frustum; planes are stored flat as
// [a, b, c, d] * 6 in a []float32 so producers can alias the buffer without copying.
const FrustumPlaneCount = 6

// BoundingBox represents an Axis-Aligned Bounding Box (AABB).
type BoundingBox struct {
	Min Vec3
	Max Vec3
}

// NewBoundingBox creates a new BoundingBox with zeroed min and max.
func NewBoundingBox() *BoundingBox {
	return &BoundingBox{}
}

// NewBoundingBoxFromValues creates a new BoundingBox with given min and max.
func NewBoundingBoxFromValues(min, max *Vec3) *BoundingBox {
	b := &BoundingBox{}
	if min != nil {
		b.Min.Copy(min)
	}
	if max != nil {
		b.Max.Copy(max)
	}
	return b
}

// BoundingBoxFromPoints creates a BoundingBox enclosing a flat slice of 3D coordinates (XYZ).
func BoundingBoxFromPoints(points []float32) *BoundingBox {
	minX := float32(math.Inf(1))
	minY := float32(math.Inf(1))
	minZ := float32(math.Inf(1))
	maxX := float32(math.Inf(-1))
	maxY := float32(math.Inf(-1))
	maxZ := float32(math.Inf(-1))

	for i := 0; i < len(points); i += 3 {
		x := points[i]
		y := points[i+1]
		z := points[i+2]
		if x < minX {
			minX = x
		}
		if x > maxX {
			maxX = x
		}
		if y < minY {
			minY = y
		}
		if y > maxY {
			maxY = y
		}
		if z < minZ {
			minZ = z
		}
		if z > maxZ {
			maxZ = z
		}
	}

	b := &BoundingBox{}
	b.Min.Set(minX, minY, minZ)
	b.Max.Set(maxX, maxY, maxZ)
	return b
}

// Set updates the min and max coordinates of this BoundingBox.
func (b *BoundingBox) Set(min, max *Vec3) *BoundingBox {
	b.Min.Copy(min)
	b.Max.Copy(max)
	return b
}

// Copy copies bounds from another BoundingBox into this one.
func (b *BoundingBox) Copy(src *BoundingBox) *BoundingBox {
	b.Min.Copy(&src.Min)
	b.Max.Copy(&src.Max)
	return b
}

// Clone creates an exact replica of this BoundingBox.
func (b *BoundingBox) Clone() *BoundingBox {
	clone := &BoundingBox{}
	clone.Min.Copy(&b.Min)
	clone.Max.Copy(&b.Max)
	return clone
}

// SetFromPoints sets this BoundingBox to enclose an array of points.
func (b *BoundingBox) SetFromPoints(points []Vec3) *BoundingBox {
	if len(points) == 0 {
		b.Min.Set(0, 0, 0)
		b.Max.Set(0, 0, 0)
		return b
	}

	minX := points[0].X
	minY := points[0].Y
	minZ := points[0].Z
	maxX := minX
	maxY := minY
	maxZ := minZ

	for i := 1; i < len(points); i++ {
		p := &points[i]
		if p.X < minX {
			minX = p.X
		}
		if p.X > maxX {
			maxX = p.X
		}
		if p.Y < minY {
			minY = p.Y
		}
		if p.Y > maxY {
			maxY = p.Y
		}
		if p.Z < minZ {
			minZ = p.Z
		}
		if p.Z > maxZ {
			maxZ = p.Z
		}
	}

	b.Min.Set(minX, minY, minZ)
	b.Max.Set(maxX, maxY, maxZ)
	return b
}

// Overlaps checks if this BoundingBox intersects another.
func (b *BoundingBox) Overlaps(aabb *BoundingBox) bool {
	l1 := &b.Min
	u1 := &b.Max
	l2 := &aabb.Min
	u2 := &aabb.Max

	overlapX := (l2.X <= u1.X && u1.X <= u2.X) || (l1.X <= u2.X && u2.X <= u1.X)
	overlapY := (l2.Y <= u1.Y && u1.Y <= u2.Y) || (l1.Y <= u2.Y && u2.Y <= u1.Y)
	overlapZ := (l2.Z <= u1.Z && u1.Z <= u2.Z) || (l1.Z <= u2.Z && u2.Z <= u1.Z)

	return overlapX && overlapY && overlapZ
}

// Contains checks if this BoundingBox completely encloses another.
func (b *BoundingBox) Contains(aabb *BoundingBox) bool {
	return b.Min.X <= aabb.Min.X &&
		b.Max.X >= aabb.Max.X &&
		b.Min.Y <= aabb.Min.Y &&
		b.Max.Y >= aabb.Max.Y &&
		b.Min.Z <= aabb.Min.Z &&
		b.Max.Z >= aabb.Max.Z
}

// GetCorners computes the 8 bounding box corners in-place.
func (b *BoundingBox) GetCorners(c0, c1, c2, c3, c4, c5, c6, c7 *Vec3) {
	l := &b.Min
	u := &b.Max
	c0.Copy(l)
	c1.Set(u.X, l.Y, l.Z)
	c2.Set(u.X, u.Y, l.Z)
	c3.Set(l.X, u.Y, u.Z)
	c4.Set(u.X, l.Y, u.Z)
	c5.Set(l.X, u.Y, l.Z)
	c6.Set(l.X, l.Y, u.Z)
	c7.Copy(u)
}

// corner writes corner i (bit 0 = max X, bit 1 = max Y, bit 2 = max Z) into out.
func (b *BoundingBox) corner(i int, out *Vec3) {
	if i&1 != 0 {
		out.X = b.Max.X
	} else {
		out.X = b.Min.X
	}
	if i&2 != 0 {
		out.Y = b.Max.Y
	} else {
		out.Y = b.Min.Y
	}
	if i&4 != 0 {
		out.Z = b.Max.Z
	} else {
		out.Z = b.Min.Z
	}
}

// frameCorners transforms the 8 corners through frame (local when toLocal, world
// otherwise) and writes the enclosing box into target.
func (b *BoundingBox) frameCorners(frame *Transform, target *BoundingBox, toLocal bool) *BoundingBox {
	var c Vec3
	var minX, minY, minZ, maxX, maxY, maxZ float32
	for i := 0; i < 8; i++ {
		b.corner(i, &c)
		if toLocal {
			frame.PointToLocal(&c, &c)
		} else {
			frame.PointToWorld(&c, &c)
		}
		if i == 0 {
			minX, minY, minZ = c.X, c.Y, c.Z
			maxX, maxY, maxZ = c.X, c.Y, c.Z
			continue
		}
		if c.X < minX {
			minX = c.X
		}
		if c.X > maxX {
			maxX = c.X
		}
		if c.Y < minY {
			minY = c.Y
		}
		if c.Y > maxY {
			maxY = c.Y
		}
		if c.Z < minZ {
			minZ = c.Z
		}
		if c.Z > maxZ {
			maxZ = c.Z
		}
	}
	target.Min.Set(minX, minY, minZ)
	target.Max.Set(maxX, maxY, maxZ)
	return target
}

// ToLocalFrame transforms this bounding box into the local coordinate frame of a Transform.
func (b *BoundingBox) ToLocalFrame(frame *Transform, target *BoundingBox) *BoundingBox {
	return b.frameCorners(frame, target, true)
}

// ToWorldFrame transforms this bounding box from local frame to world space.
func (b *BoundingBox) ToWorldFrame(frame *Transform, target *BoundingBox) *BoundingBox {
	return b.frameCorners(frame, target, false)
}

// Center computes the center point of this bounding box.
func (b *BoundingBox) Center(out *Vec3) *Vec3 {
	out.Add(&b.Min, &b.Max)
	out.Scale(out, 0.5)
	return out
}

// Dimensions computes the width, height, and depth of this bounding box.
func (b *BoundingBox) Dimensions(out *Vec3) *Vec3 {
	out.Sub(&b.Max, &b.Min)
	return out
}

// TransformMatrix calculates the transformation matrix representing this bounding box.
func (b *BoundingBox) TransformMatrix(out Mat4) Mat4 {
	var center, dims Vec3
	Mat4Identity(out)
	b.Center(&center)
	b.Dimensions(&dims)
	Mat4Translate(out, out, &center)
	Mat4Scale(out, out, &dims)
	return out
}

// Transform transforms this bounding box by matrix and returns a new BoundingBox.
func (b *BoundingBox) Transform(matrix Mat4) *BoundingBox {
	return b.TransformInto(matrix, NewBoundingBox())
}

// TransformInto transforms this bounding box by matrix and writes bounds into out.
// Scalar-only so the per-entity call in the frame loop does not allocate.
func (b *BoundingBox) TransformInto(matrix Mat4, out *BoundingBox) *BoundingBox {
	m := matrix
	var tminX, tminY, tminZ, tmaxX, tmaxY, tmaxZ float32
	for i := 0; i < 8; i++ {
		var cx, cy, cz float32
		if i&1 != 0 {
			cx = b.Max.X
		} else {
			cx = b.Min.X
		}
		if i&2 != 0 {
			cy = b.Max.Y
		} else {
			cy = b.Min.Y
		}
		if i&4 != 0 {
			cz = b.Max.Z
		} else {
			cz = b.Min.Z
		}
		w := m[3]*cx + m[7]*cy + m[11]*cz + m[15]
		if w == 0 {
			w = 1
		}
		x := (m[0]*cx + m[4]*cy + m[8]*cz + m[12]) / w
		y := (m[1]*cx + m[5]*cy + m[9]*cz + m[13]) / w
		z := (m[2]*cx + m[6]*cy + m[10]*cz + m[14]) / w
		if i == 0 {
			tminX, tminY, tminZ = x, y, z
			tmaxX, tmaxY, tmaxZ = x, y, z
			continue
		}
		if x < tminX {
			tminX = x
		}
		if x > tmaxX {
			tmaxX = x
		}
		if y < tminY {
			tminY = y
		}
		if y > tmaxY {
			tmaxY = y
		}
		if z < tminZ {
			tminZ = z
		}
		if z > tmaxZ {
			tmaxZ = z
		}
	}

	out.Min.Set(tminX, tminY, tminZ)
	out.Max.Set(tmaxX, tmaxY, tmaxZ)
	return out
}

// IsVisibleWithPlanes tests whether this AABB is within or intersecting the frustum planes
// (flat [a, b, c, d] * 6 layout, see FrustumPlaneCount).
func (b *BoundingBox) IsVisibleWithPlanes(planes []float32) bool {
	for i := 0; i < FrustumPlaneCount*4; i += 4 {
		a := planes[i]
		bb := planes[i+1]
		c := planes[i+2]
		d := planes[i+3]
		var px, py, pz float32
		if a > 0 {
			px = b.Max.X
		} else {
			px = b.Min.X
		}
		if bb > 0 {
			py = b.Max.Y
		} else {
			py = b.Min.Y
		}
		if c > 0 {
			pz = b.Max.Z
		} else {
			pz = b.Min.Z
		}

		if (px*a + py*bb + pz*c + d) < 0 {
			return false
		}
	}
	return true
}
