## Foundations — the release model this workflow assumes

The load-bearing facts. If a ship feels wrong, one of these is being fought.

## 1. Two gates, asymmetric dependencies

`npm test` is the **zero-dependency** gate: it needs **no browser and no `node_modules`** for the
engine/shim parts. Its first acts are the generators (`gen:figma-assets`, `gen:mcp-assets`,
`gen:categories`), `bundle`, and `gen:figma-ui` — *then* `node test/run.mjs` (engine verifiers + a custom
headless-DOM **shim**, not jsdom, not a real browser). Because the generators run first, a green `npm test`
also **leaves the committed artifacts in sync with source** — that is why you commit them after the gate
and never hand-edit them.

`npm run build` is the **build-chain** gate: `gen:figma-assets`+`gen:mcp-assets`+`gen:categories` → `tsc` →
`vite build` → `bundle` → `gen:figma-ui`. It **needs `node_modules`** (vite/tsc resolve from there). Run it
only when you touched the build chain (TS sources, vite config, `scripts/` generators, bundled fonts) — for
a pure engine/UI-logic change, `npm test` is sufficient locally and CI runs the full build anyway.

## 2. CI is the smoke gate — and it is Chrome-only

`.github/workflows/ci.yml` runs `npm install` → `npm run build` → `npm test` → **`npm run smoke`** on
`ubuntu-latest`, node 22 (smoke uses node's global WebSocket, stable in 22). Smoke boots the built
single-file in the runner's **headless Chrome over CDP** and drives gallery → category → editor → export
dialog; it catches UI regressions the DOM shim can't. Screenshots land in `smoke-out/` (gitignored) and
upload as the `smoke-screenshots` artifact (`if: always()`).

You typically **cannot reproduce smoke's value locally** (it needs Chrome). So: let CI be the smoke gate,
and for a UI change, **download and look at the `smoke-screenshots` artifact**. Critically, **green smoke is
NOT cross-browser proof** — the user develops and previews in **Safari**, and WebKit is stricter (unquoted
font-family idents with digits, some variable-font edges, parsing). A Safari rendering question must be
reasoned from the CSS spec or reproduced in Safari, never declared safe because Chrome smoke passed.

## 3. Squash-merge: the branch *looks* unmerged after landing

The repo squash-merges. The whole PR collapses into **one** commit on `main` whose subject is the **PR
title** (see `git log --oneline`: `feat(engine): … (#41)`, `feat(geometry): … (#97)`). Two consequences:

- The PR **title** is the permanent changelog line — write it as a conventional-commit subject with the
  real summary, not "address review" or "wip".
- Git's merge-tracking does **not** see the squashed feature branch as merged (its commits aren't ancestors
  of the squash commit). `git branch -d` refuses it; you must use **`git branch -D`**. This is expected, not
  a sign work was lost — but **verify the content landed on `main` before deleting** (the memory note on the
  stacked-PR work-loss trap).

After merge, sync local main with a **fast-forward only** merge: `git merge --ff-only origin/main`. If that
errors, your local main has drifted (a stray commit) — investigate, don't force.

## 4. The guards exist because there are no hooks

There are **no local git hooks** in this repo (CLAUDE.md says so explicitly). Every guard is a convention +
CI + the test gate — meaning **you** are the enforcement at commit time:

- **`docs/other/`** is a private working folder, ignored via **`.git/info/exclude`** (local, not the shared
  `.gitignore`). A teammate's clone has no such exclude, so committing it would leak local scratch into the
  shared history. It must never appear in `git status --short`.
- **`node_modules` is de-tracked and ignored** — `npm install`/`npm ci` is the source of truth. It was
  removed from tracking and the ignore rule tightened from `node_modules/` (directory-only) to
  `node_modules`, so both a real dir and a stray symlink are now ignored. Re-adding it is a regression: a
  circular self-symlink there once survived a branch-switch, clobbered a real `node_modules`, and made
  `npx` try to **fetch vite over the network** (`vite`/`npm run build` → exit 194). CI was unaffected
  *because it always `npm install`s* — so CI is **not** the guard for this; you are. (This is exactly why
  the worktree technique **symlinks** an existing `node_modules` rather than committing or reinstalling one.)
- **Generated artifacts** (`figma/plugin/ui.html` — a bundle inlining the whole app; `src/ui/
  figma-plugin-assets.js`; `src/ui/mcp-assets.js`) are outputs. The build regenerates them; drift means you
  edited an output or skipped the gate.

## 5. The fan-out concurrency hazard

When multiple background agents edit the **same** working tree concurrently (a parent fans work out), the
tree churns under you: `git stash`/`git commit` there will sweep up **foreign** changes. The isolation
answer is a **detached worktree off clean `origin/main`** with a **symlinked** `node_modules` (so vite/tsc
resolve without a reinstall), into which you copy **only your** changed files. Two files are **shared
collision** points — both can carry your edit *and* a peer's in the churning tree:

- `test/ui/headless-boot.mjs` — the lettered headless run, with **count gates**; two agents both bumping a
  count produce a conflicting literal.
- `figma/plugin/ui.html` — the generated bundle that **inlines everyone's source**; regenerated by the
  gate, so never merge it by hand — start from clean main and let `npm test` rebuild it.

The design is **parent-reconciles**: forks land their isolated pieces; the parent, in a fresh worktree off
the *updated* main, fixes a count-gate a fork missed, completes partial edits, and sweeps **current-state**
docs while leaving **historical** ones (CHANGELOG, decision records, "37 → 53 roles"-style anecdotes)
intact. Full procedure in `best-practices.md`.
