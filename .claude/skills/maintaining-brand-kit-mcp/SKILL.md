---
name: maintaining-brand-kit-mcp
description: >
  Use when a change touches mcp/ (the Brand-Kit MCP core/server), the served
  brandKit, or the "Download Brand-Kit MCP" packaging — "add an MCP
  tool/resource", "expose X to agents via MCP", "the MCP opt-in is wrong".
  Covers the zero-dep JSON-RPC stdio server + core (brand-kit-core.mjs owns the
  tools/resources surface; the hosted Worker serves the same core) that serve a
  generated NONOUN brand kit (palettes · ramps · the per-palette 59 semantic
  roles · type · geometry) to AI agents offline, plus the in-app packaging.
  Also fires on "the brand-kit MCP server", "the Download Brand-Kit MCP",
  "get_type / get_geometry / get_semantic / resolve_token / nearest_token",
  "a brand:// resource", "the apply_brand prompt", or "the MCP opt-in
  (Color / Typography / Geometry) is wrong".
---

# Brand-Kit MCP server — nonoun-color-tokens

The Brand-Kit MCP is two **zero-dependency** files: `mcp/brand-kit-core.mjs` — the PURE, transport-agnostic
surface (`SERVER` · `buildSurface(kit)` · `handle(msg, surface)`) — and `mcp/brand-kit-server.mjs`, the thin
STDIO entry that frames newline-delimited **JSON-RPC 2.0** around it for AI agents (Claude Code / Cursor /
VS Code / ChatGPT). The hosted Cloudflare Worker (spec: `.claude/docs/site/mcp-hosting-spec.md`) imports the
SAME core — parity by construction (`test/mcp/core.mjs`). The server reads a sibling `brand-kit.json`; the
core exposes the palettes, perceptual ramps, the semantic layer (per palette **59** roles, light + dark), the
typography scale, and the geometry scale as MCP **resources + tools + a prompt** — so an agent builds with
the brand's exact tokens instead of guessing a colour. **No `npm install`** — pure Node.

Two hard rules govern every change here, and getting either wrong ships a broken server that still *looks* fine:
**(1) stdout is the protocol channel** — every log/diagnostic goes to STDERR only (one stray `console.log`
corrupts the stream; the server uses zero `console.*` by design); **(2) the surface is opt-in** — the kit may
carry Color, Typography, Geometry, or any subset, and a tool/resource appears **only when its system is
present**. The user-facing *why* of the kit shape is owned by `mcp/README.md` (de-staled — cite it).

## The five parts (depth in `references/foundations.md`)

| Part | File | Role |
|---|---|---|
| The **core** | `mcp/brand-kit-core.mjs` | PURE, no I/O — `SERVER` (`nonoun-brand-kit`), `buildSurface(kit)` (the gated `TOOLS`/`RESOURCES`/`PROMPTS` pushes + `usageGuide()`), `handle(msg, surface)` (the JSON-RPC dispatch). The ONLY place tools/resources are defined — the stdio server AND the hosted Worker both serve it. |
| The **server** | `mcp/brand-kit-server.mjs` | the thin stdio transport — loads `brand-kit.json`, calls `buildSurface`, frames newline-delimited JSON-RPC over stdin/stdout around `handle()`, prints the STDERR banner. No surface logic. |
| The **kit** | `brandKit(doc, systems)` in `src/ui/model.mjs:237` | the pure projection that produces `brand-kit.json` — `stops`/`palettes`/`roles` (Color), `type`, `geometry`. `systems` is the per-system opt-in. |
| The **package** | `downloadBrandKitMcp()` in `src/ui/app.js:6565` | the export drawer's **Download Brand-Kit MCP** — zips the server + core + `brand-kit.json` + README + `package.json`. Uses the `MCP_BRAND_KIT` asset. |
| The **asset** | `src/ui/mcp-assets.js` (GENERATED) | the inlined server + core + README (`MCP_BRAND_KIT.{server,core,readme}`), built from `mcp/` by `npm run gen:mcp-assets` (`scripts/gen-mcp-assets.mjs`). **Never hand-edit.** |

## The surface — what's served, and the opt-in gating

The kit's `systems` arg (the drawer's **Include** toggles, passed as `this.exportSystems`) opts each SYSTEM
in/out; omitted/undefined → **all three** (the back-compat default). `buildSurface(kit)` reads what's present:

