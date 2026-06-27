// type.mjs — the perceptual TYPOGRAPHY engine: the type analog of the color engine. A few parameters
// → a systematic type scale → DTCG / CSS tokens. Pure, no DOM. Mirrors the structure of the target
// schema (docs/spec/typography/typography.tokens.json): four role "voices" — Display · Heading · Body
// (Content) · UI — each a size ramp whose every step carries size, line-height, letter-spacing, weight,
// and paragraph spacing, all DERIVED from the treatment's params (no hand-authored magic numbers).
//
// The system relationships (see docs/spec/typography/README.md):
//   size          = base · ratio^n           (a modular scale; n = the step's distance from the base)
//   lineHeight     = round(size · leading)     (per-role leading; single-line = size)
//   letterSpacing = round(size · trackingEm)  (optical: negative tightens big display, positive loosens UI)
//   weight        = the role's weight
//   paragraphSpacing = size, indent = 0       (schema defaults)

const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

// step ramps: [name, exponent] where exponent is the step's distance from the base (size = base·ratio^n).
const STEPS_5 = [["XS", -2], ["SM", -1], ["MD", 0], ["LG", 1], ["XL", 2]];
const STEPS_UI = [["3XS", -4], ["2XS", -3], ["XS", -2], ["SM", -1], ["MD", 0], ["LG", 1], ["XL", 2], ["2XL", 3]];

// classic modular ratios (the "musical" scale), for reference + the UI's ratio picker.
export const TYPE_RATIOS = [
  { id: "minor-second", value: 1.067, label: "Minor second" },
  { id: "major-second", value: 1.125, label: "Major second" },
  { id: "minor-third", value: 1.2, label: "Minor third" },
  { id: "major-third", value: 1.25, label: "Major third" },
  { id: "perfect-fourth", value: 1.333, label: "Perfect fourth" },
  { id: "aug-fourth", value: 1.414, label: "Augmented fourth" },
  { id: "perfect-fifth", value: 1.5, label: "Perfect fifth" },
  { id: "golden", value: 1.618, label: "Golden ratio" },
];

// A "treatment" seeds the params, exactly as the color "Color Categories" presets seed palette params.
// Each category: { role, base, ratio, leading, weight, trackingEm, steps, transform }. Fonts are swappable;
// the SCALE + tracking + weight + leading + case relationships are the product. Free families only.
const cat = (role, base, ratio, leading, weight, trackingEm, steps = STEPS_5, transform = "none") => ({ role, base, ratio, leading, weight, trackingEm, steps, transform });

// make7 — the SEVEN named type groups (the canonical taxonomy from docs/spec/typography): Display · the
// three Headings (Editorial · Context · Eyebrow) · Body · UI · Code. Shared STRUCTURE across treatments;
// each treatment passes its fonts + a few character knobs. Eyebrow + Code ride the MONO role.
//
// CASE is a per-treatment decision, not a blanket rule. The Display voice defaults to TITLE/SENTENCE case
// (o.dTransform) — only the Brutalist/Statement treatment opts its Display into ALL-CAPS. The two genuine
// "caps voices" are Heading-Context (the kicker / section label) and Heading-Eyebrow (the mono overline);
// those stay uppercase and track POSITIVE so small caps open up. Display tracks NEGATIVE — big type
// tightens. Leadings sit inside the ui-compose-typography bands: display 1.05–1.2, heading 1.05–1.3,
// prose 1.45–1.65, UI 1.25–1.5, mono ~1.5.
function make7(o = {}) {
  return {
    "Display": cat("display", o.dBase ?? 60, o.dRatio ?? 1.25, o.dLead ?? 1.08, o.dWeight ?? 700, o.dTrack ?? -0.02, STEPS_5, o.dTransform ?? "none"),
    "Heading Editorial": cat("heading", 28, o.heRatio ?? 1.25, o.heLead ?? 1.2, o.heWeight ?? 700, o.heTrack ?? -0.005, STEPS_5, "none"),
    "Heading Context": cat("heading", 26, o.hcRatio ?? 1.2, o.hcLead ?? 1.2, o.hcWeight ?? 600, o.hcTrack ?? 0.1, STEPS_5, "uppercase"),
    "Heading Eyebrow": cat("mono", 13, 1.15, o.eyeLead ?? 1.4, o.eyeWeight ?? 600, o.eyeTrack ?? 0.16, STEPS_5, "uppercase"),
    "Body": cat("body", o.bBase ?? 16, o.bRatio ?? 1.2, o.bLead ?? 1.55, o.bWeight ?? 440, 0, STEPS_5, "none"),
    "UI": cat("ui", 14, 1.125, o.uiLead ?? 1.4, o.uiWeight ?? 480, o.uiTrack ?? 0.006, STEPS_UI, "none"),
    "Code": cat("mono", 13, 1.125, 1.5, o.codeWeight ?? 460, o.codeTrack ?? 0, STEPS_UI, "none"),
  };
}

