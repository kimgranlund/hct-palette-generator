// persist.js — UI state persistence for the HCT Palette Generator.
//
// A PURE serialize/hydrate transform pair over the tool's `State` (spec-draft §7,
// knowledge-02 §2). No storage I/O lives here: the live chain
// `window.storage -> localStorage -> in-memory` under STORAGE_KEY (ADR-010,
// spec-draft §11) is the running tool's concern. This module only owns the two
// pure, testable halves of that chain:
//
//   serialize(state)   -> a plain JSON-able snapshot (the bytes the chain stores)
//   hydrate(snapshot)  -> a valid State, every field clamped to its DOMAIN
//
// The two invariants this file is built to (the harness checks them over a sealed,
// withheld-seed fuzzed State set, so this must be a real identity-preserving clamp,
// not an identity table and not a clamp-to-default):
//
//   (1) ROUNDTRIP IDENTITY — for any State whose every field is already in its
//       domain, hydrate(serialize(S)) deep-equals S EXACTLY. In-domain fields are
//       NEVER mutated, rounded, defaulted, or reset. Fractional and on-the-bound
//       values survive byte-for-byte; palette array contents and order are preserved.
//
//   (2) PER-FIELD CLAMP — when a field is out of its domain, ONLY that field is
//       moved to its nearest valid bound; every other (in-domain) field, including
//       sibling fields inside the same palette object, is preserved byte-for-byte.
//
// No dependencies.

// The persistence key — the exact slot the storage chain reads/writes (spec-draft §11).
// Renamed from "hct-palette-state-v1" with the product rename; app.js migrates old saved data forward.
export const STORAGE_KEY = "nonoun-color-tokens";

// ── DOMAINS ────────────────────────────────────────────────────────────────────
// One descriptor per State field. Two kinds:
//   number : { kind:"number", min, max }    -> clamp into [min, max]; nearest bound.
//   enum   : { kind:"enum", values, default} -> keep if in `values`, else `default`.
// `on` is a boolean (coerced), `selected` is a relational integer bound (against
// palettes.length), and `palettes[i]` fields each get their own descriptor — all
// handled explicitly below since they aren't plain top-level scalars.
export const DOMAINS = {
  // top-level State
  curve: { kind: "enum", values: ["linear", "sine", "cubic", "logistic", "exp"], default: "logistic" },
  tension: { kind: "number", min: 0, max: 100 },
  // defaults so an ABSENT field hydrates to the sensible value, NOT the domain floor: a config that
  // omits these (e.g. a hand-authored or partial import) otherwise gets lmax 60 / lmin 0 / damp 0 —
  // which caps the whole ramp dark. (Present in-domain values still round-trip exactly; ?? only fills null.)
  lmin: { kind: "number", min: 0, max: 40, default: 5 },
  lmax: { kind: "number", min: 60, max: 100, default: 100 },
  damp: { kind: "number", min: 0, max: 100, default: 80 },
  // differential damping curve — defaults reproduce the legacy edge damp, and a
  // doc that predates these fields hydrates to the default (not the floor).
  dampCurve: { kind: "number", min: 0.5, max: 4, default: 1.5 },
  dampAmp: { kind: "number", min: 0, max: 100, default: 0 },
  dampBias: { kind: "number", min: -100, max: 100, default: 0 },
  hueSpace: { kind: "enum", values: ["cam16", "oklch"], default: "cam16" },
  // ramp distribution mode (see tonal.js DEFAULT_CONTROLS.toneMode). Default "perceptual".
  toneMode: { kind: "enum", values: ["even", "perceptual", "peak"], default: "perceptual" },
  theme: { kind: "enum", values: ["auto", "light", "dark"], default: "auto" },
  // `selected` is an integer in [0, palettes.length-1] — a relational bound, so its
  // upper limit depends on the hydrated palette count (see hydrate()).
  selected: { kind: "index" },
  // per-palette numeric fields; `name` is a free string (no domain), `on` is boolean.
  palette: {
    hue: { kind: "number", min: 0, max: 360 },
    chroma: { kind: "number", min: 0, max: 100 },
    skew: { kind: "number", min: -100, max: 100 },
    lift: { kind: "number", min: -40, max: 40 },
    hueShift: { kind: "number", min: -60, max: 60, default: 0 }, // edge hue rotation
  },
};

// ── clamp helpers ────────────────────────────────────────────────────────────────

// Number clamp to the nearest valid bound. Returns the input UNCHANGED when it is
// already inside [min, max] (inclusive) — that identity is invariant (1). NaN/non-finite
// or a non-number falls back to `min` (the field can't be left invalid).
function clampNumber(v, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v)) return min;
  if (v < min) return min;       // below floor -> floor (e.g. lmax 45 -> 60)
  if (v > max) return max;       // above ceil  -> ceil  (e.g. tension 140 -> 100)
  return v;                      // in-domain (incl. fractional / on-the-bound) -> as-is
}

// Enum clamp: keep the value iff it's a member of the allowed set, else the documented
// default. An in-set value is returned by reference, so it is preserved exactly.
function clampEnum(v, values, dflt) {
  return values.includes(v) ? v : dflt;
}

