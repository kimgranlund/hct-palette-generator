#!/usr/bin/env node
// brand-kit-server.mjs — the zero-dependency STDIO entry for the Brand-Kit MCP server. It reads a sibling
// `brand-kit.json` (the resolved tokens, produced by "Ultimate Tokens by NONOUN"), builds the MCP surface,
// and frames newline-delimited JSON-RPC 2.0 over stdio around the PURE dispatch in `brand-kit-core.mjs`
// (which the hosted Cloudflare Worker imports too — same surface, parity by construction). Pure Node, no
// `npm install` — just `node brand-kit-server.mjs`. (All logging → STDERR; stdout is the protocol stream.)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildSurface, handle } from "./brand-kit-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// load the brand kit: argv[2] → $BRAND_KIT → ./brand-kit.json (next to this server). Fail loud on stderr.
const KIT_PATH = process.argv[2] || process.env.BRAND_KIT || resolve(HERE, "brand-kit.json");
let kit;
try {
  kit = JSON.parse(readFileSync(KIT_PATH, "utf8"));
} catch (e) {
  process.stderr.write(`[brand-kit] could not read ${KIT_PATH}: ${e.message}\n`);
  process.exit(1);
}

const surface = buildSurface(kit);

// newline-delimited JSON-RPC over stdin → the pure handle() → stdout (only when there's a response).
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const res = handle(JSON.parse(line), surface);
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (e) {
      process.stderr.write(`[brand-kit] bad message: ${e.message}\n`);
    }
  }
});
process.stdin.on("end", () => process.exit(0));

const { palettes, hasColor } = surface;
process.stderr.write(`[brand-kit] serving "${kit.name || "Brand Kit"}" [${[hasColor && `${palettes.length} palettes`, kit.type && "type", kit.geometry && "geometry"].filter(Boolean).join(" · ") || "empty"}] over MCP stdio\n`);
