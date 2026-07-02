# Component Inventory — nonoun-color-tokens UI

> Inventory of every interactive primitive + data-viz mark in the UI, profiled as a **contract
> card** on the COMPOSE axis (layer → anatomy → API → composition). Produced with the
> `design-skills:component-decomposer` method. This is a **DECOMPOSE of the as-built UI** — it
> records reality (including the gaps against the skill's family policy), it does not redesign.
>
> ⚠️ **Line numbers drift.** The exact `file:line` citations below are a past snapshot (`src/ui/app.js`
> has since grown to ~5330 lines); treat them as **structural pointers**, not addresses — `grep` the named
> symbol/class to locate it. The anatomy, layering, and API observations remain valid.

## How to read this

- **Method.** Each primitive gets a contract card. Control primitives use the family-controls JSON
  shape (`component · layer · role · replaces_native · parts · props · states · keyboard ·
  forced_colors · owns_outer_margin`) plus inventory fields (**surface · call-sites · CSS classes ·
  native-vs-custom · a11y · geometry · flags**).
- **Surfaces.** `S1` = editor (`src/ui/app.js` + `src/ui/styles.css`). `S2` = Figma plugin. `S3` =
  data-viz marks (SVG/CSS in the analysis rail + canvas).
- **Citations** are `file:line`.

## The architecture finding (read first)

There is **no component library**. The entire UI is one monolithic autonomous web component —
`nonoun-color-tokens` (`src/ui/app.js`, ~5,330 lines, `customElements.define` at `app.js:5327`) —
that builds every control inline with a single hyperscript helper `h(tag, attrs, ...kids)`
(`app.js:172`), across ~25 `render*()` methods. Styling is ~570 CSS class selectors in
`src/ui/styles.css` (~1,282 lines). Consequences that recur in every card below:

- **S2 is not a second surface.** `scripts/gen-figma-ui.mjs` bundles the *same* compiled app
  (`dist/nonoun-color-tokens.html`) and injects a postMessage bridge that flips `inFigma`
  (`gen-figma-ui.mjs:23-38`). So **S2 reuses S1's primitives verbatim**; the only S2-specific
  *instances* are `inFigma`-gated buttons ("Read live" `app.js:1950`, "Read approx →" `app.js:803`,
  `.figma-plugin-btn` `app.js:2638`) and the `.figma-files` mode segment (`app.js:2625`).
- **No native-replacement layer + no FACE.** Controls are a mix of *native* elements (`<input
  type=range/text/search/checkbox>`, `<select>`) and *custom `<div>`/`<button>` widgets* — none are
  form-associated custom elements. The native ones inherit native a11y for free; the custom ones
  (the `.toggle`) re-implement a control on a `<div>` and **lose all of it**.
- **No forced-colors / high-contrast support anywhere** (`grep forced-colors styles.css` → 0). Every
  custom-painted control vanishes or flattens in Windows High Contrast.
- **Geometry is ad-hoc, off any ramp.** Buttons are `padding: 4px 9px` (`styles.css:86`), the range
  thumb is 15px, the toggle track 34×19 — none derived from a documented size ramp or the
  `(height − glyph)/2` law. Not wrong per se, but undocumented and unenforced.

## Refactor status — primitive extraction (implemented)

A primitive-extraction pass has since landed (branch `refactor/primitive-extraction`), at the
**helper-factory scale** (not full custom-element/FACE — see the rationale in the project's before/after:
no `<form>`s, one internal surface, native elements already carry most a11y). Six factories now own each
control's contract in one place; all changes verified by `npm test` (10/10), including 8 new a11y
regression assertions (`px1`–`px8` in `test/ui/headless-boot.mjs`).

| Factory | Location | Replaces | a11y won |
|---|---|---|---|
| `switchControl()` | `app.js` (pure) | the `<div onclick>` `.toggle` ×3 | `<button role=switch>` + `aria-checked` + keyboard + focus |
| `segmented()` | `app.js` (method) | 4 hand-rolled segmented stylings ×6 sites | roving tabindex + arrows; `role=tablist`/`group`; tabpanel wiring |
| `swatch()` | `app.js` (pure) | inspector dot + role refs; checkerboard ×2→×1 | decorative `aria-hidden`; one `.swatch` + `.alpha` |
| `btn()` | `app.js` (pure) | variant-bearing + header buttons | `{ghost,primary,danger,bare}` vocabulary; layout off the variant axis |
| `chip()` | `app.js` (pure) | `damp-presets` + `map-drift-sum` | `interactive`(button)/`status`(span) modes |
| `field()` | `app.js` (pure) | the 5 unassociated label rows | `label[for]`↔`id` association → accessible names |

Plus: a `@media (forced-colors:active)` pass; set-tile → `role=button` with a real delete `<button>`;
drawer `role=dialog`; toast `aria-live`. `slider()` was already the model and is unchanged.

**Deferred (intentional):** `.field`/`.segmented` self-margins (→ parent `gap` is a risky layout change
for a 🟡 win); a true drawer focus-trap; migrating the remaining uniform-`ghost` buttons + the composite
swatch cells (ramp-strip/scrim/footer) — all behavior-neutral, adoptable incrementally.

## Summary table

| # | Primitive | Layer | Native / Custom | Variants | Call-sites | Owning CSS | a11y | Flags |
|---|---|---|---|---|---|---|---|---|
| 1 | **Button** | component | native `<button>` | ~9 (primary · ghost · danger · undo/redo · add-pal · pane-toggle · figma-plugin · ex-btn · copy-float · map-reset) | ~20 sites, 85+ refs | `button`, `.primary`, `.ghost`, `.danger`, `.ex-btn`, `.copy-float`, `.map-reset`, `.pane-toggle` | good (focus-visible, aria-pressed×9, aria-label on icon-only) | no forced-colors; variant sprawl via ad-hoc classes |
| 2 | **Toggle / switch** | component | **custom `<div>`** | 1 | 3 | `.toggle`, `.track` | ✗ **none** — no role, no tabindex, no keyboard, no aria-checked | **worst a11y gap**; not focusable |
| 3 | **Segmented control** | component (composes buttons) | custom (`<button>`s) | 4 (inspector tabs · canvas-seg tabs · canvas-seg group · drawer-tabs · figma-files) | 6 | `.segmented`, `.canvas-seg`, `.drawer-tabs`, `.figma-files` | mixed — tabs do roving tabindex + arrows + `role=tab/tablist`; drawer-tabs/figma-files do not | 2 well-built + 2 ad-hoc lookalikes (drift) |
| 4 | **Slider / range** | component | native `<input type=range>` | 1 (via `slider()` helper) | 1 helper, ~14 instances | `input[type=range]`, `.field` | partial — `aria-label` set (label sibling NOT associated, noted in code `app.js:2214`); no forced-colors | custom thumb only; consistent — the model primitive |
| 5 | **Select** | component | native `<select>` | 1 + `.map-raw-select` | 3 | `select`, `.map-raw-select` | partial — `.map-raw-select` has `aria-label`; Distribution/Curve rely on unassociated sibling label | inconsistent label wiring |
| 6 | **Text input** | component | native `<input type=text>` | 2 (`.field` name · `.map-raw-input`) | 2 | `input[type=text]`, `.map-raw-input` | partial — map-raw-input has `aria-label`; Name uses unassociated sibling label | label-association drift |
| 7 | **Search input** | component | native `<input type=search>` | 1 | 1 (singleton, reused) | `input[type=search]` | good — `aria-label` + placeholder | reused node to preserve focus (`app.js:689`) |
| 8 | **Checkbox** | component | native `<input type=checkbox>` | 1 | 1 | `.mini-check` | good — label-wrapped (associated), `accent-color` | only one instance |
| 9 | **Chip / pill** | component | custom span/button | 3 (tile-tag · preset · drift-sum) | ~6 | `.tile-tag`, `.damp-presets .preset`, `.map-drift-sum` | n/a (status) / preset is a clickable `<button>` | 3 unrelated "pill" stylings |
| 10 | **Field wrapper** | primitive (layout) | custom `<div>` | 1 | ~7 | `.field`, `.field > label` | n/a — wraps label + control | the only true layout primitive |
| 11 | **Swatch / color-cell** | primitive | custom `<i>`/`<span>` | ~6 (ramp · scrim · map · dot · roles · footer) | many | `.ramp-strip i`, `.scrim-cell`, `.map-swatch`, `.swatch-dot`, `.sw` | n/a (decorative; hover outline) | 6 sizes/idioms of one concept |
| 12 | **Set-tile** | component (composition) | custom `<button>` | 2 (set · preset) | 2 builders | `.set-tile`, `.set-thumb`, `.tile-tag`, `.del` | tile is a `<button>`; nested `.del` is a nested click | nested interactive in a button |
| 13 | **Ramp-row** | component (composition) | custom `<div>` | 1 | 2 scenes | `.ramp-row`, `.enable`, `.drag-handle`, `.ramp-name`, `.ramp-strip` | partial — selectable/draggable row; `.enable`/`.drag-handle` are `<div>`s | rich interaction, weak semantics |
| 14 | **Contrast bar** | data-viz | SVG/CSS | 1 | 1 | `.an-bar`, `.an-track`, `.an-fill`, `.an-thresh` | n/a | — |
| 15 | **Hue wheel** | data-viz | SVG | 1 | 1 | `.hw-circle`, `.hw-dot`, `.hw-ring` | n/a | — |
| 16 | **Tone / lightness curve** | data-viz | SVG | 1 | 1 | `.lc-axis`, `.lc-ceiling`, `.lc-toneline`, `.lc-applied`, `.lc-dot` | n/a | — |
| 17 | **Damping graph** | data-viz | SVG | 1 | 1 | `.damp-graph`, `.dg-unity` | n/a | — |
| 18 | **Graph legend** | data-viz | CSS | 1 | 1 | `.an-legend`, `.an-leg`, `.an-leg-mark` | n/a | — |
| — | **Radio** | — | **ABSENT** | — | 0 | — | — | deliberate: covered by segmented + select |
| — | **Drawer / Toast** | overlay | custom | 1 each | 1 each | `.drawer`, `.drawer-scrim`, `.toast` | drawer has no focus-trap/Esc story | overlays, not primitives — noted below |

---

## Contract cards — Controls

### 1 · Button

- **Surface** S1 (+ S2 instances). **Sites** ~20 `h("button"…)`; 85+ refs.
- **Anatomy** `[ icon? · label? ]` — no caret variant. Icon-only used for zoom (`app.js:1445/1447`),
  drawer close (`app.js:2590`).
- **API** classes-as-variant: `.primary` (`styles.css:93`), `.ghost` (`:99`), `.danger`
  (modifier on `.ghost`, `app.js:2342`), `.add-pal-btn` (dashed, `styles.css:373`), `.ex-btn`
  (preview, `cursor:default` — non-interactive, `styles.css:604`), `.copy-float` (`styles.css:700`),
  `.map-reset` (borderless icon, `styles.css:503`), `.pane-toggle` (`styles.css:272`),
  `.figma-plugin-btn`, `.undo-btn`/`.redo-btn` (`app.js:918/928`).
- **States** default · hover (`button:hover` `styles.css:92`) · focus-visible (`:101`) · disabled
  (`:110`) · toggle-pressed (`.on` + `aria-pressed`, 9 sites e.g. `app.js:963/980/954`).
- **a11y** ✓ `:focus-visible` ring; ✓ `aria-pressed` on toggle-buttons; ✓ `aria-label` on icon-only
  (`app.js:1445`). ✗ no `forced_colors`.
- **Geometry** `padding:4px 9px; border-radius:5px; gap:6px` — ad-hoc, not a ramp.

```json
{ "component":"button","layer":"component","role":"button","replaces_native":false,
  "parts":["icon","label"],"variant_channel":"css-class (not a prop enum)",
  "states":["hover","focus-visible","disabled","pressed"],"keyboard":["native"],
  "forced_colors":false,"owns_outer_margin":false,
  "flags":["~9 variants encoded as ad-hoc classes, no orthogonal variant×size","no forced-colors"] }
```

### 2 · Toggle / switch  ⚠ worst card

- **Surface** S1. **Sites** 3 — palette Enabled/Disabled (`app.js:2298`), Hue space oklch/cam16
  (`app.js:2427`), Chroma basis peak/gamut (`app.js:2442`).
- **Anatomy** `[ track (with ::after thumb) · label-span ]`. CSS `styles.css:633-646`; the `.track`
  is 34×19 with a 15px ::after thumb that translates on `.on`.
- **API** a bare `<div class="toggle">` with an `onclick` that flips a model boolean. State =
  presence of `.on`.
- **a11y** ✗✗ **none.** It is a `<div>` — **not focusable** (no `tabindex`), **no `role="switch"`**,
  **no `aria-checked`**, **no keyboard** (Space/Enter do nothing), no `aria-label`. A
  pointer-only control. This is the single most severe finding in the inventory.
- **Geometry** ad-hoc (34×19 track / 15px thumb).

```json
{ "component":"toggle","layer":"component","role":null,"replaces_native":true,
  "parts":["track","thumb(::after)","label"],"states":["on"],"keyboard":[],
  "forced_colors":false,"owns_outer_margin":false,
  "flags":["DIV with onclick — not focusable","no role/aria-checked","no keyboard","pointer-only"] }
```

### 3 · Segmented control

- **Surface** S1. **Sites** 6. **Variants** four distinct stylings of one idea:
  - **Inspector tabs** `.segmented` `[Palette|Global|Roles]` — `role=tablist`/`tab`, roving
    tabindex, ArrowLeft/Right (`app.js:2118-2154`). *Well-built.*
  - **Canvas view** `.canvas-seg` `[Ramps|Scrims|Mapping]` — `role=tablist` (`app.js:1379`).
  - **Canvas stops** `.canvas-seg` `role=group` (`app.js:1402`).
  - **Drawer format tabs** `.drawer-tabs` (`app.js:2594`, `styles.css:681`) — **no roving tabindex,
    no arrows, no `role=tab`**.
  - **Figma files** `.figma-files` (`app.js:2625`, `styles.css:690`) — same gap.
- **Anatomy** `[ track (group) · segment (button)[] ]`; active = `.on` (`styles.css:590`).
- **a11y** ✓ the two `.segmented`/`.canvas-seg` tab uses follow APG; ✗ `.drawer-tabs` and
  `.figma-files` are visually identical segmented controls **with none of the keyboard model** →
  inconsistent contract for the same pattern.
- **Composition** A4: composes the button primitive into a capacity-fixed group. No overflow story
  (acceptable — fixed 3–4 segments).

```json
{ "component":"segmented","layer":"component","role":"tablist|group","replaces_native":false,
  "parts":["track","segment"],"states":["on"],"keyboard":["ArrowLeft","ArrowRight (tabs only)"],
  "forced_colors":false,"owns_outer_margin":true,
  "flags":["4 stylings of one pattern","drawer-tabs/figma-files miss the keyboard model","self-margin (styles.css:582)"] }
```

### 4 · Slider / range  ★ the model primitive

- **Surface** S1. **Sites** one helper `slider(label,value,min,max,step,fmtFn,onInput)`
  (`app.js:2205-2230`), ~14 instances (Hue/Chroma/Skew/Lift/Edge-hue `app.js:2306-2326`;
  Tension/L*min/L*max/Damp/Chroma-floor/Falloff/Amplify/Bias `app.js:2395-2418`).
- **Anatomy** `.field` `[ label · readout(<b>) · input[type=range] ]`; track + custom thumb
  (`styles.css:618-631`).
- **API** clean function signature; `fmtFn` for the live readout, `onInput` callback; `data-fk`
  carries a focus key so re-render preserves focus (`app.js:2213`).
- **a11y** ✓ `aria-label` on the input (the sibling `<label>` is deliberately *not* associated —
  documented at `app.js:2214`). Native keyboard (arrows/Home/End) inherited. ✗ no forced-colors on
  the custom thumb.
- **Verdict** the one consistently-factored primitive — every slider goes through one helper.

```json
{ "component":"slider","layer":"component","role":"slider","replaces_native":false,
  "parts":["label","readout","input(range)"],"states":["focus","disabled(native)"],
  "keyboard":["native arrows/Home/End"],"forced_colors":false,"owns_outer_margin":false,
  "flags":["custom thumb has no forced-colors fallback","label not associated (compensated by aria-label)"] }
```

### 5 · Select (native)

- **Surface** S1. **Sites** 3 — Distribution (`app.js:2376`), Curve (`app.js:2388`),
  `.map-raw-select` raw token (`app.js:1907`, with `.ov` override state).
- **Anatomy** native `<select>` + `<option>[]`; `.map-raw-select` is a compact mono variant
  (`styles.css:495-501`).
- **a11y** ✓ native keyboard/picker; ✓ `aria-label` on `.map-raw-select` (`app.js:1911`);
  ✗ Distribution/Curve have **no `aria-label`** and their `<label>` sibling is not associated
  (`app.js:2374/2386`) → screen-reader-nameless.
- **Flag** label-association is inconsistent between the config selects and the map select.

```json
{ "component":"select","layer":"component","role":"combobox(native)","replaces_native":false,
  "parts":["select","option"],"states":["disabled(native)","ov(map only)"],"keyboard":["native"],
  "forced_colors":"native","owns_outer_margin":false,
  "flags":["Distribution/Curve selects have no accessible name","label not associated"] }
```

### 6 · Text input

- **Surface** S1. **Sites** 2 — palette **Name** in `.field` (`app.js:2278`), `.map-raw-input`
  free-text token editor (`app.js:1898`, `.ov` override state).
- **a11y** ✓ `.map-raw-input` has `aria-label` (`app.js:1903`); ✗ **Name** relies on an
  unassociated sibling `<label>` and has no `aria-label` → nameless to SR.
- **Behaviour** both debounce into one undo step (`editDrag`) and survive re-render without losing
  focus/caret (partial `liveRefresh`, documented `app.js:2282-2285`).

```json
{ "component":"text-input","layer":"component","role":"textbox(native)","replaces_native":false,
  "parts":["input"],"states":["focus","ov(map only)"],"keyboard":["native"],
  "forced_colors":"native","owns_outer_margin":false,
  "flags":["Name input has no accessible name","shares input[type=text]/search/select base style (styles.css:114)"] }
```

### 7 · Search input

- **Surface** S1 (gallery). **Sites** 1 — `this._searchInput` (`app.js:692`), **created once and
  reused** across renders so typing never loses focus (the documented bug-fix at `app.js:689`).
- **a11y** ✓ `aria-label` "Search palette sets" + placeholder. Native clear/keyboard.
- **Style** shares the `input[type=text]/search/select` base (`styles.css:114`); width pinned in the
  gallery title (`styles.css:160`).

```json
{ "component":"search-input","layer":"component","role":"searchbox(native)","replaces_native":false,
  "parts":["input"],"states":["focus"],"keyboard":["native"],"forced_colors":"native",
  "owns_outer_margin":false,"flags":["singleton node reused across renders to preserve focus"] }
```

### 8 · Checkbox

- **Surface** S1. **Sites** 1 — "ends bend same way" (`app.js:2331`, native `type=checkbox`).
- **Anatomy** `.mini-check` `<label>` **wrapping** the native input + text (`styles.css:528-529`) →
  label *is* associated (the correct pattern, unlike the sliders/Name input).
- **a11y** ✓ associated label, ✓ `accent-color: var(--accent)`, native keyboard (Space).
- **Note** the only native checkbox; the boolean-toggle role elsewhere is taken by the custom
  `.toggle` (card 2). The contrast is instructive — this one is accessible because it stayed native.

```json
{ "component":"checkbox","layer":"component","role":"checkbox(native)","replaces_native":false,
  "parts":["input","label"],"states":["checked","focus"],"keyboard":["Space (native)"],
  "forced_colors":"native","owns_outer_margin":false,
  "flags":["label-wrapped = associated (the right pattern)","only 1 instance"] }
```

### 9 · Chip / pill

Three unrelated "pill" stylings — a naming/coherence drift, not one primitive:
- **`.tile-tag`** (`styles.css:189-200`) — non-interactive status badge on gallery tiles: palette
  count + "preset"/"ago" (`app.js:609/610/664/665`); `pointer-events:none`, absolute over the thumb.
- **`.damp-presets .preset`** (`styles.css:531-536`) — **interactive** preset chip (a `<button>`),
  pill radius, `.on` active state; rendered by `dampPresets()`.
- **`.map-drift-sum`** (`styles.css:513-515`) — status pill: `.in-sync` (green) / `.has-drift`
  (red) (`app.js:1948`).

```json
{ "component":"chip","layer":"component","role":"status|button","replaces_native":false,
  "parts":["pill"],"states":["on(preset)","in-sync/has-drift(drift)"],"keyboard":["native(preset)"],
  "forced_colors":false,"owns_outer_margin":false,
  "flags":["3 separate pill stylings (tile-tag / preset / drift-sum) — no shared chip primitive"] }
```

### 10 · Field wrapper

- **Surface** S1. **Sites** ~7 (every slider + Name + the selects/toggles in the inspector).
- **Anatomy** `.field` `[ label[ text · readout(<b>) ] · control ]` — label is `display:flex;
  justify-content:space-between` so the readout right-aligns (`styles.css:610-615`).
- **Role** the one genuine layout primitive (token-only, no domain name). Owns `margin-bottom:14px`
  — i.e. it **does set its own outer margin** (`styles.css:610`), the classic drift flag.

```json
{ "component":"field","layer":"primitive","role":null,"replaces_native":false,
  "parts":["label","readout","control(slot)"],"states":[],"keyboard":[],"forced_colors":"n/a",
  "owns_outer_margin":true,"flags":["self-owned margin-bottom (styles.css:610)"] }
```

---

## Contract cards — Data-viz marks (S3)

These are non-interactive SVG/CSS marks (hover-outline at most). Cards are lighter — anatomy +
classes + flags.

### 11 · Swatch / color-cell  ★ most-duplicated primitive

One concept — *a rectangle filled with a color, optionally over a transparency checkerboard* — in
**six idioms**: `.ramp-strip i` (26×40 ramp cell + `.oog` out-of-gamut hatch + hover outline,
`styles.css:442-450`), `.scrim-cell` + `.scrim-fill` (checkerboard, `styles.css:455-466`),
`.map-swatch` + `.map-swatch-fill` (checkerboard token swatch, `styles.css:483-491`), `.swatch-dot`
(`app.js:2270`), `.roles-table .sw` (16px, `styles.css:654`), `.canvas-footer .sw` (12px,
`styles.css:556`). **Flag:** the checkerboard background is copy-pasted in 3 of these; no shared
swatch primitive.

### 12 · Set-tile (composition)

`.set-tile` → `.set-thumb` `[ .strip i[] · .tile-tag×2 · .del ]` + `.set-meta`
(`styles.css:169-214`; built by `buildTiles()`/`buildPresetTiles()`). **Flag (as-found):** the tile was
a `<button>` with a clickable `.del` **`<span>`** inside it — *not* a button-in-button (so valid HTML),
but the delete was mouse-only (a span with `onclick`, no keyboard). **→ Fixed:** the editable tile is now
a `<div role=button>` (Enter/Space) so `.del` is a real, focusable `<button>`. (Preset tiles stay plain
`<button>`s — no nested interactive.)

### 13 · Ramp-row (composition)

`.ramp-row` `[ .enable · .drag-handle (⋮⋮ via ::before) · .ramp-name · .ramp-strip ]`
(`renderRampsScene` in `app.js`). Selectable (`.sel`) and toggle-able (`.off`). **Reorder is
ghost-based:** dragging the `.drag-handle` lifts a viewport-fixed clone (`.drag-ghost`) that tracks
the cursor while the source row collapses and a dashed `.drop-ghost` placeholder opens at the landing
slot; the drop slot is decided relative to that placeholder with a **10px deadzone** so it doesn't
jitter from the reflow (`_beginReorder` / `_buildDragGhost` / `_onReorderMove` / `_syncDropFromPlaceholder`).
`.enable` is now a real `role=button` (Enter/Space-operable); the `.drag-handle` claims the pointer
(`touch-action:none`). The clone is re-parented to the host, so its `light-dark()` tokens are pinned to
the canvas preview's `color-scheme`, not the chrome's.

### 14 · Contrast bar

`.an-bar` `[ .an-bk label · .an-track[ .an-fill(.bad) · .an-thresh 4.5:1 line ] · b(pass/fail) ]`
(`styles.css:326-340`). WCAG contrast viz with a fixed threshold line at 64.3%.

### 15 · Hue wheel

`.hw-circle` (axis) · `.hw-ring` (accent ring) · `.hw-dot` (per-stop dots) — SVG polar plot
(`styles.css:342-346`).

### 16 · Tone / lightness curve

`.lc-axis` · `.lc-ceiling` (gamut fill) · `.lc-toneline` (dashed reference) · `.lc-applied` (accent
curve) · `.lc-dot` — SVG L* curve (`styles.css:540-544`).

### 17 · Damping graph

`.damp-graph` container + `.dg-unity` (dashed identity line) — the differential-damping falloff
curve (`styles.css:537-538`; `graphDamping()` `app.js:2419`).

### 18 · Graph legend

`.an-legend` → `.an-leg` → `.an-leg-mark` with `.solid` / `.faint` / `.fill` series styles
(`styles.css:315-324`). Keys the overlaid series in the analysis graphs.

---

## Overlays (interactive, not primitives)

Noted for completeness (the "everything interactive" scope) but they are *patterns*, not primitives:

- **Export drawer** `dialog.drawer` (`renderDrawer` in `app.js`) — a native `<dialog>` promoted to the
  browser **top layer** via `showModal()`, so `role=dialog`, focus-trap, `::backdrop`, background-inert,
  and `Esc`-to-close come for free; open/close is reconciled after each render by `_syncDrawer` (the
  single source of truth is `exportOpen`). A backdrop click closes it.
- **New-Palette modal** `dialog.newpal` (`renderNewPalette` in `app.js`) — a centered, **header-draggable**
  native `<dialog>` (top layer, like the drawer; `_syncNewPal`). Two columns: a hue × chroma circle
  (`.newpal-hc`) + the reused chroma curve on the left; the derivation selection/picker + a **live
  proposed-palette preview** (`.newpal-pp-*` swatches + `.newpal-ramp`) on the right. The "Derive from"
  strip is swatch-only chips. See `knowledge-06-palette-derivation.md`.
- **Toast** `.toast` — transient confirmation (`role=status`, `aria-live=polite`).

## Notable absence — Radio

**No native radio and no custom radiogroup exists** (`grep type="radio"` → 0). The
mutually-exclusive-choice need is met by **segmented controls** (Distribution could be one; it's a
select) and **native `<select>`**. This is a coherent choice, not an oversight — recorded so the
inventory is complete.

---

## Findings & recommendations

Scored on the COMPOSE/REALIZE quadrant per group. The whole UI is **built-right-ish, designed-wrong**
for a *library* (it works, but there's no reusable contract) — except the data-viz marks, which are
fine as bespoke one-offs.

### Severity-ranked

1. **✅ 🔴 Custom `.toggle` is inaccessible (card 2).** *Fixed* — `switchControl()` now emits a
   `<button role=switch>` with `aria-checked`, `:focus-visible`, and native Space/Enter. (3 sites
   migrated.)
2. **✅ 🔴 No forced-colors support anywhere.** *Fixed* — one `@media (forced-colors:active)` block
   (`styles.css`) re-asserts switch/segment/slider-thumb/chip state with `Highlight`/`ButtonText`
   system colors.
3. **✅ 🟠 Label-association drift.** *Fixed* — `field()` stamps `label[for]` + control `id` (and a
   fallback `aria-label`); Distribution, Curve, Name, Hue space, Chroma basis now have accessible
   names by construction.
4. **✅ 🟠 Segmented control had 4 stylings, 2 without the keyboard model.** *Fixed* — one
   `segmented()` helper (roving tabindex + arrows, `role=tablist`/`group`); all 6 sites migrated,
   incl. drawer-tabs + figma-files. Export tabs now wire `aria-controls`→`role=tabpanel`.
5. **✅ 🟡 Button variant sprawl.** *Fixed* — `btn()` with a 4-term vocabulary `{ghost, primary,
   danger, bare}`; layout classes (`figma-plugin-btn`, `figma-apply`, …) ride `cls`, off the variant
   axis. Variant-bearing + header buttons migrated; remaining uniform-`ghost` buttons adopt `btn()`
   opportunistically (no behavior change).
6. **✅ 🟡 Swatch duplication.** *Fixed (partial, by design)* — `swatch()` + `.swatch` primitive;
   the checkerboard is now defined **once** (was copy-pasted ×2, not ×3 as first stated) and reused by
   `.scrim-cell`/`.map-swatch`/`.swatch.alpha`. The simple opaque chips (inspector dot, role refs)
   migrated; the composite cells (ramp-strip, scrim-cell, footer) keep their layout but share the
   checkerboard.
7. **✅ 🟡 Three "chip/pill" stylings.** *Fixed* — `chip()` + `.chip` primitive with
   `interactive`/`status` modes + tones; `damp-presets` and `map-drift-sum` migrated. (The
   absolutely-positioned `.tile-tag` overlay badge stays separate — it is an overlay, not an in-flow
   chip.)
8. **⏳ 🟡 Self-owned outer margins** on `.field` / `.segmented`. *Deferred — intentional.* Converting
   to parent `gap` means making every inspector panel a flex-column, a layout change with real
   visual-regression risk for a 🟡 win. Left as-is and noted.
9. **✅ ⚪ Set-tile nested interactive.** *Fixed + corrected* — it was a `.del` **`<span>`** (mouse-only)
   inside the tile `<button>`, not a button-in-button (so not invalid HTML, but the delete had no
   keyboard). The tile is now a `<div role=button>` (Enter/Space) so `.del` is a real focusable
   `<button>`.
10. **✅ ⚪ Drawer/Toast semantics + correction.** *Fixed* — drawer gets `role=dialog` +
   `aria-modal` + `aria-label`; toasts get `role=status` + `aria-live=polite`. Correction: `Esc`
   **already** closed the drawer (`app.js` keydown handler). A true focus-trap remains a follow-up.

### Extraction candidates — all landed

All six are now implemented (see Refactor status). Ranked as originally prioritized:

1. **`slider()`** — was already the model; now the documented reference primitive (unchanged).
2. **`segmented()`** ✅ — 6 call-sites, 4 stylings → one helper.
3. **`swatch()`** ✅ — primitive + checkerboard-once (composite cells share it; full cell migration deferred).
4. **`btn()`** ✅ — variant vocabulary established.
5. **`switchControl()`** ✅ — rebuilt accessibly (fixed finding #1 + dedup 3 sites).
6. **`chip()`** ✅ — 3 stylings → one (`.tile-tag` overlay intentionally separate).

### Quadrant snapshot — after the refactor

| Group | COMPOSE | REALIZE | Cell |
|---|---|---|---|
| Slider, Checkbox, Search | ✓ clean, reused | ✓ native a11y | **SHIPPABLE** |
| Switch, Segmented, Chip, Field | ✓ one factory each | ✓ role + keyboard + forced-colors | **SHIPPABLE** *(was REBUILD / designed-wrong)* |
| Button, Select, Text input | ✓ `btn()`/`field()` contract | ~ native or focusable | SHIPPABLE-ish *(remaining ghost buttons adopt `btn()` incrementally)* |
| Data-viz marks (14–18) | ✓ bespoke, fine | ✓ | SHIPPABLE (as one-offs) |
| Swatch | ✓ primitive; composite cells share the checkerboard | ✓ | SHIPPABLE *(cell migration deferred)* |

## GRADE — the new factories (component-decomposer)

A GRADE-mode pass over the six factories, **scored in-context**. Important framing: the
component-decomposer rubric assumes a *shadow-DOM, FACE-based custom-element library*. This app is
deliberately **one light-DOM web component with factory helpers** (the documented helper-factory
scale). So the REALIZE gates the rubric reserves for standalone elements — **B2** autonomous element,
**B3** FACE/form-association, **B1** a sizing ramp — are **N/A-by-design** here (one host element, no
`<form>`s, no declared ramp), not failures. They become real only if a factory is ever extracted into
a standalone library. Graded on that basis:

| Factory | A·COMPOSE (layer→anatomy→API→compose→cohere) | B·REALIZE (geometry→element→semantics→interaction→fidelity) | Cell |
|---|---|---|---|
| **`switchControl()`** | 5 — right layer; named parts; tight `{on,onToggle,label,ariaLabel}` API; no self-margin | 5 — native `<button>`; `role=switch`+`aria-checked`; Space/Enter; `:focus-visible`; forced-colors | **SHIPPABLE** |
| **`segmented()`** | 5 — composes buttons into a group; `role` opt (tablist/group); `controls`→tabpanel; orthogonal | 5 — roving tabindex + arrows (APG); re-focus after render; forced-colors `.on` | **SHIPPABLE** |
| **`field()`** | 5 — layout primitive; label↔control contract; no self-name leakage | 5 — `label[for]`/`id` association; fallback `aria-label`; preserves control's own name | **SHIPPABLE** |
| **`btn()`** | 4 — clean `{ghost,primary,danger,bare}` vocab + `cls` for layout; *−1:* `size` not yet an axis | 5 — native button semantics; `ariaPressed`/`disabled`/icon-only `ariaLabel`; forced-colors | **SHIPPABLE** |
| **`chip()`** | 4 — `interactive`/`status` modes + tones; *−1:* the `.tile-tag` overlay stays a separate primitive (correct, but the family isn't single) | 5 — button(pressed)/span(status); forced-colors border + Highlight | **SHIPPABLE** |
| **`swatch()`** | 4 — one chip primitive + shared checkerboard; *−1:* composite cells (ramp/scrim/footer) not folded in (by design) | 4 — decorative `aria-hidden`; `--sw` size; *−1:* size is free, not on a ramp | **SHIPPABLE** |

**One systemic finding (unchanged by the refactor):** geometry is **ad-hoc, off any ramp** — button
padding `4px 9px`, switch track `34×19`, swatch sizes passed per-call. The component-decomposer's
`(height − glyph)/2` law + XS–2XL ramp is the one thing none of these adopt. Not a regression (it was
always so), but it's the highest-leverage *next* systematic move if this ever grows toward a real
library: a size ramp + derived paddings, machine-checked. Until then the factories are the right
shape for a single internal app.

**Verdict:** all six land in **SHIPPABLE** in-context; none are *designed-right-built-wrong* or
*built-right-designed-wrong*. The two 4/5 COMPOSE scores (`btn` size-axis, `chip`/`swatch` family
completeness) are deferred-by-design scope lines, not defects.
