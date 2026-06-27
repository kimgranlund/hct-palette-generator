## Foundations — the model the Figma plugins lean on

The load-bearing ideas behind both plugins. The conceptual *why* (aliasing as the only cascade mechanism) is
owned by `docs/spec/references/knowledge-05-figma-plugin.md`; this file is the mental model the *procedure*
assumes, grounded in the actual `code.js` files.

### 1. Two plugins, one vocabulary, different jobs

Both speak `RAW_COLLECTION = "Color Primitives"` and `SEMANTIC_COLLECTION = "Color Modes"`. They differ in
who builds what:

- **The standalone Binder** (`figma/binder/figma-semantic-binder/`) is alias-only. It assumes the raw
  `Color Primitives` collection already exists (the user ran the app's Apply first, or imported the raw JSON)
  and ONLY creates the aliased `Color Modes` collection on top. If `Color Primitives` is absent it notifies
  *"No 'Color Primitives' collection found — apply your palette in Color Tokens first, then run the Binder."*
  and closes. It has no UI and no `figmaBundle` — its inputs are purely the live variables in the open file.
- **The app-as-plugin** (`figma/plugin/`) is the whole generator running inside Figma. `ui.html` embeds
  `<nonoun-color-tokens>` (built by `npm run gen:figma-ui` from `dist/nonoun-color-tokens.html`); the UI posts
  `figmaBundle()` to `code.js#applyBundle`, which CREATES both collections from scratch, prunes orphans, and
  can rebuild. It needs nothing pre-existing.

A bug report routes by which plugin: *"the binder skipped N roles"* is the binder's `missing` list; *"apply
did nothing / made duplicate collections"* is `applyBundle`.

### 2. The alias cascade — the only live raw→semantic mechanism (knowledge-05 §1)

Native Figma JSON import can't make semantic vars cascade off raw edits: imported colors are either resolved
(static) or matched by fragile name/library key. The plugins instead call
`figma.variables.createVariableAlias(rawVar)` — binding by **reference** to the actual raw `Variable` object.
Edit a raw color and every semantic role aliasing it updates. Each semantic var gets TWO aliases:
`setValueForMode(lightModeId, alias(lightRawVar))` and `setValueForMode(darkModeId, alias(darkRawVar))` —
this is the light/dark flip (the same role points at different raw stops per mode). The exported Light/Dark
JSON files are the static, portable artifact; the plugin is the *live-binding* artifact; both encode the same
role table.

### 3. The binder bind loop, exactly (read `figma-semantic-binder/code.js`)

`main()` is: `getLocalVariableCollectionsAsync` → find `Color Primitives` (bail with a friendly notify if
absent) → `getLocalVariablesAsync` and index by name into `rawVars` → find/create `Color Modes` with mode 0
as Light and mode 1 (or a fresh `addMode("Dark")`) as Dark → loop the 8 `PALETTES` × `roleTable(n)`:

```
ltName = targetName(n, r.light) = "{n}/" + refKey(r.light);  lt = rawVars[ltName]
dtName = targetName(n, r.dark)  = "{n}/" + refKey(r.dark);    dt = rawVars[dtName]
if (!lt) { missing.push(ltName); continue }   // a raw target that doesn't exist
if (!dt) { missing.push(dtName); continue }
semVar = (existing "{n}/{r.key}" in Color Modes) || createVariable("{n}/{r.key}", sem, "COLOR")
semVar.setValueForMode(lightMode, createVariableAlias(lt))
semVar.setValueForMode(darkMode,  createVariableAlias(dt))
```

`refKey(ref)` is the single normaliser (mirrors `semantic.js`): a solid stop zero-pads to 3 digits
(`"50"→"050"`); a scrim `"500-200"` pads the base and keeps `-step` verbatim. Because every `r.light`/`r.dark`
is a ref from the validated role table, every `"{n}/{refKey}"` is GUARANTEED a member of the canonical
raw-colors name set — that is why the binder can't construct a dangling target by hand. `targetName(n, ref)`
centralises this grammar identically to `bind-plan.mjs#targetName`. (Note: the semantic var name uses `r.key`
— `"{n}/{r.key}"`, e.g. `"primary/primaryDim"` — distinct from `bind-plan.mjs`'s `bindingPlan` which names
its `semanticVar` as `"{n}{r.suffix}"`, e.g. `"primary-dim"`; both forms describe the same role.)

### 4. Role-table parity — the hardcoded copy (owned by `adding-semantic-roles`)

The Figma VM can't `import` the `.mjs`, so the binder's `roleTable(n)` is a **literal second copy** of
`semanticRoles(n)`. The pure, importable source of truth is `figma/binder/bind-plan.mjs`, which imports
`semanticRoles` + `refKey` from `src/engine/semantic.js` and exposes:

- `bindingTargets(names)` → de-duped, sorted set of every `"{n}/{refKey(ref)}"` target the binder aliases.
- `bindingPlan(names)` → one `{semanticVar, lightTarget, darkTarget}` per (palette, role), length **53 ×
  palette names** (`rolesPerPalette: 53` in `docs/spec/data/role-table.json`; 8 default palettes).

The parity gate (`test/figma/binder.mjs`) loads `roleTable`/`refKey` straight out of `code.js` (strips the
top-level `main();` call, evals via `new Function`), derives its ref-target set, and diffs it BOTH directions
against `bindingTargets(NAMES)`. So a drift in any ref flags loudly — but a NEW role whose refs are already
produced by another role will NOT flag a missing row (the set already contains those targets). That is why a
role addition must add the binder row by discipline, per `adding-semantic-roles` step 4 — this skill does not
re-own that procedure. (The verifier reports `248 binding targets vs 288 canonical` — the binder only aliases
the stops referenced by roles, a subset of all raw stops; that gap is expected, not a miss.)

### 5. The app apply path — create, embed, prune, rebuild (read `figma/plugin/code.js#applyBundle`)

`applyBundle(dtcg, opts)` is find-or-create + full-mirror prune:

- builds the `Color Primitives` (one "Value" mode) collection — one COLOR var per stop/scrim — and the
  `Color Modes` (Light/Dark) collection — one COLOR var per role, each mode aliased to the matching raw var.
- **idempotent**: a second run finds-and-updates in place; it never makes duplicate collections, vars, or
  modes (the user re-applies on the same file repeatedly).
- **prune**: any var NOT in the current bundle is removed from BOTH collections (old-format scrims, removed
  palettes) so the file mirrors the generator exactly. Semantic orphans are deleted FIRST (a stale semantic
  var may alias a stale raw var about to be removed). Returns `{raw, semantic, pruned, rebuilt}`.
- **`rebuildSemantic`** (the opt-in Regroup): DELETES + re-creates the `Color Modes` collection so it adopts
  the bundle's canonical order (regular → containers → surfaces → scrims; the verifier asserts the last 7
  vars are scrims). Color Primitives untouched; bindings to the dropped semantic vars detach — *why the
  Regroup gate always warns*.
