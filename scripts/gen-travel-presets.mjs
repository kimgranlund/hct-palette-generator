// gen-travel-presets.mjs — GENERATE src/ui/travel-presets.js from docs/spec/colors/travel-palettes.md
// (+ the hand-authored travel-palettes.html for the STORY).
//
// Parses the 48 curated "Travel Palettes" (12 volumes × 4) and emits each as a read-only gallery
// preset: a parametric config the generator opens as an editable copy. Run via `npm run gen:travel-presets`.
//
// NAMING — per docs/spec/colors/color-model-funciton.md:
//   sampled 6 colors → {tier}-{rank}: primary-base/muted, secondary-base/muted, accent-base/muted
//   status 3 colors  → danger/warning/success
//
// 1/3/2 → 2-2-2 MAPPING: dominant → primary-base; supporting nearest the ground → primary-muted;
//   the other two supporting (by chroma) → secondary-base/muted; the two accents → accent-base/muted.
//
// STORY — the .html bundle carries the narrative the .md lacks (title, per-color descriptions, the
// 60/30/10 groups, refuses) + the per-VOLUME intro, for ALL 48 sets. It ships as two globals:
// PALETTE_DATA_EARLY (Vols I–III, clean JSON) + PALETTE_DATA (Vols IV–XII, a JS object literal with
// unquoted keys + comments). Both are gzipped in a bundler manifest — decompressed + parsed at gen time.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { cam16FromRgb, lstarFromRgb } from "../src/engine/hct.js";
import { toneAt, DEFAULT_CONTROLS } from "../src/engine/tonal.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../docs/spec/colors/travel-palettes.md");
const HTMLSRC = resolve(here, "../docs/spec/colors/travel-palettes.html");
const OUT = resolve(here, "../src/ui/travel-presets.js");
const HIER_ROLE = { d: "dominant", s: "supporting", a: "accent" };

// "#RRGGBB" → [r,g,b] ints.
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

// extractObj — read the brace-balanced `<marker> { … }` object out of the bundle (string-aware).
// EARLY volumes are clean JSON; LATE volumes are a JS object literal (UNQUOTED keys + comments), so
// JSON.parse fails — fall back to eval (build-time, trusted, our own data). Retries the next
// occurrence if both fail (the marker can appear in a comment/code first).
function extractObj(src, marker) {
  for (let from = 0; ; ) {
    const at = src.indexOf(marker, from);
    if (at < 0) return null;
    const i = src.indexOf("{", at);
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = i; j < src.length; j++) {
      const ch = src[j];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
      else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) { end = j; break; }
    }
    if (end > 0) {
      const text = src.slice(i, end + 1);
      try { return JSON.parse(text); } catch { /* not JSON */ }
      try { return (0, eval)("(" + text + ")"); } catch { /* not a parseable literal — retry */ } // eslint-disable-line no-eval
    }
    from = at + marker.length;
  }
}

// loadStory — decompress the .html bundle and read BOTH data globals (EARLY JSON + LATE JS literal)
// → all 12 volumes / 48 sets. Returns { volumes:{vol:{title,intro}}, sets:[{vol, title, kicker,
// narrative, refuses, groups, byHex}] } in volume order; byHex maps a source HEX → {name,note,hier}.
function loadStory() {
  let html;
  try { html = readFileSync(HTMLSRC, "utf8"); }
  catch { console.warn("⚠ travel-palettes.html not found — presets get colors + vol but no story"); return { volumes: {}, sets: [] }; }
  const man = JSON.parse(html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]);
  let all = "";
  for (const r of Object.values(man)) {
    if (!r.data) continue;
    let b = Buffer.from(r.data, "base64");
    if (r.compressed) { try { b = gunzipSync(b); } catch { /* not gzip */ } }
    all += b.toString("utf8") + "\n";
  }
  // EARLY (I–III, clean JSON) + LATE (IV–XII, JS literal). Merge in volume order.
  const data = { ...(extractObj(all, "PALETTE_DATA_EARLY = {") || {}), ...(extractObj(all, "PALETTE_DATA = {") || {}) };
  const volumes = {}, sets = [];
  {
    for (const [vol, v] of Object.entries(data)) {
      volumes[vol] = { title: clean(v.h1 || v.title), intro: clean((v.preface || []).join(" ")) };
      for (const p of v.palettes || []) {
        const hy = p.hierarchy || {};
        sets.push({
          vol,
          title: clean(p.title),
          kicker: clean(p.kicker),
          narrative: clean(p.source),
          refuses: clean(p.refuses),
          groups: ["d", "s", "a"].filter((k) => hy[k]).map((k) => ({ hier: k, pct: hy[k].pct, note: clean(hy[k].text) })),
          byHex: Object.fromEntries((p.swatches || []).map((s) => [String(s.hex).toUpperCase(), { name: clean(s.name), note: clean(s.note), hier: s.hier }])),
        });
      }
    }
  }
  return { volumes, sets };
}

// The prime role is stop 550; with default skew/lift its tone is ~46 L*, which would flatten every
// palette's prime. Anchor each prime to its SOURCE lightness via `lift` (centred tone bump), clamped.
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
    // the curated color's STORY (from the HTML): evocative name, one-line description, source role.
    ...(sw ? { colorName: sw.name, description: sw.note, colorRole: HIER_ROLE[sw.hier] || sw.hier } : {}),
    on: true,
  };
};

