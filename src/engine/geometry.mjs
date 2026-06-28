// geometry.mjs — the GEOMETRY / dimensional engine: the spatial analog of the color & type engines.
// A few parameters → a systematic size ramp → derived control geometry → DTCG / CSS tokens. Pure, no DOM.
//
// It encodes ONE law (the centering law) and TWO families, distilled from the agent-ui dimensional spec
// (docs/references/{geometry.md, geometry-sizing-spec.md, dimensional-standard.md}):
//
//   THE CENTERING LAW — edge padding for a glyph = (height − glyph) / 2. Every glyph centers in a square
//   cell of side = the control height; block-size is the vertical lever, padding-block is 0.
//
//   THE TWO FAMILIES —
//     • Frame  ∝ height : icon, slot, inline-pad, min-inline-size, pill radius (= height/2).
//     • Rhythm ∝ font   : gap = font/2, caret = font. Density multiplies the RHYTHM only (never the
//       frame — scaling the frame un-centers the glyph and breaks the square).
//
// The six-size ramp (XS·SM·MD·LG·XL·2XL) is two bands that change gear at the MD|LG seam (compact +4
// linear; expressive ×4/3 geometric). The glyphs scale SUBLINEARLY — a power law of height, exponent < 1
// (the optical correction: a glyph occupies a shrinking fraction of the box as it grows):
//
//   icon = 2.49·h^0.58   (round to nearest even)        font = 3.16·h^0.45 ≈ √h   (round to nearest int)
//   caret = font         (the v4 rhythm rule — the affordance mark equals the text height)
//
// These reproduce the hand-tuned reference ramp (20·24·28·36·48·64) to ±1px — so the table is not six
// hand-picked points, it is ONE rule sampled six times, and it generalizes to any scaled baseHeight.

const round = (v) => Math.round(v);
const roundEven = (v) => 2 * Math.round(v / 2);

// The six reference sizes and their canonical control heights (component-sizes.md, the authority).
// `baseHeight` (the MD height) scales the whole ramp by baseHeight/28 — the dimensional analog of the
// type engine's `bodyBase`, so the entire spatial system grows/shrinks together while keeping its shape.
const SIZES = [
  ["XS", 20], ["SM", 24], ["MD", 28], ["LG", 36], ["XL", 48], ["2XL", 64],
];
const CANON_MD = 28;

// A "treatment" seeds the spatial feel, exactly as the type "treatment" seeds the type params. Each is a
// density + a default radius ladder + a layout-spacing base. Fonts/sizes are universal; the FEEL is the
// product. `density` multiplies the rhythm (gap) only — comfortable 1 · compact 0.75 · spacious 1.25.
export const GEOMETRY_TREATMENTS = [
  { id: "comfortable", label: "Comfortable", note: "Balanced default — generous touch targets, soft corners, 4px spacing rhythm.",
    density: 1, radiusStyle: "soft", baseHeight: 28, spaceBase: 4 },
  { id: "compact", label: "Compact / Dense", note: "Data-dense UI — tighter heights, sharp corners, the rhythm pulled in (×0.75).",
    density: 0.75, radiusStyle: "sharp", baseHeight: 24, spaceBase: 4 },
  { id: "spacious", label: "Spacious / Airy", note: "Editorial calm — taller controls, rounder corners, the rhythm opened up (×1.25), 8px spacing.",
    density: 1.25, radiusStyle: "round", baseHeight: 32, spaceBase: 8 },
  { id: "touch", label: "Touch / Mobile", note: "Thumb-first — 36px+ targets, soft corners, 8px spacing for fat-finger comfort.",
    density: 1.1, radiusStyle: "soft", baseHeight: 36, spaceBase: 8 },
  { id: "pill", label: "Pill / Rounded", note: "Fully-rounded controls — every box a pill (radius = height/2), soft inner corners.",
    density: 1, radiusStyle: "pill", baseHeight: 28, spaceBase: 4 },
];

export const DEFAULT_GEOMETRY = { treatment: "comfortable", baseHeight: 28 };

// the flat radius ladder per style (none·sm·md·lg). `full` is always the pill (height/2 per control;
// the named token is a CSS-pill 9999). The control's own corner uses the per-size `radiusPill`.
const RADIUS_LADDERS = {
  sharp: [0, 2, 4, 6],
  soft: [0, 4, 8, 12],
  round: [0, 8, 12, 16],
  pill: [0, 8, 12, 16],
};

