#!/usr/bin/env node
// geometry.mjs — verifier for the dimensional engine (src/engine/geometry.mjs). Pure, no DOM.
import * as G from "../../src/engine/geometry.mjs";
import { typeScale } from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── treatments: 5 presets, each a density + radius style + base height ──
ok(G.GEOMETRY_TREATMENTS.length === 5, `5 treatments (got ${G.GEOMETRY_TREATMENTS.length})`);
ok(G.GEOMETRY_TREATMENTS.every((t) => typeof t.density === "number" && t.radiusStyle && t.baseHeight), "every treatment has density/radiusStyle/baseHeight");
ok(["comfortable", "compact", "spacious", "touch", "pill"].every((id) => G.GEOMETRY_TREATMENTS.some((t) => t.id === id)), "has comfortable/compact/spacious/touch/pill");

// ── the reference ramp: the power law reproduces the hand-tuned table (component-sizes.md) to ±1px ──
{
  const s = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const REF = { XS: { height: 20, icon: 14, font: 12 }, SM: { height: 24, icon: 16, font: 13 }, MD: { height: 28, icon: 18, font: 14 }, LG: { height: 36, icon: 20, font: 16 }, XL: { height: 48, icon: 24, font: 18 }, "2XL": { height: 64, icon: 28, font: 20 } };
  for (const [name, r] of Object.entries(REF)) {
    const sz = s.sizes[name];
    ok(sz.height === r.height, `${name} height = ${r.height} (got ${sz.height})`);
    ok(Math.abs(sz.icon - r.icon) <= 1, `${name} icon ≈ ${r.icon} (got ${sz.icon})`);
    ok(Math.abs(sz.font - r.font) <= 1, `${name} font ≈ ${r.font} (got ${sz.font})`);
  }
  // sizes strictly increase XS→2XL
  const heights = ["XS", "SM", "MD", "LG", "XL", "2XL"].map((k) => s.sizes[k].height);
  ok(heights.every((v, i) => i === 0 || v > heights[i - 1]), `heights strictly increase (${heights})`);
}

// ── THE CENTERING LAW: edge padding = (height − icon) / 2 exactly, for every size ──
{
  const s = G.geomScale({ treatment: "comfortable" });
  for (const [name, sz] of Object.entries(s.sizes)) {
    ok(sz.padding === (sz.height - sz.icon) / 2, `${name}: padding = (h−icon)/2 (got ${sz.padding}, want ${(sz.height - sz.icon) / 2})`);
    ok(sz.edgePadding === Math.round(sz.height / 2), `${name}: slotless edge = h/2 (got ${sz.edgePadding})`);
    ok(sz.radiusPill === Math.round(sz.height / 2), `${name}: pill radius = h/2 (got ${sz.radiusPill})`);
    ok(sz.minWidth === sz.height, `${name}: min-width = height (the square floor)`);
    ok(sz.icon > 0 && sz.icon <= sz.height, `${name}: 0 < icon ≤ height`);
  }
}

// ── the two families: caret = font (rhythm); density rides the gap, NOT the frame ──
{
  const comf = G.geomScale({ treatment: "comfortable" });
  const comp = G.geomScale({ treatment: "compact" });
  ok(Object.values(comf.sizes).every((s) => s.caret === s.font), "caret = font at every size (the rhythm rule)");
  // compact (density 0.75) tightens the gap but NOT the centering padding (the frame is geometric).
  // compare at the SAME height so density is the only variable.
  const a = G.geomScale({ treatment: "comfortable", baseHeight: 28 }).sizes.MD;
  const b = G.geomScale({ treatment: "compact", baseHeight: 28 }).sizes.MD;
  ok(b.gap < a.gap, `compact gap < comfortable gap at same height (got ${b.gap} vs ${a.gap})`);
  ok(b.padding === a.padding, `density does NOT change the frame padding (got ${b.padding} vs ${a.padding})`);
  void comp;
}

