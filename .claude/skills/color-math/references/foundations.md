## Foundations — the model an engine change leans on

The load-bearing ideas. If a change feels like it needs a new mechanism, you are probably fighting one of
these. The full math is owned by `docs/spec/references/knowledge-0{1,2,6}-*.md` +
`docs/spec/color-neutral-derivation.md` — this file is only the mental model the *procedure* assumes.

### 1. Three color spaces, three jobs

- **CAM16 / HCT** (`hct.js`) — a color *appearance* model. The ramp holds a **constant CAM16 hue** and a
  **CIELAB L\*** tone (NOT CAM16 lightness J — J is the internal variable the gamut search binary-searches).
  Hue+Chroma come from CAM16; Tone is L\*. This split is *why* lightness steps are perceptually even while
  hue does not drift (knowledge-01 §1).
- **OKLCH / OKHSL** (`okhsl.js`) — Ottosson's perceptual spaces. OKHSL is **gamut-bijective**: at a given
  (hue, lightness), `s=1` lands exactly on the sRGB boundary, and a fixed `(s,l)` reads as the same perceived
  colorfulness across hue (the `boundary` gate proves s=1 sits on a gamut face for every hue × lightness).
  That is the property that lets the **perceptual** (default) ramp harmonize saturation across hue with no
  near-white dead zone. OKLCH is the *seeding/derivation* space (key colors, New-Palette targets) — less
  lossy than an 8-bit hex source.
- **sRGB** — the output. 0–255 integer triples. Every public function returns sRGB bytes.

### 2. The HCT transform chain (`hct.js`)

```
sRGB8 --lin--> linearSrgb(0..100) --SRGB_TO_XYZ--> XYZ --cam16FromXyz--> {hue, chroma, J}
                                                    |
                                                    +-- Y --lFromY--> L*
```

Constants are **literal, from material-color-utilities** (`SRGB_TO_XYZ`, `XYZ_TO_SRGB`, `WHITE`,
`CAT16`/`CAT16_INV`). `VC` (viewing conditions) is derived once by `makeVC()` and cached — a mid-gray field,
"average" surround (c=0.69, F=1, Nc=1). It is **fixed and not user-controllable** (exposing it would make
exports non-portable — knowledge-01 §3).

### 3. `hctToRgb` — branches in order (the order matters)

`hctToRgb(hue, chroma, tone) → { rgb, inGamut, lstar }`:
1. `tone <= 0` → black `[0,0,0]`, inGamut, lstar 0.
2. `tone >= 100` → white `[255,255,255]`, inGamut, lstar 100. **(This is why every palette's 050 is `#FFFFFF`
   at `lmax=100`.)**
3. `chroma < 0.4` → **neutral gray at the tone** (`v = delin(yFromL(tone))`). Below 0.4 chroma the CAM16
   inversion is numerically noisy; emit gray. (The `branches` gate checks 0.3 chroma yields `max−min ≤ 1`.)
4. Otherwise → **binary-search CAM16 `J`** (18 iters, lo 0 / hi 100) so `lFromY(xyzFromCam16(J,chroma,hue).y)`
   == `tone`; convert XYZ→linear sRGB; `inGamut` = all channels in `[-0.0001, 100.0001]`; `delin` to bytes.
   `lstar` is recomputed from the searched XYZ so a caller can verify the tone was hit.

### 4. The gamut search — `maxChromaInGamut` and `peakC`

- `maxChromaInGamut(hue, tone)` — binary-search chroma in `[0,180]` (18 iters): keep the largest chroma whose
  `hctToRgb(...).inGamut` is true. Returns that ceiling; `0` at `tone<=0 || tone>=100`. **Memoized** by
  `hue.toFixed(2)+"|"+tone.toFixed(2)`. The `gamut-ceiling` gate proves it is *tight*: in-gamut at `maxC`,
  NOT at `maxC+0.5`.
- `peakC(hue)` — scan `t = 4..96 step 2`, return `{c,tone}` = the hue's max chroma and where it peaks.
  Memoized by `hue.toFixed(2)`. This is *why* the per-palette `chroma` control is "% of the hue's own peak"
  (100% = as saturated as this hue can get in sRGB), not a raw number.
- `oklchToCam16Hue(h)` — sample a fixed mid OKLCH color (L 0.72, C 0.10) and read its CAM16 angle. A
  *sampled* mapping (expect a few degrees drift; ADR-008), memoized by `h.toFixed(2)`.

### 5. The even-path chroma pipeline (`paletteStops`, even mode, `tonal.js` ~148–193)

