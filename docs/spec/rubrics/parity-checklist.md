# Parity Checklist — Three Implementations

> The engine + role table exist in three places. They must agree. Drift here is the
> highest-frequency real defect (the artifact already silently lost `surfaceHighest`, 36 vs
> 37). Run this whenever any of the three changes.

## The three implementations
| Impl | File | Carries |
|------|------|---------|
| Artifact (the tool) | `nonoun-color-tokens.html` (inline `<script>`) | engine + `semanticRoles` + exporters + UI |
| Reference generator | `gen.js` (+ `hct.js`) | engine + `semanticRoles` + DTCG emit (produces the standalone JSON) |
| Figma plugin | `figma-semantic-binder/code.js` | `semanticRoles` + alias binding (engine math not needed) |

`data/role-table.json` is the **canonical** role table; all three must match it.

## Checks
- **P1 — Role count.** `semanticRoles('primary').length === 37` in all three and in
  `data/role-table.json`.
- **P2 — Role keys.** The ordered set of `key`s is identical across all three.
- **P3 — Refs.** For every role, `light`/`dark` refs match `data/role-table.json` exactly
  (including scrim suffixes and 3-digit-equivalent values).
- **P4 — On-colors.** `on{N}` = `050`/`050`, `on{N}Variant` = `200`/`200` in all three.
- **P5 — Scrims.** 7 scrim roles on the 500 ramp (`500-{step}`, steps in SCRIM_STEPS), in all three.
- **P6 — Constants.** `SCRIM_BASES`, `SCRIM_STEPS`, `PEAK`, stop sets match between artifact
  and `gen.js`.
- **P7 — Engine anchors.** Artifact engine and `hct.js` both pass
  `data/verification-anchors.json` within tolerance.
- **P8 — Padding.** `refKey` behavior identical (solid → pad3; scrim → padded base + `-i`).

## Reference procedure
1. Extract the artifact `<script>`, eval the `semanticRoles`/constants definitions in a
   single scope, dump `semanticRoles('primary')` to JSON.
2. Require `gen.js`'s `semanticRoles`; dump the same.
3. Eval the plugin's `semanticRoles` (the role table is plain data); dump the same.
4. Diff all three against `data/role-table.json`. Any difference fails parity.
5. Run `data/verification-anchors.json` against both engines.

## On failure
Reconcile to `data/role-table.json` (canonical). If the canonical table itself is being
changed, update it first, then propagate to all three in the same change — never edit one
implementation alone.
