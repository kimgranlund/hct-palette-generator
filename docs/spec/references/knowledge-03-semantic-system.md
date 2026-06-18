# Knowledge 03 — Semantic Token System

> Topic: the two-layer token model and the 37 semantic roles per palette. This is the
> section most prone to silent drift across the three implementations — the full role
> table is the canonical contract in `data/role-table.json`.

## Table of Contents
1. Two-layer architecture
2. Reference grammar
3. The 37 roles (groups)
4. On-colors (the `050` decision)
5. Scrims
6. Surface ramps (mirror vs non-mirror)
7. Mode handling
8. Parity requirement

---

## 1. Two-layer architecture

```
RAW / PRIMITIVES  (mode-independent)         SEMANTIC  (--c-* / role keys)
  {n}-050 .. {n}-950   solid stops             carries the light/dark FLIP
  {n}-500-{step}              scrims           via light-dark(var(light), var(dark))
```

- **Raw primitives are mode-independent.** A raw token is a single value; it does not flip
  between light and dark.
- **The mode flip lives only in the semantic layer.** Each `--c-*` role is
  `light-dark(var(--{n}-{lightRef}), var(--{n}-{darkRef}))`. In Figma terms: raw is one
  collection with a single mode; semantic is one collection with Light + Dark modes that
  alias raw.

> 💡 This split is load-bearing. An earlier design made *all* raw tokens mode-mirror pairs
> (light+dark = 1000) so semantics were plain `var()` aliases. That broke the moment
> non-mirror role mappings were introduced. The current split works for *any* mapping
> because the flip is expressed once, in the semantic layer. See ADR-005.

## 2. Reference grammar

A role's `light` / `dark` field is a **ref**, one of:

- **Solid stop**: `"550"` → the palette's stop-550 color (opaque).
- **Scrim**: `"500-200"` → the palette's 500 color at alpha% = step/10 (here 20%). A scrim
  is a translucency sub-variant of the 500 stop.

`refKey(ref)` pads to 3 digits and preserves the scrim suffix: `"50"→"050"`,
`"500-200"→"500-200"`. Used for token names and CSS `var()` references everywhere.

## 3. The 37 roles (groups)

Full table with exact `light`/`dark` refs: `data/role-table.json` → `roleTable`. Grouped:

| Group | Roles | Notes |
|-------|-------|-------|
| Accent | `{n}` (prime), `{n}Dim`, `{n}Bright`, `{n}Low`, `{n}High` | prime = 550 light / 450 dark |
| On-accent | `on{N}`, `on{N}Variant` | fixed light; see §4 |
| On-surface | `onSurface`, `onSurfaceVariant` | 950/50 and 750/250 |
| Outline | `outline`, `outlineVariant` | on the 500 scrim ramp (500-600, 500-400) |
| Container | `container`, `containerLow`, `containerHigh` | on the 500 scrim ramp (500-200/100/300) |
| Scrim | `scrimWeakest` … `scrimStrongest` (7) | on the 500 ramp; see §5 |
| Inverse | `inverseSurface`, `inverseOnSurface` | 900/100, 50/950 |
| Surface | `background`, `surface` | 100/900, 125/875 |
| Surface Dim/Bright | `surfaceDimmest` … `surfaceBrightest` (6) | non-mirror ramp; see §6 |
| Surface Low/High | `surfaceLowest` … `surfaceHighest` (6) | mirror ramp; see §6 |

`{N}` is the capitalized palette name (`Primary`); the CSS suffix builds `--c-{n}{suffix}`
(e.g. `--c-primary-dim`). The prime role has empty suffix → `--c-{n}`.

## 4. On-colors (the `050` decision)

**Current mapping**: `on{N}` → `050` light / `050` dark; `on{N}Variant` → `200` / `200`.
Both are fixed to the light end in *both* modes, for *all* palettes.

