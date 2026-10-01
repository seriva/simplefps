package assets

import (
	"testing"

	"../rendering"
	"js:./interop.d.ts"
)

// binWriter builds little-endian test fixtures.
type binWriter struct {
	buf  []byte
	view any
	off  int
}

func newBinWriter(size int) *binWriter {
	buf := make([]byte, size)
	var u8 any = buf
	view := Reflect.construct(globalThis.DataView, []any{u8.buffer, u8.byteOffset, u8.byteLength})
	return &binWriter{buf: buf, view: view}
}

func (w *binWriter) u32(v int) {
	w.view.setUint32(w.off, v, true)
	w.off += 4
}

func (w *binWriter) i32(v int) {
	w.view.setInt32(w.off, v, true)
	w.off += 4
}

func (w *binWriter) f32(v float32) {
	w.view.setFloat32(w.off, v, true)
	w.off += 4
}

func (w *binWriter) u8(v int) {
	w.view.setUint8(w.off, v)
	w.off++
}

// str writes s padded with zeros to size bytes (size 0 = null-terminated).
func (w *binWriter) str(s string, size int) {
	b := []byte(s)
	for i := 0; i < len(b); i++ {
		w.buf[w.off+i] = b[i]
	}
	if size == 0 {
		w.off += len(b) + 1
		return
	}
	w.off += size
}

func (w *binWriter) bytes() []byte {
	return w.buf[:w.off]
}

func TestExtOf(t *testing.T) {
	if ExtOf("meshes/ball.mesh") != "mesh" {
		t.Errorf("expected mesh, got %s", ExtOf("meshes/ball.mesh"))
	}
	if ExtOf("arenas/demo/textures/cretebase.blend.webp") != "webp" {
		t.Error("expected webp for multi-dot name")
	}
	if ExtOf("noext") != "" || ExtOf("dir.d/noext") != "" || ExtOf("trailing.") != "" {
		t.Error("expected empty extension")
	}
	if !IsBinaryExt("bmesh") || !IsBinaryExt("bin") || IsBinaryExt("mesh") {
		t.Error("IsBinaryExt mismatch")
	}
}

func TestParseBinaryMeshVersion2(t *testing.T) {
	w := newBinWriter(1024)
	w.u32(2) // version
	w.u32(9) // vertex floats (3 verts)
	w.u32(6) // uv floats
	w.u32(6) // lightmap uv floats
	w.u32(9) // normal floats
	w.u32(2) // index groups
	for i := 0; i < 9; i++ {
		w.f32(float32(i))
	}
	for i := 0; i < 6; i++ {
		w.f32(0.5)
	}
	for i := 0; i < 6; i++ {
		w.f32(0.25)
	}
	for i := 0; i < 9; i++ {
		w.f32(1)
	}
	w.str("wall", materialNameSize)
	w.u32(3)
	w.u32(0)
	w.u32(1)
	w.u32(2)
	w.str("empty", materialNameSize)
	w.u32(0)

	md := ParseBinaryMesh(w.bytes())
	if len(md.Vertices) != 9 || md.Vertices[8] != 8 {
		t.Fatalf("vertices not decoded: %d", len(md.Vertices))
	}
	if len(md.UVs) != 6 || len(md.LightmapUVs) != 6 || md.LightmapUVs[0] != 0.25 {
		t.Error("uv / lightmap uv mismatch")
	}
	if len(md.Normals) != 9 {
		t.Error("normals mismatch")
	}
	if len(md.Indices) != 1 {
		t.Fatalf("expected empty group dropped, got %d groups", len(md.Indices))
	}
	if md.Indices[0].Material != "wall" || len(md.Indices[0].Array) != 3 || md.Indices[0].Array[2] != 2 {
		t.Error("index group mismatch")
	}
	if md.HasSkeleton() {
		t.Error("rigid mesh must not have a skeleton")
	}

	mesh := BuildMesh(md)
	if mesh == nil || mesh.TriangleCount != 1 || mesh.BoundingBox == nil {
		t.Error("BuildMesh should produce a mesh with one triangle and bounds")
	}
}

