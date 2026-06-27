// model.mjs — the PURE, importable core of the HCT Palette Generator UI.
//
// No DOM, no storage, no globals. It composes the six validated capability
// modules into:
//
//   defaultDocument()      -> a State (8 default palettes + DEFAULT_CONTROLS)
//   projectView(document)  -> the document->view projection the whole right
//                             side of the app renders from (no stored derived
//                             state; recompute on every edit).
//
// The document is the single source of truth. Every value on the right of the
// app is projectView(document) — recomputed, never persisted.

import {
  hctToRgb,
  lstarFromRgb,
  cam16FromRgb,
  peakC,
} from "../engine/hct.js";
import { oklchToRgb } from "../engine/okhsl.js";
import {
  paletteStops,
  effHue,
  STOPS,
  EXPORT_STOPS,
  DEFAULT_CONTROLS,
} from "../engine/tonal.js";
import { semanticRoles, refKey, applyRoleOverrides, applyOnColorContrast, applyAccentRef } from "../engine/semantic.js";
import {
  exportCSS,
  exportOKLCH,
  exportJSON,
  exportDTCG,
  exportUI3,
  exportTailwind,
  exportShadcn,
  SCRIM_BASES,
  SCRIM_STEPS,
} from "../engine/exports.js";

// Re-export the scrim model so the UI (app.js) can build the Mapping tab's re-point targets from the
// SAME source of truth as the exporters — no second, drift-prone hardcoded scrim-step list.
export { SCRIM_BASES, SCRIM_STEPS };

// The eight seed palettes (data/role-table.json `defaults`). Inlined so the
// pure core has no file I/O and runs identically in node and the browser.
const DEFAULT_PALETTES = [
  { name: "Neutral", hue: 267, chroma: 29, skew: -20, lift: 0, hueShift: 0, hueSameDir: false, on: true },
  { name: "Primary", hue: 267, chroma: 95, skew: -20, lift: 0, hueShift: 0, hueSameDir: false, on: true },
  { name: "Secondary", hue: 165, chroma: 100, skew: 0, lift: 0, hueShift: 0, hueSameDir: false, on: true },
  { name: "Tertiary", hue: 315, chroma: 33, skew: -20, lift: 0, hueShift: 0, hueSameDir: false, on: true },
  { name: "Info", hue: 235, chroma: 40, skew: -20, lift: 0, hueShift: 0, hueSameDir: false, on: true },
  { name: "Success", hue: 145, chroma: 55, skew: -20, lift: -5, hueShift: 0, hueSameDir: false, on: true },
  { name: "Warning", hue: 70, chroma: 100, skew: 40, lift: 15, hueShift: 0, hueSameDir: false, on: true },
  { name: "Danger", hue: 27, chroma: 55, skew: -20, lift: -5, hueShift: 0, hueSameDir: false, on: true },
];

