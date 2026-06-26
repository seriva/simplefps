# Worker-Based Binary Asset Parsing Implementation Plan

**Goal:** Offload binary asset parsing (mesh, skinned mesh, animation) from the main thread to a Web Worker using `Transferable` ArrayBuffers, so large asset loads don't block the game loop or UI.

**Architecture:** A single persistent `AssetWorker` is spawned once at engine init. `Resources.fetch()` sends raw `ArrayBuffer`s to the worker via `postMessage` with transfer (zero-copy). The worker parses the binary format and posts back a structured JS object (plain data — no class instances, no GPU objects). The main thread receives the parsed data and constructs the engine objects (`Mesh`, `SkinnedMesh`, `Animation`) as normal. JSON-format assets and textures remain on the main thread (textures need `ImageBitmap` which has its own worker path; JSON parsing is fast enough to not warrant a worker).

**Tech Stack:** ES6 modules, Web Workers (`new Worker(url, { type: 'module' })`), `Transferable` ArrayBuffer, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths. Worker is load-time only — not on the hot path.
- Log via `Console.log/warn/error` on main thread. Worker uses `postMessage` to relay errors; never `console.*` in production worker code.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.
- Worker file must be a standard ES module (`type: 'module'`) so it can import shared parsing utilities if needed.
- Worker cannot access DOM, WebGL context, WebGPU device, or any engine singleton — only pure data transformation.

---

## Task 1: Extract Binary Parsing Logic Into Pure Functions

### What & Why

Before moving parsing to a worker, the binary parsing code must be pure functions that take an `ArrayBuffer` and return plain JS objects (no class construction, no GPU calls). Currently parsing is embedded inside `Mesh`, `SkinnedMesh`, and `Animation` constructors/initializers. Extract the data-extraction portion from the object-construction portion.

### Files

- Read: `app/src/engine/rendering/mesh.js` — find binary (`bmesh`) parse path
- Read: `app/src/engine/rendering/skinnedmesh.js` — find binary (`sbmesh`) parse path
- Read: `app/src/engine/animation/animation.js` — find binary (`banim`) parse path
- Create: `app/src/engine/systems/assetparser.js` — pure parse functions, no engine deps

### Interfaces

- Produces:
  - `parseBinaryMesh(buffer: ArrayBuffer) → MeshData` where `MeshData = { vertices: Float32Array, indices: Uint16Array|Uint32Array, ... }` (exact shape determined by reading mesh.js)
  - `parseBinarySkinnedMesh(buffer: ArrayBuffer) → SkinnedMeshData`
  - `parseBinaryAnimation(buffer: ArrayBuffer) → AnimationData`
  - All return plain objects with typed arrays — no class instances

---

- [ ] **Step 1: Read binary parse paths in mesh.js, skinnedmesh.js, animation.js**

  For each file, find the branch that handles binary input (the `bmesh`/`sbmesh`/`banim` path from `resources.js`). Note:
  - What fields are read from the buffer (offsets, strides, counts)
  - What the constructor does with those fields: pure data storage vs GPU upload calls
  - Which parts are pure data extraction vs engine-object construction

