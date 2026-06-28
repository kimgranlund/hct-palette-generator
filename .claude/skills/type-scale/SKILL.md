---
name: type-scale
description: >
  Change the TYPOGRAPHY ENGINE in nonoun-color-tokens — the modular type scale,
  the seven named voices (Display · the three Headings · Body · UI · Code), the
  treatments, and the self-hosted fonts (src/engine/type.mjs). Use whenever a
  change touches src/engine/type.mjs, or someone says "add a type treatment / a
  voice group", "change the modular scale / tracking / leading / weight", "the
  type scale is wrong / a step is off", "the line-height / letter-spacing looks
  off", "add or swap a font", "the specimen renders in the fallback font", or "a
  type gate is red". This is the TYPE sibling of color-math (which is COLOR only).
---

# The typography engine — the type scale (nonoun-color-tokens)

One file, `src/engine/type.mjs`, the type analog of the color engine: a few per-voice params → a systematic
scale → DTCG / CSS tokens. Pure, no DOM, no magic numbers — every step's size, line-height, letter-spacing,
weight, and case is **derived** from the treatment's knobs. The conceptual *why* (the seven groups, the
system relationships, the leading bands, the target token shape) is owned by
`docs/spec/typography/README.md` — **cite it, don't re-derive.** Color lives next door in `color-math`;
this skill never touches color.

## The shape — five layers (depth in `references/foundations.md`)

| Layer | What it is | The contract |
|---|---|---|
| **`cat(role, base, ratio, leading, weight, trackingEm, steps, transform)`** (`type.mjs:35`) | builds ONE voice's param record | `{role, base, ratio, leading, weight, trackingEm, steps, transform}` — no resolved sizes yet; `steps` defaults `STEPS_5`, `transform` `"none"` |
| **`make7(o={})`** (`type.mjs:47–57`) | the FACTORY — returns the SEVEN named voices, sharing structure, reading per-voice knobs from `o` | `Display · Heading Editorial · Heading Context · Heading Eyebrow · Body · UI · Code` |
| **`TYPE_TREATMENTS`** (5) (`type.mjs:62–83`) | each = `{id,label,note,fonts,categories:make7({...})}` | ids `product · luxury · editorial · technical · statement` (`statement` = Brutalist) |
| **`typeScale(config={treatment,bodyBase})`** (`type.mjs:106–113`) | resolves a treatment → `{treatment,label,fonts,roleOf,categories}` | `roleOf` maps each voice→font role; `categories[voice][step]` = the resolved step |
| **`typeTokensCSS` / `typeTokensDTCG`** | the two emitters (operate on a resolved `scale`) | CSS custom props + a utility class per step · DTCG composite `typography` tokens |

## The seven voices + the two step sets (the taxonomy the tests pin)

`make7` returns exactly these, in this order. Read the `make7` body (`type.mjs:47–57`) for the live defaults.

| Voice | role (`roleOf`) | steps | case | tracking character |
|---|---|---|---|---|
| **Display** | `display` | `STEPS_5` (XS SM MD LG XL) | title/sentence — `o.dTransform`, UPPERCASE only in `statement` | **negative** (big type tightens) |
| **Heading Editorial** | `heading` | `STEPS_5` | none | ~0 (slightly negative) |
| **Heading Context** | `heading` | `STEPS_5` | **uppercase** (standing caps voice) | **positive** (caps open up) |
| **Heading Eyebrow** | **`mono`** | `STEPS_5` | **uppercase** (standing caps voice) | **wide positive** |
| **Body** | `body` | `STEPS_5` | none | 0 |
| **UI** | `ui` | `STEPS_UI` (3XS 2XS XS SM MD LG XL 2XL, 8) | none | small positive (optical) |
| **Code** | **`mono`** | `STEPS_UI` (8) | none | 0 |

- **`STEPS_5`** = `[XS −2, SM −1, MD 0, LG 1, XL 2]`; **`STEPS_UI`** = 8 steps `3XS −4 … 2XL +3` (`type.mjs:17–18`). MD is always the base (exp 0). **Eyebrow + Code ride the `mono` role**; **Context + Eyebrow are the standing UPPERCASE caps voices.** Display is title/sentence case in EVERY treatment except Brutalist/`statement`, the one that earns ALL-CAPS. 41 steps across the seven groups.

