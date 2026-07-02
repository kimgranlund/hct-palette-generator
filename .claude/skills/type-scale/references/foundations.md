## Foundations — the model a type-engine change leans on

The load-bearing ideas. If a change feels like it needs a hand-authored size or a new branch, you are
probably fighting one of these. The full *why* (the seven groups, the system relationships, the leading
bands, the target token shape) is owned by `.claude/docs/spec/typography/README.md` — this file is only the mental
model the *procedure* assumes.

### 1. Five layers, one direction of flow

`type.mjs` builds bottom-up: **`cat` → `make7` → a treatment → `typeScale` → an emitter.** Nothing skips a
layer.

- **`cat(role, base, ratio, leading, weight, trackingEm, steps, transform)`** is a thin
  constructor — it just packages one voice's *params* into a record. No sizes are computed here. `steps`
  defaults to `STEPS_5`, `transform` to `"none"`.
- **`make7(o={})`** is the FACTORY: it returns the seven voices as a `{name: catRecord}`
  object, every voice sharing the same STRUCTURE while reading its knobs from `o` (with a default per knob,
  e.g. `o.dRatio ?? 1.25`). The knobs are prefixed by voice: Display `d-` (`dBase/dRatio/dLead/dWeight/
  dTrack/dTransform`), Heading Editorial `he-`, Heading Context `hc-`, Eyebrow `eye-`, Body `b-`, UI `ui-`,
  Code `code-`/`codeWeight`/`codeTrack`. A knob a treatment doesn't pass falls to the `make7` default.
- **A treatment** is `{id, label, note, fonts, categories: make7({...})}`. It supplies
  the **font palette** (`{display, heading, body, ui, mono}` — five roles) and a few character knobs; the
  shared `make7` structure does the rest. `note` is the human description the UI specimen reads.
- **`typeScale(config = {treatment, bodyBase, overrides?, voices?, fonts?})`** resolves a treatment into
  the output object `{treatment, label, fonts, roleOf, categories}` — it runs `buildCategory` over every
  voice and attaches `roleOf` (voice→font-role) and a copy of `fonts`. The three optional channels are
  per-kit overrides layered over the treatment, each **identity-gated** (absent/empty/non-finite ⇒
  byte-identical output): `overrides` = flat per-cell `"<voice>|<step>"`→size map (size only); `voices` =
  `{<voice>:{weight, tracking, leading, ratio}}` reshaping a whole voice; `fonts` = `{<role>: family}`
  per-role custom family (blank/non-string ignored). Unknown `treatment` → `TYPE_TREATMENTS[0]`;
  unknown/`0` `bodyBase` → the treatment's `Body.base`.
- **The emitters** (`typeTokensCSS`, `typeTokensResponsiveCSS`, `typeTokensDTCG`, `typeTokensFigmaModes`)
  operate on the resolved `scale` — they never re-run the math, they read `scale.categories` /
  `scale.fonts` / `scale.roleOf`.

### 2. The seven named voices + the two step sets

The canonical taxonomy (.claude/docs/spec/typography): **Display · Heading Editorial · Heading Context · Heading
Eyebrow · Body · UI · Code** — the three Headings are first-class. Two step ramps (`STEPS_5`/`STEPS_UI` in type.mjs):

- **`STEPS_5`** = `[["XS",−2],["SM",−1],["MD",0],["LG",1],["XL",2]]` — Display, all three Headings, Body.
- **`STEPS_UI`** = `[["3XS",−4],["2XS",−3],["XS",−2],["SM",−1],["MD",0],["LG",1],["XL",2],["2XL",3]]` (8) —
  UI and Code. (41 steps across the seven groups in all.)

`MD` is always exponent 0, i.e. the voice's *base* size. The exponent is the step's signed distance from the
base, so the same modular ratio governs both directions.

**The role map (`roleOf`)** comes straight from each `cat`'s first arg: Display→`display`, both editorial
Headings→`heading`, Body→`body`, UI→`ui`, and the two mono voices — **Heading Eyebrow and Code — →`mono`**
(both `cat("mono", …)`). That mono pairing is deliberate: the eyebrow overline and code both want the
monospaced face. The emitters use `roleOf` to point each voice's CSS/DTCG at the right `--font-{role}`.

### 3. The math — `buildCategory(name, p, factor, overrides, vp)`

For each `[step, n]` in the voice's `steps` (in type.mjs):

