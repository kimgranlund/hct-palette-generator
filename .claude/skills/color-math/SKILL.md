---
name: color-math
description: >
  Use when a change touches src/engine/{hct.js, okhsl.js, tonal.js, derive.mjs}
  or a color gate (anchor/roundtrip/monotonic/in-gamut) is red — "colors out of
  gamut", "ramp isn't monotonic", "hue drift", "neutral is off", "add a tone
  mode", "tune the damping/chroma floor". Covers the perceptual color engine:
  tonal ramp, gamut mapping, CAM16/HCT · OKLCH · OKHSL · sRGB conversions, tone
  modes, chroma shaping, neutral/relative derivation.
---

# Color math — the perceptual engine (nonoun-color-tokens)

Four files, one rule: **every emitted color is in-gamut by construction, hits its target tone, and holds a
constant CAM16 hue along the ramp** — and the verifiers prove all three on every change. Color math is
unforgiving: a wrong space, a swapped constant, an un-clamped chroma, or the wrong ramp branch ships broken
swatches that *look* plausible. This skill is the procedure + the gotchas + the gates for changing the
engine safely. The conceptual *why* is owned by `.claude/docs/spec/references/knowledge-0{1,2,6}-*.md` +
`.claude/docs/spec/color-neutral-derivation.md` — **cite them, don't re-derive.**

## Map — which file owns what (depth in `references/foundations.md`)

| File | Owns | Exports (the verified contract) |
|---|---|---|
| `src/engine/hct.js` | CAM16/HCT: perceptual hue·chroma·**tone (CIELAB L\*)**; the gamut-search core | `hctToRgb(hue,chroma,tone)→{rgb[0-255 ints],inGamut,lstar}`, `hctToOklch(hue,chroma,tone)→[L,C,H°]` **[FLOAT — high-res, no 8-bit round-trip; shares `_hctToLinRGB` with `hctToRgb`]**, `cam16FromRgb([r,g,b])→{hue,chroma,J}`, `lstarFromRgb([r,g,b])→L*`, `maxChromaInGamut(hue,tone)`, `peakC(hue)→{c,tone}`, `oklchToCam16Hue(h,chromaFrac=1)` **[chroma-AWARE Newton inverse]** |
| `src/engine/okhsl.js` | Ottosson OKHSL ⇄ sRGB (the **perceptual** ramp path) + OKLCH→sRGB key-color seeding | `okhslToRgb(hueDeg,s,l)`, `oklchToRgb(L,C,H)` **[GAMUT-CLAMPED — out-of-gamut snaps to the boundary via `clamp255` in okhsl.js]**, `rgbToOkhsl([r,g,b])→{h,s,l}` |
| `src/engine/tonal.js` | the ramp builder: stop sets, `DEFAULT_CONTROLS`, both ramp paths | `STOPS`(19)·`EXTRA_STOPS`·`EXPORT_STOPS`(25), `DEFAULT_CONTROLS`, `effHue`, `toneAt`, `paletteStops` |
| `src/engine/derive.mjs` | New-Palette math (pure, OKLCH, no imports) | `weightedMeanHue`, `deriveNeutral`, `deriveRelative`, `RELATIONSHIPS` |

## The one thing easy to miss — TWO ramp paths

`paletteStops(palette, controls, stops)` **branches on `controls.toneMode`** (the mode resolve at the top
of `paletteStops`, which hands `perceptual`/`peak` to `okhslStops`):

- **`perceptual`** (the **DEFAULT**) and **`peak`** → the **OKHSL path** (`okhslStops`). Steps lightness
  evenly in OKHSL's perceptually-uniform `l`; chroma is a gamut-proportional OKHSL saturation; **in-gamut
  by OKHSL's construction.** Shaped by `lmin`/`lmax`/`damp`(+`dampCurve`/`dampAmp`/`dampBias`)/`vibrancy`/`cuspPull`.
- **`even`** → the **CIELAB-L\* path** (`toneAt` + the `shape`/`skew`/`lift`/`relChroma`/`chromaFloor` math).
  **`curve`, `skew`, `lift`, `relChroma`, `chromaFloor` apply to `even` mode ONLY.** Per-stop tone is the
  same L\* for every hue (tone-aligned); chroma is `% of the base-hue peak`, edge-damped, clamped to `maxc`.

