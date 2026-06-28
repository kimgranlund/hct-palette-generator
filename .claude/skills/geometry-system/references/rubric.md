## Rubric — a geometry-engine change

Scores a change to `src/engine/geometry.mjs` (and the composition join in `src/ui/model.mjs`). `[gate]` =
mechanically checkable (a `test/engine/geometry.mjs` comment block / `npm test`); `[review]` = judgment with
cited evidence. The verifier prints one summary PASS line, not per-group output — the group names below are
descriptive labels for its comment-delineated `{ … }` blocks (read them; each block's asserts say what it
proves). Score each 1–5.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| G1 | The centering law | [gate] | `padding === (height − icon)/2` EXACTLY for every size; `edgePadding === round(height/2)`; `radiusPill === round(height/2)`; `minWidth === height`; `0 < icon ≤ height` (`centering-law` block) | 1: any pad is a literal / off / a tolerance crept in, or `padding-block` ≠ 0 in `.control-*` · 3: law holds for the standalone scale · 5: holds standalone AND on the composed scale, exact equality |
| G2 | The two families (density discipline) | [gate] | `caret === font` at every size; compact `gap` < comfortable `gap` at the **same** height; `padding` **identical** across densities (`two-families` block) | 1: density moves the frame (padding/icon/radius) or `caret ≠ font` · 3: gap responds to density, frame invariant · 5: + `gap` floor (`max(1,…)`) holds at tiny font × low density |
| G3 | The power-law ramp | [gate] | engine output matches the hand-tuned `REF` table within ±1 (icon, font) and height exact; heights strictly increase XS→2XL; `baseHeight` scales the whole ramp (the `reference-ramp` + `baseHeight-scale` comment blocks — the latter compares baseHeight 28 vs 40) | 1: a glyph drifts > 1px from the reference, or heights non-monotonic, or baseHeight doesn't scale · 3: reference reproduced at baseHeight 28 · 5: + holds at scaled baseHeights (28 and 40 both green) and roundEven/round used correctly |
| G4 | The composition (the JOIN) | [gate] | composed `font === typeScale.categories.UI[name].size` per step; `caret` follows; **frame (height + padding) untouched** vs standalone; law still holds composed; bigger `bodyBase` scales the font; `typed` true only when a type scale is supplied (`composition` block; the production join is re-gated in the UI headless-boot suite) | 1: composition moves the frame, or font doesn't track the UI voice, or `typed` mis-set · 3: font tracks UI voice, frame untouched · 5: + a `bodyBase` change scales the control font (shared source of truth proven) and the join in `model.mjs` is the single caller (gated through `brandKit` too) |
| G5 | Treatments + ladders + space | [gate] | 5 treatments (`comfortable/compact/spacious/touch/pill`), each with `density`+`radiusStyle`+`baseHeight`; unknown treatment → first; radius ladder monotonic `sm≤md≤lg`, `none 0`/`full 9999`; space scale starts 0 + monotonic (`treatments`/`radius`/`space` asserts) | 1: a treatment missing a knob, ladder non-monotonic, space not from `SPACE_STEPS×spaceBase`, or no fallback · 3: all present + monotonic · 5: + space kept distinct from control padding (separate concern, not folded in) |
| G6 | Emitter parity | [gate] | CSS custom props + a `.control-{size}` utility that embodies the law; DTCG `dimension` (`px`) size/radius/space groups; Figma `number` (unitless) under a `Geometry` collection (`CSS`/`DTCG`/`Figma` blocks) | 1: a field present in `buildSize` missing from an emitter, or Figma emits `px`, or `.control-*` lacks the law · 3: all three emitters carry the existing fields · 5: + a NEW field added to all three + the test in lockstep |
| G7 | Engine discipline | [review] | the change edits the OWNING file (`geometry.mjs`); the composition join stays in `model.mjs`; constants (`2.49/0.58/3.16/0.45`, `CANON_MD 28`) left as-is unless the `REF` table is updated with it; `roundEven` for height/icon, `round` for font/caret; pure (no DOM/RNG/clock) | 1: a pad/glyph hard-coded, a constant retuned without updating `REF`, density threaded into the frame, or impurity introduced · 3: right file, constants intact, pure · 5: + surgical (frame untouched by font changes), deterministic |

**Gate to ship:** G1, G2, G3, G4 must each score ≥ 3 — `node test/engine/geometry.mjs` green (all blocks) AND
`npm test` green. A change that breaks the centering law (G1), lets density touch the frame (G2), drifts the
ramp past ±1 from the reference (G3), or lets composition move the frame / break the UI-voice link (G4) is not
done regardless of how the controls look.

**Top failure to look for first:** **density (or composition) leaking into the FRAME** (G1/G2/G4). The frame
(`height·icon·padding·edgePadding·radiusPill·minWidth`) is geometric and must stay invariant to both `density`
and the type scale — only the rhythm (`gap`, `caret/font`) responds. A change that "tightens the control" by
shrinking `padding` with density, or that lets the brand font nudge the box, un-centers the glyph and silently
violates `padding === (height − icon)/2`. Compare compact vs comfortable at the SAME height (frame must match)
and composed vs standalone (frame must match) before calling it done — both are exactly what the `two-families`
and `composition` test blocks check.