- [ ] **Step 2: Create app/src/engine/systems/assetparser.js**

  Start with the binary mesh parser. Structure:

  ```javascript
  /**
   * Pure binary asset parsers — no engine deps, no GPU calls, safe to run in a Worker.
   * Input: raw ArrayBuffer from fetch. Output: plain JS object with typed arrays.
   */

  function parseBinaryMesh(buffer) {
      const view = new DataView(buffer)
      // Replicate the exact byte-reading logic currently in Mesh constructor/init
      // for the binary path. Return a plain object:
      return {
          positions: new Float32Array(buffer, posOffset, posCount * 3),
          normals:   new Float32Array(buffer, normOffset, normCount * 3),
          uvs:       new Float32Array(buffer, uvOffset, uvCount * 2),
          indices:   new Uint16Array(buffer, idxOffset, idxCount),
          // ... other fields found in Step 1
      }
  }

  function parseBinarySkinnedMesh(buffer) {
      const view = new DataView(buffer)
      // Mirror the same pattern as parseBinaryMesh above, but reading the fields
      // documented in Step 1 for skinnedmesh.js (joint indices, weights, bind poses, etc.)
      // Return shape must match what SkinnedMesh.fromParsed() expects in Task 3 Step 1.
      return {
          positions:    new Float32Array(buffer, posOffset, posCount * 3),
          normals:      new Float32Array(buffer, normOffset, normCount * 3),
          uvs:          new Float32Array(buffer, uvOffset, uvCount * 2),
          indices:      new Uint16Array(buffer, idxOffset, idxCount),
          jointIndices: new Uint8Array(buffer, jointIdxOffset, posCount * 4),
          jointWeights: new Float32Array(buffer, jointWtOffset, posCount * 4),
          // ... other fields from Step 1 (bind pose matrices, joint count, etc.)
      }
  }

  function parseBinaryAnimation(buffer) {
      const view = new DataView(buffer)
      // Mirror same pattern, reading fields documented in Step 1 for animation.js
      // (frame rate, frame count, joint count, per-frame pose data).
      // Return shape must match what Animation.fromParsed() expects in Task 3 Step 1.
      return {
          frameRate:  view.getFloat32(0, true),
          numFrames:  view.getUint32(4, true),
          jointCount: view.getUint32(8, true),
          frames:     new Float32Array(buffer, framesOffset, numFrames * jointCount * 8),
          // ... other fields from Step 1
      }
  }

  export { parseBinaryMesh, parseBinarySkinnedMesh, parseBinaryAnimation }
  ```

  Fill in actual byte offsets and field names from Step 1 findings.

- [ ] **Step 3: Verify parsers produce identical output to current constructors**

  Add a temporary debug call in `resources.js` (do not commit this):

  ```javascript
  // Temporary verification — remove before commit
  import { parseBinaryMesh } from "../systems/assetparser.js"
  const parsed = parseBinaryMesh(buffer)
  console.log("parseBinaryMesh output:", parsed)
  ```

  Load a `.bmesh` asset and confirm field shapes match what the current `Mesh` constructor receives.

- [ ] **Step 4: Remove temporary debug call**

  Delete the temporary `console.log` added in Step 3.

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/systems/assetparser.js
  git commit -m "refactor(assets): extract binary parse logic into pure functions in assetparser.js

  Prerequisite for worker-based parsing. Parsing logic extracted from Mesh,
  SkinnedMesh, and Animation constructors into pure functions that take an
  ArrayBuffer and return plain typed-array objects. No GPU calls, no engine
  deps — safe to run in a Web Worker."
  ```

---

## Task 2: Create the Asset Worker

### What & Why

A Web Worker that receives `{ type, buffer }` messages, calls the appropriate parser from `assetparser.js`, and posts back `{ id, type, data }`. The `buffer` is transferred (zero-copy) to the worker. The parsed typed arrays in `data` are transferred back.

### Files

- Create: `app/src/engine/systems/assetworker.js` — the worker script
- Note: this file is the worker entry point. It must be a self-contained ES module.

### Interfaces

- Receives message: `{ id: string, type: 'bmesh'|'sbmesh'|'banim', buffer: ArrayBuffer }`
- Posts message: `{ id: string, type: string, data: MeshData|SkinnedMeshData|AnimationData }` with typed arrays transferred back

---

- [ ] **Step 1: Create app/src/engine/systems/assetworker.js**

  ```javascript
  import { parseBinaryMesh, parseBinarySkinnedMesh, parseBinaryAnimation } from "./assetparser.js"

  const _parsers = {
      bmesh:  parseBinaryMesh,
      sbmesh: parseBinarySkinnedMesh,
      banim:  parseBinaryAnimation,
  }

  self.onmessage = function (e) {
      const { id, type, buffer } = e.data
      const parser = _parsers[type]

      if (!parser) {
          self.postMessage({ id, type, error: `Unknown asset type: ${type}` })
          return
      }

      let data
      try {
          data = parser(buffer)
      } catch (err) {
          self.postMessage({ id, type, error: err.message })
          return
      }

      // Collect all transferable typed arrays from data to transfer zero-copy
      const transferables = []
      for (const key of Object.keys(data)) {
          if (ArrayBuffer.isView(data[key])) {
              transferables.push(data[key].buffer)
          }
      }

      self.postMessage({ id, type, data }, transferables)
  }
  ```

- [ ] **Step 2: Verify worker loads in browser without errors**

  Temporarily spawn the worker manually in browser devtools console:

  ```javascript
  const w = new Worker('/src/engine/systems/assetworker.js', { type: 'module' })
  w.onerror = e => console.error(e)
  w.onmessage = e => console.log(e.data)
  w.postMessage({ id: 'test', type: 'bmesh', buffer: new ArrayBuffer(0) })
  ```

  Expected: either a parse error message (empty buffer) or a data object. No module load errors.

- [ ] **Step 3: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/systems/assetworker.js
  git commit -m "feat(assets): add AssetWorker for off-thread binary parsing

  Web Worker entry point that receives ArrayBuffer messages, dispatches to
  parseBinaryMesh/SkinnedMesh/Animation, and transfers parsed typed arrays
  back to the main thread zero-copy via Transferable."
  ```

