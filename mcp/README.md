# Brand-Kit MCP

A **zero-dependency** [MCP](https://modelcontextprotocol.io/) server that serves an **Ultimate Tokens by
NONOUN** brand kit (your generated design tokens) to AI agents — **Claude Code / Claude Design, Cursor,
VS Code, ChatGPT**, anything that speaks MCP. The agent then builds with your brand's *exact* tokens
instead of guessing.

The kit can carry up to **three token systems** — **Color**, **Typography**, and **Geometry** — and you
choose which to include when you download it (the export drawer's *Include* toggles). The server's
surface reflects what's present: the colour tools/resources appear only with palettes, `get_type` /
`brand://type` only when typography is included, `get_geometry` / `brand://geometry` only when geometry is.

> Status: **shipped.** The in-app export drawer's **Download Brand-Kit MCP** packages this server +
> your opted-in tokens as a ready-to-run `.zip`. Tested end-to-end (`test/mcp/brand-kit.mjs`).

## Files

- `brand-kit-server.mjs` — the stdio entry. Pure Node, **no `npm install`**.
- `brand-kit-core.mjs` — the transport-agnostic MCP surface the server imports (keep it beside the server).
- `brand-kit.json` — your resolved tokens (produced by `brandKit(doc, systems)` — the opted-in palettes +
  59 semantic roles (light + dark), the typography scale, and/or the geometry scale). The server reads
  this sibling file.

## Run it

```bash
node brand-kit-server.mjs                 # reads ./brand-kit.json
node brand-kit-server.mjs path/to/kit.json   # or an explicit path
```

## Add it to Claude Code

```bash
claude mcp add brand-kit -- node /abs/path/to/brand-kit-server.mjs
```

…or in a project `.mcp.json`:

```json
{ "mcpServers": { "brand-kit": { "command": "node", "args": ["/abs/path/to/brand-kit-server.mjs"] } } }
```

(Claude Desktop / Cursor / VS Code use the same `command` + `args` shape in their MCP config.)

## What it exposes

**Resources** — `brand://kit` (full), `brand://guide`, plus (per included system) `brand://palettes` ·
`brand://semantic/light` · `brand://semantic/dark` (Color), `brand://type` (Typography),
`brand://geometry` (Geometry).

**Tools** (the colour tools listed only when palettes are present; `get_type` / `get_geometry` only when
those systems are included)
| tool | does |
|---|---|
| `list_palettes` | the palettes + their identity colour |
| `get_ramp(palette)` | a palette's full tonal ramp (stop → hex) |
| `resolve_token(palette, role, scheme)` | the hex for a semantic role in `light`/`dark` (role can be `"palette/role"`) |
| `get_semantic(scheme)` | all 59 roles per palette resolved for a scheme |
| `nearest_token(hex)` | the brand token closest to a hex (reuse the system, don't invent a colour) |
| `get_type` | the typography scale — treatment, fonts, and the per-voice size ramp |
| `get_geometry` | the geometry scale — the size ramp, the centering law, radius + spacing |

**Prompt** — `apply_brand`: how to apply the kit (surfaces from `*/surface*`, accents from the prime
roles, text from `*/on*`; the type voices; the geometry size ramp + centering law; never raw values).

## Protocol

JSON-RPC 2.0 over **stdio**, newline-delimited. Logging goes to **stderr** only.
