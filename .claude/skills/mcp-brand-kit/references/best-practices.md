## Best practices — changing the Brand-Kit MCP

The non-obvious do/don'ts (each a real trap in this server), then a worked walkthrough from the type/geometry
addition history.

### stdout is sacred

- **Every log, diagnostic, banner, and error message goes to `process.stderr.write` — never `console.log`.**
  `console.log`/`console.info` write to stdout, which IS the JSON-RPC channel; one stray line desyncs the
  client and the agent stops seeing replies. The server's own load-failure path
  (`process.stderr.write("[brand-kit] could not read …"); process.exit(1)`), bad-message path, and the startup
  banner all model this — and there is **zero `console.*` in the file** (grep to confirm after your edit). Test
  it the brutal way: `node mcp/brand-kit-server.mjs <kit.json> 2>/dev/null` should print **nothing** until you
  feed it a request on stdin.
- **A tool error is a result, not a protocol error.** A `run` that throws is caught and returned as
  `reply(id, { content: […], isError: true })`; a missing role/palette returns `{ error: "…" }` as normal
  content. Reserve `fail(id, code, …)` for protocol-level misses only: unknown method → `-32601`; unknown
  tool / resource / prompt → `-32602`. Don't throw out of `handle` for a user-data miss.

### The opt-in is a four-place lockstep

- **A system-dependent tool, resource, AND guide section must all sit behind the same gate.** If you add a
  colour tool, it goes behind `if (hasColor)`; its resource (if any) behind `if (hasColor)`; and the `## Color`
  guide section already is. Adding a tool but forgetting the guide line means an agent that reads `brand://guide`
  first (as `initialize`'s `instructions` tells it to — "read brand://guide first") never learns the tool
  exists. The test asserts the type-only / geometry-only / color-only kits expose ONLY their system's surface
  via `brandKit({…})` — extend that assertion.
- **Don't compute in the server what the kit can carry.** The server is engine-free by design (`mcp/` has no
  import of `src/engine`). If a new tool needs, say, a contrast ratio or a hue, add it to `brandKit` in
  `model.mjs` so it's in `brand-kit.json`, and have the tool read it. Re-implementing color math in the server
  would (a) duplicate the engine, (b) make the zero-dep server depend on engine code it can't import, (c) drift.
  The two helpers that DO compute (`nearestToken`, `semanticFor`) are pure RGB/flatten — no engine.

### The asset is generated — regenerate it

- **`src/ui/mcp-assets.js` is GENERATED from `mcp/brand-kit-server.mjs` + `mcp/README.md`. Never hand-edit it.**
  It carries a `// GENERATED … DO NOT EDIT` header. After ANY edit to the server or the README, run
  `npm run gen:mcp-assets` (`scripts/gen-mcp-assets.mjs`). `npm test` and `npm run build` run it too, so a green
  suite regenerates it — but if you eyeball the download without re-running gen, you ship a stale server. The
  user downloads `MCP_BRAND_KIT.server` (the asset), not the file on disk.
- **`mcp/README.md` is a hand-mirrored doc, not generated from the code.** Its "What it exposes" tool table and
  resource list are written by hand (`gen-mcp-assets.mjs` only copies the README verbatim into the asset — it
  does not derive the table from the server). A new tool/resource that isn't added to the README is invisible to
  whoever unzips the package — and the README is what gets zipped (via `MCP_BRAND_KIT.readme`). Keep the table
  in sync; it's the only doc the downloader sees.

### Serve verbatim; don't reshape

- **`get_type` returns `kit.type` and `get_geometry` returns `kit.geometry` as-is** — the shape is owned by
  `typeScale`/`geomScale`. `kit.type.categories` carries **seven** voices (Display, Heading Editorial/Context/
  Eyebrow, Body, UI, Code); `kit.geometry.sizes` rows are `{height, icon, caret, font, gap, padding,
  edgePadding, radiusPill, minWidth}` with the top-level `radii` ladder + `space` scale. Don't pluck or rename
  fields in the server; an agent and the test rely on the full shape (the test reads `ty.categories.Body`,
  `ty.categories.UI.MD.size`, `geo.sizes.MD.padding/height/icon/font`, `geo.typed`).
