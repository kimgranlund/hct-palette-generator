# CHANGELOG

## 1.0 — 2026-06-18 — scrim ramp → 11 even steps (5–95%); strengths span the full range (CONTRACT change)

The scrim translucency ramp changed from 7 clustered steps (`100/175/250/300/400/450/550` = 10/17.5/25/30/40/45/55%)
to a clean **11-step even ramp**: `SCRIM_STEPS = [50,100,200,300,400,500,600,700,800,900,950]` = the 500 color at
**5/10/20/30/40/50/60/70/80/90/95%**. This DECOUPLES two things the code conflated:

- **Emitted raw scrim primitives** (`exports.js` `SCRIM_STEPS`, `role-table.json` constants) — now all **11** steps.
- **The 7 semantic scrim STRENGTH roles** (`semantic.js` `SCRIM_STRENGTH_STEPS`) — bind to a 7-step **subset**
  spanning the full range: weakest→strongest = `50/100/200/400/600/800/950` (5→95%). Steps `500/700/900` are
  emitted as raw primitives but carry no strength role.

Role remaps (visible tokens): the 4 disappearing steps (175/250/450/550) forced remapping the 12 scrim-using roles —
`outline 550→600`, `container 175→200`, `containerHigh 250→300`, and the strengths as above; `outlineVariant 400`,
`containerLow 100`, `scrim 400`… resolved to valid emitted steps. (`outlineVariant`/`containerLow` unchanged.)

Folded in lockstep: `data/role-table.json` (constants `SCRIM_STEPS` + the 10 changed role refs), `src/engine/exports.js`
(emitted set + the constants are now exported), `src/engine/semantic.js` (the strength loop now uses
`SCRIM_STRENGTH_STEPS`; outline/container literals), `src/ui/model.mjs` (`tokenCount` now derives the scrim count from
the engine constants — the stale `3 * 7` is gone), and the prose (`knowledge-03/04`, `glossary`, the `hpg-export-padding`
contract example). The verifiers read `SCRIM_STEPS` from `role-table.json`, so the contract change propagates.

Gate: `npm test` green (9 verifiers + headless boot). No criterion text changed — `hpg-semantic-roles` (still exactly 7
strengths), `hpg-semantic-refs-canonical` (every ref still resolves; all role steps ∈ EXPORT_STOPS), and
`hpg-export-padding` still hold.

## 0.9 — 2026-06-17 — OD-004 spike: the aliased-export SHAPE is gated (no behavior change)

The `rawColl` opt-in already emitted the full documented name+collection alias shape
(`com.figma.aliasData` = `{ targetVariableName: "{n}/{refKey}", targetVariableSetName: rawColl }`),
but only `targetVariableName` was verified. The export verifier now also asserts
`targetVariableSetName === "raw-colors"` on **every** aliased semantic leaf, so the shape Figma's
documented `aliasData` fallback hierarchy resolves on native import (when the raw-colors collection
pre-exists) can no longer silently regress.

Folded in lockstep: `hpg-export-resolved` (SKILL contract) + `AC-X6` (rubric) +
`test/engine/exports.mjs` (verifier). **No engine/output change** — the tool already emitted this
shape; this revision is verification + honest status only.

**OD-004** advanced OPEN→**spike implemented** (the shape is gated). Still OPEN, NOT decided: the
native-import cascade is unvalidated end-to-end (no Figma in CI) and there is no user-facing
plugin-free download. ADR-002 default (resolved colors) unchanged; the plugin stays the reliable
path. Next: validate in real Figma, then decide whether to expose a (clearly-experimental)
plugin-free download.

Gate: `npm test` green (9 verifiers + headless boot).

## 0.8 — 2026-06-17 — scrims become a single 500-based translucency ramp (CONTRACT change)

