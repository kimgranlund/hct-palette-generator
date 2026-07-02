## Foundations — the model an export-format change leans on

These are the load-bearing ideas behind every emitter in this repo. If adding a format feels like it needs a
new color-math path or a per-role special case, you are probably fighting one of these. The full per-format
output shapes + the Figma-import constraints are owned by
`.claude/docs/spec/references/knowledge-04-export-formats.md` — this file is only the mental model the *procedure*
assumes.

### 1. One derivation, every emitter — `derivePalette` / `derivedAll`

`derivePalette(palette, controls, overrides)` (in `src/engine/exports.js`) computes, ONCE per palette,
everything any color format needs and RETURNS `{ name, n, hue, stops, byStop, scrims, roles, keyColors }`:

- `n` — the `slug(name)` token namespace (`"On Surface"` → `"on-surface"`).
- `stops` — `{ [pad3]: { rgb, hex, tone, chroma } }`, the 25 `EXPORT_STOPS` solids, keys 3-digit padded.
- `byStop` — a `Map(stopNumber → rgb)` (used internally for ref resolution).
- `scrims` — `{ 500: { [step]: { rgb, alphaPct, frac, hex } } }`, the 11-step 500 translucency ramp
  (`SCRIM_STEPS = [50,100,200,…,950]`, alpha% = step/10).
- `roles` — the **59 resolved semantic roles**. Each is `{ key, suffix, lightRef, darkRef, light, dark }`
  where `light`/`dark` are `{ rgb, frac, hex }` ends **already resolved** through a LOCAL `resolveRef`
  closure. `frac === 1` for a solid; `frac < 1` for a scrim-backed role (e.g. an outline/container on the
  500 ramp).
- `keyColors` — retained brand colors passed through verbatim (exact OKLCH), present only when set.

**There is no resolver in the returned object.** `resolveRef` is a closure inside `derivePalette`; it runs
at derivation time so the roles arrive pre-resolved. An emitter does NOT resolve refs itself — it reads
`r.light` / `r.dark` for a concrete color, and uses `refKey(r.lightRef)` / `refKey(r.darkRef)` only when it
needs the raw var-name fragment to point a semantic var at a raw one (CSS/OKLCH `light-dark(var,var)`, UI3
in-file aliases, DTCG `aliasData`).

`derivedAll(state)` runs `controlsOf(state)` (which threads the tonal + distribution controls), filters to
`enabledPalettes(state)` (`p.on !== false`), and maps `derivePalette` (passing `state.roleOverrides`) in
State order. **Every color emitter opens with `const palettes = derivedAll(state)` and loops.** The
disabled-palette filter therefore applies to every format with zero per-format code — that is why
`exportTailwind(oneOff)` already omits a disabled palette and the test only has to confirm it.

### 2. The auto-flow — why a new role needs no emitter edit

`exportCSS`, `exportOKLCH`, `exportJSON`, `exportDTCG`, `exportUI3`, and `exportTailwind` all iterate
`p.roles` directly: `for (const r of p.roles) … r.suffix … r.light … r.dark`. So when `semanticRoles(n)` grows
a 54th role, `derivePalette` resolves it, and each of those six emitters spills it into its tree with NO edit.
This is the central design property: **you add a FORMAT (a new serializer), not a per-role case.** A role
author (see `adding-semantic-roles`) relies on the same property from the other direction.

### 3. The ShadCN exception — a fixed contract, by design

`exportShadcn` (exports.js, the `SHADCN_ORDER` array) is the ONE color emitter that does NOT
iterate all roles. It:

- iterates a **fixed `SHADCN_ORDER`** array (`background, foreground, card, … sidebar-ring`) — the ShadCN
  token contract, not the role set;
- builds a hand-curated `MAP` that pulls roles **by suffix** via helpers (`rs(p, suffix)` finds a role by its
  `suffix`; `prime(p) = rs(p, "")` is the empty-suffix accent; `onAccent(p)` matches suffix `-on-${p.n}`);
- picks the **driver palette by NAME REGEX**, so it survives renamed/preset palettes:
  `find(/neutral|gray|grey|slate|stone|zinc|mono/)` drives surfaces, `/primary|brand/` drives primary/ring,
  `/danger|destruct|error|critical|red/` drives destructive, with `success`/`warning`/`secondary` optional.

Consequence for a format author: a new semantic role neither breaks ShadCN nor appears in it. Surfacing it
there means deliberately adding a `SHADCN_ORDER` entry + a `MAP` line — and that is a CHOICE (ShadCN consumers
expect exactly its contract), not a parity obligation. Never "fix" ShadCN by dumping every role into it.

### 4. The shared helpers — never hand-format a color

The serializers are deliberately thin because the formatting primitives are shared:

- `pad3(stop)` → 3-digit key (`"50"→"050"`); `slug(name)` → namespace; `hex2`/`hexOf` → uppercase
  `#RRGGBB`; `hex8(rgb, frac)` → `#RRGGBBAA` scrim; `componentsOf` → srgb `[0,1]` triple.
- `rgbToOklch` + `oklchStr({L,C,H})` / `oklchStrA({L,C,H}, alphaPct)` — the OKLCH string forms. Used by the
  OKLCH/Tailwind/ShadCN paths only; **NOT for color math** (the engine already produced gamut-correct rgb —
  this is a presentation transform).
- `roleOklch(end)` — a resolved role end (`{rgb, frac}`) → an `oklch()` string, adding `/ a%` when
  `end.frac < 1`. This is the one-liner Tailwind and ShadCN both call to print a role.
- `refKey(ref)` (imported from `semantic.js`) — normalizes a ref to its var-name fragment (`'50'`→`'050'`,
  `'500-200'`→`'500-200'`). The single source so a ref can't drift between `50` and `050`. This is what
  emitters use to build a var NAME — they never re-resolve a ref to a color (the role ends already carry it).
- `colorLeaf(rgb, frac, alias)` — the DTCG color leaf: `$type:"color"`, `$value:{colorSpace:"srgb",
  components, alpha:frac, hex}`, `$extensions` (`com.figma.hiddenFromPublishing`, `com.figma.scopes`,
  optional `com.figma.aliasData`). Every DTCG-shaped color leaf goes through it.

### 5. The two-layer model holds across every format

Raw stops + scrims are **flat, mode-independent** values (ADR-005). The light/dark FLIP lives only in the
semantic layer: CSS/OKLCH/Tailwind emit `--c-{n}{suffix}: light-dark(<light>, <dark>)`; DTCG splits it into
two MODE FILES (`Light_tokens.json` / `Dark_tokens.json`, each resolved to that mode's ref); UI3 emits
per-mode in-file aliases; JSON lists `{light, dark}` hex pairs. A new format MUST honor this — emit raw
primitives flat, and express the flip in whatever idiom the target uses. Don't bake a single resolved color
where a mode pair is expected, and don't make raw stops mode-dependent. (Raw var names end in DIGITS, semantic
names end in a WORD, so both share the `--c-` prefix without collision — see the `css-resolves` gate.)

### 6. Type + geometry emitters — the same shape, different engines

Color isn't the only system. `type.mjs` and `geometry.mjs` are parallel engines with their own resolved
scales and emitters:

- **Type** (`type.mjs`): `typeScale(config)` → a resolved scale. Its structure is the **seven named groups**
  `make7` builds — Display · Heading Editorial · Heading Context · Heading Eyebrow · Body · UI · Code — each a
  step ramp whose every step carries size/lineHeight/letterSpacing/weight/textTransform. `typeTokensCSS(scale)`
  → CSS custom props + utility classes; `typeTokensDTCG(scale)` → a `fontFamily` group + a `typography` group
  of W3C composite `$type:"typography"` tokens. Font names with digits MUST be quoted in CSS
  (`--font-…: 'Source Serif 4'`) — unquoted breaks Safari (a logged smoke gotcha).
- **Geometry** (`geometry.mjs`): `geomScale(config, opts)` → a resolved spatial scale (six size rows + radius
  ladder + space scale), optionally composed with a type scale (`opts.typeScale`) so a control's box and text
  share one number. `geomTokensCSS` → CSS; `geomTokensDTCG` → `$type:"dimension"` (px values);
  `geomTokensFigma` → wraps a `{ Geometry: { size, radius, space } }` collection of UNITLESS `$type:"number"`
  tokens (Figma FLOAT variables — the same numbers as the dimension export, minus the `px`).

These emitters are NOT in `exportAll`. The UI bundles them itself: the drawer's `SYSTEM_CODE` lazily generates
them (calling `typeScale` / `geometryScale`), and `downloadAllZip` pushes them under the `sys.type` /
`sys.geometry` toggles (plus `figma/`-folder copies). So wiring a type/geom format is the SAME three-site
discipline, just with the model step replaced by the drawer's `SYSTEM_CODE` + `SYSTEM_LABEL` maps.

### 7. The wiring chain — where a serializer becomes visible

A serializer that no one calls is dead code. The chain a color format travels:

`exports.js exportX` → `exportAll` (the bundle) → `model.mjs projectView` `exports[id]` (the UI-readable map,
~line 433) → `app.js renderDrawer FORMAT_GROUPS` (the tab) → `view.exports[id]` (rendered code) →
`downloadAllZip` (the zip). A type/geom format skips `exportAll`/`model` and instead rides
`SYSTEM_CODE`/`SYSTEM_LABEL` in the drawer + the `sys.type`/`sys.geometry` branch of `downloadAllZip`. Miss
any link and the format exists but is unreachable from the UI — the headless-boot drawer/download tests in
`test/ui/headless-boot.mjs` are the net.