// gen-preview.mjs — render docs/img/palette-preview.svg straight from the engine.
//
// The README hero is the tool's REAL output, not a mockup: it goes through the
// exact same projection the app renders from (defaultDocument -> projectView),
// so every swatch is the literal hex the generator emits for the 8 default
// palettes' display ramps (19 stops, 050 light .. 950 dark).
//
// Regenerate with `npm run gen:preview` whenever the engine/defaults change.
// It's a committed doc asset (not part of `npm run build`); SVG is text so it
// diffs cleanly in review.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defaultDocument, projectView } from "../src/ui/model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../docs/img/palette-preview.svg");

// ── The real projection ───────────────────────────────────────────────────────
// The hero deliberately showcases the PERCEPTUAL distribution (the headline feature), pinned here so
// the "perceptually-even" caption holds regardless of what DEFAULT_CONTROLS.toneMode happens to be.
const doc = defaultDocument();
doc.toneMode = "perceptual";
const view = projectView(doc);
const palettes = view.palettes.filter((p) => p.on); // enabled only, in doc order
const stops = palettes[0].ramp.map((s) => s.stop); // the 19 display stops

// ── Layout (px) ───────────────────────────────────────────────────────────────
const SW = 40; // swatch width
const SH = 34; // swatch (row) height
const LABEL_W = 92; // left name gutter
const PAD = 24; // outer padding
const HEADER_H = 16; // stop-number scale
const HEADER_GAP = 8;
const ROW_GAP = 6;
const FOOT_GAP = 12;
const FOOT_H = 16;

const cols = stops.length;
const rampW = cols * SW;
const rowsTop = PAD + HEADER_H + HEADER_GAP;
const rowsH = palettes.length * SH + (palettes.length - 1) * ROW_GAP;
const W = PAD + LABEL_W + rampW + PAD;
const H = rowsTop + rowsH + FOOT_GAP + FOOT_H + PAD;
const rampX = PAD + LABEL_W;

const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ── Build SVG ─────────────────────────────────────────────────────────────────
const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">`,
);
// Card background — explicit light surface so swatches read on either GitHub theme.
parts.push(
  `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="#ffffff" stroke="#e8eaed"/>`,
);

// Stop-number scale across the top of the ramp.
stops.forEach((stop, c) => {
  const x = rampX + c * SW + SW / 2;
  parts.push(
    `<text x="${x}" y="${PAD + HEADER_H - 4}" font-size="9" fill="#9aa0a6" text-anchor="middle">${stop}</text>`,
  );
});

// One row per palette: a rounded-clipped strip of butted swatches + a name label.
palettes.forEach((p, r) => {
  const y = rowsTop + r * (SH + ROW_GAP);
  const clip = `r${r}`;
  parts.push(
    `<clipPath id="${clip}"><rect x="${rampX}" y="${y}" width="${rampW}" height="${SH}" rx="6"/></clipPath>`,
  );
  parts.push(`<g clip-path="url(#${clip})">`);
  p.ramp.forEach((s, c) => {
    parts.push(
      `<rect x="${rampX + c * SW}" y="${y}" width="${SW}" height="${SH}" fill="${s.hex}"/>`,
    );
  });
  parts.push(`</g>`);
  // hairline frame so a near-white light end still reads as a swatch
  parts.push(
    `<rect x="${rampX}" y="${y}" width="${rampW}" height="${SH}" rx="6" fill="none" stroke="#00000014"/>`,
  );
  // palette name, right-aligned in the gutter, vertically centered
  parts.push(
    `<text x="${rampX - 12}" y="${y + SH / 2 + 4}" font-size="13" font-weight="600" fill="#202124" text-anchor="end">${esc(p.name)}</text>`,
  );
});

// Footer caption — self-describing if the image is shared on its own.
parts.push(
  `<text x="${PAD}" y="${H - PAD + FOOT_H - 6}" font-size="11" fill="#9aa0a6">HCT Palette Generator — the 8 default palettes, perceptually-even tonal ramps (050 → 950). Generated from the engine.</text>`,
);
parts.push(`</svg>`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, parts.join("\n") + "\n");
const swatches = palettes.length * cols;
console.log(`wrote ${OUT}  (${palettes.length} palettes × ${cols} stops = ${swatches} swatches, ${W}×${H})`);
