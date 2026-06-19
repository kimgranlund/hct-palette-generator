# CHANGELOG

## 1.18 — 2026-06-18 — ramp distribution modes (even / perceptual / peak); default → perceptual

A new global control **`toneMode`** picks how stops map to lightness, fixing the near-white "dead zone"
that low-chroma/light-cusp ramps showed at the light end:

- **even** — the classic CIELAB-L\* curve (`toneAt`). Per-stop tone is the same L\* for every hue; the
  Curve/Tension/skew/lift/relChroma controls and the L\*-fidelity guarantees apply here. (Old default.)
- **perceptual** *(new default)* — even steps in OKHSL's perceptually-uniform lightness + gamut-proportional
  chroma, via the OKHSL module (now wired in). Every stop is distinct (no dead zone) AND — because the
  lightness step is the same for all hues — stop-N stays tone-aligned across palettes, so the semantic
  layer is unaffected.
- **peak** — like perceptual but the hue's CUSP (peak chroma) is anchored at stop 500, each half spread
  from there (Tailwind-style "the color is 500"). Vivid/centered; this is the only mode that trades away
  cross-palette tone alignment, by design.

Engine: `okhslStops` in `tonal.js` (lightness keyed off the STOP NUMBER so the 19-stop display and 25-stop
export ramps agree; lmin/lmax bound the range, damp/dampCurve/dampAmp/dampBias still shape chroma; 050 stays
pure white at lmax=100). Threaded through `controlsOf`/`stateOf`/`defaultDocument` (model.mjs), persisted
(`persist.js` enum, default perceptual), UI select in Global → "Distribution" (Curve greys out off `even`).
`okhsl.js` registered in the bundler.

