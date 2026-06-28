# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`nonoun-color-tokens` is a perceptual **color + design-token generator**: one Vite web app that is also a
self-contained `<nonoun-color-tokens>` web component, a **Figma plugin** (a semantic-variable binder), and
an **MCP brand-kit** server. A brand kit is **one document** with three composing systems, surfaced as
**sections of one editor**: **Color** (palettes → 53 semantic roles) · **Typography** · **Geometry**
(its per-step text size composes *from* the Type UI scale).

Canonical specs + rubrics: `docs/spec/` (e.g. `docs/spec/data/role-table.json` is the role answer key).

## Commands

- `npm test` — the gate. **Zero-dependency**: regenerates committed assets (`gen:*` + `bundle` +
  `gen:figma-ui`) then runs `test/run.mjs` — engine verifiers + a custom headless-DOM shim. No browser.
- `npm run build` — `gen:*` → `tsc` → `vite build` → `bundle` → `gen:figma-ui`. **Needs `node_modules`**
  (vite/tsc); `npm test` does not.
- `npm run smoke` — boots the built single-file in **real headless Chrome** over CDP (the only
  real-browser leg). Screenshots land in `smoke-out/` (gitignored).
- `npm run dev` — Vite dev server (the app the user previews, in **Safari**).
- `gen:figma-assets` · `gen:mcp-assets` · `gen:categories` · `gen:type-fonts` — regenerate committed
  artifacts; `test`/`build` run the first three. Run `gen:type-fonts` by hand after changing bundled fonts.

## Layout

- `src/engine/` — the **pure** engines (ESM, **no DOM**): `semantic.js` (the 53-role table) · `type.mjs` ·
  `geometry.mjs` · `exports.js` (CSS/DTCG/Tailwind/shadcn) · `derive`/`tonal`/`hct`/`okhsl`.
- `src/ui/` — `app.js` (the `HctApp` custom element, ~all UI) · `styles.css` · `model.mjs`
  (`projectView` + `geometryScale` — where Geometry composes Type) · `persist.js` · generated
  `*-assets.js` / `type-fonts.js` (do not hand-edit) · `categories/`.
- `figma/` — the plugin: `figma/binder/figma-semantic-binder/code.js` mirrors `semanticRoles` for the
  sandbox (parity-gated). `figma/plugin/ui.html` is a generated bundle of the whole app.
- `test/` — `engine/*` verifiers · `ui/headless-boot.mjs` (the shim run, lettered groups) · `figma/` ·
  `mcp/` · `smoke/smoke.mjs`. `scripts/` — the generators. `mcp/` — the MCP server.
- `docs/spec/` — canonical specs, rubrics, role-table answer key. `docs/other/` — **PRIVATE** (see below).

## Conventions (non-obvious only)

- **Zero runtime deps; vanilla web component.** No framework. Build markup with the `h(tag, attrs, ...kids)`
  hyperscript (not JSX), light DOM, native `<dialog>` + `showModal()`. Engines stay DOM-free + pure.
- **Sections.** `this.section` (`color`|`typography`|`geometry`) routes `renderCenter`/`renderLeftPane`/
  `renderRightPane`. A section = a canvas header + a pannable `.canvas-scene` (the full dataset) + left
  analysis cards + a right inspector.
- **53 semantic roles / palette.** `docs/spec/data/role-table.json` deep-equals `semanticRoles`; the
  Figma `code.js` table mirrors it (parity-gated) — so a role-count change moves several files in lockstep.
- **Quote interpolated font-family names** with digits/spaces — `font-family:'Source Serif 4', serif`.
  Unquoted, WebKit/Safari drops the declaration (the digit is invalid); Chrome tolerates it.
- **SVG line charts set `fill: none`** on the path (an open `<path>` fills by closing → wedge artifacts);
  qualify the rule (`.an-svg .x-line`) so a shared series-color class can't override it.
- **`node_modules` is NOT tracked** (`npm install`/`npm ci` is the source of truth); never re-add it.

## Testing (the shim is not a real DOM)

- `test/ui/headless-boot.mjs` runs against a minimal shim, NOT jsdom. In it: `querySelector` takes a
  **single class only** (no descendant/compound selectors); elements expose **no `id` property** and **no
  `textContent`** — match by `getAttribute(...)` or the `txtOf(node)` walker. Assertions are lettered
  groups (`(j)`/`(k)`/`(ty)`/`(geo)`/`(cm)`); keep the count literals in sync when role/step counts change.
- **`npm run smoke` is Chrome-only.** Green smoke ≠ Safari-safe (WebKit is stricter on unquoted idents,
  some variable-font edges, parsing). Reproduce browser-specific bugs in Safari or reason from the spec;
  `document.fonts.check`/canvas `measureText` give false negatives for variable fonts — measure DOM width.

## Shipping

Branch from `origin/main` → `npm test` (+ `npm run build` if the build is touched) green → PR → CI
(build · test · smoke) → `gh pr merge <n> --squash` → sync local `main` with `git merge --ff-only
origin/main` (squash leaves branches looking unmerged → `git branch -D`). End commit messages with the
`Co-Authored-By: Claude Opus 4.8 (1M context)` trailer. When background agents edit the shared tree
concurrently, isolate your commit in a `git worktree` off `origin/main`.

## Always

- `npm test` green before treating a change as done (and `npm run build` if you touched the build chain).
- **`git status --short | grep docs/other` must be empty before every commit** — `docs/other/` is a
  local-only working folder (ignored via `.git/info/exclude`); it must never reach a commit.

<!-- Enforcement: there are NO local hooks yet. The guards above (role-table parity, docs/other, font-quoting) are conventions + CI + the test gates, not enforced pre-commit. A Stop/pre-commit hook for the docs/other + parity guards would be the place to make them reliable. -->
<!-- This file is the always-loaded INDEX of cross-cutting, always-true facts only. Domain PROCEDURES (changing an engine, adding a role/format, the Figma binder, building a section, shipping, palette research) are owned by on-demand skills/agents in .claude/ — discovered via their frontmatter descriptions, NOT routed from here. Conceptual depth: docs/spec/ + the engine files' header comments. Keep this thin; let the frontmatter system do the routing. -->