func TestParseBinaryMeshVersion1SkipsReservedWord(t *testing.T) {
	w := newBinWriter(256)
	w.u32(1)
	w.u32(3)
	w.u32(0)
	w.u32(99) // reserved (ignored in v1)
	w.u32(0)
	w.u32(1)
	w.f32(1)
	w.f32(2)
	w.f32(3)
	w.str("", materialNameSize) // empty name -> "none"
	w.u32(1)
	w.u32(0)

	md := ParseBinaryMesh(w.bytes())
	if len(md.Vertices) != 3 || len(md.LightmapUVs) != 0 {
		t.Error("v1 decode mismatch")
	}
	if len(md.Indices) != 1 || md.Indices[0].Material != "none" {
		t.Error("empty material name should map to none")
	}
}

func TestParseBinaryMeshSkinnedVersion5(t *testing.T) {
	w := newBinWriter(2048)
	w.u32(5)
	w.u32(6) // 2 verts
	w.u32(4)
	w.u32(0)
	w.u32(6)
	w.u32(1)
	w.u32(2) // joints
	w.u32(1) // legacy weight records
	for i := 0; i < 6; i++ {
		w.f32(float32(i))
	}
	for i := 0; i < 4; i++ {
		w.f32(0)
	}
	for i := 0; i < 6; i++ {
		w.f32(0)
	}
	w.str("skin", materialNameSize)
	w.u32(3)
	w.u32(0)
	w.u32(1)
	w.u32(1)
	// joints: parent, pos, rot
	w.i32(-1)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)
	w.i32(0)
	w.f32(0)
	w.f32(2)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(0)
	w.f32(1)
	w.str("root", 0)
	w.str("child", 0)
	// legacy weights: 1 record with 2 influences (v>=4 adds 3 normal floats)
	w.u32(0)
	w.u32(2)
	for i := 0; i < 2; i++ {
		w.u32(0)
		for k := 0; k < 7; k++ {
			w.f32(0.5)
		}
	}
	// GPU skinning: 2 verts * 4
	for i := 0; i < 8; i++ {
		w.u8(i % 2)
	}
	for i := 0; i < 8; i++ {
		w.f32(0.25)
	}

	md := ParseBinaryMesh(w.bytes())
	if len(md.Joints) != 2 {
		t.Fatalf("expected 2 joints, got %d", len(md.Joints))
	}
	if md.Joints[0].Name != "root" || md.Joints[1].Name != "child" {
		t.Errorf("joint names: %s %s", md.Joints[0].Name, md.Joints[1].Name)
	}
	if md.Joints[0].Parent != -1 || md.Joints[1].Parent != 0 || md.Joints[1].Pos[1] != 2 {
		t.Error("joint hierarchy mismatch")
	}
	if len(md.JointIndices) != 8 || md.JointIndices[1] != 1 {
		t.Errorf("gpu joint indices mismatch: %d", len(md.JointIndices))
	}
	if len(md.JointWeights) != 8 || md.JointWeights[7] != 0.25 {
		t.Error("gpu joint weights mismatch")
	}

	sm, skeleton := BuildSkinnedMesh(md)
	if sm == nil || skeleton == nil || skeleton.JointCount != 2 {
		t.Fatal("BuildSkinnedMesh should return mesh and 2-joint skeleton")
	}
	if len(sm.BaseMesh.Indices) != 1 || sm.BaseMesh.Indices[0].Material != "skin" {
		t.Error("skinned index group mismatch")
	}
}

