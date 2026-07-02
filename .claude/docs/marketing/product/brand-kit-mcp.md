# Brand-Kit MCP — product copy

Copy for every surface that describes the MCP story: the in-app download, README/docs mentions, MCP
directory listings, and the agent-facing pitch. **Not yet live: the hosted endpoint (a Pro feature) —
copy about it uses "when live" phrasing or omits it** ([fact sheet](../fact-sheet.md), rule 2).
Posture: **landing/store**; the setup block is docs register.

**One-liner**

```
Your design tokens, served to your AI agents — so they build with your exact roles instead of guessing a hex.
```

**Short description (directories / README)**

> Download a zero-dependency MCP server pre-filled with your brand kit. Point Claude Code, Cursor, or
> any MCP agent at it and the agent reads your palettes, ramps, the 59-role semantic layer in light
> and dark, your type scale, and your geometry — exact values, resolved tokens, no guessing.

**The pitch (long form)**

> Agents write UI code all day, and they guess at design systems while doing it — a plausible hex, an
> approximate spacing, a font stack from memory. The Brand-Kit MCP removes the guessing. Your kit —
> the systems you opt in: Color, Typography, Geometry — ships as a single zero-dependency server the
> agent queries directly: resolve a token, look up a role, fetch the ramp. The values it gets are the
> values you shipped, because they are generated from the same source as every other export.
>
> It runs with nothing but Node — `node brand-kit-server.mjs` — no packages, no account, offline.

**Setup block (docs register — paste where instructions belong)**

```bash
# 1. In Ultimate Tokens: Export → Download Brand-Kit MCP  (a .zip: server + your brand-kit.json + README)
# 2. Unzip, then register it with your agent:
claude mcp add brand-kit -- node /path/to/brand-kit-server.mjs
# Cursor / other MCP clients: add a stdio server pointing at the same command.
```

**What the agent can ask (feature bullets)**

```
• get_semantic — the 59-role semantic layer, light + dark
• get_type / get_geometry — the composed scales
• resolve_token / nearest_token — exact lookups, no approximations
• brand:// resources + an apply_brand prompt
```
