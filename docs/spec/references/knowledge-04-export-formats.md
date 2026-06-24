# Knowledge 04 — Export Formats

> Topic: the five export formats, their exact output shapes, naming/padding rules, and the
> Figma-import constraints that drove the resolved-vs-aliased decision.

## Table of Contents
1. Format overview
2. CSS (hex) and CSS (OKLCH)
3. JSON
4. Figma DTCG (3-file zip)
5. Collections (UI3)
6. Shared rules: padding, slug, scrims
7. Figma import constraints (why resolved, not aliased)

---

## 1. Format overview

| Tab | `expFmt` | File(s) | Shape |
|-----|----------|---------|-------|
| CSS | `css` | `hct-palette.css` | flat raw vars + `--c-*` semantic via `light-dark()` |
| CSS OKLCH | `oklch` | `hct-palette.oklch.css` | same, values as `oklch()` |
| JSON | `json` | `hct-palette.tokens.json` | meta + per-palette stops/scrims/semantic |
| Figma | `figma` | `figma-tokens.zip` (3 files) | DTCG; raw + Light + Dark, resolved |
| Collections | `ui3` | `figma-ui3-variables.json` | two-collection schema, in-file aliases |

All formats operate over **enabled** palettes (`palette.on`) and **export stops** (25).

## 2. CSS (hex) and CSS (OKLCH)

```
:root{
  color-scheme: light dark;

  /* {Name} — cam16 hue {h}°; flat mode-independent RAW primitives. Raw names end in DIGITS,
     semantic names end in a WORD, so both share the --c- prefix with no collision. */
  --c-{n}-050: {hex};            ... --c-{n}-950: {hex};
  /* scrims (the 500 ramp; alpha% = step/10) */
  --c-{n}-500-50: {hex8};  ...  --c-{n}-500-950: {hex8};
  /* SEMANTIC roles -> light-dark of two raw primitives */
  --c-{n}{suffix}: light-dark(var(--c-{n}-{refKey(light)}), var(--c-{n}-{refKey(dark)}));
}
```

- Raw tokens are **flat single values** (not `light-dark()`), because the mode flip lives in
  the semantic layer (Knowledge 03 §1).
- OKLCH variant emits `oklch(L C H)` for solids and `oklch(L C H / a%)` for scrims; values
  via `rgbToOklch`.

## 3. JSON

```
{
  "model": "HCT (CAM16 H/C + CIELAB L*)",
  "curve", "tension", "lstar":{min,max}, "damp", "hueSpace",
  "scrimAlphas": [...],
  "palettes": [
    { "name", "hue", "chromaPct", "skew",
      "stops":   { "050": {hex, lstar, chroma}, ... },
      "scrims":  { "250": {0:{alpha,hex}, ...}, "500":{...}, "750":{...} },
      "semantic":{ "<roleKey>": {css, light, dark, lightHex, darkHex}, ... }
    }
  ]
}
```
Stop keys padded to 3 digits. The `semantic` block lists every role with its CSS var name
and both resolved hexes.

## 4. Figma DTCG (3-file zip)

`download()` emits `figma-tokens.zip` containing:

- `palette.tokens.json` — **raw** collection, mode `Value`. Solid stops + 11 scrims per
  palette as resolved `colorLeaf`s.
- `Light_tokens.json` — **semantic**, mode `Light`. Every role resolved to a `colorLeaf`.
- `Dark_tokens.json` — **semantic**, mode `Dark`.

`colorLeaf(rgb, alpha)`:
```
{ "$type":"color",
  "$value":{ "colorSpace":"srgb", "components":[r/255,g/255,b/255], "alpha":a, "hex":"#RRGGBB[AA]" },
  "$extensions":{ "com.figma.hiddenFromPublishing":true, "com.figma.scopes":["ALL_SCOPES"] } }
```
`figmaMode(tree, mode)` adds top-level `$extensions.com.figma.modeName`. Export preview shows
the Light semantic tree; the download adds raw + Dark.

The zip is built by a dependency-free **store/deflate writer** (`makeZip`, with `crc32`); it
works fully offline.

**Optional aliasData**: a `rawColl` input (blank by default). When filled, semantic leaves
gain `$extensions["com.figma.aliasData"] = {targetVariableName:"{n}/{refKey}", targetVariableSetName:coll}`.
Blank → plain resolved colors that always import (default). See §7.

## 5. Collections (UI3)

Single file `figma-ui3-variables.json`:
```
{ "$schema":"figma-ui3-variables.color.schema.v1",
  "collections":{
    "Color / Primitives":{ "modes":["Base"],
      "variables":{ "raw/{n}/{050}":{type:"COLOR",values:{Base:"#HEX"}}, ... } },
    "Color / Semantic":{ "modes":["Light","Dark"],
      "variables":{ "{n}/{roleKey}":{type:"COLOR",
        values:{Light:"{raw/{n}/{refKey light}}", Dark:"{raw/{n}/{refKey dark}}"}}, ... } }
  } }
```
Semantic values are **in-file key-path aliases** the importer resolves.

> ⚠️ **OD-003 — UI3 schema authenticity.** `figma-ui3-variables.color.schema.v1` returns
> zero hits in Figma's documentation and is **not** a verified native import format. Do not
> import it via the Variables modal expecting native resolution. It is retained as a
> convenience/interchange shape only. See ADR-007.

## 6. Shared rules: padding, slug, scrims

- `pad3(stop)` → 3 digits (`"50"→"050"`); applied to all stop keys and var refs.
- `slug(name)` → lowercase, non-alphanumeric → `-`, trimmed. Palette name → token namespace.
- `hex8(rgb, frac)` → `#RRGGBBAA` for scrims.
- `SCRIM_BASES=[500]`, `SCRIM_STEPS=[100,175,250,300,400,450,550]`; a scrim `500-{step}` is the 500 color at alpha% = step/10.

## 7. Figma import constraints (why resolved, not aliased)

Researched and verified against Figma's "Modes for variables" documentation:

- Figma's native importer accepts **DTCG** (`$type`/`$value`).
- Same-file alias = `$value:"{token}"`. Cross-collection alias = `com.figma.aliasData`,
  which Figma resolves by matching provided data; names normalize to forward slashes; one
  mode per file.
- Name-only `aliasData` (without the library key UUIDs Figma only mints on export) **errors**
  rather than falling back — this produced the observed "errors importing N tokens".

**Resolution**: semantic Light/Dark ship **resolved** colors (no aliasData) → they always
import. The live cascade (edit raw → semantic follows) cannot be done by JSON import; it is
provided by the companion plugin (`knowledge-05-figma-plugin.md`). The `rawColl` field is the
opt-in escape hatch for users who want aliasData emitted anyway. See ADR-002.
