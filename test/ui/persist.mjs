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
  // per-cell SIZE/HEIGHT token overrides (Tokens-matrix Phase 3): a random in-domain subset. Keys carry
  // the modeKey suffix; values are in-domain integers so they must round-trip byte-for-byte when present.
  const tyTok = {}; for (const [k, v] of [["Body|MD|base", 40], ["Display|XL|base", 90], ["UI|SM|base", 13]]) if (rnd() > 0.5) tyTok[k] = v;
  const geTok = {}; for (const [k, v] of [["MD|base", 30], ["2XL|base", 72], ["XS|base", 18]]) if (rnd() > 0.5) geTok[k] = v;
  return { curve: pick(["linear", "sine", "cubic", "logistic", "exp"]), tension: rnd() * 100, lmin: rnd() * 40, lmax: 60 + rnd() * 40,
    damp: rnd() * 100, dampCurve: 0.5 + rnd() * 3.5, dampAmp: rnd() * 100, dampBias: -100 + rnd() * 200,
    hueSpace: pick(["cam16", "oklch"]), relChroma: rnd() > 0.5, chromaFloor: rnd() * 100, toneMode: pick(["even", "perceptual", "peak"]), vibrancy: rnd() * 100, onColorMode: pick(["fixed", "contrast"]), accentRef: pick(["mode", "single"]), type: { treatment: pick(["product", "luxury", "editorial", "technical", "statement"]), bodyBase: 10 + Math.floor(rnd() * 22), ...(rnd() > 0.5 ? { modes: [{ id: "tm-" + Math.floor(rnd() * 1e6).toString(36), name: pick(["Mobile", "Desktop", "Mode 2"]), bodyBase: 10 + Math.floor(rnd() * 22), ...(rnd() > 0.5 ? { minWidth: 320 + Math.floor(rnd() * 1200) } : {}) }] } : {}), ...(Object.keys(tyTok).length ? { tokenOverrides: tyTok } : {}) }, geometry: { treatment: pick(["comfortable", "compact", "spacious", "touch", "pill"]), baseHeight: 20 + Math.floor(rnd() * 29), ...(rnd() > 0.5 ? { modes: [{ id: "gm-" + Math.floor(rnd() * 1e6).toString(36), name: pick(["Mobile", "Desktop", "Mode 2"]), baseHeight: 20 + Math.floor(rnd() * 29), ...(rnd() > 0.5 ? { minWidth: 320 + Math.floor(rnd() * 1200) } : {}) }] } : {}), ...(Object.keys(geTok).length ? { tokenOverrides: geTok } : {}) }, theme: pick(["auto", "light", "dark"]), selected: Math.floor(rnd() * n), roleOverrides, palettes };
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

