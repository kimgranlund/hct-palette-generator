## Best practices — Figma plugin changes

The non-obvious do/don'ts (each cost a real bug or a review cycle), then a worked debug walkthrough.

### Offline + VM-safe (the constraints a `node --check` can't catch)

- **No network, ever.** Both manifests are `networkAccess: { allowedDomains: ["none"] }` (ADR-010 / AC-P3).
  Do not add `fetch` / `new XMLHttpRequest` / `new WebSocket` / a dynamic `import()` of a remote URL. The
  verifiers grep the comment-stripped source for these and fail (plugin.mjs `offline`; binder.mjs `offline`
  also runs `node --check`). This is also *why* the app's fonts are base64-embedded in `ui.html` — assume no
  CDN, no remote assets, ever.
- **Write `catch (e) {`, never `catch {`.** Figma's plugin VM (jsvm-cpp) is not modern V8: optional catch
  binding (ES2019) PARSE-fails there but loads fine in Node, so your local `node --check` and the verifier's
  own `new Function` load can't see it. The whole plugin failed to run with *"Syntax error: Unexpected token
  {"* (2026-06-17). `test/figma/plugin.mjs`'s `vmsyntax` gate statically forbids it for the APP plugin — keep
  it green. The binder's `code.js` has the same hazard (its one catch is the `main().catch((e) => …)`
  wrapper) but NO static guard, so be disciplined when editing it.
- **Never `figma.notify` a raw error.** Figma policy rejects plugins that show a stack or `e.message`. Pattern
  (both plugins): `main().catch((e) => { console.error("[…]", e); figma.notify("Couldn't … — please try
  again.", { error: true }); figma.closePlugin(); })` (binder), or the message handler's `catch (e)` (app).
  The technical detail goes to `console.error` ONLY. The `compliance` check in BOTH verifiers greps for
  `figma.notify(...e.message/String(e)/.stack...)` and fails the run (it's a run-failing check, not a printed
  pass/FAIL line).
- **No stale "HCT" branding** in a user-facing `notify` or the manifest `name` — the product is "Color Tokens
  by NONOUN" (the contrast/HCT math was removed, ADR-003). The `compliance` check guards this too.

### The binder

- **A "skipped N roles" report is a missing RAW target, not a binder bug.** The binder pushes the
  un-resolvable `"{n}/{refKey}"` name into `missing` and continues. The cause is almost always (a) the raw
  `Color Primitives` weren't applied/regenerated first, or (b) a pad3 / scrim-grammar mismatch (`"{n}/50"`
  instead of `"{n}/050"`, or a scrim step not in the primitives). Check the first `missing` name against the
  actual raw var names before touching `roleTable`.
- **Don't hand-pad or hand-build a target.** Always go through `refKey(ref)` / `targetName(n, ref)`. Hand-built
  strings drift; `refKey` is the single normaliser shared with the semantic layer and `bind-plan.mjs`.
- **A role change is an `adding-semantic-roles` task, not a one-off binder edit.** The binder's `roleTable(n)`
  is ONE parity site of nine. Editing it alone leaves the answer key, `bind-plan.mjs`, and the count literals
  drifted. Follow that skill's lockstep. The binder parity gate compares a SET, so a new role whose refs
  already exist won't flag a missing row — add the row by discipline or the binder silently won't create that
  variable.

### The app apply path

- **Find-or-create, never blind-create — keep `applyBundle` idempotent.** A user re-applies on the same file
  repeatedly; duplicate collections / vars / modes corrupt the Variables panel. The `idempotent` gate proves
  a 2nd run leaves exactly one of each collection and no duplicate vars. Match by name within the collection
  before creating.
- **Prune the full mirror.** Any var not in the current bundle is removed from BOTH collections — that is how
  old-format scrims and removed palettes get cleaned up. Delete semantic orphans before raw orphans (a stale
  semantic var may alias a raw var you're about to remove). If you add a path that creates vars, make sure
  prune still reaches them (the `prune` gate seeds dead vars and asserts they're gone AND reported in the
  returned `pruned` count).
- **Regroup is destructive — keep it behind the always-warn gate.** `rebuildSemantic` deletes + re-creates
  `Color Modes`, detaching bound layers. `renderApplyGate` must NOT offer "don't show again" for the rebuild
  path (`rebuild ? false : <checkbox>`), and `confirmApplyGate` must persist consent only when `!rebuild`.
  Don't make Regroup cookieable. Regroup must leave Color Primitives untouched and not duplicate the
  collection (the `regroup` gate asserts a fresh-but-single `Color Modes` with scrims last).
- **Apply embeds the config in `figma.root` pluginData.** A read-back must reproduce the params losslessly —
  don't drop the `config` from the `apply` message or recover state approximately from colors when the exact
  config is available. The `config` gate proves apply embeds it under `nonoun-color-tokens-config` and
  `load-config` round-trips it (including the legacy `hct-config` key fallback).

### After regenerating the bundle

- **Run `npm run gen:figma-ui`** so `figma/plugin/ui.html` reflects the current `dist/nonoun-color-tokens.html`
  (it embeds `<nonoun-color-tokens>` + the bridge). `npm test` runs it for you, but a hand-built `ui.html` or a
  stale one fails the `ui` gate (it checks for `<nonoun-color-tokens>`, the `figma-init`/`pluginMessage`/
  `figmaBundle` bridge, the `config-loaded`→`applyLoadedConfig` round-trip, and `variables-read`→
  `receiveLiveVariables`). `ui.html` is generated — never hand-edit it.

### Validation loop

Run `node test/figma/binder.mjs` and `node test/figma/plugin.mjs` first — they are the fastest signal and the
ones that catch the two silent killers, `parity` and `vmsyntax` (the per-verifier gate-group list is owned by
`references/rubric.md`). Then `npm test` (its `test/run.mjs` runs both plus the engine/ui suite). Don't trust
a green local app run for a sandbox question — the Node VM is more permissive than Figma's.

## Worked debug walkthrough — the scrim-ref drift (condensed, 2026-06-18)

The symptom was the *binder skipping scrim roles* after the scrim model changed in `semantic.js`.

1. **Routed it**: a `missing` list naming scrim targets the binder couldn't resolve → its hardcoded
   `roleTable(n)` had stale scrim steps that no longer matched the raw primitives the app now generates.
2. **Confirmed with the gate**: `node test/figma/binder.mjs` → `parity` FAIL, naming a drifted target. The
   gate had loaded `roleTable` out of `code.js` and diffed its ref-set against `bind-plan.bindingTargets` —
   the steps had genuinely changed, so the set diff caught it (a count-only change would not have).
3. **Fixed at the source of truth**: this was an `adding-semantic-roles`-shaped change — updated
   `semantic.js`'s scrim arrays, the `role-table.json` answer key, AND pasted the identical scrim rows into
   the binder's `roleTable(n)` with `refKey`-grammar refs (no hand-padding).
4. **Re-checked**: `node test/figma/binder.mjs` green (`parity` + `bindings`), `node test/figma/plugin.mjs`
   green, `npm test` green. Confirmed no `catch {` and no raw error in `figma.notify` survived the edit.