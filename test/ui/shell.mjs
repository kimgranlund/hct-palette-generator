#!/usr/bin/env node
// verify.mjs — ui-app validation adapter (CRITIC side). Checks the pure model core (projectView over
// the real modules) + that the shell files exist and app.js is syntactically valid. Exit 0=pass / 1=fail.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as M from "../../src/ui/model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, "..", "..", "src", "ui"); // the shell files live in src/ui/
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// ── model: projectView(defaultDocument()) composes the 6 modules into a renderable view ──
const doc = M.defaultDocument();
if (!doc || !Array.isArray(doc.palettes) || doc.palettes.length !== 8) FAIL("model", `defaultDocument has ${doc && doc.palettes && doc.palettes.length} palettes, want 8`);
const v = M.projectView(doc);
if (!v || !Array.isArray(v.palettes) || v.palettes.length !== 8) FAIL("model", `projectView returned ${v && v.palettes && v.palettes.length} palettes`);
else for (const p of v.palettes) {
  if (!Array.isArray(p.ramp) || p.ramp.length === 0) { FAIL("model", `${p.name} ramp empty`); break; }
  if (!p.ramp[0] || typeof p.ramp[0].hex !== "string" || !/^#[0-9A-Fa-f]{6}/.test(p.ramp[0].hex)) { FAIL("model", `${p.name} ramp swatch has no hex`); break; }
  if (!Array.isArray(p.roles) || p.roles.length !== 53) { FAIL("model", `${p.name} has ${p.roles && p.roles.length} roles, want 53`); break; }
  if (!p.roles[0] || !p.roles[0].lightHex || !p.roles[0].darkHex) { FAIL("model", `${p.name} role missing light/darkHex`); break; }
}

// ── exports present + non-empty (the drawer renders these) ───────────────────────────────
for (const k of ["css", "oklch", "json", "dtcg", "ui3"]) {
  const e = v.exports && v.exports[k];
  if (e == null || (typeof e === "string" && e.length < 50) || (typeof e === "object" && Object.keys(e).length === 0)) FAIL("exports", `${k} empty`);
}
if (typeof v.exports.css !== "string" || !v.exports.css.includes("--c-")) FAIL("exports", "css missing --c-* semantic vars");

// ── plot + contrast data (the Analysis lens + readout render these) ───────────────────────
if (!Array.isArray(v.plot) || v.plot.length !== 8) FAIL("model", `plot has ${v.plot && v.plot.length} entries, want 8`);
else if (!v.plot[0].points || !v.plot[0].points[0] || !("applied" in v.plot[0].points[0]) || !("ceiling" in v.plot[0].points[0])) FAIL("model", "plot points missing applied/ceiling");
if (!Array.isArray(v.contrast) || v.contrast.length === 0) FAIL("model", "no contrast data");

// ── live edit re-projects (no stored derived state) ──────────────────────────────────────
const edited = JSON.parse(JSON.stringify(doc)); edited.palettes[1].hue = (edited.palettes[1].hue + 90) % 360;
const v2 = M.projectView(edited);
if (v2.palettes[1].ramp[12] && v.palettes[1].ramp[12] && v2.palettes[1].ramp[12].hex === v.palettes[1].ramp[12].hex) FAIL("model", "editing hue did not change the projected ramp (stale/stored derived state?)");

// ── shell files exist + app.js is syntactically valid ────────────────────────────────────
for (const f of ["index.html", "styles.css", "app.js", "model.mjs"]) if (!existsSync(join(UI, f))) FAIL("shell", `missing ${f}`);
try { execSync(`node --check "${join(UI, "app.js")}"`, { stdio: "pipe" }); } catch (e) { FAIL("shell", `app.js failed node --check`); }
const html = existsSync(join(UI, "index.html")) ? readFileSync(join(UI, "index.html"), "utf8") : "";
if (!/type=["']module["']/.test(html) || !/app\.js/.test(html)) FAIL("shell", "index.html does not load app.js as a module");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["model", "exports", "shell"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log(`  (projectView: 8 palettes · ${v.palettes ? v.palettes.reduce((n, p) => n + (p.roles ? p.roles.length : 0), 0) : 0} role tokens · css ${v.exports && v.exports.css ? v.exports.css.length : 0} B)`);
console.log("  note  visual/interaction layer verified by serve + headless boot, not this adapter");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: ui-app pure core + shell clear the checkable predicates");
process.exit(0);