// ── token-overrides (Tokens-matrix Phase 3): round-trip + clamp into range + drop invalid ────────────────
{
  // an in-domain map round-trips byte-for-byte (covered broadly by the fuzz above; spot-checked here).
  const S = inDomainState();
  S.type = { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": 40, "UI|SM|tm-x": 13 } };
  S.geometry = { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": 30, "2XL|gm-y": 72 } };
  const R = U.hydrate(U.serialize(S));
  if (!deepEq(R.type.tokenOverrides, S.type.tokenOverrides)) FAIL("token-overrides", `type tokenOverrides did not round-trip: ${JSON.stringify(R.type.tokenOverrides)}`);
  if (!deepEq(R.geometry.tokenOverrides, S.geometry.tokenOverrides)) FAIL("token-overrides", `geom tokenOverrides did not round-trip: ${JSON.stringify(R.geometry.tokenOverrides)}`);

  // OUT-OF-RANGE values clamp to the nearest bound (type size [1,512], geom height [8,256]).
  const C = U.hydrate(U.serialize({ ...inDomainState(),
    type: { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": 9999, "Body|SM|base": 0.4 } },
    geometry: { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": 9999, "XS|base": 2 } } }));
  if (C.type.tokenOverrides["Body|MD|base"] !== 512) FAIL("token-overrides", `type size 9999 -> ${C.type.tokenOverrides["Body|MD|base"]}, want 512`);
  if (C.type.tokenOverrides["Body|SM|base"] !== 1) FAIL("token-overrides", `type size 0.4 -> ${C.type.tokenOverrides["Body|SM|base"]}, want 1 (floor)`);
  if (C.geometry.tokenOverrides["MD|base"] !== 256) FAIL("token-overrides", `geom height 9999 -> ${C.geometry.tokenOverrides["MD|base"]}, want 256`);
  if (C.geometry.tokenOverrides["XS|base"] !== 8) FAIL("token-overrides", `geom height 2 -> ${C.geometry.tokenOverrides["XS|base"]}, want 8 (floor)`);

  // INVALID entries (NaN / non-number / ≤0) are DROPPED; if nothing valid remains the key is ABSENT.
  const D = U.hydrate(U.serialize({ ...inDomainState(),
    type: { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": "nope", "Body|LG|base": -7, "Body|XL|base": 0 } },
    geometry: { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": NaN } } }));
  if (D.type.tokenOverrides !== undefined && Object.keys(D.type.tokenOverrides).length !== 0) FAIL("token-overrides", `invalid type overrides not dropped: ${JSON.stringify(D.type.tokenOverrides)}`);
  if ("tokenOverrides" in D.type) FAIL("token-overrides", "an all-invalid type tokenOverrides must hydrate ABSENT (not an empty object)");
  if ("tokenOverrides" in D.geometry) FAIL("token-overrides", "an all-invalid geom tokenOverrides must hydrate ABSENT (not an empty object)");

  // MALFORMED keys are DROPPED defensively (type requires 3 "|"-segments, geom 2, non-empty modeKey) — a
  // valid sibling key survives, proving only the junk is stripped (forward-safe persisted maps).
  const M = U.hydrate(U.serialize({ ...inDomainState(),
    type: { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": 40, "Body|MD": 30, "too|many|parts|here": 22, "Body|MD|": 18 } },
    geometry: { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": 30, "MD": 24, "MD|sm|extra": 26, "MD|": 20 } } }));
  if (!deepEq(M.type.tokenOverrides, { "Body|MD|base": 40 })) FAIL("token-overrides", `malformed type keys not dropped (kept only the well-formed): ${JSON.stringify(M.type.tokenOverrides)}`);
  if (!deepEq(M.geometry.tokenOverrides, { "MD|base": 30 })) FAIL("token-overrides", `malformed geom keys not dropped (kept only the well-formed): ${JSON.stringify(M.geometry.tokenOverrides)}`);

  // ABSENT stays absent — a config without tokenOverrides round-trips identically (the identity gate).
  const A = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "product", bodyBase: 16 }, geometry: { treatment: "comfortable", baseHeight: 28 } }));
  if ("tokenOverrides" in A.type || "tokenOverrides" in A.geometry) FAIL("token-overrides", "absent tokenOverrides must stay absent after hydrate");
}

// ── huespace-default (OKLCH-native flip): a doc PERSISTED with hueSpace:"cam16" round-trips as cam16
//    (legacy preserved); a doc WITHOUT a hueSpace hydrates to "oklch" (the new default). ────────────
{
  const seed = inDomainState();
  const cam = U.hydrate(U.serialize({ ...seed, hueSpace: "cam16" }));
  if (cam.hueSpace !== "cam16") FAIL("huespace-default", `a doc saved hueSpace:"cam16" hydrated to ${cam.hueSpace}, want cam16 (legacy preserved)`);
  const pre = U.serialize(seed); delete pre.hueSpace;          // a doc with NO hueSpace field
  const none = U.hydrate(pre);
  if (none.hueSpace !== "oklch") FAIL("huespace-default", `a doc without hueSpace hydrated to ${none.hueSpace}, want oklch (new default)`);
}

// ── hpg-export-theme-invariant: exporters ignore state.theme ──────────────────────────────
const st = { palettes: [{ name: "Primary", hue: 267, chroma: 95, skew: -20, lift: 0, on: true }], curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" };
const out = (theme) => JSON.stringify({ css: X.exportCSS({ ...st, theme }), json: X.exportJSON({ ...st, theme }), dtcg: X.exportDTCG({ ...st, theme }, {}) });
const oL = out("light"), oD = out("dark"), oA = out("auto");
if (!(oL === oD && oD === oA)) FAIL("theme-invariant", "export output differs across theme light/dark/auto");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["roundtrip", "clamp", "field-default", "token-overrides", "huespace-default", "theme-invariant"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: ui-persistence clears all [gate] predicates");
process.exit(0);