// Per-palette clamp. Builds a fresh object so the result is a clean State, but copies
// each field through its own rule so an out-of-domain field is clamped ALONE and every
// in-domain sibling is preserved byte-for-byte (defeats the reset-whole-palette exploit).
function clampPalette(p) {
  const src = (p && typeof p === "object") ? p : {};
  const D = DOMAINS.palette;
  return {
    name: typeof src.name === "string" ? src.name : "",         // free string, kept as-is
    hue: clampNumber(src.hue, D.hue.min, D.hue.max),            // 0..360  (410 -> 360)
    chroma: clampNumber(src.chroma, D.chroma.min, D.chroma.max), // 0..100
    skew: clampNumber(src.skew, D.skew.min, D.skew.max),        // -100..100
    lift: clampNumber(src.lift, D.lift.min, D.lift.max),        // -40..40
    hueShift: clampNumber(src.hueShift ?? D.hueShift.default, D.hueShift.min, D.hueShift.max), // -60..60, absent -> 0
    hueSameDir: src.hueSameDir === true,                        // both-ends-same-direction flag (boolean)
    on: src.on === true,                                        // coerce to boolean
  };
}

// Per-doc semantic-mapping overrides: { [roleKey]: { light?, dark? } } — a role re-pointed to a
// different raw ref per mode (the canonical role table is the default; overrides layer on top).
// Shape-clamped ONLY (light/dark kept iff strings); ref VALIDITY is the consumer's concern
// (resolveRoleHex degrades an unknown ref gracefully), so persist stays dependency-free. An
// in-domain override map round-trips identically; absent -> {} (the backward-compatible default).
function clampOverrides(o) {
  if (!o || typeof o !== "object") return {};
  const out = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (!v || typeof v !== "object") continue;
    const e = {};
    if (typeof v.light === "string") e.light = v.light;
    if (typeof v.dark === "string") e.dark = v.dark;
    if (Object.keys(e).length) out[k] = e;
  }
  return out;
}

// ── serialize ─────────────────────────────────────────────────────────────────────
// Produce a plain JSON-able snapshot of `state`. This is a faithful copy (no lossy
// transform, no rounding, no reordering of palette contents), so that for an in-domain
// State the snapshot carries every value unchanged and hydrate can reproduce it exactly.
// JSON.parse(JSON.stringify(...)) gives a deep, plain, structurally-identical clone.
export function serialize(state) {
  return JSON.parse(JSON.stringify(state));
}

// ── hydrate ─────────────────────────────────────────────────────────────────────
// Turn an (untrusted) snapshot into a valid State with every field clamped to its
// DOMAIN. Identity-preserving: an already-in-domain field is copied through untouched;
// only a violated field is moved to its nearest valid bound. NOT a clamp-to-default and
// NOT a reset — those discard user state and fail the sealed roundtrip/per-field gates.
export function hydrate(snapshot) {
  const s = (snapshot && typeof snapshot === "object") ? snapshot : {};

  // Palettes first: `selected`'s upper bound is relational to the hydrated count.
  const rawPalettes = Array.isArray(s.palettes) ? s.palettes : [];
  const palettes = rawPalettes.map(clampPalette);

  // `selected` is an integer in [0, palettes.length-1]. With no palettes the only
  // valid index is 0 (max(0, length-1) keeps the lower bound from inverting). An
  // in-range index (incl. exactly length-1) is preserved; 9 with 2 palettes -> 1.
  const maxIndex = Math.max(0, palettes.length - 1);
  let selected = s.selected;
  if (typeof selected !== "number" || !Number.isFinite(selected)) selected = 0;
  else if (selected < 0) selected = 0;
  else if (selected > maxIndex) selected = maxIndex;
  // (no rounding of an in-range integer: an in-domain integer stays byte-for-byte)

  return {
    curve: clampEnum(s.curve, DOMAINS.curve.values, DOMAINS.curve.default),
    tension: clampNumber(s.tension, DOMAINS.tension.min, DOMAINS.tension.max),
    lmin: clampNumber(s.lmin ?? DOMAINS.lmin.default, DOMAINS.lmin.min, DOMAINS.lmin.max),
    lmax: clampNumber(s.lmax ?? DOMAINS.lmax.default, DOMAINS.lmax.min, DOMAINS.lmax.max),
    damp: clampNumber(s.damp ?? DOMAINS.damp.default, DOMAINS.damp.min, DOMAINS.damp.max),
    dampCurve: clampNumber(s.dampCurve ?? DOMAINS.dampCurve.default, DOMAINS.dampCurve.min, DOMAINS.dampCurve.max),
    dampAmp: clampNumber(s.dampAmp ?? DOMAINS.dampAmp.default, DOMAINS.dampAmp.min, DOMAINS.dampAmp.max),
    dampBias: clampNumber(s.dampBias ?? DOMAINS.dampBias.default, DOMAINS.dampBias.min, DOMAINS.dampBias.max),
    hueSpace: clampEnum(s.hueSpace, DOMAINS.hueSpace.values, DOMAINS.hueSpace.default),
    relChroma: s.relChroma === true, // boolean chroma-basis flag; absent/non-true -> false (legacy default)
    toneMode: clampEnum(s.toneMode, DOMAINS.toneMode.values, DOMAINS.toneMode.default),
    theme: clampEnum(s.theme, DOMAINS.theme.values, DOMAINS.theme.default),
    selected,
    roleOverrides: clampOverrides(s.roleOverrides),
    palettes,
  };
}
