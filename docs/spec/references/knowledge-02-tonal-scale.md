# Knowledge 02 — Tonal-Scale Generation

> Topic: how a palette's per-stop tone (L\*) and chroma are computed from the global
> controls plus a palette's `{hue, chroma, skew, lift}`. All formulas are literal.

## Table of Contents
1. Stops
2. Global controls and defaults
3. Tone curves (the five `shape` functions)
4. `toneAt` — tone per stop
5. Chroma targeting and edge damping
6. `paletteStops` — the per-stop pipeline
7. Worked example

---

## 1. Stops

- **Display stops** (`STOPS`): 50, 100, 150, … 950 (step 50) → 19 stops. Shown in the grid.
- **Extra export stops** (`EXTRA_STOPS`): 75, 125, 175, 825, 875, 925. Export-only; not in
  the grid.
- **Export stops** (`EXPORT_STOPS`): union of the above, sorted → 25 stops. All exports use
  this set.
- **Landmarks** (conceptual, not exported constants): stop 500 is the prime / chroma-peak tone, 450 the light prime, 550 the dark prime. The resolution layer maps the prime accent to 550 (light) / 450 (dark) per `accentRef:"mode"`, or 500 for `"single"`.

> 💡 The grid intentionally shows fewer stops than exports carry. The extra half-steps
> (075/125/175/825/875/925) exist so the semantic layer can reference fine surface
> elevations (e.g. `surface = 125`) without cluttering the editing grid.

## 2. Global controls and defaults

> ⚠️ **`toneMode` selects the whole ramp algorithm and defaults to `perceptual`, not the curve-driven path below.** `toneMode ∈ {perceptual (default), even, peak}`. The `curve`/`skew`/`lift`/`relChroma`/`chromaFloor` controls in this table and the `toneAt` math in §3–§4 apply to **`even` mode only**; `perceptual`/`peak` go through the OKHSL path (`okhslStops`), shaped by `lmin`/`lmax`/`damp`/`vibrancy`. The additional defaults not yet tabled here — `relChroma` (false), `chromaFloor` (40), `toneMode` (perceptual), `vibrancy` (0), `onColorMode` (fixed), `accentRef` (mode) — live in `DEFAULT_CONTROLS` in `tonal.js`.

| Control | Range | Default | Purpose |
|---------|-------|---------|---------|
| `curve` | linear / sine / cubic / logistic / exp | `logistic` | tone-distribution shape |
| `tension` | 0–100 | 0 | steepness of logistic/exp only |
| `lmin` | 0–40 | 5 | darkest L\* (stop 950 end) |
| `lmax` | 60–100 | 100 | lightest L\* (stop 050 end) |
| `damp` | 0–100 | 80 | edge chroma damping strength (amount) |
| `dampCurve` | 0.5–4 | 1.5 | falloff exponent γ — where damping bites (low = broad into mids, high = confined to the ends) |
| `dampAmp` | 0–100 | 0 | mid-tone chroma amplify — boosts the mids toward the gamut ceiling (multiplier > 1) |
| `dampBias` | -100..100 | 0 | light(−)↔dark(+) asymmetry of the damping |
| `hueSpace` | cam16 / oklch | oklch | how input hues are read (default flipped to OKLCH; cam16 stays selectable, and legacy cam16 docs carry `hueSpace:"cam16"` explicitly) |
| `theme` | auto / light / dark | auto | UI appearance only (not exported) |

Per-palette: `{ name, hue 0–360, chroma 0–100, skew -100..100, lift -40..40, hueShift -60..60, hueSameDir:bool, on:bool }`.
`hueShift` is the **edge hue rotation** about stop 500: per-stop hue = baseHue + hueShift·s (s=(stop−500)/450), `hueSameDir=false` (default) torsions the two ends in OPPOSITE directions; `hueSameDir=true` makes BOTH ends bend the SAME way, matching the light end (per-stop hue = baseHue − hueShift·|s|, so light+20/dark−20 becomes light+20/dark+20). 0 = flat (the hue-stability default).

## 3. Tone curves (the five `shape` functions)

`shape(p)` remaps a normalized position `p ∈ [0,1]` (0 = lightest end / stop 050,
1 = darkest end / stop 950) to `q ∈ [0,1]`. `ten = tension/100`.

```
linear:    q = p
sine:      q = 0.5 - 0.5*cos(π*p)                       // eased both ends
cubic:     q = p<0.5 ? 4p^3 : 1 - (-2p+2)^3 / 2         // cubic in/out
logistic:  k = lerp(4,16,ten); f(x)=1/(1+e^(-k(x-0.5)));
           q = (f(p)-f(0)) / (f(1)-f(0))                // normalized sigmoid
exp:       k = lerp(0.4,5,ten); q = (e^(k p) - 1)/(e^k - 1)
```