Because the default flipped, ALL default palettes, the 48 travel presets, and the embedded theme re-render to
the perceptual distribution (presets' `lift`-anchoring is an even-mode feature and is now inert for them).
Tests: `tonal.mjs` CIELAB gates pinned to `even`, new `okhsl-modes` gate (in-gamut, all-distinct, monotone,
white/black ends, display/export stop-consistency, peak-centered); persist roundtrip + headless-boot `(hh)`
updated.

## 1.17 — 2026-06-18 — remove the duplicate Contrast panel from the right-pane Inspector

The Inspector's "Contrast (prime fill 550)" panel duplicated the left-pane analysis card
("Contrast — on-colors vs fills"), which already shows the same on-color/white/black ratios (as bars).
Removed it from `renderPaletteInspector`: dropped the panel, its now-unused `renderContrast` method +
`cr` lookup, and the dead `.contrast-box` CSS. The left-pane card is the single home for contrast.
`src/ui/app.js` + `styles.css`; headless-boot `(rp)` guards against the panel returning.

## 1.16 — 2026-06-18 — OKHSL ⇄ sRGB engine module (Option B foundation; not yet wired)

Adds **`src/engine/okhsl.js`** — Björn Ottosson's OKHSL ⇄ sRGB (perceptual HSL over OKLab), ported
VERBATIM from the canonical reference (`bottosson.github.io/.../colorconversion.js`). `okhslToRgb(hueDeg,
s, l)` and `rgbToOkhsl([r,g,b])`, pure/deterministic. OKHSL is gamut-bijective: at a given (hue, lightness)
`s=1` lands exactly on the sRGB boundary and a fixed (s,l) reads as the same perceived colorfulness across
hue — the principled version of the relChroma "gamut" basis.

Verified during the port against the reference: forward output matched **0/255 channel error over 1008
samples**, round-trip rgb→okhsl→rgb is exact, sRGB red sits at the canonical `h≈29.23° s≈1 l≈0.568`. New
`engine/okhsl.mjs` gate (10th test file): round-trip, gamut bijection (`s=1` on the boundary, every hue),
monotone saturation, neutrals/extremes, and the red anchor.

**Finding (informs whether to wire it):** re-saturating the default palettes through OKHSL produces output
**very close to the cheap relChroma "gamut" mode** (e.g. Primary 500: OKHSL `#1364CE` vs relChroma
`#1962CD`). The module is NOT yet integrated into the generation pipeline — that's the next decision, now
that we can see the two approaches land in nearly the same place.

## 1.15 — 2026-06-18 — Download-All export named nonoun-color-tokens-{project}

The "Download All" archive and its inner re-importable config still carried the old `hct-` slug.
`downloadAllZip` now names the archive **`nonoun-color-tokens-{slug}.zip`** (was `hct-{slug}-export.zip`)
and the config **`nonoun-color-tokens-{slug}-config.json`** (was `hct-{slug}-config.json`), matching the
package / repo / build-artifact identity. `{slug}` is the existing `slug(doc.name)` (lowercased/hyphenated).
Import reads file content, not the name, so re-import is unaffected. `src/ui/app.js`; headless-boot `(ee)`
assertions updated.

## 1.14 — 2026-06-18 — a new palette ("+ Palette") starts from clean shaping defaults

`addPalette` seeded each new palette with `skew: -20` — a non-default shaping tweak that quietly carried
into every palette you added. A new palette now resets ALL shaping config to neutral (`skew: 0`, `lift: 0`,
`hueShift: 0`, `hueSameDir: false`); only the `hue: 200 / chroma: 60` seed defines it. New *sets* already
reset everything (`createSet` → `defaultDocument` → `DEFAULT_CONTROLS`); global controls stay doc-level and
shared across a set's palettes (resetting them would alter the existing palettes), so they're untouched.
`src/ui/app.js`; headless-boot `(add)` now asserts the new palette's neutral defaults.

## 1.13 — 2026-06-18 — relative-chroma mode: harmonize palette saturation across hue (Option A)

A new global control **`relChroma`** (UI: Global → "Chroma basis" · peak ⇄ gamut; default **off**, so
the existing output is byte-identical — guarded by the tonal `rel-chroma` gate (c)). It changes what
the per-palette chroma slider means:

- **peak** (default): chroma is `% of each hue's PEAK` chroma — per-hue, but a hue's ABSOLUTE chroma
  still depends on its gamut, so different hues come out unequally saturated.
- **gamut** (`relChroma`): chroma is `% of EACH STOP's own gamut ceiling`, so every hue fills the same
  fraction of its gamut envelope → palettes read as equally saturated **regardless of hue** (a high-gamut
  blue is reined in to match a lower-gamut hue). A cheap stand-in for OKHSL-style perceptual-saturation
  normalization — one branch in `paletteStops`, no new color-space math.

Pipeline: `DEFAULT_CONTROLS.relChroma` (tonal.js) → `controlsOf`/`stateOf`/`defaultDocument` (model.mjs)
→ `paletteStops` chroma branch → persisted (`persist.js` hydrate, boolean) → UI toggle. Engine-only
behavior; exports/roles/stops unchanged. New tonal `rel-chroma` gate proves in-gamut, the cross-hue
harmonization invariant (`chroma/maxc` equal across hues at each stop), off==default, and not-a-no-op;
persist roundtrip covers the new field.

## 1.12 — 2026-06-18 — rename the held-back STORAGE_KEY + `<hct-app>` element (follow-up to 1.11)

Per follow-up, two of 1.11's held-back identifiers are now renamed:

- **`STORAGE_KEY`** `"hct-palette-state-v1"` → `"nonoun-color-tokens"` (so the live keys become
  `nonoun-color-tokens-sets` / `nonoun-color-tokens-project`). A one-time `migrateStorageKeys()` runs at
  boot, copying any sets/config saved under the OLD keys into the new ones — idempotent, and tolerant of
  a throwing localStorage — so a returning user keeps their saved palettes.
- **Custom element** `<hct-app>` → `<nonoun-color-tokens>` across the `customElements.define`, the
  markup (`main.ts`, `index.html`, the single-file build), the CSS selectors, the Figma UI bridge's
  `querySelector`, both tests, and the README. The internal theme-`<style>` id `hct-app-theme` →
  `nonoun-color-tokens-theme` rode along for consistency.

Left as-is (still HCT, by design): the spec-cell id `spec.system.hct-palette-generator-spec`, the
`hct-semantic-binder` sub-plugin, the engine symbols (`hctToRgb`…), and the internal `HctApp` class name
("HCT" = the color model). No engine/token/role/export behavior change.

## 1.11 — 2026-06-18 — rename product identifiers + git repo → nonoun-color-tokens

Aligns the build/package/repo identifiers with the product name and the renamed folder:

- `package.json` `name` → `nonoun-color-tokens` (+ description).
- Figma plugin `manifest.json` `id` → `nonoun-color-tokens` (note: Figma keys a plugin by `id`, so a
  prior dev import registers as a separate plugin; re-import is harmless).
- Build artifact `dist/hct-palette-generator.html` → `dist/nonoun-color-tokens.html`, lockstep across
  `bundle.mjs`, `gen-figma-ui.mjs` (reads the bundle), `pages.yml` (publishes it), and the doc refs
  (decision-records, parity-checklist).
- README title → "Color Tokens by NONOUN"; CI/demo badge + Pages URLs → the renamed repo.
- **GitHub repo** renamed `hct-palette-generator` → `nonoun-color-tokens` (GitHub keeps a redirect from
  the old URL; the local remote was updated).

**Deliberately NOT renamed** (each has a real reason — flagged for a follow-up call):
- `STORAGE_KEY = "hct-palette-state-v1"` (+ its `-sets` / `-project` derivatives) — renaming orphans
  every saved palette in users' localStorage. Keep, or rename WITH a one-time migration. *(Subsequently
  renamed with a migration in 1.12.)*
- The spec-cell id `spec.system.hct-palette-generator-spec` (SKILL `name:`, decomposition, the TDD doc)
  — the engine/methodology identity; "HCT" is the color model the engine is built on.
- The Figma binder sub-plugin (`hct-semantic-binder` / "HCT Semantic Binder") — a separate tool.
- The HCT engine symbols (`hctToRgb`, …) and the `<hct-app>` custom element — "HCT" names the color
  space. *(The `<hct-app>` element was subsequently renamed in 1.12; the engine symbols stay.)*

No engine/token/role/export behavior change.

