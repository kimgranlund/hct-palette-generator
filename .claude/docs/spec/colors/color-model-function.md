# Color Model & Function

*A working system for how Travel Palettes colors are structured, how they relate, and what to call them.*

This is a **rubric, not a rulebook**. The numbers and structures below are defaults that make palettes legible and reusable — bend them when a territory demands it, but bend them knowingly. The goal is that any palette in the library can be read, named, and dropped into an interface without re-deciding what each color is *for*.

---

## 1. First principles

Three commitments carry over from how the palettes are sourced, and they govern everything downstream:

1. **Color earns its place by observation, not category.** A palette is sampled from a real territory's material culture, its light condition, and its pigment tradition — never from the postcard default. Every palette names the cliché it **refuses**. The model keeps that discipline: no slot exists just to be filled.
2. **Proportion is the structure, not the count.** A palette is not "six colors." It is a *distribution* — a large quiet ground, a working middle, and a small loud punctuation. Naming must encode how much of the field a color is meant to occupy.
3. **Function is separate from aesthetics.** The colors that carry mood (the sampled six) and the colors that carry meaning (error / warning / success) are different jobs. The model keeps them on different axes so they never get confused.

---

## 2. The model: three axes

Every color in a palette is located by answering three independent questions. Two describe the sampled palette; the third is orthogonal.

### Axis A — Tier (semantic weight)

How much visual responsibility the color carries. Maps directly to the old single-axis hierarchy, but is now only *one* of the things a label says.

| Tier | Carries | Target share of the field |
|---|---|---|
| **Primary** | The ground. The color you'd name if asked "what color is this place?" | ~55–60% |
| **Secondary** | The working surfaces — the materials around the ground. | ~30–35% |
| **Accent** | Punctuation. The saturated reads that appear rarely and mean something. | ~10% |

### Axis B — Rank within tier

Each tier holds **two** colors: an anchor and its quieter partner. This is the second word in a token, and it is deliberately *not* called "dominant" — that word belonged to the old single-axis scheme and re-using it inside a tier reads redundantly (`primary-dominant` says the same thing twice).

| Rank | Role | Relationship to its tier-mate |
|---|---|---|
| **base** | The anchor of the tier — the one used first and most. | — |
| **muted** | The desaturated / shifted partner. Lower chroma, or a small hue step, at similar lightness. | Sits *beside* the base, never fights it. |

> If a tier ever needs three colors, extend numerically (`primary-1 / -2 / -3`) rather than inventing a third rank word.

### Axis C — Function (orthogonal)

Status colors are a separate system from the sampled palette. They are **derived from** the palette (see §4) so they belong to it, but they are named on their own axis so no one mistakes a warm accent for a warning.

| Token | Meaning |
|---|---|
| **functional-error** | failure, destructive, stop (the relative system-red) |
| **functional-warning** | caution, pending (the relative system-yellow) |
| **functional-success** | confirmation, complete (the relative system-green) |

### The legibility layer — `on-` colors

A fourth, derived concern: what text/icon color sits *on top* of a given color. The existing `light: true` flag already tracks "this swatch needs a dark label." Formalize it as a paired token.

- Any color light enough to need dark type carries an `on-{token}` of the palette's darkest accent (or near-black).
- Any dark color carries an `on-{token}` of the palette's lightest ground (or near-white).

`on-` colors are not new colors — they are pointers to existing palette members chosen for contrast.

---

## 3. Naming convention

```
{tier}-{rank}              sampled palette colors
functional-{role}          status colors, derived
on-{token}                 the legible foreground for {token}
```

A full palette therefore reads:

```
primary-base       primary-muted
secondary-base     secondary-muted
accent-base        accent-muted

functional-error   functional-warning   functional-success

on-primary-base    on-secondary-base    …   (as needed)
```

**Why this and not the alternatives:**

- It is **two-axis**, so one word never carries two meanings.
- It is **flat and predictable** — a designer can guess a token name before looking it up.
- It **scales** — numeric ranks absorb extra colors; the functional axis absorbs new states.
- It **survives translation to code** — these map cleanly to CSS custom properties (`--primary-base`, `--functional-error`) and to most design-token tools.

---

## 4. Relationships & rules of thumb

These are the heuristics that keep a palette coherent. Treat each as a default with a stated reason, not a law.

**Proportion (the 60 / 30 / 10 instinct).**
Primary should dominate the field, secondary should furnish it, accent should never exceed roughly a tenth. If accent creeps past that, it stops being punctuation and starts being a second primary — the palette goes loud and loses its source.

