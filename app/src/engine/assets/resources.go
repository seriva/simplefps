package assets

import (
	"strings"

	"../animation"
	"../rendering"
	"../systems"
	"js:./interop.d.ts"
)

// Resource kinds stored in an Entry.
const (
	KindNone = iota
	KindTexture
	KindMesh
	KindSkinnedMesh
	KindAnimation
	KindMaterial
	KindSound
	KindBytes
)

// Entry is a loaded resource. Exactly one typed field (per Kind) is set;
// skinned meshes additionally carry their Skeleton.
type Entry struct {
	Kind        int
	Texture     *rendering.Texture
	Mesh        *rendering.Mesh
	SkinnedMesh *rendering.SkinnedMesh
	Skeleton    *animation.Skeleton
	Animation   *animation.Animation
	Material    *rendering.Material
	Sound       *systems.Sound
	Bytes       []byte
}

// ResourceManager fetches, decodes and caches game assets by path
// (resources.js). Paths are relative to BasePath; the file extension selects
// the decoder:
//
//	webp            -> Texture (Blob upload)
//	mesh / bmesh    -> Mesh (JSON / binary)
//	smesh / sbmesh  -> SkinnedMesh + Skeleton
//	anim / banim    -> Animation (JSON unsupported: binary only) / binary
//	mat             -> material library (each material registered by name)
//	sfx             -> Sound
//	bin             -> raw bytes
//	list            -> {resources:[...]} loaded recursively
type ResourceManager struct {
	BasePath string
	
	// OnLoadStart / OnLoadEnd bracket every Load call (nested lists included).
	OnLoadStart func()
	OnLoadEnd   func()

	entries      map[string]*Entry
	loading      map[string]any // path -> in-flight promise
	loadingLists map[string]bool
	materialDefs []*MaterialDef
	meshes       []*rendering.Mesh
}

// NewResourceManager creates an empty manager rooted at "resources/".
func NewResourceManager() *ResourceManager {
	return &ResourceManager{
		BasePath:     "resources/",
		entries:      map[string]*Entry{},
		loading:      map[string]any{},
		loadingLists: map[string]bool{},
		materialDefs: make([]*MaterialDef, 0),
		meshes:       make([]*rendering.Mesh, 0),
	}
}

// Init registers the built-in "black" and "white" 1x1 textures.
func (r *ResourceManager) Init() {
	r.entries["black"] = &Entry{Kind: KindTexture, Texture: rendering.CreateSolidColorTexture(0, 0, 0, 255)}
	r.entries["white"] = &Entry{Kind: KindTexture, Texture: rendering.CreateSolidColorTexture(255, 255, 255, 255)}
}

// Has reports whether key is loaded.
func (r *ResourceManager) Has(key string) bool {
	_, ok := r.entries[key]
	return ok
}

// Count returns the number of loaded entries.
func (r *ResourceManager) Count() int {
	return len(r.entries)
}

// Register stores a resource under key, replacing any existing entry.
func (r *ResourceManager) Register(key string, e *Entry) {
	if e == nil {
		return
	}
	r.entries[key] = e
	if e.Mesh != nil {
		r.trackMesh(e.Mesh)
	}
	if e.SkinnedMesh != nil {
		r.trackMesh(&e.SkinnedMesh.BaseMesh)
	}
}

// Get returns the entry for key, logging an error and returning nil when absent.
func (r *ResourceManager) Get(key string) *Entry {
	e, ok := r.entries[key]
	if !ok {
		systems.GlobalConsole.Error("Resource \"" + key + "\" does not exist")
		return nil
	}
	return e
}

// GetTexture returns the texture stored under key (nil when absent).
func (r *ResourceManager) GetTexture(key string) *rendering.Texture {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Texture
}

// GetMesh returns the rigid mesh stored under key (nil when absent).
func (r *ResourceManager) GetMesh(key string) *rendering.Mesh {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Mesh
}

// GetSkinnedMesh returns the skinned mesh stored under key (nil when absent).
func (r *ResourceManager) GetSkinnedMesh(key string) *rendering.SkinnedMesh {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.SkinnedMesh
}

// GetSkeleton returns the skeleton parsed from the skinned mesh under key.
func (r *ResourceManager) GetSkeleton(key string) *animation.Skeleton {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Skeleton
}

// GetAnimation returns the animation clip stored under key (nil when absent).
func (r *ResourceManager) GetAnimation(key string) *animation.Animation {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Animation
}

// GetMaterial returns the material registered under key (nil when absent).
func (r *ResourceManager) GetMaterial(key string) *rendering.Material {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Material
}

// GetSound returns the sound stored under key (nil when absent).
func (r *ResourceManager) GetSound(key string) *systems.Sound {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Sound
}

// GetBytes returns the raw bytes of a .bin resource (nil when absent).
func (r *ResourceManager) GetBytes(key string) []byte {
	e := r.Get(key)
	if e == nil {
		return nil
	}
	return e.Bytes
}

