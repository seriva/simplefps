# Engine Architecture Cleanup — Design Plan

**Version:** v2.2.0
**Status:** Draft (re-verified against `gofront` branch 2026-10-01)
**Depends on:** `archive/gofront-rewrite-plan.md` (complete on branch `gofront`)

---

## Goal

The GoFront port broke the JS `scene ⇄ rendering` import cycle by introducing
`rendering.SceneSource`, but the seam landed in the wrong place: the scene now
binds shaders, sets GPU state and mutates render stats, while the renderer sets
framebuffers and blend/depth state around it. Pipeline knowledge is split across
two packages, both lean on package-level globals, and the `Entity` interface
forces nine unrelated kinds through one fat contract with stringly-typed modes.

Done looks like: the renderer is the *only* code that knows pass order, shader
selection and GPU state; the scene is pure data (culling, spatial queries,
entity lifetime); no engine package reads a global from another package on the
hot path; every GPU-facing enum is a typed constant; the pass sequence is
expressed as a handful of `PipelineState` presets. Frame output is pixel-identical
to today and `gofront test` for `rendering`, `scene`, `game` stays green.

---

## Out of Scope

- **New rendering features.** No depth reconstruction (separate plan), no new
  passes, no shader changes.
- **Changing `RenderBackend` semantics** beyond grouping state setters. WebGL2
  and WebGPU backends keep their current resource model (`any` handles). Typed
  handle structs are a possible follow-up, not part of this plan.
- **Folder restructuring.** Package boundaries and file layout stay as in the
  rewrite plan.
- **Game package changes** other than what the `Scene`/`engine` API changes
  force (constructor arguments, no behavioural change).

---

## Approach

Work is ordered so each phase compiles and passes tests on its own. Phases 1–3
are the core; 4–6 are mechanical follow-ups that become easy once 1–3 land.

### Phase 1 — Kill hot-path globals (`rendering`, `physics`, `systems`)

**Problem.** `rendering.ActiveBackend`, `rendering.Shaders`, `rendering.GlobalShapes`,
`rendering.ActiveRenderStats`, `physics.GlobalRaycastStatic` and
`systems.ActiveSettings` are the JS singletons carried over. ~80 cross-package
reads in `scene/`, `engine.go`, `assets/` and `game/arena.go`, plus ~155
unqualified reads inside `rendering/` itself (`mesh.go`, `texture.go`,
`shaders.go`, `material.go`, `noise.go`, `skinnedmesh.go`) — the latter are the
bulk of step 1a. `NewScene()` silently overwrites `physics.GlobalRaycastStatic`
as a side effect. Tests must poke globals before constructing anything.

Three more hot-path globals were missed in the first draft:

- `rendering.ActiveDebugOptions` — read 5× in `scene/renderpasses.go`; the
  `tbv/twf/tlv/tsk` console toggles that mutate it live in
  `scene.RegisterDebugCommands`, which is the only reason `scene` imports
  `systems.GlobalConsole`.
- `physics.ActiveCameraPos/Dir/Up` — `*Vec3` aliases set by `game.go:76–78`,
  read by `FPSController.Update` and the noclip path. Physics reaching for the
  camera through a global is the same pattern as `GlobalRaycastStatic`.
- `physics.ActiveFrustumPlanes` — aliased by `systems.Camera.FrustumPlanes`;
  `BoundingBox.IsVisible()` reads it, and `Scene.Update` culling calls
  `IsVisible()` (`scene.go:458`) instead of `IsVisibleWithPlanes(s.Camera.FrustumPlanes)`.

Explicitly **not** in scope: app-level singletons `systems.GlobalConsole`,
`systems.GlobalInput`, `systems.GlobalStats`, `assets.GlobalResources` and the
`engine.Active*` composition-root vars. They are read from `game/` and `main.go`,
not from render/physics hot paths, and replacing them is a separate decision.

**Change.**

- `rendering.Renderer` becomes the composition root for GPU-side singletons:

  ```go
  type Renderer struct {
      Backend RenderBackend
      Shaders *ShaderCatalog
      Shapes  *Shapes
      Stats   RenderStats   // value, reset in BeginFrame
      // ...existing buffers
  }
  ```

  `NewRenderer(backend)` allocates `Shaders`/`Shapes`; `InitShaders`/`InitShapes`
  become methods. Package vars `ActiveBackend`, `Shaders`, `GlobalShapes`,
  `ActiveRenderStats` are deleted.

