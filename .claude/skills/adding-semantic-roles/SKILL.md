---
name: adding-semantic-roles
description: >
  Add or modify a semantic color ROLE (a token like primaryHover, outlineDisabled,
  a new scrim) in nonoun-color-tokens, keeping all parity sites in lockstep so the
  per-palette role count stays correct. Use whenever a change touches
  src/engine/semantic.js or someone says "add a semantic role / token", "add
  hover/active/disabled states", "change a role's ref", "the role count is off /
  53 vs N", or "a count gate is red after I added a role".
---

# Adding (or changing) a semantic role — nonoun-color-tokens

Each palette resolves **53** roles (`semanticRoles(n)` in `src/engine/semantic.js`). The role set lives in
ONE place but is **mirrored and counted in eight others**; the classic break is a half-applied count (one
gate left at the old number — usually `test/ui/shell.mjs`). This skill is the lockstep procedure + the
exact parity sites. The taxonomy/rationale is owned by `docs/spec` — point to it, don't re-derive it.

## The role model (depth in `references/foundations.md`)

`semanticRoles(n)` pushes rows via a local `role(key, suffix, light, dark)`. A **ref** is a stop name:
`'550'` (solid) or `'500-200'` (the 500 color at alpha% = step/10, so `500-200` = 500 @ 20% — a scrim
ramp). Two row shapes:

- **Name-prefixed** (accent + on-accent): `key` carries the palette name — `${n}Hover`, `on${N}Active`;
  `{n}` = lowercase slug, `{N}` = Capitalized. These differ per palette.
- **Shared** (onSurface, placeholder, outline, container, surface, inverse, scrims): `key` is a literal,
  identical for every palette, NOT name-prefixed.

Two resolution-layer twists you must respect: scrims are emitted LAST (so the token list groups
colors→containers→surfaces→scrims); and on-color roles can be **re-pointed** in `applyOnColorContrast` for
`onColorMode:"contrast"` — if you add an `on{N}…` *state*, decide whether it joins that map (see step 3).

## Procedure — move all parity sites together

1. **`src/engine/semantic.js`** — add the `role(...)` call(s) in the right group, matching the
   light/dark ref grammar of its neighbours. If adding scrims, extend `SCRIM_STRENGTH_STEPS` +
   `SCRIM_SUFFIXES` + `SCRIM_KEYS` together (they index in lockstep, weakest→strongest). Bump the
   **header count comment** (line 1 "the 53 semantic token roles"). The `semanticRoles` docstring
   (line ~73 "49-role") is STALE prose — fix it to match while you're here, but it is not a gate.
2. **`docs/spec/data/role-table.json`** — the canonical ANSWER KEY. It has **no generator** (there is no
   `gen:role-table` script) — hand-edit `roleTable` (the primary-palette rows: `key`/`suffix`/`light`/`dark`,
   same ORDER as semantic.js) and bump `rolesPerPalette`. `test/engine/semantic.mjs`'s `refs-canonical`
   gate deep-equals `semanticRoles("primary")` against it, ordered key set included.
3. **On-color contrast** (only if you added an `on{N}…` role): in `applyOnColorContrast`, the `M` map
   (keyed on the role's `suffix`, e.g. `-on-${n}-hover`) re-points it to the better-WCAG end vs its fill.
   A disabled/inert on-color stays OUT of `M` on purpose (it opts out of the contrast guarantee — see how
   `-on-${n}-disabled` is absent today).
4. **`figma/binder/figma-semantic-binder/code.js`** — `roleTable(n)` HARDCODES the same rows (the Figma
   sandbox can't import the `.mjs`). Add the identical row(s) so the binder CREATES the variable. The
   binder parity gate (`test/figma/binder.mjs`) compares the derived ref-target SET, so a row whose refs are
   already covered by another role will NOT flag a missing row — add it by discipline anyway.
5. **Count-gate literals** (grep `53`): update every one —
   `test/engine/semantic.mjs` (`ROLES.length !== 53`), `test/engine/exports.mjs` (`< 53 * enabledCount`),
   `test/figma/binder.mjs` (`!== 53 * NAMES.length`), `test/figma/plugin.mjs` (the `53 roles ×…` failure
   *message* — `semExpect` itself is derived, not a literal), `test/ui/shell.mjs` (`p.roles.length !== 53`
   — **easy to miss**, it lives under `ui/`), `test/ui/headless-boot.mjs` (the `(s4)` `=== 53` Figma-Light
   role count). If you changed the SCRIM count, also fix the scrim asserts: `scrims.length !== 7` in
   `test/engine/semantic.mjs:30` and the `=== 7` group assert `(z)` in `headless-boot.mjs`.
6. **`src/ui/app.js`** — the Roles inspector label (`app.js:4046`, `"53 semantic roles · light / dark refs"`;
   grep `semantic roles`).
7. **`docs/spec` prose** — bump CURRENT-state counts (`knowledge-03-semantic-system.md`,
   `rubrics/parity-checklist.md` P1, this repo's `CLAUDE.md`). **LEAVE historical counts**: the "36 vs 37"
   `surfaceHighest`-divergence anecdote, CHANGELOG entries, OD/ADR decision records ("37 (not 51)"), and
   color-data files (e.g. `nature.json`).

**Auto-flows — do NOT hand-edit:** `src/engine/exports.js` and the CSS / OKLCH / DTCG / Tailwind / JSON
emitters map over each palette's resolved `roles`, so a new role emits a leaf automatically; the app's
Mapping canvas + the MCP brand-kit likewise. **EXCEPTION — ShadCN:** `exportShadcn` (exports.js ~504) maps a
FIXED `SHADCN_ORDER` over a curated suffix-lookup `MAP`, NOT all roles. A new role neither breaks ShadCN nor
appears in it — surface it there only by deliberately wiring it into `MAP`, and that is a design choice, not
a gate. (Several emitter/model/bind-plan files carry STALE `37`/`49` prose in comments — fix the comment in
a file you touch; don't hunt globally, you'd risk a historical count.)

## Validate (draft → check → fix → re-check)

Run the cheap pure verifiers first, then the full suite. Each prints `pass`/`FAIL` per group:

```
node test/engine/semantic.mjs    # deep-equal answer key + refs-canonical + on-colors + scrim count
node test/engine/exports.mjs     # >= 53 × enabled leaves per mode
node test/figma/binder.mjs       # bindingPlan length = 53 × palettes; runtime roleTable ref-set parity
node test/figma/plugin.mjs       # semExpect cascade (derived from the bundle) — message names the count
npm test                         # all of the above + headless-boot (s4) + shell + persist
```

The gate that catches a stale answer key is `refs-canonical` in `semantic.mjs` (ordered key set +
ref deep-equal). The gate that catches a half-applied count is whichever `!== 53` literal you forgot —
most often `test/ui/shell.mjs`. Don't call it done until `npm test` is green AND
`git grep -nE "\b37\b|\b49\b" src test docs/spec | grep -i role` shows only the intentional historical
references.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the two-layer model, ref grammar (solid vs scrim), name-prefixed vs shared, the resolution layer (on-color contrast, accent-ref, overrides) |
| `references/best-practices.md` | the lockstep do/don't, which prose is historical, the on-state contrast decision, a worked walkthrough from the interaction-states change |
| `references/rubric.md` | score the change before calling it done (parity completeness is the gate) |
| `docs/spec/references/knowledge-03-semantic-system.md` · `docs/spec/data/role-table.json` | the canonical taxonomy + rationale + answer key (owned there — cite, don't copy) |
| `docs/spec/rubrics/parity-checklist.md` | the P1–P5 parity checks the tests mechanize |