## 1.10 — 2026-06-18 — gallery: "Your Palettes" updated-time becomes a preview tag

The relative updated-time (`ago(rec.updated)`) on your own gallery tiles moves out of the meta row
into the preview overlay — the same bottom-right slot a preset tile uses for its `preset` badge
(reusing `.tile-tag.tile-preset`). Count stays bottom-left, delete stays top-right (no collision),
and the meta row keeps just the name, matching the preset tiles' layout. Renders uppercase
(`2H AGO`) like the other tile tags. UI-only — `src/ui/app.js` (`buildTiles`).

## 1.9 — 2026-06-18 — branding: "Color Tokens by NONOUN" + NONOUN favicon / logo mark

The running app is now branded **Color Tokens by NONOUN** (the codebase / spec keep the internal
"HCT Palette Generator" name — this is product-surface branding only):

- **Title** set on `index.html`, `src/ui/index.html`, and the single-file `bundle.mjs` build.
- **Favicon** from `public/favicon/` wired: `index.html` gets the full `<link>` set (svg / png / ico /
  apple-touch / manifest); the offline bundle inlines `favicon.svg` as a base64 data URI (self-
  contained, no request); `site.webmanifest` fixed (placeholder name → the product name, and the
  broken `/favicon.ico/…` icon paths → `/favicon/…`).
