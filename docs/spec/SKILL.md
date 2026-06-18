---
name: hct-palette-generator-spec
description: >
  Spec cell for the HCT Palette Generator — a single-file browser tool that builds
  perceptually even color palettes (hue and chroma from CAM16, tone from CIELAB L-star,
  clamped to the sRGB gamut ceiling by construction) plus a 37-role semantic token layer,
  exporting to CSS, OKLCH, JSON, Figma DTCG, and a Figma cascade plugin. Scope: the tool and
  its parts — the color engine (CAM16, gamut search, fixed viewing conditions),
  tonal-scale generation (curves, skew, lift, chroma damping), the semantic token system
  (roles, on-colors, scrims, surface ramps, light/dark modes), the export formats and Figma
  import behavior, and the cascade plugin. NOT brand-color picking, NOT a build pipeline.
  Use whenever writing, enhancing, scoring, regenerating, debugging, or reviewing the tool or
  its spec, or when an agent needs the canonical role table, defaults, decision records, or
  acceptance criteria. Reach for it even if the request just says the palette tool, the HCT
  generator, scrims, on-colors, or the binder plugin.
---

# HCT Palette Generator — a perceptual, in-gamut palette + semantic-token generator

> **SKILL-format spec cell `spec.system.hct-palette-generator-spec`.** This file is both the
> readable brief and — in the fenced `json` contract block below — the machine-readable
> contract the **spec-quality** gate reads (the first `json` block is the single source of
> truth). Depth lives in `references/` and `rubrics/`; provenance and research-grounding in
> `CHANGELOG.md`. It carries everything needed to write, enhance, regenerate, or review the
> tool, and is structured for handoff to **spec-author** and downstream decomposition.

**Intent.** Design-system engineers need color ramps with *perceptually even* steps and a
full semantic token layer that survives a light/dark mode flip and imports without error into
CSS and Figma. Naive lightness scaling drifts hue and clips the gamut; a fixed per-hue chroma
clips at the light/dark ends; mode handling bolted onto raw colors breaks the moment a role
mapping stops being a simple mirror. The HCT Palette Generator removes all three at the root
by **treating color as a point in a perceptual space against a gamut boundary, not a scalar
to push around**: tone is CIELAB L\*, hue/chroma is CAM16, every emitted color is clamped
in-gamut at its tone, and the entire light/dark flip lives in one semantic `--c-*` layer over
flat raw tokens. Output is a set of portable token artifacts (five export formats) plus an
optional live raw→semantic cascade in Figma — delivered as one offline, dependency-free,
single-file tool.

> **"Perceptually even" = the ramp follows the selected CIELAB-L\* curve with stable hue
> (criterion `hpg-tonal-curve-fidelity`), NOT uniform ΔL\* steps — the logistic default is
> deliberately shaped. It governs ramp *spacing*, not contrast.** The on-colors are
> deliberately *not* contrast-optimized (ADR-003); do not read "perceptual" as a contrast
> guarantee. **"Imports without error"** is the DTCG resolved-color path (ADR-002) plus the
> plugin cascade — not an open-ended claim about every Figma version (ADR-002 is
> time-sensitive; re-verify on an enhancing pass).

**Acceptance criteria.** Twenty-seven checkable predicates, one contract criterion per
load-bearing predicate in `rubrics/acceptance-criteria.md` (AC-E/T/S/X/P/U) and
`rubrics/parity-checklist.md` (P1–P8) — promoted into the contract so the gate's signal
covers the *anti-hack* predicates (engine-math parity P6/P7, the chroma floor AC-T5, the
mirror invariant AC-S5, leaf validity AC-X5, the disabled-palette filter AC-U2), not only the
happy path. The machine-readable form is the contract block below; the full runnable
procedures (including the three-implementation extraction for parity) are in those rubric
files; engine anchors are `data/verification-anchors.json`.

