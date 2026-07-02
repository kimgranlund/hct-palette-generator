# Neutral Derivation Rule

*How to derive a palette's 7th group — the **neutral / environment tone** used
for backgrounds, container surfaces, dividers, and system text — from the six
sourced colors it already has.*

This doc covers the **two fundamentals**: the neutral's **hue** and its **maximum
chroma**. Everything else in the ramp (the lightness steps for bg → surface →
text → ink, and the chroma taper across them) is built on top of these two
numbers. The governing idea, from `skills/color-theory-foundations` and
`color-model-function.md`:

> **Neutrals are colored.** A pure-grey environment beside a sourced palette
> reads accidental. The neutral must carry the palette's own hue and temperature
> at a chroma low enough that it still reads as *grey* — "grey with a memory of
> where it came from."

Both rules operate in **OKLCH**, because it is perceptually uniform: chroma and
hue can be reasoned about independently of lightness (see
`skills/color-theory-foundations` for why HSL can't do this).

---

## Rule 1 — Hue: the chroma-weighted circular mean

The neutral's hue is the **chroma-weighted circular mean of the six swatches'
hues.**

```
For each swatch i with chroma Cᵢ and hue Hᵢ (degrees):
    xᵢ = Cᵢ · cos(Hᵢ)
    yᵢ = Cᵢ · sin(Hᵢ)

X = Σ xᵢ          Y = Σ yᵢ
H_neutral = atan2(Y, X)          → normalized to 0–360°
```

**Why weighted by chroma, not a plain average:**

- A near-grey swatch (e.g. a silver at chroma 0.005) has an *unreliable* hue —
  its angle is almost noise. Weighting by chroma lets it contribute almost
  nothing, so it can't drag the neutral toward a temperature the palette doesn't
  actually have.
- The **saturated** members — the ones that give the palette its character — pull
  the neutral toward themselves. The result is a grey that leans the way the
  palette as a whole leans: a brass-and-maroon interior yields a warm grey; a
  glacier-and-slate scene yields a cool one. Temperature falls out automatically,
  with no manual choice.

**Why circular (vectors + atan2), not a numeric average of the degrees:**

- Hue is an angle that wraps at 360°. A naive mean of 350° and 10° gives 180°
  (the exact opposite color); the vector method correctly gives 0°. Always sum
  unit-ish vectors and take `atan2` — never average the raw degrees.

> Edge case: if every swatch is essentially neutral (total vector length ≈ 0),
> the hue is undefined and unimportant — pick the primary's hue, or any value,
> since the chroma will be so low the hue won't be visible anyway.

---

## Rule 2 — Maximum chroma: scaled to the palette, then clamped

The neutral's **peak** chroma is tied to how colorful the palette is, but held
firmly inside "tinted grey" territory:

```
C_signal = mean chroma of the six swatches
C_max    = clamp( k · C_signal,  C_floor,  C_ceil )

    k       = 0.30      (proportion of the palette's chroma the neutral inherits)
    C_floor = 0.004     (never a dead, untinted grey)
    C_ceil  = 0.018     (never crosses into reading as a color)
```

**Why scale to the palette (the `k · C_signal` term):**

- A muted palette should get a barely-there tint; a vivid palette can carry a
  little more and still read neutral. Matching the neutral's chroma to the
  palette's own register is what makes it feel *sampled from* the palette rather
  than bolted on — the same principle used for the functional red/yellow/green.

**Why the clamp matters more than the scale:**

- The **ceiling (0.018)** is the important guardrail. Above roughly this, a grey
  starts to read as a desaturated *color* instead of a tinted neutral, and it
  will fight the real palette for attention. The cap means even a neon palette
  gets a restrained environment.
- The **floor (0.004)** guarantees the neutral is never a pure, lifeless grey —
  there is always a faint temperature tying it to the palette.

`C_max` is the chroma at the ramp's most colorful step (the mid-greys). It is a
**ceiling, not a constant**: near-white and near-black physically can't hold
chroma and shouldn't appear to, so the full ramp tapers chroma down toward both
lightness extremes (peaking in the mid-tones). That taper, and the lightness
steps themselves, are the next layer — but they all hang off the single `H` and
`C_max` derived here.

---

## Worked example — Vol I · 01, Trans-Siberian / Lake Baikal

Six swatches (chroma @ hue): `0.005 @ 215°`, `0.011 @ 80°`, `0.012 @ 75°`,
`0.068 @ 78°`, `0.045 @ 28°`, `0.048 @ 268°`.

- **Hue:** the vector sum is dominated by samovar brass (`0.068 @ 78°`), kupé
  maroon (`0.045 @ 28°`), and dusk ultramarine (`0.048 @ 268°`). The brass and
  maroon outweigh the cool ultramarine, and the near-grey silver (`0.005`)
  barely registers → **H ≈ 48°**, a warm amber-leaning grey. Correct: the
  carriage interior is warm, even though its *primary* is cool silver.
- **Max chroma:** mean chroma ≈ 0.031 → `0.30 × 0.031 = 0.0094` → within range →
  **C_max ≈ 0.009**. A faint warm tint — present, never a color.

The resulting neutral ramp is a warm grey: a near-white page, warm-grey surfaces
and dividers, and a warm near-black ink — an environment that belongs to the
palette and would look subtly *wrong* if swapped onto a cool, glacier-sourced one.

---

*Implemented in `src/engine/derive.mjs` (`deriveNeutral`), which returns the neutral's
identity OKLCH `[0.66, clamp(0.30·meanC, 0.004, 0.018), weightedMeanHue]`. The neutral is
seeded as an ordinary palette (the first/`neutral` palette of each set; `gen-categories.mjs`
leads every category preset with it), so the standard ramp pipeline supplies the lightness
steps and chroma taper. This doc is the rule for the two numbers everything else derives from.*
