## Best practices — changing the geometry engine

The non-obvious do/don'ts (each a real trap in `src/engine/geometry.mjs`), then a worked walkthrough from the
composition history.

### The law is a derivation, not a fit — keep it that way

- **`padding` is `(height − icon)/2` — never a literal, never "close enough".** The `centering-law` test
  asserts EXACT equality (`sz.padding === (sz.height - sz.icon)/2`), and the composition test re-asserts it on
  the composed scale. If you ever feel like hand-tuning a pad to "look right", you have introduced a magic
  number — the right fix is to change `height` or `icon` (the inputs) and let the pad fall out. The pad is
  *forced*, not chosen.
- **`padding-block` is `0` and `block-size` is the only vertical lever.** The `.control-{size}` utility encodes
  this and the test greps for it (`block-size: var(--size-md-height)` … `padding-block: 0`). Never add a
  block-padding to center text vertically — that defeats the square cell. Vertical centering is the box height
  + line-height, not padding.
- **`minWidth === height` is the square floor.** Don't relax it to a smaller min — an icon-only control must be
  square or the single glyph won't center. The test pins `sz.minWidth === sz.height`.

### Density rides the rhythm, ONLY the rhythm

- **`density` multiplies `gap` and nothing else.** It is applied exactly once, inside `buildSize`:
  `gap = max(1, round((font/2)·density))`. Do **not** thread `density` into `icon`, `padding`, `edgePadding`,
  or `radiusPill` — the frame is geometric and density-invariant. The `two-families` test compares compact vs
  comfortable **at the same height** and asserts `gap` shrinks but `padding` is **identical**. A change that
  makes density move the frame breaks the centering law (the frame would rescale and un-center the glyph) and
  trips that gate.
- The `max(1, …)` floor on `gap` is load-bearing — at tiny fonts × low density the gap must never round to 0.

### The constants are tuned, not arbitrary — don't "tidy" them

- **`2.49`, `0.58`, `3.16`, `0.45` reproduce the hand-tuned reference ramp to ±1px.** They are the result of
  fitting the power law to the canonical `SIZES` table (20·24·28·36·48·64) and its hand-picked glyphs. The
  `reference-ramp` test checks the engine output against the hand table within ±1. A change to any exponent or
  coefficient that pushes a glyph past ±1 from the reference **breaks the gate** — and the swatches will still
  *look* plausible, so only the test catches it. If you must retune, update the `REF` table in the test in the
  same change and justify the new reference.
- **`roundEven` is for height and icon; plain `round` is for font/caret.** Even heights/icons keep glyphs crisp
  and slot pads integral (`(height − icon)/2` stays a whole number when both are even). Don't swap the
  rounders.
- **`CANON_MD = 28` is the ramp's pivot.** `factor = baseHeight/28` scales everything uniformly. Don't
  hard-code `28` elsewhere — read it from `CANON_MD`.

### Composition: the frame stays untouched

- **`fontOverride` may replace ONLY `font` (a rhythm member).** The composition's whole guarantee is that the
  box geometry (frame) is identical whether or not a type scale is supplied — the `composition` test asserts
  `composed.height === standalone.height && composed.padding === standalone.padding` for every step, **and** the
  law still holds on the composed scale. If you let the type scale influence `height`/`icon`/`padding`, the box
  would jump when the brand's type treatment changed, and the law could break. Keep the override surgical.
- **The join is `opts.typeScale.categories.UI`, matched by step name.** Geometry reads the UI voice
  (`uiSteps[name].size`) for XS…2XL. The UI category's `STEPS_UI` is a superset (it also has 3XS/2XS) — geometry
  matches by name and ignores the extras. Don't assume index alignment; key on the name.
- **The production caller is `model.mjs`'s `geometryScale(doc)`** — that is the ONE place the two engines are
  joined for the app/brandKit/exports, and `npm test`'s UI headless-boot suite gates it directly (it asserts
  the composed/brandKit `font` tracks the type UI voice). `geomScale(config)` with no opts is the pure
  standalone form (power-law font). If a bug report is "control text doesn't match the brand font", you are
  looking at the composition path (does the caller pass `opts.typeScale`?), not the power law.

### Three emitters, one source — add fields in lockstep

- **A new per-size field added to `buildSize` must be added to all three emitters and the test.**
  `geomTokensCSS` (custom prop + maybe the utility class), `geomTokensDTCG` (`dimension` token), `geomTokensFigma`
  (`number` token) all map over the same `scale.sizes` — miss one and the field is absent from that export.
- **DTCG is `dimension` (`"{px}px"`), Figma is `number` (unitless).** They are the SAME numbers; the only
  difference is the `px` suffix. Don't emit `px` in the Figma export — a Figma float variable is unitless, and
  the test asserts `typeof $value === "number"`.
- **The space scale is a separate concern from control padding.** `--space-*` (SPACE_STEPS × spaceBase) is the
  gap BETWEEN components. Don't fold it into the control's inline padding (the centering law) — they answer
  different questions.

### Determinism

- No RNG, no `Date`, no locale — pure math. `geomScale` must give identical output for identical input. If you
  add memoization, key it deterministically (the color/type engines key on `toFixed(2)`).

## Worked walkthrough — the typography composition (the JOIN), condensed

How the "control box and its text share one number" property was wired (the property the `composition` test
guards):

1. **Started from the standalone ramp.** `buildSize` derived `font = round(3.16·height^0.45)` — a self-contained
   power law. Good for a geometry-only export, but the control text then ignored the brand's actual typography.
2. **Added a surgical override, not a rewrite.** `buildSize` grew an optional `fontOverride` param; when present
   it replaces *only* `font`. `caret = font` and `gap = font/2` follow for free. Nothing else in `buildSize`
   touched — the frame derivations (`icon`, `padding`, `edgePadding`, `radiusPill`, `minWidth`) are computed the
   same way regardless, so the centering law is preserved by construction.
3. **Wired the source in `geomScale`.** `opts.typeScale.categories.UI` → `uiSteps[name].size` fed as the override
   per step (XS→UI XS … 2XL→UI 2XL). Added the `typed` flag so the scale self-reports whether it's composed.
4. **Joined the two engines in ONE place.** `model.mjs` `geometryScale(doc) = geomScale(doc.geometry,
   { typeScale: typeScale(doc.type) })`. Every caller (brandKit, the Geometry section, exports) goes through it,
   so a brand's type-treatment or `bodyBase` change moves the control text everywhere it's used.
5. **Pinned the invariant with TWO gates, not vibes.** The engine's `composition` test block asserts, per step:
   composed `font === ts.categories.UI[name].size`; `caret` follows; **height + padding (the frame) are
   identical to the standalone scale**; the centering law `padding === (height − icon)/2` still holds on the
   composed scale; and a larger type `bodyBase` scales the geometry `font` (proving the shared source of truth);
   `typed` is `true` composed / `false` standalone. The UI headless-boot suite then re-asserts it through the
   PRODUCTION caller (`geometryScale(doc)` + `brandKit(doc)`), so the join is gated end to end.
6. **Validated** — `node test/engine/geometry.mjs` (all blocks green), then `npm test` (all 14 files). The
   reference-ramp, centering-law, and two-families gates stayed green because the frame was never touched.