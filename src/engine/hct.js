// hct.js — HCT color engine (CAM16 hue/chroma + CIELAB L* tone), vanilla ESM, no deps.
//
// HCT = Hue/Chroma from CAM16 (material-color-utilities viewing conditions) +
//       Tone from CIELAB L*. The viewing conditions VC are computed once at load
//       and cached, so the engine is fully deterministic (no RNG, no clock).
//
// Public contract (the grading harness imports exactly these):
//   hctToRgb(hue, chroma, tone) -> { rgb:[r,g,b] (0-255 ints), inGamut:boolean, lstar }
//   hctToOklch(hue, chroma, tone) -> [L, C, H°] (FLOAT — high-res, no 8-bit round-trip)
//   cam16FromRgb([r,g,b])       -> { hue, chroma, J }
//   lstarFromRgb([r,g,b])       -> CIELAB L* (0-100)
//   maxChromaInGamut(hue, tone) -> number
//   peakC(hue)                  -> { c, tone }
//   oklchToCam16Hue(h)          -> CAM16 hue (degrees)

// ── Constants (literal — material-color-utilities) ───────────────────────────
const SRGB_TO_XYZ = [
  [0.41233895, 0.35762064, 0.18051042],
  [0.2126, 0.7152, 0.0722],
  [0.01932141, 0.11916382, 0.95034478],
];
const XYZ_TO_SRGB = [
  [3.2413774792388685, -1.5376652402851851, -0.49885366846268053],
  [-0.9691452513005321, 1.8758853451067872, 0.04156585616912061],
  [0.05562093689691305, -0.20395524564742123, 1.0571799111220335],
];
const WHITE = [95.047, 100.0, 108.883];
const CAT16 = [
  [0.401288, 0.650173, -0.051461],
  [-0.250268, 1.204414, 0.045854],
  [-0.002079, 0.048952, 0.953127],
];
const CAT16_INV = [
  [1.8620678550872327, -1.0112546305316843, 0.14918677544445175],
  [0.38752654323613717, 0.6214474419314753, -0.008973985167612518],
  [-0.015841498849333856, -0.03412293802851557, 1.0499644368778496],
];