- **The geometry `font` is composed from the type UI scale.** The test pins `geo.sizes.MD.font ===
  ty.categories.UI.MD.size` and `geo.typed === true` — one source of truth across the two systems. That
  composition is `geometryScale(doc)`'s job (`model.mjs:35`, which passes `{ typeScale }` into `geomScale`); a
  server change must not break the round-trip the test asserts.
- **The centering law is `padding === (height − icon) / 2`.** The field is `icon` (the server's guide prose
  loosely says "glyph"); the radius ladder is the top-level `radii`, not a per-size `radius` (the per-size
  size-linked radius is `radiusPill`). State these accurately in any new prose.
- **`resolve_token` splits role on the FIRST `/`** so `"palette/roleKey"` works and multi-segment keys survive;
  `scheme` is `dark` only if exactly `"dark"`, else `light`. Keep that grammar — agents pass `"primary/primary"`.

### Versions and identity

- **Two version numbers, unrelated:** `kit.$schema` (`"nonoun-brand-kit/1"`, the data shape) vs
  `PROTOCOL_VERSION` (`"2025-06-18"`, the MCP wire version in the `initialize` reply). Bump the schema only when
  `brandKit`'s output shape changes; bump the protocol only to track an MCP spec revision. The test asserts
  `kit.$schema === "nonoun-brand-kit/1"` and `serverInfo.name === "nonoun-brand-kit"`.

### Validation loop

Run `node test/mcp/brand-kit.mjs` first — it spawns the real server and drives the protocol, so it catches a
stdout leak (the parse loop chokes), a missing gate (the opt-in asserts fail on the projection), and a broken
tool (the tool-call assert fails) in one shot. Then `npm test` (which also regenerates `mcp-assets.js`). Finish
by running the server by hand on a real kit and confirming the stderr banner + a clean stdout.

## Worked walkthrough — adding `get_geometry` (the type + geometry systems, condensed)

The change that grew the kit from color-only to three opt-in systems:

1. **Extended the kit first.** `brandKit(doc, systems)` gained the `systems` opt-in and `if (sys.type) kit.type
   = typeScale(doc.type || DEFAULT_TYPE)` / `if (sys.geometry) kit.geometry = geometryScale(doc)`. The server
   can only serve what the kit carries — so the data came first.
2. **Added the gated surface in the server.** `if (kit.geometry) TOOLS.push({ name: "get_geometry", …,
   run: () => kit.geometry })` and `if (kit.geometry) RESOURCES.push({ uri: "brand://geometry", … })`. Mirrored
   the `kit.type` block. Serves the kit section verbatim — no reshaping.
3. **Extended the guide in lockstep.** Added the `## Geometry` section to `usageGuide()` behind `if
   (kit.geometry)` (the centering law `(height − icon)/2`, the size ramp, radius/spacing) and listed Geometry in
   `Systems in this kit:`. Same for `## Typography`. All four checkpoints (guide / TOOLS / RESOURCES / banner)
   moved together.
4. **Regenerated the asset + updated the README.** `npm run gen:mcp-assets` re-inlined the server; `mcp/README.md`
   gained the `get_type` / `get_geometry` rows in the tool table and the `brand://type` / `brand://geometry`
   resource entries, plus the "three token systems … Include toggles" framing.
5. **Extended the test (`test/mcp/brand-kit.mjs`).** Added the opt-in asserts (`brandKit({type:true})` omits
   colour+geometry, etc.), `get_type` (Body voice present), `get_geometry` (the centering law holds on the
   served MD size), the composition check (`geo.sizes.MD.font === ty.categories.UI.MD.size`, `geo.typed`), and
   the `resources/list` includes `brand://type` + `brand://geometry`.
6. **Validated** — `node test/mcp/brand-kit.mjs` green, then `npm test` (regenerating `mcp-assets.js`), then a
   manual `node mcp/brand-kit-server.mjs <geometry-only-kit>.json` to confirm only the geometry surface appears
   and the banner prints to stderr with a clean stdout.