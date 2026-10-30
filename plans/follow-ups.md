# Follow-ups

Bugs noticed outside the task at hand, each with a repro so it can be re-checked later. Written by `/dev-loop` reviewers and by any agent session. Open items only: `/design-plan follow-ups` re-probes them and moves each into a plan (as a fix task or a deferred row), deleting it here.

<!-- Entry format (one line each):
- **<Area>:** <defect in one sentence>. Repro: `<snippet or command>` → got `<actual>`, want `<expected>`. (<PR #N or branch>, <plan-slug Phase N | standalone>, <Low | Out of Scope>)
-->
- **Perf harness (`tests/perf/mathx-js.js`):** `--min`/`--max` are documented in the header but have no effect, because every entry gets its own `--gate` override that replaces the default band. Repro: `GOFRONT_BASELINE_DIR=node_modules/gofront node tests/perf/mathx-js.js --repeat 1 --rounds 3 --min 5` → got `✓ A/B gate passed`, exit 0, want a gate failure (or the header to drop `--min`/`--max`). (feat/gofront-v1.8.0-adoption, gofront-v1.8.0-adoption Phase 1, Low)
- **Scene (`LightGrid.GetAmbient`):** a light grid with any axis count of 1 (accepted by `Load`) returns NaN ambient light, because the trilinear sample reads the non-existent probe at index 1 on that axis. Repro: `g.Load(&LightGridConfig{Origin: []float32{0,0,0}, Counts: []int{1,2,2}, Step: []float32{10,10,10}}, make([]byte, 12)); g.GetAmbient(&mathx.Vec3{X: 3, Y: 5, Z: -5}, out)` → got `[NaN NaN NaN]`, want a finite colour (or `Load` to reject counts < 2). (feat/gofront-v1.8.0-adoption, gofront-v1.8.0-adoption Phase 2, Out of Scope)
