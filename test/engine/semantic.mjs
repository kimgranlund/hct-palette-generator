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

// ── on-color contrast (OD-001 opt-in): applyOnColorContrast flips on{N}/on{N}Variant to the
//    better-WCAG-contrast end vs the accent fill (550/450) per mode; a no-op unless "contrast". ──
{
  const P = S.semanticRoles("primary");
  const onMain0 = P.find((r) => r.suffix === "-on-primary");
  // fixed (default) → unchanged
  const fixed = S.applyOnColorContrast(P, "primary", () => 0.5, "fixed");
  const fm = fixed.find((r) => r.suffix === "-on-primary");
  if (fm.light !== onMain0.light || fm.dark !== onMain0.dark) FAIL("oncolors", "fixed mode must not alter on-colors");
  // contrast + LIGHT accent fill → dark on-colors (on{N}→950, on{N}Variant→800)
  const lumLight = (ref) => ({ "550": 0.8, "450": 0.75, "050": 0.95, "950": 0.03, "200": 0.7, "800": 0.12 }[ref] ?? 0.5);
  const cl = S.applyOnColorContrast(P, "primary", lumLight, "contrast");
  const cm = cl.find((r) => r.suffix === "-on-primary"), cv = cl.find((r) => r.suffix === "-on-primary-variant");
  if (cm.light !== "950" || cm.dark !== "950") FAIL("oncolors", `contrast/light fill: on-primary ${cm.light}/${cm.dark}, want 950/950`);
  if (cv.light !== "800" || cv.dark !== "800") FAIL("oncolors", `contrast/light fill: on-primary-variant ${cv.light}/${cv.dark}, want 800/800`);
  // contrast + DARK accent fill → light on-colors (on{N}→050)
  const lumDark = (ref) => ({ "550": 0.12, "450": 0.08, "050": 0.95, "950": 0.03, "200": 0.7, "800": 0.12 }[ref] ?? 0.5);
  const dm = S.applyOnColorContrast(P, "primary", lumDark, "contrast").find((r) => r.suffix === "-on-primary");
  if (dm.light !== "050" || dm.dark !== "050") FAIL("oncolors", `contrast/dark fill: on-primary ${dm.light}/${dm.dark}, want 050/050`);
  // non-on roles untouched in contrast mode
  const surf = cl.find((r) => r.key === "surface"), surf0 = P.find((r) => r.key === "surface");
  if (surf.light !== surf0.light || surf.dark !== surf0.dark) FAIL("oncolors", "contrast mode must not touch non-on roles");
}

// ── prime-accent ref: applyAccentRef "single" maps the prime accent (empty suffix) to 500/500;
//    "mode" (default) leaves 550/450; nothing else (variants, on-colors, surfaces) moves. ──
{
  const P = S.semanticRoles("primary");
  const prime0 = P.find((r) => r.suffix === "");
  if (!prime0 || prime0.light !== "550" || prime0.dark !== "450") FAIL("oncolors", `prime accent default ${prime0 && prime0.light}/${prime0 && prime0.dark}, want 550/450`);
  // "mode" (default) → unchanged
  const m = S.applyAccentRef(P, "mode").find((r) => r.suffix === "");
  if (m.light !== "550" || m.dark !== "450") FAIL("oncolors", "applyAccentRef 'mode' must not change the prime accent");
  // "single" → 500/500 on the prime accent only
  const sgl = S.applyAccentRef(P, "single");
  const ps = sgl.find((r) => r.suffix === "");
  if (ps.light !== "500" || ps.dark !== "500") FAIL("oncolors", `applyAccentRef 'single': prime ${ps.light}/${ps.dark}, want 500/500`);
  // a variant (e.g. -dim) and a non-accent role (surface) are untouched
  const dim = sgl.find((r) => r.suffix === "-dim"), dim0 = P.find((r) => r.suffix === "-dim");
  const sf = sgl.find((r) => r.key === "surface"), sf0 = P.find((r) => r.key === "surface");
  if (dim.light !== dim0.light || dim.dark !== dim0.dark) FAIL("oncolors", "applyAccentRef 'single' must not touch accent variants");
  if (sf.light !== sf0.light || sf.dark !== sf0.dark) FAIL("oncolors", "applyAccentRef 'single' must not touch non-accent roles");
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["roles", "oncolors", "refs-canonical", "surface-mode"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log("  defer  hpg-parity-roletable — 3-impl identity (artifact/gen.js/plugin); validated at integration");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: semantic-mapping clears its checkable [gate] predicates (parity deferred)");
process.exit(0);