---

## Task 3: Integrate Worker Into Resources.load()

### What & Why

`Resources.load()` currently fetches and parses assets synchronously on the main thread. For binary types (`bmesh`, `sbmesh`, `banim`), redirect to the worker: fetch the buffer on the main thread (network I/O is already async), transfer it to the worker, await the parsed result, then construct the engine object from the returned data.

### Files

- Modify: `app/src/engine/systems/resources.js` — spawn worker once, replace binary fetch+parse with worker dispatch
- Modify: `app/src/engine/rendering/mesh.js` — add `Mesh.fromParsed(data)` static factory (accepts plain object, skips re-parsing)
- Modify: `app/src/engine/rendering/skinnedmesh.js` — add `SkinnedMesh.fromParsed(data)`
- Modify: `app/src/engine/animation/animation.js` — add `Animation.fromParsed(data)`

### Interfaces

- Consumes: `parseBinaryMesh` output shape (`MeshData`) — must match `Mesh.fromParsed()` input exactly
- Produces:
  - `Mesh.fromParsed(data: MeshData) → Mesh` — named export static method
  - `SkinnedMesh.fromParsed(data: SkinnedMeshData) → SkinnedMesh`
  - `Animation.fromParsed(data: AnimationData) → Animation`

---

- [ ] **Step 1: Add fromParsed() static factories**

  In `mesh.js`, add alongside the existing constructor:

  ```javascript
  static fromParsed(data) {
      // Construct Mesh from pre-parsed plain object (from worker)
      // Copy the constructor path that handles binary data but skip the
      // DataView / BinaryReader parsing — data fields are already typed arrays
      const mesh = new Mesh()
      mesh._positions = data.positions
      mesh._normals   = data.normals
      mesh._uvs       = data.uvs
      mesh._indices   = data.indices
      // ... other fields from MeshData
      mesh._uploadToGPU()  // GPU upload must happen on main thread
      return mesh
  }
  ```

  Fill in actual field names from Task 1 Step 1 findings. Repeat for `SkinnedMesh.fromParsed()` and `Animation.fromParsed()`.

- [ ] **Step 2: Spawn worker once in resources.js**

  At module scope in `resources.js`, add:

  ```javascript
  let _worker = null
  let _workerPending = new Map()  // id → { resolve, reject }
  let _workerIdCounter = 0

  function _getWorker() {
      if (_worker) return _worker
      _worker = new Worker(
          new URL("./assetworker.js", import.meta.url),
          { type: "module" }
      )
      _worker.onmessage = (e) => {
          const { id, data, error } = e.data
          const pending = _workerPending.get(id)
          if (!pending) return
          _workerPending.delete(id)
          if (error) pending.reject(new Error(error))
          else pending.resolve(data)
      }
      _worker.onerror = (e) => {
          Console.error(`AssetWorker error: ${e.message}`)
      }
      return _worker
  }

  function _parseInWorker(type, buffer) {
      return new Promise((resolve, reject) => {
          const id = String(_workerIdCounter++)
          _workerPending.set(id, { resolve, reject })
          _getWorker().postMessage({ id, type, buffer }, [buffer])
          // buffer is transferred — do not use it after this line
      })
  }
  ```

