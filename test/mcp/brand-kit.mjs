#!/usr/bin/env node
// brand-kit.mjs — verifier for the downloadable Brand-Kit MCP server. Generates a kit from the default
// doc, spawns the (zero-dep) server, drives the MCP protocol over stdio, and asserts tools/resources/
// prompts. Proves the engine's tokens are servable to an agent end-to-end.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { brandKit, defaultDocument } from "../../src/ui/model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. generate a real brand kit from the default doc (no systems arg → all three, the back-compat default)
const kit = brandKit(defaultDocument());
ok(kit.$schema === "nonoun-brand-kit/1" && kit.palettes.length === 8, `brandKit shape: ${kit.palettes.length} palettes (want 8)`);
ok(kit.roles.primary && typeof kit.roles.primary.primary.light === "string" && typeof kit.roles.primary.primary.dark === "string", "brandKit resolves the prime accent for light + dark");
ok(kit.type && kit.geometry, "brandKit() (no arg) includes all three systems (color + type + geometry)");

// opt-in gating: brandKit(doc, systems) includes ONLY the selected systems (the export opt-in contract)
const colorOnly = brandKit(defaultDocument(), { color: true });
ok(colorOnly.palettes && !colorOnly.type && !colorOnly.geometry, "brandKit({color}) omits type + geometry");
const typeOnly = brandKit(defaultDocument(), { type: true });
ok(!typeOnly.palettes && !typeOnly.roles && typeOnly.type && !typeOnly.geometry, "brandKit({type}) omits colour + geometry");
const geomOnly = brandKit(defaultDocument(), { geometry: true });
ok(!geomOnly.palettes && !geomOnly.type && geomOnly.geometry, "brandKit({geometry}) omits colour + type");

// BASE per-cell overrides reach the kit (Phase 3 — the MCP zip + get_type/get_geometry are override-aware,
// like every other export). A "<...>|base"-keyed tokenOverride must surface on kit.type / kit.geometry.
{
  const baseDoc = defaultDocument();
  const ovDoc = {
    ...baseDoc,
    type: { ...baseDoc.type, tokenOverrides: { "Body|MD|base": 99, "UI|MD|base": 33 } },
    geometry: { ...baseDoc.geometry, tokenOverrides: { "MD|base": 50 } },
  };
  const ovKit = brandKit(ovDoc);
  const plainKit = brandKit(baseDoc);
  ok(ovKit.type.categories.Body.MD.size === 99, `a BASE type override reaches kit.type (got ${ovKit.type.categories.Body.MD.size}, want 99)`);
  ok(ovKit.type.categories.Body.MD.size !== plainKit.type.categories.Body.MD.size, "the type override actually moves kit.type off the un-overridden kit");
  ok(ovKit.geometry.sizes.MD.height === 50, `a BASE geom override reaches kit.geometry (got ${ovKit.geometry.sizes.MD.height}, want 50)`);
  ok(ovKit.geometry.sizes.MD.height !== plainKit.geometry.sizes.MD.height, "the geom override actually moves kit.geometry off the un-overridden kit");
  // the COMPOSED per-step `font` carries the type override too (the geom MD font = the overridden UI MD size)
  ok(ovKit.geometry.sizes.MD.font === 33, `the composed geom font carries the BASE type UI override (got ${ovKit.geometry.sizes.MD.font}, want 33)`);
  // a NON-base ("|md")-keyed override must NOT touch the BASE kit (the base slice is mode-local)
  const nonBaseDoc = { ...baseDoc, type: { ...baseDoc.type, tokenOverrides: { "Body|MD|md": 99 } } };
  ok(brandKit(nonBaseDoc).type.categories.Body.MD.size === plainKit.type.categories.Body.MD.size, "a non-base (|md) override does NOT leak into the BASE kit");
}

const dir = mkdtempSync(join(tmpdir(), "nonoun-mcp-"));
const kitPath = join(dir, "brand-kit.json");
writeFileSync(kitPath, JSON.stringify(kit));