// configFromVariables — a best-effort PARAMETRIC seed from a Figma file's raw-colors variables,
// for the case where a project has variables but NO saved config (read-variables -> {family/key: hex}).
// The variables are concrete colors, not params — you cannot reverse-derive a full ramp — so we read
// each family's 500 base, recover its CAM16 hue + chroma, and seed a palette at default skew/lift.
// The user then refines the controls and re-applies. Returns a config {name, palettes[]} or null.
export function configFromVariables(liveVars) {
  if (!liveVars || typeof liveVars !== "object") return null;
  const fam = new Map(); // family -> { "500": "#hex", "050": ..., ... }  (raw stop keys are pad3)
  for (const name of Object.keys(liveVars)) {
    const slash = name.indexOf("/");
    if (slash < 0) continue;
    const family = name.slice(0, slash);
    if (!fam.has(family)) fam.set(family, {});
    fam.get(family)[name.slice(slash + 1)] = liveVars[name];
  }
  const palettes = [];
  for (const [family, stops] of fam) {
    // prefer the 500 base; fall back to a near-mid solid if 500 is somehow absent.
    const baseHex = stops["500"] || stops["450"] || stops["550"] || stops["400"];
    if (!baseHex || !/^#?[0-9a-f]{6}/i.test(baseHex)) continue; // need a well-formed solid hex
    const { hue, chroma } = cam16FromRgb(hexToRgb(baseHex));
    palettes.push({
      name: family, hue: Math.round(hue), chroma: Math.round(Math.min(100, chroma)),
      skew: 0, lift: 0, hueShift: 0, hueSameDir: false, on: true,
    });
  }
  if (!palettes.length) return null;
  return { name: "From Figma", palettes };
}

// slug — palette name -> token namespace (mirrors exports.js / semantic keying).
export function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// defaultDocument — a fresh State: deep-cloned default palettes + the tonal
// control defaults + a UI selection cursor. Theme is UI-only; carried so a
// hydrated doc round-trips, but never read by the exporters (AC-U3).
export function defaultDocument() {
  return {
    name: "Default",
    palettes: DEFAULT_PALETTES.map((p) => ({ ...p })),
    curve: DEFAULT_CONTROLS.curve,
    tension: DEFAULT_CONTROLS.tension,
    lmin: DEFAULT_CONTROLS.lmin,
    lmax: DEFAULT_CONTROLS.lmax,
    damp: DEFAULT_CONTROLS.damp,
    dampCurve: DEFAULT_CONTROLS.dampCurve,
    dampAmp: DEFAULT_CONTROLS.dampAmp,
    dampBias: DEFAULT_CONTROLS.dampBias,
    hueSpace: DEFAULT_CONTROLS.hueSpace,
    relChroma: DEFAULT_CONTROLS.relChroma,
    chromaFloor: DEFAULT_CONTROLS.chromaFloor,
    toneMode: DEFAULT_CONTROLS.toneMode,
    vibrancy: DEFAULT_CONTROLS.vibrancy,
    onColorMode: DEFAULT_CONTROLS.onColorMode,
    accentRef: DEFAULT_CONTROLS.accentRef,
    theme: "auto",
    selected: 0,
    roleOverrides: {}, // per-doc semantic-mapping re-points (empty = canonical role table)
  };
}

// controlsOf — the tonal-controls slice of a document, defaulting any missing.
function controlsOf(doc) {
  return {
    curve: doc.curve ?? DEFAULT_CONTROLS.curve,
    tension: doc.tension ?? DEFAULT_CONTROLS.tension,
    lmin: doc.lmin ?? DEFAULT_CONTROLS.lmin,
    lmax: doc.lmax ?? DEFAULT_CONTROLS.lmax,
    damp: doc.damp ?? DEFAULT_CONTROLS.damp,
    dampCurve: doc.dampCurve ?? DEFAULT_CONTROLS.dampCurve,
    dampAmp: doc.dampAmp ?? DEFAULT_CONTROLS.dampAmp,
    dampBias: doc.dampBias ?? DEFAULT_CONTROLS.dampBias,
    hueSpace: doc.hueSpace ?? DEFAULT_CONTROLS.hueSpace,
    relChroma: doc.relChroma ?? DEFAULT_CONTROLS.relChroma,
    chromaFloor: doc.chromaFloor ?? DEFAULT_CONTROLS.chromaFloor,
    toneMode: doc.toneMode ?? DEFAULT_CONTROLS.toneMode,
    vibrancy: doc.vibrancy ?? DEFAULT_CONTROLS.vibrancy,
    onColorMode: doc.onColorMode ?? DEFAULT_CONTROLS.onColorMode,
    accentRef: doc.accentRef ?? DEFAULT_CONTROLS.accentRef,
  };
}

// stateOf — the exporter-shaped State slice of a document (palettes + resolved
// controls). The one place the State shape is assembled; projectView, the exporters,
// and figmaBundle all go through it so a new control is added in exactly one place.
function stateOf(doc) {
  const c = controlsOf(doc);
  return {
    palettes: doc.palettes ?? [],
    roleOverrides: doc.roleOverrides ?? {}, // threaded to the exporters so re-points reach the output
    curve: c.curve,
    tension: c.tension,
    lmin: c.lmin,
    lmax: c.lmax,
    damp: c.damp,
    dampCurve: c.dampCurve,
    dampAmp: c.dampAmp,
    dampBias: c.dampBias,
    hueSpace: c.hueSpace,
    relChroma: c.relChroma,
    chromaFloor: c.chromaFloor,
    toneMode: c.toneMode,
    vibrancy: c.vibrancy,
    onColorMode: c.onColorMode,
    accentRef: c.accentRef,
  };
}

// figmaBundle — the DTCG export with raw-collection aliasing ON ("Color Primitives"): the
// exact shape the Figma plugin's code.js turns into a "Color Primitives" collection + a
// "Color Modes" collection (Light/Dark modes) aliased to it. Each semantic leaf carries
// com.figma.aliasData.targetVariableName/targetVariableSetName so the plugin can build the cascade.
export function figmaBundle(doc) {
  return exportDTCG(stateOf(doc), { rawColl: "Color Primitives" });
}

// WCAG relative-luminance contrast ratio between two [r,g,b] int triples.
function relLum(rgb) {
  const ch = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// hexToRgb — "#RRGGBB" -> [r,g,b] (ignores any alpha bytes).
function hexToRgb(hex) {
  const s = hex.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

// rampByStop — index a palette's stop list by stop number for ref resolution.
function rampByStop(ramp) {
  const m = new Map();
  for (const s of ramp) m.set(s.stop, s);
  return m;
}

// keyCss — an OKLCH key color [L,C,H] → a CSS oklch() string (lossless; used for swatches + export).
export function keyCss(oklch) {
  const r = (x, d) => Number(x.toFixed(d));
  return `oklch(${r(oklch[0], 4)} ${r(oklch[1], 4)} ${r(oklch[2], 2)})`;
}

// placeKeyColors — locate each retained key color (stored as OKLCH) on the generated ramp
// through the PERCEPTUAL LENS: its L* picks the nearest stop, and `drift` is the CAM16
// distance to that stop (≈0 = lands on it; larger = genuinely off-ramp, kept as an exact
// reference). Pure: oklchToRgb → lstarFromRgb (tone) + cam16FromRgb (hue/chroma).
function placeKeyColors(keyColors, fullStops) {
  if (!Array.isArray(keyColors) || !keyColors.length) return [];
  const RAD = Math.PI / 180;
  const ab = (rgb) => { const c = cam16FromRgb(rgb); return [c.chroma * Math.cos(c.hue * RAD), c.chroma * Math.sin(c.hue * RAD)]; };
  return keyColors.map((kc) => {
    const rgb = oklchToRgb(kc.oklch[0], kc.oklch[1], kc.oklch[2]);
    const tone = lstarFromRgb(rgb);
    let near = fullStops[0], best = Infinity;
    for (const s of fullStops) { const d = Math.abs(s.tone - tone); if (d < best) { best = d; near = s; } }
    const [ka, kb] = ab(rgb), [sa, sb] = ab(near.rgb);
    const dL = tone - near.tone;
    const drift = Math.sqrt(dL * dL + (ka - sa) ** 2 + (kb - sb) ** 2);
    return { role: kc.role, oklch: kc.oklch, css: keyCss(kc.oklch), name: kc.name || null, nearStop: near.stop, drift: Math.round(drift * 10) / 10 };
  });
}

// seedFromKeyColor — recover a parametric palette seed from a key color (OKLCH): its CAM16
// hue + chroma (the same inversion configFromVariables uses on a 500 base) plus its tone,
// so the inspector's "Seed from key color" can align the generated family to the brand.
export function seedFromKeyColor(oklch) {
  if (!Array.isArray(oklch) || oklch.length !== 3) return null;
  const rgb = oklchToRgb(oklch[0], oklch[1], oklch[2]);
  const { hue, chroma } = cam16FromRgb(rgb);
  return { hue: Math.round(hue), chroma: Math.round(Math.min(100, chroma)), tone: Math.round(lstarFromRgb(rgb)) };
}

// rgbToOklchArr — [r,g,b] → [L,C,H] (for capturing a manual hex/identity color as OKLCH).
export function rgbToOklchArr(rgb) {
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

// hexToOklch — "#RRGGBB" → [L,C,H] (capture a palette's identity / a pasted brand hex as OKLCH).
export function hexToOklch(hex) {
  return rgbToOklchArr(hexToRgb(String(hex)));
}

// resolveRoleHex — a role ref ("550" solid | "500-200" scrim) -> a display hex
// for the given mode side, resolved against this palette's own ramp.
function resolveRoleHex(ref, byStop) {
  const str = String(ref);
  const dash = str.indexOf("-");
  if (dash === -1) {
    const hit = byStop.get(Number(str));
    return hit ? hit.hex : "#000000";
  }
  // scrim "{base}-{step}": the base stop's solid color at alpha% = step/10
  // (e.g. "500-200" = the 500 color at 20%). base is 500 for the current ramp.
  const base = Number(str.slice(0, dash));
  const step = Number(str.slice(dash + 1));
  const hit = byStop.get(base);
  if (!hit) return "#00000000";
  const a = Math.round((step / 1000) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return hit.hex + a;
}

// projectView — the document -> view projection. Pure: same doc, same view.
// Composes paletteStops + semanticRoles + the five exporters. The app renders
// EVERYTHING on the right from this; nothing here is stored back on the doc.
export function projectView(doc) {
  const controls = controlsOf(doc);
  const allPalettes = doc.palettes ?? [];

  // Per-palette: the display ramp (19 STOPS), its 37 resolved roles, and the
  // L*xC plot points (applied chroma vs gamut ceiling along the tone line).
  const palettes = [];
  const plot = [];
  const contrast = [];

  for (const p of allPalettes) {
    // Resolve roles against the FULL EXPORT_STOPS ramp (25) so refs to the export-only
    // half-steps (75/125/175/825/875/925) resolve — they are absent from the 19 display STOPS,
    // and a miss used to fall back to #000000 (the black swatches in the Roles panel).
    const fullStops = paletteStops(
      { hue: p.hue, chroma: p.chroma, skew: p.skew, lift: p.lift, hueShift: p.hueShift, hueSameDir: p.hueSameDir, cuspPull: p.cuspPull },
      controls,
      EXPORT_STOPS,
    ).map((s) => ({
      stop: s.stop,
      hex: s.hex,
      rgb: s.rgb,
      chroma: s.chroma,
      maxc: s.maxc,
      inGamut: s.inGamut,
      tone: s.tone,
    }));

    const byStop = rampByStop(fullStops);                          // 25 stops — every role ref resolves
    const ramp = fullStops.filter((s) => STOPS.includes(s.stop));  // 19 display stops for the canvas
    const n = slug(p.name);
    // on-color policy: in "contrast" mode flip the accent on-colors to the better-contrasting end
    // (vs the resolved accent fill) BEFORE per-doc overrides, so an explicit override still wins.
    const lumOf = (ref) => { const hit = byStop.get(Number(ref)); return hit ? relLum(hit.rgb) : 0; };
    // accent ref ("single" → prime accent 500/500) then on-color policy — both resolution-layer, BEFORE
    // per-doc overrides so an explicit override still wins.
    const baseRoles = applyOnColorContrast(applyAccentRef(semanticRoles(n), controls.accentRef), n, lumOf, controls.onColorMode);
    const roles = applyRoleOverrides(baseRoles, doc.roleOverrides).map((r) => ({
      key: r.key,
      suffix: r.suffix,
      name: n + r.suffix, // the semantic token name (e.g. "neutral", "neutral-dim")
      lightRef: r.light, // the raw stop/scrim ref this role points at, per mode
      darkRef: r.dark,
      lightRaw: n + "-" + refKey(r.light), // the raw token name (e.g. "neutral-550")
      darkRaw: n + "-" + refKey(r.dark),
      lightHex: resolveRoleHex(r.light, byStop),
      darkHex: resolveRoleHex(r.dark, byStop),
    }));

    // key = the palette's VIVID identity color: the cusp (peak-chroma) hue at the palette's intended
    // chroma, computed straight from hue+chroma so it stays vivid regardless of toneMode (the perceptual
    // ramp damps mid-stop chroma, so a ramp stop reads muted; this is what the gallery tile should show).
    const baseHue = effHue(p.hue, controls.hueSpace);
    const pk = peakC(baseHue);
    const keyHex = "#" + hctToRgb(baseHue, ((p.chroma ?? 0) / 100) * pk.c, pk.tone).rgb
      .map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

    // keyColors = retained brand colors placed on the ramp through the perceptual lens.
    const keyColors = placeKeyColors(p.keyColors, fullStops);

    // ramp = 19 core display stops; fullRamp = all 25 EXPORT_STOPS (the extended view).
    palettes.push({
      name: p.name, on: p.on !== false, key: keyHex, ramp, fullRamp: fullStops, roles, keyColors,
      // curated story (present for preset palettes): the color's evocative name, role, description.
      ...(p.colorName ? { colorName: p.colorName } : {}),
      ...(p.colorRole ? { colorRole: p.colorRole } : {}),
      ...(p.description ? { description: p.description } : {}),
    });

    plot.push({
      palette: p.name,
      points: ramp.map((s) => ({
        tone: s.tone,
        applied: s.chroma,
        ceiling: s.maxc,
      })),
    });

    // Contrast readout: the prime on-color (light end stop 50) over the prime
    // fill, plus the prime fill vs white and black — the D3 decision inputs.
    const prime = byStop.get(550) || ramp[Math.floor(ramp.length / 2)];
    const onPrime = byStop.get(50) || ramp[0];
    if (prime && onPrime) {
      const fill = prime.rgb;
      contrast.push({
        palette: p.name,
        onFill: round2(contrastRatio(onPrime.rgb, fill)),
        onWhite: round2(contrastRatio([255, 255, 255], fill)),
        onBlack: round2(contrastRatio([0, 0, 0], fill)),
      });
    }
  }

  // The five export formats, all over the SAME doc (enabled palettes only —
  // the exporters filter on !== false). theme is never read here (AC-U3).
  const state = stateOf(doc);
  // exportDTCG already splits the tokens into the three Figma mode files; compute it
  // once and surface those files INDIVIDUALLY so the UI can download Light_tokens.json
  // and Dark_tokens.json as separate files (one per Figma variable-collection mode).
  const dtcgObj = exportDTCG(state);
  const exports = {
    css: exportCSS(state),
    oklch: exportOKLCH(state),
    json: JSON.stringify(exportJSON(state), null, 2),
    dtcg: JSON.stringify(dtcgObj, null, 2),
    ui3: JSON.stringify(exportUI3(state), null, 2),
    tailwind: exportTailwind(state),
    shadcn: exportShadcn(state),
    figma: {
      light: JSON.stringify(dtcgObj["Light_tokens.json"], null, 2),
      dark: JSON.stringify(dtcgObj["Dark_tokens.json"], null, 2),
      raw: JSON.stringify(dtcgObj["palette.tokens.json"], null, 2),
    },
  };

  return { palettes, plot, exports, contrast, story: doc.story || null };
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// appThemeCSS — the FIXED app-theme stylesheet: exportCSS over the 8 default
// palettes (NOT the user's edited document, so the chrome stays stable while
// editing). This is the dogfooding hook — the same `exportCSS` the tool ships to
// users generates the `--{n}-{stop}` raw vars + 37 `--c-{n}{suffix}` semantic
// roles per palette that the app's own styles.css then consumes as design tokens.
// Injected once on boot as <style id="nonoun-color-tokens-theme"> (see app.js).
export function appThemeCSS() {
  const d = defaultDocument();
  const state = {
    palettes: d.palettes,
    curve: d.curve,
    tension: d.tension,
    lmin: d.lmin,
    lmax: d.lmax,
    damp: d.damp,
    dampCurve: d.dampCurve,
    dampAmp: d.dampAmp,
    dampBias: d.dampBias,
    hueSpace: d.hueSpace,
  };
  return exportCSS(state);
}

// tokenCount — how many CSS custom properties the document emits (for the
// app-footer "{tokens} tokens" readout). Counts only enabled palettes.
export function tokenCount(doc) {
  const enabled = (doc.palettes ?? []).filter((p) => p.on !== false).length;
  // per palette: 25 solids (EXPORT_STOPS) + scrims (SCRIM_BASES × SCRIM_STEPS) + 37 semantic --c-*.
  // Derived from the engine constants so it can't drift (the old hard-coded 3 * 7 was stale).
  return enabled * (EXPORT_STOPS.length + SCRIM_BASES.length * SCRIM_STEPS.length + 37);
}

// Re-exports the app needs from the core (so app.js imports one module).
export { hctToRgb, lstarFromRgb, hexToRgb, STOPS, EXPORT_STOPS, DEFAULT_CONTROLS };
