## Foundations — the model an MCP change leans on

The load-bearing ideas. If a change to the brand-kit server feels like it needs a new mechanism, you are
probably fighting one of these. The user-facing contract is owned by `mcp/README.md` and the MCP spec
(modelcontextprotocol.io) — this file is only the mental model the *procedure* assumes.

### 1. Two halves: the kit (data) and the server (transport)

- **`brandKit(doc, systems)`** (`src/ui/model.mjs:196`) is the **pure projection** that produces
  `brand-kit.json`. It is engine-aware (it reads `projectView(doc)`'s resolved palettes/roles, `typeScale`,
  and `geometryScale`) — it is where every value the server can serve comes from. Shape:
  ```
  { $schema: "nonoun-brand-kit/1", name, generator: "Color Tokens by NONOUN",
    stops:    [50, 100, …, 950],                       # the stop numbers (color only; on[0].ramp's stops)
    palettes: [ { name, slug, key, ramp: [ {stop, hex} ] } ],
    roles:    { <slug>: { <roleKey>: { light: "#…", dark: "#…" } } },   # 53 keys per palette
    type:     <typeScale(doc.type)>,        # { treatment, label, fonts, roleOf, categories: {7 voices} }
    geometry: <geometryScale(doc)> }        # { treatment, label, density, radiusStyle, baseHeight,
                                            #   typed:true, sizes:{XS…2XL}, radii:{none…full}, space }
  ```
  Note: `kit.type = typeScale(doc.type || DEFAULT_TYPE)` calls the engine export directly; `kit.geometry =
  geometryScale(doc)` calls a thin **`model.mjs` wrapper** (`model.mjs:35`) that runs the engine's `geomScale`
  with `{ typeScale }` so the geometry's per-step `font` is shared with the type UI scale. The engine exports
  are `typeScale` (`src/engine/type.mjs`) and `geomScale` (`src/engine/geometry.mjs`) — not `geometryScale`.
- **`mcp/brand-kit-server.mjs`** is the **transport** — zero-dep, engine-free. It only `JSON.parse`s the kit
  and answers RPC. It does NO color math; the sole computation is `nearestToken` (squared-RGB nearest stop)
  and `semanticFor` (flatten roles to `{ "palette/role": hex }`). **If a tool needs a value, the value must
  already be in the kit** — add it in `brandKit`, not the server.

Two version numbers live here and are unrelated: `kit.$schema = "nonoun-brand-kit/1"` (the data shape) and
`PROTOCOL_VERSION = "2025-06-18"` (the MCP wire protocol the `initialize` reply advertises). `SERVER =
{ name: "nonoun-brand-kit", version: "0.1.0" }`. Don't conflate the schema and the protocol version.

### 2. The JSON-RPC-over-stdio loop

The server reads newline-delimited JSON-RPC from **stdin**, writes replies to **stdout**, logs to **stderr**:
```
process.stdin → buffer → split on "\n" → JSON.parse(line) → handle(msg)
handle(msg) switch(method):
  initialize              → { protocolVersion, capabilities:{tools,resources,prompts}, serverInfo, instructions }
  notifications/initialized → (notification, no reply)
  ping                    → {} (only if isRequest)
  tools/list              → { tools:   TOOLS.map(name,description,inputSchema) }
  tools/call              → reply(textResult(TOOLS.find(name).run(arguments)))   # wraps any return as content[]
  resources/list / read   → RESOURCES (find by uri → read())
  prompts/list / get      → PROMPTS (apply_brand.get() → usageGuide())
  <unknown>               → fail(id, -32601, "method not found: …")   # only if isRequest (has id)
```
- **`send` writes to `process.stdout`. That channel is the protocol.** Anything else on stdout (a `console.log`,
  a stray write) corrupts the stream and the client desyncs. ALL diagnostics → `process.stderr.write`. The
  server contains zero `console.*` today — keep it that way.
- A **request** has a non-null `id` (`isRequest`); a **notification** does not (no reply). `ping` and unknown
  methods reply only when `isRequest`. `notifications/initialized` returns nothing.
- A tool whose `run` throws is caught and returned as `reply(id, { ...textResult("error: …"), isError: true })`
  — a tool error is a normal MCP result, NOT a JSON-RPC `error`. A data miss (no such palette/role) returns
  `{ error: "…" }` as ordinary content. Only protocol-level failures use `fail(id, code, msg)`: unknown
  method → `-32601`; unknown tool / unknown resource / unknown prompt → `-32602`.

### 3. The opt-in — one toggle, four checkpoints

The kit may carry Color, Typography, Geometry, or any subset (the drawer's **Include** toggles →
`this.exportSystems` → `systems`). `brandKit` omits an un-selected system's section entirely. The server then
reflects what's present, gated on:
- `const hasColor = palettes.length > 0 || Object.keys(roles).length > 0;`
- `kit.type` (truthy) · `kit.geometry` (truthy)

These three gates each appear **four times** and must stay in lockstep:
1. **`usageGuide()`** — the markdown sections (`## Color` / `## Typography` / `## Geometry`) are each behind
   the matching gate (it recomputes a local `hasColorG`); `Systems in this kit:` lists the present ones (or `—`).
2. **`TOOLS`** pushes — `if (hasColor) TOOLS.push(…5 colour tools)`, `if (kit.type) … get_type`,
   `if (kit.geometry) … get_geometry`.
