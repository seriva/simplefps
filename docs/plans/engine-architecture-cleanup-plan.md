# Engine Architecture Cleanup — Design Plan

**Version:** v2.2.0
**Status:** Draft
**Depends on:** `gofront-rewrite-plan.md` Phases 1–5 (complete on branch `gofront`)

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
- **Touching the legacy `.js` modules.** They are deleted by the rewrite plan's
  later phases, not modified here.
- **Game package changes** other than what the `Scene`/`engine` API changes
  force (constructor arguments, no behavioural change).

---

## Approach

Work is ordered so each phase compiles and passes tests on its own. Phases 1–3
are the core; 4–6 are mechanical follow-ups that become easy once 1–3 land.

### Phase 1 — Kill hot-path globals (`rendering`, `physics`, `systems`)

**Problem.** `rendering.ActiveBackend`, `rendering.Shaders`, `rendering.GlobalShapes`,
`rendering.ActiveRenderStats`, `physics.GlobalRaycastStatic` and
`systems.ActiveSettings` are the JS singletons carried over. 85 call sites across
`scene/` and `engine.go` read them. `NewScene()` silently overwrites
`physics.GlobalRaycastStatic` as a side effect. Tests must poke globals before
constructing anything.

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

- `systems.ActiveSettings` stays as the single settings store (it *is* the
  user-facing config), but nothing under `rendering/` or `scene/` reads it.
  `engine.go` already copies settings into `rendering.RenderOptions` each
  frame; `scene/renderpasses.go:220,306` (`ProceduralDetail`) switch to the
  value the renderer passes down. Rule: settings are read in `engine` and
  `game`, nowhere deeper.

**Rejected:** a `Context` struct threaded everywhere. `*Renderer` already exists
and is passed into every pass; adding a second bag of pointers is noise.

### Phase 2 — Move the seam: renderer pulls, scene provides

**Problem.** `scene/renderpasses.go` (≈350 lines) owns the per-pass loops,
shader binds, uniform setup (`proceduralNoise`, `positionBuffer` slots), skybox
depth-state toggling and stats accounting. `rendering/renderpasses.go` owns
framebuffer + blend/depth/cull setup. Neither package can be understood alone,
and the renderer cannot be tested against a fake scene without reimplementing
half a pass.

**Change.** Invert `SceneSource` from "scene renders on request" to "scene
hands out culled lists":

```go
// package rendering

// Drawable is the only thing a pass needs from an entity.
type Drawable interface {
    Draw(r *Renderer, sh *Shader, mode MaterialMode, probe []float32)
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

type SceneSource interface {
    Ambient(out *physics.Vec3)
    ProbeColor(d Drawable, out []float32)      // was Scene.sampleProbeColor
    Skyboxes() []Drawable
    Meshes() []Drawable                       // opaque world geometry
    FPSMeshes() []Drawable
    SkinnedMeshes() []Drawable
    DirectionalLights() []Drawable
    PointLights() []LightDrawable
    SpotLights() []LightDrawable
    Billboards() []Drawable
    ParticleEmitters() []Drawable
    TransparentGroups() []TransparentGroup    // pre-sorted back-to-front by scene
}
```

Each accessor returns `s.visible[TypeX].Items[:Count]` — a re-slice, zero
allocation, valid until the next `Scene.Update`.

Responsibilities after the move:

| Concern | Before | After |
|---|---|---|
| Frustum culling, `visible[]` buckets | scene | scene |
| Shadow raycast budget, `ShadowHeight*` state | scene | scene (`Scene.UpdateShadowHeights(budget)` called by `Scene.Update`, not by a pass) |
| Light sorting (`LightSorter`), transparent sort | scene | rendering (`Renderer.lightingPass` sorts `LightDrawable` by `LightScore`) |
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
strings on ~60 call sites. Every pass issues 4–6 `Set*State` calls and then
undoes them by hand. The WebGPU backend already reduces these setters to a
`pipeKey` string for its `PipelineCache`
([webgpubackend.go:1625](../../app/src/engine/rendering/webgpu/webgpubackend.go#L1625)),
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
    ColorMask   [4]bool
}
```

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
type probeCache struct { Frame int; Color [3]float32 }
```

embedded in `MeshEntity`, `FPSMeshEntity`, `SkinnedMeshEntity` only.

`Scene.visible` becomes typed per kind (`visibleMeshes []*MeshEntity`,
`visiblePointLights []*PointLightEntity`, …) so the accessors return
`[]Drawable` via a pre-allocated interface slice refreshed during culling
(one interface conversion per visible entity per frame, no allocation).

**Rejected:** generics-based `entityList[T]`. GoFront has no generics; the
per-kind fields are nine short declarations and read fine.

### Phase 5 — `engine.go` cleanup

- Remove the `scene == nil` branches in `Renderer.Render` and every pass.
  `engine.ActiveScene` is required; `engine.Init` panics with a clear message
  if `Start()` is called without one. `rendering_test.go` uses a `nopScene`
  fixture instead of `nil`.
- `bindGeometryShader()` double call in `RenderWorldGeometry` disappears with
  Phase 2; verify no equivalent duplicate lands in `worldGeomPass`.
- `RenderOptions` is populated once per frame from `ActiveSettings` in
  `engine.frame()`; it is the *only* path settings take into rendering.
  Fields that no pass reads (`ShowStats` etc.) are dropped from it.
- `SelectBackend` / `Init` unchanged.

### Phase 6 — Docs

Update `docs/rendering.md` (pass table: who binds what) and `docs/scene.md`
(`Entity` vs `Drawable`, accessor list). Update the "Branch State" section in
`gofront-rewrite-plan.md` to reference this plan. No new doc files beyond this
one.

---

## Migration Order & Checkpoints

| Step | Packages touched | Checkpoint |
|---|---|---|
| 1a | `rendering` | `Renderer` owns `Shaders`/`Shapes`/`Stats`; `Mesh`/`Shader`/`Texture` take backend param; `gofront test app/src/engine/rendering` green |
| 1b | `scene`, `engine`, `game` | all 85 global reads replaced; `RaycastProvider` wired; `gofront test` for `scene`, `game` green; `npm run test:dom` green |
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
- **Tests that read globals.** `scene_test.go:559–729` and
  `rendering_test.go:104–109` assert on `ActiveRenderStats`/`GlobalShapes`;
  they move to `renderer.Stats` / `renderer.Shapes`.
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