```
ratio/weight/leading/trackingEm = vp.{ratio,weight,leading,tracking} if finite, else the treatment's  # per-voice channel
rawModular    = p.base · factor · ratio ** n
derived       = Math.max(8, Math.round(rawModular))   # the modular-scale size (8px floor) — tracking stays on THIS
nice          = niceSize(derived)                     # the "nice number" ladder; bumped past prev if it collides
size          = Math.round(ov) if a positive per-cell override exists, else nice   # the exact manual escape
lineHeight    = Math.round(size · leading)            # re-derives from the RESOLVED size (tracks an override)
letterSpacing = round(derived · trackingEm, 2)        # 2-dp px; optical — an override never moves tracking
weight        = weight                                # flat across steps
textTransform = p.transform || "none"
paragraphSpacing = size; paragraphIndent = 0          # rhythm tracks the resolved size
```

- **Modular scale**: `size = base · ratio^n`. A `ratio` of 1.2 (Minor Third) means each step is 20% larger
  than the last; `TYPE_RATIOS` in type.mjs names the classic musical ratios for the UI's picker
  (minor-second 1.067 … golden 1.618). The `LG/MD ≈ ratio` assert allows quantization slack.
- **The nice-number ladder** (`niceStep`/`niceSize`/`nextNice`): emitted sizes read as FAMILIAR values
  (…12,13,14,15,16,18,20,22,24,28,32,36,40,44,48…) — granularity coarsens as size grows (step 1 ≤16,
  2 ≤24, 4 ≤48, 8 ≤96, else 16), and `nextNice` bumps a rare adjacent-step collision so the quantized ramp
  stays strictly increasing. The bump rides the DERIVED ladder, so a per-cell override never nudges its
  neighbours. Consequence: MD is the *snapped* base (product Display base 54 emits 56), so "MD = base" holds
  only where the base is already on the ladder — the pinned invariant is **Body MD = `bodyBase`** plus
  every-size-on-the-ladder + strictly-increasing (asserted per treatment × bodyBase in `test/engine/type.mjs`).
  The ladder is also what keeps rem exports clean (16px→1rem, 24px→1.5rem).
- **`factor = bodyBase / Body.base`** (in `typeScale`) — the ONE global resize lever. It multiplies every
  voice's base, so the whole system scales together while every ratio is preserved. `bodyBase 20` → Body MD
  20, and Display XL grows proportionally (the bodyBase-scaling assert). Resize via `bodyBase`, never by
  editing individual bases.
- **Optical letter-spacing**: `trackingEm` is an em coefficient, so `letterSpacing` scales WITH the size.
  Negative `trackingEm` (Display) tightens, and tightens *more* at larger steps; positive (UI, the caps
  Headings) loosens. This is why Display.XL is more negative than Display.XS (the tracking-scales-with-size
  assert). Tracking is computed from the DERIVED modular size, so a per-cell size override changes size +
  line-height only — the ratified "size lever; line re-derives; tracking/weight unchanged" rule (pinned by
  the Display-override asserts, which use a non-zero tracking voice).
- **The two override channels** (both identity-gated, see §1): per-cell `overrides` moves ONE step's size;
  per-voice `vp` (from `config.voices`) retunes a WHOLE voice's ratio/weight/leading/tracking — like a
  per-palette Hue. Other voices stay byte-identical.
- **The 8px floor** (`Math.max(8, …)`) keeps the smallest UI/Code steps legible even after a small `bodyBase`.

### 4. Case is per-treatment, not a blanket rule

`textTransform` comes from each voice's `transform` arg. The standing rules:

- **Heading Context** and **Heading Eyebrow** are the two genuine UPPERCASE "caps voices" — `"uppercase"`
  is hardcoded in `make7` for both. They track POSITIVE so small caps open up.
- **Display** defaults to title/sentence case (`o.dTransform ?? "none"`). Only the **Brutalist/`statement`**
  treatment passes `dTransform:"uppercase"` — the one earned ALL-CAPS display. The test
  asserts *exactly one* treatment sets an uppercase Display (the exactly-one-uppercase-Display assert), and
  that Display tracks NEGATIVE (big caps tighten).
- Everything else (Editorial, Body, UI, Code) is sentence case.

### 5. The five treatments — voice, not just a font swap

Each treatment expresses a distinct voice through case + weight contrast + tracking + leading + scale
(fonts in `display/heading/body/ui/mono` order):

