## Best practices — adding or changing an export format

The non-obvious do/don'ts (each is a real trap in this repo), then a worked walkthrough from the
Tailwind + ShadCN addition.

### Reuse the derivation and the helpers — don't re-derive

- **Always open a color emitter with `const palettes = derivedAll(state)` and loop `p.stops` / `p.scrims` /
  `p.roles`.** That single call gives you the disabled-palette filter, the resolved roles, the scrim ramp, and
  the 3-digit keys — for free. Re-walking `state.palettes` yourself re-introduces every bug `derivePalette`
  already solved (disabled palettes leaking in, unresolved refs, unpadded keys).
- **The roles arrive pre-resolved — don't resolve refs yourself.** `derivePalette` already resolved each
  role's `lightRef`/`darkRef` into `r.light` / `r.dark` (`{rgb, frac, hex}`). Read those for a concrete color.
  Use `refKey(r.lightRef)` / `refKey(r.darkRef)` ONLY when you need the raw var-NAME fragment (to point a
  semantic var at a raw one — CSS `light-dark(var,var)`, UI3 aliases, DTCG `aliasData`). There is no resolver
  handed to emitters; reaching for `byStop` or re-parsing a ref string is the tell you've gone off the path.
- **Never hand-format a color.** Solids → `hexOf(rgb)` or `oklchStr(rgbToOklch(rgb))`. Scrims → `hex8` /
  `oklchStrA`. A resolved role end → `roleOklch(end)` (it handles the `frac < 1` alpha case). DTCG leaves →
  `colorLeaf(rgb, frac, alias)`. Reaching for your own `toString(16)` or a bespoke `oklch(...)` template is the
  tell you're about to drift from the other seven formats.
- **`rgbToOklch` is presentation-only.** The engine already produced gamut-correct sRGB; the OKLCH transform
  is for the string form, NOT for re-doing color math. Don't route generation through it.

### Honor the two-layer model and the ADR fences

- **Raw primitives stay flat; the flip lives in the semantic layer** (ADR-005). Emit `--c-{n}-050` as a single
  value and express light/dark only on the `--c-{n}{suffix}` roles (via `light-dark()`, two mode files, or
  per-mode aliases — whatever the target idiom is). Don't emit a `light-dark()` raw stop or a mode-branched
  primitive.
- **Don't "fix" the fenced decisions.** `exports.js` lists them in its header: ADR-002 (semantic Light/Dark
  ship RESOLVED colors with NO `aliasData` by default; the `opts.rawColl` opt-in re-adds it — because
  name-only aliasData ERRORS on Figma import), ADR-006 (3-digit padding everywhere), ADR-007 (UI3 is
  interchange-only, not a native Figma path — there's an `OD-003` warning in knowledge-04 that its schema id
  returns zero hits in Figma's docs). A new format that needs cross-collection aliasing follows the `rawColl`
  pattern (see `figmaBundle` in `model.mjs`, which calls `exportDTCG(doc, { rawColl: "Color Primitives" })`);
  it does not invent a third aliasing scheme.

### ShadCN is curated by design — leave the contract alone

- **A new role does NOT belong in ShadCN automatically.** `exportShadcn` maps a fixed `SHADCN_ORDER` over a
  hand-kept `MAP` selecting roles by suffix and palettes by name regex. ShadCN consumers expect EXACTLY its
  token contract; spilling all roles in breaks them. If a token genuinely should drive a new ShadCN slot, add
  one `SHADCN_ORDER` entry + one `MAP` line and keep `:root`/`.dark` parity (every mapped token must appear in
  both blocks — the `shadcn` gate checks the two token SETS are identical). That is a deliberate choice, never
  a parity obligation.

### Wire all three surfaces — a serializer alone is invisible

- **`exportAll` → `model.mjs view.exports` → `app.js` drawer + `downloadAllZip`.** A color format missing from
  `exportAll` is still missing from `model.mjs`'s `view.exports` unless you add it there too; missing from
  `view.exports` the drawer tab renders blank; missing from `FORMAT_GROUPS` it has no tab; missing from
  `downloadAllZip` it's absent from the zip. Walk the chain every time. JSON-shaped formats are
  `JSON.stringify(obj, null, 2)` at the `model.mjs` / drawer boundary (the engine returns an object; the UI
  shows text) — that's `json`/`dtcg`/`ui3`; CSS-shaped formats (`css`/`oklch`/`tailwind`/`shadcn`) are raw
  strings.
- **Type/geom formats skip `exportAll` and the model.** They are generated on demand by the drawer's
  `SYSTEM_CODE` map (+ a `SYSTEM_LABEL`) and bundled by the `sys.type` / `sys.geometry` branch of
  `downloadAllZip`. Don't add them to `exportAll` — that bundle is color-only by contract (its 7 keys:
  css/oklch/json/dtcg/ui3/tailwind/shadcn).