// the layout-spacing scale (--space-*): page gutters, card/stack gaps, section rhythm. A SEPARATE concern
// from control geometry (the law above) — the space BETWEEN components, not the padding inside one. A
// roughly-geometric ladder of `spaceBase` multiples (0·1·2·3·4·6·8·12·16·24).
const SPACE_STEPS = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24];

// buildSize — derive the full geometry of one size row from its (scaled) control height + the density.
// Everything below the height is DERIVED — the glyphs by the power law, the pads by the centering law.
// `fontOverride` (when the geometry COMPOSES with a type scale) replaces the power-law text size with the
// type scale's UI voice at the matching step, so a control's box and its text share ONE number.
function buildSize(rawHeight, density, fontOverride) {
  const height = roundEven(rawHeight);
  const icon = roundEven(2.49 * height ** 0.58); // frame family — the leading content-icon / slot side
  const font = fontOverride != null ? fontOverride : round(3.16 * height ** 0.45); // ≈ √h — the text size
  const caret = font; // rhythm family — the affordance mark = text height (the v4 rule)
  return {
    height,
    icon,
    caret,
    font,
    gap: Math.max(1, round((font / 2) * density)), // rhythm — font/2, density rides HERE (and only here)
    padding: (height - icon) / 2, // the centering law: a SLOT edge — ½(height − icon); icon centers in a height² cell
    edgePadding: round(height / 2), // a SLOTLESS edge (bare label) — h/2 (text pad ½(h−font) + the absent slot's gap ½·font)
    radiusPill: round(height / 2), // the one size-linked radius — a fully-round control is a pill
    minWidth: height, // the 1:1 floor — an icon-only control is at least square
  };
}

// geomScale — the resolved geometry for a config { treatment, baseHeight }. `baseHeight` (the MD control
// height) uniformly scales the whole ramp; the treatment seeds density + the radius ladder + spacing.
//
// COMPOSITION with typography: pass `opts.typeScale` (a resolved `typeScale(...)`) and each size's text
// `font` comes from the type scale's UI voice at the MATCHING step (XS→UI XS … 2XL→UI 2XL) instead of the
// standalone power law — so the box (geometry) and the text in it (typography) share one source of truth.
// `caret = font` and `gap = font/2` follow; the FRAME (height/icon/pad/radius) is untouched, so the
// centering law still holds. `typed` reports whether the fonts came from the type scale.
// `opts.overrides` (optional) — a flat per-size HEIGHT override map keyed "<sizeName>", already mode-selected
// by the caller. When a positive number exists for a size, it REPLACES the scaled rawHeight fed to buildSize,
// so icon/font/pad/radius/caret/gap ALL re-derive via the laws (and the type-composition `fontOverride` still
// applies on top). Absent / non-positive ⇒ no effect, so the scale is byte-identical (the identity gate).
export function geomScale(config = {}, opts = {}) {
  const t = GEOMETRY_TREATMENTS.find((x) => x.id === config.treatment) || GEOMETRY_TREATMENTS[0];
  const baseHeight = Number(config.baseHeight) || t.baseHeight;
  const factor = baseHeight / CANON_MD;
  const uiSteps = opts.typeScale && opts.typeScale.categories && opts.typeScale.categories.UI;
  const overrides = opts.overrides && typeof opts.overrides === "object" ? opts.overrides : null;
  const sizes = {};
  for (const [name, h] of SIZES) {
    const ovH = overrides && overrides[name];
    const rawHeight = (typeof ovH === "number" && Number.isFinite(ovH) && ovH > 0) ? ovH : h * factor;
    sizes[name] = buildSize(rawHeight, t.density, uiSteps && uiSteps[name] ? uiSteps[name].size : null);
  }
  const ladder = RADIUS_LADDERS[t.radiusStyle] || RADIUS_LADDERS.soft;
  const radii = { none: ladder[0], sm: ladder[1], md: ladder[2], lg: ladder[3], full: 9999 };
  const space = {};
  SPACE_STEPS.forEach((m, i) => { space[i] = m * t.spaceBase; });
  return { treatment: t.id, label: t.label, density: t.density, radiusStyle: t.radiusStyle, baseHeight, typed: !!uiSteps, sizes, radii, space };
}