The scrim model changed from "base-{index}" over three bases (250/500/750) at 7 fixed alphas to a
**single 500-based ramp**: a scrim primitive is `500-{step}` = the palette's 500 color at **alpha% =
step/10** (e.g. `500-175` = 500 @ 17.5%). A scrim is now a translucency **sub-variant of the palette** —
it tracks the 500 stop as hue/chroma/skew/lift change. All 12 scrim-using roles remap onto this ramp by
closest step (the 7 `scrim*` strengths → 100/175/250/300/400/450/550; outline → 550; outlineVariant →
400; container/Low/High → 175/100/250) and become **mode-flat** (light === dark), including outline +
containers (which lose their former 250-light/750-dark split — a deliberate choice). Token naming:
`{family}-500-{step}` (e.g. `--c-neutral-500-175`).

Folded through every layer: `data/role-table.json` (constants `SCRIM_BASES:[500]` + `SCRIM_STEPS`; the
12 rows), the criteria (`hpg-semantic-roles`, `hpg-semantic-refs-canonical`, `hpg-export-padding`,
`hpg-plugin-bindings`, `hpg-engine-parity` P6), and the prose. Re-validated: spec-quality 29/29; the
semantic-mapping/export-formats/figma-plugin rubrics + all five capability cells (semantic-mapping,
export-formats, figma-plugin, ui-app, figma-plugin-app); the figma cascade still aliases every role to a
created raw var. (Implementation cells re-stamped against this spec.)

## 0.7 — 2026-06-17 — reconcile prose with shipped reality (no contract change)

A prose-only reconciliation pass — **zero acceptance criteria changed**, so dependents stay
`validated` (the staleness cascade is for contract changes, and the lattice did not flag the
hash drift). Three things had drifted from reality:

- **Stale entailment count.** The Decomposition prose said "27/27 covered" but `hpg-tonal-damping-curve`
  + `hpg-tonal-edge-hue` had since been folded into the tonal ticket → corrected to **29/29, 6 tickets**
  (matches `spec-quality-check`: "29/29 criteria covered").
- **Stale build status.** "six capability cells seeded at `defined` … only `color-engine` ready" → now
  all six rubric + six capability cells are **validated**; named the two downstream **integration** cells
  that consume them and are gated by their own harnesses outside this engine/output carving (mirroring how
  the editor UI is excluded): `capability.system.ui-app` and `capability.system.figma-plugin-app` (the
  generator-as-plugin: `figmaBundle()` → `raw-colors` + `Semantic` Light/Dark, aliased, **idempotent**).
- **Unacknowledged editor surfaces.** The editor-UI non-goal now explicitly names the shipped gallery
  **Import** + drawer **Config** tab as `ui-app` convenience surfaces over the specced persistence
  round-trip (`hpg-persistence-roundtrip`), not new token-output contracts; and the live-cascade non-goal
  now names BOTH plugin realizations (`figma-plugin` Binder + `figma-plugin-app`). Re-minted the
  spec-quality signal (29/29, exit 0).

## 0.6 — 2026-06-15 — differential damping curve (additive, backward-compatible)

Generalized the single `damp` scalar (× a hardcoded `^1.5`, symmetric edge falloff) into a
**differential chroma-multiplier curve** `m(stop)` with three new controls — `dampCurve`
(falloff exponent γ, where damping bites), `dampAmp` (mid-tone amplify toward the gamut
ceiling, `m > 1`), and `dampBias` (light↔dark asymmetry). Defaults (γ 1.5 / amp 0 / bias 0)
reduce `m` to the legacy `1 − (damp/100)·u^1.5` **exactly**, so every existing palette and
export is byte-unchanged. Threaded through `tonal.js` (engine), `model.mjs`, `persist.js`
(domains + hydrate defaults for pre-field docs), and `exports.js`; surfaced as three Global
sliders + a live `m(stop)` curve graph. `min(target·m, gamut)` still clamps, so amplify only
pushes toward the ceiling. Updated `knowledge-02-tonal-scale.md`, `spec-draft.md` (State +
formula), and the `hpg-tonal-chroma-target` criterion (dampFactor → the multiplier m).
Re-validated tonal-generation, export-formats, ui-persistence, ui-app against unchanged rubrics.