- **`geomTokensFigma` is the unitless one.** When adding a Figma-variable variant, emit `$type:"number"` with a
  bare numeric `$value` (no `px`) and wrap it in a named collection (`{ Geometry: {…} }`). Mirror the DTCG
  sibling exactly, minus the unit — `geomTokensFigma` is the template.

### Document and validate the shape

- **knowledge-04 owns the output shapes.** After adding/changing a format, add or update its section there and
  keep the eight-formats header count consistent if you added a color format. It was just de-staled to the
  8-format reality (7 serializers + `exportAll`) + the ShadCN exception, so it's accurate to extend — don't
  fork a second description into the SKILL.
- **Add a `[gate]` for a new framework format.** The shape gate (`test/engine/exports.mjs`) is the durable net.
  Mirror the `tailwind` / `shadcn` gate groups: assert the load-bearing structure (`@theme {` present,
  `oklch(` values, `:root`/`.dark` token-set parity), that a disabled palette is absent, and add the key to
  the `nonempty` loop's key list. For type/geom, extend `test/engine/type.mjs` / `geometry.mjs` (assert the
  `$type` and px-vs-unitless of the new tokens).

## Worked walkthrough — adding the Tailwind v4 + ShadCN formats (condensed)

The change that took the color formats from 5 to 7 (and `exportAll` to its current 7-key bundle):

1. **`exports.js` — `exportTailwind(state)`** — opened `const palettes = derivedAll(state)`; looped `p.stops`
   to emit the scale (`--color-{n}-{stop}: oklch(...)`, with `String(Number(key))` to drop the pad-3 zero so
   Tailwind keys read `50` not `050`); then looped `p.roles` for the semantic layer
   (`--color-{n}{suffix}: light-dark(roleOklch(r.light), roleOklch(r.dark))`). Wrapped in `@theme { … }`.
   Reused `oklchStr`/`rgbToOklch`/`roleOklch` — no new color math, no ref re-resolution.
2. **`exports.js` — `exportShadcn(state)`** — deliberately did NOT iterate all roles. Defined `SHADCN_ORDER`
   (the fixed contract) + a `MAP` that selects driver palettes by name regex (`neutral`/`primary`/`danger`)
   and roles by suffix (`rs`/`prime`/`onAccent`), then emitted `:root` (light ends) + `.dark` (dark ends) +
   `@theme inline` (mapping `--color-{tok}: var(--{tok})`), all via `roleOklch`. Kept `:root`/`.dark` token
   sets identical.
3. **`exportAll`** — added `tailwind: exportTailwind(state)` and `shadcn: exportShadcn(state)` to the bundle.
4. **`model.mjs view.exports`** — added `tailwind` + `shadcn` keys (raw CSS strings) so the drawer can read
   `view.exports.tailwind` / `.shadcn`.
5. **`app.js` drawer** — added the `["Frameworks", [["tailwind","Tailwind v4"],["shadcn","shadcn/ui"]]]`
   group to `FORMAT_GROUPS`. No `SYSTEM_CODE` entry needed (color formats read straight from `view.exports`).
6. **`downloadAllZip`** — pushed `{ name: \`tailwind/${s}.css\`, data: ex.tailwind }` and
   `{ name: \`shadcn/${s}.css\`, data: ex.shadcn }` under the `sys.color` branch.
7. **knowledge-04** — kept the header count consistent and added the framework-formats note + the explicit
   ShadCN "curated subset, NOT all roles" caveat.
8. **Validate** — added the `tailwind` gate (`@theme {`, a `--color-{name}-500: oklch(` scale var, a semantic
   role as `light-dark(oklch…)`, disabled palette absent) and `shadcn` gate (`:root`/`.dark`/`@theme inline`/
   `--radius`, oklch values, `--color-* → var(--token)`, and `:root`/`.dark` token-set parity); added both keys
   to the `nonempty` loop. Ran `node test/engine/exports.mjs`, then `npm test` green, then confirmed both tabs
   render + land in the zip.