## The math — derived, never hand-authored (depth in `references/foundations.md`)

`buildCategory(p, factor)` (`type.mjs:87–102`), per step `[name, n]`:

```
size           = max(8, round(base · factor · ratio^n))   # the modular scale; MD (n=0) = base·factor; 8px floor
lineHeight     = round(size · leading)                    # per-voice leading (the ui-compose bands)
letterSpacing  = round(size · trackingEm, 2)              # OPTICAL: scales with size — neg tightens, pos loosens
weight         = weight                                   # the voice's weight (flat across steps)
paragraphSpacing = size; paragraphIndent = 0             # schema defaults
```

- **`bodyBase` scales the WHOLE system uniformly.** `factor = bodyBase / Body.base` multiplies every voice's base, so ratios are preserved while the system grows/shrinks together (`typeScale:108–112`). Set `bodyBase`, not individual bases, to resize.
- **Optical tracking** is `trackingEm` × size: Display tracks negative so XL is more negative than XS; UI/Context/Eyebrow track positive so small/caps text opens. This is *why* the tests assert `Display.XL.letterSpacing < 0 < UI.XS.letterSpacing` and `Display.XL < Display.XS`.
- **Leadings sit inside the ui-compose-typography bands**: display 1.05–1.2, heading 1.05–1.3, prose 1.45–1.65, UI 1.25–1.5, mono ~1.5. Stay inside them.
- Unknown `treatment` → `TYPE_TREATMENTS[0]` (`typeScale:107`). Unknown/`0` `bodyBase` → the treatment's `Body.base` (`typeScale:108`).

## The font-quoting guard — the Safari trap

`typeTokensCSS` (`type.mjs:122`) emits `--font-{role}: '{family}';` — **the single quotes are load-bearing.**
A family name with a digit (`Source Serif 4`, `Inter Tight`) is invalid *unquoted* in a strict CSS parser:
**Safari drops the whole declaration and falls back.** The `luxury` treatment uses `Source Serif 4`, so the
verifier pins `typeTokensCSS(typeScale({treatment:"luxury"}))` contains `--font-display: 'Source Serif 4'`
(`test/engine/type.mjs:78–79`). Never emit an unquoted family. (This is the type echo of color's anchors — a
quiet break that *looks* fine in Chrome; see the smoke-is-Chrome-only memory.)

## The self-hosted fonts (the offline / Figma-plugin path)

The 4 families — **Inter, Inter Tight, Source Serif 4, JetBrains Mono** — are base64 woff2 `@font-face`
inlined in `src/ui/type-fonts.js` (one export, `TYPE_FONTS_CSS`), so the specimen renders in the real faces
offline AND inside the Figma plugin (`manifest networkAccess:"none"` hard-blocks the Google Fonts CDN).
`ensureTypeFonts()` (`src/ui/app.js:139`) injects the `<style>` once AND eagerly registers all four via the
`FontFace` API + `load()` (the `<style>` path is lazy — Chromium activates a face only on first use, so a font
outside the current treatment flashes the fallback without the eager load).

- **`src/ui/type-fonts.js` is a COMMITTED generated asset** (header: "DO NOT EDIT"). **Do NOT hand-edit it.** Regenerate with `npm run gen:type-fonts` (= `node scripts/gen-type-fonts.mjs`).
- **`gen:type-fonts` is MANUAL — it is NOT in the build or test chain** (`package.json`: `build`/`test` do not call it). Run it ONLY when the font set changes, then commit the regenerated file. If you add/swap a family in `TYPE_TREATMENTS.fonts`, also add it to the `FAMILIES` array in `scripts/gen-type-fonts.mjs` (name + variable `wght` axis) and regenerate — otherwise the new face has no embedded woff2 and renders in the fallback.

## Procedure — change → check → fix → re-check

