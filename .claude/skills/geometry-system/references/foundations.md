## Foundations — the model a geometry change leans on

The load-bearing ideas behind `src/engine/geometry.mjs`. If a change feels like it needs a new mechanism, you
are probably fighting one of these. The conceptual *why* is owned by `docs/spec/geometry/README.md` (the
de-staled reference shape) and the `design-skills:component-decomposer` skill's `references/geometry-system.md`
(the law's first principles) — this file is only the mental model the *procedure* assumes.

### 1. The pipeline — two parameters → a ramp → derived geometry → tokens

The spatial analog of the color (`{hue, chroma, distribution}`) and type (`{treatment, bodyBase}`) engines.
Geometry derives everything from **`{ treatment, baseHeight }`**:

```
config {treatment, baseHeight}
  → factor = baseHeight / 28              # CANON_MD; scales the whole ramp uniformly
  → for each SIZES row [name, h]: buildSize(h·factor, density, fontOverride)
      height = roundEven(rawHeight)        # the one free input per row; everything below is DERIVED
      icon   = roundEven(2.49·height^0.58) # frame family — the power law
      font   = fontOverride ?? round(3.16·height^0.45)   # rhythm family (≈ √h) OR the type UI voice
      caret  = font                        # rhythm — the affordance mark = text height
      gap    = max(1, round((font/2)·density))           # rhythm — density rides HERE, only here
      padding     = (height − icon)/2      # THE CENTERING LAW (slot edge)
      edgePadding = round(height/2)        # the slotless/bare-label edge
      radiusPill  = round(height/2)        # the one size-linked radius
      minWidth    = height                 # the 1:1 square floor
  → radii (ladder per radiusStyle) · space (SPACE_STEPS × spaceBase)
  → { treatment, label, density, radiusStyle, baseHeight, typed, sizes, radii, space }
```

`buildSize` is where the law lives. `geomScale(config, opts)` resolves the treatment, applies `factor`, and
loops the six `SIZES`. Pure, no DOM, no RNG — same input → identical output.

### 2. THE CENTERING LAW (the one law)

> **Edge padding for a glyph = (height − glyph) / 2.** Every glyph centers in a **square cell** of side = the
> control height. `padding-block` is `0`; **block-size (height) is the vertical lever, never block-padding.**

From that single rule fall out, mechanically:

- `padding` = `(height − icon)/2` — the **slot** edge (icon centered in a height² cell).
- `edgePadding` = `round(height/2)` — the **slotless** (bare-label) edge. Algebraically the text pad
  `½(h − font)` + the absent slot's gap `½·font` = `h/2` — that is why the two-term pad collapses to a single
  clean number.
- `minWidth` = `height` — an icon-only control is **exactly square** (the 1:1 floor); the glyph centers in it.
- `radiusPill` = `round(height/2)` — a fully-round control is a pill; the corner radius is half the height.

The `.control-{size}` utility class **embodies** the law: `block-size: var(--size-{s}-height)` (the lever),
`padding-block: 0`, `padding-inline: var(--size-{s}-pad-edge)` (the slotless `h/2`), `border-radius:
var(--size-{s}-radius)` (the pill). The test's `centering-law` block asserts `padding === (height − icon)/2`
**exactly** (not within a tolerance) for every size — it is a derivation, not a fit.

### 3. THE TWO FAMILIES — why density must not touch the frame

| Family | Scales with | Members | Density |
|---|---|---|---|
| **Frame** | the box **height** | `icon`, slot `padding`, `edgePadding`, `minWidth`, `radiusPill` | **density-invariant** |
| **Rhythm** | the **font** | `gap = font/2`, `caret = font` | density **multiplies the rhythm only** |

`density` (a treatment property: comfortable 1 · compact 0.75 · spacious 1.25 · touch 1.1 · pill 1) multiplies
**`gap` and only `gap`** — `gap = max(1, round((font/2)·density))`. It is deliberately kept out of the frame:
the frame is geometric (proportional to height), and **scaling the frame would un-center the glyph** — the slot
pad `(height − icon)/2` only centers the icon if neither side is rescaled. The `two-families` test block pins
this: at the **same** height, compact's `gap < ` comfortable's `gap`, but `padding` is **identical** (`density
does NOT change the frame padding`). If a change makes density move `padding`/`icon`/`radius`, the square
breaks and the law is violated.

### 4. THE POWER-LAW RAMP — one rule sampled six times

The six sizes are `SIZES = [XS 20, SM 24, MD 28, LG 36, XL 48, 2XL 64]` (control heights). This is **two bands
that change gear at the MD|LG seam**: compact band `+4` linear below (20·24·28), expressive band `×4/3`
geometric above (36·48·64 — 48 = 36×4/3, 64 = 48×4/3; the 28→36 seam jump is the gear change). `CANON_MD = 28`;
`baseHeight` scales the whole ramp by `baseHeight/28`.

The glyphs scale **sublinearly** — a power law of height with exponent < 1 (the optical correction: a glyph
occupies a *shrinking fraction* of the box as the box grows, so big controls don't get cartoonishly large
icons):

```
icon = 2.49 · height^0.58   (round to nearest EVEN — roundEven)
font = 3.16 · height^0.45   ≈ √height   (round to nearest int)
caret = font
```

These reproduce the hand-tuned reference ramp to **±1px**, so the table is not six hand-picked points — it is
**one rule sampled six times**, and it generalizes to any scaled `baseHeight`. The `reference-ramp` test block
checks the engine output against the hand table `REF` (icon ±1, font ±1, height exact) and that heights
strictly increase XS→2XL. The reference ramp (comfortable @ baseHeight 28):

| size | height | icon | caret | font | pad (slot) | edge (slotless) | radius (pill) |
|---|---|---|---|---|---|---|---|
| **XS** | 20 | 14 | 12 | 12 | 3 | 10 | 10 |
| **SM** | 24 | 16 | 13 | 13 | 4 | 12 | 12 |
| **MD** | 28 | 18 | 14 | 14 | 5 | 14 | 14 |
| **LG** | 36 | 20 | 16 | 16 | 8 | 18 | 18 |
| **XL** | 48 | 24 | 18 | 18 | 12 | 24 | 24 |
| **2XL** | 64 | 28 | 21 | 21 | 18 | 32 | 32 |

`roundEven` (`2·round(v/2)`) is used for **height and icon** — even pixel sizes keep glyphs crisp and slot pads
integral. `font`/`caret` use plain `round`.

### 5. THE COMPOSITION — one number, two engines (the JOIN)

The most important non-obvious property. A control's **box** (geometry) and the **text in it** (typography)
share a single source of truth. The join lives in `src/ui/model.mjs`:

```js
export function geometryScale(doc) {
  return geomScale(doc.geometry || DEFAULT_GEOMETRY, { typeScale: typeScale(doc.type || DEFAULT_TYPE) });
}
```

Inside `geomScale`, when `opts.typeScale` is supplied, it reads `opts.typeScale.categories.UI` and passes
`uiSteps[name].size` as the `fontOverride` to `buildSize` for each step — geometry `XS → UI XS … 2XL → UI 2XL`.
So each size's `font` becomes the brand's **Typography UI voice** at the matching step instead of the standalone
power law. Then `caret = font` and `gap = font/2` follow automatically.

Critically: **the FRAME is untouched** by composition. `fontOverride` only replaces `font` (a rhythm member);
`height`/`icon`/`padding`/`edgePadding`/`radiusPill`/`minWidth` are all computed before/around it, so the
centering law `padding === (height − icon)/2` **still holds on the composed scale**. The `composition` test
block proves all of this: composed `font === ts.categories.UI[name].size`, `caret` follows, height + padding
are **identical** to the standalone scale, the law still holds, and a bigger type `bodyBase` scales the control
`font` (shared source of truth). The `typed` flag on the returned scale reports whether the fonts came from the
type scale (`true` composed, `false` standalone).

> The UI category uses `STEPS_UI` (3XS·2XS·XS·SM·MD·LG·XL·2XL) — a **superset** of geometry's six steps. The
> join matches by name (`uiSteps && uiSteps[name]`), so geometry picks XS…2XL out of it and ignores 3XS/2XS.
> The pure `geomScale(config)` with no `opts` keeps the standalone power-law `font` (the spec sample is that
> pure output). `model.mjs`'s `geometryScale(doc)` is the **production caller** — and it IS exercised by
> `npm test`: the UI headless-boot suite (`test/ui/headless-boot.mjs` ~1362–1377) imports `geometryScale`,
> resolves it for the live doc, and asserts the composed `font === typeScale(...).categories.UI.MD.size`, the
> centering law on the resolved scale, AND that `brandKit(doc).geometry` shares that same UI font (one source
> of truth, all the way to the MCP). So both layers are gated — the engine's own `composition` block in
> `test/engine/geometry.mjs` and the production join in the UI suite.

### 6. TREATMENTS, RADIUS LADDERS, SPACE — three separate concerns

`GEOMETRY_TREATMENTS` (5, ids `comfortable · compact · spacious · touch · pill`) each carry **four** knobs:
`density` (multiplies the rhythm), `radiusStyle` (picks a ladder), `baseHeight` (the default MD height, can be
overridden by `config.baseHeight`), and `spaceBase` (the layout-spacing unit). `DEFAULT_GEOMETRY =
{ treatment: "comfortable", baseHeight: 28 }`. An unknown treatment falls back to `GEOMETRY_TREATMENTS[0]`.

`RADIUS_LADDERS` (flat `none·sm·md·lg` per style) — `sharp [0,2,4,6]`, `soft [0,4,8,12]`, `round [0,8,12,16]`,
`pill [0,8,12,16]`. `radii` adds `full: 9999` (the CSS-pill literal). This named ladder is **separate** from the
control's own `radiusPill` (`height/2`, the per-size pill corner) — the ladder is for arbitrary surfaces
(cards/menus), `radiusPill` is the control's corner.

`SPACE_STEPS = [0,1,2,3,4,6,8,12,16,24]` × `spaceBase` → the `--space-*` layout scale (page gutters, card/stack
gaps, section rhythm). This is the space **BETWEEN** components — a **distinct concern from control padding**
(the centering law, which is the space *inside* one control). Conflating them is the classic confusion.

### 7. THREE EMITTERS — same numbers, three shapes

- **`geomTokensCSS(scale)`** — `:root` custom props (per-size `height/icon/caret/font/gap/pad/pad-edge/
  radius/min`, the radius ladder, the space scale, `--density`) **plus** a `.control-{size}` utility class per
  size that **embodies the law** (block-size lever, `padding-block: 0`, inline pad = the slotless `h/2`, pill
  radius). The CSS test checks the custom props exist and that `.control-md` carries `block-size:
  var(--size-md-height)` with `padding-block: 0`.
- **`geomTokensDTCG(scale)`** — W3C-DTCG **`dimension`** tokens (`$type: "dimension"`, `$value: "{px}px"`): a
  `size` group (one composite per step), a `radius` ladder, a `space` scale. The DTCG test checks the three
  groups and that values are `dimension` with a `px` suffix.
- **`geomTokensFigma(scale)`** — the **same numbers as DTCG, minus the `px`** — DTCG **`number`** tokens
  (`$type: "number"`, unitless numeric `$value`) under a top-level **`Geometry`** collection (size/radius/space
  groups). A Figma variable importer turns these into native **FLOAT (number) variables** you bind to
  auto-layout sizing, corner radius, and gaps (px is 1:1 with Figma's unitless floats). The Figma test checks
  the `Geometry` wrapper and that values are `number` with numeric `$value`.

All three map over the **same** resolved `scale`, so a new field added to `buildSize` must be added to all three
emitters (and the test) to surface everywhere.