// 2. spawn the server + drive newline-delimited JSON-RPC over stdio
const srv = spawn("node", [resolve(ROOT, "mcp/brand-kit-server.mjs"), kitPath], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let buf = "";
srv.stdout.setEncoding("utf8");
srv.stdout.on("data", (c) => {
  buf += c; let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    const m = JSON.parse(line);
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
let idc = 0;
const rpc = (method, params) => new Promise((res) => { const id = ++idc; pending.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const notify = (method) => srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
const callTool = async (name, args) => { const r = await rpc("tools/call", { name, arguments: args }); return JSON.parse(r.result.content[0].text); };

try {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  ok(init.result && init.result.serverInfo.name === "nonoun-brand-kit" && !!init.result.capabilities.tools, "initialize → serverInfo + capabilities");
  notify("notifications/initialized");

  const tools = (await rpc("tools/list")).result.tools.map((t) => t.name);
  ok(["list_palettes", "get_ramp", "resolve_token", "get_semantic", "nearest_token"].every((n) => tools.includes(n)), `tools/list has all 5 colour tools (${tools})`);
  ok(tools.includes("get_type") && tools.includes("get_geometry"), `tools/list has get_type + get_geometry (the opted-in systems) (${tools})`);

  const ty = await callTool("get_type", {});
  ok(ty && ty.categories && ty.categories.Body, "get_type → the typography scale (Body voice present)");
  const geo = await callTool("get_geometry", {});
  ok(geo && geo.sizes && geo.sizes.MD && geo.sizes.MD.padding === (geo.sizes.MD.height - geo.sizes.MD.icon) / 2, "get_geometry → the dimensional scale (the centering law holds on the served MD size)");
  // composition end-to-end: the served geometry's per-step `font` is the served type UI size (one source of truth)
  ok(geo.typed === true && geo.sizes.MD.font === ty.categories.UI.MD.size, `get_geometry font is composed from the type UI scale (${geo.sizes.MD.font} = ${ty.categories.UI.MD.size})`);

  const resUris = (await rpc("resources/list")).result.resources.map((r) => r.uri);
  ok(resUris.includes("brand://type") && resUris.includes("brand://geometry"), `resources/list has brand://type + brand://geometry (${resUris})`);

  const pal = await callTool("list_palettes", {});
  ok(Array.isArray(pal) && pal.length === 8 && /^#|^oklch/.test(pal[0].key || ""), "list_palettes → 8 palettes with identity colours");

  const tl = await callTool("resolve_token", { role: "primary/primary", scheme: "light" });
  const td = await callTool("resolve_token", { role: "primary/primary", scheme: "dark" });
  ok(tl.hex === kit.roles.primary.primary.light && td.hex === kit.roles.primary.primary.dark, `resolve_token primary/primary matches the kit (light ${tl.hex} / dark ${td.hex})`);

  const ramp = await callTool("get_ramp", { palette: "primary" });
  ok(ramp.ramp && ramp.ramp.length >= 19 && !!ramp.ramp.find((s) => s.stop === 500), "get_ramp → the tonal ramp incl. stop 500");

  const exact = kit.palettes[1].ramp.find((s) => s.stop === 500).hex;
  const near = await callTool("nearest_token", { hex: exact });
  ok(near.hex === exact && near.distance === 0, `nearest_token of an exact stop hex → distance 0 (got ${near.distance})`);

  const sem = await callTool("get_semantic", { scheme: "dark" });
  ok(typeof sem["primary/surface"] === "string", "get_semantic flattens roles to palette/role hexes");

  const guide = (await rpc("resources/read", { uri: "brand://guide" })).result.contents[0].text;
  ok(typeof guide === "string" && guide.length > 50, "resources/read brand://guide returns the usage guide");

  const prm = await rpc("prompts/get", { name: "apply_brand" });
  ok(prm.result.messages && prm.result.messages[0].content.text.length > 20, "prompts/get apply_brand returns guidance");

  const bad = await rpc("nope/nope", {});
  ok(bad.error && bad.error.code === -32601, "unknown method → JSON-RPC -32601");
} catch (e) {
  fails.push("threw: " + e.message);
} finally {
  try { srv.stdin.end(); srv.kill(); } catch { /* */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

if (fails.length) { console.error("brand-kit MCP FAIL:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("brand-kit MCP PASS — server serves palettes/ramps/semantic/nearest over MCP stdio");
process.exit(0);