1. **Locate the layer.** A wrong size/leading/tracking/weight/case on a voice → a `make7` knob (default in `make7`, override in the treatment's `make7({...})`). A new treatment → push a `{id,label,note,fonts,categories:make7({...})}` row onto `TYPE_TREATMENTS`. A new voice group → add a `cat(...)` line in `make7` (its role flows into `roleOf` from `cat`'s first arg). A bad emitted token → the emitter (`typeTokensCSS` / `typeTokensDTCG`). A wrong/missing rendered face → `src/ui/type-fonts.js` (regenerate) + the treatment's `fonts`.
2. **Edit only `type.mjs`** (+ `scripts/gen-type-fonts.mjs` for a font change). Keep the math in `buildCategory` — never bake a resolved px size into a treatment; pass a `base`/`ratio`/`trackingEm` knob and let the engine derive it. Case is a per-treatment decision via the `transform` arg, not a blanket rule.
3. **Respect the invariants** (the tests assert these): MD = base·factor; sizes strictly increase XS→XL; Display tracks negative + scales with size; Context/Eyebrow uppercase + positive tracking; Eyebrow + Code map to `mono`; Code/UI carry the 8-step `STEPS_UI` ramp; exactly ONE treatment (Brutalist/`statement`) sets an uppercase Display; CSS families stay QUOTED; leadings inside the bands.
4. **New treatment? — add the SEVEN groups by passing the full `fonts` palette** (`display/heading/body/ui/mono` — five roles) so `roleOf` resolves every voice, and supply `note` (the UI specimen copy reads it). The test asserts every treatment has all seven groups + `fonts`.
5. **New font? — wire BOTH ends.** `TYPE_TREATMENTS.fonts` (so a voice uses it) AND `scripts/gen-type-fonts.mjs#FAMILIES` (so it's embedded), then `npm run gen:type-fonts` and commit `src/ui/type-fonts.js`.

## Validate (the anchor-style gate — draft → check → fix → re-check)

Run the pure verifier first (prints `type PASS` / `type FAIL (n)`; exit 1 fails), then the suite:

```
node test/engine/type.mjs    # 5 treatments × 7 groups · roleOf (Eyebrow+Code→mono) · the caps voices ·
                             # exactly ONE uppercase Display (Brutalist) · MD=bodyBase · monotonic XS→XL ·
                             # LG/MD≈ratio · lineHeight=size·leading · optical tracking (Display neg / UI pos) ·
                             # Code 8-step ramp · bodyBase scales uniformly · unknown→first · CSS class +
                             # the QUOTING guard (luxury → --font-display: 'Source Serif 4') · DTCG composite
npm test                     # the above + ui/figma/exports + smoke gen (node test/run.mjs)
```

The guard that catches the Safari font break is the `typeTokensCSS(luxury)` quoting assert (`test/engine/type.mjs:78–79`). The guard that catches a forced-caps Display is the "exactly ONE treatment" filter (`test:26`). Don't call it done until `node test/engine/type.mjs` AND `npm test` are green. If you regenerated fonts, also confirm `src/ui/type-fonts.js` is committed and the specimen renders in the real faces (the smoke is Chrome-only — eyeball Safari for the font path).

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the five layers (`cat`→`make7`→treatment→`typeScale`→emitter), the two step sets, the `buildCategory` math, `bodyBase` scaling, the role mapping, the two emitter shapes, the font-rendering path — the model the procedure assumes |
| `references/best-practices.md` | the non-obvious do/don't (derive-don't-hardcode, the quoting guard, case-is-per-treatment, the manual font regen, both-ends font wiring) + a worked walkthrough from the treatment/specimen history |
| `references/rubric.md` | score the change before calling it done — the seven groups, the math invariants, the quoting guard, and the font wiring are the gates |
| `docs/spec/typography/README.md` | the seven named groups, the system relationships, the leading bands, the target token shape — owned there, cite |
| `building-editor-sections` · `adding-export-formats` | the Typography UI section owns `renderTypographyScene`/specimen copy (cite); the `typeTokensX(scale)` emitters are added/edited there (cite). `color-math` + `geometry-system` are the sibling engine skills |