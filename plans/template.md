# [Feature Name] — Design Plan

**Version:** vX.Y.Z (or `continuous` for unversioned projects)  
**Status:** Draft | In Progress | Completed (YYYY-MM-DD)  
**Related:** [Predecessor or successor plans, superseded plans, foundational PRs, or `None`]  

---

## Goal

[One to two paragraphs describing the high-level objective. What problem does this solve? What capability does it introduce?]

**Done means:**
- [Falsifiable completion criterion and what proves it: e.g. all tests pass, zero regressions in `tests/e2e/`]
- [e.g. public API / page / endpoint behaves as specified, covered by `tests/unit/<feature>.test.js`]
- [e.g. invalid input produces a clear error instead of a crash (negative cases in `tests/unit/<feature>-errors.test.js`)]
- [Documentation criterion: e.g. user docs and CHANGELOG.md updated]

---

## Scope Rule & Boundary Matrix

[Define explicit rules for what is allowed in this feature versus what is rejected, and why. This table is the single record of what the plan will not do: every `Excluded` row states its reason so scope creep is stopped before coding and the final audit can check nothing excluded leaked in. The two *(optional)* rows only apply to projects with multiple targets or runtimes (compilers, cross-platform libraries); delete them otherwise.]

| Category | Rule | Examples / Members | Reason (Excluded rows) |
|---|---|---|---|
| **In scope: core** | Built in this plan | [e.g. New settings page, data model change, core algorithm] | |
| **In scope: target-specific** *(optional)* | Supported on specific targets only; clear error elsewhere | [e.g. Browser DOM APIs in JS only, SIMD in WASM only] | |
| **Excluded: runtime / platform** *(optional)* | Out of architectural scope; clear error | [e.g. Reflection, raw OS threads, unsupported host calls] | [e.g. Incompatible with the single-threaded runtime invariant] |
| **Excluded: deferred** | Inside architectural boundary, but deferred to a future plan | [e.g. Admin UI, extra export formats, non-critical optimizations] | [e.g. Needs its own design; benchmark-gated follow-up] |

---

## Verified Gaps & Baseline Audit

[Empirically confirmed limitations or bugs found before implementation. Do not guess—run active probes, inspect code/types/output, or write minimal failing tests to prove every finding.]

| Area | Finding | Evidence & Probe Reference |
|---|---|---|
| [Component / API] | [Exact behavior observed: e.g. Silent wrong result, missing type, unhandled error] | [Probe: specific command, test fixture, or source citation `src/path/file.js:42`] |
| [Component / API] | [Exact behavior observed] | [Probe: test output or code reference] |

---

## Approach

### 1. Architecture & Design Decisions
[What changes and where (directory/module boundaries), data structures and types, key decisions and why, rejected alternatives and trade-offs.]

### 2. Invariants & Safety Bounds
[Invariants that must hold: e.g. immutable structures stay immutable across function boundaries; zero allocations on hot paths; backward compatibility with existing serialized data.]

### 3. Edge Cases & Error Handling
[Non-obvious scenarios and how each is handled.]

---

## Implementation Tasks

[Phased sequential tasks; check them off (`- [x]`) as they land. Sizing and the task contract are defined in `/design-plan` Step 4: 1 phase = 1 PR with 3–5 tasks, each task = one commit with `Files:` / `Test:` / `Done when:`. Phases scheduled later from review follow-ups are appended with the next number; existing phases are never renumbered.]

### Phase 1: [Subsystem or Capability]
- [ ] Task 1.1: [Implement core data structures / types]
  - Files: `[1–3 source files]`
  - Test: `[failing unit test written first]`
  - Done when: `[falsifiable condition, e.g. types compile and unit test passes]`
- [ ] Task 1.2: [Implement core logic]
  - Files: `[1–3 source files]`
  - Test: `[failing unit/integration test written first]`
  - Done when: `[falsifiable condition, e.g. specified inputs produce specified outputs]`
- [ ] Task 1.3: [Implement boundary handling / error messages]
  - Files: `[1–3 source files]`
  - Test: `[negative-case test written first]`
  - Done when: `[invalid input yields the specified error instead of a crash]`

### Phase 2: [Next Subsystem or Capability]
- [ ] Task 2.1: [...; put user-facing docs updates in the last phase that changes behavior]
  - Files: `[1–3 source files]`
  - Test: `[failing test written first]`
  - Done when: `[falsifiable condition]`
