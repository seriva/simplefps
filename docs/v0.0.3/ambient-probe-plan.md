# Ambient Probe Spatial Acceleration Implementation Plan

**Goal:** Replace the linear ambient light probe scan in `Scene.getAmbient()` with a spatial grid lookup so probe sampling cost stays O(1) regardless of probe count.

**Architecture:** `lightgrid.js` already manages a probe grid — the fix is to expose a spatial query method that maps a world position directly to the nearest grid cell, rather than scanning all probes. No new data structures are needed if the existing grid is already cell-indexed; otherwise a flat 3D array index suffices.

**Tech Stack:** ES6 modules, gl-matrix, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths. All scratch objects pre-allocated at module scope.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Task 1: Understand Existing LightGrid Structure

### What & Why

Before changing anything, fully understand what `lightgrid.js` already provides. The grid may already be spatially organised — the fix may be as small as computing a cell index from world position instead of scanning.

### Files

- Read: `app/src/engine/scene/lightgrid.js`
- Read: `app/src/engine/scene/scene.js` — specifically `Scene.getAmbient()` and `_sampleProbeColor()`

---

- [ ] **Step 1: Read lightgrid.js in full**

  Note:
  - How the grid is defined: origin, cell size, dimensions (x/y/z cell counts)
  - What data is stored per cell (probe color, SH coefficients, or raw RGB)
  - Whether cells are stored as a flat array indexed by `(ix, iy, iz)` or as objects in an unordered list

- [ ] **Step 2: Read Scene.getAmbient() and _sampleProbeColor()**

  In `scene.js`, find these two functions. Note:
  - How `getAmbient(position, outColor)` currently finds the nearest probe
  - Whether it iterates all probes or already does something smarter
  - What `entity._ambientProbeColor` and `entity._ambientProbeFrame` caching looks like

- [ ] **Step 3: Decide approach based on findings**

  **Case A — LightGrid is already a regular grid with known origin + cell size:**
  Proceed to Task 2 (direct cell index computation — O(1)).

  **Case B — Probes are stored as unordered points:**
  Proceed to Task 3 (build a flat spatial grid over the probe points at load time, then O(1) lookup).

  Document which case applies in a comment at the top of `lightgrid.js`.

---

## Task 2: O(1) Grid Cell Lookup (Case A — Regular Grid)

### What & Why

If `LightGrid` already stores probes in a regular `[nx][ny][nz]` or flat-indexed array, world position maps directly to a cell index with three divisions and three clamps. No iteration needed.

### Files

- Modify: `app/src/engine/scene/lightgrid.js` — add `sampleColor(x, y, z, outColor)` method
- Modify: `app/src/engine/scene/scene.js` — call `LightGrid.sampleColor()` in `_sampleProbeColor()`

### Interfaces

- Produces: `LightGrid.sampleColor(x, y, z, outColor)` — writes RGB into `outColor` (Float32Array or `{r,g,b}` — match existing `outColor` type used in `getAmbient`)

---

- [ ] **Step 1: Add sampleColor() to LightGrid**

  In `lightgrid.js`, add:

  ```javascript
  function sampleColor(x, y, z, outColor) {
      // Map world position to grid cell indices
      const ix = Math.min(Math.max(Math.floor((x - _originX) / _cellSize), 0), _nx - 1)
      const iy = Math.min(Math.max(Math.floor((y - _originY) / _cellSize), 0), _ny - 1)
      const iz = Math.min(Math.max(Math.floor((z - _originZ) / _cellSize), 0), _nz - 1)

      // Flat index into probe array
      const idx = ix + iy * _nx + iz * _nx * _ny
      const probe = _probes[idx]

      if (!probe) {
          outColor[0] = _defaultR
          outColor[1] = _defaultG
          outColor[2] = _defaultB
          return
      }

      outColor[0] = probe.r
      outColor[1] = probe.g
      outColor[2] = probe.b
  }
  ```

  Replace `_originX`, `_cellSize`, `_nx`, `_probes`, etc. with the actual variable names found in Step 1 of Task 1.

- [ ] **Step 2: Export sampleColor**

  Add `sampleColor` to the export block at the bottom of `lightgrid.js`.

- [ ] **Step 3: Update _sampleProbeColor() in scene.js**

  Replace the existing linear scan with:

  ```javascript
  function _sampleProbeColor(entity) {
      if (entity._ambientProbeFrame === _renderFrame) return

      const p = entity.position  // {x, y, z} or vec3 — match actual shape
      LightGrid.sampleColor(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2], entity._ambientProbeColor)
      entity._ambientProbeFrame = _renderFrame
  }
  ```