// Play plays the sound under key if it is loaded.
func (r *ResourceManager) Play(key string) {
	e, ok := r.entries[key]
	if ok && e.Sound != nil {
		e.Sound.Play(false)
	}
}

// Load fetches and decodes every path not already loaded, in parallel, and
// resolves once all of them are cached. Failures are logged and skipped so a
// broken asset never blocks the rest of a list.
async func (r *ResourceManager) Load(paths []string) any {
	if len(paths) == 0 {
		return nil
	}
	if r.OnLoadStart != nil {
		r.OnLoadStart()
	}

	promises := make([]any, 0)
	for i := 0; i < len(paths); i++ {
		path := paths[i]
		if r.Has(path) {
			continue
		}
		if p, ok := r.loading[path]; ok {
			promises = append(promises, p)
			continue
		}
		p := r.loadOne(path)
		r.loading[path] = p
		promises = append(promises, p)
	}

	await Promise.all(promises).catch(func(err any) {
		console.error("[Resources] load failed", err)
	})
	r.resolveLinks()

	if r.OnLoadEnd != nil {
		r.OnLoadEnd()
	}
	return nil
}

// Fetch downloads path and returns a Blob for images, []byte for binary
// formats and a string otherwise; nil on HTTP or network errors.
async func (r *ResourceManager) Fetch(path string) any {
	response := await fetch(path).catch(func(err any) any {
		return nil
	})
	if response == nil || response.ok != true {
		systems.GlobalConsole.Error("[Resources] Failed to fetch " + path)
		return nil
	}
	ext := ExtOf(path)
	if ext == "webp" {
		return await response.blob()
	}
	if IsBinaryExt(ext) {
		buf := await response.arrayBuffer()
		return Reflect.construct(globalThis.Uint8Array, []any{buf}).([]byte)
	}
	return await response.text()
}

// ExtOf returns the lower-case extension of path without the dot.
func ExtOf(path string) string {
	idx := strings.LastIndex(path, ".")
	if idx < 0 || idx == len(path)-1 {
		return ""
	}
	slash := strings.LastIndex(path, "/")
	if slash > idx {
		return ""
	}
	return strings.ToLower(path[idx+1:])
}

// IsBinaryExt reports whether the extension is fetched as an ArrayBuffer.
func IsBinaryExt(ext string) bool {
	return ext == "bmesh" || ext == "sbmesh" || ext == "banim" || ext == "bin"
}

async func (r *ResourceManager) loadOne(path string) any {
	data := await r.Fetch(r.BasePath + path)
	if data != nil {
		ext := ExtOf(path)
		switch ext {
		case "list":
			await r.loadList(path, data.(string))
		case "mat":
			await r.loadMaterialLibrary(path, data.(string))
		default:
			r.Decode(path, ext, data)
		}
		systems.GlobalConsole.Log("[Resources] Loaded: " + path)
	}
	delete(r.loading, path)
	return nil
}

// Decode turns fetched data for path into an Entry and registers it. Returns
// the entry, or nil for unknown extensions.
func (r *ResourceManager) Decode(path string, ext string, data any) *Entry {
	var e *Entry
	switch ext {
	case "webp":
		e = &Entry{Kind: KindTexture, Texture: newImageTexture(data)}
	case "mesh":
		e = &Entry{Kind: KindMesh, Mesh: BuildMesh(ParseJSONMesh(data.(string)))}
	case "bmesh":
		e = &Entry{Kind: KindMesh, Mesh: BuildMesh(ParseBinaryMesh(data.([]byte)))}
	case "smesh":
		sm, sk := BuildSkinnedMesh(ParseJSONMesh(data.(string)))
		e = &Entry{Kind: KindSkinnedMesh, SkinnedMesh: sm, Skeleton: sk}
	case "sbmesh":
		sm, sk := BuildSkinnedMesh(ParseBinaryMesh(data.([]byte)))
		e = &Entry{Kind: KindSkinnedMesh, SkinnedMesh: sm, Skeleton: sk}
	case "banim":
		e = &Entry{Kind: KindAnimation, Animation: animation.ParseBinaryAnimation(path, data.([]byte))}
	case "sfx":
		e = &Entry{Kind: KindSound, Sound: parseSound(data.(string))}
	case "bin":
		e = &Entry{Kind: KindBytes, Bytes: data.([]byte)}
	default:
		return nil
	}
	r.Register(path, e)
	return e
}