// ── parse one "### " entry: volume + title + the core-6 table + the system-3 table ──────────────
function parseEntry(block) {
  const heading = block.split("\n", 1)[0].trim(); // "I·04 — 37° N · November · 05:40 · MV passing Kea, …"
  const dash = heading.indexOf(" — ");
  const idx = dash >= 0 ? heading.slice(0, dash).trim() : heading; // "I·04"
  const vol = idx.split(/[·.]/)[0].trim(); // "I"
  const rest = dash >= 0 ? heading.slice(dash + 3).trim() : "";
  const parts = rest.split(" · ");
  const place = parts.length > 3 ? parts.slice(3).join(" · ") : rest;
  const name = place || idx;
  const core = [...block.matchAll(/^\|\s*(Dominant|Supporting|Accent)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm)]
    .map((m) => ({ role: m[1], desc: m[2].trim(), oklch: m[3].trim().split(/\s+/).map(Number), hex: m[4].trim().toUpperCase() }));
  const system = Object.fromEntries(
    [...block.matchAll(/^\|\s*system-(red|yellow|green)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm)]
      .map((m) => [m[1], { oklch: m[2].trim().split(/\s+/).map(Number), hex: m[3].trim().toUpperCase() }]),
  );
  return { idx, vol, name, core, system };
}

// ── the deterministic 1/3/2 → 2-2-2 mapping ──────────────────────────────────────────────────────
function mapColors({ core, system }, story) {
  const bh = (story && story.byHex) || {};
  const dom = core.find((r) => r.role === "Dominant");
  const sup = core.filter((r) => r.role === "Supporting");
  const acc = core.filter((r) => r.role === "Accent");
  const C = (r) => r.oklch[1];
  const oklab = (r) => { const [L, c, H] = r.oklch; const h = (H * Math.PI) / 180; return [L, c * Math.cos(h), c * Math.sin(h)]; };
  const dE = (a, b) => { const A = oklab(a), B = oklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const byNearGround = [...sup].sort((a, b) => dE(a, dom) - dE(b, dom));
  const primaryMuted = byNearGround[0];
  const secondary = byNearGround.slice(1).sort((a, b) => C(b) - C(a));
  return [
    palette("primary-base", dom.hex, dom.oklch, bh[dom.hex]),
    palette("primary-muted", primaryMuted.hex, primaryMuted.oklch, bh[primaryMuted.hex]),
    palette("secondary-base", secondary[0].hex, secondary[0].oklch, bh[secondary[0].hex]),
    palette("secondary-muted", secondary[1].hex, secondary[1].oklch, bh[secondary[1].hex]),
    palette("accent-base", acc[0].hex, acc[0].oklch, bh[acc[0].hex]),
    palette("accent-muted", acc[1].hex, acc[1].oklch, bh[acc[1].hex]),
    palette("danger", system.red.hex, system.red.oklch),   // system colors aren't in the HTML story
    palette("warning", system.yellow.hex, system.yellow.oklch),
    palette("success", system.green.hex, system.green.oklch),
  ];
}

// ── build ─────────────────────────────────────────────────────────────────────────────────────
const md = readFileSync(SRC, "utf8");
const entries = md.split(/^### /m).slice(1).map(parseEntry);
const { volumes, sets } = loadStory(); // story zips with `entries` by index (Volumes I–III only)
entries.forEach((e, i) => {
  const dom = e.core.find((r) => r.role === "Dominant");
  if (sets[i] && dom && !sets[i].byHex[dom.hex]) console.warn(`⚠ entry ${i} (${e.name}): story/md order mismatch`);
});

const VIVID_MIDS = { damp: 70, dampCurve: 1.5, dampAmp: 55, dampBias: 0 };
const presets = entries.map((e, i) => {
  const st = sets[i];
  return {
    name: e.name,
    vol: e.vol, // volume the set belongs to — drives the gallery sub-groups
    ...(st ? { story: { title: st.title, kicker: st.kicker, narrative: st.narrative, refuses: st.refuses, groups: st.groups } } : {}),
    ...DEFAULT_CONTROLS, ...VIVID_MIDS,
    palettes: mapColors(e, st),
  };
});

const lines = presets.map((p) => "  " + JSON.stringify(p)).join(",\n");
const body =
  "// travel-presets.js — GENERATED by scripts/gen-travel-presets.mjs from\n" +
  "// docs/spec/colors/travel-palettes.md (+ travel-palettes.html for the story). DO NOT EDIT — run\n" +
  "// `npm run gen:travel-presets`. 48 curated Travel Palettes (12 volumes × 4) as read-only presets;\n" +
  "// each carries `vol` (its volume) and, for Volumes I–III, the captured `story` + per-color name/role.\n" +
  "export const TRAVEL_VOLUMES = " + JSON.stringify(volumes) + ";\n" +
  "export const TRAVEL_PRESETS = [\n" +
  lines +
  "\n];\n";

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
const withStory = presets.filter((p) => p.story).length;
console.log(`wrote ${OUT}  (${presets.length} presets × ${presets[0].palettes.length} palettes · ${withStory} with story · ${Object.keys(volumes).length} volume headers)`);
