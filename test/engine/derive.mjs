#!/usr/bin/env node
// derive.mjs — verifier for the New-Palette derivation math (src/engine/derive.mjs). Pure, no DOM.
import * as D from "../../src/engine/derive.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const norm = (d) => ((d % 360) + 360) % 360;
const angClose = (a, b, tol = 1) => Math.min(norm(a - b), norm(b - a)) <= tol;

// samples: [L, C, H] OKLCH — a warm-leaning context (brass-ish 78°, maroon 28°) + a near-grey 215°.
const CTX = [[0.62, 0.068, 78], [0.32, 0.045, 28], [0.92, 0.005, 215]];

// ── weighted circular mean: near-grey barely contributes; result leans warm (between 28° and 78°) ──
{
  const { hue, coherence } = D.weightedMeanHue(CTX);
  ok(hue > 28 && hue < 78, `weightedMeanHue ${hue.toFixed(1)}° should lean warm (28–78°)`);
  ok(coherence > 0 && coherence <= 1, `coherence ${coherence} out of (0,1]`);
  // wrap correctness: 350° + 10° → 0°, NOT 180°
  const w = D.weightedMeanHue([[0.5, 0.1, 350], [0.5, 0.1, 10]]);
  ok(angClose(w.hue, 0, 1), `circular mean of 350°,10° = ${w.hue.toFixed(1)}°, want ~0° (not 180°)`);
}

// ── Rule 2: C = clamp(0.30·meanC, 0.004, 0.018); H = weighted mean ──
{
  const [L, C, H] = D.deriveNeutral(CTX);
  const meanC = (0.068 + 0.045 + 0.005) / 3;
  ok(Math.abs(C - Math.max(0.004, Math.min(0.018, 0.30 * meanC))) < 1e-9, `neutral C ${C} != clamp(0.30·meanC)`);
  ok(C >= 0.004 && C <= 0.018, `neutral C ${C} outside [0.004, 0.018]`);
  ok(L > 0 && L < 1, `neutral L ${L} not a mid grey`);
  ok(H > 28 && H < 78, `neutral H ${H.toFixed(1)}° should lean warm`);
  // vivid palette clamps to the ceiling; near-grey palette clamps to the floor
  ok(D.deriveNeutral([[0.6, 0.3, 100], [0.6, 0.3, 120]])[1] === 0.018, "vivid context clamps to C_ceil 0.018");
  ok(D.deriveNeutral([[0.6, 0.002, 100]])[1] === 0.004, "near-grey context clamps to C_floor 0.004");
}

// ── relationships: each returns a well-formed OKLCH; the hue ops are correct ──
{
  const ids = D.RELATIONSHIPS.map((r) => r.id);
  ok(JSON.stringify(ids) === JSON.stringify(["extend", "complete", "contrast", "bridge", "anchor", "recontextualize"]), `relationship set = ${ids}`);
  for (const id of ids) {
    const t = D.deriveRelative(id, CTX);
    ok(Array.isArray(t) && t.length === 3 && t.every((n) => Number.isFinite(n)), `${id}: malformed OKLCH ${JSON.stringify(t)}`);
    ok(t[0] > 0 && t[0] <= 1 && t[1] >= 0 && t[2] >= 0 && t[2] < 360, `${id}: OKLCH out of range ${JSON.stringify(t)}`);
  }
  // single-reference relationships pivot on the PRIMARY = samples[0] (priority order), NOT the mean.
  const P = CTX[0]; // [0.62, 0.068, 78]
  ok(angClose(D.deriveRelative("extend", CTX)[2], norm(P[2] + 30)), "extend = primary + 30°");
  ok(angClose(D.deriveRelative("contrast", CTX)[2], norm(P[2] + 180)), "contrast = primary + 180°");
  ok(angClose(D.deriveRelative("anchor", CTX)[2], P[2]), "anchor = primary hue");
  ok(Math.abs(D.deriveRelative("anchor", CTX)[1] - P[1]) < 1e-9, "anchor inherits the primary's chroma");
  ok(angClose(D.deriveRelative("recontextualize", CTX)[2], norm(P[2] + 180)), "recontextualize = primary's complement");
  ok(D.deriveRelative("recontextualize", CTX)[1] < P[1], "recontextualize chroma is muted (< primary's)");

  // PRIORITY beats CHROMA: a LOW-chroma primary still anchors, even with a vivid secondary present.
  const CTX2 = [[0.5, 0.04, 200], [0.5, 0.12, 30]]; // primary = muted blue 200°; secondary = vivid orange 30°
  ok(angClose(D.deriveRelative("anchor", CTX2)[2], 200), "anchor follows the PRIMARY (200°), not the max-chroma secondary (30°)");
  ok(angClose(D.deriveRelative("extend", CTX2)[2], 230), "extend = primary + 30° = 230° (order, not chroma weighting)");
  ok(angClose(D.deriveRelative("contrast", CTX2)[2], 20), "contrast = primary + 180° = 20°");
}

// ── edge cases: empty context → a sane fallback, never NaN ──
{
  const n0 = D.deriveNeutral([]);
  ok(n0.every((n) => Number.isFinite(n)), `deriveNeutral([]) = ${JSON.stringify(n0)} (NaN)`);
  const r0 = D.deriveRelative("contrast", []);
  ok(r0.every((n) => Number.isFinite(n)), `deriveRelative with no context = ${JSON.stringify(r0)} (NaN)`);
}

if (fails.length) { console.error(`derive FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("derive PASS — weighted-mean hue, neutral clamp, and the 6 relationships hold");
process.exit(0);
