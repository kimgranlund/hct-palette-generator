# HCT Palette Generator — Brief + Technical Specification

**Document:** TDD-01-hct-palette-generator
**Version:** 0.1 (draft for spec-author enhancement)
**Date:** June 2026
**Status:** Draft — extracted from the working tool; ready for research-grounding and scoring
**Audience:** design-system engineers, the tool's maintainer, an LLM regenerating or extending it

## How to Read This Document

This serves two purposes. Read it front-to-back as a **brief** to understand intent and the
reasoning behind the HCT Palette Generator. Or jump via the table of contents to a
**specification section** for implementation detail. Exhaustive detail lives in the
`references/` knowledge docs; this document orients and specifies at the level an
implementer needs to start, pointing into those docs for formulas and tables.

Sections marked 📐 are specification detail, 💡 are design reasoning, ⚠️ are open decisions.

## Table of Contents
1. What This Is
2. Why It Exists
3. First Principles
4. Core Architecture
5. Color Engine 📐
6. Tonal-Scale Generation 📐
7. Data Model 📐
8. Semantic Token System 📐
9. Export Formats 📐
10. Figma Plugin 📐
11. UI / Interaction 📐
12. What Differentiates This System
13. Anti-Patterns
14. Open Decisions ⚠️
15. Current Status
16. Reference Index

---

## 1. What This Is

The **HCT Palette Generator** is a single-file browser tool that generates perceptually
even color palettes and a full semantic design-token layer, and exports them to CSS and
Figma. Hue and chroma come from **CAM16**; tone is **CIELAB L\***. It is not a brand-color
picker and not a build-time pipeline — it is an interactive generator whose output is a set
of portable token artifacts.

Core operations: (1) compute in-gamut tonal ramps per palette; (2) map ramps to a 53-role
semantic layer with light/dark modes; (3) export to eight color formats; (4) optionally bind a live
raw→semantic cascade in Figma via a companion plugin.

## 2. Why It Exists

💡 **Failure 1: hue/lightness drift in naive ramps.** Scaling a single color's lightness
(or HSL value) drifts hue and produces uneven perceptual steps. **Failure 2: out-of-gamut
saturation.** Picking a fixed chroma per hue clips at the light/dark ends.
**Failure 3: tokens that don't survive a mode flip.** Mode handling bolted onto raw colors
breaks once role mappings stop being simple mirrors.

The root cause across all three is the same: **treating color as a single scalar to push
around, rather than as a point in a perceptual space with a gamut boundary.** The tool
exists to compute tone and chroma *in a perceptual model, against the gamut ceiling*, and to
keep mode-switching in a dedicated semantic layer.

## 3. First Principles

💡 These govern every decision; each is falsifiable.

1. **Perceptual, in-gamut, by construction.** Every emitted color is computed in CAM16/L\*
   and clamped to the sRGB gamut ceiling at its tone. If a swatch is out of gamut, the
   engine is wrong.
2. **The mode flip lives in one layer.** Raw tokens are mode-independent; only semantic
   `--c-*` roles flip light/dark. If a raw token needs two values, the layering is wrong.
3. **Determinism and parity.** Same inputs → identical outputs, across three
   implementations (artifact, `gen.js`, plugin). If they diverge, the tool is broken.
4. **Intent over inference.** Counter-intuitive choices (fixed on-colors, single scrim base)
   are recorded as decisions with rationale; they are not to be "fixed" by inference.

## 4. Core Architecture

📐 Four layers, each with a single responsibility:

| Layer | Owns | Consumes | Produces | Fails when |
|-------|------|----------|----------|-----------|
| Engine | CAM16↔sRGB, L\*, gamut search | sRGB / HCT inputs | in-gamut RGB per (hue, chroma, tone) | anchors drift past tolerance |
| Tonal generation | curves, skew/lift, chroma+damping | engine, global+palette controls | per-stop {tone, chroma, rgb} | a stop exceeds the gamut ceiling |
| Semantic mapping | the 53-role table | per-stop colors | role→ref mappings + resolved leaves | role table diverges across impls |
| Export | format serializers | semantic + raw | CSS / JSON / DTCG zip / UI3 | a ref doesn't resolve to a primitive |

Full detail per layer: `references/knowledge-01..05`. An auxiliary engine module, `derive.mjs`
(`knowledge-06`), derives a NEW palette from the existing set (the "New Palette" modal) — pure, no DOM.

## 5. Color Engine 📐
See `references/knowledge-01-color-engine.md` and `data/verification-anchors.json`.
Key contracts: `hctToRgb(hue,chroma,tone) -> {rgb,inGamut,lstar}` (binary-search J to hit
L\*; neutral path below 0.4 chroma; black/white at tone 0/100); `maxChromaInGamut`,
`peakC`, `oklchToCam16Hue` (chroma-aware Newton inverse, ADR-011), `hctToOklch` (high-res
HCT→OKLCH). Fixed viewing conditions (ADR-009).
Acceptance: roundtrip `max_channel_delta <= 2` (current: 0).

