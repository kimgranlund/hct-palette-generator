# Typography tokens — reference shape

`typography.tokens.json` is the **target output shape** for the typography feature: the type
analog of the color engine — a few parameters → a systematic, harmonious type scale → exported as
[DTCG](https://tr.designtokens.org/) tokens (and, in the plugin, Figma text styles). It's a real
Figma-exported token set, kept here as the canonical example. The engine that generates it ships in
`src/engine/type.mjs`. Font-role names are
generic (no brand/foundry specifics).

## Structure

| Top-level key | What it is |
|---|---|
| `Number` | a base numeric token |
| `Font Family` | the named **font roles** — `Font: UI`, `Font: Display`, `Font: Code` (mono) |
| `Font Specs` | the **scales**, grouped by role category (below) |
| `$extensions` | Figma mode metadata |

### `Font Specs` — the seven named groups

The engine implements this as **seven groups** (the three Headings are first-class): each is a size ramp,
each step carrying `Size · Line Height · Letter Spacing · Weight · Case · Paragraph Spacing · Indent`.

| Group | Steps | Font role | Case | Letter-spacing character |
|---|---|---|---|---|
| **Display** | `XS … XL` (5) | display | sentence/title (UPPERCASE only in Brutalist) | negative, tightens with size |
| **Heading · Editorial** | `XS … XL` (5) | heading | sentence | ~0 |
| **Heading · Context** | `XS … XL` (5) | heading | **UPPERCASE** | wide positive (caps open up) |
| **Heading · Eyebrow** | `XS … XL` (5) | **mono** | **UPPERCASE** | very wide positive |
| **Body** | `XS … XL` (5) | body | sentence | 0 |
| **UI** | `3XS … 2XL` (8) | ui | sentence | small positive (optical) |
| **Code** | `3XS … 2XL` (8) | **mono** | sentence | 0 |

41 steps in all. Each treatment supplies the font palette + a few character knobs (a shared `make7()`
factory); the engine generates every step's size (modular scale), leading, optical tracking, weight, and
case. Heading-Eyebrow + Code use the mono role; Heading-Context + Heading-Eyebrow are the uppercase caps voices (Display is uppercase only in the Brutalist treatment).

## The system relationships (what the generator derives)

Mirroring color (`{hue, chroma, distribution}` → even tonal ramp), type derives from
`{ base size, modular ratio per category, leading per category, weight ramp, optical tracking
coefficient, font roles }`:

- **Size** = a **modular scale** (e.g. 1.2 Minor Third for UI, 1.333 Perfect Fourth for editorial, 1.5–1.618 for display).
- **Letter Spacing** = `f(size)` — negative to *tighten* large display, positive to *loosen* small UI text (optical).
- **Multi-line Height** = `size × leading` (~1.5 for body/UI, ~1.1–1.25 for display/headings); **Single-line Height** = `size × 1.0`.
- **Weight** ramps by role — heavy Display (800–900), medium Heading, regular Body/UI (~450).

A set of **treatments** (Product/Lifestyle, Luxury, Editorial, Technical/Data, Brutalist) seed these
params, exactly as the color "Color Categories" presets seed palette params.

> Status: **shipped** — `src/engine/type.mjs` (`typeScale` + `typeTokensCSS`/`typeTokensDTCG`) and the Typography editor section generate these tokens.
