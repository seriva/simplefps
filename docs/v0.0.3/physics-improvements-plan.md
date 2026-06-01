# Physics Improvements Plan (v0.0.3)

## Goal
Improve the physics and collision resolution in the `SimpleFPS` engine, specifically targeting player movement (`FPSController`) to provide a silky smooth, premium experience that eliminates movement glitches, stuck-on-wall stutters, and limitations in climbing stairs/ledges.

Specifically, we want to address:
1. **Multi-step Wall Sliding**: Instead of instantly stopping horizontal movement upon hitting a wall in a frame, the controller will slide along the wall normal and continue moving for the remaining fraction of the frame.
2. **Robust Step Climbing**: Replace the current height-offset hack with a proper Quake-style step-up, move-forward, step-down collision resolution loop. This allows climbing obstacles up to a true `STEP_HEIGHT` without being blocked by horizontal collision checks.
3. **Thorough Depenetration**: Expand depenetration checks to all 8 radial directions instead of just the 4 cardinal directions, ensuring proper push-out from diagonal/angled walls.
4. **General Raycasting Engine Optimizations**:
   - *Identity Matrix Fast Path*: For identity matrices (which cover 100% of static geometry queries), skip the expensive `mat4.invert` and two `vec3.transformMat4` calls.
   - *Dynamic Closest-Hit Truncation*: In `CLOSEST` raycast mode, skip the expensive `Ray.pointInTriangle` test for any triangle that is further than the closest hit already found in the current raycast.
   - *Redundant Distance Math Elimination*: Replace `vec3.sqrDist` and square-distance calculations with the pre-calculated `scalar` value, which is mathematically identical since the ray direction is normalized.
5. **Zero Per-Frame Allocations**: Maintain the core engine standard of absolute zero object/array creations in the movement hot path, utilizing pre-allocated module-level variables.

---

## Approach

### 1. Multi-Step Wall Sliding
Currently, the horizontal collision resolution runs once per frame. If a collision is detected, the position is clamped to the safe distance, the velocity component into the wall is removed, and the player stops moving for the rest of the frame.
We will rewrite `_resolveHorizontalCollision` to use an iterative loop (up to 3 iterations):
- Calculate current displacement `(dx, dz)`.
- Perform raycasts to detect horizontal walls.
- If a wall is hit:
  - Move to the safe distance just before the wall.
  - Project the remaining displacement onto the wall tangent (sliding vector).
  - Project the velocity onto the wall tangent.
  - Continue the loop with the remaining tangent displacement.
- If no wall is hit, move the full remaining displacement and finish.

### 2. Quake-Style Step Climbing
Currently, step climbing only works for steps under `19.5` units because the lowest horizontal collision check (`-0.35 * height * 0.5`) blocks the player's movement on higher steps.
We will implement a robust step climbing algorithm:
- When the player is grounded and hits a wall horizontally:
  - Save the player's original position and velocity.
  - Temporarily move the player UP by `STEP_HEIGHT`.
  - Perform the normal multi-step horizontal collision resolution starting from this elevated height.
  - Move the player DOWN by `STEP_HEIGHT` and detect the new ground level using `_resolveGroundCollision`.
  - Validate the new landed position:
    - Verify that there is no ceiling block directly above the stepped-up or landed center position.
    - Run depenetration at the landed position to ensure we aren't pushed inside any walls.
    - Check if the landed height is higher than the original height (we climbed something) and we made actual horizontal forward progress (moved further than if we had just slid along the wall at ground level).
  - If valid, accept the step climb! Otherwise, revert to the ground-level sliding position.

### 3. Expanded 8-Directional Depenetration
Increase the loop in `_resolveDepenetration` from 4 cardinal directions to all 8 directions in `_radialDirs` (cardinal + diagonal). Since `Scene.raycast` is extremely fast and octree-accelerated, this has negligible overhead and dramatically improves diagonal wall and corner depenetration.

### 4. Raycasting Engine Optimizations
We will modify `intersectTrimesh` in `app/src/engine/physics/ray.js`:
- Add a fast-path branch check for identity matrices. If `worldMatrix` is identity:
  - Directly copy endpoints and direction without matrix inverts and multiplications.
  - Directly copy intersection point and normal to world outputs.
