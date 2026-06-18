# Glossary

> Project vocabulary. Where a term has a project-specific meaning that differs from common
> usage, that is flagged. Spec-author: align all spec terms to these definitions; flag any
> new term introduced.

| Term | Definition |
|------|------------|
| **HCT** | Hue–Chroma–Tone color model. Here: hue+chroma from CAM16, tone from CIELAB L\*. |
| **CAM16** | A color appearance model; source of perceptual hue and chroma. Parameterized by viewing conditions (VC). |
| **CIELAB L\*** | Perceptual lightness, 0–100. The tonal axis of every palette. Called **tone**. |
| **Tone** | Synonym for the target L\* of a stop. The controllable axis. |
| **Stop** | A position on a tonal ramp, named 050–950. Display stops step by 50; export stops add half-steps. |
| **PEAK / prime** | Stop 500 — the chroma peak / canonical accent tone. |
| **LITE / DARK prime** | Stops 450 / 550 — the light and dark prime tones (prime role = 550 light / 450 dark). |
| **Chroma (%)** | The per-palette chroma control, expressed as a percentage of the hue's own sRGB chroma peak (`peakC`), not a raw chroma number. |
| **Gamut ceiling** | `maxChromaInGamut(hue, tone)` — the largest chroma that stays inside sRGB at a given tone. |
| **Edge damping** | Reduction of chroma toward the lightest/darkest stops so ends don't look over-saturated. Amount = `damp` (0–100). |
| **Differential damping** | The full per-stop chroma multiplier `m(stop)` (CHANGELOG 0.6) of which edge damping is the default case; `m=1` at stop 500 when `dampAmp=0`. Shaped by the three controls below. |
| **`dampCurve`** (falloff γ) | Exponent on the centre-distance in the damping term (0.5–4, default 1.5). Low = damping spreads into the mids; high = confined to the extreme ends. Distinct from `damp` (the amount). |
| **`dampAmp`** (amplify) | Mid-tone chroma boost (0–100, default 0): the **additive** term that lifts `m` above 1 toward the gamut ceiling. Opposite sign of effect to `damp` — and NOT the same control. |
| **`dampBias`** | Light(−)↔dark(+) asymmetry of the damping (−100..100, default 0); `+dampBias` damps the dark half more, via a mirror-symmetric per-side weight. |
| **Skew** | Gamma warp of the tone distribution; positive lightens mid-tones (peak drifts light). |
| **Lift** | Cosine-weighted additive L\* bump centered on stop 500. |
| **Scrim primitive** | A *raw* semi-transparent overlay token: the palette's 500 color at alpha% = step/10, named `{base}-{step}` (e.g. `500-200` = 500 @ 20%). A valid **ref target**, like a solid stop. |
| **Scrim role** | A *semantic role* (`scrimWeakest…scrimStrongest`, 7 per palette) whose ref points at a **scrim primitive** on the 500 ramp. NOT itself a ref target — only scrim *primitives* are. Do not conflate with *scrim primitive*. |
| **On-color** | Foreground (text/icon) color meant to sit on a fill. `on{N}` → the 50 stop and `on{N}Variant` → the 200 stop, fixed in both modes (ADR-003). |
| **Role** | A named semantic token (e.g. `surfaceDim`, `outline`). 37 roles per palette. |
| **Raw / primitive** | A mode-independent base token a ref resolves *to*: a solid export stop or a **scrim primitive** (`{base}-{step}`). Never a role. |
| **Semantic / `--c-*`** | A role token that carries the light/dark flip via `light-dark()`, aliasing two primitives. |
| **Mode** | Light or Dark. The flip lives only in the semantic layer. |
| **Mirror** | A light/dark mapping whose stops sum toward 1000 (e.g. `50/950`). Low/High surfaces mirror; Dim/Bright do not. |
| **Ref** | A role's light/dark target: a solid stop `"550"` or a **scrim primitive** `"500-200"` — always a *primitive*, never another role. |
| **`refKey`** | Normalizes a ref to padded form for names/vars (`"50"→"050"`, `"500-200"→"500-200"`). |
| **DTCG** | Design Tokens Community Group format (`$type`/`$value`); Figma's native import shape. |
| **VC (viewing conditions)** | Fixed CAM16 parameters derived once at load (`makeVC`); not user-controllable. |
| **Prime fill** | The `{n}` (prime) role's color: stop 550 in light, 450 in dark. On-colors are evaluated against it. |
| **Cascade** | Raw edit propagating to semantic. Provided by the plugin (alias-by-reference), not by JSON import. |
| **Parity** | The requirement that the artifact, `gen.js`, and the plugin share an identical 37-role table and engine behavior. |