**Spec-council REVIEW + REFINE.** Ran the six lens-critics (completeness · testability · entailment ·
ambiguity · scope · hackability) over this change. Scope: APPROVED; the rest CONDITIONAL with valid
findings, all folded back: the `max(0,·)` floor and the absent-field hydrate path are now gated
(`hpg-tonal-damping-curve` (b); `hpg-persistence-roundtrip` absent-field clause); the (d) bias and
(e) falloff gates were hardened from gameable per-half sums into a **mirror-symmetry + mid-invariance**
check (defeats a directional sign-branch) and a **redistribution** check (defeats a global γ-scalar) —
both falsified against the exact hacks the hackability lens constructed; the damping battery now runs
over **every saturated hue**, not one; `dampCurve`/`dampAmp`/`dampBias` added to the glossary; the stale
`dampF` symbol and the `ui-plan` T4 control list fixed.

## 0.5 — 2026-06-15 — spec UPDATE from the build (the outer loop)

Having **built the whole tool from this spec** (6 capability modules + the UI, all validated by independent
harnesses), folded the build's evidence back into the contract — the dev-factory **outer loop** (operating
evidence → regenerate the upstream spec), via the ledgered `validated → regenerating → validated` path.

- **Hue-stability aligned to its validated verifier.** `hpg-tonal-hue-stability` now states **emitted-chroma > 20
  / ±2°** (the 8-bit-calibrated thresholds the harness has run since 0.4) instead of the unachievable idealized
  `chroma > 1 / ±1°`. The spec criterion, `rubric.system.tonal-generation`, and the harness now agree.
- **Parity de-legacied.** `hpg-engine-parity` + `hpg-parity-roletable` are now **CONDITIONAL on packaging**: a
  single-source build (one engine / role-table module imported everywhere) satisfies them **structurally**; the
  differential check applies only IF ≥2 independent implementations ship. Parity is a property of multi-impl
  *distribution*, not of the domain — the 3-impl (artifact / gen.js / plugin) premise was legacy baggage. The
  criteria now verify OUTPUT properties, not a specific `<script>` / gen.js file layout.
- **Distribution vs authoring (ADR-010).** "Single-file / offline" is the *distribution* format (the reference
  build authors modular ES modules and bundles to one offline HTML), not an authoring constraint.
- **OD-005 DECIDED — palette count is configurable** (the criteria are "for every palette"; the validated UI
  ships it). The "8-palette ceiling" non-goal is retired.
- **UI scoped out.** A new non-goal makes the interactive editor UI a *separate* spec (`references/ui-plan.md` /
  `capability.system.ui-app`); this spec covers the generator + its output only.

Gate re-passes (27/27); spec re-validated; `rubric.system.tonal-generation` re-minted to match.

## 0.4 — 2026-06-15 — build-surfaced calibration (hue-stability), from the factory loop

Building `capability.system.tonal-generation` through the loop, its executable verifier surfaced that
`hpg-tonal-hue-stability`'s idealized threshold (**applied** chroma > 1, **±1.0°**) is unachievable against
real **8-bit sRGB output** plus the engine's own Δ≤2 roundtrip budget: near-neutral and tonal-extreme stops
carry no stable hue, and a Δ≤2 channel error is ~2° of CAM16 hue at low-chroma colors. The validated adapter
(`capability/tonal-generation/verify.mjs`) calibrates the check to **emitted** chroma > 20 and **±2°** (= the
engine's roundtrip budget expressed as hue) — verified robust across all 8 default palettes (max hue drift
≤1.48°, 3–20 hue-checked stops each; a real per-stop hue-recompute bug still drifts far more). This is the
**outer loop**: operating evidence calibrating the spec. **Follow-up (deferred):** align the spec criterion +
`rubric.system.tonal-generation` text to the 8-bit-calibrated thresholds (emitted-chroma>20 / ±2°) — deferred
to avoid re-staling the freshly-validated tonal slice mid-build.

