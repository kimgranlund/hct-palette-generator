#!/usr/bin/env node
// core.mjs — verifier for the PURE, transport-agnostic MCP core (mcp/brand-kit-core.mjs): buildSurface +
// handle. This is the shared surface the stdio server (brand-kit-server.mjs) AND the hosted Cloudflare
// Worker both serve — testing the core directly LOCKS that surface so the two transports can't drift
// (parity by construction). No process spawn; the stdio end-to-end lives in test/mcp/brand-kit.mjs.
import { buildSurface, handle, SERVER, PROTOCOL_VERSION } from "../../mcp/brand-kit-core.mjs";
import { brandKit, defaultDocument } from "../../src/ui/model.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// a real kit (all three systems) → the surface + a request helper that drives handle() like a client would
const kit = brandKit(defaultDocument());
const surface = buildSurface(kit);
let idc = 0;
const req = (method, params) => handle({ jsonrpc: "2.0", id: ++idc, method, params }, surface);
const note = (method) => handle({ jsonrpc: "2.0", method }, surface); // no id → notification
const callTool = (name, args) => JSON.parse(req("tools/call", { name, arguments: args }).result.content[0].text);

// ── buildSurface: the surface reflects the present systems ──
const toolNames = surface.TOOLS.map((t) => t.name);
ok(["list_palettes", "get_ramp", "resolve_token", "get_semantic", "nearest_token"].every((n) => toolNames.includes(n)), `surface has the 5 colour tools (${toolNames})`);
ok(toolNames.includes("get_type") && toolNames.includes("get_geometry"), "surface has get_type + get_geometry (the opted-in systems)");
const resUris = surface.RESOURCES.map((r) => r.uri);
ok(["brand://kit", "brand://palettes", "brand://semantic/light", "brand://semantic/dark", "brand://type", "brand://geometry", "brand://guide"].every((u) => resUris.includes(u)), `surface has all resources (${resUris})`);
ok(surface.PROMPTS.length === 1 && surface.PROMPTS[0].name === "apply_brand", "surface has the apply_brand prompt");
ok(surface.SERVER === SERVER && surface.PROTOCOL_VERSION === PROTOCOL_VERSION && SERVER.name === "nonoun-brand-kit", "surface carries SERVER + PROTOCOL_VERSION");

// ── handle: the JSON-RPC dispatch ──
const init = req("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {} });
ok(init.result && init.result.serverInfo.name === "nonoun-brand-kit" && !!init.result.capabilities.tools && init.result.protocolVersion === PROTOCOL_VERSION, "initialize → serverInfo + capabilities + protocolVersion");
ok(note("notifications/initialized") === null, "a notification (no id) returns null — nothing to send");
ok(handle({ jsonrpc: "2.0", method: "ping" }, surface) === null && req("ping", {}).result && Object.keys(req("ping", {}).result).length === 0, "ping: notification → null, request → {}");

ok(req("tools/list").result.tools.map((t) => t.name).join() === toolNames.join(), "tools/list mirrors the surface tools");
ok(req("resources/list").result.resources.length === surface.RESOURCES.length, "resources/list mirrors the surface resources");
ok(req("prompts/list").result.prompts[0].name === "apply_brand", "prompts/list → apply_brand");

// tools/call — the actual brand data, end to end through handle()
const pal = callTool("list_palettes", {});
ok(Array.isArray(pal) && pal.length === 8, "list_palettes → 8 palettes");
const tl = callTool("resolve_token", { role: "primary/primary", scheme: "light" });
ok(tl.hex === kit.roles.primary.primary.light, `resolve_token primary/primary light matches the kit (${tl.hex})`);
const ramp = callTool("get_ramp", { palette: "primary" });
ok(ramp.ramp && !!ramp.ramp.find((s) => s.stop === 500), "get_ramp → the tonal ramp incl. stop 500");
const exact = kit.palettes[1].ramp.find((s) => s.stop === 500).hex;
ok(callTool("nearest_token", { hex: exact }).distance === 0, "nearest_token of an exact stop hex → distance 0");
ok(typeof callTool("get_semantic", { scheme: "dark" })["primary/surface"] === "string", "get_semantic flattens to palette/role hexes");
const ty = callTool("get_type", {});
const geo = callTool("get_geometry", {});
ok(ty.categories && ty.categories.Body && geo.sizes && geo.sizes.MD.padding === (geo.sizes.MD.height - geo.sizes.MD.icon) / 2, "get_type + get_geometry serve the scales (the centering law holds)");
ok(geo.sizes.MD.font === ty.categories.UI.MD.size, "the served geometry font is composed from the served type UI scale (one source of truth)");

// resources/read + prompts/get
ok((req("resources/read", { uri: "brand://guide" }).result.contents[0].text || "").length > 50, "resources/read brand://guide → the usage guide");
ok((req("prompts/get", { name: "apply_brand" }).result.messages[0].content.text || "").length > 20, "prompts/get apply_brand → guidance");

// errors
ok(req("tools/call", { name: "nope" }).error.code === -32602, "unknown tool → -32602");
ok(req("resources/read", { uri: "brand://nope" }).error.code === -32602, "unknown resource → -32602");
ok(req("nope/nope", {}).error.code === -32601, "unknown method (request) → -32601");

// ── opt-in gating: the surface SHRINKS to the included systems ──
const colorOnly = buildSurface(brandKit(defaultDocument(), { color: true }));
ok(!colorOnly.TOOLS.some((t) => ["get_type", "get_geometry"].includes(t.name)) && !colorOnly.RESOURCES.some((r) => ["brand://type", "brand://geometry"].includes(r.uri)), "color-only kit → no type/geometry tools or resources");
const typeOnly = buildSurface(brandKit(defaultDocument(), { type: true }));
ok(typeOnly.TOOLS.map((t) => t.name).join() === "get_type" && !typeOnly.TOOLS.some((t) => t.name === "list_palettes"), "type-only kit → only get_type (no colour tools)");
const empty = buildSurface({});
ok(empty.TOOLS.length === 0 && empty.RESOURCES.map((r) => r.uri).join() === "brand://kit,brand://guide" && empty.hasColor === false, "an empty kit → no tools, just brand://kit + brand://guide");

if (fails.length) { console.error(`brand-kit core FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("brand-kit core PASS — buildSurface (system-gated) + handle (initialize/tools/resources/prompts/errors), the surface shared by the stdio server + the hosted Worker");
process.exit(0);
