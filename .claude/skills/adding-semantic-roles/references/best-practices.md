## Best practices — adding or changing a role

The non-obvious do/don'ts (each one is a real trap in this repo), then a worked walkthrough.

### Lockstep — the two hand-written encodings + the literals

- **The answer key is hand-maintained — there is NO `gen:role-table` script.** (The `gen:*` scripts cover
  figma-assets / mcp-assets / categories / type-fonts / preview / figma-ui only.) Editing
  `.claude/docs/spec/data/role-table.json#roleTable` is a manual mirror of the `role(...)` calls, in the same order,
  for the **primary** palette only (shared rows are name-independent; name-prefixed rows use the `primary`
  substitution — `primaryHover`, `onPrimaryActive`). Bump `rolesPerPalette`. The `refs-canonical` gate in
  `test/engine/semantic.mjs` deep-equals `semanticRoles("primary")` against it, key-order included — so a
  wrong order or a missing row fails loudly, not silently.
- **The Figma `code.js roleTable(n)` is a literal second copy.** It can't import. Paste the identical row(s)
  with name substitution done by string concat (`n + "Hover"`, `"on" + N + "Active"`). The binder parity
  gate (`test/figma/binder.mjs`) loads `roleTable` out of `code.js` and compares its derived ref-TARGET SET
  (`{n}/{refKey(light|dark)}`) against `bind-plan`'s canonical set, both directions. So a new role whose refs
  are already produced by another role will NOT flag a missing row — you must add it by discipline, or the
  binder silently won't create that variable. Real incident (2026-06-18): the scrim refs drifted here and
  only the ref-set check caught it, because the steps actually changed.
- **Count literals: SKILL.md step 5 owns the site list — don't re-derive it here.** The why behind the two
  that bite: `test/ui/shell.mjs` is the most-forgotten because it lives under `ui/`, not `engine/`; and
  `test/figma/plugin.mjs`'s `semExpect` is DERIVED from the bundle (no literal to change) but its failure
  message hardcodes the count — update the message for honesty. Scrim-count changes ride the same step; the
  three scrim arrays (`SCRIM_STRENGTH_STEPS` / `SCRIM_SUFFIXES` / `SCRIM_KEYS`) index in lockstep — never
  extend one without the other two.

### Which prose is current vs historical

- **Bump CURRENT counts:** `.claude/docs/spec/references/knowledge-03-semantic-system.md` (the "59 roles" headers),
  `.claude/docs/spec/rubrics/parity-checklist.md` (P1: `semanticRoles('primary').length === 59`), and `CLAUDE.md`
  (the "59 semantic roles" mentions), plus the `src/ui/app.js` inspector label (grep `semantic roles`).
- **LEAVE historical counts untouched:** the "36 vs 37" `surfaceHighest`-divergence anecdote in knowledge-03
  (line ~132) and `references/decomposition.md`; `.claude/docs/spec/CHANGELOG.md` entries (which say "37"); OD/ADR
  decision records ("37 (not 51)"); and color-data files (e.g. `nature.json`). Those record what WAS true at
  a point in time. Bumping them rewrites history and destroys the cautionary tale.
- **Stale comment drift is real and is NOT a gate.** The per-palette role count is repeated in PROSE across
  the emitters (`src/engine/exports.js`), `src/ui/model.mjs`, `src/ui/app.js`, `figma/binder/bind-plan.mjs`,
  the MCP server + `mcp/README.md`, and the root `README.md` — none of which a test checks, so they silently
  rot to the OLD count. After a count change, SWEEP them deliberately (a classified grep is safe; the danger
  is only a careless one): `git grep -nE "\b<oldcount>\b" -- src test mcp '*.md' | grep -iE "role|semantic"`,
  fix the CURRENT-state hits, then re-grep to confirm only historical references remain. `src/ui/mcp-assets.js`
  is GENERATED from `mcp/brand-kit-server.mjs` + `mcp/README.md` — regenerate with `npm run gen:mcp-assets`
  (also run by `npm test`); never hand-edit it. (This very skill must not hardcode the stale line numbers — a
  list of "lines that say 37" is itself fossil-prone; the grep is the durable form.)

