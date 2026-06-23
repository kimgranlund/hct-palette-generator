# Changelog

All notable changes to **Color Tokens by NONOUN** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). No versioned release has been
cut yet, so everything to date lives under **Unreleased**, grouped by the day it landed on `main`.
Entries reference the squash-merged PR that introduced them.

## [Unreleased]

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
