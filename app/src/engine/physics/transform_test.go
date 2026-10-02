package physics

import (
	"math"
	"testing"
)

func floatApprox(a, b float32) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.001
}

func TestTransformPointToWorldAndLocal(t *testing.T) {
	trans := NewTransform()
	trans.Position.Set(10, 20, 30)

	axisY := Vec3{X: 0, Y: 1, Z: 0}
	trans.Quaternion.FromAxisAngle(&axisY, float32(math.Pi/2.0))

	localPt := Vec3{X: 1, Y: 0, Z: 0}
	var worldPt Vec3
	trans.PointToWorld(&localPt, &worldPt)

	// Rotated 90 deg around Y: (1, 0, 0) -> (0, 0, -1), then + (10, 20, 30) -> (10, 20, 29)
	if !floatApprox(worldPt.X, 10) || !floatApprox(worldPt.Y, 20) || !floatApprox(worldPt.Z, 29) {
		t.Errorf("PointToWorld failed: got (%f, %f, %f), expected (10, 20, 29)", worldPt.X, worldPt.Y, worldPt.Z)
	}

	var roundtripPt Vec3
	trans.PointToLocal(&worldPt, &roundtripPt)
	if !floatApprox(roundtripPt.X, localPt.X) || !floatApprox(roundtripPt.Y, localPt.Y) || !floatApprox(roundtripPt.Z, localPt.Z) {
		t.Errorf("PointToLocal roundtrip failed: got (%f, %f, %f), expected (%f, %f, %f)", roundtripPt.X, roundtripPt.Y, roundtripPt.Z, localPt.X, localPt.Y, localPt.Z)
	}
}

func TestTransformVectorToWorldAndLocal(t *testing.T) {
	trans := NewTransform()
	trans.Position.Set(100, 200, 300) // Position shouldn't affect vector transforms

	axisY := Vec3{X: 0, Y: 1, Z: 0}
	trans.Quaternion.FromAxisAngle(&axisY, float32(math.Pi/2.0))

	localVec := Vec3{X: 0, Y: 0, Z: 1}
	var worldVec Vec3
	trans.VectorToWorld(&localVec, &worldVec)

	// Rotated 90 deg around Y: (0, 0, 1) -> (1, 0, 0)
	if !floatApprox(worldVec.X, 1) || !floatApprox(worldVec.Y, 0) || !floatApprox(worldVec.Z, 0) {
		t.Errorf("VectorToWorld failed: got (%f, %f, %f), expected (1, 0, 0)", worldVec.X, worldVec.Y, worldVec.Z)
	}

	var roundtripVec Vec3
	trans.VectorToLocal(&worldVec, &roundtripVec)
	if !floatApprox(roundtripVec.X, localVec.X) || !floatApprox(roundtripVec.Y, localVec.Y) || !floatApprox(roundtripVec.Z, localVec.Z) {
		t.Errorf("VectorToLocal roundtrip failed: got (%f, %f, %f), expected (%f, %f, %f)", roundtripVec.X, roundtripVec.Y, roundtripVec.Z, localVec.X, localVec.Y, localVec.Z)
	}
}
