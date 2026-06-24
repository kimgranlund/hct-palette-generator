# Decision Records (ADRs)

> These are the **fenced choices**: decisions that are intentional, sometimes
> counter-intuitive, and must survive regeneration. An agent enhancing this spec or
> regenerating the tool should treat each as a constraint with a rationale, not a bug to
> fix. Where a decision overrides an "obvious" correctness rule, it is flagged
> **OVERRIDE** — that is exactly the kind of thing a well-meaning agent will try to undo.

Format: Context → Decision → Rationale → Consequences → Status.

---

## ADR-001 — HCT (CAM16 H/C + CIELAB L\*) over OKLCH-only
- **Context.** OKLCH is the obvious modern choice and the user is fluent in it.
- **Decision.** Use HCT: hue/chroma from CAM16, tone from CIELAB L\*.
- **Rationale.** HCT holds hue and tone stable across a ramp while maximizing chroma within
  gamut at each tone, which yields perceptually even tonal scales for design-system ramps.
  OKLCH is still offered as an *input hue space* (mapped to CAM16) and an *output format*.
- **Consequences.** Heavier engine (full CAM16 forward+inverse). OKLCH input requires the
  sampled hue bridge (ADR-008).
- **Status.** DECIDED.

## ADR-002 — Semantic export ships RESOLVED colors, not aliasData
- **Context.** Ideal would be semantic tokens that alias raw cross-collection so edits
  cascade on import.
- **Decision.** Light/Dark semantic DTCG files contain resolved colors with no `aliasData`
  by default. A `rawColl` field opts into emitting `aliasData`.
- **Rationale.** Verified against Figma's "Modes for variables" docs: cross-collection
  `aliasData` needs library-key UUIDs Figma only mints on export; name-only aliasData
  **errors** on native import (observed "errors importing N tokens") rather than falling
  back. Resolved colors always import.
- **Consequences.** No cascade via JSON import; cascade is delegated to the plugin
  (ADR provides the binder). Resolved files are larger but reliable.
- **Status.** DECIDED (default kept).
- **Re-verified 2026-06-15** (Figma "Modes for variables" help doc). The `com.figma.aliasData`
  extension now documents a resolution **fallback hierarchy**: `targetVariableID` → `targetVariableName`
  within a set matching `targetVariableSetID` → `targetVariableName` within a set matching
  `targetVariableSetName`. So cross-collection aliasing by **name + collection-name** (not a
  library-key UUID) IS a documented path **when the target collection already exists in the file**.
  The original "needs library UUIDs / name-only errors" framing is therefore **softened** — but the
  decision stands: resolved colors remain the always-safe default (import with no preconditions),
  while the aliased path is conditional on the raw-colors collection pre-existing. Pure name-only
  (no `targetVariableSetName`) behavior remains undocumented. Feeds OD-004.
- **Spike 2026-06-17.** The `rawColl` opt-in already emitted the full name+collection shape
  (`targetVariableName` + `targetVariableSetName`); the export verifier now **asserts both** on every
  aliased semantic leaf (`hpg-export-resolved` / AC-X6), so the shape can't silently regress. This is
  SHAPE conformance only — the native-import cascade is still unvalidated end-to-end (no Figma in CI)
  and unexposed in the UI. Default stays resolved; the plugin stays the reliable cascade. Advances
  OD-004 to a **gated spike, not a decision**.

## ADR-003 — On-colors fixed to `050` in both modes  **(OVERRIDE)**
- **Context.** `on{N}` sits on the prime fill. A contrast-optimized system picks white or
  black per fill per mode for contrast. (Note: "perceptually even" — this tool's headline —
  governs ramp *spacing*, not contrast; the two are deliberately distinct, see SKILL Intent.)
- **Decision.** `on{N}` → `050` (both modes), `on{N}Variant` → `200` (both modes), for all
  palettes. The previously implemented **contrast-aware auto-pick logic was removed**.
- **Rationale.** Explicit user/brand requirement: on-colors should be the light tint
  uniformly. The user was shown the contrast data and chose this deliberately.
- **Consequences.** White-on-`Warning` (yellow) ≈ 1.8:1, below WCAG 4.5:1; in dark mode
  several palettes lose contrast as fills lighten. This is **accepted by design**. Tracked
  as OD-001.
- **Status.** DECIDED — **do not reintroduce contrast-aware on-colors without explicit
  instruction.**

## ADR-004 — Semantic scrim roles use base 750 only  **(SUPERSEDED — see the 500-ramp revision)**
> **SUPERSEDED (2026-06-17).** Scrims are now a single **500-based** ramp: a scrim is `500-{step}`
> = the 500 color at alpha% = step/10, and all 12 scrim-using roles (the 7 `scrim*` + outline +
> container/Low/High) resolve onto it, mode-flat (light === dark). Bases 250/750 are no longer
> used. The historical decision is kept below for provenance.
- **Context.** Raw scrims existed on three bases (250/500/750 × 7 alphas). A revision surfaced
  all three as semantic role families (`scrim250*/scrim500*/scrim750*`, 21 roles).
- **Decision.** Revert to 7 unqualified scrim roles (`scrimWeakest…scrimStrongest`) on base
  750. Bases 250 and 500 remain raw primitives only.
- **Rationale.** User clarified that 250/500/750 scrims belong as raw primitives; base 250 is
  a *light* tint overlay and 500 a saturated mid — different overlays, not weaker dark
  scrims — so they were judged not semantically needed.
