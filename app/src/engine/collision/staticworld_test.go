//gofront:target wasm
package collision

import "testing"

func TestStaticWorldRaycast(t *testing.T) {
	w := NewStaticWorld()
	if res := w.RaycastStatic(10, 5, 10, 10, -5, 10, nil); res.HasHit {
		t.Fatal("empty world must not hit")
	}

	w.Trimesh = gridFloor(4, 100, 0)
	res := w.RaycastStatic(10, 5, 10, 10, -5, 10, nil)
	if !res.HasHit || res.HitPointWorld.Y != 0 || res.HitNormalWorld.Y != 1 {
		t.Fatalf("expected floor hit at y=0, got hit=%v y=%f ny=%f", res.HasHit, res.HitPointWorld.Y, res.HitNormalWorld.Y)
	}

	// Default options skip backfaces; an explicit RayOptions is taken literally.
	if res := w.RaycastStatic(10, -5, 10, 10, 5, 10, nil); res.HasHit {
		t.Error("backface must be skipped by default")
	}
	both := RayOptions{SkipBackfaces: false, Mode: RayModeClosest}
	if res := w.RaycastStatic(10, -5, 10, 10, 5, 10, &both); !res.HasHit {
		t.Error("explicit SkipBackfaces=false must hit the backface")
	}
}