- **Brand mark** — the old accent `◆` is replaced by the NONOUN "N" logo via a new `brandMark()` in
  `icons.js` (a 512-viewBox currentColor glyph; the favicon's `:root` invert `<style>` is intentionally
  dropped for the inline mark so it can't invert the page). Gallery header reads "◇ Color Tokens by
  NONOUN"; the compact editor header reads "◇ Color Tokens".
- **Figma plugin** `manifest.json` name → "Color Tokens by NONOUN" (the plugin test asserts shape, not
  name, so this is safe).

UI/branding only — no token/role/export/persistence change. `(ff)` still passes (keys off `.brand-link`).

## 1.8 — 2026-06-18 — editor: retune the backdrop / container stops (125 bg · 75 container)

Adjusts the two canvas tints introduced in 1.7 (`app.js`, UI-only):

- Canvas **backdrop** (`canvasBg`): the selected palette's **125** stop in light preview, **875** in
  dark (was 100/900).
- Palette **container** rows (`containerBg`): the palette's **75** stop in light, **925** in dark
  (was 150/850).

Both are now read from **`fullRamp`** (the 25-stop EXPORT set), since 75/125/875/925 are EXPORT-only
half-steps absent from the 19-stop display `ramp` — so the tints resolve regardless of the Core/All
stops mode. The dark mirrors (875, 925) keep the row's `var(--ink)` name text readable on the tint.
Note the figure-ground vs 1.7: the container (75) is now LIGHTER than the backdrop (125) in light
preview (cards lift as lighter panels), mirrored in dark. headless-boot `(j)` updated to the new
stops + `fullRamp` lookups.

## 1.7 — 2026-06-18 — editor: palette-container tint (150/850) + click-empty-canvas to deselect

Two canvas-navigator tweaks (`app.js`, UI-only — no token/export/persistence change):

- **Container tint.** Each palette ROW (`.ramp-row`, both the Palettes and Scrims scenes) is now
  washed with that palette's OWN near-edge tone via `containerBg(vp)` — its **150** stop in light
  canvas preview, **850** in dark (symmetric, mirroring `canvasBg`'s 100/900). Tracking `canvasTheme`
  matters: the row name is `var(--ink)`, which resolves per the canvas-area's `color-scheme`, so a
  fixed light 150 in dark preview would put light text on a light card. Returns `""` if the stop is
  absent, so the theme-aware CSS default holds.
- **Click empty canvas → deselect.** A plain click on the empty canvas (not a `.ramp-row`, not a
  pan-drag) calls `_deselect()` (`kind:"none"`). `canvasBg()` now guards on `sel.kind === "palette"`,
  so with nothing selected the backdrop reverts to the DEFAULT neutral gray instead of a palette
  near-edge color. Re-selecting restores the near-edge backdrop.

headless-boot `(j)` extended: `(j6/j6b)` empty-canvas click → `kind:none` + neutral backdrop, `(j7)`
re-select restores the near-edge, `(j8/j8b)` the row tint = the palette's 150 (light) / 850 (dark) stop.

## 1.6 — 2026-06-18 — UI icons → a central SVG registry (Phosphor, inlined offline)

Replaced the ad-hoc emoji/Unicode glyph "icons" (↶ ↷ ⇪ ⊹ ▌ ▐ ◐ 🗑 ↺ ↻ ⇄ ⧉ ⚙ ◳ ⬇ ⬆ ⚑ ✕
+ the ●/○ enable dots, the ✓/⚠ contrast marks, the ✓/✗ in-gamut + save-status marks) with a
single registry: **`src/ui/icons.js`** holds Phosphor Icons (MIT, regular weight) path data
**inlined** — NOT a runtime CDN, because the Figma plugin ships `ui.html` as a self-contained
offline bundle (a CDN would silently fail there). `icon(name, { size, cls })` returns a
`<span class="ic">` wrapping an inline `<svg fill="currentColor">`, so every icon inherits the
surrounding text color and aligns on the baseline; the right-pane sidebar toggle reuses the same
glyph mirrored via `.ic.flip-x`.

Wiring: `icons.js` registered in `scripts/bundle.mjs` (MODS+KEY) so the offline/Figma builds
include it; app.js imports `{ icon }`. The ◆ brand wordmark and purely typographic glyphs
(`·` separators, `…`, the `×` in "L\*×C", the `−`/`°` in numeric labels, the `→` in labels) stay
as text. UI-only — no token/role/export/persistence change. `src/ui/app.js` + `styles.css`
(`.ic`); headless-boot `(ic)` asserts the toggles/header/canvas controls render registry SVGs.

## 1.5 — 2026-06-18 — gallery: palette-count + "preset" become overlay tags on the preview

The gallery tile's palette count (`N palettes`) and the presets shelf's `preset` badge now ride
the preview strip as **tags** (overlaid pills) instead of sitting in the meta row below. The count
gets the same pill treatment as the preset badge — a shared `.tile-tag` (translucent dark scrim +
white text, `pointer-events:none` so the tile button still takes the click), both **bottom-justified**:
count bottom-left, `preset` bottom-right. The delete button (your own sets) moves out of the meta row
to **overlay the preview top-right** as a scrim circle (interactive — keeps its click + stopPropagation;
turns `--danger` on hover). The meta row keeps the name (+ timestamp). UI-only — no data/export change;
the `.set-tile.preset` class is unchanged so the `(hh)` preset tests still key off it.
`src/ui/app.js` (`buildTiles`/`buildPresetTiles`) + `styles.css` (`.tile-tag`, `.set-thumb .del`).

## 1.4 — 2026-06-18 — canvas backdrop uses the 100 / 900 near-edge stop (was 050 / 950)

The editor canvas preview backdrop (`app.js#canvasBg`) now samples the selected palette's **100**
stop in light preview and **900** in dark, one step in from the 050/950 extremes. At `lmax=100`
the 050 stop is pure white (and 950 near-black at `lmin=0`), washing the backdrop neutral; the 100/
900 stop always carries a touch of the palette's hue/tint. UI-only preview — no token/export change.
`src/ui/app.js`; headless-boot `(j)` updated (now also asserts the lmax=100 backdrop is not pure white).

## 1.3 — 2026-06-18 — editor: collapsible side panes (left analysis / right inspector)

The editor's two side panes can now be collapsed to reclaim canvas width. A `pane-toggle` per
side (`▌` left, `▐` right) and the `[` / `]` keyboard shortcuts flip ephemeral `panesLeft` /
`panesRight` ui-session state; the `.editor` grid drives the matching side track to `0` via
`.left-collapsed` / `.right-collapsed` (animated, both panes already clip).

Each toggle **moves with state** (`paneToggle(side)` renders the same control in one of two slots,
so exactly one exists per side): while its pane is OPEN it hugs that pane's own header inner edge
(left → the Analysis label; right → left of the Inspector tabs); once COLLAPSED it pops to the
canvas-header (left edge / right edge) so there's always a visible affordance to bring the pane
back. `aria-pressed` + `.on` track "pane shown".

A collapsed pane now clips to a TRUE 0 width: the panes are grid items, whose default
`min-width: auto` (= content min-content) kept a collapsed pane from shrinking below its cards'
width, so they overflowed the 0 track and bled into the canvas. Fixed with `min-width: 0` on the
panes + a collapse-state `padding/border` reset (border-box can't compress those into a 0 width).

UI-only — no State field, no persistence, no token/role/collection change. `src/ui/app.js` +
`styles.css` (`.pane-toggle`, `.pane-head`, the collapse clip); headless-boot `(ii)` covers the
toggles, their header↔canvas-header placement per state, the keys, and the type-target guard.

## 1.2 — 2026-06-18 — scrim STRENGTH ladder → sequential 5–60% (was full-range 5–95%)

The 7 scrim-strength roles now map weakest→strongest to `50/100/200/300/400/500/600`
(**5/10/20/30/40/50/60%**), a sequential ladder, replacing the 1.0 full-range `50/100/200/400/600/800/950`
(5–95%). 4 refs changed: `scrim 400→300`, `scrimStrong 600→400`, `scrimStronger 800→500`,
`scrimStrongest 950→600`; `scrimWeakest/Weaker/Weak` stay `50/100/200`.

The **emitted** `SCRIM_STEPS` (11 steps) is UNCHANGED — `500-700/800/900/950` are still exported as raw
primitives but now bind to no strength role. `outline` (`500-600`) now coincides with `scrimStrongest`
(`500-600`) — allowed (as it did pre-1.0 at `500-550`); nudge if undesired.

Lockstep: `src/engine/semantic.js` (`SCRIM_STRENGTH_STEPS`), `data/role-table.json` (the 4 refs),
`figma/binder/figma-semantic-binder/code.js` (hardcoded copy — caught by the binder `parity` guard),
`knowledge-03`; regenerated `figma-plugin-assets.js` + `ui.html`. No emitted-token or collection change.

## 1.1 — 2026-06-18 — semantic variable collection renamed `Semantic` → `semantic-colors`

Both Figma plugin runtimes now create the semantic variables in a collection named
**`semantic-colors`** (was `Semantic`), matching the `raw-colors` collection naming. Updated:
`figma/plugin/code.js`, `figma/binder/figma-semantic-binder/code.js`, `test/figma/plugin.mjs`
(the collection-name assertions), and `knowledge-05`/`SKILL`; regenerated `figma-plugin-assets.js`
+ `figma/plugin/ui.html`. No role/ref/token change.

> Migration note: re-applying on a file that already has a `Semantic` collection from a prior run
> creates a NEW `semantic-colors` collection and leaves the old one orphaned (the prune only manages
> the collection the plugin creates) — delete the old `Semantic` collection by hand.

## 1.0 — 2026-06-18 — scrim ramp → 11 even steps (5–95%); strengths span the full range (CONTRACT change)

The scrim translucency ramp changed from 7 clustered steps (`100/175/250/300/400/450/550` = 10/17.5/25/30/40/45/55%)
to a clean **11-step even ramp**: `SCRIM_STEPS = [50,100,200,300,400,500,600,700,800,900,950]` = the 500 color at
**5/10/20/30/40/50/60/70/80/90/95%**. This DECOUPLES two things the code conflated:

- **Emitted raw scrim primitives** (`exports.js` `SCRIM_STEPS`, `role-table.json` constants) — now all **11** steps.
- **The 7 semantic scrim STRENGTH roles** (`semantic.js` `SCRIM_STRENGTH_STEPS`) — bind to a 7-step **subset**
  spanning the full range: weakest→strongest = `50/100/200/400/600/800/950` (5→95%). Steps `500/700/900` are
  emitted as raw primitives but carry no strength role.

Role remaps (visible tokens): the 4 disappearing steps (175/250/450/550) forced remapping the 12 scrim-using roles —
`outline 550→600`, `container 175→200`, `containerHigh 250→300`, and the strengths as above; `outlineVariant 400`,
`containerLow 100`, `scrim 400`… resolved to valid emitted steps. (`outlineVariant`/`containerLow` unchanged.)

Folded in lockstep: `data/role-table.json` (constants `SCRIM_STEPS` + the 10 changed role refs), `src/engine/exports.js`
(emitted set + the constants are now exported), `src/engine/semantic.js` (the strength loop now uses
`SCRIM_STRENGTH_STEPS`; outline/container literals), `src/ui/model.mjs` (`tokenCount` now derives the scrim count from
the engine constants — the stale `3 * 7` is gone), and the prose (`knowledge-03/04`, `glossary`, the `hpg-export-padding`
contract example). The verifiers read `SCRIM_STEPS` from `role-table.json`, so the contract change propagates.

Gate: `npm test` green (9 verifiers + headless boot). No criterion text changed — `hpg-semantic-roles` (still exactly 7
strengths), `hpg-semantic-refs-canonical` (every ref still resolves; all role steps ∈ EXPORT_STOPS), and
`hpg-export-padding` still hold.

## 0.9 — 2026-06-17 — OD-004 spike: the aliased-export SHAPE is gated (no behavior change)

The `rawColl` opt-in already emitted the full documented name+collection alias shape
(`com.figma.aliasData` = `{ targetVariableName: "{n}/{refKey}", targetVariableSetName: rawColl }`),
but only `targetVariableName` was verified. The export verifier now also asserts
`targetVariableSetName === "raw-colors"` on **every** aliased semantic leaf, so the shape Figma's
documented `aliasData` fallback hierarchy resolves on native import (when the raw-colors collection
pre-exists) can no longer silently regress.

Folded in lockstep: `hpg-export-resolved` (SKILL contract) + `AC-X6` (rubric) +
`test/engine/exports.mjs` (verifier). **No engine/output change** — the tool already emitted this
shape; this revision is verification + honest status only.

**OD-004** advanced OPEN→**spike implemented** (the shape is gated). Still OPEN, NOT decided: the
native-import cascade is unvalidated end-to-end (no Figma in CI) and there is no user-facing
plugin-free download. ADR-002 default (resolved colors) unchanged; the plugin stays the reliable
path. Next: validate in real Figma, then decide whether to expose a (clearly-experimental)
plugin-free download.

Gate: `npm test` green (9 verifiers + headless boot).

## 0.8 — 2026-06-17 — scrims become a single 500-based translucency ramp (CONTRACT change)

The scrim model changed from "base-{index}" over three bases (250/500/750) at 7 fixed alphas to a
**single 500-based ramp**: a scrim primitive is `500-{step}` = the palette's 500 color at **alpha% =
step/10** (e.g. `500-175` = 500 @ 17.5%). A scrim is now a translucency **sub-variant of the palette** —
it tracks the 500 stop as hue/chroma/skew/lift change. All 12 scrim-using roles remap onto this ramp by
closest step (the 7 `scrim*` strengths → 100/175/250/300/400/450/550; outline → 550; outlineVariant →
400; container/Low/High → 175/100/250) and become **mode-flat** (light === dark), including outline +
containers (which lose their former 250-light/750-dark split — a deliberate choice). Token naming:
`{family}-500-{step}` (e.g. `--c-neutral-500-175`).

Folded through every layer: `data/role-table.json` (constants `SCRIM_BASES:[500]` + `SCRIM_STEPS`; the
12 rows), the criteria (`hpg-semantic-roles`, `hpg-semantic-refs-canonical`, `hpg-export-padding`,
`hpg-plugin-bindings`, `hpg-engine-parity` P6), and the prose. Re-validated: spec-quality 29/29; the
semantic-mapping/export-formats/figma-plugin rubrics + all five capability cells (semantic-mapping,
export-formats, figma-plugin, ui-app, figma-plugin-app); the figma cascade still aliases every role to a
created raw var. (Implementation cells re-stamped against this spec.)

## 0.7 — 2026-06-17 — reconcile prose with shipped reality (no contract change)

A prose-only reconciliation pass — **zero acceptance criteria changed**, so dependents stay
`validated` (the staleness cascade is for contract changes, and the lattice did not flag the
hash drift). Three things had drifted from reality:

- **Stale entailment count.** The Decomposition prose said "27/27 covered" but `hpg-tonal-damping-curve`
  + `hpg-tonal-edge-hue` had since been folded into the tonal ticket → corrected to **29/29, 6 tickets**
  (matches `spec-quality-check`: "29/29 criteria covered").
- **Stale build status.** "six capability cells seeded at `defined` … only `color-engine` ready" → now
  all six rubric + six capability cells are **validated**; named the two downstream **integration** cells
  that consume them and are gated by their own harnesses outside this engine/output carving (mirroring how
  the editor UI is excluded): `capability.system.ui-app` and `capability.system.figma-plugin-app` (the
  generator-as-plugin: `figmaBundle()` → `raw-colors` + `Semantic` Light/Dark, aliased, **idempotent**).
- **Unacknowledged editor surfaces.** The editor-UI non-goal now explicitly names the shipped gallery
  **Import** + drawer **Config** tab as `ui-app` convenience surfaces over the specced persistence
  round-trip (`hpg-persistence-roundtrip`), not new token-output contracts; and the live-cascade non-goal
  now names BOTH plugin realizations (`figma-plugin` Binder + `figma-plugin-app`). Re-minted the
  spec-quality signal (29/29, exit 0).

## 0.6 — 2026-06-15 — differential damping curve (additive, backward-compatible)

Generalized the single `damp` scalar (× a hardcoded `^1.5`, symmetric edge falloff) into a
**differential chroma-multiplier curve** `m(stop)` with three new controls — `dampCurve`
(falloff exponent γ, where damping bites), `dampAmp` (mid-tone amplify toward the gamut
ceiling, `m > 1`), and `dampBias` (light↔dark asymmetry). Defaults (γ 1.5 / amp 0 / bias 0)
reduce `m` to the legacy `1 − (damp/100)·u^1.5` **exactly**, so every existing palette and
export is byte-unchanged. Threaded through `tonal.js` (engine), `model.mjs`, `persist.js`
(domains + hydrate defaults for pre-field docs), and `exports.js`; surfaced as three Global
sliders + a live `m(stop)` curve graph. `min(target·m, gamut)` still clamps, so amplify only
pushes toward the ceiling. Updated `knowledge-02-tonal-scale.md`, `spec-draft.md` (State +
formula), and the `hpg-tonal-chroma-target` criterion (dampFactor → the multiplier m).
Re-validated tonal-generation, export-formats, ui-persistence, ui-app against unchanged rubrics.

**Spec-council REVIEW + REFINE.** Ran the six lens-critics (completeness · testability · entailment ·
ambiguity · scope · hackability) over this change. Scope: APPROVED; the rest CONDITIONAL with valid
findings, all folded back: the `max(0,·)` floor and the absent-field hydrate path are now gated
(`hpg-tonal-damping-curve` (b); `hpg-persistence-roundtrip` absent-field clause); the (d) bias and
(e) falloff gates were hardened from gameable per-half sums into a **mirror-symmetry + mid-invariance**
check (defeats a directional sign-branch) and a **redistribution** check (defeats a global γ-scalar) —
both falsified against the exact hacks the hackability lens constructed; the damping battery now runs
over **every saturated hue**, not one; `dampCurve`/`dampAmp`/`dampBias` added to the glossary; the stale
`dampF` symbol and the `ui-plan` T4 control list fixed.

## 0.5 — 2026-06-15 — spec UPDATE from the build (the outer loop)

Having **built the whole tool from this spec** (6 capability modules + the UI, all validated by independent
harnesses), folded the build's evidence back into the contract — the dev-factory **outer loop** (operating
evidence → regenerate the upstream spec), via the ledgered `validated → regenerating → validated` path.

- **Hue-stability aligned to its validated verifier.** `hpg-tonal-hue-stability` now states **emitted-chroma > 20
  / ±2°** (the 8-bit-calibrated thresholds the harness has run since 0.4) instead of the unachievable idealized
  `chroma > 1 / ±1°`. The spec criterion, `rubric.system.tonal-generation`, and the harness now agree.
- **Parity de-legacied.** `hpg-engine-parity` + `hpg-parity-roletable` are now **CONDITIONAL on packaging**: a
  single-source build (one engine / role-table module imported everywhere) satisfies them **structurally**; the
  differential check applies only IF ≥2 independent implementations ship. Parity is a property of multi-impl
  *distribution*, not of the domain — the 3-impl (artifact / gen.js / plugin) premise was legacy baggage. The
  criteria now verify OUTPUT properties, not a specific `<script>` / gen.js file layout.
- **Distribution vs authoring (ADR-010).** "Single-file / offline" is the *distribution* format (the reference
  build authors modular ES modules and bundles to one offline HTML), not an authoring constraint.
- **OD-005 DECIDED — palette count is configurable** (the criteria are "for every palette"; the validated UI
  ships it). The "8-palette ceiling" non-goal is retired.
- **UI scoped out.** A new non-goal makes the interactive editor UI a *separate* spec (`references/ui-plan.md` /
  `capability.system.ui-app`); this spec covers the generator + its output only.

Gate re-passes (27/27); spec re-validated; `rubric.system.tonal-generation` re-minted to match.

## 0.4 — 2026-06-15 — build-surfaced calibration (hue-stability), from the factory loop

Building `capability.system.tonal-generation` through the loop, its executable verifier surfaced that
`hpg-tonal-hue-stability`'s idealized threshold (**applied** chroma > 1, **±1.0°**) is unachievable against
real **8-bit sRGB output** plus the engine's own Δ≤2 roundtrip budget: near-neutral and tonal-extreme stops
carry no stable hue, and a Δ≤2 channel error is ~2° of CAM16 hue at low-chroma colors. The validated adapter
(`capability/tonal-generation/verify.mjs`) calibrates the check to **emitted** chroma > 20 and **±2°** (= the
engine's roundtrip budget expressed as hue) — verified robust across all 8 default palettes (max hue drift
≤1.48°, 3–20 hue-checked stops each; a real per-stop hue-recompute bug still drifts far more). This is the
**outer loop**: operating evidence calibrating the spec. **Follow-up (deferred):** align the spec criterion +
`rubric.system.tonal-generation` text to the 8-bit-calibrated thresholds (emitted-chroma>20 / ±2°) — deferred
to avoid re-staling the freshly-validated tonal slice mid-build.

## 0.3 — 2026-06-15 — Re-review (close the loop) + maintenance

Re-ran the spec-council on the REFINEd spec (the prior council saw only the 12-criterion draft),
confirmed every prior finding **closed**, folded the new findings the expansion surfaced (now **27
criteria**), then a maintenance pass.

**Re-review + second REFINE.**
- **Perceptual-evenness entailment (residual):** added `hpg-tonal-curve-fidelity` — the L\*
  *recomputed from the emitted sRGB* (NOT a stored tone field) must equal `toneAt(...)` within
  |ΔL\*| ≤ 1.0 across all five curves and the skew grid. Closes the entailment gap AND the
  tautology the hackability lens caught (comparing `toneAt` to itself).
- **Hue-stability:** added `hpg-tonal-hue-stability` — the Intent now promises "stable hue", so a
  criterion owns it (CAM16 hue of every chromatic stop == `effHue` within ±1°). (entailment F2)
- **Undefined tolerances pinned:** chroma-target (|ΔC| ≤ 1.0 + hard floor ≥ 0.5·min(target,cm)),
  engine-parity (≥1000 random triples, chroma≥5, tone∈(2,98), max-channel ≤ 2), engine-branches
  (max−min ≤ 1, not exact ==), leaf-valid hex rule (`Math.round(c·255)`). (testability/hackability)
- **Terminology (residual):** glossary splits **scrim primitive** (a ref target) from **scrim role**
  (not a target); on-color shorthand now carries both 050 and 200. (ambiguity)
- **Doc sync:** `references/decomposition.md` → 27/27 + the real maturity (rubrics validated, cells
  `defined`, tickets active — the prior "not yet validated" note was stale). ADR-003 "perceptually
  correct" → "contrast-optimized" (retires the rhyme with "perceptually even").

**Maintenance (UPDATE).**
- **ADR-002 re-verified (2026-06-15)** against Figma's current "Modes for variables" doc: the
  `com.figma.aliasData` extension documents a name+collection-name fallback, **softening** the
  "needs library UUIDs / name-only errors" claim. Resolved-colors default kept; the aliased path is
  now plausible-but-conditional (target collection must pre-exist).
- **OD-004** narrowed OPEN→spike (plugin-free aliased export is feasible to validate end-to-end).
- **OD-005** recommendation: the 27 criteria are all "for every palette", so a configurable count is
  low-risk; keep 8 default, allow a cap. An owner/product call.

Gate re-passes (27/27); spec cell re-validated. `rubric.system.tonal-generation` flagged **stale** —
it must gain the two new tonal dimensions (curve-fidelity, hue-stability) before it can gate the
tonal build.

## 0.2 — June 2026 — spec-author bring-up to dev-factory SKILL-format

Brought the package up to the dev-factory **SKILL-format spec** standard so it is a valid,
gate-passing `spec.system.hct-palette-generator-spec` cell — and hardened it through a
spec-council REVIEW.

**Authored the machine-readable contract.** `SKILL.md` now embeds the fenced `json` contract
block the **spec-quality** gate reads: `cell`, `binds_rubric` (`rubric.system.spec-quality`),
`acceptance_criteria`, `non_goals`, and an entailment-checked `decomposition`. Previously the
package carried its acceptance criteria only as prose in `rubrics/`, so it failed every hard
gate dimension (no structured block). Verified: `spec-quality-check.py` passes;
`_entailment_check.py` 25/25 covered.

**Council REFINE (the generator/critic split).** A six-lens adversarial review
(completeness · testability · entailment · ambiguity · scope · hackability) ran over the
draft and returned CONDITIONAL. Folded its surviving findings back:
- **Anti-hack predicates promoted from `rubrics/` into the contract** (they existed but were
  dropped in the 28→25 compression): engine-math parity P6/P7 (`hpg-engine-parity`,
  differential — a shared `role-table.json` can no longer fake engine agreement), the chroma
  floor AC-T5 (`hpg-tonal-chroma-target` — a flat gray ramp no longer passes the gamut
  criterion), the surface mirror invariant AC-S5, DTCG leaf validity + non-vacuity AC-X5, the
  CSS two-layer resolution AC-X2, the disabled-palette filter AC-U2, engine branches AC-E2/E3,
  plugin bindings/offline AC-P2/P3.
- **Parity split across three cells** (engine-math → color-engine, role-table →
  semantic-mapping, plugin → figma-plugin) to fix the misplaced cross-child seam.
- **Ambiguity fixes:** `hpg-semantic-oncolors` now states the on-color as "the 50 stop (stored
  '50', padded '050')" — the prior `=== 050` literal was false against `role-table.json` which
  stores `'50'`; `hpg-semantic-refs-canonical` now requires refs to EQUAL the canonical ref,
  not merely resolve.
- **Testability fixes:** the gamut-ceiling tolerance is a fixed 0.5 (not "within search
  resolution"); monotonicity is weak with an enumerated skew grid; the fused
  persistence/theme criterion is split.
- **Scope fixes:** non-goals now cite the OPEN decisions they bound (OD-004 aliased export,
  OD-005 palette count) instead of claiming closure; OKLCH-input fidelity and UI3-native
  import are explicit non-goals; the accessibility non-goal is a real boundary, not a TODO.

**Added** `references/decomposition.md` — the full carving (cells + tickets + the parity
split + the honest-maturity note: the six child rubric cells are not yet validated, so the
carving is proven-covering but not yet dispatchable).

## 0.1 — June 2026 — Initial extraction

Created as a spec source package for the HCT Palette Generator, intended for import and
enhancement by spec-author.

**Provenance.** Content was extracted directly from the working tool rather than written
from memory:
- The 37-role table, defaults, and constants in `data/role-table.json` were generated by
  evaluating the artifact's own `semanticRoles`, `DEFAULTS`, and stop/scrim constants —
  ground truth, not transcription.
- The engine verification anchors in `data/verification-anchors.json` were computed by
  running the reference engine (`hct.js`): forward CAM16 + L-star, then `hctToRgb` inverse
  roundtrip for red/green/blue/white/black/mid-gray. All anchors roundtrip with 0 channel
  delta on the current engine.

**Structure.**
- `SKILL.md` — entry point, first principles, spec-author handoff instructions.
- `references/spec-draft.md` — the spec in spec-author's hybrid Brief+TDD format
  (header block, "How to Read", common spine, 📐💡⚠️ markers, OD table, anti-patterns).
- `references/knowledge-01..05.md` — decomposed knowledge foundation: engine, tonal scale,
  semantic system, export formats, plugin.
- `references/decision-records.md` — ADR-001…010, the fenced choices, with a map of the
  decisions an enhancing agent is most likely to wrongly "fix".
- `references/glossary.md` — project vocabulary.
- `rubrics/` — quality rubric (spec-author 10 dimensions + project completeness gate),
  acceptance criteria (runnable predicates), parity checklist (three-implementation gate).

**Research grounding.** The Figma-import behavior captured in `knowledge-04` and ADR-002 was
established by prior research against Figma's "Modes for variables" documentation: native
import accepts DTCG; cross-collection `aliasData` needs library-key UUIDs minted on export;
name-only aliasData errors rather than falling back. This is time-sensitive — an enhancing
pass should re-verify it.

**Known fenced decisions (do not silently revert).** On-colors fixed to `050` overriding
contrast (ADR-003 / OD-001); semantic scrim roles on base 750 only (ADR-004 / OD-002);
resolved-not-aliased semantic exports (ADR-002); UI3 schema is interchange-only (ADR-007 /
OD-003).

**Open follow-ups for the next pass.** No quantitative skill-trigger eval was run (this is a
knowledge package, not a behavioral skill). spec-author should re-verify Figma behavior, run
the Layer B gate, and decide OD-004 (aliased cascade without the plugin) and OD-005 (palette
count).
