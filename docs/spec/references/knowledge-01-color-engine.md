# Knowledge 01 — Color Engine (HCT: CAM16 H/C + CIELAB L\*)

> Topic: the perceptual color engine. This is the **rate-limiting core** of the tool —
> every swatch, plot point, and exported token derives from it. Specify it exactly;
> describing it in prose is not enough for regeneration.

## Table of Contents
1. What HCT is
2. Transform chain and matrices
3. Viewing conditions (CAM16 VC)
4. CAM16 forward / inverse
5. `hctToRgb` contract
6. `maxChromaInGamut` (gamut ceiling)
7. `peakC` (per-hue chroma peak)
8. `oklchToCam16Hue` (hue-space bridge) · `hctToOklch` (high-res HCT → OKLCH)
9. Determinism and caching
10. Verification anchors

---

## 1. What HCT is

HCT (Hue–Chroma–Tone) is Google's perceptual color model. This tool's variant:

- **Hue** and **Chroma** come from **CAM16** (a color appearance model).
- **Tone** is **CIELAB L\*** (perceptual lightness, 0–100), *not* CAM16 lightness J.

The split matters: tone is the controllable axis (you set L\* per stop), while hue stays
fixed and chroma is maximized within the sRGB gamut at that tone. This produces tonal
ramps where lightness steps are perceptually even and hue does not drift.

## 2. Transform chain and matrices

```
sRGB8  --lin-->  linear sRGB  --SRGB_TO_XYZ-->  XYZ  --cam16FromXyz-->  CAM16 (J, C, h)
                                                  |
                                                  +-- Y --lstarFromY--> L*
```

Constants (literal — regenerate from these, do not approximate):

```
SRGB_TO_XYZ = [[0.41233895, 0.35762064, 0.18051042],
               [0.2126,     0.7152,     0.0722    ],
               [0.01932141, 0.11916382, 0.95034478]]

XYZ_TO_SRGB = [[ 3.2413774792388685, -1.5376652402851851, -0.49885366846268053],
               [-0.9691452513005321,  1.8758853451067872,  0.04156585616912061],
               [ 0.05562093689691305,-0.20395524564742123,  1.0571799111220335 ]]

WHITE (D65, scaled to Y=100) = [95.047, 100, 108.883]
```

Companding (sRGB transfer), scaled so linear is in 0–100:

```
lin(c8):   c = c8/255; return c <= 0.040449936 ? c/12.92*100
                                                : ((c+0.055)/1.055)^2.4 * 100
delin(l):  n = l/100;  v = n <= 0.0031308 ? n*12.92 : 1.055*n^(1/2.4) - 0.055
           return round(clamp(v,0,1) * 255)
```

L\* / Y bridge (CIELAB):

```
labInvf(ft): e=216/24389, k=24389/27, c=ft^3; return c>e ? c : (116*ft-16)/k
yFromL(L):   return 100 * labInvf((L+16)/116)
lFromY(y):   e=216/24389, n=y/100; return n<=e ? n*24389/27 : 116*cbrt(n)-16
```

## 3. Viewing conditions (CAM16 VC)

CAM16 is parameterized by adapting luminance, surround, and background. `makeVC()`
derives a fixed VC once at load and caches it as `VC`. Inputs:

- White point = `WHITE`
- Adapting luminance `aL = (200/π) * yFromL(50) / 100`  (mid-gray field)
- Surround `sur = 2` (CAM16 "average" surround)
- Background `bg = 50`