func TestParseJSONMesh(t *testing.T) {
	md := ParseJSONMesh(`{"vertices":[0,0,0,1,0,0,0,1,0],"uvs":[0,0,1,0,0,1],"indices":[{"material":"mat_a","array":[0,1,2]}]}`)
	if len(md.Vertices) != 9 || len(md.UVs) != 6 || len(md.Normals) != 0 || len(md.LightmapUVs) != 0 {
		t.Error("json mesh arrays mismatch")
	}
	if len(md.Indices) != 1 || md.Indices[0].Material != "mat_a" || md.Indices[0].Array[2] != 2 {
		t.Error("json index group mismatch")
	}

	sk := ParseJSONMesh(`{"vertices":[0,0,0],"indices":[],"skeleton":{"joints":[{"name":"j","parent":-1,"pos":[0,0,0],"rot":[0,0,0,1]}]},"gpuJointIndices":[0,0,0,0],"gpuJointWeights":[1,0,0,0]}`)
	if len(sk.Joints) != 1 || sk.Joints[0].Name != "j" || len(sk.JointIndices) != 4 || sk.JointWeights[0] != 1 {
		t.Error("json skinned data mismatch")
	}

	empty := ParseJSONMesh("null")
	if len(empty.Vertices) != 0 || len(empty.Indices) != 0 {
		t.Error("null document should yield empty mesh data")
	}
}

func TestParseMaterialLibraryInheritance(t *testing.T) {
	defs := ParseMaterialLibrary(`{"materials":[
		{"name":"lightmapped","textures":{"lightmap":"lm.webp"},"geomType":2,"reflectionStrength":0.5,"translucent":true},
		{"name":"wall","base":"lightmapped","textures":{"albedo":"wall.webp"},"opacity":0.75,"doubleSided":true},
		{"name":"plain"}
	]}`)
	if len(defs) != 3 {
		t.Fatalf("expected 3 materials, got %d", len(defs))
	}
	wall := defs[1]
	if wall.Name != "wall" || wall.Textures["albedo"] != "wall.webp" || wall.Textures["lightmap"] != "lm.webp" {
		t.Error("child should merge base textures")
	}
	if wall.Material.GeomType != 2 || wall.Material.ReflectionStrength != 0.5 || !wall.Material.Translucent {
		t.Error("child should inherit base scalar properties")
	}
	if wall.Material.Opacity != 0.75 || !wall.Material.DoubleSided {
		t.Error("child own properties lost")
	}
	plain := defs[2].Material
	if plain.GeomType != 1 || plain.ReflectionStrength != 1 || plain.Opacity != 1 || plain.Translucent || plain.DoubleSided {
		t.Error("defaults mismatch")
	}
	paths := wall.TexturePaths()
	if len(paths) != 2 {
		t.Errorf("expected 2 texture paths, got %d", len(paths))
	}
	if len(ParseMaterialLibrary("{}")) != 0 {
		t.Error("missing materials array should yield nothing")
	}
}

func TestParseResourceList(t *testing.T) {
	paths := ParseResourceList(`{"resources":["a.webp",{"path":"b.bmesh"},null]}`)
	if len(paths) != 2 || paths[0] != "a.webp" || paths[1] != "b.bmesh" {
		t.Errorf("unexpected paths: %v", paths)
	}
	if len(ParseResourceList("null")) != 0 {
		t.Error("null list should be empty")
	}
}