// ── emitters ───────────────────────────────────────────────────────────────────────────────────
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// geomTokensCSS — CSS custom properties (per-size height/icon/caret/font/gap/padding/radius, the radius
// ladder, the space scale, the density) plus a `.control-{size}` utility class that EMBODIES the law:
// block-size off the ramp, padding-block 0, inline padding = the slotless h/2, the pill radius.
// the per-size `--size-*` custom-property lines (no :root) — shared by the base export + the @media
// overrides; only these scale with baseHeight (density/radii/space are treatment-derived, mode-independent).
function geomSizeVarLines(scale, indent = "  ") {
  return Object.entries(scale.sizes).map(([name, s]) => {
    const p = `--size-${kebab(name)}`;
    return `${indent}${p}-height: ${s.height}px; ${p}-icon: ${s.icon}px; ${p}-caret: ${s.caret}px; ${p}-font: ${s.font}px; ${p}-gap: ${s.gap}px; ${p}-pad: ${s.padding}px; ${p}-pad-edge: ${s.edgePadding}px; ${p}-radius: ${s.radiusPill}px; ${p}-min: ${s.minWidth}px;`;
  }).join("\n");
}

export function geomTokensCSS(scale) {
  const lines = [":root {", `  --density: ${scale.density};`, geomSizeVarLines(scale)];
  for (const [k, v] of Object.entries(scale.radii)) lines.push(`  --radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(scale.space)) lines.push(`  --space-${k}: ${v}px;`);
  lines.push("}");
  for (const name of Object.keys(scale.sizes)) {
    const s = kebab(name);
    lines.push(`.control-${s} { box-sizing: border-box; block-size: var(--size-${s}-height); min-inline-size: var(--size-${s}-min); font-size: var(--size-${s}-font); padding-inline: var(--size-${s}-pad-edge); padding-block: 0; gap: var(--size-${s}-gap); border-radius: var(--size-${s}-radius); }`);
  }
  return lines.join("\n") + "\n";
}

// geomTokensResponsiveCSS — the base CSS plus a `@media (min-width: …)` block per breakpoint mode that
// re-declares the per-size vars at that mode's scale (radii/space/density + the .control-* utilities are
// mode-independent, so they auto-track). `modes` = [{ name, minWidth, scale }]; no-minWidth modes skipped.
export function geomTokensResponsiveCSS(scale, modes = []) {
  let css = geomTokensCSS(scale);
  for (const m of modes) {
    if (!(Number(m.minWidth) > 0) || !m.scale) continue;
    css += `\n/* ${m.name || "Mode"} */\n@media (min-width: ${Math.round(m.minWidth)}px) {\n  :root {\n${geomSizeVarLines(m.scale, "    ")}\n  }\n}\n`;
  }
  return css;
}

// geomTokensDTCG — the geometry as DTCG dimension tokens: a `size` group (one composite of dimensions per
// ramp step), a `radius` ladder group, and a `space` scale group — all the W3C-DTCG `dimension` $type.
export function geomTokensDTCG(scale) {
  const dim = (px) => ({ $type: "dimension", $value: `${px}px` });
  const size = {};
  for (const [name, s] of Object.entries(scale.sizes)) {
    size[name] = {
      height: dim(s.height), icon: dim(s.icon), caret: dim(s.caret), font: dim(s.font),
      gap: dim(s.gap), padding: dim(s.padding), edgePadding: dim(s.edgePadding),
      radius: dim(s.radiusPill), minWidth: dim(s.minWidth),
    };
  }
  const radius = {};
  for (const [k, v] of Object.entries(scale.radii)) radius[k] = dim(v);
  const space = {};
  for (const [k, v] of Object.entries(scale.space)) space[k] = dim(v);
  return { size, radius, space };
}

// geomTokensFigma — the geometry as DTCG `number` tokens (UNITLESS values), the shape a Figma variable
// importer turns into **FLOAT (number) variables** — a "Geometry" collection with size/radius/space groups
// (px is 1:1 with Figma's unitless floats). Same numbers as the DTCG dimension export, minus the `px`
// suffix, so height/icon/font/gap/padding/radius/space land as native number variables you can bind to
// auto-layout, corner radius, gaps, and sizing.
export function geomTokensFigma(scale) {
  const num = (v) => ({ $type: "number", $value: v });
  const size = {};
  for (const [name, s] of Object.entries(scale.sizes)) {
    size[name] = {
      height: num(s.height), icon: num(s.icon), caret: num(s.caret), font: num(s.font),
      gap: num(s.gap), padding: num(s.padding), edgePadding: num(s.edgePadding),
      radius: num(s.radiusPill), minWidth: num(s.minWidth),
    };
  }
  const radius = {};
  for (const [k, v] of Object.entries(scale.radii)) radius[k] = num(v);
  const space = {};
  for (const [k, v] of Object.entries(scale.space)) space[k] = num(v);
  return { Geometry: { size, radius, space } };
}