- **Color** (`palettes`/`roles` present) → tools `nonoun-brand-kit:list_palettes`,
  `nonoun-brand-kit:get_ramp(palette)`, `nonoun-brand-kit:resolve_token(palette, role, scheme)`,
  `nonoun-brand-kit:get_semantic(scheme)`, `nonoun-brand-kit:nearest_token(hex)`; resources
  `brand://palettes`, `brand://semantic/light`, `brand://semantic/dark`.
- **Typography** (`kit.type` present) → tool `nonoun-brand-kit:get_type`; resource `brand://type`. `kit.type.categories`
  carries the **seven** `make7` voices — **Display**, **Heading Editorial / Context / Eyebrow**, **Body**,
  **UI**, **Code** — each step with `size · lineHeight · letterSpacing · weight` (+ `textTransform`,
  `paragraph*`). The guide prose teaches a four-voice mental model (Display/Heading/Body/UI); the *data* has
  seven keys — don't claim four.
- **Geometry** (`kit.geometry` present) → tool `nonoun-brand-kit:get_geometry`; resource `brand://geometry`. The XS–2XL
  `sizes` ramp, the top-level `radii` ladder (`none/sm/md/lg/full`), and the `space` scale. Each size carries
  `{ height, icon, caret, font, gap, padding, edgePadding, radiusPill, minWidth }`; the centering law is
  **`padding === (height − icon) / 2`** (the server prose calls `icon` "glyph" loosely — the field is `icon`).
- **Always** → resource `brand://kit` (full JSON) + `brand://guide` (markdown), and prompt **`apply_brand`**
  (surfaces from `*/surface*`, accents from a palette's prime role, text from `*/on*`, never raw values).

`const hasColor = palettes.length > 0 || Object.keys(roles).length > 0;` is the colour gate; `kit.type` /
`kit.geometry` (truthy) are the type/geometry gates. They are checked in **four places that must stay in
lockstep**: the `usageGuide()` prose, the `TOOLS` pushes, and the `RESOURCES` pushes (all three in
`brand-kit-core.mjs`), plus the startup STDERR banner (`brand-kit-server.mjs`). See `references/foundations.md`.

## Procedure — add a tool or resource

1. **Edit the surface in `mcp/brand-kit-core.mjs`** (inside `buildSurface`). A tool is `{ name, description,
   inputSchema, run(args) }` pushed into `TOOLS` (gate it behind `hasColor` / `kit.type` / `kit.geometry` if it
   depends on that system). A resource is `{ uri, name, mimeType, read() }` pushed into `RESOURCES`. The pure
   `handle()` dispatches `tools/call` and `resources/read` by name/uri automatically — `textResult` wraps a
   tool's return as MCP content. `mcp/brand-kit-server.mjs` is **transport only** (kit load · stdio framing ·
   the stderr banner) — touch it only for transport concerns; surface added there would never reach the hosted
   Worker. **Do not add a transport, a dependency, or a new RPC method casually** — the methods `handle()`
   covers (`initialize`, `notifications/initialized`, `ping`, `tools/list|call`, `resources/list|read`,
   `prompts/list|get`) are the whole protocol surface.
2. **Read the kit, don't recompute.** `mcp/` is **engine-free** (no `src/engine` import) — the core serves what
   `brandKit` already resolved (`p.ramp` hexes, `roles[slug][key].{light,dark}`). The only math it does is
   `nearestToken` (squared-RGB distance) and `semanticFor` (flatten to `{ "palette/role": hex }`). If your
   tool needs a value the kit doesn't carry, add it in `brandKit` (`model.mjs`), not in `mcp/`.
3. **Honour the opt-in.** If the new surface depends on a system, gate it so it's absent when that system is.
   A colour tool must NOT appear for a type-only kit. Update the matching `usageGuide()` section too (same gate).
4. **Log to STDERR.** `process.stderr.write(...)`. Never `console.log` (it writes stdout = protocol).
   The core does **no I/O at all**; logging lives in the server, which fails loud on stderr and
   `process.exit(1)` (see the kit-load and bad-message paths).
