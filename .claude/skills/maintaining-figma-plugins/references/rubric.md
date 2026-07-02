## Rubric — a Figma-plugin change

Scores a change to either Figma plugin in nonoun-color-tokens. `[gate]` = mechanically checkable (a named
verifier / `npm test` / grep); `[review]` = judgment with cited evidence. Score each 1–5. This file OWNS the
per-verifier gate-group list (the authoritative source is each verifier's report loop — the `for (const g of
[...])` near its end): `binder.mjs` prints `bindings · offline · parity`; `plugin.mjs` prints `manifest ·
offline · vmsyntax · ui · parse · apply · cascade · idempotent · prune · floatapply · floatidem · floatprune ·
floatprov · applysys · applydone · config · read`. The `compliance` check runs in BOTH but is run-failing
rather than a printed line; `node --check` is folded into the binder's `offline`.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| F1 | Offline | [gate] | The touched manifest stays `networkAccess: { allowedDomains: ["none"] }`; `code.js` has NO `fetch`/`XMLHttpRequest`/`WebSocket`/dynamic `import()`; the `offline` group passes in both verifiers (the binder folds its manifest+`node --check` into `offline`; the app has a separate `manifest` gate) | 1: a network API or a non-`none` manifest · 3: offline, passes · 5: offline + no remote asset assumed (fonts stay base64) |
| F2 | VM-safe syntax | [gate] | No optional catch binding — `catch (e) {` everywhere, never `catch {`; `plugin.mjs` `vmsyntax` + `node --check` pass (the binder has no static `catch {` guard — uphold it by discipline there) | 1: a `catch {` (runs in Node, breaks in Figma) · 3: `catch (e)` used, passes · 5: passes + no other jsvm-cpp-only construct relied on |
| F3 | Role-table parity | [gate] | The binder's `code.js#roleTable(n)` ref-set EQUALS `bind-plan.bindingTargets` both directions; `bindingPlan` length = `rolesPerPalette` × palettes (owner: `role-table.json`); `node test/figma/binder.mjs` `parity`+`bindings` pass | 1: `parity` red (drifted copy) or a row missing so the binder won't create a var · 3: parity green, refs hand-padded · 5: green, refs via `refKey`, change routed through `adding-semantic-roles` |
| F4 | Friendly errors | [gate] | No raw error in `figma.notify` (detail → `console.error` only); top-level error wrapped (`main().catch` / the handler's `catch (e)`); no stale "HCT" in a notify or manifest name; the `compliance` check (run-failing in both verifiers) passes | 1: surfaces `e.message`/`.stack`, or an unwrapped throw, or "HCT" branding · 3: friendly + wrapped · 5: friendly + a useful actionable message |
| F5 | Apply correctness | [review] | (app path) `applyBundle` is find-or-create + full-mirror prune (semantic orphans first); idempotent (no duplicate collection/var/mode on re-run); `idempotent`+`prune`+`cascade` gates pass; every semantic mode-value aliases a CREATED raw var (the `lt ? alias : rgbaOf` fallback is a safety net, not the path) | 1: blind-create (duplicates) or an un-pruned orphan or an unaliased mode-value · 3: idempotent + pruned + cascaded · 5: + the config embedded in `figma.root` so read-back is lossless |
| F6 | Cascade integrity | [review] | Each semantic var gets a Light AND a Dark alias to the right raw var via `setValueForMode`+`createVariableAlias`; refs go through `refKey`/`targetName`/`aliasTarget`, never hand-built | 1: a static color where an alias should be, a single-mode bind, or a hand-built target · 3: both modes aliased by ref · 5: + the light/dark flip mirrors the role's mode logic |
| F7 | Regroup safety | [review] | (app path) `rebuildSemantic` re-creates `Color Modes` only, leaves Color Primitives intact, doesn't duplicate the collection, and stays behind the ALWAYS-warn gate (`renderApplyGate` renders `rebuild ? false : checkbox`; `confirmApplyGate` persists consent only when `!rebuild`) | 1: Regroup cookieable, or it touches Color Primitives, or duplicates the collection · 3: gated + isolated · 5: + the canonical regroup order (scrims last 7) preserved |
| F8 | Bundle freshness | [gate] | (app path) `figma/plugin/ui.html` regenerated via `npm run gen:figma-ui`; the `ui` gate passes (embeds `<nonoun-color-tokens>` + the figma-init/pluginMessage/figmaBundle/config-loaded/variables-read bridge); `ui.html` not hand-edited | 1: stale/hand-edited `ui.html`, `ui` gate red · 3: regenerated, passes · 5: passes + the round-trip bridges (config + drift) all present |

**Gate to ship:** F1, F2, F3, F4 must each score ≥ 3 (and F8 for an app-path change). A plugin change that
goes online (F1), uses `catch {` the Figma VM rejects (F2), drifts the hardcoded `roleTable` from
`bind-plan` (F3), or leaks a raw error to the user (F4) is not done regardless of how the logic reads — these
are the four that ship a *broken-in-Figma* plugin past a green Node run.

**Top failure to look for first:** a syntax/parity break that Node hides — a `catch {` (F2) or a drifted
`roleTable` ref (F3) both pass a casual local check yet break in the sandbox or silently skip a variable.
Run `node test/figma/binder.mjs` (`parity`) and `node test/figma/plugin.mjs` (`vmsyntax`) before trusting a
"looks done."