// ── Small linear-algebra helper: 3x3 matrix · 3-vector ───────────────────────
function matMul(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

// ── sRGB companding (linear scaled to 0..100) ────────────────────────────────
function lin(c8) {
  const c = c8 / 255;
  return (c <= 0.040449936 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 100;
}
function delin(L) {
  const n = L / 100;
  const v = n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

// ── CIELAB L* <-> Y bridge ───────────────────────────────────────────────────
function labInvf(ft) {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const c = ft ** 3;
  return c > e ? c : (116 * ft - 16) / k;
}
function yFromL(L) {
  return 100 * labInvf((L + 16) / 116);
}
function lFromY(y) {
  const e = 216 / 24389;
  const n = y / 100;
  return n <= e ? (n * 24389) / 27 : 116 * Math.cbrt(n) - 16;
}

// ── Viewing conditions (computed once, cached as VC) ─────────────────────────
function makeVC() {
  const aL = ((200 / Math.PI) * yFromL(50)) / 100; // adapting luminance, mid-gray field
  const F = 1.0;
  const c = 0.69;
  const Nc = 1.0;
  const [rW, gW, bW] = matMul(CAT16, WHITE);
  const k = 1 / (5 * aL + 1);
  const k4 = k ** 4;
  const fl = 0.2 * k4 * (5 * aL) + 0.1 * (1 - k4) ** 2 * Math.cbrt(5 * aL);
  const n = yFromL(50) / WHITE[1]; // background relative luminance (~0.18418)
  const z = 1.48 + Math.sqrt(n);
  const nbb = 0.725 * (1 / n) ** 0.2;
  const ncb = nbb;
  const d = Math.min(
    Math.max(F * (1 - (1 / 3.6) * Math.exp((-aL - 42) / 92)), 0),
    1
  );
  const rgbD = [
    (d * 100) / rW + 1 - d,
    (d * 100) / gW + 1 - d,
    (d * 100) / bW + 1 - d,
  ];
  const rgbW = [rW, gW, bW];
  const rgbAF = rgbD.map((dd, i) => (fl * dd * rgbW[i] / 100) ** 0.42);
  const rgbA = rgbAF.map((v) => (400 * v) / (v + 27.13));
  const aw = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * nbb;
  return { fl, n, z, nbb, ncb, c, nc: Nc, rgbD, aw };
}
const VC = makeVC();

// ── CAM16 forward: XYZ -> {hue, chroma, J} ───────────────────────────────────
function cam16FromXyz(x, y, z) {
  const [r, g, b] = matMul(CAT16, [x, y, z]);
  const rD = VC.rgbD[0] * r;
  const gD = VC.rgbD[1] * g;
  const bD = VC.rgbD[2] * b;
  // signed nonlinear cone adaptation
  const fA = (s) => {
    const af = (VC.fl * Math.abs(s) / 100) ** 0.42;
    return Math.sign(s) * 400 * af / (af + 27.13);
  };
  const rA = fA(rD);
  const gA = fA(gD);
  const bA = fA(bD);
  // opponent channels
  const a = (11 * rA - 12 * gA + bA) / 11;
  const bb = (rA + gA - 2 * bA) / 9;
  const u = (20 * rA + 20 * gA + 21 * bA) / 20;
  const p2 = (40 * rA + 20 * gA + bA) / 20;
  // hue angle
  const hue = (((Math.atan2(bb, a) * 180) / Math.PI) % 360 + 360) % 360;
  const hp = hue < 20.14 ? hue + 360 : hue;
  const eHue = 0.25 * (Math.cos((hp * Math.PI) / 180 + 2) + 3.8);
  // lightness J
  const J = 100 * (p2 * VC.nbb / VC.aw) ** (VC.c * VC.z);
  // chroma C
  const p1 = (50000 / 13) * eHue * VC.nc * VC.ncb;
  const t = (p1 * Math.hypot(a, bb)) / (u + 0.305);
  const alpha = t ** 0.9 * (1.64 - 0.29 ** VC.n) ** 0.73;
  const C = alpha * Math.sqrt(J / 100);
  return { hue, chroma: C, J };
}

// ── CAM16 inverse: {J, C, hue} -> XYZ (used by hctToRgb's tone search) ────────
function xyzFromCam16(J, C, hue) {
  const hRad = (hue * Math.PI) / 180;
  const alpha = C === 0 || J === 0 ? 0 : C / Math.sqrt(J / 100);
  const t = (alpha / (1.64 - 0.29 ** VC.n) ** 0.73) ** (1 / 0.9);
  const hp = hue < 20.14 ? hue + 360 : hue;
  const eHue = 0.25 * (Math.cos((hp * Math.PI) / 180 + 2) + 3.8);
  const ac = VC.aw * (J / 100) ** (1 / (VC.c * VC.z));
  const p1 = eHue * (50000 / 13) * VC.nc * VC.ncb;
  const p2 = ac / VC.nbb;
  const hSin = Math.sin(hRad);
  const hCos = Math.cos(hRad);
  const gamma =
    (23 * (p2 + 0.305) * t) /
    (23 * p1 + 11 * t * hCos + 108 * t * hSin);
  const a = gamma * hCos;
  const b = gamma * hSin;
  const rA = (460 * p2 + 451 * a + 288 * b) / 1403;
  const gA = (460 * p2 - 891 * a - 261 * b) / 1403;
  const bA = (460 * p2 - 220 * a - 6300 * b) / 1403;
  // invert the signed nonlinear cone adaptation
  const inv = (s) => {
    const base = Math.max(0, (27.13 * Math.abs(s)) / (400 - Math.abs(s)));
    return Math.sign(s) * (100 / VC.fl) * base ** (1 / 0.42);
  };
  const rC = inv(rA);
  const gC = inv(gA);
  const bC = inv(bA);
  const rF = rC / VC.rgbD[0];
  const gF = gC / VC.rgbD[1];
  const bF = bC / VC.rgbD[2];
  return matMul(CAT16_INV, [rF, gF, bF]);
}

// ── hctToRgb — branches in order (endpoints, neutral gray, then J tone-search) ─
// _hctToLinRGB — the shared CAM16 solve: HCT -> converged linear sRGB (0..100 scale) + lstar + inGamut.
// hctToRgb delins this to 0..255 ints; hctToOklch converts the SAME float pixel to OKLab — so a
// perceptual readout reflects the high-res model, never an 8-bit round-trip.
function _hctToLinRGB(hue, chroma, tone) {
  // 1) tone clamps to pure black / white.
  if (tone <= 0) return { linRGB: [0, 0, 0], inGamut: true, lstar: 0 };
  if (tone >= 100) return { linRGB: [100, 100, 100], inGamut: true, lstar: 100 };
  // 3) near-neutral: CAM16 inversion is noisy below 0.4 chroma — emit gray at the tone.
  if (chroma < 0.4) { const y = yFromL(tone); return { linRGB: [y, y, y], inGamut: true, lstar: tone }; }
  // 4) binary-search CAM16 lightness J so the resulting Y reproduces the target tone (L*).
  let lo = 0;
  let hi = 100;
  let xyz = xyzFromCam16(50, chroma, hue);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    xyz = xyzFromCam16(mid, chroma, hue);
    const lMid = lFromY(xyz[1]);
    // larger J -> larger Y -> larger L*; move the bound that brackets `tone`.
    if (lMid < tone) lo = mid;
    else hi = mid;
  }
  // final XYZ at the converged J -> linear sRGB -> gamut test.
  const linRGB = matMul(XYZ_TO_SRGB, xyz);
  const inGamut = linRGB.every((ch) => ch >= -0.0001 && ch <= 100.0001);
  return { linRGB, inGamut, lstar: lFromY(xyz[1]) };
}

export function hctToRgb(hue, chroma, tone) {
  const { linRGB, inGamut, lstar } = _hctToLinRGB(hue, chroma, tone);
  return { rgb: linRGB.map((ch) => delin(ch)), inGamut, lstar };
}

// hctToOklch(hue, chroma, tone) -> [L, C, H°] in FLOAT. Reuses the CAM16 solve, then sends the
// converged linear sRGB straight through OKLab (Björn Ottosson's matrices — the same constants as
// okhsl.js linearSrgbToOklab; inlined to keep hct.js dependency-free). NO 8-bit step, so analysis /
// readouts read the perceptual coords from the high-res model, not the rendered pixel.
export function hctToOklch(hue, chroma, tone) {
  const { linRGB } = _hctToLinRGB(hue, chroma, tone);
  const r = Math.min(Math.max(linRGB[0] / 100, 0), 1);
  const g = Math.min(Math.max(linRGB[1] / 100, 0), 1);
  const b = Math.min(Math.max(linRGB[2] / 100, 0), 1);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  H = ((H % 360) + 360) % 360;
  return [L, Math.hypot(a, bb), H];
}

// ── Forward helpers from sRGB ────────────────────────────────────────────────
export function cam16FromRgb(rgb) {
  const xyz = matMul(SRGB_TO_XYZ, [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])]);
  return cam16FromXyz(xyz[0], xyz[1], xyz[2]);
}
export function lstarFromRgb(rgb) {
  const y = matMul(SRGB_TO_XYZ, [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])])[1];
  return lFromY(y);
}

