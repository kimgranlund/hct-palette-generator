import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
// ROOT = the repo root (this script lives in scripts/), derived from its own location.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// The Palette Categories ship as a small bundled index + one LAZY module per category (categories/<slug>.js),
// loaded in the web build via dynamic import() (vite code-splits each into its own chunk). The single-file
// offline plugin can't lazy-load, so we INLINE every category module here and rewrite import("./<slug>.js")
// → a synchronous registry resolve (see transform()). Discover them so adding a category needs no edit here.
const CATEGORY_DIR = "src/ui/categories";
const CATEGORY_FILES = readdirSync(`${ROOT}/${CATEGORY_DIR}`).filter((f) => f.endsWith(".js"));
const categoryKey = (file) => (file === "index.js" ? "categoryIndex" : "category_" + file.replace(/\.js$/, ""));

// dependency order; entry last. Category modules are pure data (no imports) — placed before the app,
// which imports the index; the index's lazy thunks reference the category modules only at call time.
const MODS = [
  ["hct", "src/engine/hct.js"], ["okhsl", "src/engine/okhsl.js"], ["semantic", "src/engine/semantic.js"],
  ["tonal", "src/engine/tonal.js"], ["derive", "src/engine/derive.mjs"], ["persist", "src/ui/persist.js"],
  ["exports", "src/engine/exports.js"], ["figmaPlugin", "src/ui/figma-plugin-assets.js"],
  ...CATEGORY_FILES.filter((f) => f !== "index.js").map((f) => [categoryKey(f), `${CATEGORY_DIR}/${f}`]),
  ["categoryIndex", `${CATEGORY_DIR}/index.js`],
  ["zip", "src/ui/zip.mjs"],
  ["icons", "src/ui/icons.js"],
  ["model", "src/ui/model.mjs"], ["app", "src/ui/app.js"],
];
const KEY = { "hct.js": "hct", "okhsl.js": "okhsl", "semantic.js": "semantic", "tonal.js": "tonal", "derive.mjs": "derive", "persist.js": "persist",
  "exports.js": "exports", "figma-plugin-assets.js": "figmaPlugin", "zip.mjs": "zip", "icons.js": "icons", "model.mjs": "model",
  ...Object.fromEntries(CATEGORY_FILES.map((f) => [f, categoryKey(f)])) };

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
  // rewrite DYNAMIC import("./categories/<slug>.js") -> a synchronous registry resolve. The single-file
  // offline bundle has no module server, so each lazy category chunk is inlined into __M and resolved here.
  src = src.replace(/\bimport\(\s*["']([^"']+)["']\s*\)/g, (_, path) => {
    const key = KEY[path.split("/").pop()];
    if (!key) throw new Error("unknown dynamic import path " + path);
    return `Promise.resolve(__M.${key})`;
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
// inline the favicon as a data URI so the SINGLE-FILE offline build carries its tab icon with no
// external request (same reason icons.js inlines its SVGs). The favicon SVG's own prefers-color-scheme
// invert <style> is scoped to the icon's render context, not the page, so it's safe as rel=icon.
const favHref = "data:image/svg+xml;base64," + Buffer.from(readFileSync(`${ROOT}/public/favicon/favicon.svg`)).toString("base64");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="${favHref}">
<title>Color Tokens by NONOUN</title>
<style>${css}</style></head>
<body><nonoun-color-tokens></nonoun-color-tokens>
<script type="module">
${out}</script></body></html>`;
mkdirSync(`${ROOT}/dist`, { recursive: true });
writeFileSync(`${ROOT}/dist/nonoun-color-tokens.html`, html);
console.log("wrote dist/nonoun-color-tokens.html", (html.length / 1024).toFixed(1) + " KB");
