// figma-semantic-binder/code.js — the Color Tokens cascade binder runtime.
//
// Runs inside Figma (uses the `figma` global). It gives the live raw->semantic cascade that
// native JSON import cannot (knowledge-05 §1): each semantic role is aliased to the REAL raw
// Variable object via figma.variables.createVariableAlias, so editing a raw color propagates
// to every semantic role that aliases it.
//
// OFFLINE (ADR-010 / AC-P3): no network I/O. No fetch / XMLHttpRequest / WebSocket / dynamic
// import() of a remote URL / figma.showUI to a remote origin. manifest.networkAccess === "none".
//
// PARITY: the binding loop below MIRRORS ../bind-plan.mjs (bindingPlan / bindingTargets) — the
// same role table, the same refKey normaliser, the same "{n}/{refKey(ref)}" target grammar.
// bind-plan.mjs is the pure, harness-tested source of truth; this file replicates it verbatim
// because Figma plugin code runs in a non-module sandbox and cannot import the .mjs at run time.
// Both derive from the validated capability.system.semantic-mapping role table. Because every
// target is refKey() of a ref from that table (solid stop -> pad3 "050"; scrim base 250/500/750
// with alpha% = step/10 -> "{base}-{step}" verbatim), every emitted "{n}/{refKey}" is a member of
// the canonical raw-colors name set — no unpadded "{n}/50", no out-of-range "{n}/500-999".

const RAW_COLLECTION = "Color Primitives";
const SEMANTIC_COLLECTION = "Color Modes";

// The 8 default palettes (knowledge-05 §3; defaults[].name in data/role-table.json).
const PALETTES = [
  "neutral",
  "primary",
  "secondary",
  "tertiary",
  "info",
  "success",
  "danger",
  "warning",
];

// refKey: mirror of semantic.js / bind-plan.mjs. Solid stops zero-pad to 3 digits
// ("50" -> "050"); scrim refs ("500-200") keep the "-step" suffix and pad the base stop.
function refKey(ref) {
  const s = String(ref);
  const dash = s.indexOf("-");
  if (dash === -1) return s.padStart(3, "0");
  return s.slice(0, dash).padStart(3, "0") + s.slice(dash);
}

// roleTable(n) — the 37 roles for a palette, name-substituted exactly as semantic.js /
// bind-plan.mjs produce them: accent + on-accent keys carry the palette name; shared roles do
// not. Refs are the canonical values from data/role-table.json (validated semantic-mapping).
// `key` is the semantic variable name part ("{n}/{key}"); `light`/`dark` feed targetName.
function roleTable(n) {
  const N = n.charAt(0).toUpperCase() + n.slice(1);
  return [
    // 1. ACCENT — name-prefixed; prime role has empty suffix.
    { key: n, suffix: "", light: "550", dark: "450" },
    { key: n + "Dim", suffix: "-dim", light: "650", dark: "700" },
    { key: n + "Bright", suffix: "-bright", light: "350", dark: "400" },
    { key: n + "Low", suffix: "-low", light: "350", dark: "700" },
    { key: n + "High", suffix: "-high", light: "650", dark: "400" },

    // 2. ON-ACCENT — name-prefixed; fixed to the light end in BOTH modes (OD-001).
    { key: "on" + N, suffix: "-on-" + n, light: "50", dark: "50" },
    { key: "on" + N + "Variant", suffix: "-on-" + n + "-variant", light: "200", dark: "200" },

    // 3. ON-SURFACE — shared.
    { key: "onSurface", suffix: "-on-surface", light: "950", dark: "50" },
    { key: "onSurfaceVariant", suffix: "-on-surface-variant", light: "750", dark: "250" },

    // 4. OUTLINE — shared; on the 500 scrim ramp (light === dark).
    { key: "outline", suffix: "-outline", light: "500-600", dark: "500-600" },
    { key: "outlineVariant", suffix: "-outline-variant", light: "500-300", dark: "500-300" },

    // 5. CONTAINER — shared; on the 500 scrim ramp (light === dark).
    { key: "container", suffix: "-container", light: "500-200", dark: "500-200" },
    { key: "containerLow", suffix: "-container-low", light: "500-100", dark: "500-100" },
    { key: "containerHigh", suffix: "-container-high", light: "500-300", dark: "500-300" },

    // 6. INVERSE — shared.
    { key: "inverseSurface", suffix: "-inverse-surface", light: "900", dark: "100" },
    { key: "inverseOnSurface", suffix: "-inverse-on-surface", light: "50", dark: "950" },

    // 7. SURFACE — shared base surfaces.
    { key: "background", suffix: "-background", light: "100", dark: "900" },
    { key: "surface", suffix: "-surface", light: "125", dark: "875" },

    // 8. SURFACE DIM/BRIGHT — shared; non-mirror.
    { key: "surfaceDimmest", suffix: "-surface-dimmest", light: "200", dark: "950" },
    { key: "surfaceDimmer", suffix: "-surface-dimmer", light: "175", dark: "925" },
    { key: "surfaceDim", suffix: "-surface-dim", light: "150", dark: "900" },
    { key: "surfaceBright", suffix: "-surface-bright", light: "100", dark: "850" },
    { key: "surfaceBrighter", suffix: "-surface-brighter", light: "75", dark: "825" },
    { key: "surfaceBrightest", suffix: "-surface-brightest", light: "50", dark: "800" },

    // 9. SURFACE LOW/HIGH — shared; mirror (sum 1000).
    { key: "surfaceLowest", suffix: "-surface-lowest", light: "50", dark: "950" },
    { key: "surfaceLower", suffix: "-surface-lower", light: "75", dark: "925" },
    { key: "surfaceLow", suffix: "-surface-low", light: "100", dark: "900" },
    { key: "surfaceHigh", suffix: "-surface-high", light: "150", dark: "850" },
    { key: "surfaceHigher", suffix: "-surface-higher", light: "175", dark: "825" },
    { key: "surfaceHighest", suffix: "-surface-highest", light: "200", dark: "800" },

    // 10. SCRIM — shared; 7 strengths on the 500 ramp (alpha% = step/10), mode-independent.
    //     Listed LAST (mirrors semantic.js) so the bound variables group regular → containers →
    //     surfaces → scrims. Sequential 5–60%: weakest..strongest = 50/100/200/300/400/500/600.
    { key: "scrimWeakest", suffix: "-scrim-weakest", light: "500-50", dark: "500-50" },
    { key: "scrimWeaker", suffix: "-scrim-weaker", light: "500-100", dark: "500-100" },
    { key: "scrimWeak", suffix: "-scrim-weak", light: "500-200", dark: "500-200" },
    { key: "scrim", suffix: "-scrim", light: "500-300", dark: "500-300" },
    { key: "scrimStrong", suffix: "-scrim-strong", light: "500-400", dark: "500-400" },
    { key: "scrimStronger", suffix: "-scrim-stronger", light: "500-500", dark: "500-500" },
    { key: "scrimStrongest", suffix: "-scrim-strongest", light: "500-600", dark: "500-600" },
  ];
}

