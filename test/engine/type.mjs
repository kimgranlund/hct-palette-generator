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
  // CASE is per-treatment now: Context + Eyebrow are the standing UPPERCASE "caps voices"; Display is
  // title/sentence case by default (only Brutalist opts Display into caps — checked below).
  ok(s.categories["Heading Context"].MD.textTransform === "uppercase" && s.categories["Heading Eyebrow"].MD.textTransform === "uppercase", "Context + Eyebrow are the UPPERCASE caps voices");
  ok(s.categories["Display"].MD.textTransform === "none" && s.categories["Heading Editorial"].MD.textTransform === "none" && s.categories["Body"].MD.textTransform === "none", "Display + Editorial + Body are title/sentence case by default (Display no longer forced ALL-CAPS)");
  // only the Brutalist/Statement treatment earns the ALL-CAPS display
  const st = T.typeScale({ treatment: "statement" });
  ok(st.categories["Display"].MD.textTransform === "uppercase", "Brutalist/Statement is the one treatment whose Display is ALL-CAPS");
  ok(T.TYPE_TREATMENTS.filter((t) => t.categories["Display"].transform === "uppercase").length === 1, "exactly ONE treatment (Brutalist) sets an uppercase Display");
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
  // line-height = size × leading (Body prose leading 1.55, inside the 1.45–1.65 band)
  ok(body.MD.lineHeight === Math.round(16 * 1.55), `Body MD line-height = size×1.55 (got ${body.MD.lineHeight})`);
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
  // font family names MUST be QUOTED — a name with a digit ("Source Serif 4") is invalid unquoted in
  // strict parsers (Safari drops the whole declaration → fallback). luxury uses Source Serif 4.
  const lux = T.typeTokensCSS(T.typeScale({ treatment: "luxury" }));
  ok(lux.includes("--font-display: 'Source Serif 4'"), "CSS quotes font family names (digit names like 'Source Serif 4' are invalid unquoted in Safari)");
}

// ── responsive CSS: per-breakpoint @media blocks re-declaring the size vars (Phase 5.4) ──
{
  const base = T.typeScale({ treatment: "product", bodyBase: 16 });
  const mobile = T.typeScale({ treatment: "product", bodyBase: 13 });
  const css = T.typeTokensResponsiveCSS(base, [{ name: "Mobile", minWidth: 768, scale: mobile }, { name: "NoWidth", scale: mobile }]);
  ok(css.startsWith(T.typeTokensCSS(base)), "responsive CSS begins with the full base CSS");
  ok(/@media \(min-width: 768px\) \{\s*:root \{[^}]*--type-body-md-size: 13px/.test(css), "a mode with minWidth emits @media (min-width) re-declaring the size vars at the mode's body size");
  ok((css.match(/@media/g) || []).length === 1, "a mode WITHOUT a minWidth is skipped (no @media)");
  ok(T.typeTokensResponsiveCSS(base, []) === T.typeTokensCSS(base), "no modes → identical to the base CSS");
}

// ── per-cell SIZE overrides (Tokens-matrix Phase 3): the size lever; line re-derives; tracking+weight stay ──
{
  const baseline = T.typeScale({ treatment: "product", bodyBase: 16 });
  // IDENTITY: no overrides (and an empty map) is byte-identical to the un-overridden scale.
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: undefined })) === JSON.stringify(baseline), "no overrides ⇒ scale is byte-identical (identity gate)");
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: {} })) === JSON.stringify(baseline), "empty overrides ⇒ scale is byte-identical (identity gate)");
  // an override REPLACES the size and the line-height RE-DERIVES (round(size · leading)); tracking + weight stay.
  const bodyP = T.TYPE_TREATMENTS.find((x) => x.id === "product").categories.Body; // the Body treatment params (leading 1.55)
  const ov = T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Body|MD": 40 } });
  ok(ov.categories.Body.MD.size === 40, `override sets the size (got ${ov.categories.Body.MD.size}, want 40)`);
  ok(ov.categories.Body.MD.lineHeight === Math.round(40 * bodyP.leading), `line-height re-derives from the override (got ${ov.categories.Body.MD.lineHeight}, want ${Math.round(40 * bodyP.leading)})`);
  ok(ov.categories.Body.MD.weight === baseline.categories.Body.MD.weight && ov.categories.Body.MD.letterSpacing === baseline.categories.Body.MD.letterSpacing, "tracking + weight are UNCHANGED by a size override (the ratified rule)");
  // only the targeted cell changes — every other step is identical to the baseline.
  ok(ov.categories.Body.LG.size === baseline.categories.Body.LG.size && ov.categories.Display.XL.size === baseline.categories.Display.XL.size, "an override touches only its (voice|step) cell, no others");
  // a non-positive / non-numeric override is ignored (no effect) — the cell stays derived.
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Body|MD": 0, "Body|LG": -5, "Display|XL": NaN } })) === JSON.stringify(baseline), "non-positive / NaN overrides are ignored (no effect)");
  // NON-ZERO-TRACKING pin (Body|MD has trackingEm 0 → 0===0 masks the bug). Display tracks NEGATIVE, so
  // overriding a Display step's SIZE must NOT move tracking (it stays on the modular-scale size) or weight —
  // only size changes and line-height re-derives. This pins the "size lever; tracking/weight stay" rule.
  const displayP = T.TYPE_TREATMENTS.find((x) => x.id === "product").categories.Display; // leading 1.1, trackingEm -0.02 (non-zero)
  const ovD = T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Display|MD": 88 } });
  ok(displayP.trackingEm !== 0, `Display tracking is non-zero (got ${displayP.trackingEm}) — the assertion below is meaningful`);
  ok(ovD.categories.Display.MD.size === 88, `Display override sets the size (got ${ovD.categories.Display.MD.size}, want 88)`);
  ok(ovD.categories.Display.MD.size !== baseline.categories.Display.MD.size, "the Display override actually moves the size off baseline");
  ok(ovD.categories.Display.MD.letterSpacing === baseline.categories.Display.MD.letterSpacing, `Display tracking is UNCHANGED by a size override (got ${ovD.categories.Display.MD.letterSpacing}, baseline ${baseline.categories.Display.MD.letterSpacing}) — tracking stays on the modular-scale size`);
  ok(ovD.categories.Display.MD.weight === baseline.categories.Display.MD.weight, "Display weight is UNCHANGED by a size override");
  ok(ovD.categories.Display.MD.lineHeight === Math.round(88 * displayP.leading), `Display line-height re-derives from the override (got ${ovD.categories.Display.MD.lineHeight}, want ${Math.round(88 * displayP.leading)})`);
}

