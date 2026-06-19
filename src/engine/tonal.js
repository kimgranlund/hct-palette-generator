// tonal.js — tonal-scale generation module (vanilla ESM, no deps).
//
// Builds a palette's per-stop ramp from global controls + a palette's
// {hue, chroma, skew, lift}. Tone (L*) comes from a shaped, skewable curve;
// chroma is a % of the hue's sRGB peak, edge-damped, and clamped to the gamut
// ceiling. Every emitted color is produced by the validated HCT engine so it is
// in-gamut, hits its target tone, and holds a constant CAM16 hue along the ramp.
//
// Engine contract (validated, imported — never reimplemented here):
//   hctToRgb(hue, chroma, tone) -> { rgb:[r,g,b] (0-255 ints), inGamut, lstar }
//   maxChromaInGamut(hue, tone) -> number   peakC(hue) -> { c, tone }
//   oklchToCam16Hue(h)          -> CAM16 hue (degrees)
import { hctToRgb, maxChromaInGamut, peakC, oklchToCam16Hue, lstarFromRgb, cam16FromRgb } from "./hct.js";
import { okhslToRgb, rgbToOkhsl } from "./okhsl.js";

// ── Stop sets ────────────────────────────────────────────────────────────────
// Display ramp: 050..950 step 50 (19 stops). Light at 050, dark at 950.
export const STOPS = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
  550, 600, 650, 700, 750, 800, 850, 900, 950,
];
// Export-only half-steps (fine surface elevations); not shown in the grid.
export const EXTRA_STOPS = [75, 125, 175, 825, 875, 925];
// All exports use the union, sorted ascending (25 stops).
export const EXPORT_STOPS = [...STOPS, ...EXTRA_STOPS].sort((a, b) => a - b);

