// gen-categories.mjs — GENERATE the Palette Categories from docs/spec/colors/categories/*.json
//
// SUPERSEDES gen-travel-presets.mjs. Reads the 7 clean per-category JSON categories (architecture,
// cuisine, film, literature, music, nature, travel) — each 12 volumes × 4 palettes — and emits:
//
//   src/ui/categories/index.js     a SMALL, always-bundled index: one card per category
//                               ({slug, category, eyebrow, tagline, count, strip}) + a lazy loader
//                               (a static map of dynamic import()s → one code-split chunk per category).
//   src/ui/categories/<slug>.js    one LAZY module per category: VOLUMES (per-volume headers) + PRESETS
//                               (the 48 sets as read-only gallery presets the generator opens as copies).
//
// NAMING — per docs/spec/colors/color-model-funciton.md:
//   sampled 6 colors → {tier}-{rank}: primary-base/muted, secondary-base/muted, accent-base/muted
//   status 3 colors  → danger/warning/success  (NOT in the category JSON — a sensible default set is appended)
//
// 1/3/2 → 2-2-2 MAPPING: dominant → primary-base; supporting nearest the ground → primary-muted;
//   the other two supporting (by chroma) → secondary-base/muted; the two accents → accent-base/muted.
//
// Run via `npm run gen:categories`.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";
import { cam16FromRgb, lstarFromRgb } from "../src/engine/hct.js";
import { toneAt, DEFAULT_CONTROLS } from "../src/engine/tonal.js";
import { deriveNeutral } from "../src/engine/derive.mjs";
import { seedFromKeyColor } from "../src/ui/model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SRCDIR = resolve(here, "../docs/spec/colors/categories");
const OUTDIR = resolve(here, "../src/ui/categories");
const HIER_ROLE = { d: "dominant", s: "supporting", a: "accent" };

// status colors aren't in the category JSON — a neutral, professional default set, shared by every preset.
const STATUS = {
  danger: { hex: "#B3261E", oklch: [0.52, 0.176, 27] },
  warning: { hex: "#A66A00", oklch: [0.62, 0.118, 73] },
  success: { hex: "#2E7D4F", oklch: [0.56, 0.115, 152] },
};

