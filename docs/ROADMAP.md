# SimpleFPS Roadmap

The guiding principle is **zero dependencies on the hot path** — rendering, physics, and
game logic run on pre-allocated buffers with no per-frame allocations.

Each release has a subfolder in `docs/` containing design documents for the planned
features (e.g. `docs/v0.0.3/`).

---

## [v0.0.3]

**Theme: TBD.**

| Feature    | Difficulty | Status | Notes |
|------------|------------|--------|-------|

---

## Out of scope

Dedicated game server, matchmaking, anti-cheat, or any server-side infrastructure.
The game is intentionally fully P2P with no backend.