```
baseHue = effHue(palette.hue, hueSpace)           # CAM16 hue, computed ONCE
target  = (palette.chroma/100) * peakC(baseHue).c # % of the BASE-hue peak (absolute)
per stop:
  tone     = toneAt(stop, skew, lift, ctl)
  s        = (stop−500)/450                        # signed: <0 light · 0 mid · >0 dark
  hue      = baseHue + hueShift·dir               # dir = s (opposite) or −|s| (hueSameDir); 0 = flat
  maxc     = maxChromaInGamut(hue, tone)          # the per-stop ceiling
  uG       = |s|^dampCurve                         # γ shapes WHERE damping bites
  sideW    = max(0, 1 + (dampBias/100)·sign(s))    # light(−)↔dark(+) asymmetry
  m        = max(0, 1 + (dampAmp/100)·(1−uG) − (damp/100)·sideW·uG)   # the multiplier
  intended = relChroma ? (chroma/100)·maxc : target   # per-stop ceiling basis vs base-peak basis
  damped   = min(intended·m, maxc)
  floorC   = min((chromaFloor/100)·maxc, intended)    # NEVER above intended → muted stays muted, neutral stays neutral
  chroma   = min(maxc, max(damped, floorC))
  rgb      = hctToRgb(hue, chroma, tone)
```

- **Defaults `dampCurve 1.5, dampAmp 0, dampBias 0` reproduce the legacy `1 − (damp/100)·u^1.5` edge damp
  EXACTLY** — the `damping-curve (a)` gate compares against the independent legacy formula
  `min(target·(1−(damp/100)·u^1.5), ceiling)`, `|Δ| ≤ 1e-6`, over EVERY saturated hue × stop.
- **`relChroma`** (default false): the chroma control is % of the BASE-hue peak — absolute chroma varies with
  each hue's gamut. `true`: % of EACH stop's own ceiling → every hue fills the same fraction → palettes
  harmonize across hue. A cheap stand-in for OKHSL's perceptual normalization (the `rel-chroma` gate checks
  blue 264° vs yellow 90° use the same gamut fraction within 0.02).
- **`chromaFloor`** (default 40): lifts the damping-starved light/dark ends of a LOW-chroma ramp back toward
  `intended` (kills the near-white "dead zone") but is capped at `intended` — so it never over-saturates a
  muted palette and never tints a true neutral (`intended≈0` → floorC 0). Saturated ramps already clamp at
  `maxc`, so the floor never binds. (The `chroma-floor` gate proves all four.)

### 6. The OKHSL-path pipeline (`okhslStops`, perceptual/peak, `tonal.js` ~209–245)

`l` per stop blends the **even-perceptual** distribution toward the **cusp-anchored** ("peak") one by
`vibrancy`/`cuspPull` (`t=0` even, `t=1` the hue's cusp at stop 500; `peak` mode pins `t=1`). This pulls
off-center hues' richest stop toward the center (yellow's cusp is at high L\* — crank vibrancy and the mid
reads vivid for any hue). Saturation = `(chroma/100)·m` clamped to `[0,1]`, using the **same** damping `m` as
the even path. `okhslLAt(L*)` maps an L\* to OKHSL lightness via a neutral gray (`rgbToOkhsl(hctToRgb(0,0,L*))`),
memoized in `_okL`. The reported `chroma`/`maxc` are *measured* (`cam16FromRgb(rgb).chroma`) for the analysis
graphs; the color is in-gamut by OKHSL construction (`inGamut: true` is asserted, not computed). `l` is keyed
on the **stop number** (`(stop−50)/900`, `(stop−500)/450`), not the array index — so stop 500 is the same hex
in the 19-stop display ramp and the 25-stop export ramp.

### 7. Derivation (`derive.mjs`) — pure, OKLCH, circular

- `weightedMeanHue(samples)` — chroma-weighted circular mean: `Σ C·(cosH,sinH) → atan2`. Returns
  `{hue, coherence}` (`coherence = |resultant|/ΣC ∈ [0,1]`; ≈0 = samples cancel / near-neutral → hue noisy;
  falls back to `samples[0]`'s hue when ΣC=0 or the vector is zero). Weighting by chroma means a near-grey
  contributes almost nothing.
- `deriveNeutral(samples)` = `[0.66, clamp(0.30·meanC, 0.004, 0.018), weightedMeanHue.hue]` — a seeded first
  palette (NOT a separate strip); the standard ramp supplies the lightness steps + chroma taper. The
  two-number rule (hue + the C_max clamp, floor 0.004 / ceiling 0.018) is owned by `color-neutral-derivation.md`.
- `deriveRelative(id, samples)` over `RELATIONSHIPS` (`extend +30°`, `complete` largest-gap, `contrast +180°`,
  `bridge` shorter-arc midpoint, `anchor` same hue, `recontextualize` complement·0.6 chroma); empty context
  → `[0.6, 0.12, 0]`. Single-reference relationships (extend/contrast/anchor/recontextualize) pivot on the
  **PRIMARY = `samples[0]`** (priority order set by the caller), NOT chroma weighting — a low-chroma primary
  still anchors. `complete`/`bridge` are set-geometry: they use the whole set.