**Non-goals.** Eight explicit boundaries (contract block), each tied to an ADR or OPEN
decision: not a brand picker / non-HCT tool (ADR-001; the 8-palette set is the current
default with expansion OPEN in OD-005); not a build-time pipeline (ADR-010); no contrast-aware
on-color auto-pick (ADR-003 / OD-001); no exposed VC controls (ADR-009); no *color-accurate*
OKLCH input (the bridge's drift is unbounded by design, ADR-008 — only its determinism is
validated); no plugin-free aliased export in this revision (resolved colors only, ADR-002;
the question is OPEN in OD-004); UI3 is interchange-only, not a native Figma import path
(ADR-007 / OD-003); no WCAG gating or a11y reporting (a raw contrast readout only).

**Decomposition.** Carves along the four-layer architecture plus the plugin and the UI/
persistence shell into six `capability` cells, each gated by a sibling `rubric` cell. Parity
is **split across three cells** (engine-math parity → `color-engine`; role-table parity →
`semantic-mapping`; plugin bindings/offline → `figma-plugin`) so no single child can launder a
shared `role-table.json` into a green "three implementations agree" while the engine math
diverges. `_entailment_check.py` proves the carving **covers** all criteria (the partial-order
gate: **29/29 covered, 6 tickets** — the count grew from 27 when `hpg-tonal-damping-curve` and
`hpg-tonal-edge-hue` were folded into the tonal ticket); the council's entailment lens additionally
pressure-tested intent-entailment. Full carving + the honest-maturity note in `references/decomposition.md`.
The six child rubric cells **and** the six capability cells are now **validated**. Two further
**integration** cells consume them downstream and are validated against their own harnesses — NOT part
of this engine/output carving (the same way the editor UI is a separate concern): `capability.system.ui-app`
(the interactive generator UI) and `capability.system.figma-plugin-app` (that same UI packaged as a Figma
plugin, applying `figmaBundle()` → a `raw-colors` collection + a `Semantic` Light/Dark collection whose
every role is aliased to its raw var, **idempotently** on re-apply).