## 6. Tonal-Scale Generation 📐
See `references/knowledge-02-tonal-scale.md`. Stops 050–950 (display 19, export 25);
five curves via `shape(p)`; `toneAt(stop,skew,lift)` (gamma skew `3^(skew/100)`, cosine lift
centered 500); chroma `target = chroma% × peakC`, then a **differential damping multiplier**
`m = max(0, 1 + (dampAmp/100)·(1−uᵞ) − (damp/100)·sideW·uᵞ)` (u = |stop−500|/450, γ = dampCurve,
sideW = max(0, 1 + (dampBias/100)·sign(stop−500))), clamp `min(target·m, gamut)`. Defaults
γ 1.5 / amp 0 / bias 0 reduce m to the legacy `1−(damp/100)·u^1.5`. Defaults: logistic, tension 0,
lmin 5, lmax 100, damp 80, dampCurve 1.5, dampAmp 0, dampBias 0.

## 7. Data Model 📐
Canonical machine-readable form: `data/role-table.json` (`constants`, `roleTable` 53 rows,
`defaults` 8 palettes).

```ts
interface State {
  toneMode: 'perceptual'|'even'|'peak';  // ramp distribution (default 'perceptual', knowledge-02)
  vibrancy: number;         // 0..100   pulls the ramp toward the hue's cusp-anchored center (perceptual)
  chromaFloor: number;      // 0..100   min chroma (% of ceiling) to kill the near-white dead zone
  relChroma: boolean;       // harmonize saturation across hues (relative-chroma)
  onColorMode: 'fixed'|'contrast';  // opt-in WCAG-safe on-colors (default 'fixed', ADR-003 / OD-001)
  curve: 'linear'|'sine'|'cubic'|'logistic'|'exp';  // 'even' path only
  tension: number;          // 0..100
  lmin: number;             // 0..40
  lmax: number;             // 60..100
  damp: number;             // 0..100   edge-damp amount
  dampCurve: number;        // 0.5..4   falloff exponent γ (default 1.5)
  dampAmp: number;          // 0..100   mid-tone chroma amplify (default 0)
  dampBias: number;         // -100..100  light↔dark asymmetry (default 0)
  hueSpace: 'cam16'|'oklch';  // default 'oklch' (ADR-011); legacy docs carry 'cam16' explicitly
  theme: 'system'|'light'|'dark';
  palettes: Palette[];
  selected: number;
  roleOverrides?: object;   // per-doc semantic ref re-points (canvas Mapping tab)
  story?: object;           // curated narrative (category presets)
}
interface Palette {
  name: string; hue: number; chroma: number; skew: number; lift: number;
  hueShift: number /* -60..60 edge hue rotation */; hueSameDir: boolean /* both ends same dir (|s|) vs opposite (s) */; on: boolean;
  cuspPull?: number;        // per-palette override of global vibrancy (perceptual)
  keyColors?: { role: 'dominant'|'supportive'; oklch: [number, number, number]; name?: string }[]; // retained brand colors, lossless OKLCH; the New-Palette derivation pins its target here
  colorName?: string; colorRole?: string; description?: string;  // curated story (category presets)
}
interface Role { key: string; suffix: string; light: Ref; dark: Ref; }  // Ref = "550" | "500-200"
interface TokenLeaf { $type:'color'; $value:{colorSpace:'srgb'; components:[number,number,number]; alpha:number; hex:string}; $extensions:object; }
```
Field-table convention and clamp ranges: `knowledge-02` §2 and `hydrate()` validation.

## 8. Semantic Token System 📐
See `references/knowledge-03-semantic-system.md`. Two layers (flat raw + semantic
`light-dark()`, ADR-005); 53 roles/palette; on-colors fixed to `050`/`200` (ADR-003,
OD-001); 7 scrim roles on base 500 (ADR-004, OD-002); surface Dim/Bright (non-mirror) vs
Low/High (mirror).

## 9. Export Formats 📐
See `references/knowledge-04-export-formats.md`. Eight color formats: CSS hex, CSS OKLCH, JSON,
Figma DTCG 3-file zip (resolved colors, ADR-002), UI3 Collections (interchange-only,
ADR-007/OD-003), Tailwind v4, and ShadCN (a curated subset, not all roles). Padding via `pad3`/`refKey` (ADR-006).

## 10. Figma Plugin 📐
See `references/knowledge-05-figma-plugin.md`. Binds the `Color Modes` collection to `Color Primitives`
by `createVariableAlias` for a true cascade JSON import cannot provide (ADR-002). Same role
table as the generator (parity). (Collections renamed from `semantic-colors` / `raw-colors`.)

## 11. UI / Interaction 📐
A **gallery** hub (Your Palettes + **Color Categories** — 7 curated categories × 48 = 336 presets,
lazy-loaded) opens a set into the **editor**: a live canvas of palette rows + a right-pane inspector
(per-palette hue/chroma/cusp-pull/edge-hue/skew/lift, global tonal controls, the 53-role mapping) and a
left analysis rail (L\*×C plot, tone + chroma curves, contrast readout, hue wheel). **Compose a new
palette** via the New-Palette modal (`knowledge-06`: Relative / Environmental / Custom + live preview).
**Reorder** palette rows by dragging the ⋮⋮ handle — a lifted clone + a dashed drop placeholder (10px
deadzone). Native-`<dialog>` export drawer (top layer; grouped format `<select>`); app-chrome **and**
canvas-preview color-scheme each follow `system / light / dark`. Persistence chain
`window.storage → localStorage → in-memory` (`hct-palette-state-v1`), or `figma.clientStorage` in the
plugin; `prefers-reduced-motion`.

