// okhsl.js — OKHSL ⇄ sRGB (Björn Ottosson's perceptual HSL over OKLab).
//
// Ported VERBATIM from the canonical reference (bottosson.github.io/posts/colorpicker/,
// misc/colorpicker/colorconversion.js) — the magic constants are load-bearing and copied exactly.
// OKHSL is gamut-BIJECTIVE: for a given (hue, lightness), saturation s=1 lands exactly on the sRGB
// gamut boundary, and a fixed (s, l) reads as the same perceived colorfulness across hue. That is the
// property that lets palettes harmonize regardless of hue (a blue and a yellow at the same s/l feel
// equally saturated) — the principled version of the relChroma "gamut" basis.
//
// Boundary conventions for THIS repo: hue in DEGREES (converted to Ottosson's [0,1] turns inside),
// RGB as 0-255 integers (the reference works in 0..1). Pure, dependency-free, deterministic.

// ── sRGB transfer (0..1) ──────────────────────────────────────────────────────
const srgbTransfer = (a) => (a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055);
const srgbTransferInv = (a) => (a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4));

// ── linear sRGB ⇄ OKLab ───────────────────────────────────────────────────────
function linearSrgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// ── toe (the L_r reference-lightness warp) ────────────────────────────────────
const K1 = 0.206, K2 = 0.03, K3 = (1 + K1) / (1 + K2);
const toe = (x) => 0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) * (K3 * x - K1) + 4 * K2 * K3 * x));
const toeInv = (x) => (x * x + K1 * x) / (K3 * (x + K2));

// ── gamut helpers (a,b normalized so a²+b²==1) ────────────────────────────────
function computeMaxSaturation(a, b) {
  let k0, k1, k2, k3, k4, wl, wm, ws;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    k0 = +1.19086277; k1 = +1.76576728; k2 = +0.59662641; k3 = +0.75515197; k4 = +0.56771245;
    wl = +4.0767416621; wm = -3.3077115913; ws = +0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    k0 = +0.73956515; k1 = -0.45954404; k2 = +0.08285427; k3 = +0.12541070; k4 = +0.14503204;
    wl = -1.2684380046; wm = +2.6097574011; ws = -0.3413193965;
  } else {
    k0 = +1.35733652; k1 = -0.00915799; k2 = -1.15130210; k3 = -0.50559606; k4 = +0.00692167;
    wl = -0.0041960863; wm = -0.7034186147; ws = +1.7076147010;
  }
  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
  const k_l = +0.3963377774 * a + 0.2158037573 * b;
  const k_m = -0.1055613458 * a - 0.0638541728 * b;
  const k_s = -0.0894841775 * a - 1.2914855480 * b;
  const l_ = 1 + S * k_l, m_ = 1 + S * k_m, s_ = 1 + S * k_s;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const l_dS = 3 * k_l * l_ * l_, m_dS = 3 * k_m * m_ * m_, s_dS = 3 * k_s * s_ * s_;
  const l_dS2 = 6 * k_l * k_l * l_, m_dS2 = 6 * k_m * k_m * m_, s_dS2 = 6 * k_s * k_s * s_;
  const f = wl * l + wm * m + ws * s;
  const f1 = wl * l_dS + wm * m_dS + ws * s_dS;
  const f2 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;
  return S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
}
function findCusp(a, b) {
  const sCusp = computeMaxSaturation(a, b);
  const rgb = oklabToLinearSrgb(1, sCusp * a, sCusp * b);
  const lCusp = Math.cbrt(1 / Math.max(rgb[0], rgb[1], rgb[2]));
  return [lCusp, lCusp * sCusp];
}
function findGamutIntersection(a, b, L1, C1, L0, cusp) {
  if (!cusp) cusp = findCusp(a, b);
  let t;
  if ((L1 - L0) * cusp[1] - (cusp[0] - L0) * C1 <= 0) {
    t = (cusp[1] * L0) / (C1 * cusp[0] + cusp[1] * (L0 - L1));
  } else {
    t = (cusp[1] * (L0 - 1)) / (C1 * (cusp[0] - 1) + cusp[1] * (L0 - L1));
    const dL = L1 - L0, dC = C1;
    const k_l = +0.3963377774 * a + 0.2158037573 * b;
    const k_m = -0.1055613458 * a - 0.0638541728 * b;
    const k_s = -0.0894841775 * a - 1.2914855480 * b;
    const l_dt = dL + dC * k_l, m_dt = dL + dC * k_m, s_dt = dL + dC * k_s;
    const L = L0 * (1 - t) + t * L1, C = t * C1;
    const l_ = L + C * k_l, m_ = L + C * k_m, s_ = L + C * k_s;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const ldt = 3 * l_dt * l_ * l_, mdt = 3 * m_dt * m_ * m_, sdt = 3 * s_dt * s_ * s_;
    const ldt2 = 6 * l_dt * l_dt * l_, mdt2 = 6 * m_dt * m_dt * m_, sdt2 = 6 * s_dt * s_dt * s_;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
    const r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
    const r2 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 + 0.2309699292 * sdt2;
    const u_r = r1 / (r1 * r1 - 0.5 * r * r2); let t_r = -r * u_r;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
    const g1 = -1.2684380046 * ldt + 2.6097574011 * mdt - 0.3413193965 * sdt;
    const g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 - 0.3413193965 * sdt2;
    const u_g = g1 / (g1 * g1 - 0.5 * g * g2); let t_g = -g * u_g;
    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s - 1;
    const b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.7076147010 * sdt;
    const b2 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 + 1.7076147010 * sdt2;
    const u_b = b1 / (b1 * b1 - 0.5 * bb * b2); let t_b = -bb * u_b;
    t_r = u_r >= 0 ? t_r : 1e5;
    t_g = u_g >= 0 ? t_g : 1e5;
    t_b = u_b >= 0 ? t_b : 1e5;
    t += Math.min(t_r, t_g, t_b);
  }
  return t;
}
function getSTMax(a, b, cusp) {
  if (!cusp) cusp = findCusp(a, b);
  return [cusp[1] / cusp[0], cusp[1] / (1 - cusp[0])];
}
function getSMid(a, b) {
  return 0.11516993 + 1 / (
    +7.44778970 + 4.15901240 * b
    + a * (-2.19557347 + 1.75198401 * b
    + a * (-2.13704948 - 10.02301043 * b
    + a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a))));
}
function getTMid(a, b) {
  return 0.11239642 + 1 / (
    +1.61320320 - 0.68124379 * b
    + a * (+0.40370612 + 0.90148123 * b
    + a * (-0.27087943 + 0.61223990 * b
    + a * (+0.00299215 - 0.45399568 * b - 0.14661872 * a))));
}
function getCs(L, a, b) {
  const cusp = findCusp(a, b);
  const cMax = findGamutIntersection(a, b, L, 1, L, cusp);
  const stMax = getSTMax(a, b, cusp);
  const k = cMax / Math.min(L * stMax[0], (1 - L) * stMax[1]);
  const cA = L * getSMid(a, b), cB = (1 - L) * getTMid(a, b);
  const cMid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / (cA * cA * cA * cA) + 1 / (cB * cB * cB * cB))));
  const c0a = L * 0.4, c0b = (1 - L) * 0.8;
  const c0 = Math.sqrt(1 / (1 / (c0a * c0a) + 1 / (c0b * c0b)));
  return [c0, cMid, cMax];
}