> ⚠️ A change to `toneAt`/`curve`/`chromaFloor`/`relChroma` affects **only `even`**. The default users see
> is `perceptual`/OKHSL. Read the `DEFAULT_CONTROLS` block in tonal.js (all comments) before editing —
> it states which control feeds which path. The tonal verifier pins `toneMode:"even", chromaFloor:0`
> (the `CTL` pin in `test/engine/tonal.mjs`) for the CIELAB gates and tests the OKHSL paths separately
> (`okhsl-modes`, `vibrancy`, `cusp-pull`). knowledge-02 §2 owns the same warning — cite it.

## The hue model is OKLCH-native (easy to miss — changed #117; depth in `references/foundations.md` §4)

- The per-palette `hue` param is an **OKLCH hue** by default — `DEFAULT_CONTROLS.hueSpace` (and the persist default) is `"oklch"`, flipped from `"cam16"`.
- The ramp still renders a **constant CAM16 hue**: `effHue(hue, hueSpace, chromaFrac)` resolves OKLCH→CAM16 **once per palette**.
- `oklchToCam16Hue(h, chromaFrac)` is an accurate, **CHROMA-AWARE** Newton inverse of the render path — it must be chroma-aware because the OKLCH↔CAM16 hue map shifts with chroma (the **Abney effect**); a fixed or cusp-only anchor drifts (~15° vivid blues / ~11° muted hues).
- Callers pass the palette's own chroma — `effHue(p.hue, hueSpace, p.chroma/100)` — so the identity color lands on the stored OKLCH hue to ~0.00°. Gate: **`hct-oklch-inverse`** (vivid + muted round-trip ≤3°).
- **HEX is only ever derived for CONSUMPTION; perceptual coords come from the model at full precision** — use `hctToOklch(h,c,t)` (float, no 8-bit step) for readouts; never measure OKLCH/hue back off an 8-bit hex.
- **Producers emit OKLCH hues** (`gen-categories`, `seedFromKeyColor`, `defaultDocument`); **`role-table.json` is UNCHANGED** (still the cam16 answer key); legacy cam16 docs carry `hueSpace:"cam16"` and stay cam16.
- **`hctToRgb` is byte-identical** (shares `_hctToLinRGB` with `hctToOklch`) — the anchors don't move.

## The invariants you must never break (depth in `references/foundations.md`)

1. **In-gamut by construction.** Even path: `chroma = min(maxc, max(min(intended·m, maxc), floorC))` — the
   `min(·, maxc)` is load-bearing. OKHSL path: in-gamut by OKHSL bijection (`s∈[0,1]`), asserted `inGamut:true`.
2. **Hits the tone.** Even path: `hctToRgb` binary-searches CAM16 `J` (18 iters) so the pixel's L\* == `toneAt`
   within 1.0. The `curve-fidelity` gate measures L\* from the *emitted pixel*, not `r.tone` (anti-tautology).
3. **Constant CAM16 hue** when `hueShift=0` (the default) — emitted hue == `effHue` within ±2° at chromatic
   stops (`hue-stability`, where emitted chroma > 20). `effHue` is computed ONCE per palette and fed to every stop.
4. **Tone monotone non-increasing** 050→950 (lift 0), all 5 curves × skew. Damping touches chroma ONLY.
5. **Determinism.** No RNG, no clock, no locale. `VC` is computed once at load; the memo caches (`_mc`, `_pk`,
   `_oh` in `hct.js`; `_okL` in `tonal.js`) key on `toFixed(2)`. Same input → identical bytes.

## Procedure — change → check → fix → re-check

1. **Locate the path.** Out-of-gamut / ramp-shape bug in the *default* output → the **OKHSL path**
   (`okhslStops`). A `curve`/`skew`/`lift`/`relChroma`/`chromaFloor` bug → the **even path**. A
   hue-roundtrip / `maxChromaInGamut` / `peakC` bug → `hct.js`. A New-Palette bug → `derive.mjs`.
2. **Edit only the owning file.** `tonal.js` IMPORTS the validated engine — never reimplement `hctToRgb` /
   the matrices / the OKLab constants there. The CAM16 constants in `hct.js` and the Ottosson constants in
   `okhsl.js` are copied verbatim from their references — **do not "tidy" or re-derive them** (a wrong digit
   moves an anchor and the engine is broken). See `references/best-practices.md`.
