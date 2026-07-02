# Decomposition — the entailment-checked carving

> The typed delta this spec implies once validated: the child **cells** to build and the
> dependency-ordered **ticket batch** that builds them. This is the full form of the
> `decomposition` block in `../SKILL.md`; the gate consumes the block, this doc explains it.
> **Computation routes to code:** coverage and partial-order legality are proven by
> `dev-kit-corpus/bin/_entailment_check.py`, not asserted here — **27/27 parent criteria
> covered, 6 tickets, 0 gaps**. (Coverage under the partial order is what the script proves;
> *intent*-entailment — that satisfying the children entails the parent's "even, in-gamut,
> mode-surviving, drift-free" want — is the `critic-entailment` lens, run separately in REVIEW.)

## The seam

The spec carves along the tool's own four-layer architecture (Engine → Tonal → Semantic →
Export, see `spec-draft.md` §4) plus the two cross-cutting shells (the Figma plugin and the
UI/persistence layer). Each becomes one `capability.system.*` cell with a sibling
`rubric.system.*` verifier. The seam is chosen so each child is independently buildable and
testable against its slice of the acceptance criteria.

**Parity is the one cross-child invariant, and it is split deliberately** so no child can
launder it. Binding *all* of parity to the plugin cell (the original carving) let three
implementations pass by reading the same `role-table.json` while their engine math diverged —
the exact `surfaceHighest` 36-vs-37 / silent-math-drift failure the spec cites. The split:

| Parity facet | Criterion | Owning cell | Why there |
|---|---|---|---|
| Engine math agrees (P6 constants, P7 anchors) | `hpg-engine-parity` (differential) | `color-engine` | the engines live here; checked by N random triples agreeing, not a shared file |
| Role table agrees (P1–P5 keys/refs) | `hpg-parity-roletable` | `semantic-mapping` | the role table is this cell's artifact |
| Plugin bindings/offline (AC-P2/P3) | `hpg-plugin-bindings`, `hpg-plugin-offline` | `figma-plugin` | the plugin's own correctness + safety surface |

## Cells → criteria → verifier

| Child capability | Covers (criteria) | Sibling rubric (verifier) | Grounded in |
|---|---|---|---|
| `capability.system.color-engine` | `hpg-engine-roundtrip`, `hpg-engine-branches`, `hpg-engine-gamut-ceiling`, `hpg-engine-oklch-deterministic`, `hpg-engine-parity` | `rubric.system.color-engine` | knowledge-01, verification-anchors.json, AC-E1–5, parity P6/P7 |
| `capability.system.tonal-generation` | `hpg-tonal-ingamut`, `hpg-tonal-monotonic`, `hpg-tonal-chroma-target`, `hpg-tonal-white-endpoint`, `hpg-tonal-curve-fidelity`, `hpg-tonal-hue-stability` | `rubric.system.tonal-generation` | knowledge-02 (§4 `toneAt`, §5 `effHue`), AC-T1–5 |
| `capability.system.semantic-mapping` | `hpg-semantic-roles`, `hpg-semantic-oncolors`, `hpg-semantic-refs-canonical`, `hpg-semantic-surface-mode`, `hpg-parity-roletable` | `rubric.system.semantic-mapping` | knowledge-03, role-table.json, AC-S1–5, parity P1–P5 |
| `capability.system.export-formats` | `hpg-export-dtcg-shape`, `hpg-export-leaf-valid`, `hpg-export-resolved`, `hpg-export-css-resolves`, `hpg-export-padding`, `hpg-export-disabled-palette`, `hpg-export-nonempty` | `rubric.system.export-formats` | knowledge-04, AC-X1–7, AC-U2, ADR-002/005/006 |
| `capability.system.figma-plugin` | `hpg-plugin-bindings`, `hpg-plugin-offline` | `rubric.system.figma-plugin` | knowledge-05, AC-P2/P3, ADR-010 |
| `capability.system.ui-persistence` | `hpg-persistence-roundtrip`, `hpg-export-theme-invariant` | `rubric.system.ui-persistence` | spec-draft.md §11, AC-U1/U3 |

## Build order (dependency edges)

All edges are `capability → capability` (same layer, legal under the partial order):

```
color-engine
   └─▶ tonal-generation
          └─▶ semantic-mapping
                 ├─▶ export-formats
                 ├─▶ figma-plugin
                 └─▶ ui-persistence
```

`semantic-mapping` is the hub: exports, the plugin, and the UI all consume the resolved
role→ref mappings.

## Maturity — current state (as built into the instance)

The carving has been seeded into the dev-factory instance and is **partly earned, honestly**:

- **Validated:** `ontology.system.hct-domain`, `spec.system.hct-palette-generator-spec`, and all
  six `rubric.system.*` verifier cells (each passed `rubric-check.py`: a `[gate]` dimension + a
  worker-unreachable pristine reference). **Caveat:** the rubrics are *mechanically* validated as
  calibrated-verifier **definitions** — their held-out exemplar / sealed-config sets are referenced
  but not all materialized on disk, and `false_pass` is **unmeasured** (calibrated-but-unrefuted) —
  so they are sound definitions, not yet empirically-proven gates.
- **`defined`:** the six `capability.system.*` cells — the tool's parts are specified, not built.
- **Active tickets:** one `defined→instantiated` build ticket per capability, each bound to its
  validated rubric. The depth-first frontier has only `color-engine` ready (its `ontology`+`spec`
  footholds are validated); each downstream slice unlocks as its upstream capability validates.
- Nothing is pre-marked `validated` it has not earned — no green grid.

## Next handoff (the build, not the spec)

The spec → lattice decomposition is **done** (`rubric-architect` → `lattice-architect` /
`roadmap-planner` ran). What remains is the **tool build**. (Status note: the engine source now lives in this repo at `src/engine/` — `hct.js`, `tonal.js`, `semantic.js`, `exports.js`, etc. — so the original blocker below is resolved; `gen.js` was never created, the single-source `src/engine/` module set supersedes it.)

1. Point the instance at (or import) the tool source so `capability.system.color-engine` can be
   advanced `defined→instantiated` and then validated against `rubric.system.color-engine`.
2. Materialize the rubrics' held-out exemplar / sealed-config sets and run a calibration pass to
   move them from mechanically-validated to empirically-calibrated (drive `false_pass` off
   `unmeasured`).
3. Work the build tickets in dependency order as each upstream capability validates.