3. **`RESOURCES`** pushes — `if (hasColor) … brand://palettes + semantic/{light,dark}`, then `if (kit.type)
   brand://type`, `if (kit.geometry) brand://geometry`. (`brand://guide` is pushed last, always.)
4. **The startup banner** (`process.stderr.write` at file end) — names which systems are being served
   (`[N palettes · type · geometry]` or `empty`).

`brand://kit`, `brand://guide`, and `apply_brand` are **always present** (the guide degrades to "—" when a
kit is empty). The contract: a colour tool must never appear for a type-only kit, and vice-versa. The test
asserts this on the projection directly via `brandKit({color:true})` / `{type:true}` / `{geometry:true}`.

### 4. The colour tools, exactly

- **`list_palettes`** → `[{ name, key, stops }]` (`key` is the identity colour — a hex or `oklch(…)`; `stops`
  is `(p.ramp||[]).length`, the ramp length).
- **`get_ramp(palette)`** → `{ name, ramp: [{stop, hex}] }` or `{ error }`. `findPalette` matches on
  `slugOf(name)` against `p.name` OR `p.slug`, so `"primary"` and `"Primary"` both resolve.
- **`resolve_token(palette, role, scheme)`** → `{ palette, role, scheme, hex }` or `{ error }`. When `palette`
  is absent and `role` contains `/`, it splits on the **first** `/` and re-joins the rest (`const [pp,
  ...rest] = a.role.split("/"); slug = pp; key = rest.join("/")`) — so `"on/primary/x"`-style keys survive;
  otherwise `palette` + `role` are used as passed. The slug side is run through `slugOf`; the role **key is
  used verbatim** (not slugged). `scheme` defaults to `light` (anything not exactly `"dark"` → light). The
  hex is `r[scheme] ?? r.light`.
- **`get_semantic(scheme)`** → the flattened `{ "palette/roleKey": hex }` map for the scheme (`semanticFor`,
  using `v[scheme] ?? v.light`). This is the per-palette 53-role layer resolved for one scheme.
- **`nearest_token(hex)`** → `{ palette, stop, hex, distance }` — the brand stop with the smallest squared-RGB
  distance to the input; `distance` is the rounded euclidean (`Math.round(Math.sqrt(best.d))`). distance 0 =
  an exact stop. This is the "reuse the system, don't invent a colour" tool; the `apply_brand` prompt tells
  the agent to call it before introducing a new colour.

### 5. Where the served type + geometry come from

`get_type` / `brand://type` return `kit.type` **verbatim** (the `typeScale` output). Its `categories` map has
**seven** voices from `make7` — `Display`, `Heading Editorial`, `Heading Context`, `Heading Eyebrow`, `Body`,
`UI`, `Code` — each step `{ size, lineHeight, letterSpacing, weight, textTransform, paragraphSpacing,
paragraphIndent }`. (The `usageGuide()` prose collapses these into a four-voice teaching model
Display/Heading/Body/UI — that is documentation, not the data shape.)

`get_geometry` / `brand://geometry` return `kit.geometry` verbatim (the `geometryScale` output). Top level:
`{ treatment, label, density, radiusStyle, baseHeight, typed, sizes, radii, space }`. `sizes` runs XS, SM, MD,
LG, XL, 2XL; each `buildSize` row is `{ height, icon, caret, font, gap, padding, edgePadding, radiusPill,
minWidth }`. `radii` is the ladder `{ none, sm, md, lg, full:9999 }`; `space` is the spacing scale.

The key composition facts the test pins: a size step's **`font` equals the type UI scale's size** at the same
step (`geo.sizes.MD.font === ty.categories.UI.MD.size`) and the **centering law** holds (`geo.sizes.MD.padding
=== (geo.sizes.MD.height − geo.sizes.MD.icon) / 2`), with `geo.typed === true`. The server doesn't compute
these — `geometryScale(doc)` (`model.mjs:35`) shares the `typeScale` into `geomScale` — but a tool/resource
change must not break the round-trip. The taxonomy of voices + sizes is owned by `src/engine/type.mjs` /
`src/engine/geometry.mjs` and the `geometry-system` skill — cite, don't re-derive.

### 6. One source, three mirrors — why regeneration matters

The server source lives in `mcp/brand-kit-server.mjs`. It is consumed in three forms:
- **Run directly** — `node mcp/brand-kit-server.mjs [kit.json]` (path: `argv[2]` → `$BRAND_KIT` →
  `resolve(HERE, "brand-kit.json")`). This is what the test spawns.
- **Inlined as an asset** — `src/ui/mcp-assets.js#MCP_BRAND_KIT.server` (+ `.readme`), GENERATED by
  `scripts/gen-mcp-assets.mjs` (`npm run gen:mcp-assets`). It is a `JSON.stringify`'d copy of the file +
  README. The app imports this to build the download.
- **Shipped in the zip** — `downloadBrandKitMcp()` (`app.js:5273`) writes `MCP_BRAND_KIT.server` as
  `brand-kit-server.mjs`, `brandKit(this.doc, this.exportSystems)` as `brand-kit.json`, `MCP_BRAND_KIT.readme`
  as `README.md`, plus a `package.json`. So **the user downloads the asset, not the file on disk** — an
  un-regenerated asset ships a stale server even though `mcp/` is correct. `npm test` and `npm run build` both
  regenerate it; the discipline is: edit `mcp/`, then `npm run gen:mcp-assets`, never touch `mcp-assets.js`.