3. **Keep both ramp paths honest.** If you touch the damping multiplier `m`, note it is computed IDENTICALLY
   in both paths (the even loop in `paletteStops` and in `okhslStops`) — change both or the modes diverge.
   Damping must NEVER perturb tone (the `damping-curve (f)` gate, `|Δ| ≤ 1e-9`).
4. **Mind the stop-vs-index trap.** OKHSL lightness is keyed off the **stop number**, not the array index, so
   stop 500 is the same color in the 19-stop display ramp and the 25-stop export ramp (the `okhsl-modes`
   stop-consistency check). Don't reintroduce index-based math.
5. **Derivation is OKLCH + circular.** `derive.mjs` works in OKLCH `[L, C, H]` (C ~0..0.4), all hue math
   circular (vector sum → `atan2`, never average degrees). The `deriveNeutral` formula + the two-number
   rule (hue + the C_max clamp) are owned by `.claude/docs/spec/color-neutral-derivation.md` — cite, don't copy.

## Validate (the anchor-based gate — draft → check → fix → re-check)

Run the four pure verifiers first (`hct`/`tonal`/`okhsl` print `pass`/`FAIL` per group; `derive` prints one
PASS/FAIL line; exit 1 fails), then the full suite:

```
node test/engine/hct.mjs      # anchor-roundtrip · random-roundtrip · gamut-ceiling · branches · oklch-deterministic · hct-oklch (float HCT→OKLCH round-trips) · hct-oklch-inverse (chroma-aware oklchToCam16Hue ≤3° vivid+muted)
node test/engine/okhsl.mjs    # roundtrip · boundary(s=1 on a gamut face) · monotone-s · neutral · anchor
node test/engine/tonal.mjs    # ingamut · monotonic · white-endpoint · chroma-target · curve-fidelity · hue-stability · damping-curve · edge-hue · rel-chroma · okhsl-modes · chroma-floor · vibrancy
node test/engine/derive.mjs   # weighted-mean hue (warm lean + 350°/10° wrap) · neutral clamp · the 6 relationships · priority-beats-chroma · no-NaN  (one PASS/FAIL line)
npm test                      # all of the above + ui/figma/exports + the figma-ui + smoke gen (node test/run.mjs)
```

**The correctness backstop is the anchors.** The `anchor-roundtrip` gate in `test/engine/hct.mjs` checks the 6
reference colors (red/green/blue/white/black/mid-gray) against `.claude/docs/spec/data/verification-anchors.json`. For
each CHROMATIC anchor it asserts the FOUR tolerances owned by `references/rubric.md` C1 (forward L\* · CAM16
hue · CAM16 chroma · forward+inverse RGB roundtrip; current engine: Δ0 on all). If a change breaks ANY of
them, the engine is broken — **revert; do not loosen a tolerance.** Don't call it done until all four
verifiers AND `npm test` are green.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the two ramp paths, the HCT transform chain + `hctToRgb` branch order, gamut search (`maxChromaInGamut`/`peakC`), the damping multiplier `m`, the OKHSL bijection, derivation — the mental model the procedure assumes |
| `references/best-practices.md` | the non-obvious do/don't (verbatim constants, in-gamut clamp, both-paths damping, stop-vs-index, anchors-are-truth) + a worked walkthrough from the chroma-floor / distribution-mode history |
| `references/rubric.md` | score the change before calling it done — in-gamut + tone-fidelity + hue-stability + the four anchor tolerances are the gates |
| `.claude/docs/spec/references/knowledge-01-color-engine.md` | the HCT engine math (matrices, VC, CAM16 fwd/inv, the contracts) — owned there, cite |
| `.claude/docs/spec/references/knowledge-02-tonal-scale.md` | the tonal-scale math (curves, `toneAt`, chroma targeting, damping) — owned there, cite |
| `.claude/docs/spec/references/knowledge-06-palette-derivation.md` · `.claude/docs/spec/color-neutral-derivation.md` | New-Palette derivation + the `deriveNeutral` formula / neutral two-number rule — owned there, cite |

Peers: [[adding-semantic-roles]] (roles ride the ramps) · [[adding-export-formats]] (serializers consume derivePalette) · [[building-editor-sections]] (the Color section) · [[shipping-changes]].