- At `lmax = 100`, every palette's `050` is `#FFFFFF`, so all on-colors render pure white.
- If `lmax` is lowered, `050` becomes a tinted near-white and the on-colors track it
  automatically (they alias `050`).

> ⚠️ **OD-001 — On-color contrast.** Fixed-light on-colors are a deliberate brand choice
> that overrides perceptual contrast. White-on-`Warning` (yellow fill) is ~1.8:1, below the
> WCAG 4.5:1 floor; in dark mode several palettes' fills lighten (prime = 450) and
> white-on-fill contrast drops broadly. A prior revision used *contrast-aware* on-colors
> (auto-pick white/black per fill per mode) — that logic was **removed** at user request.
> See ADR-003. This is the single most likely thing a downstream agent will try to "fix";
> it is intentional.

## 5. Scrims

- **Scrim ramp**: a single **500-based** translucency ramp. A scrim primitive is `500-{step}`
  = the palette's 500 color at **alpha% = step/10** (so `500-200` = 500 @ 20%). `SCRIM_BASES = [500]`,
  `SCRIM_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]` — the 11 **emitted** steps
  (alpha 5–95%). The 7 strength roles bind to a 7-step subset; some emitted steps carry no role.
- **All 12 scrim-using roles** resolve onto this ramp, mode-independent (light === dark): the 7
  `scrim*` strengths (weakest→strongest = steps 50/100/200/400/600/800/950, the full 5–95% range),
  plus `outline` (600), `outlineVariant` (400), and `container/Low/High` (200/100/300).

> **A scrim is a sub-variant of the palette** — based on the 500 stop, it tracks the palette as
> hue/chroma/skew/lift change. This 500-ramp revision **supersedes** the former 3-base model
> (bases 250/500/750 × 7 fixed alpha indices) and the OD-002 base-coverage decision — `outline`
> and `container*`, formerly 250-light/750-dark, are now mode-flat on the 500 ramp (a deliberate
> trade of light↔dark differentiation for a single translucency sub-variant).

## 6. Surface ramps (mirror vs non-mirror)

Two surface elevation families with **different mode behavior** — this distinction is exact
and easy to get wrong:

- **Dim/Bright (non-mirror, mode-consistent)** — same *direction* in both modes:
  `surfaceDimmest 200/950`, `surfaceDimmer 175/925`, `surfaceDim 150/900`,
  `surfaceBright 100/850`, `surfaceBrighter 75/825`, `surfaceBrightest 50/800`.
- **Low/High (mirror, mode-flipping)** — light+dark sum toward 1000:
  `surfaceLowest 50/950`, `surfaceLower 75/925`, `surfaceLow 100/900`,
  `surfaceHigh 150/850`, `surfaceHigher 175/825`, `surfaceHighest 200/800`.

> 💡 Low/High mirror so "lower" always reads as recessed and "higher" as raised regardless
> of mode. Dim/Bright stay mode-consistent so a "dim" surface is literally a darker stop in
> both modes. Both families are inferred tonal variants meant to be tuned to taste.

## 7. Mode handling

- CSS: `--c-{n}{suffix}: light-dark(var(--{n}-{refKey(light)}), var(--{n}-{refKey(dark)}));`
  with `color-scheme: light dark` on `:root`.
- Figma DTCG: the semantic Light/Dark files ship **resolved** colors (no aliasData) so they
  import cleanly; the cascade (edit raw → semantic follows) is provided by the plugin, not
  by JSON import. See `knowledge-04-export-formats.md` and ADR-002.

## 8. Parity requirement

The role table exists in three places — the artifact's `semanticRoles(n)`, `gen.js`'s
`semanticRoles(n)`, and the plugin's `semanticRoles(n)`. They **must** be identical:
37 roles/palette, same keys, same refs. `rubrics/parity-checklist.md` defines the check.
A divergence already happened once (the artifact silently lost `surfaceHighest`, 36 vs 37);
parity is an acceptance gate, not a nicety.