- `Mesh.RenderSingle/RenderIndices/RenderWireframe`, `SkinnedMesh.*`,
  `Texture.Bind`, `Shader.Bind/Set*`, `UnbindTextureRange` take the backend
  explicitly (`m.RenderSingle(b, …)`) or via the `*Renderer` handed down.
  Every entity `Render*` method already receives a `*rendering.Shader`; extend
  the signature with `r *rendering.Renderer` (see Phase 2 for the final shape).

- `physics.GlobalRaycastStatic` → `physics.RaycastProvider` interface:

  ```go
  type RaycastProvider interface {
      RaycastStatic(fromX, fromY, fromZ, toX, toY, toZ float32, opts *RayOptions, out *RaycastResult) *RaycastResult
  }
  ```

  `FPSController`/`DynamicBody` hold a `Provider RaycastProvider` field set by
  the game when it constructs them. `Scene` implements the interface; nothing
  is registered implicitly.

- `physics.ActiveCameraPos/Dir/Up` → `FPSController` gets a `Camera *CameraPose`
  field (`Position, Direction, Up *Vec3`) set once by the game; the noclip path
  reads it from the controller. `physics.ActiveFrustumPlanes` is deleted;
  `Camera` owns its plane slice and `Scene.Update` calls
  `IsVisibleWithPlanes(s.Camera.FrustumPlanes)`. `BoundingBox.IsVisible()` goes.

- `rendering.ActiveDebugOptions` → `Renderer.Debug DebugRenderOptions` (value).
  `scene.RegisterDebugCommands` moves to `engine.go` next to `rscale`/`stats`,
  which removes the `scene → systems.GlobalConsole` dependency entirely.

- `systems.ActiveSettings` stays as the single settings store (it *is* the
  user-facing config), but nothing under `rendering/` or `scene/` reads it.
  `engine.go` already copies settings into `rendering.RenderOptions` each
  frame; `scene/renderpasses.go:220,306` (`ProceduralDetail`) switch to the
  value the renderer passes down. Rule: settings are read in `engine` and
  `game`, nowhere deeper.

**Rejected:** a `Context` struct threaded everywhere. `*Renderer` already exists
and is passed into every pass; adding a second bag of pointers is noise.

### Phase 2 — Move the seam: renderer pulls, scene provides

**Problem.** `scene/renderpasses.go` (≈600 lines) owns the per-pass loops,
shader binds, uniform setup (`proceduralNoise`, `positionBuffer` slots), skybox
depth-state toggling and stats accounting. `rendering/renderpasses.go` (≈530
lines) owns framebuffer + blend/depth/cull setup and has nine `scene != nil`
guards. Neither package can be understood alone, and the renderer cannot be
tested against a fake scene without reimplementing half a pass. `scene` also
imports `rendering.LightSorter`/`LightingData` purely to do the renderer's
sorting for it.

**Change.** Invert `SceneSource` from "scene renders on request" to "scene
hands out culled lists":

```go
// package rendering

// Drawable is the only thing a pass needs from an entity.
type Drawable interface {
    Draw(r *Renderer, sh *Shader, mode MaterialMode)   // probe colour read from the entity's own cache
    DrawShadow(r *Renderer, sh *Shader)
    DrawDebug(r *Renderer)
    TriangleCount() int
    CastsShadow() bool
}

// LightDrawable adds the data the lighting pass sorts on.
type LightDrawable interface {
    Drawable
    LightScore(camPos *physics.Vec3) float32
}

// DrawList is a fixed-capacity view over a scene bucket. Items[:Count] is the
// live range. (A plain []Drawable return is not an option: GoFront emits
// s[:n] as .slice(), which allocates per call.)
type DrawList struct {
    Items []Drawable
    Count int
}
type LightList struct {
    Items []LightDrawable
    Count int
}

type SceneSource interface {
    Ambient(out *physics.Vec3)
    Skyboxes() *DrawList
    Meshes() *DrawList                        // opaque world geometry
    FPSMeshes() *DrawList
    SkinnedMeshes() *DrawList
    DirectionalLights() *DrawList
    PointLights() *LightList
    SpotLights() *LightList
    Billboards() *DrawList
    ParticleEmitters() *DrawList
    Transparent() *DrawList                   // pre-sorted back-to-front by scene
}
```

