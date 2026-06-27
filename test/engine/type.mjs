#!/usr/bin/env node
// type.mjs — verifier for the typography engine (src/engine/type.mjs). Pure, no DOM.
import * as T from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── treatments: 5 presets, each with the SEVEN named groups ──
const GROUPS7 = ["Display", "Heading Editorial", "Heading Context", "Heading Eyebrow", "Body", "UI", "Code"];
ok(T.TYPE_TREATMENTS.length === 5, `5 treatments (got ${T.TYPE_TREATMENTS.length})`);
ok(T.TYPE_TREATMENTS.every((t) => t.fonts && GROUPS7.every((c) => t.categories[c])), "every treatment has the 7 groups (Display · 3 Headings · Body · UI · Code) + fonts");
ok(T.TYPE_TREATMENTS.some((t) => t.id === "product") && T.TYPE_TREATMENTS.some((t) => t.id === "luxury") && T.TYPE_TREATMENTS.some((t) => t.id === "editorial"), "has product/luxury/editorial");

// ── the taxonomy: role mapping (Eyebrow + Code ride MONO) + the UPPERCASE caps voices ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  ok(s.roleOf["Heading Eyebrow"] === "mono" && s.roleOf["Code"] === "mono", "Eyebrow + Code map to the mono font role");
  ok(s.roleOf["Display"] === "display" && s.roleOf["Heading Editorial"] === "heading" && s.roleOf["Body"] === "body" && s.roleOf["UI"] === "ui", "Display/Heading/Body/UI map to their roles");
  ok(s.categories["Display"].MD.textTransform === "uppercase" && s.categories["Heading Context"].MD.textTransform === "uppercase" && s.categories["Heading Eyebrow"].MD.textTransform === "uppercase", "Display + Context + Eyebrow are UPPERCASE voices");
  ok(s.categories["Heading Editorial"].MD.textTransform === "none" && s.categories["Body"].MD.textTransform === "none", "Editorial + Body are sentence-case (no transform)");
  // Context/Eyebrow caps track POSITIVE (open up); Display caps track NEGATIVE (tighten)
  ok(s.categories["Heading Context"].XL.letterSpacing > 0 && s.categories["Heading Eyebrow"].XL.letterSpacing > 0, "caps headings track positive (open)");
  ok(s.categories["Display"].XL.letterSpacing < 0, "Display caps track negative (tighten)");
  // Code mirrors the UI ramp (8 steps, 3XS..2XL)
  ok(["3XS", "2XS", "XS", "SM", "MD", "LG", "XL", "2XL"].every((k) => s.categories.Code[k]), "Code has the 8-step UI ramp 3XS..2XL");
}

// ── the modular scale: size = base · ratio^n, monotonic, MD = base ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const body = s.categories.Body;
  ok(body.MD.size === 16, `Body MD = bodyBase 16 (got ${body.MD.size})`);
  const sizes = ["XS", "SM", "MD", "LG", "XL"].map((k) => body[k].size);
  ok(sizes.every((v, i) => i === 0 || v > sizes[i - 1]), `Body sizes strictly increase XS→XL (${sizes})`);
  // ratio check: LG/MD ≈ the treatment ratio (1.2 for product Body) within rounding
  ok(Math.abs(body.LG.size / body.MD.size - 1.2) < 0.08, `Body LG/MD ≈ 1.2 (got ${(body.LG.size / body.MD.size).toFixed(3)})`);
  // line-height = size × leading (Body leading 1.5)
  ok(body.MD.lineHeight === Math.round(16 * 1.5), `Body MD line-height = size×1.5 (got ${body.MD.lineHeight})`);
  // UI has 8 steps incl. 3XS..2XL
  ok(["3XS", "2XS", "XS", "SM", "MD", "LG", "XL", "2XL"].every((k) => s.categories.UI[k]), "UI has the 8-step ramp 3XS..2XL");
}

// ── optical tracking: Display tightens (negative), UI loosens (positive) in the product treatment ──
{
  const s = T.typeScale({ treatment: "product" });
  ok(s.categories.Display.XL.letterSpacing < 0, `Display XL tracking negative (got ${s.categories.Display.XL.letterSpacing})`);
  ok(s.categories.UI.XS.letterSpacing > 0, `UI XS tracking positive (got ${s.categories.UI.XS.letterSpacing})`);
  // tracking scales with size (Display XL more negative than Display XS)
  ok(s.categories.Display.XL.letterSpacing < s.categories.Display.XS.letterSpacing, "Display tracking scales with size (XL tighter than XS)");
  // Display weight is heavy
  ok(s.categories.Display.XL.weight >= 700, `Display weight heavy (got ${s.categories.Display.XL.weight})`);
}

// ── bodyBase scales the whole system uniformly (ratios preserved) ──
{
  const a = T.typeScale({ treatment: "product", bodyBase: 16 });
  const b = T.typeScale({ treatment: "product", bodyBase: 20 });
  ok(b.categories.Body.MD.size === 20, `bodyBase 20 → Body MD 20 (got ${b.categories.Body.MD.size})`);
  ok(b.categories.Display.XL.size > a.categories.Display.XL.size, "a larger bodyBase scales Display up too");
}

// ── unknown treatment falls back to the first ──
ok(T.typeScale({ treatment: "nope" }).treatment === T.TYPE_TREATMENTS[0].id, "unknown treatment → first treatment");

// ── CSS emit: custom props + a utility class per step ──
{
  const css = T.typeTokensCSS(T.typeScale({ treatment: "product" }));
  ok(css.includes("--font-display:") && css.includes("--type-body-md-size:"), "CSS has font + size custom props");
  ok(/\.type-display-xl\s*\{[^}]*font-size: var\(--type-display-xl-size\)/.test(css), "CSS emits a .type-display-xl utility class");
}

// ── DTCG emit: fontFamily group + composite typography tokens ──
{
  const d = T.typeTokensDTCG(T.typeScale({ treatment: "editorial" }));
  ok(d.fontFamily && d.fontFamily.display.$type === "fontFamily", "DTCG fontFamily group");
  const tok = d.typography.Body.MD;
  ok(tok.$type === "typography" && /px$/.test(tok.$value.fontSize) && typeof tok.$value.fontWeight === "number", "DTCG composite typography token (px sizes + numeric weight)");
}

if (fails.length) { console.error(`type FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("type PASS — modular scale, optical tracking, treatments, CSS + DTCG emit");
process.exit(0);
