---
name: adding-export-formats
description: >
  Add or change a token OUTPUT FORMAT in nonoun-color-tokens — a new color
  serializer, a Tailwind/shadcn/DTCG/Figma variant, or a type/geometry emitter,
  plus its export-drawer tab and Download-All zip entry. Use whenever a change
  touches src/engine/exports.js, src/engine/type.mjs / geometry.mjs, or someone
  says "add an export format", "emit a new framework / DTCG / Figma file",
  "change an export's output shape", "wire a tab into the export drawer", or
  "a new role didn't show up in shadcn".
---

# Adding (or changing) an export format — nonoun-color-tokens

An export format is one serializer that turns the resolved engine output into a portable artifact (a CSS
string, a DTCG tree, a framework file). The **color** formats live in `src/engine/exports.js` (8 of them);
**type** + **geometry** formats live in `src/engine/type.mjs` and `src/engine/geometry.mjs`. The non-obvious
truth of this repo: almost every color emitter MAPS over each palette's resolved `roles`, so a new semantic
role emits a leaf **automatically** — you add a format, not a per-role branch. The two things that bite are
(1) ShadCN is the deliberate exception to that auto-flow, and (2) a new serializer is invisible until it is
wired into THREE places: `exportAll`, the model's `view.exports`, and the drawer. Depth in `references/`.
The per-format output shapes are owned by `docs/spec/references/knowledge-04-export-formats.md` — cite it,
don't re-derive it. The role-side auto-flow is owned by `adding-semantic-roles` — cite it, don't duplicate.

## The format model (depth in `references/foundations.md`)

`derivePalette(palette, controls, overrides)` (exports.js) computes everything an emitter needs ONCE per
enabled palette and RETURNS `{ name, n, hue, stops, byStop, scrims, roles, keyColors }`: the slug `n`, the 25
solid `stops` keyed by `pad3`, the 11 `scrims` on the 500 ramp, and the **53 resolved `roles`** (each
`{ key, suffix, lightRef, darkRef, light, dark }`, where `light`/`dark` are `{rgb, frac, hex}` ends already
resolved). **There is NO resolver in the returned object** — `resolveRef` is a local closure that runs at
derivation time, so emitters read `r.light`/`r.dark` for a color and use `refKey(r.lightRef)` only for the raw
var-NAME fragment. `derivedAll(state)` maps it over `enabledPalettes` (the `on !== false` filter) in State
order — so **disabled palettes are absent from every format**, for free. Every color emitter starts
`const palettes = derivedAll(state)` and loops.

**The auto-flow vs the ShadCN exception.** `exportCSS / exportOKLCH / exportJSON / exportDTCG / exportUI3 /
exportTailwind` all iterate `p.roles` directly — a 54th role flows through with no edit. **`exportShadcn` does
NOT.** It iterates a fixed `SHADCN_ORDER` (the array starts ~exports.js:504) over a hand-curated suffix-lookup
`MAP` that pulls roles BY SUFFIX (`rs(neutral, "-surface")`, `prime(primary)` = the empty-suffix accent) and
picks the driver palette BY NAME REGEX (`/neutral|gray|grey|slate|stone|zinc|mono/`, `/primary|brand/`,
`/danger|destruct|error|critical|red/`). A new role appears in ShadCN only if you wire it into `MAP` — and
that is a deliberate design choice (ShadCN has a FIXED token contract), not a gate. Don't "fix" it by spilling
all roles in.

**The shared naming rules** (don't reinvent): `pad3` (3-digit stop padding, ADR-006), `slug` (palette → token
namespace), the `--c-*` custom props where raw names end in DIGITS and semantic names end in a WORD so they
share the prefix without collision, `light-dark()` for the mode flip in the semantic layer (ADR-005), and
scrims keyed `500-{step}` at alpha% = step/10. `refKey` (from `semantic.js`) normalizes a ref to its var-name
fragment — emitters use it to build a NAME, never to re-resolve a ref to a color.

## Procedure — add a serializer, then wire its three surfaces

