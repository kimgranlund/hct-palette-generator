#!/usr/bin/env node
// verify.mjs — figma-plugin validation adapter (CRITIC side; deny-on-write to the advancer).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as P from "../../figma/binder/bind-plan.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "figma", "binder"); // the binder lives in figma/binder/
const RT = JSON.parse(readFileSync(new URL("../../docs/spec/data/role-table.json", import.meta.url), "utf8"));
const { EXPORT_STOPS, SCRIM_BASES, SCRIM_STEPS } = RT.constants;
const NAMES = RT.defaults.map((p) => p.name.toLowerCase());
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// canonical raw-colors variable name set (the answer key): {n}/{pad3(stop)} ∪ {n}/{base}-{step}
const pad3 = (s) => String(s).padStart(3, "0");
const CANON = new Set();
for (const n of NAMES) {
  for (const s of EXPORT_STOPS) CANON.add(`${n}/${pad3(s)}`);
  for (const b of SCRIM_BASES) for (const step of SCRIM_STEPS) CANON.add(`${n}/${pad3(b)}-${step}`);
}

// ── hpg-plugin-bindings: every emitted target exists in the canonical raw-colors name set ─
const targets = P.bindingTargets(NAMES);
if (!Array.isArray(targets) || targets.length === 0) FAIL("bindings", "bindingTargets returned nothing");
const dangling = (targets || []).filter((t) => !CANON.has(t));
if (dangling.length) FAIL("bindings", `${dangling.length} dangling target(s), e.g. ${dangling.slice(0, 3).join(", ")}`);
// non-vacuity: a full plan covers every role's light+dark across all palettes
const plan = P.bindingPlan(NAMES);
if (!Array.isArray(plan) || plan.length !== 37 * NAMES.length) FAIL("bindings", `bindingPlan length ${plan && plan.length}, want ${37 * NAMES.length}`);

// ── hpg-plugin-offline: manifest parses + networkAccess "none"; code.js syntactically valid ─
try {
  const man = JSON.parse(readFileSync(join(HERE, "figma-semantic-binder/manifest.json"), "utf8"));
  if (man.networkAccess !== "none") FAIL("offline", `manifest.networkAccess = ${JSON.stringify(man.networkAccess)}, want "none"`);
  if (man.main !== "code.js") FAIL("offline", `manifest.main = ${man.main}`);
} catch (e) { FAIL("offline", `manifest.json: ${e.message}`); }
try {
  execSync(`node --check "${join(HERE, "figma-semantic-binder/code.js")}"`, { stdio: "pipe" });
} catch (e) { FAIL("offline", `code.js failed node --check: ${String(e.stderr || e).slice(0, 120)}`); }

// ── PARITY GUARD: the runtime code.js HARDCODES roleTable() (the Figma sandbox can't import the
//    .mjs), so it's a second copy of the validated role table that node --check can't catch drifting.
//    Load it (without running main()) and assert its derived targets EQUAL bind-plan's canonical set,
//    so a ref can't go stale silently. (Real incident 2026-06-18: the scrim refs drifted here.) ──
try {
  const src = readFileSync(join(HERE, "figma-semantic-binder/code.js"), "utf8").replace(/\bmain\(\);\s*$/, "");
  const { roleTable, refKey: rk } = new Function(src + "\nreturn { roleTable, refKey };")();
  const runtime = new Set();
  for (const n of NAMES) for (const r of roleTable(n)) { runtime.add(`${n}/${rk(r.light)}`); runtime.add(`${n}/${rk(r.dark)}`); }
  const canon = new Set(P.bindingTargets(NAMES));
  const drift = [...runtime].filter((t) => !canon.has(t)).concat([...canon].filter((t) => !runtime.has(t)));
  if (drift.length) FAIL("parity", `runtime code.js roleTable drifted from canonical (e.g. ${drift.slice(0, 3).join(", ")})`);
} catch (e) { FAIL("parity", `could not load/compare runtime roleTable: ${e.message}`); }

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["bindings", "offline", "parity"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log(`  (checked ${targets ? targets.length : 0} binding targets vs ${CANON.size} canonical raw-colors names)`);
console.log("  defer  hpg-parity-roletable — role-table parity is verified by semantic-mapping");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: figma-plugin clears its checkable [gate] predicates");
process.exit(0);