5. **Regenerate the asset.** `npm run gen:mcp-assets` re-inlines `mcp/brand-kit-server.mjs` +
   `mcp/brand-kit-core.mjs` + `mcp/README.md` into `src/ui/mcp-assets.js` (also run by `npm test` +
   `npm run build`). **Never hand-edit `mcp-assets.js`** — it carries a GENERATED header; an un-regenerated
   asset means the *downloaded* zip ships a stale server.
6. **Update `mcp/README.md`** (the user-facing doc) — its "What it exposes" tool table + resource list mirror
   the surface by hand. A new tool/resource that isn't in the README is invisible to whoever opens the zip.
7. **Extend the tests** — `test/mcp/core.mjs` (the pure surface + parity lock) and `test/mcp/brand-kit.mjs`
   (end-to-end over spawned stdio); drive the new tool/resource in both (see Validate).

## Validate (draft → check → fix → re-check)

The test **spawns the real server, drives the MCP protocol over stdio, and asserts the surface** — it is the
fastest, most faithful signal. Run it first, then the suite:

```
node test/mcp/core.mjs        # the PURE surface: buildSurface + handle driven directly (no spawn) — the
                              #   parity lock shared by the stdio server and the hosted Worker
node test/mcp/brand-kit.mjs   # generates a kit from defaultDocument(), spawns the server, asserts:
                              #   initialize → serverInfo.name "nonoun-brand-kit" + capabilities.tools
                              #   tools/list has the 5 colour tools + get_type + get_geometry
                              #   get_type (Body voice) · get_geometry (centering law on MD; font = type UI size)
                              #   resources/list (brand://type + brand://geometry) · list_palettes (8)
                              #   resolve_token primary/primary (light+dark) · get_ramp (>=19 stops, incl. 500)
                              #   nearest_token (exact stop → distance 0) · get_semantic (flatten)
                              #   brand://guide · apply_brand prompt · unknown method → -32601
npm test                      # the above + engine/ui/figma + regenerates mcp-assets.js (node test/run.mjs)
```

The test exercises the **opt-in contract directly** on the kit projection (not the spawned server):
`brandKit({color:true})` omits type+geometry, `brandKit({type:true})` omits colour+geometry,
`brandKit({geometry:true})` omits colour+type. If you add a system-gated surface, add the matching opt-in
assertion. The composition check (`geo.sizes.MD.font === ty.categories.UI.MD.size`, `geo.typed === true`)
proves geometry's per-step `font` is the type UI size — **one source of truth**; don't break it. Don't call it
done until `node test/mcp/brand-kit.mjs` AND `npm test` are green, and a manual
`node mcp/brand-kit-server.mjs <kit.json>` prints its banner to **stderr** with nothing on stdout until a
request arrives.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the JSON-RPC-over-stdio loop, the kit shape `brandKit` emits, the four opt-in checkpoints, the engine-free contract, `nearestToken`/`semanticFor` — the mental model the procedure assumes |
| `references/best-practices.md` | the non-obvious do/don't (stdout-is-sacred, gate-in-lockstep, regenerate-the-asset, README-is-hand-mirrored, serve-don't-compute) + a worked walkthrough adding `nonoun-brand-kit:get_geometry` |
| `references/rubric.md` | score the change before calling it done — stdio hygiene + opt-in gating + asset regen + test coverage are the gates |
| `mcp/README.md` | the user-facing doc (de-staled) — what it exposes, how to add it to Claude Code / a project `.mcp.json`. Cite, keep in sync. |
| `.claude/skills/adding-semantic-roles` | the roles that flow into `nonoun-brand-kit:get_semantic` / `nonoun-brand-kit:resolve_token` / `brand://semantic/*` — cite for the per-palette role model (59 today) |
| `.claude/skills/geometry-system` + `.claude/skills/type-scale` + `src/engine/type.mjs` (`typeScale`) · `src/engine/geometry.mjs` (`geomScale`) | the type + geometry scales `nonoun-brand-kit:get_type` / `nonoun-brand-kit:get_geometry` serve verbatim — cite the `geometry-system` skill (the size ramp / centering law) + the `type-scale` skill (the seven voices) + the engine for the shapes; don't re-derive them |

## Peer skills

[[adding-semantic-roles]] (the roles this serves) · [[adding-export-formats]] (the kit download is an
export surface) · [[shipping-changes]] (landing the change).