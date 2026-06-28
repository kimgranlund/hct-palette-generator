#!/usr/bin/env node
// verify.mjs — ui-app validation adapter (CRITIC side). Checks the pure model core (projectView over
// the real modules) + that the shell files exist and app.js is syntactically valid. Exit 0=pass / 1=fail.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as M from "../../src/ui/model.mjs";
import { paletteStops, STOPS } from "../../src/engine/tonal.js";
import { PRESETS as NATURE_PRESETS } from "../../src/ui/categories/nature.js";

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

// ── OKLCH-NATIVE HUE MODEL (the slider value IS the OKLCH hue) ─────────────────────────────
// Helper: the worst per-stop RGB distance between two rendered ramps (0 = identical render).
const rampRgbDist = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) { const x = a[i].rgb, y = b[i].rgb; const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); if (d > m) m = d; } return m; };

// (a) defaultDocument is OKLCH-native and each starter renders ≈ its intended (cam16) color: the
//     on-the-fly cam16→oklch hue conversion round-trips through the engine within the hue-space
//     precision (a few RGB units; the blue Primary is the loose pole — see fidelity note).
{
  const RT = JSON.parse(readFileSync(join(HERE, "..", "..", "docs", "spec", "data", "role-table.json"), "utf8"));
  const dd = M.defaultDocument();
  if (dd.hueSpace !== "oklch") FAIL("oklch-native", `defaultDocument hueSpace ${dd.hueSpace}, want "oklch"`);
  const ctl = { curve: dd.curve, tension: dd.tension, lmin: dd.lmin, lmax: dd.lmax, damp: dd.damp, dampCurve: dd.dampCurve, dampAmp: dd.dampAmp, dampBias: dd.dampBias, relChroma: dd.relChroma, chromaFloor: dd.chromaFloor, toneMode: dd.toneMode, vibrancy: dd.vibrancy };
  let worst = 0, wname = null;
  for (let i = 0; i < dd.palettes.length; i++) {
    const np = dd.palettes[i], op = RT.defaults[i];
    const nr = paletteStops({ hue: np.hue, chroma: np.chroma, skew: np.skew, lift: np.lift }, { ...ctl, hueSpace: "oklch" }, STOPS);
    const or = paletteStops({ hue: op.hue, chroma: op.chroma, skew: op.skew, lift: op.lift }, { ...ctl, hueSpace: "cam16" }, STOPS);
    const d = rampRgbDist(nr, or); if (d > worst) { worst = d; wname = np.name; }
    // the conversion must MOVE the stored hue off the raw cam16 value (it's now an OKLCH hue), except
    // where the two spaces coincide (small Δ rounds to the same integer) — so assert it's a valid degree.
    if (!(np.hue >= 0 && np.hue <= 360)) FAIL("oklch-native", `starter ${np.name} hue ${np.hue} out of range`);
  }
  // 30 RGB units (~Δ8° cam16 at the blue pole × high chroma) is the documented worst-case fidelity bound.
  if (worst > 30) FAIL("oklch-native", `starter ramp drifted ${worst.toFixed(1)} RGB from the cam16 intent (worst ${wname}), want ≤30`);
}

// (b) seedFromKeyColor returns the INPUT's OWN OKLCH hue (consistent with the OKLCH-native space):
//     seed of [L, C, 200] has hue ≈ 200.
{
  for (const H of [200, 30, 270, 355]) {
    const seed = M.seedFromKeyColor([0.6, 0.12, H]);
    if (!seed) { FAIL("oklch-native", `seedFromKeyColor([0.6,0.12,${H}]) returned null`); break; }
    let d = Math.abs(seed.hue - H); if (d > 180) d = 360 - d;
    if (d > 1) FAIL("oklch-native", `seedFromKeyColor hue ${seed.hue}, want ≈${H} (the input's OKLCH hue)`);
  }
}

// (c) a gen-categories sample palette's STORED hue ≈ its source oklch[2], and the set bakes hueSpace:"oklch".
{
  const preset = NATURE_PRESETS[0];
  if (preset.hueSpace !== "oklch") FAIL("oklch-native", `category preset hueSpace ${preset.hueSpace}, want "oklch"`);
  for (const pal of preset.palettes) {
    if (!pal.keyColors || !pal.keyColors[0]) continue;
    const src = ((pal.keyColors[0].oklch[2] % 360) + 360) % 360;
    let d = Math.abs(pal.hue - src); if (d > 180) d = 360 - d;
    if (d > 1) { FAIL("oklch-native", `category ${pal.name} stored hue ${pal.hue} vs source oklch ${src.toFixed(1)} (Δ${d.toFixed(1)})`); break; }
  }
}

// (d) persist: a doc WITH hueSpace:"cam16" round-trips as cam16 (legacy preserved); a doc WITHOUT a
//     hueSpace hydrates to "oklch" (the new default). Imported from persist.js (the storage clamp).
{
  const P = await import("../../src/ui/persist.js");
  const base = { palettes: [{ name: "P", hue: 200, chroma: 50, skew: 0, lift: 0, on: true }] };
  const cam = P.hydrate(P.serialize({ ...base, hueSpace: "cam16" }));
  if (cam.hueSpace !== "cam16") FAIL("oklch-native", `persist: a doc saved cam16 hydrated to ${cam.hueSpace}, want cam16 (legacy preserved)`);
  const none = P.hydrate(P.serialize({ ...base })); // no hueSpace field
  if (none.hueSpace !== "oklch") FAIL("oklch-native", `persist: a doc without hueSpace hydrated to ${none.hueSpace}, want oklch (new default)`);
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["model", "exports", "shell", "oklch-native"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log(`  (projectView: 8 palettes · ${v.palettes ? v.palettes.reduce((n, p) => n + (p.roles ? p.roles.length : 0), 0) : 0} role tokens · css ${v.exports && v.exports.css ? v.exports.css.length : 0} B)`);
console.log("  note  visual/interaction layer verified by serve + headless boot, not this adapter");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: ui-app pure core + shell clear the checkable predicates");
process.exit(0);
