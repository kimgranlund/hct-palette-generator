# Knowledge 06 — Palette Derivation (the "New Palette" engine)

> Topic: how a NEW palette is derived from the ones you already have (or from scratch),
> instead of dropping a blank default. The pure math lives in `src/engine/derive.mjs`
> (validated by `test/engine/derive.mjs`); the UI is the New-Palette modal in `app.js`.

## Table of Contents
1. Why it exists
2. The engine (`derive.mjs`)
3. The three modes
4. The neutral rule (Environmental)
5. From a target to a palette
6. The modal (UI)
7. Verification

---

## 1. Why it exists

"+ Palette" used to drop a fixed `hue:200 chroma:60` default. Derivation instead produces a palette
that **relates to the set you already have** — a complement of your primary, a neutral sampled from
the whole set's temperature, or a colour you pick — so a new palette belongs to the family from the
first click. The math is pure and DOM-free so it is unit-tested in isolation and reused by the UI.

## 2. The engine (`derive.mjs`)

Pure functions, no imports, no DOM. The UI extracts **OKLCH samples** (`[L, C, H]`) from the included
context palettes — each palette's vivid identity colour, `hexToOklch(vp.key)` — and calls the engine,
which returns a **target OKLCH**. The UI then seeds a palette from that target (`seedFromKeyColor`) and
retains it as the new palette's `dominant` key colour. Hue math is circular throughout.

Helpers: `weightedMeanHue(samples)` (chroma-weighted circular mean — `Σ C·(cosH, sinH) → atan2`, so a
near-grey contributes almost nothing and saturated members set the temperature), `largestGapHue`,
`bridgeHue`, `meanC` / `meanL`.

## 3. The three modes

### A · Relative — a colour-theory relationship

`deriveRelative(id, samples)`. The single-reference relationships pivot on the **primary** — `samples[0]`,
which the UI orders by **priority** (the first non-neutral included palette; see `_orderedContext`). So
priority ORDER drives the result, **not** chroma weighting — a low-chroma primary still anchors.

| id | target | meaning |
|---|---|---|
| `extend` | `[P_L, P_C, P_H + 30°]` | analogous — continue the primary's family |
| `contrast` | `[P_L, P_C, P_H + 180°]` | the primary's complement |
| `anchor` | `[P_L, P_C, P_H]` | reinforce the primary |
| `recontextualize` | `[P_L, P_C·0.6, P_H + 180°]` | Albers — the primary's complement, muted |
| `complete` | `[meanL, meanC, largestGapHue(all)]` | fill the largest open gap on the wheel (set-based) |
| `bridge` | `[meanL, meanC, bridgeHue(all)]` | mediate the two most-separated hues (set-based) |

`complete` and `bridge` are **set-geometry** relationships — they use the whole context, not just the
primary.

### B · Environmental — a neutral

`deriveNeutral(samples)` — see §4 and `color-neutral-derivation.md`.

### C · Custom — parametric

No context needed: the user sets **Hue + Chroma** directly, or picks a colour with a native
`<input type="color">` (the picked hex is recovered to hue/chroma via `seedFromKeyColor(hexToOklch(hex))`).

## 4. The neutral rule (Environmental)

`deriveNeutral` returns `[0.66, clamp(0.30·meanC, 0.004, 0.018), weightedMeanHue]` — the set's
chroma-weighted-mean hue at a chroma scaled to the palette and clamped firmly into tinted-grey
territory. The full rule, rationale, and worked example are in **`color-neutral-derivation.md`**. The
same rule is baked into `gen-categories.mjs` so every survey/category preset leads with a derived
neutral.

## 5. From a target to a palette

For Relative/Environmental the engine returns a target OKLCH; the UI seeds the palette's `hue`+`chroma`
from it (`seedFromKeyColor(oklch, hueSpace="oklch")`, the same seeding `configFromVariables` uses —
under the default it returns the input's OKLCH hue, or CAM16 for a legacy `hueSpace:"cam16"` doc) and
retains the target as the `dominant` key colour, so the ramp re-derives around it through the perceptual
lens. Custom sets
`hue`/`chroma` straight (no retained key colour). A single `_newPalProposed` PROJECTS the would-be
palette (a throwaway `projectView`) and is the source of truth for **both** the live preview and
`createNewPalette` — they cannot drift.

## 6. The modal (UI)

A centered, header-draggable native `<dialog class="newpal">` (top layer). Two columns:

- **Left — diagrams:** a hue × chroma circle (`.newpal-hc`) plotting every context colour + the proposed
  one (angle = hue, radius ∝ chroma, primary/proposed ring-marked) and the reused chroma-curve graph.
- **Right — selection + preview:** the Relative radios / Environmental note / Custom picker, then a live
  proposed-palette preview — a Dominant swatch, the Primary it pivots on (Relative) + the priority chain,
  and the full generated ramp.

The **"Derive from"** strip is swatch-only chips (palette name on hover); **status palettes**
(success/warning/error/danger/critical/info) start **excluded**. Custom slider/picker input refreshes
the diagrams + preview in place (no full render → the dragged input / OS colour panel survive).

## 7. Verification

- `test/engine/derive.mjs` — weighted-mean hue (warm lean + 350°/10° wrap), the neutral clamp
  (floor/ceiling), the six relationships, **priority beats chroma** (a muted primary anchors over a
  vivid secondary), empty-context no-NaN.
- `(np*)` assertions in `test/ui/headless-boot.mjs` — context pre-seed + system exclusion, the three
  modes, the no-context block, header-drag, swatch-only chips, the two-column diagrams + ramp, the
  in-place Custom refresh, the colour picker, the priority chain.
- Real-browser smoke — the modal renders, is centered + draggable, the Custom picker is seeded, and the
  Dominant changes per relationship while the Primary stays stable.
