# Changelog

All notable changes to **Color Tokens by NONOUN** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are grouped by the day
they landed on `main` and reference the squash-merged PR that introduced them.

## [Unreleased]

### 2026-06-27

#### Changed
- **Typography expanded to the seven named groups** (the canonical taxonomy from the spec): **Display ·
  Heading-Editorial · Heading-Context · Heading-Eyebrow · Body · UI · Code** — replacing the prior four
  voices. Heading-Eyebrow + Code ride the **mono** font; Display, Heading-Context, and Heading-Eyebrow are
  the **UPPERCASE** caps voices (Display tightens, Context/Eyebrow open up) — the engine now carries a
  per-step `textTransform`, emitted to CSS (`text-transform`) + DTCG (`textCase`). The canvas specimen,
  left-rail analysis (seven-series curves), and right-pane inspector all render the full **41-step** scale
  (Display 5 · 3×Heading 5 · Body 5 · UI 8 · Code 8). All five treatments keep their character via a shared
  `make7()` factory. No persist change — `doc.type = {treatment, bodyBase}` is unchanged.

#### Added
- **Typography is now a first-class editor SECTION (not a modal).** A persistent App-Header switcher
  **« Color · Typography · Geometry »** routes the whole editor between sections of the *same* set. The
  Typography section reuses the three-pane shell: the **center canvas** shows the **full 23-step specimen**
  (Display · Heading · Body · UI — every step, vs the old modal's 8) live in the real fonts, pannable /
  zoomable, with a **Specimen · Tokens** toggle; the **left rail** shows type **analysis** (modular-scale
  curve, optical-tracking curve, leading, font-role pairings); the **right pane** is the type **inspector**
  (treatment + body-base controls, a read-only per-voice summary, a live brand-coloured example, and the
  token download). The Typography **modal is retired**. Color behavior is unchanged (the section branches
  are guarded; the color canvas/inspector/analysis are byte-identical). Geometry's tab lands on a
  placeholder with a one-click into its existing editor (its section follows in the next phase). Phase 2 of
  the three-system workbench IA — designed via a multi-agent team (4 parallel designers + synthesis) and
  adversarially reviewed before merge.

#### Changed
- **Settings is now a page, not a toast.** Rebuilt as a left **section-nav** (grouped, labeled — Tokens ·
  App · About) + a right content area with a page header and label-left / control-right rows, sized like a
  page (`min(960px, 94vw) × min(85vh, 720px)`). **Tokens › Mapping** holds the accent + on-color mapping;
  **App › Appearance** surfaces the app-theme and canvas-preview scheme as explicit segmented controls;
  **About** carries the support contact + docs. First step of the three-system workbench IA — the nav has
  room to grow (Export defaults, Set identity, Modes & breakpoints) as those land. `(set)` headless covers
  the nav + panel switching.

### 2026-06-26

#### Added
- **Type ↔ Geometry composition.** A control's box and its text now share **one number**: the geometry
  engine's per-size `font` comes from the brand's **Typography UI** scale (matching step — geometry XS →
  UI XS … 2XL → UI 2XL) instead of a standalone power law, so changing the type treatment or body base
  moves the control text everywhere it's used. The frame (height/icon/padding/radius) is untouched, so the
  centering law still holds. The Geometry modal shows the shared-source note and the composed sizes; the
  Brand-Kit MCP serves the composed geometry. New `geometryScale(doc)` (the single join point) +
  `geomScale(config, { typeScale })`.
- **Geometry → Figma number variables.** The Download-All bundle's `figma/dimension.variables.json` (and
  the Geometry modal's `.zip`) now ships a **"Geometry" collection of DTCG `number` tokens** (unitless) —
  the shape a Figma variable importer turns into native **FLOAT variables** (height · icon · font · gap ·
  padding · radius · space) you bind to auto-layout, corner radius, gaps, and sizing. New `geomTokensFigma`.
- **Per-system export opt-in (Color · Typography · Geometry).** The export drawer gains an **Include**
  toggle row — choose which token systems go into the **Download-All `.zip`** and the **Brand-Kit MCP**.
  Color gates every colour format + the palettes/roles; Typography adds `typography/type.{css,tokens.json}`;
  Geometry adds `geometry/geometry.{css,tokens.json}` (both also dropped into `figma/` as importable
  variables/styles). The format picker now previews **Typography (CSS/DTCG)** and **Geometry (CSS/DTCG)**
  directly too. `brandKit(doc, systems)` builds only the opted-in sections, and the **MCP server's surface
  follows suit** — `get_type` / `brand://type` and `get_geometry` / `brand://geometry` appear only when
  those systems are included (the colour tools only with palettes).
- **Geometry / dimensional generator.** The spatial analog of the color & type engines: a few params →
  a systematic size ramp → derived control geometry. A 📐 Geometry modal (header) picks a **treatment**
  (Comfortable, Compact/Dense, Spacious/Airy, Touch/Mobile, Pill/Rounded) + base control height, previews
  a **live size ramp** (XS–2XL mock controls — leading icon · label · caret, every dimension the real
  px), and downloads **geometry tokens** (CSS custom props + `.control-*` utility classes + DTCG
  `dimension` tokens) as a `.zip`. The engine (`src/engine/geometry.mjs`) encodes the **centering law** —
  edge padding = (height − glyph) / 2, every glyph centered in a square cell of side = the control height —
  and the **two families** (frame ∝ height: icon, slot, pad, pill radius = height/2; rhythm ∝ font:
  gap = font/2, caret = font; density rides the rhythm only). The six-size ramp is generated by one
  sublinear power law (icon = 2.49·h^0.58, font ≈ √h), reproducing the hand-tuned reference table to ±1px.
  It travels with the set (persisted) and is **served by the Brand-Kit MCP** too.
- **Typography generator.** The type analog of the color engine: a few params → a systematic type scale.
  A ⓣ Typography modal (header) picks a **treatment** (Product/Lifestyle, Luxury, Editorial, Technical,
  Brutalist) + body base size, previews a **live specimen** (Display / Heading / Body / UI voices), and
  downloads **type tokens** (CSS utility classes + DTCG `typography` tokens) as a `.zip`. The engine
  (`src/engine/type.mjs`) derives every step's size (modular scale), line-height (per-role leading),
  letter-spacing (optical — tightens big display, loosens small UI), and weight. It travels with the set
  (persisted) and is **served by the Brand-Kit MCP** too.
- **Brand-Kit MCP (download).** "Brand-Kit MCP" in the export drawer's Config tab downloads a `.zip` with
  a **zero-dependency MCP server** + your resolved tokens (`brand-kit.json`) + a setup README. Point
  **Claude Code / Cursor / any MCP agent** at it (`node brand-kit-server.mjs` or `claude mcp add`) and it
  serves your palettes, tonal ramps, and the 37-role semantic layer (light + dark) as MCP resources/tools
  (`resolve_token`, `get_ramp`, `nearest_token`, …) + a brand-usage prompt — so the agent builds with your
  exact tokens. New `brandKit(doc)` projection; a 12th verifier drives the server over the MCP protocol.
- **Settings modal** (⚙ in the header) for doc-level **token-mapping** preferences. First controls:
  **Primary accent** — `Mode-specific · 550 / 450` *(default)* vs `Single · 500 / 500` (one
  mode-agnostic accent token) — and **On-colors** (`fixed` / WCAG-`contrast`, surfaced here too). A
  resolution-layer choice (`applyAccentRef`) that re-points how the prime accent role resolves without
  touching the ramp or the canonical role table; travels with the set + applies to every export.
- **"Back up your variables first" consent gate** before "Apply Variables → Figma" (and Regroup). A
  centered modal explains that applying creates/overwrites the `Color Primitives` + `Color Modes`
  variable collections (same-named variables are overwritten — which can intentionally re-skin bound
  components), nudges you to **duplicate the file first**, and links to **how mappings work**. It's
  **cookieable** ("Don't show again", remembered per user/version) for normal apply; the destructive
  **Regroup always re-warns**. Doubles as Figma's required explicit-consent-before-modifying gate.

#### Changed
- **Figma plugin compliance pass (launch prep).** Both plugins now show **friendly, handled errors** —
  the technical detail goes to `console.error`, and users see an actionable message ("Color Tokens couldn't
  apply the variables… email support@nonoun.io") instead of a raw error string (Figma store policy). The
  companion plugin is renamed **"HCT Semantic Binder" → "Color Tokens Semantic Binder"** (id
  `color-tokens-semantic-binder`) and its manifest `networkAccess` moved to the current object form
  (`{ "allowedDomains": ["none"] }`). Stale **"HCT"** *product* branding is scrubbed from every user-facing
  string (the *color-model* term HCT stays in the engine, where it's accurate). Regression-guarded in
  `test/figma/{plugin,binder}.mjs`.
- The Figma plugin's in-file config key `hct-config` → **`nonoun-color-tokens-config`** (aligns with
  `SETS_KEY`'s `nonoun-color-tokens-*` naming). `readConfig` falls back to the legacy `hct-config` key,
  so files saved before the rename still load and migrate forward on the next save.

#### Docs
- **README refresh** — regenerated the hero from the current engine and **pinned the preview to the
  perceptual distribution** (`gen-preview.mjs`), so the "perceptually-even" caption holds regardless of
  the default; added a **Compose new palettes** feature bullet (the derivation modal + drag-reorder);
  framed the hero as the perceptual export.
- **Spec/reference docs brought current** — the Figma collections renamed to `Color Primitives` /
  `Color Modes` across the `docs/spec/**` prose; a new `knowledge-06-palette-derivation.md` for the
  "New Palette" engine; `component-inventory.md` + `spec-draft.md` updated for the ghost reorder, the
  native-`<dialog>` overlays, the gallery, and the evolved data model. (Internal spec; see spec CHANGELOG 1.37.)

### 2026-06-25

#### Changed
- **Palette drag-to-reorder is now ghost-based.** Dragging a row's ⋮⋮ handle lifts a **floating clone**
  that tracks the cursor, the source row collapses, and a **dashed placeholder** opens at the landing
  slot so the list visibly parts to show where the drop will go — replacing the thin drop-edge line.
  The drop slot is decided relative to that placeholder (the proposed placement) with a **10px
  deadzone**, so it only reslots when the cursor moves clearly past the placeholder's edge — no jitter
  from the reflow. The reorder logic (one undo step, selection follows the moved palette) is unchanged.

#### Fixed
- The drag-reorder **floating clone now resolves its colors in the canvas preview's `color-scheme`**,
  not the app chrome's. The clone is re-parented to the host for viewport-fixed positioning, so a row
  dragged while the canvas ◐ preview is the **opposite** mode from the chrome (e.g. light canvas, dark
  app) previously rendered the clone's `light-dark()` text/surfaces in the wrong mode (light text on
  the light row). The ghost is now pinned to `resolvedCanvasScheme()`.

## [1.2.0] — 2026-06-25

Renames **Surveys → Color Categories** (the gallery label *and* the internal code), adds a **color
picker** and a **priority chain** to the New-Palette modal, drops the "Survey" wording from the curated
eyebrows, and hardens the CI smoke harness against cold-runner flakes.

### 2026-06-25

#### Added
- **New-Palette modal polish:** the **Custom** tab gains a native **color picker** (pick a color and
  the palette's hue + chroma are recovered from it; the sliders still fine-tune), and the **Relative**
  preview now shows the **priority chain** — the ordered context colors (primary marked, then
  secondary / tertiary…) — so the priority order driving the relationship is visible, not just the
  single anchor.

#### Changed
- Renamed the **"Surveys"** feature to **"Color Categories"** throughout — the gallery label/nav and
  the **internal code**: `src/ui/surveys/` → `src/ui/categories/`, `docs/spec/colors/surveys/` →
  `…/categories/`, `scripts/gen-surveys.mjs` → `gen-categories.mjs` (npm `gen:categories`),
  `SURVEY_INDEX`/`loadSurvey` → `CATEGORY_INDEX`/`loadCategory`, the `openSurvey`/`closeSurvey`/
  `renderSurveyBody` methods, and the `.survey-*` CSS classes. The curated category + volume eyebrows
  were updated too — "… Palette Survey · …" → "… Palette · …" and "… Survey · Vol N · …" → "… · Vol N
  · …" — so no "Survey" wording remains anywhere. No behavior change.
- **Tooling:** the CI smoke harness waits for Chrome's CDP endpoint more robustly — a two-phase poll
  (debugger-listening, then open-tab) with a 45 s budget and a diagnostic error, instead of a 15 s
  blind wait that intermittently failed cold runners with "Chrome CDP did not come up".

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