1. **Write the serializer in the right file.** A COLOR format → `export function exportX(state)` in
   `exports.js`; start `const palettes = derivedAll(state)` and loop `p.stops` / `p.scrims` / `p.roles`. Reuse
   `hexOf` / `oklchStr` / `roleOklch` / `colorLeaf` / `pad3` / `refKey` — never hand-format a color, never
   re-resolve a ref. A TYPE format → `typeTokensX(scale)` in `type.mjs` (operate on a resolved
   `typeScale(config)`); a GEOMETRY format → `geomTokensX(scale)` in `geometry.mjs` (a resolved
   `geomScale(config, opts)`). DTCG outputs use the W3C `$type`/`$value` composite shape; `geomTokensFigma` is
   the one that emits UNITLESS `$type:"number"` (Figma float variables) — mirror its sibling, minus the `px`.
2. **Bundle it into `exportAll`** (exports.js, end) — color formats only; the type/geom emitters are bundled
   separately by the UI, not here.
3. **Surface it in the model** so the UI can read it: `src/ui/model.mjs` `projectView` builds `exports = {…}`
   (~line 433) — add your key (JSON-shaped formats are `JSON.stringify(…, null, 2)`; CSS-shaped are raw
   strings). This is the object the drawer reads as `view.exports[id]`.
4. **Wire the drawer tab** (`src/ui/app.js`, `renderDrawer` ~line 4141): add `[id, "Label"]` to the right
   `FORMAT_GROUPS` group (groups are by DESTINATION — CSS · Frameworks · Design tools · Typography · Geometry ·
   Project). A type/geom format also needs an entry in `SYSTEM_CODE` (the lazy generator) + `SYSTEM_LABEL`; a
   color format is read straight from `view.exports[this.exportTab]` and needs neither.
5. **Add it to the Download-All zip** (`downloadAllZip` ~line 4351): push `{ name: "folder/file.ext", data }`
   under the correct system toggle — `sys.color` / `sys.type` / `sys.geometry`. Colour formats ride
   `sys.color`; the `figma/` folder + the experimental `figma-aliased/` cascade (via `this.figmaBundle()`,
   OD-004) live there too. The re-importable config is pushed ALWAYS.
6. **Document the shape** in `docs/spec/references/knowledge-04-export-formats.md` — it is the owner of per-
   format output shapes; add a section (and keep the eight-formats header count consistent if you added a color
   format). For ShadCN/Figma constraint changes, respect the fenced ADR notes (ADR-002 resolved-vs-aliased,
   ADR-007 UI3 is interchange-only) — do not "fix" them.

## Validate (draft → check → fix → re-check)

Run the cheap pure verifier first — it is the fastest signal and gates the emitted SHAPE of every format:

```
node test/engine/exports.mjs    # well-formed DTCG leaves, on-color policy, padding, disabled-palette,
                                 # tailwind @theme + shadcn :root/.dark parity, every format non-empty
node test/engine/type.mjs       # typeTokensCSS/DTCG: fontFamily group + composite typography $type
node test/engine/geometry.mjs   # geomTokensDTCG (dimension) + geomTokensFigma (unitless number) shapes
npm test                        # all of the above + headless-boot (drawer/download) + shell + persist
```

The gate that catches a malformed color leaf is `leaf-valid` in `exports.mjs` (srgb, components in [0,1], hex
reconstructs from components). The gate that catches a format you forgot to bundle is `nonempty` — it loops a
fixed key list (`css/oklch/json/dtcg/ui3/tailwind/shadcn`) over `exportAll`, so a new color format absent from
either `exportAll` OR that key list is not actually checked — add it to BOTH. For a new FRAMEWORK format, add a
dedicated `[gate]` group asserting its load-bearing structure (mirror the `tailwind` / `shadcn` gate groups:
`@theme {` present, `oklch(` values, `:root`/`.dark` token-set parity, disabled palette absent). Don't call it
done until `npm test` is green AND the format renders in the drawer + lands in the Download-All zip.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | `derivePalette` / `derivedAll` (and what they DON'T return), the resolved-role shape, the auto-flow vs the ShadCN curated MAP, the shared helpers (pad3/refKey/colorLeaf/roleOklch), the DTCG `$type`/`$value` shape, the Figma-number variant |
| `references/best-practices.md` | the do/don't (reuse the resolver-free roles, three wiring sites, ShadCN-by-design, ADR fences), a worked walkthrough from the Tailwind+ShadCN addition |
| `references/rubric.md` | score the change before calling it done (shape gate + three-site wiring is the gate) |
| `docs/spec/references/knowledge-04-export-formats.md` | the canonical per-format output shapes + Figma-import constraints (owned there — cite, don't copy) |
| `.claude/skills/adding-semantic-roles/` | the role-side auto-flow + the ShadCN-exception from the role's view (cite, don't duplicate) |