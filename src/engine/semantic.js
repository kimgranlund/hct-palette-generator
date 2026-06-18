// semantic-mapping — the 37 semantic token roles per palette.
//
// Two-layer model: raw primitives are mode-independent; the light/dark FLIP
// lives only here in the semantic layer. Each role declares a `light` ref and a
// `dark` ref (a solid stop like "550" or a scrim like "500-200"). Token names and
// CSS var() references use refKey() to normalise those refs.
//
// `paletteName` is lowercase (e.g. "primary", "success"). Two substitutions:
//   {n} = paletteName              -> accent / on-accent KEYS are name-prefixed
//   {N} = Capitalized paletteName  -> e.g. on{N} => "onSuccess"
// Shared roles (surface*, scrim*, outline*, container*, inverse*, onSurface*,
// background) are identical for every palette — they are NOT name-prefixed.
//
// The canonical answer key for paletteName="primary" is data/role-table.json's
// `roleTable`; semanticRoles("primary") must deep-equal it (key, suffix, light,
// dark, same order). No dependencies.

// Scrim ramp: the palette's 500 color at alpha% = step/10 — a translucency sub-variant of
// the palette (so it tracks the 500 stop as hue/chroma/skew/lift change). A scrim ref is
// "500-{step}" (e.g. "500-200" = 500 @ 20%).
//
// The 7 semantic scrim STRENGTHS map onto a 7-step subset of the emitted ramp, weakest ->
// strongest, spanning the full 5%..95% range. This is distinct from the full set of raw scrim
// primitives EMITTED (exports.js SCRIM_STEPS = 11 steps) — the export ramp carries more steps
// than the 7 strengths bind to. outline + containers also resolve onto the 500 ramp (below).
const SCRIM_STRENGTH_STEPS = [50, 100, 200, 400, 600, 800, 950];

// Suffix per scrim level, weakest (index 0) -> strongest (index 6).
const SCRIM_SUFFIXES = [
  '-scrim-weakest',
  '-scrim-weaker',
  '-scrim-weak',
  '-scrim',
  '-scrim-strong',
  '-scrim-stronger',
  '-scrim-strongest',
];

// Key per scrim level, weakest -> strongest. `scrim` (index 3) is the plain mid.
const SCRIM_KEYS = [
  'scrimWeakest',
  'scrimWeaker',
  'scrimWeak',
  'scrim',
  'scrimStrong',
  'scrimStronger',
  'scrimStrongest',
];

/**
 * Normalise a ref for use in token names / CSS var() references.
 * - Solid stops are zero-padded to 3 digits: "50" -> "050", "550" -> "550".
 * - Scrim refs keep their "-{step}" suffix and pad the base stop: "500-200" -> "500-200",
 *   "50-2" -> "050-2".
 * @param {string} ref e.g. "50", "550", "500-200"
 * @returns {string}
 */
export function refKey(ref) {
  const s = String(ref);
  const dash = s.indexOf('-');
  if (dash === -1) {
    // Solid stop: pad the whole thing to 3 digits.
    return s.padStart(3, '0');
  }
  // Scrim: pad the base stop, preserve the "-index" suffix verbatim.
  const base = s.slice(0, dash);
  const rest = s.slice(dash); // includes the leading "-"
  return base.padStart(3, '0') + rest;
}

/**
 * Build the canonical 37-role semantic table for a palette.
 * @param {string} paletteName lowercase palette name (e.g. "primary")
 * @returns {{ key: string, suffix: string, light: string, dark: string }[]}
 */
