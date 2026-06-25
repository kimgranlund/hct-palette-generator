// derive.mjs — PURE palette-derivation math for the "New Palette" modal. Given the context palettes'
// representative colors as OKLCH samples ([L,C,H] each), returns a TARGET OKLCH [L,C,H] for the new
// palette, per a color-theory relationship (A) or the neutral rule (B, color-neutral-derivation.md).
// No imports, no DOM — the UI extracts samples (from each included palette's key color) + calls these,
// then seeds a palette from the returned OKLCH via seedFromKeyColor.
//
// OKLCH hue is degrees; chroma is the OKLCH C (~0..0.4); lightness 0..1. All hue math is circular.

const TAU = 360;
const norm = (deg) => ((deg % TAU) + TAU) % TAU;
const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// chroma-weighted circular mean hue. Σ C·(cosH, sinH) → atan2. Returns { hue, coherence } where
// coherence = |resultant| / ΣC ∈ [0,1] (≈0 means the samples cancel out / are near-neutral → hue noisy).
export function weightedMeanHue(samples) {
  let x = 0, y = 0, wsum = 0;
  for (const [, C, H] of samples) { x += C * Math.cos(rad(H)); y += C * Math.sin(rad(H)); wsum += C; }
  if (wsum === 0 || (x === 0 && y === 0)) return { hue: samples.length ? norm(samples[0][2]) : 0, coherence: 0 };
  return { hue: norm((Math.atan2(y, x) * 180) / Math.PI), coherence: Math.hypot(x, y) / wsum };
}

const meanC = (samples) => mean(samples.map((s) => s[1]));
const meanL = (samples) => mean(samples.map((s) => s[2 - 1])); // L is index 0
// signed shortest angular distance a→b in (−180,180]
const arc = (a, b) => { let d = (norm(b) - norm(a) + 540) % TAU - 180; return d; };

// largest circular GAP between sorted hues → its midpoint (the most "open" slot on the wheel).
function largestGapHue(hues) {
  if (hues.length === 0) return 0;
  if (hues.length === 1) return norm(hues[0] + 180); // a lone hue → its complement is the open slot
  const sorted = [...hues.map(norm)].sort((a, b) => a - b);
  let bestGap = -1, mid = 0;
  for (let i = 0; i < sorted.length; i++) {
    const lo = sorted[i], hi = sorted[(i + 1) % sorted.length] + (i + 1 === sorted.length ? TAU : 0);
    const gap = hi - lo;
    if (gap > bestGap) { bestGap = gap; mid = norm(lo + gap / 2); }
  }
  return mid;
}

// the two most-separated hues → the midpoint of the SHORTER arc between them (a mediating "bridge").
function bridgeHue(samples) {
  const hues = samples.map((s) => norm(s[2]));
  if (hues.length < 2) return hues.length ? hues[0] : 0;
  let best = -1, a = hues[0], b = hues[0];
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) {
    const sep = Math.abs(arc(hues[i], hues[j]));
    if (sep > best) { best = sep; a = hues[i]; b = hues[j]; }
  }
  return norm(a + arc(a, b) / 2); // midpoint on the shorter arc from a to b
}

// B — Neutral / environment (color-neutral-derivation.md): chroma-weighted mean hue + a chroma
// scaled to the palette and clamped firmly into tinted-grey territory. L is the mid-grey the C_max
// applies to. Returns the neutral's identity OKLCH.
export function deriveNeutral(samples) {
  const { hue } = weightedMeanHue(samples);
  const C = clamp(0.30 * meanC(samples), 0.004, 0.018);
  return [0.66, C, hue]; // mid-grey lightness; the ramp tapers chroma off both ends from here
}

// A — the color-theory relationships. The single-reference relationships (extend/contrast/anchor/
// recontextualize) pivot on the PRIMARY — `samples[0]`, which the caller orders by priority (the
// first non-neutral palette). The set-geometry ones (complete/bridge) use the whole set. So priority
// ORDER drives the result, NOT chroma weighting: a low-chroma primary still anchors the relationship.
export const RELATIONSHIPS = [
  { id: "extend", label: "Extend", hint: "Analogous — continue the primary's family (+30°)" },
  { id: "complete", label: "Complete", hint: "Fill the largest open gap on the wheel" },
  { id: "contrast", label: "Contrast", hint: "Complement — oppose the primary at 180°" },
  { id: "bridge", label: "Bridge", hint: "Mediate between the two most-separated hues" },
  { id: "anchor", label: "Anchor", hint: "Reinforce the primary hue at full chroma" },
  { id: "recontextualize", label: "Recontextualize", hint: "Albers — the primary's complement, muted (reads shifted in context)" },
];

export function deriveRelative(id, samples) {
  if (!samples.length) return [0.6, 0.12, 0];
  const P = samples[0]; // the PRIMARY — first by priority order (the caller puts non-neutrals first)
  const mc = meanC(samples), ml = meanL(samples);
  switch (id) {
    case "extend": return [P[0], P[1], norm(P[2] + 30)];
    case "complete": return [ml, mc, largestGapHue(samples.map((s) => s[2]))];
    case "contrast": return [P[0], P[1], norm(P[2] + 180)];
    case "bridge": return [ml, mc, bridgeHue(samples)];
    case "anchor": return [P[0], P[1], norm(P[2])];
    case "recontextualize": return [P[0], P[1] * 0.6, norm(P[2] + 180)];
    default: return [P[0], P[1], P[2]];
  }
}