### Refs and shape

- **Pick refs from a neighbour in the same group**, mirroring its light/dark grammar: accent states step
  along the ramp mode-mirrored (hover = prime ±1 step → `650/350`, active = prime ±2 → `750/250`);
  outline/container/scrim states step along the 500 ramp (`light === dark`); disabled is a faint translucent
  wash (`500-200` / `500-400` etc.) because there is no neutral/desaturate primitive in the per-palette
  model. An out-of-range or unpadded ref fails `refs-canonical`. Use a scrim step that is in `SCRIM_STEPS`
  (`50,100,200,300,400,500,600,700,800,900,950`) — that satisfies both the general and the scrim-specific
  check (foundations §2).
- **Do NOT add resolved colors anywhere.** A role is refs only; the color is derived. The CSS/OKLCH/DTCG/
  Tailwind/JSON emitters resolve it for every format automatically — there is no leaf list to append to.
  (ShadCN is the one curated map — a new role won't surface there unless you wire it into `SHADCN_ORDER` +
  `MAP`; that is optional and not a gate.)
- **Keep `semanticRoles` canonical.** Per-doc or mode-dependent behavior goes through the resolution layer
  (`applyOnColorContrast` / `applyAccentRef` / `applyRoleOverrides`), never by mutating the table — the
  equality gate depends on `semanticRoles` being a pure function of the palette name.

### Validation loop

Run `node test/engine/semantic.mjs` first — it is the fastest signal and the one that catches a stale
answer key (`refs-canonical`) or a miscounted scrim block (`roles`). Then `node test/engine/exports.mjs`,
`node test/figma/binder.mjs`, `node test/figma/plugin.mjs`, then `npm test`. Finish with
`git grep -nE "\b37\b|\b49\b" src test .claude/docs/spec | grep -i role` and confirm every hit is an intentional
historical reference.

## Worked walkthrough — the interaction-states addition (condensed)

Adding hover/active/disabled across accent, on-accent, outline, outline-variant, and container (the change
that grew the table to 53):

1. **`semantic.js`** — added the `role(...)` calls in each group (e.g. group 1b accent states
   `${n}Hover`/`${n}Active`/`${n}Disabled` with ramp-stepped refs `650/350`, `750/250`, and the
   `500-200` disabled wash; groups 2b/4b/4c/5b mirror on the 500 ramp). Bumped the line-1 "53 …roles"
   comment.
2. **`role-table.json`** — pasted the primary-palette rows (`primaryHover`, …, `outlineVariantDisabled`,
   `containerDisabled`) in the SAME order; set `rolesPerPalette: 53`.
3. **On-color contrast** — the on-accent states `-on-${n}-hover`/`-on-${n}-active` were ADDED to `M` in
   `applyOnColorContrast` (they ride their own state fills 650/350, 750/250). `-on-${n}-disabled` was left
   OUT — disabled opts out of the contrast guarantee (it stays the inert translucent label `500-400`).
4. **Figma `code.js`** — pasted the identical rows into `roleTable(n)` with `n +` / `"on" + N +` concat.
5. **Count literals** — flipped the `53` literals across `test/engine/{semantic,exports}.mjs`,
   `test/figma/{binder,plugin}.mjs`, `test/ui/{shell,headless-boot}.mjs`; updated the `app.js` inspector label
   and the knowledge-03 / parity-checklist current counts. Left the "36 vs 37" anecdote + CHANGELOG alone.
6. **Validate** — `node test/engine/semantic.mjs` (caught one out-of-order answer-key row → fixed), then the
   other three pure verifiers, then `npm test` green. Confirmed no live count was left at the old number.