- **graceful fallback**: each mode value is `lt ? createVariableAlias(lt) : rgbaOf(...)` — if a raw target is
  somehow absent, the role gets the resolved color rather than being left unset. In the default bundle every
  target resolves, so the `cascade` gate proves every mode-value IS an alias to a created raw var; the
  fallback is a safety net, not the normal path.
- **config embedding**: apply writes `serialize(this.doc)` into `figma.root` pluginData under
  `CONFIG_KEY = "nonoun-color-tokens-config"` (with a `LEGACY_CONFIG_KEY = "hct-config"` fallback for files
  saved before the rename). This is the source-of-truth round-trip — the exact hue/chroma/skew/lift travels
  IN the `.fig`, so a re-read reproduces the state losslessly, not approximately from the colors.

### 6. The consent gate (grep `src/ui/app.js`)

`requestApplyToFigma(rebuild)` → if a normal apply is already consented (a versioned localStorage key,
`nonoun-color-tokens-apply-consent-v1`, via `_applyConsented()`), apply immediately; otherwise open
`renderApplyGate()` — a *back up your file first* road-block. Normal apply is cookieable ("don't show again"
→ `_setApplyConsent()`); the destructive **Regroup** always re-warns — `renderApplyGate` renders the checkbox
as `rebuild ? false : <checkbox>`, and `confirmApplyGate` only persists consent when `!rebuild`. `applyToFigma`
posts the `apply` message; `_syncApplyGate` reconciles the `<dialog>`. This is a deliberate Figma review gate
(explicit awareness before modifying the file) + destructive-overwrite protection (same-named vars get
overwritten, re-skinning bound components; Regroup detaches bound layers).

### 7. The config round-trip OUT of variables

When a file has no embedded config (or to seed a new set), `configFromVariables(liveVars)`
(`src/ui/model.mjs`, exported there) recovers each family's 500 hue + chroma from the live raw vars — the
APPROXIMATE fallback (it cannot reverse-derive skew/lift/overrides; that is why the embedded config is the
real source of truth). The drift diff is fed by `read-variables` → `variables-read` → `receiveLiveVariables`,
which reads the live Color Primitives values back as `#RRGGBB(AA)` hexes. Geometry uses a separate path:
`geomTokensFigma(scale)` (`src/engine/geometry.mjs`) returns `{ Geometry: { size, radius, space } }` — a
`Geometry` collection of Figma NUMBER (FLOAT) variables, emitted as `dimension.variables.json`, independent
of the color cascade.