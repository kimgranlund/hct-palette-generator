# Changelog

All notable changes to **Color Tokens by NONOUN** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are grouped by the day
they landed on `main` and reference the squash-merged PR that introduced them.

## [Unreleased]

### 2026-06-25

#### Changed
- Renamed the **"Surveys"** feature to **"Color Categories"** throughout — the gallery label/nav and
  the **internal code**: `src/ui/surveys/` → `src/ui/categories/`, `docs/spec/colors/surveys/` →
  `…/categories/`, `scripts/gen-surveys.mjs` → `gen-categories.mjs` (npm `gen:categories`),
  `SURVEY_INDEX`/`loadSurvey` → `CATEGORY_INDEX`/`loadCategory`, the `openSurvey`/`closeSurvey`/
  `renderSurveyBody` methods, and the `.survey-*` CSS classes. The curated per-category editorial
  eyebrows still read "… Palette Survey" (left as authored copy). No behavior change.

## [1.1.0] — 2026-06-25

Adds the **New-Palette derivation modal**, a derived **`neutral`** leading every survey preset,
opt-in **WCAG-safe on-colors**, and a **real-browser smoke test** in CI.

### 2026-06-25

#### Added
- **"New palette" derivation modal** — "+ Palette" now opens a large, **draggable** dialog (drag it
  by the header) that *derives* a palette instead of adding a default. Three modes: **Relative** (a
  color-theory relationship — extend / complete / contrast / bridge / anchor / recontextualize — that
  pivots on the **primary**, the first non-neutral palette you include via a swatch-only "Derive from"
  strip), **Environmental** (a neutral/environment tone: chroma-weighted mean hue + a clamped low
  chroma), and **Custom** (pick hue + chroma directly). Status palettes (success/warning/error/…) are
  excluded from the derivation context by default. The modal is **two-column**: a hue × chroma circle
  + chroma curve on the left, and the selection/picker plus a **live proposed-palette preview**
  (the Dominant + the Primary it derives against, and the generated ramp) on the right. (#64)
- **Survey presets lead with a derived `neutral`** — all 336 gallery presets now prepend a
  neutral/environment palette derived from their own character colors (the same rule as the modal's
  Environmental mode), baked into the survey generator so it travels with the data and shows on the
  tiles. 10 palettes/preset (was 9). (#64)
- **Opt-in WCAG-safe on-colors** (`onColorMode: "contrast"`) — re-points the accent on-colors to the
  end with the better contrast vs the accent fill, per mode (`550` light / `450` dark): `on{N}` flips
  050↔950, `on{N}Variant` 200↔800. A resolution-layer adjustment; the default stays **`"fixed"`** and
  the canonical role table is unchanged. (#62)
- **Download-All ships a `figma-aliased/` folder** — the Light/Dark/raw tokens with `aliasData`
  targeting the `Color Primitives` collection (the shape the plugin posts), so the plugin-free native
  import can be tested by hand. The default `figma/` stays resolved; the plugin stays the reliable
  path. (#63)

#### Changed
- The Figma **"Regroup"** action moved into the **Figma export tab** (beside the Binder plugin
  button), out of the drawer footer — it's a Figma-tab action, so it lives with the other Figma ones.
- **Tooling:** CI now runs a **real-browser smoke test** (headless Chrome over CDP, zero new deps) on
  every PR, driving gallery → survey → editor → export dialog. Node bumped to 22 (the smoke harness
  needs a global `WebSocket`). (#61)

## [1.0.0] — 2026-06-24

The first tagged release. Beyond the foundations (HCT/OKHSL engine, 37-role semantic layer, the
export formats, and the Figma generator + binder), 1.0.0 adds the **Palette Surveys** gallery, the
per-palette **Cusp pull**, durable Figma persistence, and a pass of naming/ordering/export polish.

### 2026-06-24

#### Added
- Opt-in **"Regroup Color Modes"** action (Figma, in the Export drawer): re-creates the `Color Modes`
  collection so it adopts the canonical grouped order (regular · containers · surfaces · scrims) —
  Figma keeps existing variables' positions on a normal apply. Destructive (re-created variables get
  new IDs, so bound layers detach), so it's opt-in + confirmed; the default apply stays idempotent.

#### Changed
- **Semantic token order regrouped** — the 37 roles emit as regular colors → containers → surfaces →
  scrims (scrims moved from the middle to the end), consistently across the Figma `Color Modes`
  variables, the `--c-*` CSS, and every export. Pure reorder; no color changes. (#57)
- **CSS raw vars drop the underscore** — `--c_{family}-{stop}` → `--c-{family}-{stop}`; raw and
  semantic now share the `--c-` prefix (raw names end in digits, semantic in a word, so no collision). (#58)
- `outlineVariant` references the `500-300` scrim (was `500-400`) — a subtler variant outline. (#59)

### 2026-06-23

#### Added
- **Per-palette "Cusp pull"** (perceptual mode) — a per-palette override of the global Vibrancy that
  nudges a palette's richest (max-chroma) stop toward stop 500, independent of the others (e.g. pulls
  yellow's vivid expression to the mid). Optional persisted field; perceptual-only inspector slider. (#55)

#### Changed
- **Figma collections renamed** — the generated variable collections are now **`Color Primitives`**
  (was `raw-colors`) and **`Color Modes`** (was `semantic-colors`). (#54)

#### Fixed
- **Figma gallery sets persist** via `figma.clientStorage` — the plugin iframe's opaque origin blocks
  `localStorage`, so "Your Palettes" silently vanished on reopen; now durable per-user. (#56)
- Export drawer spans full height; downloads save reliably (File System Access API + `<a download>`
  fallback) instead of navigating to the blob in embedded webviews; Mapping-tab scrim refs corrected
  (`scrim-weakest → 500-50`, etc.). (#55)

### 2026-06-22

#### Added
- **Palette Surveys** — the gallery is now a hub: *Your Palettes* (your saved sets) over a **Surveys**
  grid of **7 curated categories** (Architecture, Cuisine, Film, Literature, Music, Nature, Travel),
  each **12 volumes × 4 = 48** palettes (**336 total**). Each category is a page of volume-grouped,
  story-carrying palettes that open as an editable copy. Sourced from clean per-category JSON
  (`docs/spec/colors/surveys/*.json`) via `npm run gen:surveys`, and **lazy-loaded** per category
  (the web build code-splits each into its own chunk; the offline single-file build inlines them). (#51)
- **Sticky gallery masthead** — a pinned two/three-row header per screen: hub = title + search /
  description; a category = back-eyebrow + search / title / description, over a scrolling body. (#52)
- **Sun / moon / system color-scheme toggles** — the app chrome **and** the canvas preview each cycle
  ☀ light → 🌙 dark → ◐ system (icon-only), both defaulting to **system** (follow the OS). The canvas
  resolves system → OS preference and re-renders live when the OS scheme flips. (#52)

#### Changed
- The export drawer is now a native top-layer `<dialog>` (`showModal()`) — real `::backdrop`, focus
  trap, `inert` background, and Esc — replacing the hand-rolled scrim + `z-index` scaffolding. (#52)
- Header alignment + ordering: the analysis-rail and inspector pane headers match the canvas-header
  band (height, padding, bottom seam); the shell header reads undo · redo · scheme · new · export and
  the canvas header trailing group reads fit · scheme · zoom · + Palette (undo/redo/scheme/fit are now
  icon-only). (#52)
- Survey **volume headings** drop the redundant "Four palettes from …" lead-in and read as the
  evocative phrase (e.g. *"The great Russian novels, snow, candlelight, and dread"*). (#52)

#### Fixed
- Export dialog rendered two overlapping copy buttons; only one remains. (#52)
- Removed the stray canvas origin-dot. (#52)

### 2026-06-21

#### Added
- **Key colors** — pin exact brand colors per palette (a `dominant` + optional `supportive`), stored
  losslessly in **OKLCH**; the ramp is re-derived around them through the perceptual lens so a palette
  keeps its real source color while every other stop stays even. Shown as large inspector swatches and
  in the gallery tiles. (#49, #50)
- **Vibrancy** control — blends even-lightness toward the chroma-cusp anchoring so the palette's center
  reads vivid (notably for yellows). (#50)

#### Changed
- **`perceptual` is now the default** distribution mode everywhere. (#50)
- The export-format picker is a grouped **select** (grouped by destination), fixing the drawer-tab
  overflow as formats grew. (#48)

### 2026-06-20

#### Added
- **Tailwind v4** and **shadcn/ui** theme exports. (#47)
- Accessible primitive factories (button/switch/segmented/swatch/chip/field) extracted with an a11y
  pass, plus a drawer focus-trap. (#42, #45)

#### Changed
- Inspector gap-spacing refactor onto a shared geometry token. (#46)

### 2026-06-18

#### Added
- **Ramp distribution modes** — `even` (uniform CIELAB L\*), `perceptual` (uniform OKHSL lightness +
  gamut-proportional chroma), and `peak` (chroma-cusp anchored), with UX that hides controls that don't
  apply to the active mode and adds vivid-mids presets. (#38, #39)
- **OKHSL ↔ sRGB** engine module. (#36)
- **`relative-chroma`** mode — harmonize saturation across hues. (#33)
- A **chroma floor** to kill the near-white dead zone. (#41)
- Central inlined-SVG **icon registry** (Phosphor, offline). (#25)
- Gallery tile polish — palette-count + state tags moved into the preview, delete to top-right, an
  "updated" time tag. (#23, #24, #29)
- Product identity: renamed to **Color Tokens by NONOUN** / `nonoun-color-tokens`, with the NONOUN
  mark/favicon and the finished de-HCT rename. (#28, #31, #32)

#### Changed
- Canvas preview tints retuned (background 125/875, container 75/925, palette-container 150/850); click
  empty canvas to deselect. (#22, #26, #27)
- The Download-all archive is named `nonoun-color-tokens-{project}.zip`. (#35)
- A new palette ("+ Palette") resets all shaping config to neutral. (#34)

#### Fixed
- Removed a duplicate Contrast panel from the right-pane Inspector. (#37)
- A collapsed side pane no longer bleeds its cards into the canvas. (#21)

---

### Foundations

The engine (HCT/CAM16 tonal ramps, the 37-role semantic layer validated against the canonical
`docs/spec/data/role-table.json`, the export formats, and the Figma raw→semantic cascade), the
`<nonoun-color-tokens>` web component, the offline single-file build, and the Figma generator +
Semantic Binder plugins predate this changelog. See the git history for the full record.