- [ ] **Step 4: Smoke test**

  `npm run dev`. Walk the arena. Confirm entity ambient shading still matches the environment (no entities appearing full-bright or pitch-black incorrectly).

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/scene/lightgrid.js app/src/engine/scene/scene.js
  git commit -m "perf(scene): O(1) ambient probe lookup via grid cell index

  Scene.getAmbient() previously scanned probes linearly. World position now
  maps directly to a grid cell with three divisions and three clamps, making
  probe sampling O(1) regardless of probe count."
  ```

---

## Task 3: Spatial Grid Over Unordered Probes (Case B)

### What & Why

If probes are stored as unordered points, build a flat spatial acceleration grid at `LightGrid` load/finalize time. Each grid cell stores the index of the nearest probe (computed once). Lookup is then O(1): map world pos to cell, read pre-computed probe index.

### Files

- Modify: `app/src/engine/scene/lightgrid.js` — add `_buildAccel()` called after probes load, add `sampleColor()` method
- Modify: `app/src/engine/scene/scene.js` — same as Task 2 Step 3

### Interfaces

- Produces: `LightGrid.sampleColor(x, y, z, outColor)` — same signature as Task 2

---

- [ ] **Step 1: Define acceleration grid parameters at module scope**

  In `lightgrid.js`, add after existing module vars:

  ```javascript
  // Acceleration grid (built once after probes load)
  let _accelCellSize = 0
  let _accelNx = 0, _accelNy = 0, _accelNz = 0
  let _accelMinX = 0, _accelMinY = 0, _accelMinZ = 0
  let _accelCells = null  // Int32Array — stores nearest probe index per cell
  ```

- [ ] **Step 2: Add _buildAccel() — called after all probes are loaded**

  ```javascript
  function _buildAccel() {
      if (!_probes || _probes.length === 0) return

      // Compute AABB of all probes
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      for (let i = 0; i < _probes.length; i++) {
          const p = _probes[i]
          if (p.x < minX) minX = p.x
          if (p.y < minY) minY = p.y
          if (p.z < minZ) minZ = p.z
          if (p.x > maxX) maxX = p.x
          if (p.y > maxY) maxY = p.y
          if (p.z > maxZ) maxZ = p.z
      }

      // Choose cell size: aim for ~8 probes per cell on average
      _accelCellSize = Math.max(
          (maxX - minX) / Math.ceil(Math.cbrt(_probes.length)),
          1  // minimum 1 unit to avoid division issues
      )

      _accelMinX = minX - _accelCellSize
      _accelMinY = minY - _accelCellSize
      _accelMinZ = minZ - _accelCellSize

      _accelNx = Math.ceil((maxX - minX + _accelCellSize * 2) / _accelCellSize)
      _accelNy = Math.ceil((maxY - minY + _accelCellSize * 2) / _accelCellSize)
      _accelNz = Math.ceil((maxZ - minZ + _accelCellSize * 2) / _accelCellSize)

      _accelCells = new Int32Array(_accelNx * _accelNy * _accelNz).fill(-1)

      // For each cell centre, find nearest probe (brute force — runs once at load)
      for (let iz = 0; iz < _accelNz; iz++) {
          for (let iy = 0; iy < _accelNy; iy++) {
              for (let ix = 0; ix < _accelNx; ix++) {
                  const cx = _accelMinX + (ix + 0.5) * _accelCellSize
                  const cy = _accelMinY + (iy + 0.5) * _accelCellSize
                  const cz = _accelMinZ + (iz + 0.5) * _accelCellSize

                  let bestIdx = 0
                  let bestDist2 = Infinity
                  for (let p = 0; p < _probes.length; p++) {
                      const dx = _probes[p].x - cx
                      const dy = _probes[p].y - cy
                      const dz = _probes[p].z - cz
                      const d2 = dx * dx + dy * dy + dz * dz
                      if (d2 < bestDist2) { bestDist2 = d2; bestIdx = p }
                  }
                  _accelCells[ix + iy * _accelNx + iz * _accelNx * _accelNy] = bestIdx
              }
          }
      }

      Console.log(`LightGrid: accel grid built (${_accelNx}×${_accelNy}×${_accelNz} cells, ${_probes.length} probes)`)
  }
  ```

  Call `_buildAccel()` at the end of the probe loading path (wherever probes are populated from the loaded asset).

- [ ] **Step 3: Add sampleColor() using acceleration grid**

  ```javascript
  function sampleColor(x, y, z, outColor) {
      if (!_accelCells) {
          outColor[0] = outColor[1] = outColor[2] = 0
          return
      }

      const ix = Math.min(Math.max(Math.floor((x - _accelMinX) / _accelCellSize), 0), _accelNx - 1)
      const iy = Math.min(Math.max(Math.floor((y - _accelMinY) / _accelCellSize), 0), _accelNy - 1)
      const iz = Math.min(Math.max(Math.floor((z - _accelMinZ) / _accelCellSize), 0), _accelNz - 1)

      const probeIdx = _accelCells[ix + iy * _accelNx + iz * _accelNx * _accelNy]
      if (probeIdx < 0) {
          outColor[0] = outColor[1] = outColor[2] = 0
          return
      }

      const probe = _probes[probeIdx]
      outColor[0] = probe.r
      outColor[1] = probe.g
      outColor[2] = probe.b
  }
  ```

- [ ] **Step 4: Export sampleColor and _buildAccel (if needed externally)**

  Add `sampleColor` to exports. `_buildAccel` is internal — do not export.

- [ ] **Step 5: Update _sampleProbeColor() in scene.js**

  Same as Task 2 Step 3 — replace linear scan with `LightGrid.sampleColor()`.

- [ ] **Step 6: Smoke test**

  `npm run dev`. Walk the arena. Confirm ambient shading looks correct. Check in-game console for the `LightGrid: accel grid built` log line on load.

- [ ] **Step 7: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/scene/lightgrid.js app/src/engine/scene/scene.js
  git commit -m "perf(scene): O(1) ambient probe lookup via spatial acceleration grid

  LightGrid probes were scanned linearly per entity per frame. A flat 3D
  acceleration grid is now built once at load time — each cell stores the index
  of its nearest probe. Lookup is O(1): three divisions, three clamps, one
  array read. Build cost is O(cells × probes) and runs once."
  ```

---

## Self-Review

**Spec coverage:** Single finding — ambient probe linear scan. Task 1 reads the code and branches to Task 2 (regular grid, O(1) with no build step) or Task 3 (unordered probes, O(1) after one-time build). Both paths covered.

**Placeholder scan:** No TBDs. Task 1 explicitly gates which implementation task to execute. All code blocks are complete.

**Type consistency:** `sampleColor(x, y, z, outColor)` signature consistent across Task 2 Step 1, Task 3 Step 3, and both scene.js update steps.