Derived quantities (all from CAM16's standard equations): `f, c, nc, d (degree of
adaptation, clamped 0–1), rgbD (cone adaptation gains), fl (luminance-level adaptation),
n, z, nbb, ncb, aw (achromatic response of white)`. The exact derivation is in `makeVC`;
it is deterministic and must reproduce the same `VC` every run.

> 💡 The VC is fixed, not user-controllable. The tool does not expose viewing-condition
> controls because the target is screen sRGB under average surround — a single, stable
> appearance context. Exposing VC would make exports non-portable.

## 4. CAM16 forward / inverse

`cam16FromXyz(x,y,z) -> {hue, chroma, J}`:
- Cone responses via the CAT16 matrix, cone adaptation by `rgbD`, nonlinear adaptation
  `400*x^0.42/(x^0.42+27.13)` with sign, opponent channels `a,b`, hue angle
  `atan2(b,a)`, achromatic response, `J = 100*(ac/aw)^(c*z)`, and chroma
  `C = alpha*sqrt(J/100)` where `alpha` uses the eccentricity/temperature terms.

`xyzFromCam16(J,C,hue) -> [x,y,z]`: the algebraic inverse (the standard CAM16-UCS
inversion). Used inside `hctToRgb`'s tone search.

Both directions are present and must stay mutually consistent (see anchors, §10).

## 5. `hctToRgb` contract

```
hctToRgb(hue, chroma, tone) -> { rgb:[r,g,b], inGamut:bool, lstar:number }
```

Branches (order matters):
1. `tone <= 0`   → `{rgb:[0,0,0],   inGamut:true, lstar:0}`
2. `tone >= 100` → `{rgb:[255,255,255], inGamut:true, lstar:100}`
3. `chroma < 0.4` → neutral gray at the tone: `v = delin(yFromL(tone)); rgb=[v,v,v]`,
   `inGamut:true`. (Below 0.4 chroma, CAM16 inversion is numerically noisy; treat as gray.)
4. Otherwise: **binary-search J** (18 iterations, lo=0 hi=100) so that
   `lFromY(xyzFromCam16(J, chroma, hue).y)` matches `tone`. Convert the resulting XYZ to
   linear sRGB via `XYZ_TO_SRGB`, then `delin`. Gamut test uses a tiny epsilon:
   `inGamut = all channels in [-0.0001, 100.0001]` (linear scale).

> 📐 The returned `lstar` is recomputed from the searched XYZ, so a caller can verify the
> tone was hit. `inGamut=false` means the requested (hue, chroma, tone) is outside sRGB;
> callers clamp chroma using `maxChromaInGamut` before calling.

## 6. `maxChromaInGamut` (gamut ceiling)

```
maxChromaInGamut(hue, tone) -> number   // largest chroma that stays in sRGB at this tone
```
- `tone<=0 || tone>=100` → 0.
- Binary search chroma in [0, 180], 18 iterations: `hctToRgb(hue, mid, tone).inGamut`
  moves `lo` up or `hi` down. Return `lo`.
- **Memoized** by key `hue.toFixed(2)+'|'+tone.toFixed(2)`.

## 7. `peakC` (per-hue chroma peak)

```
peakC(hue) -> { c:number, tone:number }   // the hue's maximum achievable chroma, and where
```
- Scan `t = 4..96 step 2`, take `max maxChromaInGamut(hue, t)`. Return the peak chroma and
  its tone. Memoized by `hue.toFixed(2)`.
- Used to interpret the per-palette `chroma` control as a **percentage of the hue's own
  peak** (so "100%" means "as saturated as this hue can get in sRGB", not a raw number).

## 8. `oklchToCam16Hue` (hue-space bridge)

OKLCH is now the **default** input hue space (see `hueSpace`, knowledge-02 §; `cam16` stays
selectable, and legacy docs saved under cam16 carry `hueSpace:"cam16"` explicitly and keep
rendering in cam16). When a palette's hue is read as OKLCH, `oklchToCam16Hue(h, chromaFrac=1)`
maps it to the equivalent CAM16 hue so the render path (which works in CAM16) lands the
identity color on the stored OKLCH hue:

```
oklchToCam16Hue(h, chromaFrac=1):
  // Newton inverse of the render path: find the CAM16 hue whose color, rendered at
  // chromaFrac of that hue's peak chroma, has OKLCH hue == h.
  memoize by h.toFixed(2)+'|'+chromaFrac.toFixed(3)
```

> 💡 This is an **accurate, chroma-aware** inverse. The OKLCH↔CAM16 hue map shifts with
> chroma (the **Abney effect**), so a fixed or cusp-only anchor is wrong at the other end.
> Anchoring the solve at the palette's OWN chroma (`chromaFrac = palette.chroma/100`, passed
> via `effHue`) makes the rendered identity color land on the stored OKLCH hue to ~0.00°.
> Engine gate: `hct-oklch-inverse` (`test/engine/hct.mjs`). (Supersedes the old fixed-sample
> mapping; see ADR-008 / ADR-011 in `decision-records.md`.)

## 8b. `hctToOklch` (high-res HCT → OKLCH)

```
hctToOklch(hue, chroma, tone) -> [L, C, H°]   // float, the perceptual OKLCH of an HCT color
```
- Reuses the CAM16 J-solve from `hctToRgb`, then converts the converged **linear sRGB**
  straight through OKLab — **no 8-bit round-trip**. This is the high-res HCT→OKLCH used for
  analysis and readouts.
- **Principle:** HEX is only ever derived for consumption; perceptual coordinates come from
  the model at full precision (never measured back off an 8-bit hex). `projectView` emits
  `keyOklch` (each palette's key color in high-res OKLCH); the key HEX is derived from it.

## 9. Determinism and caching

- No RNG, no clock, no locale. Same inputs → identical outputs.
- Three memo caches: `_mc` (maxChroma), `_pk` (peakC), `_oh` (oklch hue, keyed by hue +
  chromaFrac). Keys use `toFixed(2)` (chromaFrac `toFixed(3)`) so cache hits are exact within
  0.01° / 0.01 tone.
- The engine exists in three implementations (artifact inline, `gen.js`, the plugin shares
  the contrast-free portions). They must agree; see `rubrics/parity-checklist.md`.

## 10. Verification anchors

`data/verification-anchors.json` holds the canonical correctness test: forward
(`cam16FromRgb` + L\*) then inverse (`hctToRgb`) roundtrip for red/green/blue/white/black/
mid-gray. Acceptance: `max_channel_delta <= 2` per anchor (current engine: 0). If a change
moves any anchor past tolerance, the engine is broken — revert.

Representative values (current engine):

| anchor | CAM16 hue | CAM16 chroma | L\* | roundtrip Δ |
|--------|-----------|--------------|-----|-------------|
| red    | 27.41 | 113.36 | 53.23 | 0 |
| green  | 142.14 | 108.41 | 87.74 | 0 |
| blue   | 282.79 | 87.23 | 32.30 | 0 |
| white  | — | ~0 | 100 | 0 |
| black  | — | 0 | 0 | 0 |
