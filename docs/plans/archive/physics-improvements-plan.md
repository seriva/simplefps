# Physics Improvements Implementation Plan

**Goal:** Eliminate movement glitches in `FPSController` — wall stutters, step-climbing failures, diagonal corner sticking — and reduce per-frame raycast cost via engine-level optimisations and a static/dynamic raycast split.

**Architecture:** All movement changes are in `engine/physics/fpscontroller.js`. Raycasting optimisations are in `engine/physics/ray.js`. The raycast split adds `raycastStatic()` / `raycastDynamic()` to `engine/scene/scene.js` and re-exports them from `engine/engine.js`. Tasks are independent and can be sequenced in any order, but Tasks 1–4 share scratch variable additions — read existing scratch vars before adding new ones to avoid duplication.

**Tech Stack:** ES6 modules, gl-matrix, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- Zero per-frame allocations in all movement and raycast hot paths. All scratch objects pre-allocated at module scope.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Task 1: Multi-Step Iterative Wall Sliding

### What & Why

`_resolveHorizontalCollision` currently runs once per frame. On collision it clamps position to the wall and zeroes velocity into the wall — the player stops for the rest of the frame. Replacing with an iterative loop (max 3 iterations) allows the remaining displacement to slide along the wall normal each iteration, producing smooth wall-scraping without speed loss.

### Files

- Modify: `app/src/engine/physics/fpscontroller.js` — rewrite `_resolveHorizontalCollision`, add scratch vars

### Interfaces

- Consumes: `Scene.raycast()` (existing) — will migrate to `Scene.raycastStatic()` in Task 6
- Produces: no public API change

---

- [ ] **Step 1: Read _resolveHorizontalCollision in full**

  In `fpscontroller.js`, read the current implementation. Note:
  - How `dx`, `dz` displacement is computed
  - How wall hits are detected (raycast at which heights, how many raycasts)
  - How velocity and position are modified on hit
  - Which module-scope scratch vars already exist (avoid duplicates)

- [ ] **Step 2: Add scratch vars at module scope**

  After existing scratch var declarations, add only those not already present:

  ```javascript
  const _slideVelocity = vec3.create()   // projected velocity along wall tangent
  const _slidePos      = vec3.create()   // position during slide iteration
  const _slideDir      = vec3.create()   // normalised remaining displacement
  const _wallNormal    = vec3.create()   // hit wall normal (XZ only)
  ```

- [ ] **Step 3: Rewrite _resolveHorizontalCollision with iterative loop**

  ```javascript
  function _resolveHorizontalCollision(startPos, dx, dz) {
      let px = startPos.x
      let pz = startPos.z
      let remainDx = dx
      let remainDz = dz

      for (let iter = 0; iter < 3; iter++) {
          const moveDist = Math.sqrt(remainDx * remainDx + remainDz * remainDz)
          if (moveDist < 0.001) break  // negligible remaining displacement

          let hitNx = 0, hitNz = 0
          let hitDist = 0
          let blocked = false

          // Raycast at 3 heights (existing height offsets — keep them unchanged)
          for (let h = 0; h < _horizontalCheckHeights.length; h++) {
              const checkY = startPos.y + _horizontalCheckHeights[h] * _height * 0.5
              const result = Scene.raycast(
                  px, checkY, pz,
                  px + remainDx, checkY, pz + remainDz
              )
              if (result.hasHit && result.distance < _radius + moveDist) {
                  hitNx = result.hitNormalWorld[0]
                  hitNz = result.hitNormalWorld[2]
                  hitDist = result.distance   // captured before leaving loop scope
                  blocked = true
                  break
              }
          }

          if (!blocked) {
              // No wall — apply full remaining displacement and finish
              px += remainDx
              pz += remainDz
              break
          }

          // Move to safe distance just before wall
          const safeT = Math.max(0, hitDist - _radius - 0.1) / moveDist
          px += remainDx * safeT
          pz += remainDz * safeT

          // Project remaining displacement onto wall tangent (slide vector)
          const dot = remainDx * hitNx + remainDz * hitNz
          remainDx -= dot * hitNx
          remainDz -= dot * hitNz

          // Project velocity onto wall tangent
          const velDot = _velocity[0] * hitNx + _velocity[2] * hitNz
          _velocity[0] -= velDot * hitNx
          _velocity[2] -= velDot * hitNz
      }

      startPos.x = px
      startPos.z = pz
  }
  ```

  Adjust variable names to match actual `fpscontroller.js` internals (height field name, radius field name, `_velocity` reference).