| id | label | fonts | the move |
|---|---|---|---|
| `product` | Product / Lifestyle | Inter Tight · Inter Tight · Inter · Inter · JetBrains Mono | calm geometric sans, title-case display, the everyday voice |
| `luxury` | Luxury / Premium | Source Serif 4 · Source Serif 4 · Inter · Inter · JetBrains Mono | high-contrast serif set LIGHT (`dWeight 400`) and large (`dBase 76`), airy prose, wide-tracked labels |
| `editorial` | Editorial / Magazine | Source Serif 4 · Inter Tight · Inter · JetBrains Mono · JetBrains Mono | serif headlines, tight sans subheads, sans long-form body, mono metadata (UI rides mono) |
| `technical` | Technical / Data | Inter (display·heading·body) · JetBrains Mono (ui+mono) | mono-forward, dense, tight leading, restrained scale — display reads as data |
| `statement` | Brutalist / Statement | Inter Tight · Inter Tight · Inter · Inter · JetBrains Mono | one heavy grotesque (`dWeight 900`), ALL-CAPS display, dramatic jumps (`dRatio 1.5`) |

The SCALE + tracking + weight + leading + case relationships are the product; fonts are swappable (free
families only). Note `luxury`'s Display base is 76 (not the `make7` default 60) — treatments override knobs.
Note also `technical` and `editorial` map the **UI** voice to JetBrains Mono (their `fonts.ui` is the mono
family), while `mono` is always JetBrains Mono.

### 6. The emitter shapes

All four take a resolved `scale`; the dimension emitters take `{unit}` — `dimUnit(px, unit)` formats a px
value as `px` (default/identity), or `rem`/`em` = px÷16 with trailing zeros stripped (the nice ladder keeps
these clean: 16px→1rem, 24px→1.5rem).

- **`typeTokensCSS(scale, {unit})`** → `:root` custom props (`--font-{role}: '{family}'` — QUOTED; per-step
  `--type-{voice}-{step}-{size,line,tracking,weight}`) PLUS a utility class per step
  (`.type-display-xl { font-family: var(--font-display); … text-transform: … }`). The class points at the
  voice's role via `roleOf`; `kebab()` lowercases + dash-joins voice/step names.
- **`typeTokensResponsiveCSS(scale, modes, {unit})`** → the full base CSS plus one `@media (min-width: …)`
  block per breakpoint mode (`modes = [{name, minWidth, scale}]`) re-declaring the per-step size vars at
  that mode's scale — utilities + font vars are unchanged, so they auto-track. A mode without a positive
  `minWidth` is skipped; `modes = []` ⇒ identical to the base CSS.
- **`typeTokensDTCG(scale, {unit})`** → `{fontFamily, typography}`: a `fontFamily` group
  (one `{$type:"fontFamily",$value}` per role) and a `typography` group of composite
  `{$type:"typography",$value:{fontFamily, fontSize, lineHeight, letterSpacing, fontWeight:number,
  textCase, paragraphSpacing, paragraphIndent}}` tokens per voice/step (the W3C-DTCG shape). Dimensions are
  unit STRINGS (default px, e.g. `"16px"`); `fontWeight` is a NUMBER; `textCase` carries `textTransform`;
  `fontFamily` is the role's family string (`scale.fonts[role]`).
- **`typeTokensFigmaModes(baseScale, modes)`** → ONE Figma variable collection (`"Typography"`) with
  `modes: ["Base", …breakpoints]` and four FLOAT variables per voice×step
  (`<voice>/<step>/{size,lineHeight,letterSpacing,weight}` — weight too; Figma variables are numbers).
  `disambiguateModeNames` renames a breakpoint named "Base" or a duplicate (`"Wide 2"`) so Figma never
  rejects the import. `modes = []` ⇒ a single "Base" mode equal to the base scale (identity).

### 7. The font-rendering path (offline + Figma plugin)

The engine names families as strings; the *rendering* of those families is a separate concern:

- **`src/ui/type-fonts.js`** exports one thing — `TYPE_FONTS_CSS`, a string of four base64-woff2
  `@font-face` rules (Inter, Inter Tight, Source Serif 4, JetBrains Mono, Latin subset). It is a COMMITTED
  GENERATED asset; the header says "DO NOT EDIT".
- **`scripts/gen-type-fonts.mjs`** fetches each family's Latin woff2 subset from Google's css2 endpoint and
  writes `type-fonts.js`. Its `FAMILIES` array (name + variable `wght` axis — Inter/Inter Tight/Source Serif
  4 at `wght@400..900`, JetBrains Mono at `wght@400..800`) is the source of truth for *which* faces are
  embedded. It is **manual** (`npm run gen:type-fonts`), not in `build`/`test`.
- **`ensureTypeFonts()`** (in `src/ui/app.js`) injects the `<style>` once and eagerly registers all four
  via `new FontFace(...)` + `document.fonts.add` + `load()` (the `<style>` `@font-face` path is lazy — a
  face outside the current treatment would flash the fallback on first use without the eager activation).
  Data URIs, so still offline-safe and store-compliant (`networkAccess:"none"`).