func TestResourceManagerRegistryAndLinks(t *testing.T) {
	r := NewResourceManager()
	r.Init()
	if !r.Has("black") || !r.Has("white") || r.Count() != 2 {
		t.Fatal("Init should register black/white textures")
	}
	if r.GetTexture("black") == nil {
		t.Error("GetTexture(black) should not be nil")
	}
	if r.Get("missing") != nil || r.GetMesh("missing") != nil || r.GetSound("missing") != nil {
		t.Error("missing resources must return nil")
	}

	// Mesh loaded before its materials.
	mesh := r.Decode("meshes/box.mesh", "mesh", `{"vertices":[0,0,0,1,0,0,0,1,0],"indices":[{"material":"wall","array":[0,1,2]},{"material":"none","array":[0,1,2]}]}`)
	if mesh == nil || mesh.Kind != KindMesh || r.GetMesh("meshes/box.mesh") == nil {
		t.Fatal("mesh decode failed")
	}
	if len(mesh.Mesh.MaterialLookup) != 0 {
		t.Error("no materials loaded yet")
	}

	texPaths := r.RegisterMaterialLibrary("meshes/materials.mat", ParseMaterialLibrary(`{"materials":[
		{"name":"lightmapped","textures":{"lightmap":"lm.webp"}},
		{"name":"wall","base":"lightmapped","textures":{"albedo":"wall.webp","emissive":"glow.webp"}}
	]}`))
	// lightmapped: lm; wall: albedo + emissive + inherited lm (Load dedupes).
	if len(texPaths) != 4 {
		t.Errorf("expected 4 texture paths, got %d", len(texPaths))
	}
	if !r.Has("meshes/materials.mat") || r.GetMaterial("wall") == nil || r.GetMaterial("lightmapped") == nil {
		t.Fatal("materials not registered")
	}

	// Textures arrive last.
	r.Register("wall.webp", &Entry{Kind: KindTexture, Texture: rendering.CreateSolidColorTexture(255, 0, 0, 255)})
	r.Register("lm.webp", &Entry{Kind: KindTexture, Texture: rendering.CreateSolidColorTexture(0, 255, 0, 255)})
	r.ResolveLinks()

	wall := r.GetMaterial("wall")
	if wall.AlbedoTexture != r.GetTexture("wall.webp") {
		t.Error("albedo texture not bound")
	}
	if wall.LightmapTexture != r.GetTexture("lm.webp") {
		t.Error("lightmap texture not bound from base")
	}
	if wall.EmissiveTexture != nil {
		t.Error("unloaded emissive texture must stay nil")
	}
	if mesh.Mesh.MaterialLookup["wall"] != wall {
		t.Error("mesh material lookup not bound")
	}
	if _, ok := mesh.Mesh.MaterialLookup["none"]; ok {
		t.Error("none must never be bound")
	}

	if r.Decode("x.unknown", "unknown", "") != nil {
		t.Error("unknown extension should not decode")
	}
	bin := r.Decode("data.bin", "bin", []byte{1, 2, 3})
	if bin == nil || len(r.GetBytes("data.bin")) != 3 {
		t.Error("bin decode failed")
	}
	snd := r.Decode("sounds/shoot.sfx", "sfx", `{"file":"resources/sounds/shoot.ogg","cached":true,"speed":1,"volume":0.3,"loop":false}`)
	if snd == nil || snd.Sound == nil || snd.Sound.File != "resources/sounds/shoot.ogg" || snd.Sound.Volume != float32(0.3) || !snd.Sound.Cached {
		t.Error("sfx decode failed")
	}
	r.Play("sounds/shoot.sfx") // no audio context headless: must not panic
}

async func TestLoadSkipsCachedAndSurvivesFetchFailure(t *testing.T) {
	r := NewResourceManager()
	starts := 0
	ends := 0
	r.OnLoadStart = func() { starts++ }
	r.OnLoadEnd = func() { ends++ }

	await r.Load([]string{})
	if starts != 0 {
		t.Error("empty load must not fire hooks")
	}

	r.Register("cached.bin", &Entry{Kind: KindBytes, Bytes: []byte{1}})
	await r.Load([]string{"cached.bin", "does-not-exist.bin"})
	if starts != 1 || ends != 1 {
		t.Errorf("hooks: starts=%d ends=%d", starts, ends)
	}
	if r.Has("does-not-exist.bin") {
		t.Error("failed fetch must not register an entry")
	}
	if len(r.loading) != 0 {
		t.Error("in-flight map should be drained")
	}
}

async func TestLoadListCycleGuard(t *testing.T) {
	r := NewResourceManager()
	r.loadingLists["self.list"] = true
	await r.loadList("self.list", `{"resources":["self.list"]}`)
	if !r.loadingLists["self.list"] {
		t.Error("guarded list must remain marked by the outer load")
	}
	delete(r.loadingLists, "self.list")
	await r.loadList("other.list", `{"resources":[]}`)
	if len(r.loadingLists) != 0 {
		t.Error("list marker should be cleared after load")
	}
}
