---
name: shipping-changes
description: >
  The end-to-end release/PR workflow for nonoun-color-tokens — branch from
  origin/main, run the two gates (npm test, npm run build), open a PR, watch CI
  (build · test · smoke), squash-merge, and sync local main — plus the commit
  guards and the worktree concurrency-isolation technique for fan-outs. Use
  whenever a change is ready to land: "ship this", "open a PR", "merge and
  sync", "release this change", or proactively when work is done and green.
---

# Shipping changes (nonoun-color-tokens)

`CLAUDE.md`'s **Shipping** + **Always** sections have the one-paragraph version — read them; this skill
owns the full procedure and the concurrency recovery. The repo is **squash-merge**, has **no local git
hooks** (the guards below are conventions + CI + the test gate, not enforced pre-commit), and the smoke
leg is **Chrome-only**.

## The two gates (before any PR)

| Gate | What it runs | Needs | Run it when |
|---|---|---|---|
| `npm test` | `gen:figma-assets`+`gen:mcp-assets`+`gen:categories`+`bundle`+`gen:figma-ui` then `node test/run.mjs` | **nothing** (no browser, no `node_modules` — pure engine + a custom DOM shim) | **every** change |
| `npm run build` | `gen:figma-assets`+`gen:mcp-assets`+`gen:categories` → `tsc` → `vite build` → `bundle` → `gen:figma-ui` | `node_modules` (vite/tsc) | only if you touched the **build chain** (TS, vite config, `scripts/`, bundled fonts) |

`npm test` regenerates the committed artifacts (`figma/plugin/ui.html`, `src/ui/figma-plugin-assets.js`,
`src/ui/mcp-assets.js`) as its first act — so a green `npm test` also leaves them **in sync** with source.
CI (`.github/workflows/ci.yml`) runs `npm install` → `npm run build` → `npm test` → **`npm run smoke`**
(real headless Chrome over CDP). You cannot reproduce smoke's value locally without Chrome, so let CI be
the smoke gate and **download the `smoke-screenshots` artifact** if a UI change is involved.

## Procedure

1. **Branch** from the freshest main: `git fetch origin && git switch -c <branch> origin/main`. Never
   commit straight to `main`.
2. **Change**, then **`npm test`** green (+ **`npm run build`** if the build chain is touched).
3. **Guard-check** (see below) — `git status --short` must be clean of `docs/other/` and `node_modules`.
4. **Commit** with the trailer (below) → **`git push -u origin <branch>`**.
5. **PR**: `gh pr create --fill` (or `--title`/`--body`); the PR **title becomes the squash-commit subject**
   — write it as `feat(scope): …` / `fix(scope): …` with the changelog-worthy summary (match `git log`).
6. **Watch CI** (~50–90s): `gh pr checks <n> --watch`. Three legs must pass: build · test · smoke.
7. **Squash-merge**: `gh pr merge <n> --squash`. Do **not** pass `--delete-branch` (see quirk).
8. **Sync local main**: `git switch main && git fetch origin && git merge --ff-only origin/main`. A squash
   leaves the feature branch looking **unmerged**, so delete with `git branch -D <branch>` (capital D), and
   delete the remote branch via the API call below.

## Guards (every commit — there is no hook; you are the hook)

- **`git status --short | grep docs/other`** MUST be empty. `docs/other/` is local-only (ignored via
  `.git/info/exclude`, not `.gitignore`) — it must never reach a commit.
- **`node_modules` must not be re-added.** It is de-tracked AND ignored (the ignore was tightened to
  `node_modules`, so both a real dir and a stray symlink are caught); `git ls-files | grep -c node_modules`
  → 0. A tracked dir/symlink there is a regression — a circular self-symlink once clobbered local installs
  on branch-switch and made `npx` fetch vite over the network (exit 194). `git status --short | grep -c
  node_modules` → 0.
- **Generated artifacts in sync.** `figma/plugin/ui.html` + `src/ui/figma-plugin-assets.js` +
  `src/ui/mcp-assets.js` are build outputs; a clean `npm test` regenerates them, so commit them **after**
  the gate, never hand-edit them.
- **Role/step count gates.** If you changed a role or step count, the count literals in
  `test/engine|figma|ui` and the `role-table.json` ↔ `semanticRoles` ↔ Figma `code.js` parity must all move
  together (the gate is in `npm test`).

## Trailers (exact strings)

- Commit message ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- PR body ends with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## gh quirks (verify, don't trust the exit code)

- `gh pr merge --delete-branch` **fails its local-branch step** when `main` is checked out in the primary
  worktree (`'main' is already used by worktree`) — but the **remote merge still succeeds**. Verify with
  `gh pr view <n> --json state,mergedAt`, then delete the remote branch explicitly:
  `gh api -X DELETE repos/:owner/:repo/git/refs/heads/<branch>`.

## Concurrency isolation (fan-out: agents editing the shared tree at once)

Do **not** `git stash`/commit in a churning shared tree. Isolate in a worktree off clean main — full
procedure, collision files, and parent-reconcile in `references/best-practices.md`. The short form:
`git worktree add /tmp/wt -b <branch> origin/main` → symlink `node_modules` in → copy **only your** changed
files → `npm test` + commit + push **from the worktree** → `git worktree remove --force` + prune + `branch -D`.

## Validate (the ship is "done" only when)

`npm test` green locally → push → **CI green on all three legs** (`gh pr checks <n>`) → `gh pr view <n>
--json state,mergedAt` shows `MERGED` → local `main` fast-forwarded to the squash commit (`git log
--oneline -1`) → feature branch deleted locally **and** on the remote. Smoke is Chrome-only — green CI is
**not** Safari proof; reason about WebKit from spec (see `foundations.md`).

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the gate model, the squash-merge mental model, why smoke isn't cross-browser, the guard rationale |
| `references/best-practices.md` | the worktree concurrency procedure end-to-end + collision-file recovery + parent-reconcile + the gh-quirk recovery, worked |
| `references/rubric.md` | score a ship before calling it landed |
