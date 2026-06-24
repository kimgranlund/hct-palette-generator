#!/usr/bin/env node
// verify.mjs — export-formats validation adapter (CRITIC side; deny-on-write to the advancer).
import { readFileSync } from "node:fs";
import * as X from "../../src/engine/exports.js";

const RT = JSON.parse(readFileSync(new URL("../../docs/spec/data/role-table.json", import.meta.url), "utf8"));
const C = (palettes) => ({ palettes, curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" });
const ALL = RT.defaults.map((p) => ({ ...p, on: true }));
const enabledCount = (st) => st.palettes.filter((p) => p.on !== false).length;
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// recursively collect DTCG color leaves ({$type:"color", $value:{...}, $extensions?})
const leaves = (node, out = []) => {
  if (node && typeof node === "object") {
    if (node.$type === "color" && node.$value) out.push(node);
    else for (const k of Object.keys(node)) leaves(node[k], out);
  }
  return out;
};

// ── hpg-export-dtcg-shape ────────────────────────────────────────────────────────────────
const dtcg = X.exportDTCG(C(ALL), {});
const want3 = ["palette.tokens.json", "Light_tokens.json", "Dark_tokens.json"];
if (want3.some((k) => !(k in dtcg)) || Object.keys(dtcg).length !== 3) FAIL("dtcg-shape", `keys = ${Object.keys(dtcg)}`);
for (const k of want3) try { JSON.parse(JSON.stringify(dtcg[k])); } catch { FAIL("dtcg-shape", `${k} not JSON-serializable`); }

// ── hpg-export-leaf-valid (>= 37 x enabled resolved leaves per mode; each well-formed) ────
for (const file of ["Light_tokens.json", "Dark_tokens.json"]) {
  const ls = leaves(dtcg[file]);
  if (ls.length < 37 * enabledCount(C(ALL))) FAIL("leaf-valid", `${file} has ${ls.length} leaves < 37×${enabledCount(C(ALL))}`);
  for (const lf of ls) {
    const v = lf.$value;
    if (!v || v.colorSpace !== "srgb") { FAIL("leaf-valid", `leaf colorSpace != srgb`); break; }
    if (!Array.isArray(v.components) || v.components.length !== 3 || v.components.some((c) => c < 0 || c > 1)) { FAIL("leaf-valid", `components out of [0,1]: ${v.components}`); break; }
    if (typeof v.alpha !== "number" || v.alpha < 0 || v.alpha > 1) { FAIL("leaf-valid", `alpha out of [0,1]: ${v.alpha}`); break; }
    const hx = "#" + v.components.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    if ((v.hex || "").toUpperCase().slice(0, 7) !== hx) { FAIL("leaf-valid", `hex ${v.hex} != ${hx} from components`); break; }
  }
}

// ── hpg-export-resolved (no aliasData when blank; positive control when set) ──────────────
const semLeaves = (d) => [...leaves(d["Light_tokens.json"]), ...leaves(d["Dark_tokens.json"])];
if (semLeaves(dtcg).some((l) => l.$extensions && l.$extensions["com.figma.aliasData"])) FAIL("resolved", "aliasData present with blank rawColl");
const dtcgA = X.exportDTCG(C(ALL), { rawColl: "Color Primitives" });
const sa = semLeaves(dtcgA);
const aliasOf = (l) => l.$extensions && l.$extensions["com.figma.aliasData"];
// rawColl set → every leaf carries the FULL documented name+collection alias shape:
// targetVariableName "{n}/{refKey}" (e.g. neutral/550, neutral/500-200) AND targetVariableSetName
// === the Color Primitives collection. That is the shape Figma's documented aliasData fallback hierarchy
// resolves on NATIVE import when the Color Primitives collection pre-exists in the file (OD-004 spike;
// ADR-002 re-verify 2026-06-15). The native-import cascade itself is validated end-to-end in Figma,
// NOT here — this gate only proves the emitted SHAPE so the spike can't silently regress.
if (sa.length === 0 || !sa.every((l) => {
  const a = aliasOf(l);
  return a && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(a.targetVariableName || "") && a.targetVariableSetName === "Color Primitives";
}))
  FAIL("resolved", "rawColl set: not every semantic leaf carries aliasData {targetVariableName '{n}/{refKey}', targetVariableSetName 'Color Primitives'}");

// ── hpg-export-css-resolves (every --c-* is light-dark(var,var) over existing raw vars) ───
const css = X.exportCSS(C(ALL));
const declared = new Set([...css.matchAll(/(--[a-z0-9_-]+)\s*:/gi)].map((m) => m[1])); // raw + semantic both use --c- (raw names end in digits, semantic in a word)
let cssChecked = 0;
for (const m of css.matchAll(/(--c-[a-z0-9-]+)\s*:\s*light-dark\(\s*var\((--[a-z0-9_-]+)\)\s*,\s*var\((--[a-z0-9_-]+)\)\s*\)/gi)) {
  cssChecked++;
  if (!declared.has(m[2]) || !declared.has(m[3])) FAIL("css-resolves", `${m[1]} refs undefined raw var ${m[2]}/${m[3]}`);
}
if (cssChecked === 0) FAIL("css-resolves", "no --c-* light-dark(var,var) lines found");

// ── hpg-export-padding (3-digit stop padding in CSS var names) ───────────────────────────
for (const m of css.matchAll(/--c-[a-z0-9-]+?-(\d+)(?:-\d+)?\s*:/gi)) {
  const stop = m[1];
  if (/^\d+$/.test(stop) && stop.length < 3) FAIL("padding", `unpadded stop in --c-…-${stop}`);
}

// ── hpg-export-disabled-palette (on:false absent; all-disabled = valid empty, no throw) ───
const oneOff = C(ALL.map((p, i) => (i === 1 ? { ...p, on: false } : p)));
const cssOff = X.exportCSS(oneOff);
const offName = ALL[1].name.toLowerCase();
if (cssOff.includes(`--c-${offName}-`)) FAIL("disabled-palette", `disabled palette '${offName}' still in CSS`);
try {
  const empty = C(ALL.map((p) => ({ ...p, on: false })));
  const ec = X.exportCSS(empty), ed = X.exportDTCG(empty, {});
  if (typeof ec !== "string" || Object.keys(ed).length !== 3) FAIL("disabled-palette", "all-disabled not well-formed");
  if (leaves(ed["Light_tokens.json"]).length !== 0) FAIL("disabled-palette", "all-disabled has leaves");
} catch (e) { FAIL("disabled-palette", `all-disabled threw: ${e.message}`); }

// ── hpg-export-nonempty (5 formats non-empty; JSON has stops/scrims/semantic) ─────────────
const all = X.exportAll(C(ALL), {});
for (const k of ["css", "oklch", "json", "dtcg", "ui3", "tailwind", "shadcn"]) {
  const v = all[k];
  if (v == null || (typeof v === "string" && v.length < 10) || (typeof v === "object" && Object.keys(v).length === 0)) FAIL("nonempty", `${k} empty`);
}
const j = X.exportJSON(C(ALL)); const p0 = j[ALL[0].name.toLowerCase()] || Object.values(j)[0];
if (!p0 || !p0.stops || !p0.scrims || !p0.semantic) FAIL("nonempty", "JSON palette missing stops/scrims/semantic");

// ── hpg-export-tailwind (v4 @theme: oklch ramps + light-dark() semantic roles) ────────────
const tw = X.exportTailwind(C(ALL));
if (!/@theme\s*\{/.test(tw)) FAIL("tailwind", "no @theme block");
if (!/--color-[a-z0-9-]+-500:\s*oklch\(/i.test(tw)) FAIL("tailwind", "no --color-{name}-500: oklch() scale var");
if (!/--color-[a-z0-9-]+:\s*light-dark\(\s*oklch/i.test(tw)) FAIL("tailwind", "no semantic role as light-dark(oklch…)");
// a disabled palette must not appear in the Tailwind scale either (use the oneOff state)
if (X.exportTailwind(oneOff).includes(`--color-${offName}-`)) FAIL("tailwind", `disabled palette '${offName}' still in Tailwind`);

// ── hpg-export-shadcn (oklch :root/.dark token contract + @theme inline + radius) ─────────
const sc = X.exportShadcn(C(ALL));
for (const need of [":root {", ".dark {", "@theme inline {", "--radius:", "--background:", "--foreground:", "--primary:", "--destructive:"]) {
  if (!sc.includes(need)) FAIL("shadcn", `missing '${need}'`);
}
if (!/--background:\s*oklch\(/i.test(sc)) FAIL("shadcn", "tokens are not oklch()");
if (!/--color-background:\s*var\(--background\)/.test(sc)) FAIL("shadcn", "@theme inline does not map --color-* -> var(--token)");
// same token set in :root (light) and .dark (parity)
const tokset = (block) => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((m) => m[1]).filter((t) => t !== "--radius"));
const rootBlock = sc.slice(sc.indexOf(":root {"), sc.indexOf(".dark {"));
const darkBlock = sc.slice(sc.indexOf(".dark {"), sc.indexOf("@theme inline {"));
const rootToks = tokset(rootBlock), darkToks = tokset(darkBlock);
if (rootToks.size === 0 || rootToks.size !== darkToks.size || [...rootToks].some((t) => !darkToks.has(t))) {
  FAIL("shadcn", `:root (${rootToks.size}) and .dark (${darkToks.size}) token sets differ`);
}

// ── hpg-export-keycolors (retained brand colors -> exact OKLCH tokens by role + JSON block) ──
const withKey = C(ALL.map((p, i) => (i === 0 ? { ...p, keyColors: [{ role: "dominant", oklch: [0.32, 0.05, 150] }, { role: "supportive", oklch: [0.7, 0.04, 160] }] } : p)));
const kcss = X.exportCSS(withKey);
if (!/--c-[a-z0-9-]+-key-dominant:\s*oklch\(/.test(kcss)) FAIL("keycolors", "dominant key token (oklch) missing");
if (!/--c-[a-z0-9-]+-key-supportive:\s*oklch\(/.test(kcss)) FAIL("keycolors", "supportive key token (oklch) missing");
const kp = X.exportJSON(withKey)[ALL[0].name];
if (!kp.keyColors || kp.keyColors.length !== 2 || kp.keyColors[0].role !== "dominant" || !Array.isArray(kp.keyColors[0].oklch) || kp.keyColors[0].oklch.length !== 3) FAIL("keycolors", "JSON keyColors block missing/wrong");
// a palette with no key colors emits no key tokens (opt-in only)
if (X.exportCSS(C(ALL)).includes("-key-")) FAIL("keycolors", "key tokens present when none set");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["dtcg-shape", "leaf-valid", "resolved", "css-resolves", "padding", "disabled-palette", "nonempty", "tailwind", "shadcn", "keycolors"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: export-formats clears all [gate] predicates");
process.exit(0);
