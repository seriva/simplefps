# [Feature Name] — Design Plan

**Version:** vX.Y.Z (or `continuous` for unversioned projects)  
**Status:** Draft | In Progress | Completed (YYYY-MM-DD)  
**Depends on:** [Predecessor plans, releases, or foundational PRs, e.g. `../v1.7.0/auth-plan.md`]  
**Replaces:** [Any dropped or superseded feature plans, or `None`]  
**Followed by:** [Successor roadmap milestones or plans, or `None`]  

---

## Goal

[One to two paragraphs describing the high-level objective. What problem does this solve? What capability does it introduce?]

**Done means:**
- [Falsifiable completion criterion 1: e.g. all tests pass, zero regressions in existing behavior]
- [Falsifiable completion criterion 2: e.g. public API / page / endpoint behaves as specified]
- [Falsifiable completion criterion 3: e.g. invalid input produces a clear error instead of a crash]
- [Documentation criterion: e.g. user docs and CHANGELOG.md updated]

---

## Scope Rule & Boundary Matrix

[Define explicit rules for what is allowed in this feature versus what is rejected. Classify items into clear categories. The two *(optional)* rows only apply to projects with multiple targets or runtimes (compilers, cross-platform libraries); delete them otherwise.]

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Built in this plan | [e.g. New settings page, data model change, core algorithm] |
| **In scope: target-specific** *(optional)* | Supported on specific targets only; clear error elsewhere | [e.g. Browser DOM APIs in JS only, SIMD in WASM only] |
| **Excluded: runtime / platform** *(optional)* | Out of architectural scope; clear error | [e.g. Reflection, raw OS threads, unsupported host calls] |
| **Excluded: deferred** | Inside architectural boundary, but deferred to a future plan | [e.g. Admin UI, extra export formats, non-critical optimizations] |

---

## Verified Gaps & Baseline Audit

[Empirically confirmed limitations or bugs found before implementation. Do not guess—run active probes, inspect code/types/output, or write minimal failing tests to prove every finding.]

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| [Component / API] | [Exact behavior observed: e.g. Silent wrong result, missing type, unhandled error] | [Probe: specific command, test fixture, or source citation `src/path/file.js:42`] |
| [Component / API] | [Exact behavior observed] | [Probe: test output or code reference] |

---

## Out of Scope

[Explicitly list what this feature will NOT do. Document the architectural rationale for every rejected or deferred item to prevent scope creep.]

- **[Item 1]:** [Reason: e.g. Requires external runtime service, deferred to vX.Y.Z to control scope]
- **[Item 2]:** [Reason: e.g. Rare in idiomatic usage, requires separate architectural proposal]
- **[Item 3]:** [Reason: e.g. Performance optimization that should be benchmark-gated in a follow-up release]

---

## Approach

### 1. Architecture & Design Decisions
[Walk through the core design. Include:
- What changes and where (directory/module boundaries)
- Data structures and type representations
- Key architectural decisions and why
- Rejected alternatives and trade-offs considered]

### 2. Invariants & Safety Bounds
[Explicitly list invariants that must be maintained:
- Invariant 1: e.g. Immutable structures remain immutable across function boundaries
- Invariant 2: e.g. Zero allocations on hot loop paths
- Invariant 3: e.g. Backward compatibility with existing serialized data formats]

### 3. Edge Cases & Error Handling
[Non-obvious scenarios and how they are handled:
- [Edge case 1]: [Handling strategy]
- [Edge case 2]: [Handling strategy]]

---

## Implementation Tasks

[Break work into phased sequential tasks. Track execution progress by checking off tasks (`- [x]`) as they land.]

> **Phase Sizing & Dev-Loop Bounds (1 Phase = 1 Dev-Loop)**:
> - **Phase Budget**: Keep each phase to **3–5 tasks** (hard max 6). Never bundle separate subsystems into one mega-phase.
> - **Diff Budget**: Aim for ~150–500 net LOC across 3–6 files per phase to keep AI code review probes focused and fast.
> - **Atomic Task Contract**: Every task must specify:
>   - `Files:` 1–3 files to touch (prevents unbounded refactoring)
>   - `Test:` failing test to write first (TDD)
>   - `Done when:` clear, falsifiable completion criteria
> - **Execution Convention**: Each task is an atomic git commit (`feat(<plan-slug>): <summary> (Task N.M)`). In automated workflows (`/execute-plan`), the orchestrator loops continuously through all tasks in a phase, committing each task individually, running quality gates, and opening a phase PR (`feat(<plan-slug>): phase <N> - <phase-name>`) upon completion without halting mid-phase. Phase PRs are merged with a merge commit (never squashed), so the per-task commits stay in history.
> - **No Gate-Only Work**: `/dev-loop` runs the quality gates on every task and writes one changelog entry per phase, so never add phases or tasks that only run tests/lint or update the changelog. Put user-facing docs updates in the last phase that changes behavior.

### Phase 1: Baseline Fixtures *(if applicable)*
[Use when the Verified Gaps are reproducible bugs or the work is performance-sensitive. Otherwise drop this phase and write each failing test inside the task that fixes it. *(2 tasks is acceptable here as a fixtures-only phase.)*]
- [ ] Task 1.1: Add test fixtures reproducing all items in the Verified Gaps table, marked skipped/expected-fail with the gap as the reason so the quality gate stays green.
  - Files: `[test fixture file(s), e.g. tests/fixtures/gap-cases.test.js]`
  - Test: `[the new fixtures themselves; each is skipped/expected-fail with the gap as the reason]`
  - Done when: `[one fixture per Verified Gaps row; quality gate green]`
- [ ] Task 1.2: Establish baseline benchmark numbers (if performance-sensitive).
  - Files: `[benchmark script and results file, e.g. bench/baseline.js, docs/vX.Y.Z/bench-baseline.md]`
  - Test: `[benchmark command runs and writes the baseline]`
  - Done when: `[baseline numbers recorded and referenced in Test & Conformance Plan]`

### Phase 2: Core Implementation
- [ ] Task 2.1: [Implement core data structures / types]
  - Files: `[1–3 source files]`
  - Test: `[failing unit test written first]`
  - Done when: `[falsifiable condition, e.g. types compile and unit test passes]`
- [ ] Task 2.2: [Implement core logic]
  - Files: `[1–3 source files]`
  - Test: `[failing unit/integration test written first]`
  - Done when: `[falsifiable condition, e.g. specified inputs produce specified outputs]`
- [ ] Task 2.3: [Implement boundary handling / error messages]
  - Files: `[1–3 source files]`
  - Test: `[negative-case test written first]`
  - Done when: `[invalid input yields the specified error instead of a crash]`
- [ ] Task 2.4: [Un-skip the fixtures from Task 1.1 (if any) and make them pass; update user-facing docs if behavior changed]
  - Files: `[fixture file(s) from Task 1.1, user docs]`
  - Test: `[the un-skipped fixtures]`
  - Done when: `[all fixtures pass; docs describe the new behavior]`

---

## Test & Conformance Plan

[Specify how this feature is verified. Be specific: file paths, fixture commands, expected outputs.]

- **Unit Tests:** `[path to unit test files and key test cases]`
- **Integration / End-to-End:** `[path to integration tests or fixtures comparing output against expected results]`
- **Negative Cases:** `[invalid inputs that must produce clear error messages instead of crashes]`
- **Benchmarks (if applicable):** `[benchmark commands and target thresholds]`
