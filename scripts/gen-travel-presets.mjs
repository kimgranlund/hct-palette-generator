// gen-travel-presets.mjs — GENERATE src/ui/travel-presets.js from docs/spec/colors/travel-palettes.md.
//
// Parses the 48 curated "Travel Palettes" (12 volumes × 4) and emits each as a read-only gallery
// preset: a parametric config the generator opens as an editable copy. Run via `npm run gen:travel-presets`.
//
// NAMING — per docs/spec/colors/color-model-funciton.md (the source of truth):
//   sampled 6 colors → {tier}-{rank}: primary-base/muted, secondary-base/muted, accent-base/muted
//   status 3 colors  → danger/warning/success (the doc's functional-error/warning/success, mapped to
//                       the tool's existing semantic families per the owner's call)
//
// 1/3/2 → 2-2-2 MAPPING (the doc §5 "judgment call", made deterministic from its own rules of thumb;
// validated to reproduce the §6 worked example exactly):
//   • dominant                         → primary-base   (the ground)
//   • supporting nearest the ground in lightness → primary-muted (the ground's quiet partner, §4)
//   • the other two supporting, by chroma        → secondary-base (higher C) / secondary-muted (lower C)
//   • the two accents, in listed order           → accent-base / accent-muted
//
// Each color's hue+chroma is recovered from its HEX via CAM16 (the same approximate seed
// configFromVariables uses) — the curated color is a SEED; the tool re-derives an even ramp from it,
// so a ramp's 500 ≈ but ≠ the source hex. Skew/lift default to 0.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { cam16FromRgb, lstarFromRgb } from "../src/engine/hct.js";
import { toneAt, DEFAULT_CONTROLS } from "../src/engine/tonal.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../docs/spec/colors/travel-palettes.md");
const OUT = resolve(here, "../src/ui/travel-presets.js");