- [ ] **Step 4: Smoke test — wall scraping**

  `npm run dev`. Walk alongside a wall at a shallow angle. Movement must feel smooth — no stutter, no speed drop, camera glides parallel to wall.

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/physics/fpscontroller.js
  git commit -m "feat(physics): iterative wall sliding in _resolveHorizontalCollision

  Single-pass collision stopped the player dead on wall contact. Up to 3
  iterations now project remaining displacement onto the wall tangent each
  iteration, producing smooth sliding without speed loss."
  ```

---

## Task 2: Quake-Style Step Climbing

### What & Why

The current step climb only works for obstacles under ~19.5 units because the lowest horizontal collision check fires first and blocks movement on taller steps. The fix: when grounded and horizontal movement is blocked, elevate by `STEP_HEIGHT`, retry horizontal resolution from that elevation, then drop back to ground. Only accept the climb if upward progress was made and no ceiling blocks the elevated path.

### Files

- Modify: `app/src/engine/physics/fpscontroller.js` — rewrite step-climb branch in `_integratePhysics`, add scratch vars

---

- [ ] **Step 1: Read the current step-climb code**

  In `fpscontroller.js`, find the step-climbing branch in `_integratePhysics`. Note:
  - The condition that triggers it (grounded + horizontal block)
  - What `STEP_HEIGHT` is
  - How the final position is validated
  - Which scratch vars already exist for step logic (e.g. `_stepTempPos`)

- [ ] **Step 2: Add missing scratch vars**

  Add only those not already present:

  ```javascript
  const _stepStartPos     = { x: 0, y: 0, z: 0 }   // saved position before step attempt
  const _stepSavedVelocity = vec3.create()            // saved velocity before step attempt
  const _stepCheckPos     = { x: 0, y: 0, z: 0 }   // scratch for ceiling/depenetration check
  ```

- [ ] **Step 3: Rewrite the step-climb branch**

  `_horizontalBlocked` is a boolean you set at the end of `_resolveHorizontalCollision` — set it to `true` when the `blocked` flag fired at least once (i.e. `iter > 0` or displacement was clamped). Set it to `false` when the loop exited without a wall hit. Add this as a module-scope variable: `let _horizontalBlocked = false`.

  In `_integratePhysics`, replace the existing step-climb block with:

  ```javascript
  // Step climb: triggered only when grounded AND horizontal movement was blocked
  if (_grounded && _horizontalBlocked) {
      // Save state
      _stepStartPos.x = _position.x
      _stepStartPos.y = _position.y
      _stepStartPos.z = _position.z
      vec3.copy(_stepSavedVelocity, _velocity)

      // 1. Elevate
      _position.y += STEP_HEIGHT

      // 2. Retry horizontal resolution from elevated position
      _resolveHorizontalCollision(_position, dx, dz)

      // 3. Drop to ground from elevated position
      _resolveGroundCollision(_position.x, _position.z, _position.y, -STEP_HEIGHT)

      // 4. Validate: must have climbed higher AND cleared a ceiling
      const climbedHigher = _position.y > _stepStartPos.y + 1
      _stepCheckPos.x = _position.x
      _stepCheckPos.y = _position.y
      _stepCheckPos.z = _position.z
      const ceilingHit = _resolveCeilingCollision(_stepCheckPos.x, _stepCheckPos.y, _stepCheckPos.z)

      if (!climbedHigher || ceilingHit) {
          // Revert — step failed
          _position.x = _stepStartPos.x
          _position.y = _stepStartPos.y
          _position.z = _stepStartPos.z
          vec3.copy(_velocity, _stepSavedVelocity)
      }
      // else: accept the step climb — _position already updated
  }
  ```

  Adjust field names (`_position`, `_grounded`, `_horizontalBlocked`, `_velocity`) to match actual `fpscontroller.js` internals.

- [ ] **Step 4: Smoke test — step heights**

  `npm run dev`. Walk up steps of height 10, 20, 30, 40 units. Camera must glide up smoothly via `_smoothPosition`. Walking into low ceilings must not trigger false step climbs.

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/physics/fpscontroller.js
  git commit -m "feat(physics): Quake-style step climbing up to STEP_HEIGHT

  Previous step climb used a height-offset hack that failed above ~19.5 units.
  Now: elevate by STEP_HEIGHT, retry horizontal resolution, drop to ground,
  validate no ceiling block and upward progress made. Reverts on failure."
  ```