export function semanticRoles(paletteName) {
  const n = paletteName;
  const N = paletteName.charAt(0).toUpperCase() + paletteName.slice(1);

  const roles = [];
  const role = (key, suffix, light, dark) =>
    roles.push({ key, suffix, light, dark });

  // 1. ACCENT — name-prefixed keys; suffix builds --c-{n}{suffix}.
  //    Prime role has empty suffix => --c-{n}. Refs are raw solid stops.
  role(`${n}`, '', '550', '450'); // prime: 550 light / 450 dark
  role(`${n}Dim`, '-dim', '650', '700');
  role(`${n}Bright`, '-bright', '350', '400');
  role(`${n}Low`, '-low', '350', '700');
  role(`${n}High`, '-high', '650', '400');

  // 2. ON-ACCENT — name-prefixed; fixed to the light end in BOTH modes (OD-001).
  role(`on${N}`, `-on-${n}`, '50', '50');
  role(`on${N}Variant`, `-on-${n}-variant`, '200', '200');

  // 3. ON-SURFACE — shared keys (NOT name-prefixed).
  role('onSurface', '-on-surface', '950', '50');
  role('onSurfaceVariant', '-on-surface-variant', '750', '250');

  // 4. OUTLINE — shared; on the 500 scrim ramp (light === dark).
  role('outline', '-outline', '500-600', '500-600');
  role('outlineVariant', '-outline-variant', '500-400', '500-400');

  // 5. CONTAINER — shared; on the 500 scrim ramp (light === dark).
  role('container', '-container', '500-200', '500-200');
  role('containerLow', '-container-low', '500-100', '500-100');
  role('containerHigh', '-container-high', '500-300', '500-300');

  // 6. SCRIM — shared; 7 strengths, all on the 500 ramp at alpha% = step/10.
  //    Mode-independent: light === dark === `500-${step}`. Generated via loop.
  for (let i = 0; i < SCRIM_STRENGTH_STEPS.length; i++) {
    const ref = `500-${SCRIM_STRENGTH_STEPS[i]}`;
    role(SCRIM_KEYS[i], SCRIM_SUFFIXES[i], ref, ref);
  }

  // 7. INVERSE — shared.
  role('inverseSurface', '-inverse-surface', '900', '100');
  role('inverseOnSurface', '-inverse-on-surface', '50', '950');

  // 8. SURFACE — shared base surfaces.
  role('background', '-background', '100', '900');
  role('surface', '-surface', '125', '875');

  // 9. SURFACE DIM/BRIGHT — shared; non-mirror (light+dark do NOT sum to 1000).
  //    Same direction in both modes: a "dim" surface is a darker stop in both.
  role('surfaceDimmest', '-surface-dimmest', '200', '950');
  role('surfaceDimmer', '-surface-dimmer', '175', '925');
  role('surfaceDim', '-surface-dim', '150', '900');
  role('surfaceBright', '-surface-bright', '100', '850');
  role('surfaceBrighter', '-surface-brighter', '75', '825');
  role('surfaceBrightest', '-surface-brightest', '50', '800');

  // 10. SURFACE LOW/HIGH — shared; mirror (light+dark sum toward 1000) so
  //     "lower" reads recessed and "higher" raised regardless of mode.
  role('surfaceLowest', '-surface-lowest', '50', '950');
  role('surfaceLower', '-surface-lower', '75', '925');
  role('surfaceLow', '-surface-low', '100', '900');
  role('surfaceHigh', '-surface-high', '150', '850');
  role('surfaceHigher', '-surface-higher', '175', '825');
  role('surfaceHighest', '-surface-highest', '200', '800');

  return roles;
}

/**
 * Apply per-doc overrides on top of the canonical role table. Each override re-points a role's
 * light/dark raw ref (absent fields keep the canonical). The canonical table is UNCHANGED — this
 * is an editor-layer customization (the document carries the overrides), NOT part of semanticRoles,
 * so the spec's canonical-equality criterion still holds for semanticRoles itself.
 * @param {{key:string,suffix:string,light:string,dark:string}[]} roles canonical roles
 * @param {Object} [overrides] { [roleKey]: { light?:string, dark?:string } }
 * @returns {{key,suffix,light,dark}[]}
 */
export function applyRoleOverrides(roles, overrides) {
  if (!overrides || typeof overrides !== 'object') return roles;
  return roles.map((r) => {
    const o = overrides[r.key];
    if (!o) return r;
    return { ...r, light: o.light ?? r.light, dark: o.dark ?? r.dark };
  });
}