**base ↔ muted (within a tier).**
The muted member is the base with chroma pulled down and/or hue nudged a few degrees — same lightness neighborhood. It exists to give a tier *range* without introducing a new color identity. If base and muted read as two unrelated colors, one of them belongs in a different tier.

**Primary ↔ Accent (across the spread).**
Accent earns its loudness by contrast with the primary ground — usually a large lightness gap, a chroma jump, or a hue on the far side of the wheel. The Trans-Siberian palette works because maroon and dusk-ultramarine are the *only* saturated reads against a silver ground; drown them in more saturation and the contrast that makes them mean something evaporates.

**Functional colors are tuned, not imported.**
Status colors are computed in OKLCH so they *belong* to the palette rather than arriving off-the-shelf:
- **Hue** is held near canonical anchors — red ≈ 28°, yellow ≈ 88°, green ≈ 150° — so they remain unmistakably error/warning/success.
- **Chroma** is scaled to the palette's *own accent register* (roughly the average chroma of its accents), so a muted territory gets muted status colors and a saturated one gets vivid ones.
- **Lightness** is held in a legible band per role regardless of palette, so contrast is dependable.

The point: in a foggy Newfoundland palette, the error-red should look like *that place's* red, not a generic alert-red — while still reading as "error" at a glance.

**Recognition is the final test.**
A palette passes if someone who has stood in the territory recognizes it without the label, *and* a designer can build a small interface from it without asking which color is the button. The model serves both readings or it has failed.

---

## 5. The rubric (palette scorecard)

Use this to evaluate or repair any palette. A healthy palette answers "yes" to all six.

1. **Tiered?** Exactly one primary ground identified; can you say the place's color in one word?
2. **Proportioned?** Does the field land near 55–60 / 30–35 / 10, or is there a stated reason it doesn't?
3. **Paired?** Does every tier have a base and a legible muted partner that relate, not clash?
4. **Punctuated?** Are accents few, saturated, and contrasting — not a second ground?
5. **Functional fit?** Do the derived status colors read as error/warning/success *and* feel sampled from this palette?
6. **Refusal named?** Is the category cliché this palette rejects explicitly stated?

> Note on the existing library: most palettes today sample as **1 dominant / 3 supporting / 2 accent**. Mapping them onto this 2-2-2 model is a *judgment call per palette*, not a pure rename — you promote one supporter to `secondary-base`, pair another as its `muted`, and fold or demote the rest. Do it with the scorecard in hand.

---

## 6. Worked example

**Vol I · 01 — Trans-Siberian, Lake Baikal corridor.** Sampled six colors, re-located into the model:

| Token | Color | OKLCH | HEX | Reasoning |
|---|---|---|---|---|
| **primary-base** | Frozen birch forest, silver | `0.918 0.005 215` | `#E3E6E7` | The ground — the whole trip read from the window. |
| **primary-muted** | Window condensation | `0.857 0.011 80` | `#DAD3C4` | Same near-neutral lightness, faint warm shift — the base's quiet partner. |
| **secondary-base** | Samovar brass | `0.620 0.068 78` | `#A08361` | The most distinct working surface; furnishes the field with warmth. |
| **secondary-muted** | Birch bark | `0.778 0.012 75` | `#C5BCB1` | Brass's lower-chroma relative — same family, recedes. |
| **accent-base** | Kupé maroon velour | `0.322 0.045 28` | `#4B2F2C` | Dark, saturated, rare — punctuation against the silver. |
| **accent-muted** | 3 p.m. dusk, ultramarine | `0.303 0.048 268` | `#343C54` | The second loud read, hue thrown to the cool side. |
| **functional-error** | *derived* | `0.535 0.110 28` | `#A35248` | Hue 28°, chroma pulled to this palette's quiet accent register. |
| **functional-warning** | *derived* | `0.760 0.100 88` | `#CCAE63` | Reads as caution without breaking the muted mood. |
| **functional-success** | *derived* | `0.560 0.090 150` | `#4B8358` | Green that belongs to a silver-and-brass world. |
| **on-primary-base** | → accent-base | — | `#4B2F2C` | Dark type on the light silver ground. |

Field share: primary ~55%, secondary ~35%, accent ~10% — and the palette still **refuses** the Soviet-flag red it would otherwise default to.

---

*This document is the source of truth for naming and structure. The per-palette color values live in `travel-palettes.md`; this defines what those values mean and how they relate.*
