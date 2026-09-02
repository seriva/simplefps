# Fixed Timestep Physics Implementation Plan

**Goal:** Decouple physics simulation from render frame rate with a fixed-timestep accumulator. Today the FPS controller integrates the raw render delta once per frame, so jump height, acceleration, and movement feel all vary with refresh rate — a 144 Hz player clears jumps a 30 Hz player cannot — and deterministic P2P multiplayer simulation is impossible.

**Architecture:** An accumulator loop in the game update steps the controller (and other simulated bodies) at a fixed rate (120 Hz), independent of render rate. Rendering stays variable-rate. The existing camera smoothing in `FPSController.syncCamera` / `_smoothPosition` already interpolates toward the physics position, so it doubles as the render-interpolation layer — no separate interpolation system is needed and no visual stutter is expected. Engine loop (`engine.js`) is untouched; the accumulator lives in game code where the controller is stepped.

**Tech Stack:** ES6 modules, gl-matrix, Biome (lint/format).

## Global Constraints

- No `var`. Use `const` (preferred) or `let`.
- No default exports. Named exports only.
- No per-frame allocations in hot paths.
- Log via `Console.log/warn/error`, not `console.*`.
- Run `npm run check` and `npm run format` before every commit.
- No new external dependencies.

---

## Task 1: Accumulator Loop in Game Update

### What & Why

`Game.update` (`app/src/game/game.js`) converts `frameTime` to seconds and calls `_controller.update(ft)` / `_controller.move(…, ft)` once with the full variable delta. Semi-implicit Euler integration (`v += g·dt; y += v·dt`) accumulates different discretization error at different dt, which is why jump arcs differ by refresh rate. Stepping at a fixed dt makes the simulation identical on every machine.

### Files

- Modify: `app/src/game/game.js` — accumulator around controller update/move
- Modify (audit): `app/src/game/update.js`, `app/src/game/projectiles.js`, `app/src/game/pickups.js` — decide per-system whether it moves into the fixed step (anything that integrates velocity should; pure-visual systems stay variable-rate)

### Steps

- [ ] **Step 1: Add the accumulator**

  ```javascript
  const FIXED_DT = 1 / 120;
  const MAX_ACCUM = 0.1; // matches the engine's 100 ms frame cap
  let _accum = 0;

  // in Game.update, replacing the single update/move call:
  _accum = Math.min(_accum + ft, MAX_ACCUM);
  while (_accum >= FIXED_DT) {
      _controller.update(FIXED_DT);
      _controller.move(strafe, move, _horizontalForward, _strafeDir, FIXED_DT);
      _accum -= FIXED_DT;
  }
  _controller.syncCamera(ft); // camera smoothing stays variable-rate
  ```

  Input sampling (keys, mouse look) stays once per render frame — inputs are
  held across the inner steps. Mouse look drives the camera directly and is not
  part of the fixed simulation.

- [ ] **Step 2: Reset the accumulator on state changes**

  Zero `_accum` on map load, respawn, pause/unpause, and when the game state
  leaves `GAME`, so a long pause does not replay a burst of catch-up steps.

- [ ] **Step 3: Move velocity-integrating systems into the fixed step**

  Audit `DynamicBody` users (projectiles/grenades) and any other system that
  integrates velocity over dt. Entity `update` callbacks that only animate
  visuals stay on the variable render tick. Document the split in
  `docs/scene.md` if entity semantics change.

- [ ] **Step 4: Remove now-redundant per-frame-rate compensation**

  `FPSController._updateHeadBob` has `this.bobPhase *= 0.9` (per-frame decay);
  with a fixed dt this becomes consistent automatically, but convert it to
  dt-scaled decay anyway (see quick-wins plan A6) so the constant is
  self-documenting.

---

## Task 2: Verify Feel and Multiplayer Consistency

- [ ] **Step 1: Jump-height invariance test**

  Use the in-game console to log max jump apex Y. Cap the browser to different
  refresh rates (or throttle via devtools). Apex must be identical (< 0.1 unit
  spread) at 30 / 60 / 144 Hz. Before this change the spread is several units.

- [ ] **Step 2: Feel check**

  Walk, strafe-jump, step-climb, ride the landing dip. Camera smoothing
  (`_smoothPosition`) should mask the 120 Hz step boundary completely; if any
  stutter is visible at high refresh rates, raise `FIXED_DT` to 1/144 or add
  render interpolation between the last two physics positions.

- [ ] **Step 3: Multiplayer smoke test**

  Two peers, different refresh rates, same inputs: positions must stay
  consistent within network-jitter bounds. (Full determinism also needs
  input-synchronised simulation — out of scope — but identical dt removes the
  largest divergence source.)

---

## Self-Review

**Spec coverage:** Single review finding — frame-rate-dependent physics. Task 1 fixes integration; Task 2 verifies gameplay parity and the multiplayer motivation.

**Risk:** Movement feel is the heart of an FPS. The accumulator changes effective input latency by at most one fixed step (8.3 ms). If play-testing rejects the feel, the fallback is a larger `FIXED_DT` (1/60) with render interpolation — the plan structure supports either constant.

**Out of scope:** Input-locked deterministic lockstep, server reconciliation (game is intentionally P2P, see roadmap).
