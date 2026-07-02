---
name: building-editor-sections
description: >
  Use when adding a new editor section, promoting a modal into a section, or
  adding a per-section canvas view/mode/table to the nonoun-color-tokens
  workbench editor. Covers the Color · Typography · Geometry pattern — canvas
  + left-analysis + right-inspector, this.section routing, tokenOverrides
  matrix, lettered headless + smoke tests.
---

# Building editor sections (nonoun-color-tokens workbench)

A **section** is one of the three systems of a brand-kit doc surfaced as a slice of the editor:
`this.section ∈ {color, typography, geometry}`. Each owns the same five-region shell — **App-Header
switcher** (which system) · **Left pane** (understand: read-only analysis) · **Center** (the full dataset
as the shippable artifact) · **Right pane** (control: the generative knobs + a live brand-true example) ·
shared canvas header/footer. Build a new section, or evolve one, by mirroring the Color/Type/Geometry
triplet — never invent a parallel shape. Depth in `references/`; this body is the map + the non-obvious.

## Anatomy (mirror these names)

| Region | Color | Typography | Geometry | Build |
|---|---|---|---|---|
| Center header | `renderCanvasHeader` | `renderTypeCanvasHeader` | `renderGeomCanvasHeader` | pane toggles · a view/mode segment · reused `fit`/scheme/zoom |
| Center canvas | `renderCanvasArea` | `renderTypeCanvas` | `renderGeomCanvas` | a `.canvas-area` + `.canvas-scene` (reuse `wirePanZoom` + `applyTransform`) |
| Center scene | `renderRampsScene` | `renderTypographyScene` | `renderGeometryScene` | the **FULL** dataset (not a curated subset), in the brand's real color/font/mode |
| Left analysis | `analysisCards` | `typeAnalysisCards` | `geomAnalysisCards` | `.an-card`/`.an-svg`/`legend()` — pure functions of the engine output, **no inputs** |
| Right inspector | `renderRightPane`(color body) | `renderTypeInspector` | `renderGeomInspector` | `.pane-head` segmented tabs + `.seg-body` + a pinned `.seg-example` live card |

## Procedure

1. **Route.** Branch `renderCenter(view)` → header + canvas + `renderCanvasFooter()`; `renderLeftPane`
   body → `<x>AnalysisCards(view)`; `renderRightPane` → early-return `render<X>Inspector(view)` (it returns
   the **whole** `.right-pane`). Add the section's tab to the App-Header switcher (`setSection`).
2. **Center = the full dataset.** Render every step/size/role in the brand's real fonts + colors + canvas
   scheme, in a pannable `.canvas-scene`. Today's value over a modal is that the **composition** is visible
   (e.g. a control's box and its text share one number: Geometry's `font` ← the Type UI scale via
   `geometryScale(doc)`). Add a header view/mode segment if useful (e.g. Specimen·Tokens, Controls·Tokens).
3. **Left = read-only diagnostics.** Pure functions of the resolved engine scale; reuse `.an-card`/
   `.an-svg`/`legend()`. **SVG line charts MUST set `fill: none`** on the path class, qualified so a shared
   series-color class can't override it (an open `<path>` fills by closing → wedge artifacts).