// ── baseHeight scales the whole ramp uniformly (the shape is preserved) ──
{
  const a = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const b = G.geomScale({ treatment: "comfortable", baseHeight: 40 });
  ok(b.sizes.MD.height > a.sizes.MD.height, "a larger baseHeight scales MD up");
  ok(b.sizes["2XL"].height > a.sizes["2XL"].height, "a larger baseHeight scales 2XL up too");
}

// ── unknown treatment falls back to the first ──
ok(G.geomScale({ treatment: "nope" }).treatment === G.GEOMETRY_TREATMENTS[0].id, "unknown treatment → first treatment");

// ── radius ladder + space scale present and monotonic ──
{
  const s = G.geomScale({ treatment: "comfortable" });
  ok(s.radii.none === 0 && s.radii.full === 9999, "radius ladder: none 0, full pill (9999)");
  ok(s.radii.sm <= s.radii.md && s.radii.md <= s.radii.lg, "radius ladder monotonic sm≤md≤lg");
  const sp = Object.values(s.space);
  ok(sp[0] === 0 && sp.every((v, i) => i === 0 || v >= sp[i - 1]), `space scale starts 0 and is monotonic (${sp})`);
}

// ── CSS emit: custom props + a utility class per size ──
{
  const css = G.geomTokensCSS(G.geomScale({ treatment: "comfortable" }));
  ok(css.includes("--size-md-height:") && css.includes("--radius-sm:") && css.includes("--space-4:"), "CSS has size + radius + space custom props");
  ok(/\.control-md\s*\{[^}]*block-size: var\(--size-md-height\)[^}]*padding-block: 0/.test(css), "CSS emits a .control-md utility class (block-size lever, padding-block 0)");
}

// ── responsive CSS: per-breakpoint @media blocks re-declaring the per-size vars (Phase 5.4) ──
{
  const base = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const touch = G.geomScale({ treatment: "comfortable", baseHeight: 40 });
  const css = G.geomTokensResponsiveCSS(base, [{ name: "Touch", minWidth: 600, scale: touch }, { name: "NoWidth", scale: touch }]);
  ok(css.startsWith(G.geomTokensCSS(base)), "responsive CSS begins with the full base CSS");
  ok(/@media \(min-width: 600px\) \{\s*:root \{[^}]*--size-md-height: 40px/.test(css), "a mode with minWidth emits @media re-declaring the size vars at the mode's base height");
  ok((css.match(/@media/g) || []).length === 1, "a mode WITHOUT a minWidth is skipped (no @media)");
  ok(G.geomTokensResponsiveCSS(base, []) === G.geomTokensCSS(base), "no modes → identical to the base CSS");
}

// ── DTCG emit: size composite + radius + space dimension groups ──
{
  const d = G.geomTokensDTCG(G.geomScale({ treatment: "spacious" }));
  ok(d.size && d.radius && d.space, "DTCG has size/radius/space groups");
  ok(d.size.MD.height.$type === "dimension" && /px$/.test(d.size.MD.height.$value), "DTCG dimension token (px value)");
  ok(d.size.MD.padding.$type === "dimension" && d.radius.full.$type === "dimension", "DTCG padding + radius are dimension tokens");
}

// ── COMPOSITION with typography: the per-step `font` comes from the type UI scale, the frame is untouched ──
{
  const ts = typeScale({ treatment: "product", bodyBase: 16 });
  const standalone = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const composed = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { typeScale: ts });
  ok(composed.typed === true && standalone.typed === false, "geomScale reports `typed` only when a type scale is supplied");
  for (const name of ["XS", "SM", "MD", "LG", "XL", "2XL"]) {
    ok(composed.sizes[name].font === ts.categories.UI[name].size, `${name}: composed font = type UI ${name} size (${composed.sizes[name].font} vs ${ts.categories.UI[name].size})`);
    ok(composed.sizes[name].caret === composed.sizes[name].font, `${name}: caret follows the shared font`);
    // the FRAME is unchanged by composition — the centering law still holds with the shared font
    ok(composed.sizes[name].height === standalone.sizes[name].height && composed.sizes[name].padding === standalone.sizes[name].padding, `${name}: composition leaves height + padding (the frame) untouched`);
    ok(composed.sizes[name].padding === (composed.sizes[name].height - composed.sizes[name].icon) / 2, `${name}: centering law holds on the composed scale`);
  }
  // the two engines share ONE number — a bigger body base scales the control text too
  const big = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { typeScale: typeScale({ treatment: "product", bodyBase: 22 }) });
  ok(big.sizes.MD.font > composed.sizes.MD.font, "a larger type bodyBase scales the geometry font (shared source of truth)");
}