// ── Global control defaults ──────────────────────────────────────────────────
export const DEFAULT_CONTROLS = {
  curve: "logistic",
  tension: 0,
  lmin: 5,
  lmax: 100,
  damp: 80,
  // Differential damping curve (defaults reproduce the legacy 1 - damp·u^1.5 edge
  // damp exactly): dampCurve = falloff exponent γ, dampAmp = mid-tone boost (0 = off),
  // dampBias = light(−)↔dark(+) asymmetry. See paletteStops for the multiplier m.
  dampCurve: 1.5,
  dampAmp: 0,
  dampBias: 0,
  hueSpace: "cam16",
  // Chroma basis. false (default): the chroma control is % of the BASE-hue PEAK — per-hue, but the
  // ABSOLUTE chroma still varies with each hue's gamut, so hues come out unequally saturated. true:
  // it's % of EACH STOP's own gamut ceiling, so every hue fills the same fraction of its gamut →
  // palettes harmonize across hue regardless of the hue picked (see paletteStops). A cheap stand-in
  // for OKHSL-style perceptual-saturation normalization.
  relChroma: false,
  // Ramp distribution mode (how stops map to lightness):
  //   "even"       — the classic CIELAB-L* curve below (toneAt): per-stop tone is the SAME L* for every
  //                  hue, so palettes stay tone-aligned. The curve/skew/lift/damp/relChroma controls all
  //                  apply here. Can leave a near-white "dead zone" at the light end of LOW-chroma ramps.
  //   "perceptual" — even steps in OKHSL lightness (perceptually uniform) + gamut-proportional chroma, so
  //                  every stop is distinct (no dead zone), at the cost of per-hue tone alignment.
  //   "peak"       — like perceptual but the hue's CUSP (peak chroma) is anchored at stop 500 and each
  //                  half spreads from there (Tailwind-style "the color is 500"). Vivid/centered.
  // perceptual/peak go through the OKHSL path (okhslStops); lmin/lmax/damp still bound/shape it, but the
  // CIELAB-only controls (curve/skew/lift/relChroma) and the L*-fidelity guarantees apply to "even" only.
  toneMode: "perceptual",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;

// effHue — resolve a palette's input hue to a CAM16 hue ONCE per palette.
// 'oklch' inputs are mapped through the engine; 'cam16' (default) pass straight.
// Compute this a single time and feed the SAME value to every stop so the
// emitted CAM16 hue is constant across the ramp (hue-stability).
export function effHue(hue, hueSpace) {
  return hueSpace === "oklch" ? oklchToCam16Hue(hue) : hue;
}

// shape — remap normalized position p∈[0,1] (0=light end, 1=dark end) to q∈[0,1].
// ten = tension/100; tension only affects logistic and exp (others ignore it).
function shape(p, curve, ten) {
  switch (curve) {
    case "linear":
      return p;
    case "sine":
      return 0.5 - 0.5 * Math.cos(Math.PI * p); // eased both ends
    case "cubic":
      return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; // cubic in/out
    case "logistic": {
      const k = lerp(4, 16, ten);
      const f = (x) => 1 / (1 + Math.exp(-k * (x - 0.5)));
      return (f(p) - f(0)) / (f(1) - f(0)); // normalized sigmoid
    }
    case "exp": {
      const k = lerp(0.4, 5, ten);
      return (Math.exp(k * p) - 1) / (Math.exp(k) - 1); // compressed lights
    }
    default:
      return p;
  }
}

// toneAt — L* for a stop given per-palette skew/lift and the tone controls.
// Monotonic non-increasing 050->950 (lift 0): p rises, p^g preserves order for
// any g>0, every shape() is non-decreasing, and t = lmax-(lmax-lmin)*q inverts q.
export function toneAt(stop, skew, lift, { curve, lmin, lmax, tension }) {
  let p = (stop - 50) / 900; // 0 at 050 (light) .. 1 at 950 (dark)
  const g = 3 ** (skew / 100); // skew>0 -> gamma>1 -> lighter mids
  p = p ** g;
  const q = shape(p, curve, tension / 100);
  let t = lmax - (lmax - lmin) * q;
  if (lift) {
    // additive cosine bump centered on stop 500, tapering to 0 at 050/950.
    const w = 0.5 * (1 + Math.cos((Math.PI * (stop - 500)) / 450));
    t += lift * w;
  }
  return Math.min(Math.max(t, lmin), lmax);
}

// paletteStops — full per-stop pipeline for one palette.
// palette: { hue, chroma, skew, lift }; controls: DEFAULT_CONTROLS-shaped.
// Returns [{ stop, tone, chroma, maxc, rgb, hex, inGamut }] for each stop.
export function paletteStops(palette, controls, stops) {
  const mode = controls.toneMode || "even";
  if (mode === "perceptual" || mode === "peak") return okhslStops(palette, controls, stops, mode);
  // Resolve the BASE hue once. The per-stop hue may be EDGE-ROTATED below (hueShift);
  // when hueShift=0 every stop uses baseHue (the flat-hue, hue-stability default).
  const baseHue = effHue(palette.hue, controls.hueSpace);
  const shift = palette.hueShift ?? 0; // edge hue rotation: ±deg at the ends
  const sameDir = palette.hueSameDir === true; // true = both ends bend the SAME way (|s|), else opposite (s)
  const pk = peakC(baseHue).c; // the BASE hue's max chroma in sRGB
  const target = (palette.chroma / 100) * pk; // control is % of the BASE-hue peak
  const ctl = {
    curve: controls.curve,
    lmin: controls.lmin,
    lmax: controls.lmax,
    tension: controls.tension,
  };
  return stops.map((stop) => {
    const tone = toneAt(stop, palette.skew, palette.lift, ctl);
    const s = (stop - 500) / 450; // signed position: <0 light · 0 mid · >0 dark
    // Edge hue rotation, pivoting on stop 500 (s=0). OPPOSITE mode (default) torsions the
    // ends apart — hueShift·s → light end −shift, dark end +shift. SAME-direction mode
    // (hueSameDir) bends BOTH ends the same way, matching the LIGHT end: hueShift·(−|s|),
    // so e.g. a light+20/dark−20 opposite becomes light+20/dark+20. hueShift=0 → flat.
    const dir = sameDir ? -Math.abs(s) : s;
    const hue = (((baseHue + shift * dir) % 360) + 360) % 360;
    const maxc = maxChromaInGamut(hue, tone); // gamut ceiling at the (rotated) hue
    // Differential damping curve — a per-stop chroma multiplier m(stop):
    //   • falloff (dampCurve, γ) shapes WHERE damping bites: low = broad (into the
    //     mids), high = confined to the extreme ends.
    //   • amplify (dampAmp) boosts the mids toward the ceiling (m can exceed 1);
    //     it peaks at stop 500 and tapers to 0 at the ends, so it never fights the
    //     edge damp. The min(·, maxc) clamp keeps every result in-gamut.
    //   • bias (dampBias) tilts damping toward the dark (>0) or light (<0) end.
    // Defaults γ=1.5, amp=0, bias=0 reproduce the legacy 1 − damp·u^1.5 curve.
    const uG = Math.abs(s) ** (controls.dampCurve ?? 1.5);
    const sideW = Math.max(0, 1 + ((controls.dampBias ?? 0) / 100) * Math.sign(s));
    const m = Math.max(
      0,
      1 + ((controls.dampAmp ?? 0) / 100) * (1 - uG) - (controls.damp / 100) * sideW * uG,
    );
    // Chroma basis (controls.relChroma): default scales the base-hue PEAK target by the damping m and
    // caps at the per-stop ceiling — the chroma is a constant target shaped by damping, then clamped.
    // Relative mode scales EACH stop by its OWN gamut ceiling, so every hue fills the same fraction of
    // its gamut envelope and palettes read as equally saturated regardless of hue. min(·, maxc) keeps
    // it in-gamut either way (m can exceed 1 via dampAmp).
    const chroma = controls.relChroma
      ? Math.min((palette.chroma / 100) * maxc * m, maxc)
      : Math.min(target * m, maxc);
    // Emit via the engine at the per-stop (hue, chroma, tone): in-gamut, hits the
    // tone, holds the SPECIFIED hue (constant when hueShift=0, else edge-rotated).
    const out = hctToRgb(hue, chroma, tone);
    const hex =
      "#" +
      out.rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    return { stop, tone, chroma, maxc, rgb: out.rgb, hex, inGamut: out.inGamut };
  });
}

// ── OKHSL distribution path (toneMode "perceptual" | "peak") ──────────────────────────────────────
// Steps lightness evenly in OKHSL's perceptually-uniform l — or, for "peak", with the hue's CUSP
// anchored at stop 500 and each half spread from there — with chroma as a gamut-proportional OKHSL
// saturation. Every emitted color is in gamut by OKHSL's construction. l is keyed off the STOP NUMBER
// (not the array index) so a stop has the same color in the 19-stop display ramp and the 25-stop export ramp.
const _okL = new Map(); // L* -> OKHSL lightness (via a neutral gray at that L*); memoized
function okhslLAt(lstar) {
  const k = lstar.toFixed(2);
  let v = _okL.get(k);
  if (v === undefined) { v = rgbToOkhsl(hctToRgb(0, 0, lstar).rgb).l; _okL.set(k, v); }
  return v;
}

function okhslStops(palette, controls, stops, mode) {
  const baseHue = effHue(palette.hue, controls.hueSpace);
  const pk = peakC(baseHue);                                       // { c, tone } — the cusp
  const hOk = rgbToOkhsl(hctToRgb(baseHue, pk.c, pk.tone).rgb).h;  // the palette's hue in OKHSL space
  const shift = palette.hueShift ?? 0;
  const sameDir = palette.hueSameDir === true;
  const lLight = okhslLAt(controls.lmax ?? 100);                   // light end (l≈1 at lmax=100 → 050 white)
  const lDark = okhslLAt(controls.lmin ?? 5);                      // dark end
  const cuspL = okhslLAt(pk.tone);                                 // OKHSL lightness of the cusp (peak pivot)
  return stops.map((stop) => {
    // lightness per stop — STOP-based so the display(19) and export(25) ramps agree at a given stop.
    const l = mode === "peak"
      ? (stop <= 500 ? lerp(lLight, cuspL, (stop - 50) / 450) : lerp(cuspL, lDark, (stop - 500) / 450))
      : lerp(lLight, lDark, (stop - 50) / 900);
    // saturation = chroma% of the gamut, shaped by the SAME damping multiplier m as the even path (so
    // damp/dampCurve/dampAmp/dampBias stay meaningful here), clamped to OKHSL's [0,1].
    const sp = (stop - 500) / 450;
    const dir = sameDir ? -Math.abs(sp) : sp;
    const hue = (((hOk + shift * dir) % 360) + 360) % 360;
    const uG = Math.abs(sp) ** (controls.dampCurve ?? 1.5);
    const sideW = Math.max(0, 1 + ((controls.dampBias ?? 0) / 100) * Math.sign(sp));
    const m = Math.max(0, 1 + ((controls.dampAmp ?? 0) / 100) * (1 - uG) - (controls.damp / 100) * sideW * uG);
    const s = Math.min(1, Math.max(0, (palette.chroma / 100) * m));
    const rgb = okhslToRgb(hue, s, l);
    const tone = lstarFromRgb(rgb);                                 // report ACTUAL L* (for graphs / roles)
    const hex = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    // chroma/maxc reported (measured) for the analysis graphs; OKHSL is in-gamut by construction.
    return { stop, tone, chroma: cam16FromRgb(rgb).chroma, maxc: maxChromaInGamut(baseHue, tone), rgb, hex, inGamut: true };
  });
}
