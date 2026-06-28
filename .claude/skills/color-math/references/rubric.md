## Rubric — a color-engine change

Scores a change to `src/engine/{hct.js, okhsl.js, tonal.js, derive.mjs}`. `[gate]` = mechanically checkable
(a named verifier group / `npm test` / the anchors); `[review]` = judgment with cited evidence. Score each 1–5.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| C1 | Anchor correctness | [gate] | `node test/engine/hct.mjs` `anchor-roundtrip` green — each chromatic anchor in `verification-anchors.json` holds ALL FOUR tolerances: L\* ≤ 1.5, CAM16 hue ≤ 2.0°, CAM16 chroma ≤ 3.0, RGB roundtrip Δ ≤ 2 (current engine: 0) | 1: any anchor breaks any tolerance (or `anchor-roundtrip` red) · 3: green, within all four · 5: green at roundtrip Δ=0, the random-roundtrip max Δ also 0 |
| C2 | In-gamut by construction | [gate] | every emitted stop is in gamut, applied chroma ≤ ceiling+0.5, both paths: `tonal.js` `ingamut` + `damping-curve` (extreme corners) + `okhsl-modes`; `hct.js` `gamut-ceiling` (tight: in at maxC, out at maxC+0.5) | 1: an out-of-gamut stop / chroma > maxc+0.5 / loose ceiling · 3: in-gamut for defaults · 5: in-gamut across damping corners + both ramp modes |
| C3 | Tone fidelity + monotonicity | [gate] | even-path pixel L\* == `toneAt` within 1.0 (`curve-fidelity`, measured from the emitted pixel — anti-tautology); tone non-increasing 050→950 all curves × skew (`monotonic`); damping never perturbs tone (`damping-curve (f)`); OKHSL tone monotone (`okhsl-modes`) | 1: tone drifts from `toneAt` or rises down-ramp · 3: monotone + fidelity for defaults · 5: holds across all 5 curves × skew grid and both paths |
| C4 | Hue stability | [gate] | flat case (`hueShift=0`) emits `effHue` within ±2° at chromatic stops (`hue-stability`, where emitted CAM16 chroma > 20); edge-hue rotation tracks `base+shift·s`, pivots on 500, mirror-symmetric, same-direction mode (`edge-hue`, chroma > 30) | 1: hue drifts > 2° along a flat ramp · 3: flat case stable · 5: flat + edge-rotation + same-direction mode all within budget |
| C5 | Path discipline | [review] | the change edits the OWNING file; `tonal.js` imports (never reimplements) the engine; damping `m` changed in BOTH paths if at all; OKHSL keys lightness on the stop number not the index; constants left verbatim | 1: engine math re-pasted into tonal.js, or a constant re-derived, or one damping path edited · 3: right file, imports intact · 5: + both paths kept in lockstep, stop-keyed, constants untouched |
| C6 | Mode/feature scoping | [review] | a `toneAt`/`curve`/`skew`/`lift`/`relChroma`/`chromaFloor` change is understood to affect `even` ONLY; a default-output fix lands in `okhslStops`; `relChroma`/`chromaFloor` honor their caps (never over the ceiling / over `intended`) | 1: an even-only control changed to "fix" the default (perceptual) output, or a floor that over-saturates/tints · 3: scoped correctly · 5: scoped + the chroma-floor / rel-chroma / vibrancy / cusp-pull gates green |
| C7 | Derivation correctness | [review] | `derive.mjs` stays pure OKLCH + circular hue (`atan2`, never raw-degree mean); `deriveNeutral` keeps the `[0.66, clamp(0.30·meanC,0.004,0.018), hue]` shape; priority (`samples[0]`) beats chroma; `node test/engine/derive.mjs` green | 1: raw-degree hue mean (350°/10°→180°), or chroma-weighting breaks the priority pivot, or neutral clamp wrong · 3: derive green · 5: green + the wrap case + priority-beats-chroma + no-NaN edge cases hold |
| C8 | Determinism | [gate] | no RNG/clock/locale; memo caches key on `toFixed(2)`; `node test/engine/hct.mjs` `oklch-deterministic` green; `npm test` reproducible | 1: nondeterministic output / a cache that doesn't dedupe · 3: deterministic · 5: deterministic + new caches follow the `toFixed(2)` convention |

**Gate to ship:** C1, C2, C3, C4, C8 must each score ≥ 3 — the four pure verifiers AND `npm test` green, with
the 6 anchors still holding all four tolerances. A change that breaks an anchor (C1), emits an out-of-gamut
stop (C2), breaks tone fidelity/monotonicity (C3) or hue stability (C4), or is nondeterministic (C8) is not
done regardless of how good the new ramp looks.

**Top failure to look for first:** editing the WRONG ramp path (C5/C6). The default is `perceptual` (OKHSL,
`okhslStops`), but `curve`/`skew`/`lift`/`relChroma`/`chromaFloor` and the `toneAt` math live in the `even`
(CIELAB-L\*) path. A "fix the default ramp" change that lands in `toneAt`/`chromaFloor` touches nothing users
see by default — and the even-only gates stay green, so it *looks* done. Confirm which `toneMode` the bug is
in (read `DEFAULT_CONTROLS` + the `paletteStops` branch at `tonal.js:133–134`) before editing.