// RegisterMaterialLibrary registers every material of a parsed .mat document
// by name (and the first one under path) and returns the referenced texture
// paths so callers can load them.
func (r *ResourceManager) RegisterMaterialLibrary(path string, defs []*MaterialDef) []string {
	texPaths := make([]string, 0)
	for i := 0; i < len(defs); i++ {
		d := defs[i]
		r.materialDefs = append(r.materialDefs, d)
		r.entries[d.Name] = &Entry{Kind: KindMaterial, Material: d.Material}
		if i == 0 && path != "" {
			r.entries[path] = &Entry{Kind: KindMaterial, Material: d.Material}
		}
		tp := d.TexturePaths()
		for k := 0; k < len(tp); k++ {
			texPaths = append(texPaths, tp[k])
		}
	}
	return texPaths
}

async func (r *ResourceManager) loadMaterialLibrary(path string, text string) any {
	texPaths := r.RegisterMaterialLibrary(path, ParseMaterialLibrary(text))
	if len(texPaths) > 0 {
		await r.Load(texPaths)
	}
	return nil
}

async func (r *ResourceManager) loadList(path string, text string) any {
	if r.loadingLists[path] {
		systems.GlobalConsole.Warn("[Resources] Circular list reference detected: " + path)
		return nil
	}
	r.loadingLists[path] = true
	await r.Load(ParseResourceList(text))
	delete(r.loadingLists, path)
	return nil
}

// ParseResourceList decodes a .list document ({resources:[...]}) into paths.
func ParseResourceList(text string) []string {
	paths := make([]string, 0)
	parsed := JSON.parse(text)
	if parsed == nil || parsed.resources == nil {
		return paths
	}
	items := parsed.resources.([]any)
	for i := 0; i < len(items); i++ {
		item := items[i]
		if item == nil {
			continue
		}
		if s, ok := item.(string); ok {
			paths = append(paths, s)
		} else if item.path != nil {
			paths = append(paths, item.path.(string))
		}
	}
	return paths
}

// ResolveLinks binds loaded textures to material slots and loaded materials
// to mesh index groups. Safe to call repeatedly; runs after every Load.
func (r *ResourceManager) ResolveLinks() {
	r.resolveLinks()
}

func (r *ResourceManager) resolveLinks() {
	for i := 0; i < len(r.materialDefs); i++ {
		d := r.materialDefs[i]
		mat := d.Material
		for slot, path := range d.Textures {
			e, ok := r.entries[path]
			if !ok || e.Texture == nil {
				continue
			}
			switch slot {
			case "albedo":
				mat.AlbedoTexture = e.Texture
			case "emissive":
				mat.EmissiveTexture = e.Texture
			case "reflection":
				mat.ReflectionTexture = e.Texture
			case "reflectionMask":
				mat.ReflectionMaskTexture = e.Texture
			case "lightmap":
				mat.LightmapTexture = e.Texture
				e.Texture.SetFilter("linear", "linear", "linear")
				e.Texture.SetWrapMode("clamp-to-edge")
			}
		}
	}
	for i := 0; i < len(r.meshes); i++ {
		r.bindMeshMaterials(r.meshes[i])
	}
	if rendering.GlobalShapes.SkyBox != nil {
		r.bindMeshMaterials(rendering.GlobalShapes.SkyBox)
	}
}

// BindMesh fills m.MaterialLookup from the loaded materials. Use it for
// meshes created outside the manager (e.g. the shared skybox after its
// material names change).
func (r *ResourceManager) BindMesh(m *rendering.Mesh) {
	if m != nil {
		r.bindMeshMaterials(m)
	}
}

func (r *ResourceManager) bindMeshMaterials(m *rendering.Mesh) {
	for i := 0; i < len(m.Indices); i++ {
		name := m.Indices[i].Material
		if name == "none" || name == "" {
			continue
		}
		if e, ok := r.entries[name]; ok && e.Material != nil {
			m.MaterialLookup[name] = e.Material
		}
	}
}

func (r *ResourceManager) trackMesh(m *rendering.Mesh) {
	for i := 0; i < len(r.meshes); i++ {
		if r.meshes[i] == m {
			return
		}
	}
	r.meshes = append(r.meshes, m)
	r.bindMeshMaterials(m)
}

// newImageTexture creates a 1x1 placeholder and streams the Blob into it.
// Image textures default to repeat wrapping (texture.js).
func newImageTexture(blob any) *rendering.Texture {
	t := rendering.NewTexture(&rendering.TextureDescriptor{Width: 1, Height: 1, Mutable: true})
	t.SetWrapMode("repeat")
	t.LoadImageTexture(blob)
	return t
}

// parseSound decodes a .sfx document
// ({file, cached, speed, volume, loop}) into a Sound.
func parseSound(text string) *systems.Sound {
	parsed := JSON.parse(text)
	if parsed == nil {
		return nil
	}
	return systems.NewSound(
		jsonString(parsed.file, ""),
		jsonFloat(parsed.volume, 1.0),
		jsonFloat(parsed.speed, 1.0),
		jsonBool(parsed.loop, false),
		jsonBool(parsed.cached, false),
	)
}

// GlobalResources is the shared resource manager.
var GlobalResources = NewResourceManager()