Each accessor returns a pointer to a `Scene`-owned list that is refilled during
`Scene.Update` culling; zero allocation, valid until the next `Scene.Update`.

**Probe colour.** The first draft had `SceneSource.ProbeColor(d Drawable, out)`
and a `probe []float32` argument on `Draw`. That forces the scene to recover an
entity position from a `Drawable` (type assertion or a position accessor on the
interface). Instead: `Scene.Update` samples the probe for every culled-in mesh
right after culling (same lazy per-frame cache as today, but keyed on the
visible set rather than on "was drawn"), stores it in the entity's `probeCache`
(Phase 4), and `Draw` reads its own cached colour. `Draw` drops the `probe`
parameter; `SceneSource` drops `ProbeColor`. Visible set == drawn set for
meshes, so sampled values and sample timing are unchanged.

**Transparent.** Today `RenderTransparent` sorts visible meshes with a
translucent material back-to-front into `transparentSort`. That sort stays in
the scene (it is spatial, like culling) and fills the `Transparent()` list; the
renderer just iterates it with `ModeTranslucent`.

Responsibilities after the move:

| Concern | Before | After |
|---|---|---|
| Frustum culling, `visible[]` buckets | scene | scene |
| Shadow raycast budget, `ShadowHeight*` state | scene | scene (`Scene.UpdateShadowHeights(budget)` called by `Scene.Update`, not by a pass) |
| Ambient probe sampling (`sampleProbeColor`) | scene, lazily during draw | scene, after culling in `Scene.Update` |
| Light sorting (`LightSorter`), transparent sort | scene | light sort → rendering (`Renderer.lightingPass` sorts `LightDrawable` by `LightScore`); transparent sort stays in scene |
| Shader bind + per-pass uniforms | scene | rendering |
| Depth/blend/cull/framebuffer | rendering | rendering |
| Stats (`MeshCount`, `TriangleCount`, `LightCount`) | scene | rendering |
| Skybox depth toggle | scene | rendering (part of `worldGeomPass`) |

`scene/renderpasses.go` shrinks to the accessors, `UpdateShadowHeights`, and
the transparent-group builder. `rendering/renderpasses.go` grows the loops.

The double FPS-mesh draw (`RenderWorldGeometry` draws FPS meshes as `"opaque"`,
`RenderFPSGeometry` redraws with `"all"` at near depth range) is intentional
depth layering from the JS engine; keep it, but it now lives in one file with
a comment.

**Rejected:** a `PassContext` struct handed to scene-driven loops. It fixes the
globals but leaves pass order and shader choice smeared across two packages;
the renderer would still not be testable in isolation.

### Phase 3 — Typed enums and `PipelineState`