- [ ] **Step 3: Update binary resource types to use worker**

  In `resources.js`, in `_RESOURCE_TYPES`, update the binary handlers:

  ```javascript
  // Before:
  bmesh:  (data) => new Mesh(data, ...),
  sbmesh: (data) => new SkinnedMesh(data, ...),
  banim:  (data) => new Animation(data, ...),

  // After (async handlers — resources.js must support async type handlers):
  bmesh:  async (data) => {
      const parsed = await _parseInWorker("bmesh", data)
      return Mesh.fromParsed(parsed)
  },
  sbmesh: async (data) => {
      const parsed = await _parseInWorker("sbmesh", data)
      return SkinnedMesh.fromParsed(parsed)
  },
  banim:  async (data) => {
      const parsed = await _parseInWorker("banim", data)
      return Animation.fromParsed(parsed)
  },
  ```

  Check whether `_RESOURCE_TYPES` handlers are currently awaited in the load pipeline. If the pipeline uses `Promise.all()` on handler results, async handlers will work transparently. If handlers are called synchronously and their return value used directly, the pipeline needs to `await` the handler result — update accordingly.

- [ ] **Step 4: Verify deduplication still works**

  `Resources.load()` deduplicates via `_loadingPromises`. Confirm the promise stored is the one returned by the async handler (which now includes worker round-trip). Multiple simultaneous requests for the same `bmesh` should still only result in one worker parse.

- [ ] **Step 5: Smoke test — load time and correctness**

  `npm run dev`. Load a map with binary mesh assets. Confirm:
  - All meshes render correctly (no missing geometry)
  - Browser devtools Performance tab shows main thread not blocked during asset parse (look for gaps in the main thread flame chart during load)
  - No errors in browser console or in-game console
  - Load completes (all `Resources.onLoadEnd` callbacks fire)

- [ ] **Step 6: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/systems/resources.js app/src/engine/rendering/mesh.js app/src/engine/rendering/skinnedmesh.js app/src/engine/animation/animation.js
  git commit -m "feat(assets): parse binary assets off main thread via Web Worker

  Binary mesh, skinned mesh, and animation assets are now parsed in a
  persistent AssetWorker. ArrayBuffers are transferred zero-copy to the
  worker; parsed typed arrays are transferred back. GPU upload (fromParsed)
  still happens on the main thread. Main thread no longer blocks on large
  binary asset parsing during load."
  ```

---

## Self-Review

**Spec coverage:**

| Finding | Task |
|---------|------|
| Binary asset parsing blocks main thread | Tasks 1–3 ✓ |
| Zero-copy transfer of ArrayBuffer | Task 2 (postMessage with Transferable) ✓ |
| GPU upload must stay on main thread | Task 3 Step 1 (`_uploadToGPU()` in `fromParsed()`) ✓ |
| Deduplication must survive async handlers | Task 3 Step 4 ✓ |
| JSON and texture assets excluded (not bottleneck) | Noted in Architecture, not implemented ✓ |

**Placeholder scan:** Task 1 Step 2 says "fill in actual byte offsets from Step 1 findings" — this is intentional branching on read results, not a placeholder. The worker message protocol, transfer list, and fromParsed pattern are all fully specified.

**Type consistency:** `parseBinaryMesh → MeshData`, `Mesh.fromParsed(MeshData)` — consistent across Tasks 1, 2, 3. `_parseInWorker(type, buffer)` used in Task 3 Step 3, defined in Task 3 Step 2.
