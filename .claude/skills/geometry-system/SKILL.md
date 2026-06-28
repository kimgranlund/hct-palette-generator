---
name: geometry-system
description: >
  Change the dimensional / GEOMETRY ENGINE in nonoun-color-tokens — the centering
  law, the size ramp (XS–2XL heights + glyphs), radius and spacing ladders, and the
  composition with typography. Use whenever a change touches src/engine/geometry.mjs
  or src/ui/model.mjs geometryScale, or someone says "change the size ramp / control
  heights", "the control padding is off / un-centered", "tune the radius / spacing",
  "add a geometry treatment", "the geometry / dimension tokens are wrong", "the
  control text doesn't match the brand font", or "a geometry gate is red". The
  geometry sibling of the color-math skill (same shape: a few params → a
  systematic ramp → tokens).
---

# Geometry / dimensional engine — nonoun-color-tokens

`src/engine/geometry.mjs` is the spatial analog of the color & type engines: **`{ treatment, baseHeight }` → a
six-size ramp → derived control geometry → DTCG / CSS / Figma tokens.** Pure, no DOM, no RNG. It encodes ONE
law and TWO families; the verifier proves both on every change. Geometry is unforgiving the same way color is —
a pad hand-tuned to "look right", a density that leaks into the frame, or a font that nudges the box ships
un-centered controls that *look* plausible. This skill is the procedure + the gotchas + the gates. The
conceptual *why* is owned by `docs/spec/geometry/README.md` (de-staled — accurate to cite) and the
`design-skills:component-decomposer` skill's `references/geometry-system.md` — **cite them, don't re-derive.**

## THE ONE LAW (read first)

> **Edge padding for a glyph = (height − glyph) / 2.** Every glyph centers in a **square cell** of side = the
> control height. `padding-block` is `0`; **block-size (height) is the vertical lever, never block-padding.**

From that single rule fall out, mechanically: the slot pad `(height − icon)/2`, the slotless/bare-label edge
`round(height/2)`, the icon-only **square** `minWidth = height`, and the **pill radius** `round(height/2)`. The
`centering-law` block asserts `padding === (height − icon)/2` **exactly** (not a tolerance) for every size — it
is a derivation, not a fit. The `.control-{size}` CSS utility **embodies** it (block-size lever, padding-block
0, inline pad = the slotless `h/2`, pill radius).

## THE TWO FAMILIES — density rides the rhythm, never the frame

| Family | Scales with | Members | Density |
|---|---|---|---|
| **Frame** | the box **height** | `icon`, slot `padding`, `edgePadding`, `minWidth`, `radiusPill` | **density-invariant** |
| **Rhythm** | the **font** | `gap = font/2`, `caret = font` | density multiplies the rhythm **only** |

`density` (treatment knob: comfortable 1 · compact 0.75 · spacious 1.25 · touch 1.1 · pill 1) multiplies
**`gap` and only `gap`** (`gap = max(1, round((font/2)·density))`). **Scaling the frame would un-center the
glyph** — so density (and the type scale) must never touch it. Depth: `references/foundations.md` §3.

## THE RAMP — one power law, six samples

`SIZES = [XS 20, SM 24, MD 28, LG 36, XL 48, 2XL 64]` (heights) — **two bands** at the MD|LG seam (compact `+4`
linear below: 20·24·28, expressive `×4/3` geometric above: 36·48·64). The glyphs scale **sublinearly** (the
optical correction):

```
icon = 2.49·height^0.58  (roundEven)     font = 3.16·height^0.45 ≈ √h  (round)     caret = font
```

These reproduce the hand-tuned reference table to **±1px** — one rule sampled six times. `CANON_MD = 28`;
`baseHeight` scales the whole ramp by `baseHeight/28`. The reference ramp + the table are in
`references/foundations.md` §4.

## THE COMPOSITION — one number, two engines (the JOIN)

A control's **box** (geometry) and the **text in it** (typography) share one source of truth. The join is
`src/ui/model.mjs`:

```js
geometryScale(doc) = geomScale(doc.geometry, { typeScale: typeScale(doc.type) })
```

