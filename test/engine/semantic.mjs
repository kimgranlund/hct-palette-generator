#!/usr/bin/env node
// verify.mjs — semantic-mapping validation adapter (CRITIC side; deny-on-write to the advancer).
// Checks rubric.system.semantic-mapping's [gate]s against ./semantic.js vs the canonical role-table.json.
// Exit 0=pass / 1=fail; validate.py mints the signal from this status.
//
// Module ESM contract (./semantic.js):
//   semanticRoles(paletteName) -> [{ key, suffix, light, dark }]   (37 rows)
//   refKey(ref) -> padded ref ("50"->"050", "500-200"->"500-200")
import { readFileSync } from "node:fs";
import * as S from "../../src/engine/semantic.js";

const RT = JSON.parse(readFileSync(new URL("../../docs/spec/data/role-table.json", import.meta.url), "utf8"));
const CANON = RT.roleTable;                         // the canonical primary-palette table (answer key)
const { EXPORT_STOPS, SCRIM_BASES, SCRIM_STEPS } = RT.constants;
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

const ROLES = S.semanticRoles("primary");
const byKey = Object.fromEntries(ROLES.map((r) => [r.key, r]));
const isScrim = (ref) => /^\d+-\d+$/.test(ref);   // "{base}-{step}", multi-digit step (alpha% = step/10)
const stopOf = (ref) => parseInt(ref, 10);
const validPrim = (ref) => {
  if (isScrim(ref)) { const [b, step] = ref.split("-").map(Number); return SCRIM_BASES.includes(b) && EXPORT_STOPS.includes(step); }
  return EXPORT_STOPS.includes(parseInt(ref, 10));
};

// ── hpg-semantic-roles: exactly 37 roles; exactly 7 scrims, all on the 500 ramp (alpha% = step/10) ─
if (ROLES.length !== 37) FAIL("roles", `got ${ROLES.length} roles, want 37`);
const scrims = ROLES.filter((r) => /^scrim/.test(r.key));
if (scrims.length !== 7) FAIL("roles", `got ${scrims.length} scrim roles, want 7`);
for (const s of scrims) {
  const okScrim = s.light === s.dark && /^500-\d+$/.test(s.light) && SCRIM_STEPS.includes(Number(s.light.split("-")[1]));
  if (!okScrim) FAIL("roles", `scrim ${s.key} not a 500-ramp step (${s.light}/${s.dark})`);
}

// ── hpg-semantic-oncolors: on{N} === 50 stop both modes; on{N}Variant === 200 ────────────
const on = byKey["onPrimary"], onV = byKey["onPrimaryVariant"];
if (!(on && on.light === "50" && on.dark === "50")) FAIL("oncolors", `onPrimary = ${on && on.light}/${on && on.dark}, want 50/50`);
if (!(onV && onV.light === "200" && onV.dark === "200")) FAIL("oncolors", `onPrimaryVariant = ${onV && onV.light}/${onV && onV.dark}, want 200/200`);

// ── hpg-semantic-refs-canonical: deep-equal canonical AND every ref resolves to a primitive ─
const canonByKey = Object.fromEntries(CANON.map((r) => [r.key, r]));
if (ROLES.map((r) => r.key).join(",") !== CANON.map((r) => r.key).join(",")) FAIL("refs-canonical", "ordered key set != canonical");
for (const r of ROLES) {
  const c = canonByKey[r.key];
  if (!c) { FAIL("refs-canonical", `extra role ${r.key} not in canonical`); continue; }
  if (r.light !== c.light || r.dark !== c.dark || r.suffix !== c.suffix)
    FAIL("refs-canonical", `${r.key} = ${r.suffix} ${r.light}/${r.dark} != canonical ${c.suffix} ${c.light}/${c.dark}`);
  if (!validPrim(r.light) || !validPrim(r.dark)) FAIL("refs-canonical", `${r.key} ref ${r.light}/${r.dark} not a valid primitive`);
}

// ── hpg-semantic-surface-mode: Low/High mirror (sum 1000); Dim/Bright do NOT ──────────────
const mirror = (k) => { const r = byKey[k]; return r && !isScrim(r.light) && stopOf(r.light) + stopOf(r.dark) === 1000; };
for (const k of ["surfaceLowest", "surfaceLower", "surfaceLow", "surfaceHigh", "surfaceHigher", "surfaceHighest"])
  if (!mirror(k)) FAIL("surface-mode", `${k} must mirror (sum 1000): ${byKey[k] && byKey[k].light}/${byKey[k] && byKey[k].dark}`);
for (const k of ["surfaceDimmest", "surfaceDimmer", "surfaceDim", "surfaceBright", "surfaceBrighter", "surfaceBrightest"])
  if (mirror(k)) FAIL("surface-mode", `${k} must NOT mirror: ${byKey[k] && byKey[k].light}/${byKey[k] && byKey[k].dark}`);

// ── refKey + palette-name substitution (success palette substitutes name, shared roles unchanged) ─
if (S.refKey("50") !== "050" || S.refKey("500-200") !== "500-200") FAIL("refs-canonical", `refKey wrong: ${S.refKey("50")}, ${S.refKey("500-200")}`);
const succ = S.semanticRoles("success");
if (!succ.some((r) => r.key === "onSuccess") || !succ.some((r) => r.key === "successDim") || !succ.some((r) => r.key === "surfaceDim"))
  FAIL("roles", "palette-name substitution wrong for 'success' (expect onSuccess, successDim, shared surfaceDim)");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["roles", "oncolors", "refs-canonical", "surface-mode"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log("  defer  hpg-parity-roletable — 3-impl identity (artifact/gen.js/plugin); validated at integration");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: semantic-mapping clears its checkable [gate] predicates (parity deferred)");
process.exit(0);
