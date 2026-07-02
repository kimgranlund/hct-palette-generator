# OD-004 — plugin-free Figma import: manual validation

**Status: OPEN spike.** The aliased DTCG export emits the full documented `com.figma.aliasData`
shape (`targetVariableName` + `targetVariableSetName`), which Figma's docs say resolves on native
import *when the target collection already exists in the file* (ADR-002, re-verified 2026-06-15).
Whether the cascade actually resolves end-to-end is **unverified** — there is no Figma in CI, so this
must be checked by hand. The resolved `figma/` export and the NONOUN plugin remain the reliable paths.

This file is the procedure to run that check.

## What to test
Can a user import the tokens into Figma **without the plugin** and get the live raw→semantic
**cascade** (editing a Color Primitive updates every semantic role that aliases it)?

## The artifacts
`npm run build` (or the app's **Export → Download All**) produces a `.zip` with two Figma folders:

- **`figma/`** — resolved colors, no `aliasData`. Always imports cleanly; **no** cascade. The safe
  default (ADR-002).
- **`figma-aliased/`** — the same tokens, but Light/Dark leaves carry `com.figma.aliasData` targeting
  the `Color Primitives` collection. The candidate cascade path. Has a `README.txt` with the short
  version of the steps below.

## Procedure (Figma desktop or web)
1. New file → open the **Variables** panel (a Local variables collection).
2. **Import** `figma-aliased/palette.tokens.json` (the panel's import/⋯ menu).
   - **Expect:** a **`Color Primitives`** collection with one `Value`-mode COLOR variable per
     stop/scrim (`{family}/050` … `{family}/950`, `{family}/500-{step}`).
3. **Import** `figma-aliased/Light_tokens.json`, then `figma-aliased/Dark_tokens.json`.
   - **Expect:** a **`Color Modes`** collection with `Light` + `Dark` modes and the 59 semantic
     variables per palette.
4. Inspect a semantic variable — e.g. `primary/primary` or `primary/surface`:
   - **PASS:** its Light and Dark values show as an **alias** (a chip pointing at a `Color Primitives`
     variable), not a flat color. Then edit a primitive (e.g. `primary/550`) and confirm every role
     that aliases it updates → the cascade resolves **plugin-free**. ✅ OD-004 can move toward DECIDED.
   - **FAIL:** values import as **resolved colors** (no alias), or Figma reports "errors importing N
     tokens". → name+collection `aliasData` does **not** resolve on native import; keep the plugin as
     the cascade path, and leave OD-004 OPEN. ❌

## Record the result
Note the Figma version + date and the outcome (PASS/FAIL + screenshots) in `docs/spec/CHANGELOG.md`
and update **ADR-002 / OD-004** accordingly. If PASS, consider promoting `figma-aliased/` from
"experimental" to a documented plugin-free path. If FAIL, the spike stays OPEN and the README's
"unverified" framing stands.
