#!/usr/bin/env node
// verify.mjs — ui-persistence validation adapter (CRITIC side; deny-on-write to the advancer).
import * as U from "../../src/ui/persist.js";
import * as X from "../../src/engine/exports.js";   // theme-invariance tests the exporters against state.theme

let _s = 0x1234abcd >>> 0;
const rnd = () => { _s = (Math.imul(_s, 1103515245) + 12345) >>> 0; return _s / 0x100000000; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const deepEq = (a, b) => JSON.stringify(srt(a)) === JSON.stringify(srt(b));
const srt = (v) => Array.isArray(v) ? v.map(srt) : (v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, srt(v[k])])) : v);
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

const inDomainState = () => {
  const n = 1 + Math.floor(rnd() * 4);
  const palettes = Array.from({ length: n }, (_, i) => {
    const p = { name: "P" + i, hue: rnd() * 360, chroma: rnd() * 100, skew: -100 + rnd() * 200, lift: -40 + rnd() * 80, hueShift: -60 + rnd() * 120, hueSameDir: rnd() > 0.5, on: rnd() > 0.3 };
    if (rnd() > 0.5) p.cuspPull = rnd() * 100; // OPTIONAL per-palette override — must round-trip when present, and stay absent when not
    return p;
  });
  // per-doc semantic-mapping overrides: a random, shape-valid subset re-points some roles.
  const roleOverrides = {};
  for (const [k, v] of [["onSurface", { light: "900", dark: "100" }], ["primary", { light: "500-300" }], ["outline", { dark: "550" }]])
    if (rnd() > 0.5) roleOverrides[k] = v;
  return { curve: pick(["linear", "sine", "cubic", "logistic", "exp"]), tension: rnd() * 100, lmin: rnd() * 40, lmax: 60 + rnd() * 40,
    damp: rnd() * 100, dampCurve: 0.5 + rnd() * 3.5, dampAmp: rnd() * 100, dampBias: -100 + rnd() * 200,
    hueSpace: pick(["cam16", "oklch"]), relChroma: rnd() > 0.5, chromaFloor: rnd() * 100, toneMode: pick(["even", "perceptual", "peak"]), vibrancy: rnd() * 100, onColorMode: pick(["fixed", "contrast"]), accentRef: pick(["mode", "single"]), theme: pick(["auto", "light", "dark"]), selected: Math.floor(rnd() * n), roleOverrides, palettes };
};

// ── hpg-persistence-roundtrip: in-domain identity ─────────────────────────────────────────
for (let i = 0; i < 200; i++) {
  const S = inDomainState();
  const R = U.hydrate(U.serialize(S));
  if (!deepEq(R, S)) { FAIL("roundtrip", `hydrate(serialize(S)) != S (e.g. ${JSON.stringify(S).slice(0, 90)})`); break; }
}
// ── per-field clamp: only the violated field changes, in-domain siblings preserved ────────
const base = inDomainState(); base.palettes = base.palettes.length ? base.palettes : [{ name: "P0", hue: 100, chroma: 50, skew: 0, lift: 0, on: true }];
const mut = JSON.parse(JSON.stringify(base)); mut.lmax = 45;                 // out of [60,100]
const hyd = U.hydrate(U.serialize(mut));
if (hyd.lmax !== 60) FAIL("clamp", `lmax 45 -> ${hyd.lmax}, want 60 (nearest bound)`);
for (const k of ["curve", "tension", "lmin", "damp", "hueSpace", "selected"]) if (!deepEq(hyd[k], base[k])) FAIL("clamp", `clamping lmax disturbed ${k}: ${JSON.stringify(base[k])} -> ${JSON.stringify(hyd[k])}`);
const mut2 = JSON.parse(JSON.stringify(base)); mut2.palettes[0].hue = 410;   // out of [0,360]
const hyd2 = U.hydrate(U.serialize(mut2));
if (hyd2.palettes[0].hue !== 360) FAIL("clamp", `palette hue 410 -> ${hyd2.palettes[0].hue}, want 360`);
if (!deepEq(hyd2.palettes[0].chroma, base.palettes[0].chroma)) FAIL("clamp", "clamping palette hue disturbed sibling chroma");
// clamp-to-default hydrator would fail the above (it discards in-domain values) — that's the anti-hack

// ── hpg-persistence-field-default: a doc PREDATING the differential-damping fields hydrates
//    to the legacy-equivalent defaults (1.5/0/0) — the 0.6 byte-unchanged-reload promise ─────
{
  const canon = inDomainState();
  canon.dampCurve = 1.5; canon.dampAmp = 0; canon.dampBias = 0;     // explicit legacy defaults
  const pre = U.serialize(canon);
  delete pre.dampCurve; delete pre.dampAmp; delete pre.dampBias;     // a pre-0.6 persisted doc
  const h = U.hydrate(pre);
  if (h.dampCurve !== 1.5 || h.dampAmp !== 0 || h.dampBias !== 0)
    FAIL("field-default", `absent damping fields hydrated to ${h.dampCurve}/${h.dampAmp}/${h.dampBias}, want 1.5/0/0`);
  // and the whole hydrated doc is byte-identical to hydrating the explicit-defaults doc
  if (!deepEq(h, U.hydrate(U.serialize(canon))))
    FAIL("field-default", "pre-0.6 doc did not hydrate byte-identically to the explicit-defaults doc");

  // a config OMITTING lmin/lmax/damp (e.g. a hand-authored / partial import) hydrates to their sensible
  // DEFAULTS (5/100/80), NOT the domain floors (0/60/0) which would cap the ramp dark.
  const partial = U.serialize(inDomainState());
  delete partial.lmin; delete partial.lmax; delete partial.damp;
  const hp = U.hydrate(partial);
  if (hp.lmin !== 5 || hp.lmax !== 100 || hp.damp !== 80)
    FAIL("field-default", `absent lmin/lmax/damp hydrated to ${hp.lmin}/${hp.lmax}/${hp.damp}, want 5/100/80 (not the domain floors)`);
}

// ── hpg-export-theme-invariant: exporters ignore state.theme ──────────────────────────────
const st = { palettes: [{ name: "Primary", hue: 267, chroma: 95, skew: -20, lift: 0, on: true }], curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" };
const out = (theme) => JSON.stringify({ css: X.exportCSS({ ...st, theme }), json: X.exportJSON({ ...st, theme }), dtcg: X.exportDTCG({ ...st, theme }, {}) });
const oL = out("light"), oD = out("dark"), oA = out("auto");
if (!(oL === oD && oD === oA)) FAIL("theme-invariant", "export output differs across theme light/dark/auto");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["roundtrip", "clamp", "field-default", "theme-invariant"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: ui-persistence clears all [gate] predicates");
process.exit(0);