When `opts.typeScale` is supplied, `geomScale` reads `opts.typeScale.categories.UI` and each step's `font`
becomes the brand's **UI voice** at the matching step (XS→UI XS … 2XL→UI 2XL) instead of the power law; `caret
= font` and `gap = font/2` follow. **The FRAME is untouched**, so the centering law still holds; `typed`
reports it. The pure `geomScale(config)` (no opts) keeps the standalone power-law font. Depth + the worked
walkthrough: `references/foundations.md` §5 + `references/best-practices.md`.

## Map — what each export owns

| Export (`geometry.mjs`) | Owns |
|---|---|
| `geomScale(config={treatment,baseHeight}, opts={typeScale})` | the resolved scale `{treatment, label, density, radiusStyle, baseHeight, typed, sizes, radii, space}` |
| `buildSize(rawHeight, density, fontOverride)` | one ramp row — the LAW + the power law live here; `fontOverride` is the composition hook |
| `GEOMETRY_TREATMENTS` / `DEFAULT_GEOMETRY` | the 5 presets (`comfortable/compact/spacious/touch/pill`) = density + radiusStyle + baseHeight + spaceBase; default `{comfortable, 28}` |
| `geomTokensCSS` | `:root` custom props + the `.control-{size}` utility that embodies the law |
| `geomTokensDTCG` | W3C `dimension` tokens (`"{px}px"`) — size/radius/space groups |
| `geomTokensFigma` | DTCG `number` tokens (UNITLESS) under a `Geometry` collection → Figma FLOAT variables |

`RADIUS_LADDERS` (per style, `none·sm·md·lg`; `full 9999` added) and `SPACE_STEPS × spaceBase` (the `--space-*`
ladder — the gap **BETWEEN** components, a **separate concern** from control padding). Depth: `foundations.md`
§6–7.

## Procedure — change → check → fix → re-check

1. **Locate it.** A pad / centering / square / pill-radius bug → the LAW in `buildSize`. A ramp-shape / glyph
   / height bug → the power law in `buildSize` (and `SIZES`/`CANON_MD`). A density / gap bug → the rhythm in
   `buildSize`. A "control text ≠ brand font" bug → the COMPOSITION (`opts.typeScale` in `geomScale`, joined in
   `model.mjs` `geometryScale`). A treatment / radius-ladder / space bug → `GEOMETRY_TREATMENTS` /
   `RADIUS_LADDERS` / `SPACE_STEPS`. A token-shape bug → the matching `geomTokensX` emitter.
2. **Keep the law a derivation.** Never hard-code a pad — change the inputs (`height`/`icon`) and let
   `(height − icon)/2` fall out. Never add `padding-block` to center text. `roundEven` for height/icon, `round`
   for font/caret. (`references/best-practices.md`.)
3. **Keep density (and composition) out of the frame.** `density` multiplies `gap` only. `fontOverride`
   replaces `font` only. The frame (`height·icon·padding·edgePadding·radiusPill·minWidth`) must be identical
   across densities AND between composed/standalone — the gates compare exactly that.
4. **Constants are tuned, not arbitrary.** `2.49/0.58/3.16/0.45` reproduce the reference ramp to ±1px;
   `CANON_MD = 28` is the pivot. Don't retune without updating the test's `REF` table in the same change.
5. **Three emitters, one source.** A new per-size field in `buildSize` must be added to `geomTokensCSS`,
   `geomTokensDTCG`, `geomTokensFigma`, and the test — together. DTCG carries `px`; Figma is unitless.

## Validate (the gate — draft → check → fix → re-check)

Run the pure verifier first (on pass it prints a single summary line — `geometry PASS — the ramp, the
centering law, the two families, treatments, CSS + DTCG emit` — and `exit 0`; any failure lists the broken
asserts and `exit 1`), then the full suite:

```
node test/engine/geometry.mjs   # comment-delineated groups: treatments · reference-ramp · centering-law ·
                                # two-families · baseHeight-scale · fallback · radius/space · CSS · DTCG ·
                                # composition · Figma   (group names are labels for the test's comment blocks)
npm test                        # the above + ui/figma/exports + smoke gen (node test/run.mjs)
```

The verifier asserts the law `padding === (height − icon)/2` **exactly**, the power-law ramp (±1px vs the
hand table), the two families (density tightens `gap`, NOT `padding`), `baseHeight` scaling, the radius/space
ladders, all three emitters, and the **composition** (composed `font === typeScale.categories.UI[name].size`,
the frame untouched, the law still holding, a `bodyBase` change scaling the font). **Don't call it done until
`node test/engine/geometry.mjs` AND `npm test` are green.** Read the test before editing — its comment blocks
state what each group proves.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the pipeline, the centering law's derivations, the two families (why density skips the frame), the power-law ramp + reference table, the composition JOIN, treatments/ladders/space, the three emitters — the mental model the procedure assumes |
| `references/best-practices.md` | the non-obvious do/don't (law-is-a-derivation, density-rides-the-rhythm, constants-are-tuned, frame-untouched-by-composition, emitter-lockstep) + a worked walkthrough from the typography-composition history |
| `references/rubric.md` | score the change before calling it done — the centering law + the two families + the ramp + the composition are the gates |
| `docs/spec/geometry/README.md` | the reference token shape + the law + the table + the Figma export (de-staled — cite, don't copy) |
| `design-skills:component-decomposer` → `references/geometry-system.md` | the centering law's first principles + the WHY (the square cell, the forced asymmetric pad); its `bin/geometry-check.py` mechanizes the same law |

## Relation to sibling skills

- **`building-editor-sections`** owns the **Geometry UI section** (the editor pane that drives
  `doc.geometry`) — cite it for the section shell; this skill owns the ENGINE behind it.
- **`adding-export-formats`** cites `geomTokensDTCG`/`geomTokensFigma` for adding a geometry export — that skill
  owns wiring a new format into `FORMAT_GROUPS` + the download; this skill owns the emitter math.
- **`color-math`** (the perceptual color engine) and the type engine (`src/engine/type.mjs`, which has no
  dedicated skill yet) are the **siblings** — same shape (a few params → a systematic ramp → tokens). The
  composition JOIN ties geometry to type.