## 0.3 — 2026-06-15 — Re-review (close the loop) + maintenance

Re-ran the spec-council on the REFINEd spec (the prior council saw only the 12-criterion draft),
confirmed every prior finding **closed**, folded the new findings the expansion surfaced (now **27
criteria**), then a maintenance pass.

**Re-review + second REFINE.**
- **Perceptual-evenness entailment (residual):** added `hpg-tonal-curve-fidelity` — the L\*
  *recomputed from the emitted sRGB* (NOT a stored tone field) must equal `toneAt(...)` within
  |ΔL\*| ≤ 1.0 across all five curves and the skew grid. Closes the entailment gap AND the
  tautology the hackability lens caught (comparing `toneAt` to itself).
- **Hue-stability:** added `hpg-tonal-hue-stability` — the Intent now promises "stable hue", so a
  criterion owns it (CAM16 hue of every chromatic stop == `effHue` within ±1°). (entailment F2)
- **Undefined tolerances pinned:** chroma-target (|ΔC| ≤ 1.0 + hard floor ≥ 0.5·min(target,cm)),
  engine-parity (≥1000 random triples, chroma≥5, tone∈(2,98), max-channel ≤ 2), engine-branches
  (max−min ≤ 1, not exact ==), leaf-valid hex rule (`Math.round(c·255)`). (testability/hackability)
- **Terminology (residual):** glossary splits **scrim primitive** (a ref target) from **scrim role**
  (not a target); on-color shorthand now carries both 050 and 200. (ambiguity)
- **Doc sync:** `references/decomposition.md` → 27/27 + the real maturity (rubrics validated, cells
  `defined`, tickets active — the prior "not yet validated" note was stale). ADR-003 "perceptually
  correct" → "contrast-optimized" (retires the rhyme with "perceptually even").

**Maintenance (UPDATE).**
- **ADR-002 re-verified (2026-06-15)** against Figma's current "Modes for variables" doc: the
  `com.figma.aliasData` extension documents a name+collection-name fallback, **softening** the
  "needs library UUIDs / name-only errors" claim. Resolved-colors default kept; the aliased path is
  now plausible-but-conditional (target collection must pre-exist).
- **OD-004** narrowed OPEN→spike (plugin-free aliased export is feasible to validate end-to-end).
- **OD-005** recommendation: the 27 criteria are all "for every palette", so a configurable count is
  low-risk; keep 8 default, allow a cap. An owner/product call.

Gate re-passes (27/27); spec cell re-validated. `rubric.system.tonal-generation` flagged **stale** —
it must gain the two new tonal dimensions (curve-fidelity, hue-stability) before it can gate the
tonal build.

## 0.2 — June 2026 — spec-author bring-up to dev-factory SKILL-format

Brought the package up to the dev-factory **SKILL-format spec** standard so it is a valid,
gate-passing `spec.system.hct-palette-generator-spec` cell — and hardened it through a
spec-council REVIEW.

**Authored the machine-readable contract.** `SKILL.md` now embeds the fenced `json` contract
block the **spec-quality** gate reads: `cell`, `binds_rubric` (`rubric.system.spec-quality`),
`acceptance_criteria`, `non_goals`, and an entailment-checked `decomposition`. Previously the
package carried its acceptance criteria only as prose in `rubrics/`, so it failed every hard
gate dimension (no structured block). Verified: `spec-quality-check.py` passes;
`_entailment_check.py` 25/25 covered.

**Council REFINE (the generator/critic split).** A six-lens adversarial review
(completeness · testability · entailment · ambiguity · scope · hackability) ran over the
draft and returned CONDITIONAL. Folded its surviving findings back:
- **Anti-hack predicates promoted from `rubrics/` into the contract** (they existed but were
  dropped in the 28→25 compression): engine-math parity P6/P7 (`hpg-engine-parity`,
  differential — a shared `role-table.json` can no longer fake engine agreement), the chroma
  floor AC-T5 (`hpg-tonal-chroma-target` — a flat gray ramp no longer passes the gamut
  criterion), the surface mirror invariant AC-S5, DTCG leaf validity + non-vacuity AC-X5, the
  CSS two-layer resolution AC-X2, the disabled-palette filter AC-U2, engine branches AC-E2/E3,
  plugin bindings/offline AC-P2/P3.