```json
{
  "title": "HCT Palette Generator",
  "cell": "spec.system.hct-palette-generator-spec",
  "binds_rubric": "rubric.system.spec-quality",
  "acceptance_criteria": [
    { "id": "hpg-engine-roundtrip", "check": "for the 6 anchors in data/verification-anchors.json AND for >=1000 random in-gamut (hue,chroma,tone) triples, cam16FromRgb + L* forward then hctToRgb inverse roundtrips with max(|dr|,|dg|,|db|) on sRGB 0-255 <= 2 (AC-E1; anchors are a regression floor, the random quantification defeats a 6-entry lookup-table engine)" },
    { "id": "hpg-engine-branches", "check": "hctToRgb(h,c,0) == black and hctToRgb(h,c,100) == white for any h,c (AC-E2); hctToRgb(h,0.3,t) returns a neutral gray (max(r,g,b)-min(r,g,b) <= 1, allowing the <=2 channel roundtrip budget) for any h and t in (0,100) (AC-E3)" },
    { "id": "hpg-engine-gamut-ceiling", "check": "for >=1000 random (hue,tone) with tone in (0,100): hctToRgb(hue, maxChromaInGamut(hue,tone), tone).inGamut === true AND hctToRgb(hue, maxChromaInGamut(hue,tone)+0.5, tone).inGamut === false (the fixed probe 0.5 >> the binary-search residual; assumes maxChromaInGamut converges to <= 0.01 residual, e.g. 18 iterations over [0,180]) (AC-E4)" },
    { "id": "hpg-engine-oklch-deterministic", "check": "oklchToCam16Hue(h) is deterministic and memoized — repeated calls return an identical CAM16 angle — and maxChromaInGamut/peakC are stable across repeated calls (AC-E5, ADR-008). Fidelity/drift of the OKLCH bridge is a declared non-goal, not checked here" },
    { "id": "hpg-engine-parity", "check": "CONDITIONAL on packaging (parity is a property of multi-impl distribution, NOT of the domain): a SINGLE-SOURCE build — one engine module imported everywhere — satisfies this structurally (no second implementation can diverge), so it is auto-satisfied. IF >=2 independent engine implementations are shipped, they must agree differentially: >=1000 random (hue,chroma,tone) with chroma >= 5 and tone in (2,98) agree within max(|dr|,|dg|,|db|) <= 2 (sRGB 0-255), both pass every data/verification-anchors.json anchor (P7), and SCRIM_BASES/SCRIM_STEPS/PEAK/stops match (P6) — a shared role-table.json cannot fake engine-math agreement" },
    { "id": "hpg-tonal-ingamut", "check": "for every default palette and every EXPORT_STOPS stop, hctToRgb(...).inGamut === true AND applied chroma <= maxChromaInGamut at that stop (AC-T1, AC-T4)" },
    { "id": "hpg-tonal-monotonic", "check": "tone is weakly monotonic (tone[i] >= tone[i+1], equal allowed at the lmin/lmax clamp) across EXPORT_STOPS from 050 to 950 for each of the five curves, at default skew/lift AND at skew in {-100,-50,0,50,100} with lift 0 (AC-T3)" },
    { "id": "hpg-tonal-chroma-target", "check": "edge damping reduces chroma toward the ends — chroma at stop 500 >= chroma at 050 and >= chroma at 950 for a saturated palette (AC-T5) — AND for each saturated default palette (chroma control >= 50) applied chroma at the prime tone (stop 500) equals min(target*m, maxChromaInGamut) — where m is the differential damping multiplier, m = 1 at stop 500 when dampAmp = 0 — within |dC| <= 1.0 AND >= 0.5*min(target, maxChromaInGamut) (a hard floor no tolerance-widening can readmit), so a flat gray ramp (chroma ~ 0) does NOT satisfy the tonal criteria" },
    { "id": "hpg-tonal-white-endpoint", "check": "with lmax = 100, every default palette's 050 stop resolves to #FFFFFF (AC-T2)" },
    { "id": "hpg-tonal-curve-fidelity", "check": "the L* RECOMPUTED FROM THE EMITTED sRGB (engine lFromY, == hctToRgb(...).lstar which knowledge-01 derives from the searched XYZ — NOT a stored tone field) equals toneAt(stop, skew, lift) within |dL*| <= 1.0 at every EXPORT_STOPS stop, for each of the five curves at default skew/lift AND at skew in {-100,-50,0,50,100} incl. the Warning default (skew 40, lift 15), except the tone<=0/>=100 clamp ends — so the EMITTED ramp follows the SPECIFIED CIELAB-L* profile (the tool's 'perceptually even' = curve-shaped, NOT uniform-step); not satisfiable by comparing toneAt to itself" },
    { "id": "hpg-tonal-hue-stability", "check": "for every default palette, the CAM16 hue of every EXPORT_STOPS stop whose EMITTED color carries chroma > 20 equals the per-stop TARGET hue effHue(palette.hue) + hueShift·(stop-500)/450 — which is flat effHue when hueShift=0 (the default palettes), edge-rotated otherwise — within +/-2.0 degrees (= the engine's <=2-channel roundtrip budget expressed in hue; near-neutral / tonal-extreme stops, where 8-bit sRGB quantization dominates and hue is not load-bearing, are exempt) — the ramp holds the SPECIFIED per-stop hue (constant when hueShift=0, per knowledge-01 'hue does not drift'; the deliberate edge rotation is gated by hpg-tonal-edge-hue), a property a per-stop roundtrip check does not own. 8-bit-calibrated from the build (CHANGELOG 0.4/0.5)" },
    { "id": "hpg-tonal-damping-curve", "check": "the differential damping multiplier m(stop) = max(0, 1 + (dampAmp/100)(1-u^dampCurve) - (damp/100)·sideW·u^dampCurve), u = |stop-500|/450, sideW = max(0, 1 + (dampBias/100)·sign(stop-500)), property-gated (NOT a re-derivation of the formula) and run over EVERY saturated default hue (not one): (a) the defaults dampCurve=1.5/dampAmp=0/dampBias=0 reproduce the legacy 1-(damp/100)u^1.5 chroma EXACTLY (|dC| <= 1e-6, checked against the INDEPENDENT legacy formula); (b) amplify is gamut-safe — dampAmp=100 (and damp=100 × dampBias=±100) across curve extremes keeps every stop inGamut with chroma <= ceiling AND chroma >= 0 (the min(target·m, ceiling) clamp and the max(0,·) floor both hold; a removed floor feeds negative chroma to the engine); (c) amplify pushes mid (stop 500) chroma TO the ceiling — on a hue where target·2 exceeds the ceiling, at dampAmp=100 the mid equals the ceiling within 0.5 (the clamp is the binding constraint, asserted, not merely a rise); (d) bias is a MIRROR-SYMMETRIC per-side weight that VANISHES at the mid — chroma(500) is dampBias-invariant, and on an unclamped low-chroma probe ramp(+b)[stop S] equals ramp(−b)[stop 1000−S] (defeats a directional sign-branch that orders the per-half sums but isn't a true per-side weight); (e) dampCurve REDISTRIBUTES, not rescales — it leaves chroma(500) fixed AND a sharp curve keeps MORE chroma at a quarter stop than a broad one (damping confined to the ends; defeats a global γ-scalar); (f) damping is tone-invariant — it perturbs chroma only, never tone" },
    { "id": "hpg-tonal-edge-hue", "check": "per-palette EDGE HUE ROTATION hueShift (−60..60°, default 0): the emitted hue rotates toward the two ends, pivoting on stop 500 — in OPPOSITE directions by default, or BOTH ends the SAME direction when the per-palette hueSameDir flag is set. Per-stop target hue = baseHue + hueShift·s (opposite) or baseHue − hueShift·|s| (same-direction, both ends matching the LIGHT end), s=(stop−500)/450 (light end s=−1, dark end s=+1; the gamut ceiling is taken at the rotated per-stop hue, chroma target stays % of the BASE-hue peak). Property-gated on a saturated hue, the emitted CAM16 hue measured from the pixel where chroma>30 (where hue is load-bearing): (a) hueShift=0 reproduces the flat base hue at every chromatic stop (backward-compatible — the default palettes); (b) the emitted hue TRACKS base+hueShift·s within ±2° at every load-bearing stop, both signs; (c) PIVOT — the centre stop (500, s=0) hue is invariant to hueShift; (d) OPPOSITE TORSION — at +hueShift the light end rotates negative and the dark end positive (defeats a one-sided rotation); (e) MIRROR — ramp(+H)[dark stop] hue equals ramp(−H)[light mirror stop] hue (a symmetric per-side rotation); (f) SAME-DIRECTION (hueSameDir=true) — both ends bend the SAME way, matching the LIGHT end: both rotate the same sign, tracking baseHue − hueShift·|s| (e.g. a light+20/dark−20 opposite becomes light+20/dark+20) — defeats an engine that ignores the flag (torsions opposite, mismatched signs) or anchors the dark end" },
    { "id": "hpg-semantic-roles", "check": "semanticRoles(n) returns exactly 37 roles for every palette, of which exactly 7 are scrims on the 500 translucency ramp (scrimWeakest..scrimStrongest, each = the palette's 500 stop at alpha% = step/10, light === dark; outline + container/Low/High also resolve onto this 500 ramp) (AC-S1, AC-S2)" },
    { "id": "hpg-semantic-oncolors", "check": "for every palette, on{N}.light === on{N}.dark === the 50 stop (stored ref '50', padded '050') and on{N}Variant.light === on{N}Variant.dark === the 200 stop, matching data/role-table.json exactly (AC-S3, the fixed-on-color override ADR-003)" },
    { "id": "hpg-semantic-refs-canonical", "check": "every role's light/dark ref EQUALS the canonical ref in data/role-table.json for that key (not merely resolves), and each resolves to an existing raw primitive — a solid EXPORT_STOPS stop or a {base}-{step} scrim primitive (base in SCRIM_BASES = {500}, step in EXPORT_STOPS, the 500 color at alpha% = step/10) (AC-S4)" },
    { "id": "hpg-semantic-surface-mode", "check": "surface Low/High families mirror — light+dark sum to 1000 (e.g. surfaceLowest 50/950, surfaceHigh 150/850) — and Dim/Bright families do NOT (e.g. surfaceDim 150/900), exactly as data/role-table.json encodes, per ADR-005 (AC-S5)" },
    { "id": "hpg-parity-roletable", "check": "the emitted role table — semanticRoles ordered keys + every light/dark ref — deep-equals data/role-table.json's 37-row roleTable. CONDITIONAL on packaging: a single-source build imports ONE semanticRoles, so cross-impl identity is structural; IF the table is reproduced across multiple implementations (artifact / gen.js / plugin), they must all deep-equal the canonical (P1-P5, the extraction procedure in rubrics/parity-checklist.md applies only then)" },
    { "id": "hpg-export-dtcg-shape", "check": "the DTCG export is an object with EXACTLY three keys — palette.tokens.json, Light_tokens.json, Dark_tokens.json (the three Figma variable-mode token files) — and no fourth; each value is a valid, JSON-serializable DTCG token tree (AC-X4). The harness checks the OBJECT; bundling the three into a .zip for hand-off is a trivial downstream packaging step, NOT part of the verified contract (the prior 'zip / unzip -t' wording claimed a guarantee nothing produced or tested)" },
    { "id": "hpg-export-leaf-valid", "check": "each of Light_tokens.json and Dark_tokens.json contains at least 37 x (enabled palettes) resolved color leaves, each with $type 'color', colorSpace 'srgb', components in [0,1], alpha in [0,1], and a hex matching components (hex channel == Math.round(component*255) as 2-digit uppercase) (AC-X5) — an empty semantic tree FAILS (non-vacuity floor)" },
    { "id": "hpg-export-resolved", "check": "with rawColl blank, NO semantic leaf carries aliasData; with rawColl set, every semantic leaf carries aliasData.targetVariableName matching {n}/{refKey} AND aliasData.targetVariableSetName === rawColl (the raw-colors collection) — the FULL documented name+collection alias SHAPE Figma's aliasData fallback hierarchy resolves on native import when the raw-colors collection pre-exists (AC-X6, ADR-002 re-verify 2026-06-15; the OD-004 spike). This gates the emitted SHAPE only; the native-import cascade itself is validated in Figma, not by this check" },
    { "id": "hpg-export-css-resolves", "check": "CSS var naming: RAW vars are --c_{family}-{stop|500-step} (underscore after c), SEMANTIC vars are --c-{family}-{role} (hyphen); every --c-* semantic var is emitted as light-dark(var(--c_rawA), var(--c_rawB)) over two --c_ raw vars that both exist in the emitted :root (AC-X2, the two-layer model ADR-005)" },
    { "id": "hpg-export-padding", "check": "every token name (CSS vars, JSON keys, DTCG names, UI3 keys) uses 3-digit stop padding; scrims use padded base + '-{step}' (e.g. the raw CSS var --c_{family}-500-200 = the 500 color at 20%) (AC-X7, ADR-006)" },
    { "id": "hpg-export-disabled-palette", "check": "a palette with on:false is absent from all five exports; with all palettes disabled the exporters emit a valid empty-but-well-formed artifact, not an error (AC-U2)" },
    { "id": "hpg-export-nonempty", "check": "each of the five formats produces non-empty output for the default state, and the JSON format gives each palette stops/scrims/semantic with 3-digit-padded stop keys (AC-X1, AC-X3)" },
    { "id": "hpg-plugin-bindings", "check": "every {n}/{refKey} binding target the plugin emits exists among real raw-colors variable names, including the {n}/500-{step} scrims (AC-P2)" },
    { "id": "hpg-plugin-offline", "check": "the plugin's code.js and manifest.json both parse, and manifest networkAccess is 'none' (AC-P3, the offline/dependency-free decision ADR-010)" },
    { "id": "hpg-persistence-roundtrip", "check": "for any in-domain State S, hydrate(serialize(S)) deep-equals S exactly; an out-of-domain field is clamped to its nearest valid bound (domains per knowledge-02 §2) while every in-domain field is preserved (AC-U1); AND an ABSENT field (a doc predating it — e.g. a pre-0.6 doc lacking dampCurve/dampAmp/dampBias) hydrates to that field's DEFAULT (1.5/0/0, the legacy-equivalent), NOT its domain floor, and the result is byte-identical to hydrating the same doc with the field explicit at its default (the backward-compatible-reload guarantee)" },
    { "id": "hpg-export-theme-invariant", "check": "for one State, the byte output of all five exporters is identical with theme 'light', 'dark', and 'auto' — the theme switch changes UI appearance only, never an exported value (AC-U3)" }
  ],
  "non_goals": [
    "brand-color selection or non-HCT palette generation (opinionated about HCT, ADR-001). Palette COUNT is NOT bounded — the 8 defaults are a seed set, every acceptance criterion is quantified 'for every palette' so it generalizes to any count, and the validated UI ships a configurable set (OD-005 DECIDED 2026-06-15)",
    "a build-time / CI token pipeline — it is an interactive browser generator (ADR-010). 'Single-file / offline' is the DISTRIBUTION format (achievable by bundling the ES modules to one HTML), NOT an authoring constraint: the reference build authors modular ES modules and bundles to a single offline file",
    "the interactive editor UI itself (app shell, canvas, lenses, inspector, gallery, drawer) — a SEPARATE concern owned by the validated capability.system.ui-app; this spec covers the generator + its token output only (see references/ui-plan.md). This explicitly includes the editor-only surfaces the gallery/drawer add — the gallery 'Import' of a saved config and the drawer 'Config' tab that downloads serialize(doc) — which are convenience surfaces over the persistence round-trip that IS specced (hpg-persistence-roundtrip), not new token-output contracts",
    "contrast-aware on-color auto-picking (deliberately removed; the criteria REQUIRE the fixed 050/200 mapping, this non-goal excludes the dynamic one, ADR-003 / OD-001)",
    "exposed CAM16 viewing-condition controls (one fixed VC for portable exports, ADR-009)",
    "color-accurate OKLCH input: the OKLCH->CAM16 hue bridge is a convenience mapping whose drift is unbounded by design (ADR-008) — only its determinism is validated (hpg-engine-oklch-deterministic), not its fidelity",
    "a plugin-free aliased semantic export path that reliably cascades on native Figma import: resolved colors remain the safe default (the rawColl opt-in now emits the FULL name+collection aliasData — the documented fallback shape, gated by hpg-export-resolved — but the native-import cascade is unvalidated end-to-end here, ADR-002 re-verify; OD-004 is a gated SPIKE, NOT yet decided, and there is no user-facing plugin-free download); live cascade stays delegated to a Figma plugin — realized by TWO validated integration cells: capability.system.figma-plugin (the standalone 'Semantic Binder') and capability.system.figma-plugin-app (the generator-as-plugin, which applies the bundle directly), both turning the emitted aliasData into live createVariableAlias cascades native import cannot reliably do",
    "presenting the UI3 'Collections' export as a native Figma Variables import path — it is interchange-only (ADR-007 / OD-003)",
    "WCAG pass/fail gating or automated accessibility reporting — the tool surfaces a raw contrast readout only and makes no accessibility claim (ADR-003 documents accepted sub-WCAG values)"
  ],
  "decomposition": {
    "parent": { "criteria": ["hpg-engine-roundtrip", "hpg-engine-branches", "hpg-engine-gamut-ceiling", "hpg-engine-oklch-deterministic", "hpg-engine-parity", "hpg-tonal-ingamut", "hpg-tonal-monotonic", "hpg-tonal-chroma-target", "hpg-tonal-white-endpoint", "hpg-tonal-curve-fidelity", "hpg-tonal-hue-stability", "hpg-tonal-damping-curve", "hpg-tonal-edge-hue", "hpg-semantic-roles", "hpg-semantic-oncolors", "hpg-semantic-refs-canonical", "hpg-semantic-surface-mode", "hpg-parity-roletable", "hpg-export-dtcg-shape", "hpg-export-leaf-valid", "hpg-export-resolved", "hpg-export-css-resolves", "hpg-export-padding", "hpg-export-disabled-palette", "hpg-export-nonempty", "hpg-plugin-bindings", "hpg-plugin-offline", "hpg-persistence-roundtrip", "hpg-export-theme-invariant"] },
    "cells": [
      { "id": "capability.system.color-engine" },
      { "id": "capability.system.tonal-generation" },
      { "id": "capability.system.semantic-mapping" },
      { "id": "capability.system.export-formats" },
      { "id": "capability.system.figma-plugin" },
      { "id": "capability.system.ui-persistence" },
      { "id": "rubric.system.color-engine" },
      { "id": "rubric.system.tonal-generation" },
      { "id": "rubric.system.semantic-mapping" },
      { "id": "rubric.system.export-formats" },
      { "id": "rubric.system.figma-plugin" },
      { "id": "rubric.system.ui-persistence" }
    ],
    "tickets": [
      { "target_cell": "capability.system.color-engine", "acceptance": { "rubric_cell": "rubric.system.color-engine" }, "covers": ["hpg-engine-roundtrip", "hpg-engine-branches", "hpg-engine-gamut-ceiling", "hpg-engine-oklch-deterministic", "hpg-engine-parity"] },
      { "target_cell": "capability.system.tonal-generation", "acceptance": { "rubric_cell": "rubric.system.tonal-generation" }, "covers": ["hpg-tonal-ingamut", "hpg-tonal-monotonic", "hpg-tonal-chroma-target", "hpg-tonal-white-endpoint", "hpg-tonal-curve-fidelity", "hpg-tonal-hue-stability", "hpg-tonal-damping-curve", "hpg-tonal-edge-hue"] },
      { "target_cell": "capability.system.semantic-mapping", "acceptance": { "rubric_cell": "rubric.system.semantic-mapping" }, "covers": ["hpg-semantic-roles", "hpg-semantic-oncolors", "hpg-semantic-refs-canonical", "hpg-semantic-surface-mode", "hpg-parity-roletable"] },
      { "target_cell": "capability.system.export-formats", "acceptance": { "rubric_cell": "rubric.system.export-formats" }, "covers": ["hpg-export-dtcg-shape", "hpg-export-leaf-valid", "hpg-export-resolved", "hpg-export-css-resolves", "hpg-export-padding", "hpg-export-disabled-palette", "hpg-export-nonempty"] },
      { "target_cell": "capability.system.figma-plugin", "acceptance": { "rubric_cell": "rubric.system.figma-plugin" }, "covers": ["hpg-plugin-bindings", "hpg-plugin-offline"] },
      { "target_cell": "capability.system.ui-persistence", "acceptance": { "rubric_cell": "rubric.system.ui-persistence" }, "covers": ["hpg-persistence-roundtrip", "hpg-export-theme-invariant"] }
    ],
    "edges": [
      { "from_cell": "capability.system.tonal-generation", "to_cell": "capability.system.color-engine" },
      { "from_cell": "capability.system.semantic-mapping", "to_cell": "capability.system.tonal-generation" },
      { "from_cell": "capability.system.export-formats", "to_cell": "capability.system.semantic-mapping" },
      { "from_cell": "capability.system.figma-plugin", "to_cell": "capability.system.semantic-mapping" },
      { "from_cell": "capability.system.ui-persistence", "to_cell": "capability.system.semantic-mapping" }
    ]
  }
}
```

