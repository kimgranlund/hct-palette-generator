## Best practices — shipping & the concurrency recovery

The non-obvious do/don'ts (each cost a real cycle), then the worktree procedure worked end to end.

## The happy-path ship (single agent, quiet tree)

```
git fetch origin && git switch -c fix/chroma-floor origin/main
# … make the change …
npm test                       # green; + npm run build only if you touched TS/vite/scripts/fonts
git status --short | grep -E '.claude/docs/other|node_modules'   # MUST print nothing
git add -A && git commit        # body ends with the Co-Authored-By trailer
git push -u origin fix/chroma-floor
gh pr create --fill             # title = the squash subject; body ends with the 🤖 line
# CI: poll-then-watch, then gate the merge on the run's conclusion — a bare `gh pr checks --watch`
# false-greens before the run registers (SKILL.md "gh quirks" owns the commands + recovery)
RUN=$(gh run list --branch fix/chroma-floor --limit 1 --json databaseId --jq '.[0].databaseId')  # loop until non-empty
gh run watch "$RUN" --exit-status
[ "$(gh run view "$RUN" --json conclusion --jq .conclusion)" = success ] && gh pr merge <n> --squash
git switch main && git fetch origin && git merge --ff-only origin/main
git branch -D fix/chroma-floor  # -D, not -d (squash leaves it "unmerged")
```

## Do / don't

- **Do** write the PR **title** as the changelog line — it *becomes* the commit subject on squash. Match the
  `git log` shape: `feat(engine): default back to "even" … (#41)`. **Don't** title it "fixes" or "wip".
- **Do** run `npm test` even for a "one-liner" — it regenerates the committed artifacts, so a skipped gate
  ships **stale** `figma/plugin/ui.html` / `src/ui/figma-plugin-assets.js` / `src/ui/mcp-assets.js`.
- **Don't** run `npm run build` for a pure engine/UI-logic change just to feel safe — it needs
  `node_modules` and CI runs the full build regardless. Reserve it for build-chain edits.
- **Do** look at the smoke **`smoke-screenshots` artifact** for any UI change. **Don't** treat green smoke
  as Safari-safe — reason about WebKit from the spec (quote font-family idents with digits, etc.).
- **Do** verify the merge landed on `main` (`gh pr view <n> --json state,mergedAt`) **before** `git branch
  -D` — the stacked-PR/branch-cleanup work-loss trap is real.

## Concurrency isolation — the worktree procedure (the big one)

When a parent fanned out and other agents are editing the **shared** tree, do **not** stash or commit in
it. Isolate:

1. **Worktree off clean main**: `git worktree add /tmp/wt-<branch> -b <branch> origin/main`. This is a
   pristine checkout of `origin/main` — none of the churn, none of the foreign edits.
2. **Symlink `node_modules`** so vite/tsc resolve without a reinstall (and **never** commit it):
   `ln -s /Users/kimba/Projects/nonoun/nonoun-color-tokens/node_modules /tmp/wt-<branch>/node_modules`.
   (A symlink to the real dir is fine; a *circular self-symlink* is the exit-194 regression — don't create
   one inside the tree.)
3. **Identify your-vs-foreign files** in the churning primary tree:
   `git status --short | grep -vE '<your file regex>'` — what's left is foreign; don't touch it.
4. **Copy ONLY your changed files** into the worktree (the specific paths you edited — not `git stash`,
   which would drag foreign hunks).
5. **Collision files**: if your change touches `test/ui/headless-boot.mjs` (count gates) or
   `figma/plugin/ui.html` (the inlined bundle), **do not** copy the churning tree's version — start from the
   worktree's clean-main version and **re-apply only your hunk**. For `ui.html`, don't edit it at all — let
   the `npm test` generators rebuild it in the worktree.
6. **Gate + commit + push from the worktree**: `cd /tmp/wt-<branch> && npm test` (green) → `git add -A`
   (after the `.claude/docs/other`/`node_modules` grep) → commit with the trailer → `git push -u origin <branch>`.
   Open the PR as usual.
7. **Cleanup**: `git worktree remove --force /tmp/wt-<branch>` → `git worktree prune` → `git branch -D
   <branch>` (after the squash-merge landed).

## Parent-reconcile (fan-out design)

The fan-out is designed so **the parent reconciles once all forks land** — not so forks merge each other.
After every fork's completion notification:

1. Fresh worktree off the **updated** `origin/main` (the forks' squash commits are now there).
2. **Fix the count-gate a fork missed** in `test/ui/headless-boot.mjs` — two forks each adding a thing means
   the literal count is now off by the other fork's delta.
3. **Complete partial edits** a fork left (e.g. the `role-table.json` ↔ `semanticRoles` ↔ Figma `code.js`
   parity tables half-updated).
4. **Sweep CURRENT-state docs** (CLAUDE.md conventions, README) to reflect the combined result — but
   **leave HISTORICAL records intact**: CHANGELOG entries, decision records, and "37 → 53 roles"-style
   anecdotes (commit `eeb0f34` is the real expansion) are history, not current-state, and must not be
   retro-edited.
5. One reconcile commit, normal PR + gate + squash.

## Worked example — landing a single engine change (from PR #41)

The `chromaFloor` change (`feat(engine): default back to "even" (vibrant) + chromaFloor to kill the dead
zone (#41)`) touched `model.mjs` + `persist.js` + a UI slider (Global → "Chroma floor") + a new tonal
`chroma-floor` gate — engine + UI logic, **no build chain**. So: branch off `origin/main`, make the change,
**`npm test`** — its commit body literally records `npm test 10/10`, with **no `npm run build`** needed. The
commit body is a full changelog-grade explanation (what reverses, why, the cap reasoning, the new gate);
the **title** is the squash subject `(#41)`. Pushed, CI ran build · test · smoke, squash-merged, local main
fast-forwarded, branch `-D`'d. The body's closing line — `Verified visually: default vibrant again + muted
ends lifted` — is the Safari/screenshot discipline in action: green smoke alone wasn't the proof.