---

## Task 3: 8-Directional Depenetration

### What & Why

`_resolveDepenetration` checks only 4 cardinal directions. Diagonal walls and corners don't produce push-out forces in the right direction, causing the player to get stuck. Expanding to 8 directions (cardinal + diagonal, already in `_radialDirs`) costs 4 extra short raycasts — negligible since octree rejects them at the root bounding box.

### Files

- Modify: `app/src/engine/physics/fpscontroller.js` — expand depenetration loop to all 8 `_radialDirs` entries

---

- [ ] **Step 1: Read _resolveDepenetration and _radialDirs**

  In `fpscontroller.js`, find:
  - `_resolveDepenetration` — how the loop iterates directions and applies push-out
  - `_radialDirs` — how many entries it has and what directions are included (confirm 4 cardinal + 4 diagonal = 8 total)

- [ ] **Step 2: Confirm _radialDirs already has 8 entries**

  ```bash
  grep -A 20 "_radialDirs" app/src/engine/physics/fpscontroller.js
  ```

  If only 4 exist, add the 4 diagonal directions:

  ```javascript
  const _radialDirs = [
      // Cardinal
      { x:  1, z:  0 },
      { x: -1, z:  0 },
      { x:  0, z:  1 },
      { x:  0, z: -1 },
      // Diagonal (normalised)
      { x:  0.7071, z:  0.7071 },
      { x: -0.7071, z:  0.7071 },
      { x:  0.7071, z: -0.7071 },
      { x: -0.7071, z: -0.7071 },
  ]
  ```

- [ ] **Step 3: Update depenetration loop to iterate all _radialDirs.length entries**

  In `_resolveDepenetration`, change the loop bound:

  ```javascript
  // Before (if hardcoded to 4):
  for (let i = 0; i < 4; i++) {

  // After:
  for (let i = 0; i < _radialDirs.length; i++) {
  ```

  If the loop already uses `_radialDirs.length`, this step is a no-op — just confirm and move on.

- [ ] **Step 4: Smoke test — corner sticking**

  `npm run dev`. Walk directly into 90-degree corners and acute-angle walls while moving diagonally. Player must slide smoothly rather than sticking. No visible performance drop (open-space movement should feel identical).