- **Consequences.** 37 roles/palette (not 51). Tracked as OD-002 in case a use case for
  250/500 semantic scrims appears.
- **Status.** DECIDED.

## ADR-005 — Two-layer model: flat raw + semantic `light-dark()`
- **Context.** The original design made all raw tokens mode-mirror pairs (light+dark=1000),
  so semantics were plain `var()` aliases.
- **Decision.** Raw tokens are flat, mode-independent single values. The light/dark flip is
  expressed once, in the semantic layer, via `light-dark(var(light), var(dark))`.
- **Rationale.** The mirror assumption broke as soon as non-mirror role mappings were
  introduced (e.g. `Dim 650/700`). The flat+semantic split works for any mapping and maps
  cleanly onto Figma's raw(single-mode)/semantic(Light,Dark) collection structure.
- **Consequences.** Every semantic CSS var references two primitives. Mode-switching is
  entirely in the `--c-*` layer.
- **Status.** DECIDED.

## ADR-006 — 3-digit zero padding everywhere
- **Context.** Stops range 50–950; mixing `"50"` and `"050"` causes sort and lookup bugs.
- **Decision.** All stop references zero-pad to 3 digits (`pad3`/`refKey`) in CSS var names,
  CSS refs, JSON keys, DTCG names, and UI3 keys. Scrims keep `"{base}-{step}"` with padded base.
- **CSS var prefix convention (2026-06-17; revised 2026-06-24).** RAW primitives and SEMANTIC roles
  both use the `--c-` prefix: raw are `--c-{family}-{stop|500-step}` and semantic are
  `--c-{family}-{role}`. A raw name's suffix always ends in DIGITS and a semantic name's in a WORD, so
  they never collide despite the shared prefix. (Originally raw used `--c_` with an underscore to
  flag raw-vs-semantic; revised to drop the `_` for a cleaner, all-hyphen CSS namespace — the
  digit-vs-word suffix already disambiguates.) Semantic vars reference raw vars via `var(--c-…)`.
- **Rationale.** Stable lexical sort, exact name matching against the user's `raw-colors`
  collection (which is padded), no ambiguity; the raw/semantic prefix split is self-documenting.
- **Status.** DECIDED.

## ADR-007 — UI3 "Collections" schema is interchange-only, not native  **(CAUTION)**
- **Context.** A `figma-ui3-variables.color.schema.v1` export was added with in-file aliases.
- **Decision.** Keep it as a convenience/interchange format; **do not** present it as a
  native Figma Variables import format.
- **Rationale.** The schema string returns zero hits in Figma's documentation; it is not a
  verified native import path. Importing it via the Variables modal will not resolve as a
  user might expect.
- **Status.** DECIDED. Tracked as OD-003.

## ADR-008 — OKLCH→CAM16 hue is a sampled mapping
- **Context.** Users may enter hues in OKLCH; the engine works in CAM16 hue.
- **Decision.** Map an OKLCH hue to CAM16 by sampling one fixed mid color
  (L=0.72, C=0.10) at that OKLCH hue and reading its CAM16 angle. Memoized.
- **Rationale.** CAM16 hue at a given OKLCH hue varies with L and C; an exact per-color
  mapping is not well-defined for a single "hue input". The fixed sample is a deliberate,
  reproducible compromise.
- **Consequences.** A few degrees of drift vs. an exact mapping. Acceptable for hue *input*;
  not used for output color math.
- **Status.** DECIDED.

## ADR-009 — Fixed viewing conditions (no VC controls)
- **Context.** CAM16 is parameterized by adapting luminance, surround, background.
- **Decision.** Derive one fixed VC (`makeVC`: average surround, bg 50, mid-gray adapting
  luminance) at load. Do not expose VC controls.
- **Rationale.** Target is screen sRGB under average surround — one stable appearance
  context. Exposing VC would make exports non-portable and the chroma peaks unstable.
- **Status.** DECIDED.

## ADR-010 — Single-file, dependency-free, offline
- **Context.** The tool is a design utility that should run anywhere with no setup.
- **Decision.** One self-contained HTML file, vanilla JS, no build step, no runtime
  dependencies; the zip writer is hand-rolled (`makeZip`/`crc32`); persistence falls back
  `window.storage → localStorage → in-memory`.
- **Rationale.** Portability and longevity; the artifact must open and work years later with
  no toolchain.
- **Consequences.** No npm libraries; any new capability must be implemented inline.
- **Status.** DECIDED.
- **Re-framed 2026-06-15 (from the build).** "Single-file" is the **distribution** format, not an
  authoring constraint. The reference build authors **modular ES modules** (engine · tonal · semantic ·
  export · persist) and **bundles** them to one offline HTML (`nonoun-color-tokens.html`, ~111 KB,
  opens via `file://`). Authoring modular *and* distributing single-file are both satisfied — the
  "no build step" line means *no toolchain is required to run it*, not *the source must be one file*.

---

## Quick map: decisions an enhancing agent is most likely to "fix" (don't)
| ADR | Looks wrong because… | But it's intentional because… |
|-----|----------------------|-------------------------------|
| ADR-003 | on-colors fail WCAG on Warning | explicit brand override; contrast-aware was removed on purpose |
| ADR-004 | scrims unified onto one 500 ramp (SUPERSEDED) | scrims now a single 500 ramp; the former base-750-only decision is superseded |
| ADR-002 | semantic could alias raw to cascade | native import errors on name-only aliasData; plugin does cascade |
| ADR-007 | a real-looking Figma schema isn't imported | the schema is unverified/non-native |
