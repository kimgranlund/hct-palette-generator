# Acceptance Criteria — Runnable Predicates

> Every criterion is a checkable predicate, not a vibe. Grouped by subsystem. These verify
> the *tool*, not the spec (the spec is scored by `quality-rubric.md`). An implementer or an
> agent regenerating the tool should be able to turn each line into a test.

## AC-E · Engine
- **AC-E1** For each anchor in `data/verification-anchors.json`, forward then `hctToRgb`
  inverse roundtrip has `max_channel_delta <= 2`. (Current engine: 0.)
- **AC-E2** `hctToRgb(h, c, 0)` = black, `hctToRgb(h, c, 100)` = white, for any h, c.
- **AC-E3** `hctToRgb(h, 0.3, t)` returns a neutral gray (`r==g==b`) for any h, t in (0,100).
- **AC-E4** For random (hue, tone) with `tone` in (0,100), `hctToRgb(hue, maxChromaInGamut(hue,tone), tone).inGamut === true` and at `maxC + 1` it is `false` (within search resolution).
- **AC-E5** `maxChromaInGamut`/`peakC` results are stable across repeated calls (memoization
  does not change values).

## AC-T · Tonal scale
- **AC-T1** For every default palette and every export stop, the emitted color is in gamut
  (`hctToRgb(...).inGamut === true`).
- **AC-T2** With `lmax = 100`, every palette's `050` resolves to `#FFFFFF`.
- **AC-T3** Tone is monotonic in stop for each curve at default skew/lift (050 lightest →
  950 darkest); skew warps but does not break monotonicity for |skew| ≤ 100.
- **AC-T4** Applied chroma never exceeds the gamut ceiling at any stop
  (`chroma <= maxc` for every stop).
- **AC-T5** Edge damping reduces chroma toward 050/950 (chroma at 500 ≥ chroma at 050 and
  ≥ chroma at 950 for a saturated palette).

## AC-S · Semantic system
- **AC-S1** `semanticRoles(n)` returns exactly **59** roles for every palette.
- **AC-S2** Exactly **7** roles are scrim STRENGTHS (`scrimWeakest…scrimStrongest`), all on base 500. Many other roles (e.g. `{n}Disabled`, `outline*`, `outlineVariant*`, `container*`) also resolve onto the 500 scrim ramp.
- **AC-S3** `on{N}` light===dark===`050` and `on{N}Variant` light===dark===`200` for every
  palette.
- **AC-S4** Every role's `light`/`dark` ref resolves to an existing primitive
  (a solid export stop or a `{base}-{step}` scrim).
- **AC-S5** Surface Low/High refs mirror (light+dark sum toward 1000); Dim/Bright do not.

## AC-X · Exports
- **AC-X1** Each of the eight color formats (CSS, OKLCH, JSON, DTCG, UI3, Tailwind, ShadCN, exportAll) produces output (non-empty) for the default state.
- **AC-X2** CSS: every `--c-*` semantic var references two existing raw vars via `var()`.
- **AC-X3** JSON: parses; each palette has `stops`, `scrims`, `semantic`; stop keys are
  3-digit padded.
- **AC-X4** DTCG zip: contains exactly `palette.tokens.json`, `Light_tokens.json`,
  `Dark_tokens.json`; each is valid JSON; passes `unzip -t`.
- **AC-X5** DTCG: every `colorLeaf` has `colorSpace:"srgb"`, `components` in [0,1], `alpha`
  in [0,1], and a hex matching the components.
- **AC-X6** DTCG semantic leaves carry **no** `aliasData` when `rawColl` is blank; when `rawColl`
  is set, **every** semantic leaf carries the full documented name+collection alias shape —
  `aliasData.targetVariableName` = `{n}/{refKey}` **and** `aliasData.targetVariableSetName` = the
  `rawColl` collection (the OD-004 spike; ADR-002 re-verify). The shape is gated here; the
  native-import cascade is validated in Figma, not by this check.
- **AC-X7** All token names (CSS, JSON keys, DTCG names, UI3 keys) use 3-digit stop padding.

## AC-P · Plugin
- **AC-P1** Plugin `roleTable(n)` is byte-identical in structure to the generator's
  (same 59 keys, same refs).
- **AC-P2** Every `{n}/{refKey}` binding target exists among real `Color Primitives` variable
  names (including `{n}/500-{step}` scrims).
- **AC-P3** `code.js` and `manifest.json` parse; `networkAccess` is `none`.

## AC-U · UI / persistence
- **AC-U1** A snapshot saved then hydrated reproduces the same `State` (idempotent), with
  all values clamped to their domains.
- **AC-U2** Disabling a palette (`on:false`) removes it from all exports.
- **AC-U3** Theme switch changes only UI appearance, never exported values.

## How to run (reference)
Extract the artifact `<script>` to a file and `node --check` it; replicate the engine via the
`gen.js` reference generator against `hct.js`; validate JSON leaf shape and cross-check ref
targets against the role table and `Color Primitives` names; `unzip -t` zips. Node v22.