- **Parity split across three cells** (engine-math → color-engine, role-table →
  semantic-mapping, plugin → figma-plugin) to fix the misplaced cross-child seam.
- **Ambiguity fixes:** `hpg-semantic-oncolors` now states the on-color as "the 50 stop (stored
  '50', padded '050')" — the prior `=== 050` literal was false against `role-table.json` which
  stores `'50'`; `hpg-semantic-refs-canonical` now requires refs to EQUAL the canonical ref,
  not merely resolve.
- **Testability fixes:** the gamut-ceiling tolerance is a fixed 0.5 (not "within search
  resolution"); monotonicity is weak with an enumerated skew grid; the fused
  persistence/theme criterion is split.
- **Scope fixes:** non-goals now cite the OPEN decisions they bound (OD-004 aliased export,
  OD-005 palette count) instead of claiming closure; OKLCH-input fidelity and UI3-native
  import are explicit non-goals; the accessibility non-goal is a real boundary, not a TODO.

**Added** `references/decomposition.md` — the full carving (cells + tickets + the parity
split + the honest-maturity note: the six child rubric cells are not yet validated, so the
carving is proven-covering but not yet dispatchable).

## 0.1 — June 2026 — Initial extraction

Created as a spec source package for the HCT Palette Generator, intended for import and
enhancement by spec-author.

**Provenance.** Content was extracted directly from the working tool rather than written
from memory:
- The 37-role table, defaults, and constants in `data/role-table.json` were generated by
  evaluating the artifact's own `semanticRoles`, `DEFAULTS`, and stop/scrim constants —
  ground truth, not transcription.
- The engine verification anchors in `data/verification-anchors.json` were computed by
  running the reference engine (`hct.js`): forward CAM16 + L-star, then `hctToRgb` inverse
  roundtrip for red/green/blue/white/black/mid-gray. All anchors roundtrip with 0 channel
  delta on the current engine.

**Structure.**
- `SKILL.md` — entry point, first principles, spec-author handoff instructions.
- `references/spec-draft.md` — the spec in spec-author's hybrid Brief+TDD format
  (header block, "How to Read", common spine, 📐💡⚠️ markers, OD table, anti-patterns).
- `references/knowledge-01..05.md` — decomposed knowledge foundation: engine, tonal scale,
  semantic system, export formats, plugin.
- `references/decision-records.md` — ADR-001…010, the fenced choices, with a map of the
  decisions an enhancing agent is most likely to wrongly "fix".
- `references/glossary.md` — project vocabulary.
- `rubrics/` — quality rubric (spec-author 10 dimensions + project completeness gate),
  acceptance criteria (runnable predicates), parity checklist (three-implementation gate).

**Research grounding.** The Figma-import behavior captured in `knowledge-04` and ADR-002 was
established by prior research against Figma's "Modes for variables" documentation: native
import accepts DTCG; cross-collection `aliasData` needs library-key UUIDs minted on export;
name-only aliasData errors rather than falling back. This is time-sensitive — an enhancing
pass should re-verify it.

**Known fenced decisions (do not silently revert).** On-colors fixed to `050` overriding
contrast (ADR-003 / OD-001); semantic scrim roles on base 750 only (ADR-004 / OD-002);
resolved-not-aliased semantic exports (ADR-002); UI3 schema is interchange-only (ADR-007 /
OD-003).

**Open follow-ups for the next pass.** No quantitative skill-trigger eval was run (this is a
knowledge package, not a behavioral skill). spec-author should re-verify Figma behavior, run
the Layer B gate, and decide OD-004 (aliased cascade without the plugin) and OD-005 (palette
count).