## First Principles

1. **The engine is load-bearing and the spec is downstream of it.** Tone (CIELAB L\*),
   hue/chroma (CAM16), and the gamut ceiling are the irreducible mechanics. Get
   `knowledge-01` right and everything else follows; get it wrong and no amount of prose
   helps. Verify against `data/verification-anchors.json` before trusting any engine claim.

2. **Intent is captured as types and formulas, not adjectives.** `data/role-table.json` is
   the contract for the semantic layer; the knowledge docs give literal matrices and curve
   equations. When enhancing, route detail into the data file and the typed interfaces, not
   into more sentences. Most acceptance criteria above are executable `check`s; a few
   (engine parity, the chroma floor) are deliberately **differential/metamorphic** rather
   than fixed-point, because a fixed-point check over a small anchor set is gameable.

3. **Fenced choices are constraints, not bugs.** Several decisions are deliberately
   counter-intuitive (on-colors fixed to the 50/200 stops despite failing contrast on yellow;
   all scrims resolve onto a single 500 translucency ramp at alpha% = step/10 — so the scrim
   roles AND outline/container are mode-flat, light === dark; semantic exports are resolved not
   aliased). Each
   has an ADR and a matching **non-goal**, so the gate holds the boundary. Do not "fix" them
   by inference — that is the most common way this spec gets damaged.