// The raw-colors target a ref resolves to: "{n}/{refKey(ref)}" — the load-bearing grammar.
// Identical to bind-plan.mjs targetName; guarantees membership in the canonical raw name set.
function targetName(paletteName, ref) {
  return paletteName + "/" + refKey(ref);
}

async function main() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const rawColl = collections.find((c) => c.name === RAW_COLLECTION);
  if (!rawColl) {
    figma.notify('No "Color Primitives" collection found — apply your palette in Color Tokens first, then run the Binder.', { error: true });
    figma.closePlugin();
    return;
  }

  // 1. Index the Color Primitives variables by name.
  const allVars = await figma.variables.getLocalVariablesAsync();
  const rawVars = {};
  for (const v of allVars) {
    if (v.variableCollectionId === rawColl.id) rawVars[v.name] = v;
  }

  // 2. Create/find the Color Modes collection with Light + Dark modes.
  let sem = collections.find((c) => c.name === SEMANTIC_COLLECTION);
  if (!sem) sem = figma.variables.createVariableCollection(SEMANTIC_COLLECTION);
  const lightMode = sem.modes[0].modeId;
  const darkMode = (sem.modes[1] && sem.modes[1].modeId) || sem.addMode("Dark");

  // 3. For each palette and role, resolve lt/dt = rawVars["{n}/{refKey(...)}"] and alias both
  //    modes by reference (the cascade). Mirrors bind-plan.mjs.bindingPlan.
  let bound = 0;
  const missing = [];
  for (const n of PALETTES) {
    for (const r of roleTable(n)) {
      const ltName = targetName(n, r.light);
      const dtName = targetName(n, r.dark);
      const lt = rawVars[ltName];
      const dt = rawVars[dtName];
      if (!lt) { missing.push(ltName); continue; }
      if (!dt) { missing.push(dtName); continue; }

      const semName = n + "/" + r.key;
      const refreshed = await figma.variables.getLocalVariablesAsync();
      const semVar =
        refreshed.find((v) => v.variableCollectionId === sem.id && v.name === semName) ||
        figma.variables.createVariable(semName, sem, "COLOR");

      semVar.setValueForMode(lightMode, figma.variables.createVariableAlias(lt));
      semVar.setValueForMode(darkMode, figma.variables.createVariableAlias(dt));
      bound++;
    }
  }

  figma.notify(
    "Bound " + bound + " roles" + (missing.length ? (", " + missing.length + " skipped (raw colour missing)") : "")
  );
  figma.closePlugin();
}

// Never surface a raw error / stack to the user (Figma policy): log the technical detail to the console,
// show a friendly message, and close cleanly.
main().catch((e) => {
  console.error("[Color Tokens Semantic Binder] bind failed:", e);
  figma.notify("Couldn't bind the semantic variables. Please try again — if it keeps happening, email support@nonoun.io.", { error: true });
  figma.closePlugin();
});