**Problem.** `"opaque"`/`"all"`, `"one"`/`"zero"`/`"src-alpha"`, `"lequal"`,
`"back"`, `"triangles"`/`"lines"`, `"vertex"`/`"index"/"uniform"` are bare
strings on ~60 call sites; no named type or constant exists for any of them
today. Every pass issues 4–6 `Set*State` calls and then undoes them by hand.
The WebGPU backend already reduces these setters to a `pipeKey` string for its
`PipelineCache`
([webgpubackend.go:1797](../../app/src/engine/rendering/webgpu/webgpubackend.go#L1797)),
i.e. it reconstructs a pipeline-state object from individually mutated fields.

**Change.**

```go
// package rendering
type MaterialMode  string  // ModeAll, ModeOpaque, ModeTranslucent
type BlendFactor   string  // BlendOne, BlendZero, BlendSrcAlpha, BlendOneMinusSrcAlpha
type DepthFunc     string  // DepthLEqual, DepthAlways, …
type CullFace      string  // CullBack, CullFront
type Topology      string  // TopoTriangles, TopoLines
type BufferUsage   string  // UsageVertex, UsageIndex, UsageUniform

type PipelineState struct {
    Blend       bool
    SrcFactor   BlendFactor
    DstFactor   BlendFactor
    DepthTest   bool
    DepthWrite  bool
    DepthFunc   DepthFunc
    Cull        bool
    CullFace    CullFace
    PolyOffset  bool
    OffsetFactor, OffsetUnits float32
    ColorMask   uint8   // bit 0..3 = R,G,B,A; WebGPU already uses an int mask
}
```

`ColorMask` is a bitmask rather than `[4]bool`: GoFront emits `[N]T` as a typed
array and clones it on every assignment/literal, which would make any
`PipelineState` copy allocate.

`RenderBackend` gains `ApplyState(*PipelineState)` and drops `SetBlendState`,
`SetDepthState`, `SetCullState`, `SetPolygonOffset`, `SetColorMask`.
`SetDepthRange`, `SetViewport`, `Clear`, `BindFramebuffer` stay separate — they
are not pipeline state in WebGPU terms.

Presets are package-level vars in `rendering/renderpasses.go`:
`stateOpaque`, `stateShadow`, `stateLightingAdditive`, `stateTransparent`,
`stateBillboardAdditive`, `stateSkybox`, `statePostProcess`. Each pass applies
one preset on entry and `stateOpaque` on exit — no more mirror-image undo
sequences.

Underlying string values are unchanged so the WebGL2 backend's lookup tables
and the WebGPU `pipeKey` keep working. The WebGPU backend can later hash
`*PipelineState` directly instead of concatenating strings, but that is an
optimisation, not part of this plan.

### Phase 4 — Slim the `Entity` interface

**Problem.** `Entity` demands `Render`, `RenderShadow`, `RenderWireFrame`,
`UpdateBoundingVolume` from lights, skyboxes and emitters that have no
meaningful implementation of half of them. `EntityBase` carries mesh-only
state (`ShadowHeight*`, `ShadowSample*`, `ProbeFrame/ProbeColor`) on every
light. Passes bucket by `visible[TypeX]` and then type-assert anyway
(`sky.Items[i].(*SkyboxEntity)`).

**Change.**

```go
// package scene
type Entity interface {
    GetBase() *EntityBase
    Update(frameTime float32) bool
    Dispose()
}
```

`Drawable`/`LightDrawable` (Phase 2) are implemented by the concrete types
that need them. `EntityBase` keeps `Type`, `Visible`, `IsStatic`, matrices,
`BoundingBox`, `Collider`, `UserData`, `Callback`. Mesh-only state moves to:

```go
type shadowState struct {
    Height, SampleX, SampleY, SampleZ float32
    HeightState, SampleFrame            int
    SampleValid                         bool
}
type probeCache struct { Frame int; R, G, B float32 }
```

held as named fields (`Shadow shadowState`, `Probe probeCache`) on `MeshEntity`,
`FPSMeshEntity`, `SkinnedMeshEntity` only. Named fields, not embedding: GoFront
does not expose promoted fields of embedded structs (the reason `GetBase()`
exists), and struct-typed fields are cloned on assignment, so callers must
mutate in place (`m.Shadow.Height = …`) and never copy the struct out.
`probeCache` uses three scalars for the same reason `ColorMask` is a bitmask.

`Scene.visible` becomes typed per kind (`visibleMeshes []*MeshEntity`,
`visiblePointLights []*PointLightEntity`, …) so the accessors return
`[]Drawable` via a pre-allocated interface slice refreshed during culling
(one interface conversion per visible entity per frame, no allocation).

**Rejected:** generics-based `entityList[T]`. GoFront has no generics; the
per-kind fields are nine short declarations and read fine.

### Phase 5 — `engine.go` cleanup

- Remove the nine `scene == nil`/`scene != nil` branches in `Renderer.Render`
  and the passes. `engine.ActiveScene` is required; `engine.Start()` returns an
  `error` (logged via `GlobalConsole`) if called without one — the engine
  packages contain no `panic` today and this plan does not introduce one.
  `rendering_test.go` uses a `nopScene` fixture instead of `nil`.
- `bindGeometryShader()` double call in `RenderWorldGeometry`
  (`scene/renderpasses.go:281,285`) disappears with Phase 2; verify no
  equivalent duplicate lands in `worldGeomPass`.
- `scene.RegisterDebugCommands` moves here (Phase 1).
- Sweep the 14 comments in `engine/` that still cite `renderer.js`,
  `scene.js` etc.; describe the Go code, not the JS it was ported from.
- `RenderOptions` is populated once per frame from `ActiveSettings` in
  `engine.frame()`; it is the *only* path settings take into rendering.
  Fields that no pass reads (`ShowStats` etc.) are dropped from it.
- `SelectBackend` / `Init` unchanged.

### Phase 6 — Docs

Update `docs/rendering.md` (pass table: who binds what) and `docs/scene.md`
(`Entity` vs `Drawable`, accessor list). Update the "Branch State" section in
`archive/gofront-rewrite-plan.md` to reference this plan. No new doc files
beyond this one.

---

## Migration Order & Checkpoints

| Step | Packages touched | Checkpoint |
|---|---|---|
| 1a | `rendering` | `Renderer` owns `Shaders`/`Shapes`/`Stats`; `Mesh`/`Shader`/`Texture` take backend param; `gofront test app/src/engine/rendering` green |
| 1b | `scene`, `engine`, `game`, `physics`, `systems` | all cross-package global reads replaced (incl. `ActiveDebugOptions`, `ActiveCamera*`, `ActiveFrustumPlanes`); `RaycastProvider` wired; `RegisterDebugCommands` in `engine`; `gofront test` for `scene`, `physics`, `game` green; `npm run test:dom` green |
| 2 | `rendering`, `scene` | `Drawable`/`SceneSource` accessors; loops moved; scene tests rewritten to assert on `visible` buckets, renderer tests use `mockScene` returning fixed `Drawable` slices |
| 3 | `rendering`, `webgl`, `webgpu` | typed enums + `PipelineState`; `MockBackend` records `ApplyState` calls; recorded call sequence for a frame compared against a golden list |
| 4 | `scene` | slim `Entity`, typed buckets, `shadowState`/`probeCache` |
| 5 | `engine`, `rendering` | nil-scene paths removed |
| 6 | `docs` | — |

Visual regression check after steps 1b, 2, 3, 4: run `npm run dev`, load
`arenas/demo`, compare against a reference screenshot on both backends
(`?backend=webgl2`, `?backend=webgpu`). A single `RenderStats` snapshot
(`MeshCount`, `LightCount`, `TriangleCount`) on frame 120 of the demo arena
must match before/after for each step.

---

## Edge Cases

- **Re-sliced accessor lifetime.** `Meshes()` etc. alias `Scene.visible`
  storage; a pass must not call `Scene.Update`/`Add`/`Remove` mid-frame.
  Document on the interface; `Scene` asserts `!s.inRender` in `Add`/`Remove`
  under `gofront test` builds.
- **Method values.** GoFront emits method values unbound
  (see `NewScene` closure comment). `RaycastProvider` must be an interface,
  never `func` fields assigned from methods.
- **Shadow raycast budget moves out of the render pass.** It currently runs
  inside `RenderShadows` and depends on the shadow-sorted order (largest
  screen-size first). `UpdateShadowHeights` must run *after* culling in
  `Scene.Update` and still use the screen-size sort so the same meshes get
  their raycast in the same frame.
- **Light sorting moves into the renderer.** `Scene.ensureLightsSorted` caches
  by `lightsSortedFrame`; the renderer's `lightingPass` and
  `transparentPass` both need the sorted result in the same frame — sort once
  in `Render()` into `Renderer`-owned `LightSorter`s.
- **WebGPU shadow-blur skip** (`shadowBlurPass` early-return on WebGPU) is a
  driver workaround, not scene logic; keep it in the renderer untouched.
- **Zero-allocation invariant.** Interface-slice refresh during culling and
  `PipelineState` presets must not allocate per frame. Check with the browser
  allocation profiler on frame 100–200 of the demo arena: 0 bytes from
  `engine/*` frames.
- **Tests that read globals.** `scene_test.go:559–729` (7 sites) and
  `rendering_test.go:70–109` (20 sites) assert on
  `ActiveRenderStats`/`GlobalShapes`; they move to `renderer.Stats` /
  `renderer.Shapes`.
- **`Renderer.Stats` as a value field.** GoFront clones struct-typed fields on
  assignment, so `st := r.Stats` allocates. The stats overlay and the `stats`
  console command must read `r.Stats.MeshCount` etc. field-by-field, or `Stats`
  becomes `*RenderStats` allocated once in `NewRenderer`. Same rule for
  `Renderer.Debug`.
- **`game/` touches `EntityBase` directly.** 15 sites use `x.Base.Field`
  (`arena.go:331,335`, …) and 4 use `GetBase()`. Phase 4 only moves mesh-only
  fields, so these keep compiling; grep `\.Base\.(Shadow|Probe)` to confirm
  none reach the moved state.
- **Entities constructed by game code** (`game/`) call `NewMeshEntity(...)`
  etc. and may pass `rendering.Shaders.X`; constructor signatures that took a
  shader must now be given `renderer.Shaders.X` or resolve the shader inside
  the pass instead.

---

## Test Plan

- **Unit — `rendering`:**
  `Renderer.Render` against `MockBackend` + `mockScene` returning fixed
  `Drawable` fakes; assert recorded backend call order per pass, `ApplyState`
  presets in the right places, `Stats` totals, light sort order by
  `LightScore`. Golden sequence for a one-mesh/one-point-light/one-skybox
  frame, both `IsWebGPU()` branches.
- **Unit — `scene`:**
  culling fills the right typed buckets; accessors alias `visible` storage
  and return `Count`-length slices; `UpdateShadowHeights` honours budget and
  order; `Scene` satisfies `physics.RaycastProvider`; `Add`/`Remove` during
  render is rejected.
- **Unit — `physics`:**
  `FPSController`/`DynamicBody` with a stub `RaycastProvider`; no reference
  to a package-level provider remains (`grep GlobalRaycastStatic` is empty).
- **Unit — `webgl`, `webgpu`:**
  `ApplyState` maps every `PipelineState` field to the same GL calls /
  `pipeKey` as the old five setters (table-driven).
- **Integration (`gofront test --dom`):**
  `engine.Init` → `NewScene` → one `frame()` with a real `Scene` and
  `MockBackend`; `RenderStats` for the demo-arena entity set equals the
  pre-refactor snapshot.
- **Negative cases:**
  `engine.Start()` without `ActiveScene` panics with the expected message;
  `Scene.Add` during a pass panics in test builds; `ApplyState(nil)` is a
  no-op, not a crash.
- **Manual:**
  demo arena on WebGL2 and WebGPU, reference screenshot diff; `stats` console
  command shows identical counts; allocation profiler shows 0 bytes/frame
  from engine packages.

---

## Go-Idiom Audit (outside this plan's scope)

Findings from re-checking the tree against conventional Go layout. None block
the phases above; each is a candidate follow-up, listed so it is a conscious
decision rather than an omission.

- **Interfaces on the consumer side.** Already correct for `RenderBackend`
  (rendering), `SceneSource`/`Drawable` (rendering) and `RaycastProvider`
  (physics). `scene.Entity` is implementer-side, which is fine: its only
  consumer is `Scene`.
- **`Get*` getters.** ~50 (`GetBase`, `GetWidth`, `GetTexture`, …). Go style
  drops the prefix, but `GetBase()` exists because GoFront cannot promote
  embedded fields and a `Base` field plus a `Base()` method is illegal Go.
  Renaming would mean `base EntityBase` (unexported) + `Base()`, touching the
  15 `x.Base.` sites in `game/`. Not worth a churn pass on its own; do it only
  if Phase 4 is already rewriting those call sites.
- **`systems` is a grab-bag.** `camera`, `settings`, `console`, `input`,
  `network`, `sound`, `stats`, `binaryreader` share a package by history, not
  cohesion — the Go equivalent of `util/`. After Phase 1 the only engine-side
  import of `systems` is `scene → systems.Camera`. Natural homes if split later:
  `binaryreader` → `assets`, `camera` → `rendering` (it already aliases
  `rendering.CameraView` data), `network` → own package. Folder moves are
  excluded by this plan; record the intent in `roadmap.md`.
- **Backend file size.** `webgpubackend.go` (~2250 lines) and
  `webglbackend.go` (~1300 lines) are single files. Splitting a package across
  files (`buffers.go`, `textures.go`, `pipeline.go`, `state.go`) is not a
  folder restructure and is zero-risk; a good warm-up for Phase 3 since
  `ApplyState` lands in exactly those files.
- **Relative imports** (`"../physics"`) are a GoFront requirement, not a
  style choice; nothing to do.
- **Constructors return concrete types** (`*Renderer`, `*Scene`, `*WebGLBackend`)
  — correct Go practice, keep.
- **No `panic` in engine packages.** Keep it that way (see Phase 5).