// ── per-cell HEIGHT overrides (Tokens-matrix Phase 3): the height lever; icon/font/pad/radius all re-derive ──
{
  const baseline = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  // IDENTITY: no overrides (and an empty map) is byte-identical to the un-overridden scale.
  ok(JSON.stringify(G.geomScale({ treatment: "comfortable", baseHeight: 28 }, {})) === JSON.stringify(baseline), "no overrides ⇒ scale is byte-identical (identity gate)");
  ok(JSON.stringify(G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: {} })) === JSON.stringify(baseline), "empty overrides ⇒ scale is byte-identical (identity gate)");
  // an override feeds buildSize as the rawHeight, so EVERY derived dim re-computes via the laws.
  const ovH = 50;
  const ref = G.geomScale({ treatment: "comfortable", baseHeight: 50 }).sizes.MD; // what a 50px raw height yields through buildSize
  const ov = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: { MD: ovH } }).sizes.MD;
  ok(ov.height === ref.height, `override height drives buildSize (got ${ov.height}, want ${ref.height})`);
  ok(ov.icon === ref.icon && ov.font === ref.font && ov.padding === ref.padding && ov.radiusPill === ref.radiusPill && ov.caret === ref.caret && ov.gap === ref.gap, "icon/font/pad/radius/caret/gap ALL re-derive from the override via the laws");
  ok(ov.padding === (ov.height - ov.icon) / 2, "the centering law still holds on the overridden cell");
  // only the targeted size changes — every other size stays at the baseline.
  const ovScale = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: { MD: ovH } });
  ok(ovScale.sizes.LG.height === baseline.sizes.LG.height && ovScale.sizes.XS.height === baseline.sizes.XS.height, "an override touches only its size, no others");
  // composition still applies on top: the type UI font wins for the overridden cell's `font` (frame re-derives from height).
  const ts = typeScale({ treatment: "product", bodyBase: 16 });
  const comp = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { typeScale: ts, overrides: { MD: ovH } }).sizes.MD;
  ok(comp.font === ts.categories.UI.MD.size && comp.height === ref.height, "composition + override coexist: font from the type UI scale, frame from the override height");
  // a non-positive / non-numeric override is ignored (no effect).
  ok(JSON.stringify(G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: { MD: 0, LG: -3, XS: NaN } })) === JSON.stringify(baseline), "non-positive / NaN overrides are ignored (no effect)");
}

// ── Figma number-variable emit: a "Geometry" collection of unitless FLOAT tokens ──
{
  const f = G.geomTokensFigma(G.geomScale({ treatment: "comfortable" }));
  ok(f.Geometry && f.Geometry.size && f.Geometry.radius && f.Geometry.space, "Figma export wraps a Geometry collection (size/radius/space)");
  ok(f.Geometry.size.MD.height.$type === "number" && typeof f.Geometry.size.MD.height.$value === "number", "Figma tokens are number ($type number, numeric unitless value)");
  ok(f.Geometry.radius.full.$type === "number" && f.Geometry.space["4"].$type === "number", "radius + space are number variables too");
}

if (fails.length) { console.error(`geometry FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("geometry PASS — the ramp, the centering law, the two families, treatments, CSS + DTCG emit");
process.exit(0);
