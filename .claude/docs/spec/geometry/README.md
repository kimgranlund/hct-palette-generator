# Geometry / dimensional tokens — reference shape

`geometry.tokens.json` is a **real export** from the geometry engine (`src/engine/geometry.mjs`) — the
spatial analog of the color & type engines: a few parameters → a systematic size ramp → derived control
geometry → [DTCG](https://tr.designtokens.org/) `dimension` tokens (and CSS custom props + utility
classes). The sample here is the **Comfortable** treatment at a 28px base height.

## The law (the one rule)

> **Edge padding for a glyph = (height − glyph) / 2** — every glyph centers in a square cell of side =
> the control height. `padding-block` is `0`; **block-size is the vertical lever, never block-padding**.

From that single rule fall out: the slot padding (`½(height − icon)`), the slotless/bare-label edge
(`h/2` = the text pad `½(h − font)` + the absent slot's gap `½·font`), the icon-only **square**
(`min-width = height`), and the **pill radius** (`height/2`).

## The two families

| Family | Scales with | Members | Density |
|---|---|---|---|
| **Frame** | the box **height** | icon, slot, inline-pad, min-inline-size, pill radius | density-invariant (scaling it un-centers the glyph) |
| **Rhythm** | the **font** | `gap = font/2`, `caret = font` | density multiplies the rhythm **only** |

## The ramp (one power law, six samples)

`scale × size` → a **height** and a **font**; the glyphs scale **sublinearly** (the optical correction —
a glyph occupies a shrinking fraction of the box as it grows):

```
icon = 2.49 · height^0.58   (round to nearest even)
font = 3.16 · height^0.45   ≈ √height   (round to nearest integer)
caret = font                (the rhythm rule — the affordance mark = text height)
```

These reproduce the hand-tuned reference ramp to ±1px — so the table is not six hand-picked points, it is
**one rule sampled six times**, and it generalizes to any scaled `baseHeight`:

| size | height | icon | caret | font | pad (slot) | edge (slotless) | radius (pill) |
|---|---|---|---|---|---|---|---|
| **XS** | 20 | 14 | 12 | 12 | 3 | 10 | 10 |
| **SM** | 24 | 16 | 13 | 13 | 4 | 12 | 12 |
| **MD** | 28 | 18 | 14 | 14 | 5 | 14 | 14 |
| **LG** | 36 | 20 | 16 | 16 | 8 | 18 | 18 |
| **XL** | 48 | 24 | 18 | 18 | 12 | 24 | 24 |
| **2XL** | 64 | 28 | 21 | 21 | 18 | 32 | 32 |

## Structure (`geometry.tokens.json`)

| Top-level key | What it is |
|---|---|
| `size` | one composite per ramp step (XS–2XL): `height · icon · caret · font · gap · padding · edgePadding · radius · minWidth`, each a `dimension` token |
| `radius` | the flat radius ladder — `none · sm · md · lg · full` (full = the CSS-pill `9999px`) |
| `space` | the `--space-*` layout scale (page/section/card rhythm — the space **between** components, a separate concern from control padding) |

## Composition with typography (one number, two engines)

A control's **box** (geometry) and the **text** in it (typography) share a single source of truth: the
app resolves geometry via `geometryScale(doc) = geomScale(doc.geometry, { typeScale: typeScale(doc.type) })`,
which replaces each size's power-law `font` with the type scale's **UI voice** at the matching step
(geometry `XS → UI XS … 2XL → UI 2XL`). So changing the brand's type treatment or body base moves the
control text everywhere it's used. Only the *rhythm* follows (`caret = font`, `gap = font/2`); the *frame*
(height/icon/padding/radius) is untouched, so the centering law still holds. The pure engine
(`geomScale(config)` with no opts) keeps the standalone power-law `font`; the sample above is that pure
output.

## Figma number variables (`dimension.variables.json`)

`geomTokensFigma(scale)` emits the same numbers as **DTCG `number` tokens** (unitless) under a top-level
**`Geometry`** group — the shape a Figma variable importer turns into native **FLOAT variables** you bind
to auto-layout sizing, corner radius, and gaps. Shipped in the Download-All `figma/` folder + the geometry
`.zip` (px is 1:1 with Figma's unitless floats).

## The parameters (what the generator derives from)

Mirroring color (`{hue, chroma, distribution}`) and type (`{ base, ratio, leading, … }`), geometry derives
from `{ treatment, baseHeight }`:

- **`baseHeight`** — the MD control height; uniformly scales the whole ramp (the dimensional analog of the
  type engine's `bodyBase`).
- **`treatment`** — seeds density + the radius ladder + the spacing base. Five presets:
  **Comfortable** (density 1, soft corners, 4px rhythm) · **Compact/Dense** (0.75, sharp) ·
  **Spacious/Airy** (1.25, round, 8px) · **Touch/Mobile** (1.1, 36px targets) · **Pill/Rounded** (fully-round).

## Mechanization

This is the same law the `design-skills:component-decomposer` skill mechanizes (`bin/geometry-check.py`):
edge-pad `== (height − glyph)/2`, block-size off the ramp with `padding-block == 0`, `0 < glyph ≤ box`,
the slot/slotless pad, affordance `== font`. The engine is verified by `test/engine/geometry.mjs`.

> Status: **shipped** — `src/engine/geometry.mjs` + the Geometry editor section generate these tokens.