- [ ] **Step 5: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/physics/fpscontroller.js
  git commit -m "feat(physics): expand depenetration to 8 radial directions

  _resolveDepenetration only checked 4 cardinal directions, causing corner
  sticking on diagonal walls. Now checks all 8 directions in _radialDirs
  (cardinal + diagonal). Octree instantly rejects the 4 extra short raycasts
  at the root AABB, so overhead is negligible."
  ```

---

## Task 4: Raycasting Engine Optimisations

### What & Why

Three independent micro-optimisations to `ray.js` that compound across the 14+ raycasts fired per physics frame:

1. **Identity matrix fast path** — static geometry always uses an identity world matrix. Currently `intersectTrimesh` still calls `mat4.invert` + two `vec3.transformMat4` for it. An identity check skips all that.
2. **Closest-hit early-out** — in `CLOSEST` mode, any triangle further than the current best hit can be skipped. One comparison per triangle instead of full intersection math.
3. **Redundant distance math** — `vec3.sqrDist` recomputes a distance already available as `scalar` (the ray parameter, valid since ray direction is normalised). Remove the redundant computation.

### Files

- Modify: `app/src/engine/physics/ray.js` — add identity fast path, closest-hit early-out, remove sqrDist

---

- [ ] **Step 1: Read intersectTrimesh (or intersectTriangles) in ray.js**

  Find the triangle intersection loop. Note:
  - Where the world matrix is inverted and endpoints transformed
  - Where `vec3.sqrDist` or equivalent is called
  - How `RAY_MODES.CLOSEST` is handled and where `scalar` is computed
  - What `scalar` represents (confirm it equals distance along normalised ray)

- [ ] **Step 2: Add identity matrix fast path**

  Before the `mat4.invert` call, check for identity:

  ```javascript
  // Identity matrix fast path — avoids invert + 2x transformMat4 for static geometry
  const isIdentity =
      m[0] === 1 && m[5] === 1 && m[10] === 1 && m[15] === 1 &&
      m[1] === 0 && m[2] === 0 && m[3] === 0 &&
      m[4] === 0 && m[6] === 0 && m[7] === 0 &&
      m[8] === 0 && m[9] === 0 && m[11] === 0 &&
      m[12] === 0 && m[13] === 0 && m[14] === 0

  if (isIdentity) {
      // Ray endpoints already in local space — copy directly
      vec3.copy(_localFrom, rayFrom)
      vec3.copy(_localTo, rayTo)
      vec3.copy(_localDir, rayDir)
  } else {
      mat4.invert(_invMatrix, worldMatrix)
      vec3.transformMat4(_localFrom, rayFrom, _invMatrix)
      vec3.transformMat4(_localTo, rayTo, _invMatrix)
      // ... existing direction transform
  }
  ```

  And in the hit normal transform (world space output):

  ```javascript
  if (isIdentity) {
      vec3.copy(result.hitNormalWorld, localNormal)
  } else {
      // existing mat3 normal transform
  }
  ```

  Replace `m`, `_localFrom`, `_localTo`, `_localDir`, `_invMatrix` with actual variable names found in Step 1.

- [ ] **Step 3: Add closest-hit early-out in triangle loop**

  Inside the per-triangle loop, after `scalar` is computed and before the full intersection test:

  ```javascript
  // Skip triangles further than current best — only in CLOSEST mode
  if (this.mode === RAY_MODES.CLOSEST && result.hasHit && scalar > result.distance) continue
  ```

  Place this immediately after `scalar` is first available, before `vec3.sqrDist` or `pointInTriangle`.

- [ ] **Step 4: Remove redundant sqrDist / distance recomputation**

  Find the `vec3.sqrDist` call (or equivalent) that computes distance to compare against `maxDist`. If `scalar` is the ray parameter along a normalised direction, then `scalar === distance`. Replace:

  ```javascript
  // Before:
  const dist2 = vec3.sqrDist(rayFrom, hitPoint)
  if (Math.sqrt(dist2) > maxDist) continue

  // After:
  if (scalar > maxDist) continue
  ```

  Confirm `scalar` is the signed distance along the normalised ray before making this change. If the ray direction is not guaranteed normalised in all call sites, do not apply this optimisation — just remove `vec3.sqrDist` if it's genuinely redundant.

- [ ] **Step 5: Smoke test**

  `npm run dev`. Play normally — walk, jump, shoot. Confirm:
  - No clipping through static geometry
  - Projectiles still detect hits correctly
  - No NaN / infinite values in console (would indicate broken scalar comparison)

- [ ] **Step 6: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/physics/ray.js
  git commit -m "perf(physics): three micro-optimisations to raycast triangle loop

  1. Identity matrix fast path: skips mat4.invert + 2x transformMat4 for static
     geometry (100% of physics raycasts use identity world matrix).
  2. Closest-hit early-out: in CLOSEST mode, skip triangles further than best
     hit found so far — one compare instead of full intersection math.
  3. Remove redundant vec3.sqrDist: scalar already equals distance along
     normalised ray direction."
  ```

