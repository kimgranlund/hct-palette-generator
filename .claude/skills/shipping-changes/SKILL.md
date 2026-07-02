---
name: shipping-changes
description: >
  Use when a change in nonoun-color-tokens is ready to land — "ship this",
  "open a PR", "merge and sync", "release this" — or proactively when work is
  done and green. Covers the full release workflow: branch from origin/main,
  the two gates (npm test, npm run build), PR, CI watch (build · test ·
  smoke), squash-merge, local-main sync, plus commit guards and worktree
  isolation for fan-outs.
---

# Shipping changes (nonoun-color-tokens)

`CLAUDE.md`'s Shipping + Always sections have the one-paragraph version — read them; this skill owns
the full procedure and the concurrency recovery. The repo is squash-merge, has no local git hooks
(the guards below are conventions + CI + the test gate, not enforced pre-commit), and the smoke leg
is Chrome-only.

## The two gates (before any PR)

| Gate | What it runs | Needs | Run it when |
|---|---|---|---|
| `npm test` | `gen:figma-assets`+`gen:mcp-assets`+`gen:categories`+`bundle`+`gen:figma-ui` then `node test/run.mjs` | nothing (no browser, no `node_modules` — pure engine + a custom DOM shim) | every change |
| `npm run build` | `gen:figma-assets`+`gen:mcp-assets`+`gen:categories` → `tsc` → `vite build` → `bundle` → `gen:figma-ui` | `node_modules` (vite/tsc) | only if you touched the build chain (TS, vite config, `scripts/`, bundled fonts) |

`npm test` regenerates the committed artifacts (`figma/plugin/ui.html`, `src/ui/figma-plugin-assets.js`,
`src/ui/mcp-assets.js`) as its first act — so a green `npm test` also leaves them in sync with source.
CI (`.github/workflows/ci.yml`) runs `npm install` → `npm run build` → `npm test` → `npm run smoke`
(real headless Chrome over CDP). You cannot reproduce smoke's value locally without Chrome, so let CI
be the smoke gate and download the `smoke-screenshots` artifact if a UI change is involved.

## Procedure

1. Branch from the freshest main: `git fetch origin && git switch -c <branch> origin/main`. Never
   commit straight to `main`.
2. Change, then `npm test` green (+ `npm run build` if the build chain is touched).
3. Guard-check (see below) — `git status -s` must show no `.claude/docs/other/` and no `node_modules`.
4. Commit + push:
   - Commit with the trailer (below), then `git push -u origin <branch>`.
   - Stage each file by name (`git add <your-files>`), not `git add -u`: in a shared tree, `-u` sweeps
     a concurrent agent's half-finished edits into your commit — that once landed an `src/ui/app.js`
     change missing its matching test, reddening `main` (see "Concurrency isolation").
   - If `git status` shows files you didn't touch, stop and isolate in a worktree.
5. PR: `gh pr create --fill` (or `--title`/`--body`); the PR title becomes the squash-commit subject —
   write it as `feat(scope): …` / `fix(scope): …` with the changelog-worthy summary (match `git log`).
   If the body has backticks or `$(…)`, pass it via `--body-file` (see quirk), not inline `--body`.
6. Watch CI (~50–90s): poll until the run registers, then watch it — a bare `gh pr checks <n> --watch`
   false-greens (see quirk). Three legs must pass: build · test · smoke.
7. Squash-merge:
   - **Gate on the run's conclusion first**: `[ "$(gh run view <run> --json conclusion --jq .conclusion)" = success ] && gh pr merge <n> --squash`.
   - The repo has **no branch protection**: `gh pr merge` merges a RED PR without complaint, and
     `gh run watch` prints the conclusion without blocking the merge — only the conclusion gate blocks.
   - Skip `--delete-branch` (see quirk); step 8 does both deletes.
8. Sync local main: `git switch main && git fetch origin && git merge --ff-only origin/main`. A squash
   leaves the feature branch looking unmerged, so delete with `git branch -D <branch>` (capital D),
   and delete the remote branch via the API call below.

## Guards (every commit — there is no hook; you are the hook)