`tension` only affects logistic and exp (the UI disables the control otherwise).

| Curve | Character |
|-------|-----------|
| linear | evenly spaced lightness steps |
| sine | eased ends, steepest at mid |
| cubic | gentle ends, fast middle |
| logistic | flat near 050/950, distinct mid tones (default) |
| exp | compressed lights, expanded darks |

## 4. `toneAt` — tone per stop

```
toneAt(stop, skew, lift):
  p = (stop - 50) / 900                  // 0 at 050 (light) .. 1 at 950 (dark)
  g = 3 ^ (skew/100)                     // skew>0 -> gamma>1 -> lighter mids (peak drifts light)
  p = p ^ g
  q = shape(p)
  t = lmax - (lmax - lmin) * q
  if lift:                               // additive bump centered on 500, 0 at 050/950
    w = 0.5 * (1 + cos(π * (stop - 500) / 450))
    t += lift * w
  return clamp(t, lmin, lmax)
```

- **skew** warps the tone distribution via a gamma on `p`. Positive skew lightens the
  mid-tones (the visual chroma peak drifts toward lighter stops).
- **lift** adds a cosine-weighted L\* bump centered on stop 500, tapering to 0 at the ends.
  Used to nudge a palette's mid lightness (e.g. Warning gets `lift +15`).

## 5. Chroma targeting and edge damping

```
hue    = effHue(palette.hue, hueSpace, palette.chroma/100)  // cam16 hue; if hueSpace=oklch, the chroma-aware OKLCH→CAM16 inverse anchored at this palette's chroma
pk     = peakC(hue).c                     // hue's own max chroma in sRGB
target = (palette.chroma / 100) * pk      // chroma control is % of the hue's peak

for each stop:
  tone  = toneAt(stop, skew, lift)
  cm    = maxChromaInGamut(hue, tone)     // gamut ceiling at this tone
  s     = (stop - 500) / 450              // signed pos: <0 light · 0 mid · >0 dark
  uG    = |s| ^ dampCurve                 // falloff (γ); legacy was a fixed 1.5
  sideW = max(0, 1 + (dampBias/100)*sign(s))           // light↔dark asymmetry
  m     = max(0, 1 + (dampAmp/100)*(1-uG) - (damp/100)*sideW*uG)   // the multiplier
  C     = min(target * m, cm)             // never exceed the gamut ceiling
  rgb   = hctToRgb(hue, C, tone).rgb
```

- **Differential damping curve.** `m(stop)` is a per-stop chroma multiplier. The defaults
  `dampCurve 1.5, dampAmp 0, dampBias 0` reduce it to the legacy `1 - (damp/100)·u^1.5`
  edge damp **exactly** (backward-compatible — existing palettes/exports are unchanged).
  - **`damp`** sets the edge depth (amount); **`dampCurve` (γ)** shapes *where* damping
    bites — low spreads it into the mids, high confines it to the extreme ends.
  - **`dampAmp`** boosts mid-tone chroma toward the ceiling (`m > 1`, peaking at stop 500,
    tapering to 0 at the ends so it never fights the edge damp).
  - **`dampBias`** tilts damping toward the dark (`>0`) or light (`<0`) end — the two ends
    were previously locked together.
- Final chroma is always clamped to the gamut ceiling `cm` (the `min(·, cm)`), so amplify
  can only push *toward* the ceiling and every emitted color stays in sRGB by construction.

## 6. `paletteStops` — the per-stop pipeline

```
paletteStops(palette, stops) ->
  [ { stop, tone, chroma, maxc, rgb, hex } ]   // one entry per stop in `stops`
```
The grid uses `STOPS`; all exports use `EXPORT_STOPS`. Result objects carry both the applied
chroma and the gamut ceiling (`maxc`) so the analysis plot can draw the ceiling vs. the
applied curve.

## 7. Worked example

Primary default `{hue:267, chroma:95, skew:-20, lift:0}` in **`toneMode:"even"`** (the CIELAB-L* path this section describes; the live default is `perceptual`/OKHSL), curve logistic, tension 0,
lmin 5, lmax 100, damp 80:

- `peakC(267).c` ≈ the hue's sRGB chroma peak; `target = 0.95 * peak`.
- Stop 500: `p=0.5`, `g=3^(-0.2)≈0.803`, `p^g≈0.574`, logistic `shape`≈0.62,
  `t = 100 - 95*0.62 ≈ 41` (mid-dark). `m=1` at stop 500 (when `dampAmp=0`), so `C=min(target, cm500)`.
- Stop 050: `p=0`, tone→`lmax=100` → `hctToRgb` returns white; chroma irrelevant (tone≥100
  branch). This is why every palette's `050` is `#FFFFFF` at `lmax=100`.
- Stop 950: `p=1`, tone→`lmin=5`; heavy damping → near-neutral very dark color.
