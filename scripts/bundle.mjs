import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
// ROOT = the repo root (this script lives in scripts/), derived from its own location.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// dependency order; entry last
const MODS = [
  ["hct", "src/engine/hct.js"], ["semantic", "src/engine/semantic.js"],
  ["tonal", "src/engine/tonal.js"], ["persist", "src/ui/persist.js"],
  ["exports", "src/engine/exports.js"], ["figmaPlugin", "src/ui/figma-plugin-assets.js"],
  ["travelPresets", "src/ui/travel-presets.js"],
  ["zip", "src/ui/zip.mjs"],
  ["model", "src/ui/model.mjs"], ["app", "src/ui/app.js"],
];
const KEY = { "hct.js": "hct", "semantic.js": "semantic", "tonal.js": "tonal", "persist.js": "persist",
  "exports.js": "exports", "figma-plugin-assets.js": "figmaPlugin", "travel-presets.js": "travelPresets", "zip.mjs": "zip", "model.mjs": "model" };

function transform(src) {
  const names = new Set();
  // rewrite imports (multi-line aware) -> destructure from the registry
  src = src.replace(/import\s+(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["'];?/g, (_, what, path) => {
    const key = KEY[path.split("/").pop()];
    if (!key) throw new Error("unknown import path " + path);
    if (what.startsWith("*")) return `const ${what.split(/\s+as\s+/)[1]} = __M.${key};`;
    const inner = what.replace(/[{}]/g, "").split(",").map((s) => s.trim()).filter(Boolean)
      .map((s) => s.includes(" as ") ? s.replace(/\s+as\s+/, ": ") : s).join(", ");
    return `const { ${inner} } = __M.${key};`;
  });
  // collect + strip declaration exports
  src = src.replace(/^export\s+(async\s+function|function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { names.add(name); return `${kind} ${name}`; });
  // collect + strip list exports  (export { a, b as c };)
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, list) => { list.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => names.add((s.split(/\s+as\s+/)[1] || s).trim())); return ""; });
  return { src, names: [...names] };
}

let out = "const __M = {};\n";
for (const [key, rel] of MODS) {
  const { src, names } = transform(readFileSync(`${ROOT}/${rel}`, "utf8"));
  if (key === "app") out += `(function(){\n${src}\n})();\n`;
  else out += `__M.${key} = (function(){\n${src}\nreturn { ${names.join(", ")} };\n})();\n`;
}

const css = readFileSync(`${ROOT}/src/ui/styles.css`, "utf8");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HCT Palette Generator</title>
<style>${css}</style></head>
<body><hct-app></hct-app>
<script type="module">
${out}</script></body></html>`;
mkdirSync(`${ROOT}/dist`, { recursive: true });
writeFileSync(`${ROOT}/dist/hct-palette-generator.html`, html);
console.log("wrote dist/hct-palette-generator.html", (html.length / 1024).toFixed(1) + " KB");