- `git status -s | grep .claude/docs/other` MUST be empty. `.claude/docs/other/` is local-only (ignored
  via `.git/info/exclude`, not `.gitignore`) — keep it out of every commit.
- `node_modules` stays untracked: `git ls-files | grep -c node_modules` → 0 and
  `git status -s | grep -c node_modules` → 0. It is de-tracked AND ignored (the rule was tightened to
  `node_modules`, so both a real dir and a stray symlink are caught); re-tracking it is the exit-194
  regression — anecdote and why CI is blind to it in `references/foundations.md` §4.
- Generated artifacts in sync. `figma/plugin/ui.html` + `src/ui/figma-plugin-assets.js` +
  `src/ui/mcp-assets.js` are build outputs: commit them after a clean `npm test` (which regenerates
  them) and let the generators write them — a hand-edit is drift.
- Role/step count gates. If you changed a role or step count, the count literals in
  `test/engine|figma|ui` and the `role-table.json` ↔ `semanticRoles` ↔ Figma `code.js` parity must all
  move together (the gate is in `npm test`).

## Trailers (exact strings)

- Commit message ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- PR body ends with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## gh quirks (verify the state — the exit code lies)

- **A bare `gh pr checks <n> --watch` races the run's registration and false-greens.** Right after
  `gh pr create`, CI may not be registered yet, so `--watch` prints *"no checks reported"* and exits
  0 — a merge fired on that false green once and landed a PR before CI ran. Poll for the run, then
  watch it: `RUN=$(gh run list --branch <branch> --limit 1 --json databaseId --jq '.[0].databaseId')`
  (loop until non-empty) → `gh run watch "$RUN" --exit-status` → confirm `gh run view "$RUN" --json
  conclusion` is `success` before `gh pr merge`.
- PR/issue bodies with backticks go through `--body-file`, not inline `--body`. An inline
  `--body "$(cat <<'EOF' … EOF)"` still lets the shell evaluate any backticks/`$(…)` inside the body —
  it once replaced the body with dumped env vars. Write the body to a file (the Write tool) and pass
  `--body-file <file>` (works for `gh pr create` and `gh pr edit`).
- `gh pr merge --delete-branch` fails its local-branch step when `main` is checked out in the primary
  worktree (`'main' is already used by worktree`) — but the remote merge still succeeds. Verify with
  `gh pr view <n> --json state,mergedAt`, then delete the remote branch explicitly:
  `gh api -X DELETE repos/:owner/:repo/git/refs/heads/<branch>`.

## Concurrency isolation (fan-out: agents editing the shared tree at once)

A churning shared tree is no place to stash or commit — isolate in a worktree off clean main. Full
procedure, collision files, and parent-reconcile in `references/best-practices.md`. The one-liner:
`git worktree add /tmp/wt -b <branch> origin/main` → symlink `node_modules` in → copy only your
changed files → `npm test` + commit + push from the worktree → `git worktree remove --force` + prune
+ `branch -D`.

## Validate (the ship is "done" only when)

`npm test` green locally → push → CI green on all three legs (poll-then-`gh run watch --exit-status`,
not a bare `--watch`) → `gh pr view <n> --json state,mergedAt` shows `MERGED` → local `main`
fast-forwarded to the squash commit (`git log --oneline -1`) → feature branch deleted locally and on
the remote. Smoke is Chrome-only — green CI is not Safari proof; reason about WebKit from spec (see
`foundations.md`).

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the gate model, the squash-merge mental model, why smoke isn't cross-browser, the guard rationale + the exit-194 anecdote |
| `references/best-practices.md` | the worktree concurrency procedure end-to-end + collision-file recovery + parent-reconcile, worked |
| `references/rubric.md` | score a ship before calling it landed |

**Peers:** upstream makers land through this workflow: [[color-math]] · [[type-scale]] ·
[[geometry-system]] · [[adding-semantic-roles]] · [[adding-export-formats]] ·
[[building-editor-sections]] · [[maintaining-figma-plugins]] · [[maintaining-brand-kit-mcp]].
