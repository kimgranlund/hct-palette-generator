#!/usr/bin/env node
// verify.mjs — the color-engine validation adapter (CRITIC side; deny-on-write to the advancer).
// Runs rubric.system.color-engine's [gate] predicates against ./hct.js and exits 0=pass / 1=fail.
// validate.py mints the signal from this exit status. Deterministic (seeded PRNG, no clock/RNG).
//
// Engine ESM contract (./hct.js must export exactly these):
//   hctToRgb(hue,chroma,tone) -> { rgb:[r,g,b] (0-255 ints), inGamut:boolean, lstar:number }
//   cam16FromRgb([r,g,b])     -> { hue, chroma, J }
//   lstarFromRgb([r,g,b])     -> number (CIELAB L*, 0-100)
//   maxChromaInGamut(hue,tone)-> number
//   peakC(hue)                -> { c, tone }
//   oklchToCam16Hue(h)        -> number (CAM16 hue degrees)
import * as E from "../../src/engine/hct.js";
import { oklchToRgb } from "../../src/engine/okhsl.js";

// ── deterministic PRNG (LCG) — pristine: the worker never sees this seed stream ──────────
let _s = 0x9e3779b1 >>> 0;
const rnd = () => { _s = (Math.imul(_s, 1103515245) + 12345) >>> 0; return _s / 0x100000000; };

// ── the published anchors (pristine reference; absolute correctness, not just roundtrip) ──
const ANCHORS = [
  { name: "red",      srgb: [255, 0, 0],     hue: 27.41,  chroma: 113.36, lstar: 53.23 },
  { name: "green",    srgb: [0, 255, 0],     hue: 142.14, chroma: 108.41, lstar: 87.74 },
  { name: "blue",     srgb: [0, 0, 255],     hue: 282.79, chroma: 87.23,  lstar: 32.30 },
  { name: "white",    srgb: [255, 255, 255], hue: null,   chroma: null,   lstar: 100   },
  { name: "black",    srgb: [0, 0, 0],       hue: null,   chroma: null,   lstar: 0     },
  { name: "mid-gray", srgb: [119, 119, 119], hue: null,   chroma: null,   lstar: 50.03 },
];

const fails = [];
const FAIL = (gate, msg) => fails.push(`${gate}: ${msg}`);
const chDelta = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ── GATE hpg-engine-roundtrip (anchors: absolute fwd + inverse roundtrip Δ<=2) ───────────
for (const a of ANCHORS) {
  const L = E.lstarFromRgb(a.srgb);
  if (Math.abs(L - a.lstar) > 1.5) FAIL("anchor-roundtrip", `${a.name} L* ${L.toFixed(2)} vs ${a.lstar} (>1.5)`);
  if (a.hue !== null) {
    const f = E.cam16FromRgb(a.srgb);
    if (angDiff(f.hue, a.hue) > 2.0) FAIL("anchor-roundtrip", `${a.name} hue ${f.hue.toFixed(2)} vs ${a.hue} (>2°)`);
    if (Math.abs(f.chroma - a.chroma) > 3.0) FAIL("anchor-roundtrip", `${a.name} chroma ${f.chroma.toFixed(2)} vs ${a.chroma} (>3)`);
    const inv = E.hctToRgb(f.hue, f.chroma, L);
    const d = chDelta(inv.rgb, a.srgb);
    if (d > 2) FAIL("anchor-roundtrip", `${a.name} roundtrip Δ=${d} (>2)`);
  }
}

// ── GATE hpg-engine-roundtrip (random: >=1000 in-gamut triples roundtrip Δ<=2) ───────────
let rtMax = 0;
for (let i = 0; i < 1200; i++) {
  const hue = rnd() * 360, tone = 2 + rnd() * 96;
  const cm = E.maxChromaInGamut(hue, tone);
  const col = E.hctToRgb(hue, cm * (0.2 + 0.8 * rnd()), tone);   // an in-gamut color along this ramp
  if (!col.inGamut) { FAIL("random-roundtrip", `not inGamut at hue ${hue.toFixed(1)} tone ${tone.toFixed(1)} c<=cm`); continue; }
  const f = E.cam16FromRgb(col.rgb), L = E.lstarFromRgb(col.rgb);
  const inv = E.hctToRgb(f.hue, f.chroma, L);
  const d = chDelta(inv.rgb, col.rgb);
  rtMax = Math.max(rtMax, d);
  if (d > 2) { FAIL("random-roundtrip", `Δ=${d} at hue ${hue.toFixed(1)} tone ${tone.toFixed(1)}`); break; }
}