4. **Right = control + live example.** Writable controls bind **only** to the section's persisted doc
   fields (e.g. `doc.geometry = {treatment, baseHeight}`); engine-derived params are shown **read-only**
   (never fake an editable control the engine + persist can't carry — flag it out-of-scope instead). Pin a
   `.seg-example` that paints in the selected palette's roles.
5. **Lifecycle.** `setSection(id)` stashes/restores the color viewport, calls `this.fit()` for non-color,
   and lazy-inits (`ensureTypeFonts()`). `_liveRefreshNow()` **early-returns for non-color** (their panes
   refresh on full `render()`). If your section adds a Compare/multi-column scene, guard the partial
   refresh too (full-render that mode).
6. **Retiring a modal** (promoting it to a section): delete `open<X>`/`close<X>`/`_sync<X>`/`render<X>`, the
   `<x>Open` state, the `render<X>()` child in `renderEditor`, and the `dialog.<x>` + stub CSS. **KEEP** the
   download/export helpers; move the controls into the inspector. Grep for the removed names — leave no dead
   code (e.g. an orphaned `_<x>Sample`).

## The table view in the canvas (Mapping · Tokens matrix) — the data-grid variant

A canvas **mode** can render a DATA TABLE instead of the pannable scene. Color's **Mapping** and the
Type/Geom **Tokens** matrix both do this:

- **Flip to `.is-table`.** When the mode is active, render the `<table>` in a `.canvas-area … is-table`
  shell (scroll, NOT pan/zoom — no `wirePanZoom`), not the pannable `.canvas-scene` (see `renderCanvasArea`'s
  `isTable` branch + `_tokensTableArea`). Reuse `.map-table` (sticky `thead`, grouped rows, monospace `code`
  cells); pass the `--canvas-bg` for ground parity.
- **The Tokens matrix is a responsive MATRIX:** grouped per-step/per-size rows × **(Base + one column per
  breakpoint mode)** columns; sticky first column = the token name; each column carries the **real `modeKey`**
  (`"base"` or the mode id), not a constant. Build columns from `doc.{type,geometry}.modes`, not a name-only
  helper. `<th scope>` on a genuine 2-D matrix (col/row/colgroup).
- **Editable overrides — the per-cell lever (mirrors color `roleOverrides`).** One directive per frame:
  - **Write path.** Cells are number inputs that write `doc.{type,geometry}.tokenOverrides` — flat,
    keyed `<voice>|<step>|<modeKey>` / `<size>|<modeKey>`, attached only when non-empty (no override ⇒
    byte-identical doc).
  - **Engine param.** The pure engines take an optional `overrides` param; size/height is the lever
    (type keeps tracking+weight, geom re-derives via the laws).
  - **Centralize resolution** in `_typeScaleFor`/`_geomScaleFor` so the matrix, the specimen preview,
    AND every export (CSS `@media` · per-mode DTCG · Figma · MCP `brandKit`) read the SAME resolved
    scale — a missed export site is the classic bug.
  - **Clamp in the live setters** to the persisted range — the range literals are owned by
    `setTypeTokenOverride`/`setGeomTokenOverride` (`src/ui/app.js`), mirroring persist's
    `clampTokenOverrides`; an unclamped value diverges live-vs-persist and can yield negative geom padding.
  - **`deleteMode` hygiene.** Deleting a mode strips its stale `|<id>` override keys.
  - **Mode-local.** Base does not cascade into breakpoint columns — say so in a one-line UI hint.
- **Sticky headers (the scrollport gotcha):** for the `thead`/first-column to pin, the **table** must be
  `overflow: visible` — `overflow != visible` makes the *table itself* the sticky scrollport (so headers
  scroll away with it). The scroll lives on `.canvas-scene` (set its top padding to 0 so a sticky header
  sits flush; move the gutter to the inner wrap's margin). The table loses its `border-radius` (it needed
  `overflow:hidden` to clip). Verify with a CDP scroll probe (headers pin Δ0px); WebKit supports sticky on
  `<th>` in `thead` AND `tbody`, but it's a Safari-sensitive area — sanity-check there.

## Validate (draft → check → fix → re-check)

- `npm test` green — add a **lettered headless group** in `test/ui/headless-boot.mjs` (e.g. `(geo)`/`(cm)`)
  that drives `setSection(...)`/the mode control and asserts: the full-dataset markers + count, the
  analysis cards (`.an-card` ≥ 4), the inspector renders, the view/mode toggle, and round-trip back to
  Color. Keep the engine/persist/`brandKit`/composition/download assertions. The shim is **not** a real
  DOM — match by single class or `getAttribute`/`txtOf`, never a descendant selector / `.id` / `.textContent`.
- `npm run smoke` green + a screenshot leg — and **look at the screenshot** (Chrome-only; quote font names,
  reason about Safari from spec).
- Score the result against `references/rubric.md`.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the workbench principle, the doc→view→render data flow, the `h()`/render/`_sync` model |
| `references/best-practices.md` | the mechanics behind the body's rules (the fill:none selector, font-quoting, reuse-over-CSS, shim internals, retire-modal call sites) + worked walkthrough |
| `references/rubric.md` | score a built/evolved section before calling it done |

**Peers:** [[color-math]] · [[type-scale]] · [[geometry-system]] (the engines the sections host) ·
[[shipping-changes]].
