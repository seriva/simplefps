package game

import (
	"math"

	"../engine/assets"
	"../engine/mathx"
	"../engine/scene"
)

// RemotePlayer is the visual proxy for another connected player
// (remoteplayer.js): a ball mesh that eases toward the last received
// position.
type RemotePlayer struct {
	ID     string
	Entity *scene.MeshEntity

	Target  mathx.Vec3
	Current mathx.Vec3

	scene    *scene.Scene
	scaleVec mathx.Vec3

	// stamp marks the last STATE packet that listed this player.
	stamp int
}

// NewRemotePlayer creates the proxy at position and adds it to s.
func NewRemotePlayer(s *scene.Scene, id string, position *mathx.Vec3) *RemotePlayer {
	rp := &RemotePlayer{ID: id, scene: s}
	rp.Target.Copy(position)
	rp.Current.Copy(position)
	rp.scaleVec.Set(RemotePlayerScale, RemotePlayerScale, RemotePlayerScale)

	rp.Entity = scene.NewMeshEntity(scene.TypeMesh, position, assets.GlobalResources.GetMesh(RemotePlayerMesh), nil, RemotePlayerScale)
	rp.Entity.Base.CastShadow = true
	if s != nil {
		s.AddEntity(rp.Entity)
	}
	return rp
}

// SetTarget sets the position the proxy eases toward.
func (rp *RemotePlayer) SetTarget(x, y, z float32) {
	rp.Target.Set(x, y, z)
}

// Update eases the proxy toward Target; dt is in seconds.
func (rp *RemotePlayer) Update(dt float32) {
	alpha := 1 - float32(math.Exp(float64(-RemotePlayerLerpDecay*dt)))
	rp.Current.Lerp(&rp.Current, &rp.Target, alpha)

	m := rp.Entity.Base.BaseMatrix
	mathx.Mat4FromTranslation(m, &rp.Current)
	mathx.Mat4Scale(m, m, &rp.scaleVec)
}

// Destroy removes the proxy from the scene.
func (rp *RemotePlayer) Destroy() {
	if rp.scene != nil {
		rp.scene.RemoveEntity(rp.Entity)
	}
}
