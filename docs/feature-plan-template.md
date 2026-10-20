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
- [Falsifiable completion criterion 1: e.g. all tests pass, zero regressions on conformance corpus]
- [Falsifiable completion criterion 2: e.g. public API signatures match specification]
- [Falsifiable completion criterion 3: e.g. targeted diagnostics issued for unsupported constructs, no internal errors]
- [Documentation criterion: e.g. user docs and CHANGELOG.md updated]

---

## Scope Rule & Boundary Matrix

[Define explicit rules for what is allowed in this feature versus what is rejected. Classify items into clear categories.]

| Category | Rule | Examples / Members |
|---|---|---|
| **In scope: core** | Supported across all targets/platforms | [e.g. Pure data algorithms, core parser, internal models] |
| **In scope: target-specific** | Supported in specific target; targeted diagnostic elsewhere | [e.g. Browser DOM APIs in JS only, SIMD in WASM only] |
| **Excluded: runtime / platform** | Out of architectural scope; targeted diagnostic | [e.g. Reflection, raw OS threads, unsupported host calls] |
| **Excluded: deferred** | Inside architectural boundary, but deferred to a future plan | [e.g. Advanced codecs, large lookup tables, non-critical optimizations] |

---

## Verified Gaps & Baseline Audit

[Empirically confirmed limitations or bugs found before implementation. Do not guess—run active probes, inspect ASTs/types, or write minimal failing tests to prove every finding.]

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
> - **Execution Convention**: Each task is an atomic git commit (`feat(<scope>): <summary> (Task N.M)`). In automated workflows (`/execute-plan`), the orchestrator loops continuously through all tasks in a phase, committing each task individually, running quality gates, and opening a phase PR upon completion without halting mid-phase.

### Phase 1: Baseline Audit & Test Fixtures
- [ ] Task 1.1: Add failing conformance fixtures reproducing all items in the Verified Gaps table.
- [ ] Task 1.2: Establish baseline benchmark numbers (if performance-sensitive).

### Phase 2: Core Implementation
- [ ] Task 2.1: [Implement core data structures / types]
- [ ] Task 2.2: [Implement core logic / lowered algorithms]
- [ ] Task 2.3: [Implement boundary adapters / diagnostics]

### Phase 3: Integration & Quality Gates
- [ ] Task 3.1: Run full test suite and verify all conformance fixtures pass.
- [ ] Task 3.2: Run `lefthook run pre-commit` (or project linter and formatter).
- [ ] Task 3.3: Update public documentation and `CHANGELOG.md` under `## [Unreleased]`.

---

## Test & Conformance Plan

[Specify how this feature is verified. Be specific: file paths, fixture commands, expected outputs.]

- **Unit Tests:** `[path to unit test files and key test cases]`
- **Integration / Conformance:** `[path to fixtures comparing output against ground-truth reference]`
- **Negative Cases & Diagnostics:** `[invalid inputs that must produce clear error messages / diagnostics instead of crashes]`
- **Benchmarks (if applicable):** `[benchmark commands and target thresholds]`