## 12. What Differentiates This System

📐 vs. common alternatives:

| This system | Common norm | Why this is chosen |
|-------------|-------------|--------------------|
| Tone = CIELAB L\*, hue/chroma = CAM16 | OKLCH only, or HSL | even perceptual steps + stable hue across tone |
| Chroma as % of per-hue gamut peak | fixed chroma number | "100%" is meaningful per hue; no manual gamut-chasing |
| Mode flip isolated in semantic layer | per-token light/dark | works for non-mirror mappings; maps to Figma collections |
| Resolved DTCG + plugin for cascade | aliasData-only import | native import reliability + a real cascade path |

💡 OKLCH is now the default input hue space (ADR-011). The chroma-aware OKLCH→CAM16 inverse
lands the rendered identity color on the stored OKLCH hue to ~0.00° (no more drift), so
OKLCH-native designers work in familiar numbers without changing the output color math.

## 13. Anti-Patterns

| Anti-Pattern | Why It Fails |
|--------------|--------------|
| Reintroducing contrast-aware on-colors | overrides an explicit brand decision (ADR-003); changes every on-token silently |
| Making raw tokens `light-dark()` pairs | re-creates the mirror-coupling that ADR-005 removed; breaks non-mirror roles |
| Emitting name-only `aliasData` by default | native Figma import errors rather than resolving (ADR-002) |
| Importing the UI3 schema into the Variables modal | not a verified native format (ADR-007) |
| Mixing `"50"` and `"050"` refs | sort/lookup bugs; breaks name matching against `Color Primitives` (ADR-006) |
| Editing one implementation only | breaks parity; the artifact already lost `surfaceHighest` once |

## 14. Open Decisions ⚠️

| OD | Title | Status | Affects |
|----|-------|--------|---------|
| OD-001 | On-color contrast vs fixed `050` | DECIDED (override) | accessibility of `on*` on light fills, esp. Warning/dark mode |
| OD-002 | Surface bases 250/500 as semantic scrims | DEFERRED | scrim role coverage |
| OD-003 | UI3 Collections schema authenticity | DECIDED (interchange-only) | the `ui3` export's usability |
| OD-004 | Aliased semantic export without plugin | OPEN — spike implemented (2026-06-17) | The `rawColl` opt-in now emits the FULL documented alias shape (`targetVariableName` + `targetVariableSetName`), **gated by `hpg-export-resolved`** so it can't regress. Still OPEN, NOT decided: the native-import cascade is unvalidated end-to-end (no Figma in CI) and there is no user-facing plugin-free download yet. Validate in real Figma (import with the `Color Primitives` collection pre-existing) before exposing it or removing the plugin; the plugin stays the reliable path. |
| OD-005 | Palette count beyond the default 8 | DECIDED (2026-06-15) — configurable | Every acceptance criterion is "for every palette", so it generalizes to any count; the validated `capability.system.ui-app` ships a configurable palette set. The 8 defaults are a seed set, NOT a ceiling. |

## 15. Current Status

- **Complete:** engine (verified to anchors); tonal generation (5 curves, skew/lift,
  damping); 53-role semantic layer; 5 export formats; companion plugin; persistence; parity
  across artifact/`gen.js`/plugin at 53 roles.
- **In progress:** spec hardening (this document) for spec-author enhancement.
- **Not yet addressed:** automated accessibility surfacing in-app; configurable palette set;
  aliased-cascade export without the plugin (OD-004).

## 16. Reference Index

| Doc | Contents |
|-----|----------|
| `references/knowledge-01-color-engine.md` | matrices, CAM16 fwd/inv, VC, gamut, anchors |
| `references/knowledge-02-tonal-scale.md` | stops, curves, `toneAt`, chroma+damping |
| `references/knowledge-03-semantic-system.md` | two layers, 53 roles, on-colors, scrims, surfaces |
| `references/knowledge-04-export-formats.md` | 5 formats, shapes, Figma import constraints |
| `references/knowledge-05-figma-plugin.md` | cascade binder, parity, run/failure modes |
| `references/knowledge-06-palette-derivation.md` | the "New Palette" engine (`derive.mjs`): Relative / Environmental / Custom |
| `color-neutral-derivation.md` | the neutral/environment rule (hue + max chroma) |
| `references/decision-records.md` | ADR-001…010 (fenced choices) |
| `references/glossary.md` | project vocabulary |
| `data/role-table.json` | canonical 53-role table + defaults + constants |
| `data/verification-anchors.json` | engine roundtrip anchors |
| `rubrics/quality-rubric.md` | spec scoring (spec-author 10 dims + project checks) |
| `rubrics/acceptance-criteria.md` | runnable acceptance predicates |
| `rubrics/parity-checklist.md` | three-implementation parity gate |