// Each treatment expresses a distinct VOICE through case, weight contrast, tracking, leading, and scale —
// not just a font swap. Per the directive + ui-compose-typography: Display is title/sentence case
// everywhere except Brutalist (the one earned ALL-CAPS), with bespoke specimen copy living in the UI.
export const TYPE_TREATMENTS = [
  // Product — calm geometric sans, gentle hierarchy, title-case display. The everyday system voice.
  { id: "product", label: "Product / Lifestyle", note: "Neutral geometric sans, title-case display — screen-native, calm, versatile.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make7({ dBase: 54, dRatio: 1.25, dWeight: 700, dTrack: -0.02, dLead: 1.1, heWeight: 620, bLead: 1.55, uiLead: 1.35, eyeTrack: 0.14 }) },
  // Luxury — high-contrast serif set LIGHT and large, airy prose, wide-tracked labels. Restraint, not shout.
  { id: "luxury", label: "Luxury / Premium", note: "High-contrast serif display set light and large, airy sans body, wide-tracked labels — restraint over shout.",
    fonts: { display: "Source Serif 4", heading: "Source Serif 4", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make7({ dBase: 76, dRatio: 1.25, dWeight: 400, dTrack: -0.005, dLead: 1.12, heWeight: 500, heLead: 1.3, heTrack: 0, hcRatio: 1.25, hcWeight: 500, hcTrack: 0.18, bBase: 17, bRatio: 1.25, bLead: 1.65, bWeight: 400, uiTrack: 0.04, uiLead: 1.45, eyeWeight: 500, eyeTrack: 0.26 }) },
  // Editorial — serif headlines in title case, tight sans subheads, sans body tuned for long-form reading.
  { id: "editorial", label: "Editorial / Magazine", note: "Serif headlines in title case, tight sans subheads, sans body for long-form reading, mono metadata.",
    fonts: { display: "Source Serif 4", heading: "Inter Tight", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: make7({ dBase: 60, dRatio: 1.25, dWeight: 650, dTrack: -0.015, dLead: 1.06, heWeight: 750, heTrack: -0.01, bBase: 18, bRatio: 1.25, bLead: 1.6, eyeTrack: 0.2 }) },
  // Technical — mono-forward, tabular, dense, tight leading. Display reads as data, not a slogan.
  { id: "technical", label: "Technical / Data", note: "Mono-forward — tabular figures, dense, tight leading, restrained scale. Display reads as data, not slogan.",
    fonts: { display: "Inter", heading: "Inter", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: make7({ dBase: 42, dRatio: 1.2, dWeight: 650, dTrack: -0.01, dLead: 1.12, heWeight: 600, heRatio: 1.2, hcRatio: 1.18, hcTrack: 0.08, bBase: 15, bRatio: 1.2, bLead: 1.5, uiTrack: 0, uiLead: 1.35 }) },
  // Brutalist — one heavy grotesque, the earned ALL-CAPS display, tight tracking, dramatic size jumps.
  { id: "statement", label: "Brutalist / Statement", note: "One heavy grotesque, ALL-CAPS display, tight tracking, dramatic size jumps — the loud voice, used on purpose.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make7({ dBase: 84, dRatio: 1.5, dWeight: 900, dTrack: -0.04, dLead: 0.96, dTransform: "uppercase", heWeight: 800, heRatio: 1.4, heTrack: -0.02, hcRatio: 1.3, hcWeight: 700, hcTrack: 0.12, bRatio: 1.25, bWeight: 500, uiWeight: 550, uiTrack: 0.02, eyeWeight: 700, eyeTrack: 0.12 }) },
];

export const DEFAULT_TYPE = { treatment: "product", bodyBase: 16 };

function buildCategory(p, factor) {
  const out = {};
  for (const [name, n] of p.steps) {
    const size = Math.max(8, Math.round(p.base * factor * p.ratio ** n));
    out[name] = {
      size,
      lineHeight: Math.round(size * p.leading),
      letterSpacing: round(size * p.trackingEm, 2),
      weight: p.weight,
      textTransform: p.transform || "none",
      paragraphSpacing: size,
      paragraphIndent: 0,
    };
  }
  return out;
}

// typeScale — the resolved scale for a config { treatment, bodyBase }. `bodyBase` (the Body base size)
// uniformly scales every category so the whole system grows/shrinks together while keeping its ratios.
export function typeScale(config = {}) {
  const t = TYPE_TREATMENTS.find((x) => x.id === config.treatment) || TYPE_TREATMENTS[0];
  const bodyBase = Number(config.bodyBase) || t.categories.Body.base;
  const factor = bodyBase / t.categories.Body.base;
  const categories = {};
  for (const [name, p] of Object.entries(t.categories)) categories[name] = buildCategory(p, factor);
  return { treatment: t.id, label: t.label, fonts: { ...t.fonts }, roleOf: Object.fromEntries(Object.entries(t.categories).map(([k, v]) => [k, v.role])), categories };
}

// ── emitters ───────────────────────────────────────────────────────────────────────────────────
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// typeTokensCSS — CSS custom properties (font families + per-step size/line/tracking/weight) plus a
// utility class per step. Drop-in: `class="type-display-xl"`.
export function typeTokensCSS(scale) {
  const lines = [":root {"];
  for (const [role, family] of Object.entries(scale.fonts)) lines.push(`  --font-${role}: '${family}';`); // quote — names with digits (e.g. "Source Serif 4") are invalid unquoted in strict parsers (Safari)
  for (const [cName, steps] of Object.entries(scale.categories)) {
    for (const [sName, s] of Object.entries(steps)) {
      const p = `--type-${kebab(cName)}-${kebab(sName)}`;
      lines.push(`  ${p}-size: ${s.size}px; ${p}-line: ${s.lineHeight}px; ${p}-tracking: ${s.letterSpacing}px; ${p}-weight: ${s.weight};`);
    }
  }
  lines.push("}");
  for (const [cName, steps] of Object.entries(scale.categories)) {
    const role = scale.roleOf[cName] || "body";
    for (const [sName, s] of Object.entries(steps)) {
      const c = kebab(cName), sk = kebab(sName);
      const tt = s.textTransform && s.textTransform !== "none" ? ` text-transform: ${s.textTransform};` : "";
      lines.push(`.type-${c}-${sk} { font-family: var(--font-${role}); font-size: var(--type-${c}-${sk}-size); line-height: var(--type-${c}-${sk}-line); letter-spacing: var(--type-${c}-${sk}-tracking); font-weight: var(--type-${c}-${sk}-weight);${tt} }`);
    }
  }
  return lines.join("\n") + "\n";
}

// typeTokensDTCG — the type scale as DTCG tokens: a fontFamily group + a typography group per
// category/step (composite `typography` $type, the W3C-DTCG shape).
export function typeTokensDTCG(scale) {
  const fontFamily = {};
  for (const [role, family] of Object.entries(scale.fonts)) fontFamily[role] = { $type: "fontFamily", $value: family };
  const typography = {};
  for (const [cName, steps] of Object.entries(scale.categories)) {
    const role = scale.roleOf[cName] || "body";
    typography[cName] = {};
    for (const [sName, s] of Object.entries(steps)) {
      typography[cName][sName] = {
        $type: "typography",
        $value: { fontFamily: scale.fonts[role], fontSize: `${s.size}px`, lineHeight: `${s.lineHeight}px`, letterSpacing: `${s.letterSpacing}px`, fontWeight: s.weight, textCase: s.textTransform || "none", paragraphSpacing: `${s.paragraphSpacing}px`, paragraphIndent: `${s.paragraphIndent}px` },
      };
    }
  }
  return { fontFamily, typography };
}