const clamp255 = (v) => Math.round(Math.min(255, Math.max(0, v)));

// okhslToRgb(hueDeg, s, l) — OKHSL (hue °, saturation 0..1, lightness 0..1) → [r,g,b] 0..255 ints.
export function okhslToRgb(hueDeg, s, l) {
  if (l >= 1) return [255, 255, 255];
  if (l <= 0) return [0, 0, 0];
  const h = ((((hueDeg % 360) + 360) % 360)) / 360;
  const a = Math.cos(2 * Math.PI * h), b = Math.sin(2 * Math.PI * h);
  const L = toeInv(l);
  const [c0, cMid, cMax] = getCs(L, a, b);
  let C, t, k0, k1, k2;
  if (s < 0.8) {
    t = 1.25 * s; k0 = 0; k1 = 0.8 * c0; k2 = 1 - k1 / cMid;
  } else {
    t = 5 * (s - 0.8); k0 = cMid; k1 = (0.2 * cMid * cMid * 1.25 * 1.25) / c0; k2 = 1 - k1 / (cMax - cMid);
  }
  C = k0 + (t * k1) / (1 - k2 * t);
  const rgb = oklabToLinearSrgb(L, C * a, C * b);
  return [clamp255(255 * srgbTransfer(rgb[0])), clamp255(255 * srgbTransfer(rgb[1])), clamp255(255 * srgbTransfer(rgb[2]))];
}

// oklchToRgb(L, C, H) — OKLCH (L 0..1, C ≥0, H degrees) → [r,g,b] 0..255 ints, gamut-clamped.
// Used to place/seed RETAINED key colors stored as OKLCH (less lossy than an 8-bit hex source).
export function oklchToRgb(L, C, H) {
  if (L >= 1) return [255, 255, 255];
  if (L <= 0) return [0, 0, 0];
  const h = (((H % 360) + 360) % 360) * Math.PI / 180;
  const rgb = oklabToLinearSrgb(L, C * Math.cos(h), C * Math.sin(h));
  return [clamp255(255 * srgbTransfer(rgb[0])), clamp255(255 * srgbTransfer(rgb[1])), clamp255(255 * srgbTransfer(rgb[2]))];
}

// rgbToOkhsl([r,g,b]) — inverse. Returns { h: degrees, s: 0..1, l: 0..1 }.
export function rgbToOkhsl([r, g, b]) {
  const lab = linearSrgbToOklab(srgbTransferInv(r / 255), srgbTransferInv(g / 255), srgbTransferInv(b / 255));
  const C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
  const a = C === 0 ? 1 : lab[1] / C, bb = C === 0 ? 0 : lab[2] / C;
  const L = lab[0];
  const h = 0.5 + (0.5 * Math.atan2(-lab[2], -lab[1])) / Math.PI;
  const [c0, cMid, cMax] = getCs(L, a, bb);
  let s;
  if (C < cMid) {
    const k1 = 0.8 * c0, k2 = 1 - k1 / cMid;
    s = (C / (k1 + k2 * C)) * 0.8;
  } else {
    const k0 = cMid, k1 = (0.2 * cMid * cMid * 1.25 * 1.25) / c0, k2 = 1 - k1 / (cMax - cMid);
    s = 0.8 + 0.2 * ((C - k0) / (k1 + k2 * (C - k0)));
  }
  return { h: ((h * 360) % 360 + 360) % 360, s, l: toe(L) };
}
