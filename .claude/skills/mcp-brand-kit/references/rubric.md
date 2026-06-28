## Rubric — a Brand-Kit MCP change

Scores a change to `mcp/brand-kit-server.mjs`, the served `brandKit` shape, or the download packaging.
`[gate]` = mechanically checkable (a named test assert / `npm test` / a manual stdio run); `[review]` =
judgment with cited evidence. Score each 1–5.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| M1 | Stdio hygiene | [gate] | NO non-protocol writes to stdout — every log/diagnostic/error uses `process.stderr.write` (the file has zero `console.*`); tool errors return `{…, isError:true}` not a JSON-RPC error; `node mcp/brand-kit-server.mjs <kit> 2>/dev/null` prints nothing until a request; `test/mcp/brand-kit.mjs` parses every reply cleanly | 1: a `console.log` / stray stdout write (test desyncs, or stdout dirty before a request) · 3: stdout clean for the happy path · 5: clean across tool-error + unknown-method + bad-message paths, all to stderr |
| M2 | Opt-in gating | [gate] | a system-dependent tool/resource/guide-section is behind the matching gate (`hasColor` / `kit.type` / `kit.geometry`) in ALL FOUR places (usageGuide · TOOLS · RESOURCES · banner); the test's `brandKit({color})/{type}/{geometry}` asserts show only that system's surface | 1: a colour tool appears for a type-only kit, or one of the four checkpoints not gated · 3: gated in TOOLS+RESOURCES · 5: gated in all four incl. the guide section + banner, opt-in asserts extended |
| M3 | Engine-free / serve-don't-compute | [review] | the server adds no `src/engine` import and no color math; a value a tool needs is added to `brandKit` (`model.mjs`), not recomputed in the server; only `nearestToken`/`semanticFor`-class pure helpers added; `get_type`/`get_geometry` serve `kit.type`/`kit.geometry` verbatim (no field plucking/renaming) | 1: color math (hue/contrast/ramp) re-implemented in the server, or an engine import added, or a served section reshaped · 3: reads the kit, helper is pure RGB/flatten · 5: + the new value lives in `brandKit` with the kit shape extended cleanly |
| M4 | Asset regenerated | [gate] | `src/ui/mcp-assets.js` regenerated via `npm run gen:mcp-assets` after the server/README edit (not hand-edited); `MCP_BRAND_KIT.server` matches `mcp/brand-kit-server.mjs`; `npm test` green | 1: `mcp-assets.js` hand-edited or stale (download ships an old server) · 3: regenerated, suite green · 5: regenerated + confirmed the downloaded zip's server matches `mcp/` |
| M5 | Protocol correctness | [review] | requests vs notifications handled right (non-null `id` → reply; `notifications/initialized` → silent; `ping` only when `isRequest`); unknown method → `fail(…,-32601)`, unknown tool/resource/prompt → `fail(…,-32602)`; `resolve_token` first-`/` role-split + `dark`-only-if-`"dark"` scheme grammar preserved; `$schema` vs `PROTOCOL_VERSION` not conflated | 1: a notification gets a reply, or a data-miss throws out of handle, or role/scheme grammar broken, or the wrong error code · 3: list/call/read dispatch correct · 5: + error codes correct and version numbers kept distinct |
| M6 | Test coverage | [gate] | `test/mcp/brand-kit.mjs` drives the new tool/resource end-to-end over spawned stdio AND the opt-in shaping (via `brandKit({…})`); `node test/mcp/brand-kit.mjs` + `npm test` green | 1: new surface untested, or the test red · 3: a happy-path assert added · 5: + opt-in shaping + an error/edge assert, and the composition round-trip (`geo.sizes.MD.font === ty.categories.UI.MD.size`) still pinned |
| M7 | Doc sync | [review] | `mcp/README.md` "What it exposes" tool table + resource list mirror the new surface (it's hand-mirrored, not generated, and it's what gets zipped); `apply_brand`/guide prose updated if behaviour changed | 1: README's table missing the new tool/resource (invisible to the downloader) · 3: table updated · 5: table + resource list + guide/prompt prose all current |

**Gate to ship:** M1, M2, M4, M6 must each score ≥ 3 — stdout clean, the opt-in gated everywhere, the asset
regenerated, and the new surface tested end-to-end, with `node test/mcp/brand-kit.mjs` AND `npm test` green. A
change that leaks to stdout (M1), exposes a system's tool for a kit that omits it (M2), ships a stale asset
(M4), or is untested (M6) is not done regardless of how clean the tool reads.

**Top failure to look for first:** a half-applied opt-in gate (M2) or a stdout leak (M1). The opt-in is checked
in FOUR places — usageGuide, TOOLS, RESOURCES, and the banner — and forgetting the guide section means an
agent that reads `brand://guide` first never learns the tool exists, while the tool still works (so the obvious
test passes). And a single `console.log` slipped into a `run` handler corrupts the JSON-RPC stream silently —
the server "works" when you eyeball it but the client desyncs. Confirm the gate is in all four places and grep
the server for `console.` before trusting a "looks done."