// ── maxChromaInGamut — tight gamut ceiling at (hue, tone), memoized ───────────
const _mc = new Map();
export function maxChromaInGamut(hue, tone) {
  if (tone <= 0 || tone >= 100) return 0;
  const key = hue.toFixed(2) + "|" + tone.toFixed(2);
  const hit = _mc.get(key);
  if (hit !== undefined) return hit;
  let lo = 0;
  let hi = 180;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (hctToRgb(hue, mid, tone).inGamut) lo = mid;
    else hi = mid;
  }
  _mc.set(key, lo);
  return lo;
}

// ── peakC — the hue's maximum achievable chroma and the tone where it peaks ───
const _pk = new Map();
export function peakC(hue) {
  const key = hue.toFixed(2);
  const hit = _pk.get(key);
  if (hit !== undefined) return hit;
  let bestC = 0;
  let bestT = 0;
  for (let t = 4; t <= 96; t += 2) {
    const c = maxChromaInGamut(hue, t);
    if (c > bestC) {
      bestC = c;
      bestT = t;
    }
  }
  const res = { c: bestC, tone: bestT };
  _pk.set(key, res);
  return res;
}

// ── oklchToCam16Hue — sample a fixed mid OKLCH color, read its CAM16 hue ──────
const _oh = new Map();
export function oklchToCam16Hue(h) {
  const key = h.toFixed(2);
  const hit = _oh.get(key);
  if (hit !== undefined) return hit;
  const L = 0.72;
  const a = 0.1 * Math.cos((h * Math.PI) / 180);
  const b = 0.1 * Math.sin((h * Math.PI) / 180);
  // OKLab -> LMS' -> LMS (cube) -> linear sRGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  let R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  // clamp negatives, treat as linear sRGB in 0..1 -> scale to 0..100 -> XYZ -> CAM16 hue.
  R = Math.max(0, R);
  G = Math.max(0, G);
  B = Math.max(0, B);
  const xyz = matMul(SRGB_TO_XYZ, [R * 100, G * 100, B * 100]);
  const hue = cam16FromXyz(xyz[0], xyz[1], xyz[2]).hue;
  _oh.set(key, hue);
  return hue;
}