4. **One source of truth.** Build the engine + the 37-role table ONCE (a module set imported
   everywhere) and drift is structurally impossible — that is the reference build, and parity is
   then automatic, not a gate. The 3-implementation framing (tool / `gen.js` / plugin) is *legacy
   packaging*: only when the same engine/table is reproduced across ≥2 independent implementations
   does parity become a real acceptance gate — `hpg-engine-parity` (differential, conditional) +
   `hpg-parity-roletable` (conditional) verify it then, via `rubrics/parity-checklist.md` (P1–P8).
   The plugin's own surface (`hpg-plugin-bindings`) is checked regardless. Parity is a property of
   multi-impl *distribution*, never of the domain.

## Working with this package

**If you are spec-author / a reviewer:**
1. The contract block above is the spec; `references/spec-draft.md` is the full Brief+TDD the
   contract summarizes (the hybrid header block, "How to Read", common spine, 📐💡⚠️ markers).
2. Use `references/knowledge-01..05`, `references/decision-records.md`, and
   `references/glossary.md` as the **grounded knowledge foundation** — they are primary
   sources; web research supplements only where they are silent (e.g. confirming current
   Figma import behavior, ADR-002, which is time-sensitive — re-verify on an enhancing pass).
3. Carry the ADRs and open decisions forward verbatim. ODs are first-class; ADRs are settled.
4. Score the spec with `rubrics/quality-rubric.md` (Layer A = 10 dimensions; Layer B =
   project completeness gate). Verify the *tool* against `rubrics/acceptance-criteria.md` and
   `rubrics/parity-checklist.md`. The mechanical floor is `spec-quality-check.py` on this
   folder; the judgment lenses are the `spec-council`.