// ── DTCG emit: fontFamily group + composite typography tokens ──
{
  const d = T.typeTokensDTCG(T.typeScale({ treatment: "editorial" }));
  ok(d.fontFamily && d.fontFamily.display.$type === "fontFamily", "DTCG fontFamily group");
  const tok = d.typography.Body.MD;
  ok(tok.$type === "typography" && /px$/.test(tok.$value.fontSize) && typeof tok.$value.fontWeight === "number", "DTCG composite typography token (px sizes + numeric weight)");
}

// ── Figma breakpoint-MODED variables: a single "Typography" collection, one MODE per breakpoint (5.4b) ──
{
  const base = T.typeScale({ treatment: "product", bodyBase: 16 });
  const mobile = T.typeScale({ treatment: "product", bodyBase: 13 });
  const out = T.typeTokensFigmaModes(base, [{ name: "Mobile", minWidth: 768, scale: mobile }]);
  const col = out.collections.Typography;
  ok(col && JSON.stringify(col.modes) === JSON.stringify(["Base", "Mobile"]), `modes = [Base, Mobile] (got ${JSON.stringify(col && col.modes)})`);
  // four FLOAT variables per voice×step: size/lineHeight/letterSpacing/weight (weight too — Figma numbers).
  const v = col.variables["Body/MD/size"];
  ok(v && v.type === "FLOAT" && typeof v.values.Base === "number" && typeof v.values.Mobile === "number", "Body/MD/size is a FLOAT variable with Base + Mobile values");
  ok(col.variables["Body/MD/weight"] && col.variables["Body/MD/weight"].type === "FLOAT" && typeof col.variables["Body/MD/weight"].values.Base === "number", "weight is emitted as a FLOAT variable too (Figma numbers)");
  ok(["size", "lineHeight", "letterSpacing", "weight"].every((p) => col.variables[`Body/MD/${p}`]), "every voice×step emits size/lineHeight/letterSpacing/weight");
  // per-mode values DIFFER for a breakpoint with a different bodyBase (13 vs 16) — the Mobile size is smaller.
  ok(v.values.Base === base.categories.Body.MD.size && v.values.Mobile === mobile.categories.Body.MD.size, "Base value = base scale; Mobile value = that mode's scale (per-mode values DIFFER)");
  ok(v.values.Mobile !== v.values.Base, `the breakpoint's value differs from Base (Base ${v.values.Base}, Mobile ${v.values.Mobile})`);
  // IDENTITY: with no modes, a single "Base" mode whose values equal the base export.
  const idn = T.typeTokensFigmaModes(base, []);
  const idCol = idn.collections.Typography;
  ok(JSON.stringify(idCol.modes) === JSON.stringify(["Base"]), "no modes ⇒ a single \"Base\" mode");
  ok(Object.values(idCol.variables).every((x) => x.type === "FLOAT" && Object.keys(x.values).join() === "Base"), "no modes ⇒ every variable has exactly one Base value");
  ok(idCol.variables["Body/MD/size"].values.Base === base.categories.Body.MD.size && idCol.variables["Display/XL/letterSpacing"].values.Base === base.categories.Display.XL.letterSpacing, "no-modes Base values equal the base scale");
  // DISTINCT mode names: a breakpoint named "Base" (reserved) and duplicate names are disambiguated, so
  // Figma never sees modes:["Base","Base"] (which it rejects on import) or a silently-shadowed mode.
  const dup = T.typeTokensFigmaModes(base, [{ name: "Base", scale: mobile }, { name: "Wide", scale: base }, { name: "Wide", scale: mobile }]).collections.Typography;
  ok(JSON.stringify(dup.modes) === JSON.stringify(["Base", "Base 2", "Wide", "Wide 2"]), `clashing/duplicate mode names are disambiguated (got ${JSON.stringify(dup.modes)})`);
  ok(new Set(dup.modes.map((s) => s.toLowerCase())).size === dup.modes.length, "every mode name is distinct (case-insensitively)");
  ok(dup.variables["Body/MD/size"].values["Base 2"] === mobile.categories.Body.MD.size, "the breakpoint renamed off \"Base\" keeps its own value (didn't overwrite the synthetic Base)");
}

if (fails.length) { console.error(`type FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("type PASS — modular scale, optical tracking, treatments, CSS + DTCG + Figma-modes emit");
process.exit(0);