const hexToRgb = (hex) => {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
// strip the HTML the authored strings carry (<em>…</em>, &nbsp;, &amp;, numeric entities).
const clean = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
const oklchOf = (s) => String(s || "").trim().split(/\s+/).map(Number);

// tidyVolumeTitle — the source h1s lead with the redundant "Four palettes from …" count (the tile
// strip already shows the count). Strip that lead-in, capitalize, and drop the trailing period so a
// heading reads as the evocative phrase: "Four palettes from the great Russian novels, …" → "The
// great Russian novels, …". The first matching prefix wins (rules are ordered most- → least-specific).
const VOL_LEADINS = [
  [/^Four palettes from\s+/i, ""],
  [/^Four palettes,\s*/i, ""],
  [/^Four more\s+/i, "More "],
  [/^Four\s+/i, ""],
];
function tidyVolumeTitle(s) {
  let t = clean(s).replace(/\.$/, "");
  for (const [re, rep] of VOL_LEADINS) { if (re.test(t)) { t = t.replace(re, rep); break; } }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// The prime role is stop 550; anchor each prime to its SOURCE lightness via `lift` (centred tone bump).
const PRIME_TONE = toneAt(550, 0, 0, DEFAULT_CONTROLS);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const palette = (name, hex, oklch, sw) => {
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
    // retain the EXACT source color as the `dominant` key color, in OKLCH (less lossy than hex).
    keyColors: [{ role: "dominant", oklch: oklch.map((v) => Number(v)) }],
    // the curated color's STORY: evocative name, one-line description, source role.
    ...(sw ? { colorName: clean(sw.name), description: clean(sw.note), colorRole: HIER_ROLE[sw.hier] || sw.hier } : {}),
    on: true,
  };
};

// ── the deterministic 1/3/2 → 2-2-2 mapping over a palette's 6 swatches (hier d·s·s·s·a·a) ────────
function mapColors(swatches) {
  const sw = swatches.map((s) => ({ ...s, ok: oklchOf(s.oklch), hex: String(s.hex).toUpperCase() }));
  const dom = sw.find((s) => s.hier === "d");
  const sup = sw.filter((s) => s.hier === "s");
  const acc = sw.filter((s) => s.hier === "a");
  const C = (s) => s.ok[1];
  const oklab = (s) => { const [L, c, H] = s.ok; const h = (H * Math.PI) / 180; return [L, c * Math.cos(h), c * Math.sin(h)]; };
  const dE = (a, b) => { const A = oklab(a), B = oklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const byNearGround = [...sup].sort((a, b) => dE(a, dom) - dE(b, dom));
  const primaryMuted = byNearGround[0];
  const secondary = byNearGround.slice(1).sort((a, b) => C(b) - C(a));
  const p = (name, s) => palette(name, s.hex, s.ok, s);
  return [
    p("primary-base", dom),
    p("primary-muted", primaryMuted),
    p("secondary-base", secondary[0]),
    p("secondary-muted", secondary[1]),
    p("accent-base", acc[0]),
    p("accent-muted", acc[1]),
    palette("danger", STATUS.danger.hex, STATUS.danger.oklch),
    palette("warning", STATUS.warning.hex, STATUS.warning.oklch),
    palette("success", STATUS.success.hex, STATUS.success.oklch),
  ];
}

// the status palettes carry meaning, not character — excluded from the neutral's derivation context
// (same set the New-Palette modal's "Derive from" strip excludes by default).
const STATUS_NAMES = /^(danger|warning|success|error|critical|info|positive|negative)$/i;

// derive the NEUTRAL / environment palette from a preset's character palettes, using the established
// logic of the New-Palette modal's Environmental tab: the chroma-weighted circular-mean hue of the
// key colors + a clamped near-grey chroma (engine/derive.mjs `deriveNeutral`), seeded back into a
// parametric palette (`seedFromKeyColor`) and retaining the derived target as its dominant key color.
function deriveNeutralPalette(palettes) {
  const samples = palettes
    .filter((p) => !STATUS_NAMES.test(p.name) && p.keyColors && p.keyColors[0])
    .map((p) => p.keyColors[0].oklch.map(Number));
  const oklch = deriveNeutral(samples);
  const seed = seedFromKeyColor(oklch) || { hue: 0, chroma: 0 };
  return {
    name: "neutral",
    hue: seed.hue,
    chroma: seed.chroma,
    skew: 0,
    lift: 0,
    hueShift: 0,
    hueSameDir: false,
    keyColors: [{ role: "dominant", oklch: oklch.map((v) => Number(v)) }],
    on: true,
  };
}

const VIVID_MIDS = { damp: 70, dampCurve: 1.5, dampAmp: 55, dampBias: 0 };

// ── build one category → { volumes, presets, strip } ─────────────────────────────────────────────
function buildCategory(doc) {
  const volumes = {}, presets = [], strip = [];
  for (const v of doc.volumes || []) {
    const vol = v.roman;
    volumes[vol] = { title: tidyVolumeTitle(v.h1 || v.title), intro: clean((v.preface || []).join(" ")) };
    (v.palettes || []).forEach((p, pi) => {
      const hy = p.hierarchy || {};
      const dom = (p.swatches || []).find((s) => s.hier === "d");
      if (pi === 0 && dom) strip.push(String(dom.hex).toUpperCase()); // one dominant per volume → the card strip
      presets.push({
        // the tile/set name is the KICKER (a clean structured label, e.g. "59° N · January · Lake
        // Baikal corridor"); the long evocative `title` lives in story.title (Story tab + per-color line).
        name: clean(p.kicker) || clean(p.title) || `${doc.slug} ${vol}·${pi + 1}`,
        vol,
        story: {
          title: clean(p.title),
          kicker: clean(p.kicker),
          narrative: clean(p.source),
          refuses: clean(p.refuses),
          groups: ["d", "s", "a"].filter((k) => hy[k]).map((k) => ({ hier: k, pct: hy[k].pct, note: clean(hy[k].text) })),
        },
        ...DEFAULT_CONTROLS, ...VIVID_MIDS,
        // neutral first (derived from the character palettes' key colors), then the named families.
        palettes: (() => { const pals = mapColors(p.swatches || []); return [deriveNeutralPalette(pals), ...pals]; })(),
      });
    });
  }
  return { volumes, presets, strip };
}

// ── emit ──────────────────────────────────────────────────────────────────────────────────────
const files = readdirSync(SRCDIR).filter((f) => f.endsWith(".json")).sort();
mkdirSync(OUTDIR, { recursive: true });
const index = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(resolve(SRCDIR, f), "utf8"));
  const slug = doc.slug || basename(f, ".json");
  const { volumes, presets, strip } = buildCategory(doc);
  const lines = presets.map((p) => "  " + JSON.stringify(p)).join(",\n");
  const body =
    `// categories/${slug}.js — GENERATED by scripts/gen-categories.mjs from docs/spec/colors/categories/${f}.\n` +
    `// DO NOT EDIT — run \`npm run gen:categories\`. ${presets.length} curated palettes (12 volumes × 4) as\n` +
    `// read-only presets; each carries its \`vol\` + captured \`story\` + per-color name/role. Lazy-loaded.\n` +
    `export const VOLUMES = ${JSON.stringify(volumes)};\n` +
    `export const PRESETS = [\n${lines}\n];\n`;
  writeFileSync(resolve(OUTDIR, `${slug}.js`), body);
  index.push({ slug, category: clean(doc.category), eyebrow: clean(doc.eyebrow), tagline: clean(doc.tagline), count: presets.length, strip });
  console.log(`  categories/${slug}.js  (${presets.length} palettes · ${Object.keys(volumes).length} volumes)`);
}

// the index: a small, always-bundled file (cards + a static lazy-loader map for per-category code-splitting).
const cards = index.map((c) => "  " + JSON.stringify(c)).join(",\n");
const loaders = index.map((c) => `  ${JSON.stringify(c.slug)}: () => import("./${c.slug}.js"),`).join("\n");
const idx =
  "// categories/index.js — GENERATED by scripts/gen-categories.mjs. DO NOT EDIT — run `npm run gen:categories`.\n" +
  "// The Palette Categories hub index: one card per category (always bundled) + a lazy loader that\n" +
  "// code-splits each category's PRESETS/VOLUMES into its own chunk, loaded on demand when opened.\n" +
  "export const CATEGORY_INDEX = [\n" + cards + "\n];\n\n" +
  "const LOADERS = {\n" + loaders + "\n};\n" +
  "// loadCategory(slug) → Promise<{ VOLUMES, PRESETS }>  (null for an unknown slug)\n" +
  "export const loadCategory = (slug) => (LOADERS[slug] ? LOADERS[slug]() : Promise.resolve(null));\n";
writeFileSync(resolve(OUTDIR, "index.js"), idx);
console.log(`wrote ${OUTDIR}/index.js  (${index.length} categories · ${index.reduce((a, c) => a + c.count, 0)} palettes total)`);
