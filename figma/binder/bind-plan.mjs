// bind-plan.mjs — the PURE, testable binding planner for the Figma cascade binder.
//
// This is the harness-importable core of capability.system.figma-plugin. It carries NO
// Figma runtime and NO I/O: it is a deterministic transform of the validated semantic
// role table (capability.system.semantic-mapping) into the raw-colors variable names a
// binder aliases. code.js replicates this same logic against the live `figma` global; this
// module is what the harness imports and tests in isolation.
//
// CONTRACT (the load-bearing checks):
//   bindingTargets(paletteNames) -> de-duped, sorted string[] of every raw-colors target
//     the binder aliases. For each palette n, for each of its 37 semantic roles, BOTH the
//     light and the dark ref become a target "{n}/{refKey(ref)}". Because every target is
//     refKey(ref) of a ref drawn from the validated role table (solid stops in EXPORT_STOPS
//     -> pad3; scrims on base 500 / 250 / 500 with alpha% = step/10 -> "{base}-{step}" verbatim),
//     every emitted name is GUARANTEED to be a member of the canonical raw-colors name set
//     (data/role-table.json: "{n}/{pad3(stop)}" UNION "{n}/{base}-{step}"). No string is hand-
//     built — refKey is the single normaliser shared with the semantic layer, so padding and
//     scrim grammar cannot drift ("50"->"050", never the dangling "50"; a scrim is
//     "500-{step}" with step an EXPORT_STOP, e.g. "500-200").
//
//   bindingPlan(paletteNames) -> [{ semanticVar, lightTarget, darkTarget }, ...]
//     One entry per (palette, role) in role order, no de-dup: the explicit Light/Dark alias
//     plan a binder executes (createVariableAlias on the light raw var into the Light mode,
//     on the dark raw var into the Dark mode). semanticVar is "{n}{suffix}" (the palette name
//     followed by the role's suffix, e.g. "primary" for the prime role, "primary-dim",
//     "neutral-scrim").

import { semanticRoles, refKey } from "../../src/engine/semantic.js";

/**
 * The raw-colors target a single ref resolves to for a palette: "{n}/{refKey(ref)}".
 * Centralised so light and dark targets are normalised identically.
 * @param {string} paletteName lowercase palette name (e.g. "primary")
 * @param {string} ref a role ref: a solid stop ("550") or a scrim ("500-200")
 * @returns {string}
 */
function targetName(paletteName, ref) {
  return `${paletteName}/${refKey(ref)}`;
}

/**
 * Every raw-colors variable name the binder aliases across the given palettes.
 * For each palette, each of its 37 roles contributes BOTH its light and its dark target.
 * @param {string[]} paletteNames lowercase palette names
 * @returns {string[]} de-duped, lexicographically sorted target names
 */
export function bindingTargets(paletteNames) {
  const targets = new Set();
  for (const n of paletteNames) {
    for (const r of semanticRoles(n)) {
      targets.add(targetName(n, r.light));
      targets.add(targetName(n, r.dark));
    }
  }
  return [...targets].sort();
}

/**
 * The explicit Light/Dark alias plan: one entry per (palette, role), in role order.
 * @param {string[]} paletteNames lowercase palette names
 * @returns {{ semanticVar: string, lightTarget: string, darkTarget: string }[]}
 */
export function bindingPlan(paletteNames) {
  const plan = [];
  for (const n of paletteNames) {
    for (const r of semanticRoles(n)) {
      plan.push({
        semanticVar: `${n}${r.suffix}`,
        lightTarget: targetName(n, r.light),
        darkTarget: targetName(n, r.dark),
      });
    }
  }
  return plan;
}