// "#RRGGBB" → [r,g,b] ints.
const hexToRgb = (hex) => {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
// The prime role is stop 550; with default skew/lift its tone is ~46 L*, which would flatten EVERY
// palette's prime to mid-dark — a light fog-cream and a dark kelp would BOTH render as L*46 grey. So
// anchor each palette's prime to its SOURCE lightness via `lift` (the centred tone bump), clamped to
// lift's ±40 domain, so the prime token (--c-{name}) ≈ the curated color. Hue+chroma come from CAM16;
// lightness comes from lift. (Stops away from 550 still span the full ramp — lift tapers to 0 at the ends.)
const PRIME_TONE = toneAt(550, 0, 0, DEFAULT_CONTROLS);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const palette = (name, hex, oklch) => {
  const rgb = hexToRgb(hex);
  const { hue, chroma } = cam16FromRgb(rgb);
  return {
    name,
    hue: Math.round(((hue % 360) + 360) % 360),
    chroma: Math.round(Math.min(100, Math.max(0, chroma))),
    skew: 0,
    lift: Math.round(clamp(lstarFromRgb(rgb) - PRIME_TONE, -40, 40)),
    hueShift: 0,
    hueSameDir: false,
    // Retain the EXACT source color as the `dominant` key color, in OKLCH (less lossy than the
    // 8-bit hex). The ramp re-derives an even scale from the seed; the key color keeps the
    // original verbatim, so the curated palette is represented accurately, not just approximated.
    keyColors: [{ role: "dominant", oklch: oklch.map((v) => Number(v)) }],
    on: true,
  };
};

// ── parse one "### " entry: title + the core-6 table + the system-3 table ──────────────────────
function parseEntry(block) {
  const heading = block.split("\n", 1)[0].trim(); // e.g. "I·04 — 37° N · November · 05:40 · MV passing Kea, …"
  const dash = heading.indexOf(" — ");
  const idx = dash >= 0 ? heading.slice(0, dash).trim() : heading; // "I·04"
  const rest = dash >= 0 ? heading.slice(dash + 3).trim() : "";
  const parts = rest.split(" · ");
  const place = parts.length > 3 ? parts.slice(3).join(" · ") : rest; // the place, after lat·month·time
  const name = place || idx; // the place itself is the set name (no "IV·01 ·" prefix); array order keeps vol order

  const core = [...block.matchAll(/^\|\s*(Dominant|Supporting|Accent)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm)]
    .map((m) => ({ role: m[1], desc: m[2].trim(), oklch: m[3].trim().split(/\s+/).map(Number), hex: m[4].trim().toUpperCase() }));
  const system = Object.fromEntries(
    [...block.matchAll(/^\|\s*system-(red|yellow|green)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm)]
      .map((m) => [m[1], { oklch: m[2].trim().split(/\s+/).map(Number), hex: m[3].trim().toUpperCase() }]),
  );
  return { idx, name, core, system };
}

// ── the deterministic 1/3/2 → 2-2-2 mapping (color-model-funciton.md §2–§5) ─────────────────────
function mapColors({ core, system }) {
  const dom = core.find((r) => r.role === "Dominant");
  const sup = core.filter((r) => r.role === "Supporting");
  const acc = core.filter((r) => r.role === "Accent");
  const C = (r) => r.oklch[1];
  // OKLab (L,a,b) from OKLCH, and a perceptual distance — the doc's "muted = similar lightness, lower
  // chroma / small hue step" is exactly small ΔE to the ground, so primary-muted = the closest supporting.
  const oklab = (r) => { const [L, c, H] = r.oklch; const h = (H * Math.PI) / 180; return [L, c * Math.cos(h), c * Math.sin(h)]; };
  const dE = (a, b) => { const A = oklab(a), B = oklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const byNearGround = [...sup].sort((a, b) => dE(a, dom) - dE(b, dom));
  const primaryMuted = byNearGround[0];
  const secondary = byNearGround.slice(1).sort((a, b) => C(b) - C(a)); // base = higher chroma, muted = lower
  return [
    palette("primary-base", dom.hex, dom.oklch),
    palette("primary-muted", primaryMuted.hex, primaryMuted.oklch),
    palette("secondary-base", secondary[0].hex, secondary[0].oklch),
    palette("secondary-muted", secondary[1].hex, secondary[1].oklch),
    palette("accent-base", acc[0].hex, acc[0].oklch),
    palette("accent-muted", acc[1].hex, acc[1].oklch),
    palette("danger", system.red.hex, system.red.oklch),
    palette("warning", system.yellow.hex, system.yellow.oklch),
    palette("success", system.green.hex, system.green.oklch),
  ];
}

// ── build ───────────────────────────────────────────────────────────────────────────────────────
const md = readFileSync(SRC, "utf8");
const entries = md.split(/^### /m).slice(1).map(parseEntry);
// Spread the full DEFAULT_CONTROLS into every preset. A config that OMITS them hydrates to the
// domain MINIMUMS (lmin 0, lmax 60, damp 0) — not the sensible defaults (5/100/80) — which caps the
// whole ramp dark and was a big part of why every preset rendered muddy. Carry them explicitly.
// Travel presets default to the "Vivid mids" damping (boosts mid-tone chroma toward the gamut) — more
// vibrant than the flat "Default" damping. Mirrors the DAMP_PRESETS "Vivid mids" entry in app.js.
const VIVID_MIDS = { damp: 70, dampCurve: 1.5, dampAmp: 55, dampBias: 0 };
const presets = entries.map((e) => ({ name: e.name, ...DEFAULT_CONTROLS, ...VIVID_MIDS, palettes: mapColors(e) }));

// One preset per line (compact JSON) — keeps the bundle small AND keeps git diffs readable
// (a change to one palette shows as a single changed line).
const lines = presets.map((p) => "  " + JSON.stringify(p)).join(",\n");
const body =
  "// travel-presets.js — GENERATED by scripts/gen-travel-presets.mjs from\n" +
  "// docs/spec/colors/travel-palettes.md. DO NOT EDIT — run `npm run gen:travel-presets`.\n" +
  "//\n" +
  "// 48 curated Travel Palettes as READ-ONLY gallery presets. Each is a parametric config (palette\n" +
  "// hue/chroma seeded from the source hex via CAM16; the tool re-derives even ramps). Naming per\n" +
  "// docs/spec/colors/color-model-funciton.md: {tier}-{rank} + danger/warning/success.\n" +
  "export const TRAVEL_PRESETS = [\n" +
  lines +
  "\n];\n";

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
console.log(`wrote ${OUT}  (${presets.length} presets × ${presets[0].palettes.length} palettes)`);