**If you are regenerating or extending the tool:**
1. Read `references/decision-records.md` first — it tells you what *not* to change.
2. Build from `data/role-table.json` (canonical) outward; keep the three implementations in
   parity (`rubrics/parity-checklist.md`).
3. Validate every change against `rubrics/acceptance-criteria.md`.

## Opinionated defaults

- When enhancing, **keep the hybrid Brief+TDD shape** of `spec-draft.md` (it serves the
  maintainer and an implementing agent at once). Do not flatten it to a pure requirements list.
- When a number or formula is involved, **put it in a code block or a table**, never in prose
  — the spec is consumed by agents that generate from it.
- When a new decision is made, **add an ADR**; when a question is unresolved, **add an OD** —
  never bury either in narrative. A new acceptance property → a new contract criterion, not a
  sentence.

## Reference map

| File | Read when |
|------|-----------|
| `references/spec-draft.md` | the full Brief+TDD this contract summarizes |
| `references/decomposition.md` | the entailment-checked carving into cells + tickets (full) |
| `references/knowledge-01-color-engine.md` | engine math: CAM16, gamut, VC, anchors |
| `references/knowledge-02-tonal-scale.md` | curves, `toneAt`, chroma, damping, clamp domains |
| `references/knowledge-03-semantic-system.md` | role table, on-colors, scrims, surfaces, modes |
| `references/knowledge-04-export-formats.md` | the five formats and Figma import constraints |
| `references/knowledge-05-figma-plugin.md` | the cascade binder |
| `references/decision-records.md` | the fenced choices (ADRs) — read before changing anything |
| `references/glossary.md` | project vocabulary |
| `data/role-table.json` | canonical 37-role table, defaults, constants (machine-readable) |
| `data/verification-anchors.json` | engine correctness anchors |
| `rubrics/quality-rubric.md` | scoring the spec |
| `rubrics/acceptance-criteria.md` | verifying the tool (the full AC predicates) |
| `rubrics/parity-checklist.md` | the three-implementation gate |

## When NOT to use this

- For generic color-theory questions unrelated to this tool — use a color skill instead.
- To pick brand colors or build a non-HCT palette — out of scope (see non-goals).
- For general spec writing unrelated to the HCT Palette Generator — use spec-author directly.
