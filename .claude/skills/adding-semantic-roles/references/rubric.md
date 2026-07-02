## Rubric — a semantic-role change

Scores a role addition/modification in nonoun-color-tokens. `[gate]` = mechanically checkable
(`grep` / a named verifier / `npm test`); `[review]` = judgment with cited evidence. Score each 1–5.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| R1 | Answer-key parity | [gate] | `.claude/docs/spec/data/role-table.json#roleTable` deep-equals `semanticRoles("primary")` (key, suffix, light, dark, ORDER) and `rolesPerPalette` matches; `node test/engine/semantic.mjs` `refs-canonical` passes | 1: `refs-canonical` red (key set / ref / order ≠ canonical) · 3: passes, key-order brittle · 5: passes + `rolesPerPalette` + line-1 header comment all bumped |
| R2 | Figma runtime parity | [gate] | `figma/binder/figma-semantic-binder/code.js#roleTable(n)` has the identical row(s); `node test/figma/binder.mjs` ref-set parity + bindingPlan length pass | 1: row missing (binder won't create the variable) or `binder.mjs` red · 3: present, refs hand-padded · 5: present, refs via `refKey`, parity green |
| R3 | Count-gate completeness | [gate] | EVERY count literal moved together: `test/engine/semantic.mjs`, `test/engine/exports.mjs`, `test/figma/binder.mjs`, `test/figma/plugin.mjs` message, `test/ui/shell.mjs`, `test/ui/headless-boot.mjs` (s4); `npm test` green | 1: any `!== N` left at the old number (a gate red, usually shell.mjs) · 3: all flipped, `npm test` green · 5: green + the scrim asserts (`scrims.length !== 7`, `(z) === 7`) handled if scrims changed |
| R4 | Ref correctness | [review] | New refs are valid primitives in the right grammar (solid in `EXPORT_STOPS`; scrim `500-{step}` with step in `SCRIM_STEPS`, which is the safe rule satisfying both gate checks), and mirror a same-group neighbour's light/dark logic | 1: invalid/out-of-range ref (fails `refs-canonical`) or wrong grammar for the group · 3: valid, plausible · 5: valid + consistent with the group's mode/mirror rule |
| R5 | On-color contrast handling | [review] | A new `on{N}…` role's membership in `applyOnColorContrast`'s `M` is correct (label-on-fill → in, with its OWN state fill; inert/disabled → out) | 1: an on-color state added but contrast not considered (or a disabled label wrongly forced into `M`) · 3: in `M` with the base fill · 5: rides its OWN state fill, disabled correctly excluded |
| R6 | Canonical purity | [gate] | `semanticRoles` stays a pure name→table fn; no resolved colors added; per-doc/mode behavior goes through the resolution layer, not table mutation | 1: a resolved hex or mode-branch baked into the table · 3: pure, refs only · 5: pure + any variability routed through `applyOnColorContrast`/`applyAccentRef`/`applyRoleOverrides` |
| R7 | Prose accuracy | [review] | Current counts bumped (knowledge-03, parity-checklist P1, CLAUDE.md, app.js:4046 label); HISTORICAL counts (36 vs 37, CHANGELOG, ADR/OD, color-data) left intact | 1: a historical count rewritten, or a live label still wrong · 3: live counts right, one stale comment left · 5: live right, history intact, comments in touched files fixed |

**Gate to ship:** R1, R2, R3, R6 must each score ≥ 3. A change whose answer key disagrees (R1), whose Figma
runtime copy is missing the row (R2), that leaves any count gate red (R3), or that mutates the canonical
table (R6) is not done regardless of how clean the new role reads.

**Top failure to look for first:** a half-applied count (R3) — one count literal left at the old number,
most often `test/ui/shell.mjs` (it lives under `ui/`, not `engine/`), producing a red gate that looks
unrelated to the role you added. Grep the current count and confirm every live literal moved before trusting a
"looks done."