---

## Task 5: Zero Per-Frame Allocation Audit

### What & Why

After Tasks 1–4 introduce new code paths, verify no accidental per-frame allocations crept in. Any `new`, `{}`, `[]`, or closure creation inside update loops or raycast loops is a GC pressure source.

### Files

- Audit: `app/src/engine/physics/fpscontroller.js`
- Audit: `app/src/engine/physics/ray.js`

---

- [ ] **Step 1: Grep for allocation patterns in hot paths**

  ```bash
  grep -n "new \|{.*}\|\.push\|= \[\]" app/src/engine/physics/fpscontroller.js
  grep -n "new \|{.*}\|\.push\|= \[\]" app/src/engine/physics/ray.js
  ```

  For each hit, determine if it's in a hot path (inside a function called per-frame or per-triangle) or cold path (one-time init).

- [ ] **Step 2: Fix any hot-path allocations found**

  For each hot-path allocation:
  - Object literal `{}` → pre-allocate at module scope, reuse fields
  - Array literal `[]` → pre-allocate, set `.length = 0` to clear
  - `new TypedArray(n)` inside a loop → pre-allocate once at module scope

- [ ] **Step 3: Format and commit (only if changes made)**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/physics/fpscontroller.js app/src/engine/physics/ray.js
  git commit -m "perf(physics): eliminate per-frame allocations found in hot paths"
  ```

  Skip this commit if Step 2 found nothing to fix.

---

## Task 6: raycastStatic / raycastDynamic Split

### What & Why

`Scene.raycast()` iterates `_collidables[]`, which mixes the static trimesh (octree-accelerated) with dynamic mesh entities (no spatial structure, full geometry test). The physics controller fires 14+ raycasts per frame for wall/ground/ceiling — it only needs static geometry. Splitting into `raycastStatic()` and `raycastDynamic()` lets the physics controller skip all dynamic entities on every movement raycast.

### Files

- Modify: `app/src/engine/scene/scene.js` — add `raycastStatic()`, `raycastDynamic()`, keep `raycast()` as combined fallback
- Modify: `app/src/engine/physics/fpscontroller.js` — replace `Scene.raycast()` with `Scene.raycastStatic()` for all movement raycasts
- Modify: `app/src/engine/engine.js` — re-export `raycastStatic`, `raycastDynamic`
- Modify: `app/src/game/` — audit raycast call sites, use appropriate variant

### Interfaces

- Produces:
  - `Scene.raycastStatic(fromX, fromY, fromZ, toX, toY, toZ, options)` — static trimesh only, same return shape as `raycast()`
  - `Scene.raycastDynamic(fromX, fromY, fromZ, toX, toY, toZ, options)` — dynamic entities only, same return shape
  - `Scene.raycast()` — kept unchanged as combined fallback

---

- [ ] **Step 1: Read Scene.raycast() in scene.js**

  Note:
  - How `_staticCollidable` is distinguished from dynamic entries in `_collidables[]`
  - The `_ray` and `_rayResult` reuse pattern (no per-call allocations)
  - What `options` fields are respected (skipBackfaces, collisionFilterMask/Group)

- [ ] **Step 2: Add raycastStatic() — static trimesh only**

  In `scene.js`, add after the existing `raycast()`:

  ```javascript
  function raycastStatic(fromX, fromY, fromZ, toX, toY, toZ, options) {
      _ray.from.set(fromX, fromY, fromZ)
      _ray.to.set(toX, toY, toZ)
      _rayResult.reset()

      if (_staticCollidable) {
          _staticCollidable.collider.intersectTriangles(_ray, _rayResult, options)
      }

      return _rayResult
  }
  ```

- [ ] **Step 3: Add raycastDynamic() — dynamic entities only**

  ```javascript
  function raycastDynamic(fromX, fromY, fromZ, toX, toY, toZ, options) {
      _ray.from.set(fromX, fromY, fromZ)
      _ray.to.set(toX, toY, toZ)
      _rayResult.reset()

      for (let i = 0; i < _collidables.length; i++) {
          const collidable = _collidables[i]
          if (collidable === _staticCollidable) continue
          collidable.collider.intersectTriangles(_ray, _rayResult, options)
      }

      return _rayResult
  }
  ```

- [ ] **Step 4: Export from scene.js**

  Add `raycastStatic` and `raycastDynamic` to the export block at the bottom of `scene.js`.

- [ ] **Step 5: Re-export from engine.js**

  In `engine.js`, alongside the existing `raycast` re-export, add:

  ```javascript
  export { raycastStatic, raycastDynamic } from "./scene/scene.js"
  ```

  Match the exact import/export style already used in `engine.js`.

- [ ] **Step 6: Update FPSController to use raycastStatic**

  ```bash
  grep -n "raycast" app/src/engine/physics/fpscontroller.js
  ```

  Replace every `Scene.raycast(` with `Scene.raycastStatic(`. There are no player-vs-player or projectile casts in `fpscontroller.js` — the grep output should confirm all hits are movement/collision casts.

- [ ] **Step 7: Audit game-layer raycast calls**

  ```bash
  grep -rn "raycast" app/src/game/
  ```

  For each hit:
  - Projectile vs map geometry → `raycastStatic()`
  - Projectile vs players/entities → `raycastDynamic()` or `raycast()`
  - Pickup line-of-sight vs ground → `raycastStatic()`

  Update each call accordingly.

- [ ] **Step 8: Smoke test**

  `npm run dev`. Walk into walls, jump, land on stairs. Confirm:
  - No clipping through static geometry
  - Projectiles still hit both walls and players
  - No `raycastStatic is not a function` errors in console

- [ ] **Step 9: Format and commit**

  ```bash
  npm run format
  npm run check
  git add app/src/engine/scene/scene.js app/src/engine/engine.js app/src/engine/physics/fpscontroller.js app/src/game/
  git commit -m "perf(scene): split raycast into raycastStatic / raycastDynamic

  Scene.raycast() iterated all collidables including dynamic entities on every
  call. The FPS controller fires 14+ raycasts per frame for movement — these
  only ever need to hit static geometry. raycastStatic() tests only the octree-
  accelerated static trimesh. raycastDynamic() tests only dynamic entities.
  raycast() is kept as a combined fallback. FPS controller updated to use
  raycastStatic(); game-layer hit detection updated where appropriate."
  ```

---

## Self-Review

**Spec coverage:**

| Finding | Task |
|---------|------|
| Multi-step wall sliding | Task 1 ✓ |
| Quake-style step climbing | Task 2 ✓ |
| 8-directional depenetration | Task 3 ✓ |
| Identity matrix fast path (raycasting) | Task 4 ✓ |
| Closest-hit early-out (raycasting) | Task 4 ✓ |
| Redundant sqrDist elimination | Task 4 ✓ |
| Zero per-frame allocations | Task 5 ✓ |
| raycastStatic / raycastDynamic split | Task 6 ✓ |

**Placeholder scan:** Task 2 Step 3 and Task 1 Step 3 note to match actual variable names — intentional (fpscontroller.js internals must be read first). All code blocks are complete and executable.

**Type consistency:** `raycastStatic(fromX, fromY, fromZ, toX, toY, toZ, options)` consistent across Task 6 Steps 2, 3, 6, 7, and engine.js re-export step.