- In `CLOSEST` mode, add an early-out inside the triangle loop: `if (this.mode === RAY_MODES.CLOSEST && this.result.hasHit && scalar > this.result.distance) continue;`.
- Remove the `vec3.sqrDist` and related squaring logic, comparing `scalar` against `maxDist` directly.

### 5. Zero Allocations
All helper calculations will use module-scoped scratch variables to ensure zero garbage collection overhead.
The following module-scoped variables will be introduced:
- `_slideVelocity` (vec3)
- `_slidePos` (vec3)
- `_slideDir` (vec3)
- `_wallNormal` (vec3)
- `_stepStartPos` (vec3)
- `_stepSavedVelocity` (vec3)
- `_stepTempPos` (vec3)
- `_stepCheckPos` (vec3)

---

## Performance Analysis

### 1. Raycast Count & Branching (Warm vs. Cold Paths)
- **Open Space Movement (Warm Path)**: In the standard case where the player is not colliding with walls, the iterative `_resolveHorizontalCollision` loop breaks immediately on iteration 0. This results in exactly **3 raycasts** (the same as the current implementation).
- **Wall Sliding (Collision Path)**: If the player scrapes against a wall, a second iteration runs to resolve sliding. This adds **3 additional raycasts** (6 total). In rare corner cases, up to 9 raycasts may run.
- **Step Climbing (Triggered Path)**: This logic is entirely **cold**. It *only* executes when `grounded === true` and the player's horizontal movement was blocked by a wall collision. When triggered, it adds ~10-15 short raycasts to resolve the step-up, forward, and step-down positions. Because this only happens on collision frames, it has virtually zero impact on average frame time.
- **Depenetration**: Increasing the checks from 4 to 8 directions increases the per-frame depenetration overhead by 4 short raycasts. However, since the raycast length is tiny (`radius + 1`), the Octree instantly rejects almost all tests with a fast root-bounding-box slab check, taking less than 5 microseconds total.

### 2. Zero-Allocation Layout
All operations in the updated physics loop adhere strictly to the project's core standard of **zero per-frame allocations**.
- All temporary vector calculations, normals, and positions are stored in module-scoped `gl-matrix` scratch objects.
- There are no array allocations, object literals, or closures instantiated during runtime update loops, completely eliminating garbage collection stutters.

---

## Edge Cases

1. **Ceiling Collisions During Step Up**:
   - *Problem*: Stepping up by `STEP_HEIGHT` might push the player's head into a low ceiling.
   - *Solution*: Raycast upwards from the elevated center point to ensure there is enough vertical clearance before accepting the step.

2. **Stepping Off Ledges / Cliffs**:
   - *Problem*: Stepping down could mistakenly trigger on steep cliffs, snapping the player down.
   - *Solution*: Only allow stepping up if the final landed height is higher than the starting height (`landedY > savedY + 1`). Falling down ledges is handled naturally by gravity and normal vertical physics.

3. **Angled / Diagonal Walls (Corners)**:
   - *Problem*: Sliding into a corner might cause infinite loops between two walls.
   - *Solution*: Limit the sliding loop to a maximum of 3 iterations, and if remaining displacement becomes negligible, break early.

---

## Test Plan

### Automated/Console Tests
1. **Linter & Formatting Validation**: Run `npm run check` and `npm run format` to ensure strict Biome compliance.
2. **Build Verification**: Run `npm run prod` to confirm the production bundle compiles correctly.

### Manual Verification
1. **Wall Scrapes**: Walk alongside walls at various angles. The movement must feel extremely smooth without any camera stutter or speed drops.
2. **Stair/Step Climbing**: Test walking up steps of height `10`, `20`, `30`, and `40`. The player should seamlessly walk up the steps, and the camera smoothing (`_smoothPosition`) should keep the camera movement fluid.
3. **Corner Sticking**: Walk directly into 90-degree and acute corners while moving diagonally. The player must slide smoothly along the dominant wall rather than getting stuck.