// ── GATE hpg-engine-gamut-ceiling (inGamut at maxC, NOT at maxC+0.5) ──────────────────────
for (let i = 0; i < 1000; i++) {
  const hue = rnd() * 360, tone = 2 + rnd() * 96;
  const cm = E.maxChromaInGamut(hue, tone);
  if (!E.hctToRgb(hue, cm, tone).inGamut) { FAIL("gamut-ceiling", `maxC not inGamut hue ${hue.toFixed(1)} tone ${tone.toFixed(1)}`); break; }
  if (E.hctToRgb(hue, cm + 0.5, tone).inGamut) { FAIL("gamut-ceiling", `maxC+0.5 still inGamut hue ${hue.toFixed(1)} tone ${tone.toFixed(1)} (ceiling not tight)`); break; }
}

// ── GATE hpg-engine-branches (endpoints + neutral gray below 0.4 chroma) ─────────────────
for (let i = 0; i < 50; i++) {
  const h = rnd() * 360, c = 20 + rnd() * 100;
  const blk = E.hctToRgb(h, c, 0).rgb, wht = E.hctToRgb(h, c, 100).rgb;
  if (chDelta(blk, [0, 0, 0]) !== 0) { FAIL("branches", `tone 0 not black: ${blk}`); break; }
  if (chDelta(wht, [255, 255, 255]) !== 0) { FAIL("branches", `tone 100 not white: ${wht}`); break; }
  const g = E.hctToRgb(h, 0.3, 2 + rnd() * 96).rgb;
  if (Math.max(...g) - Math.min(...g) > 1) { FAIL("branches", `chroma 0.3 not neutral gray: ${g} (max-min>1)`); break; }
}

// ── GATE hpg-engine-oklch-deterministic (memoized: repeated calls identical) ─────────────
for (let i = 0; i < 50; i++) {
  const h = rnd() * 360;
  const a = E.oklchToCam16Hue(h), b = E.oklchToCam16Hue(h), c = E.oklchToCam16Hue(h);
  if (a !== b || b !== c) { FAIL("oklch-deterministic", `non-deterministic at h=${h.toFixed(2)}: ${a},${b},${c}`); break; }
}

// ── GATE hct-oklch — the FLOAT HCT→OKLCH readout (no 8-bit round-trip). It must describe the SAME
// color hctToRgb renders, so oklchToRgb(hctToOklch(...)) ≈ hctToRgb(...).rgb for in-gamut colors;
// values stay in range; it's deterministic; a neutral collapses to ~0 chroma. ──────────────────
let okOklchMaxD = 0;
for (let i = 0; i < 200; i++) {
  const hue = rnd() * 360, tone = 20 + rnd() * 60;
  const chroma = rnd() * E.peakC(hue).c * 0.9; // comfortably in-gamut
  const out = E.hctToRgb(hue, chroma, tone);
  if (!out.inGamut) continue;
  const lch = E.hctToOklch(hue, chroma, tone);
  if (!(lch[0] > 0 && lch[0] < 1 && lch[1] >= 0 && lch[2] >= 0 && lch[2] < 360)) { FAIL("hct-oklch", `out-of-range [${lch}] at h=${hue.toFixed(1)}`); break; }
  const lch2 = E.hctToOklch(hue, chroma, tone);
  if (lch2[0] !== lch[0] || lch2[1] !== lch[1] || lch2[2] !== lch[2]) { FAIL("hct-oklch", `non-deterministic at h=${hue.toFixed(1)}`); break; }
  const back = oklchToRgb(lch[0], lch[1], lch[2]);
  const d = Math.max(...back.map((v, j) => Math.abs(v - out.rgb[j])));
  if (d > okOklchMaxD) okOklchMaxD = d;
  if (d > 2) { FAIL("hct-oklch", `round-trip Δ=${d} at h=${hue.toFixed(1)} c=${chroma.toFixed(1)} t=${tone.toFixed(1)}`); break; }
}
if (E.hctToOklch(120, 0, 50)[1] > 0.02) FAIL("hct-oklch", `near-neutral not achromatic (C=${E.hctToOklch(120, 0, 50)[1]})`);

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
const GATES = ["anchor-roundtrip", "random-roundtrip", "gamut-ceiling", "branches", "oklch-deterministic", "hct-oklch"];
for (const g of GATES) {
  const gf = fails.filter((f) => f.startsWith(g + ":"));
  console.log(`  ${gf.length ? "FAIL" : "pass"}  ${g}${gf.length ? "  — " + gf[0].slice(g.length + 2) : ""}`);
}
console.log(`  (random roundtrip max channel Δ = ${rtMax})`);
console.log("  defer  hpg-engine-parity — differential, needs the 2nd impl (gen.js); validated at integration");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: color-engine clears its checkable [gate] predicates (parity deferred)");
process.exit(0);
