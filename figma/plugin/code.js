// code.js — Ultimate Tokens by NONOUN, Figma plugin SANDBOX (the `main`).
//
// Runs in Figma's plugin VM: the `figma` global is available, but there is NO DOM, no
// fetch/XMLHttpRequest/WebSocket, no localStorage (ADR-010 / AC-P3 — offline by design;
// manifest networkAccess is "none"). The generator UI runs in the iframe (ui.html); this
// file only (a) opens that UI and (b) on an "apply" message turns the posted DTCG bundle
// into two Figma variable COLLECTIONS:
//
//   Color Primitives  (mode "Value")        — one COLOR var per stop/scrim, the concrete colors
//   Color Modes        (modes "Light","Dark")— one COLOR var per role, each mode ALIASED to the
//                                        raw var named by the leaf's com.figma.aliasData
//                                        (the live raw→semantic cascade native import can't do)
//
// The bundle comes from the UI's figmaBundle() = exportDTCG(state, { rawColl:"Color Primitives" }),
// so this file is palette-agnostic: it walks the tree, it does NOT hard-code the role table.

const RAW_COLLECTION = "Color Primitives";   // the raw color primitives (one "Value" mode)
const SEMANTIC_COLLECTION = "Color Modes";   // the semantic Light/Dark tokens

figma.showUI(__html__, { width: 1440, height: 900, themeColors: true });
// Tell the UI it is running inside Figma so it reveals its "Apply to Figma" button.
figma.ui.postMessage({ type: "figma-init" });

// CONFIG_KEY — the generator's parametric config, persisted IN this file on the DOCUMENT ROOT via
// setPluginData. This is the "source of truth" round-trip: the exact hue/chroma/skew/lift, global
// controls, AND role overrides — NOT the resolved colors (those are the variables, written by "apply",
// and cannot reverse-derive the params). Root pluginData is saved inside the .fig and TRAVELS WITH THE
// FILE (shared with everyone who opens it), unlike clientStorage which is per-user-machine. So a read
// reproduces the generator's state LOSSLESSLY instead of approximating it from the 500 colors.
const CONFIG_KEY = "nonoun-color-tokens-config"; // (matches SETS_KEY's `nonoun-color-tokens-*` naming)
const LEGACY_CONFIG_KEY = "hct-config"; // pre-rename key — read as a fallback so files saved before the
                                        // rename still load; the next writeConfig migrates them forward.

// SETS_KEY — the gallery's "Your Palettes" sets, persisted in figma.clientStorage (PER-USER, survives
// across plugin sessions). The plugin UI iframe has an opaque origin, so its localStorage is blocked /
// non-persistent; clientStorage is the sanctioned per-user store. (Mirrors the browser's localStorage
// key `nonoun-color-tokens-sets`, so the same gallery data model round-trips in both environments.)
const SETS_KEY = "nonoun-color-tokens-sets";

// FLOAT_REGISTRY_KEY — the PROVENANCE registry for the breakpoint-moded Type/Geometry collections, a
// name→collectionId map stored in root pluginData (travels with the .fig, like CONFIG_KEY). applyFloatPlans
// reconciles/prunes ONLY a collection we created (matched by id), so a user's OWN pre-existing collection
// named "Typography"/"Geometry" is never canonicalized or pruned — we make a separate one instead.
const FLOAT_REGISTRY_KEY = "nonoun-color-tokens-float-collections";

// writeConfig / readConfig — the file-embedded parametric config (root pluginData is a string store;
// getPluginData returns "" when unset). JSON-encoded; a corrupt value reads back as null, never throws.
function writeConfig(config) { figma.root.setPluginData(CONFIG_KEY, JSON.stringify(config)); }
function readConfig() {
  const raw = figma.root.getPluginData(CONFIG_KEY) || figma.root.getPluginData(LEGACY_CONFIG_KEY); // legacy fallback
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; } // NB: param required — Figma's plugin VM rejects optional catch binding (ES2019)
}
// readFloatRegistry / writeFloatRegistry — the {name: collectionId} provenance map (see FLOAT_REGISTRY_KEY).
function readFloatRegistry() {
  const raw = figma.root.getPluginData(FLOAT_REGISTRY_KEY);
  if (!raw) return {};
  try { const r = JSON.parse(raw); return r && typeof r === "object" ? r : {}; } catch (e) { return {}; }
}
function writeFloatRegistry(reg) { figma.root.setPluginData(FLOAT_REGISTRY_KEY, JSON.stringify(reg)); }

// ACTIONS — each request mapped to a human action, so a failure reads as "couldn't <do X>" instead of a
// raw developer error (Figma policy: never surface raw error text / stack traces to users).
const ACTIONS = {
  apply: "apply the variables",
  "save-config": "save the palette set",
  "load-config": "load the palette set",
  "read-variables": "read this file's variables",
  "load-sets": "load your palettes",
  "save-sets": "save your palettes",
};

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  try {
    if (msg.type === "apply") {
      // `dtcg` is OMITTED when the Color system is toggled off in the UI — skip the color collections
      // entirely (the existing ones are left untouched, not pruned). Type/Geometry filtering happens UI-side.
      const r = msg.dtcg ? await applyBundle(msg.dtcg, { rebuildSemantic: !!msg.rebuildSemantic }) : null;
      // Embed the exact params in the file ALONGSIDE the variables, so a later read round-trips
      // losslessly (the variables alone can only seed an approximate hue/chroma).
      if (msg.config) writeConfig(msg.config);
      // Type + Geometry breakpoint-moded FLOAT collections (UI-computed, pre-validated apply plans). Isolated
      // in its OWN try so a float-apply failure can't mask the color apply that already succeeded above — the
      // user still gets the color result (+ a console error), and a re-apply (idempotent) converges the rest.
      let fr = null;
      if (Array.isArray(msg.floatPlans) && msg.floatPlans.length) {
        try { fr = await applyFloatPlans(msg.floatPlans); }
        catch (e) { console.error("[Ultimate Tokens] type/geometry apply failed:", e); }
      }
      const parts = [];
      if (r) parts.push(`${r.raw} primitives + ${r.semantic} semantic variables (Light / Dark)` + (r.rebuilt ? ", regrouped" : "") + (r.pruned ? `, ${r.pruned} stale pruned` : ""));
      if (fr && fr.collections) parts.push(`${fr.variables} type/geometry variable${fr.variables === 1 ? "" : "s"} across ${fr.collections} collection${fr.collections === 1 ? "" : "s"}`);
      figma.notify(parts.length ? "Applied " + parts.join(" · ") : "Nothing to apply — every system is toggled off.");
      // Signal the iframe UI that the async write actually COMPLETED (its optimistic "Applying…" toast alone
      // can't know when the sandbox finishes) → onApplyDone shows a real "Applied N…" toast + closes the gate.
      figma.ui.postMessage({ type: "apply-done", raw: r ? r.raw : 0, semantic: r ? r.semantic : 0, floatVars: fr ? fr.variables : 0, floatCollections: fr ? fr.collections : 0 });
    } else if (msg.type === "save-config") {
      writeConfig(msg.config);
      figma.notify("Palette set saved into this file");
    } else if (msg.type === "load-config") {
      const config = readConfig();
      figma.ui.postMessage({ type: "config-loaded", config });
      if (!config) figma.notify("No saved palette set in this file");
    } else if (msg.type === "read-variables") {
      const live = await readRawColors(); // read-only reference for the drift diff
      figma.ui.postMessage({ type: "variables-read", found: live.found, raw: live.raw });
      if (!live.found) figma.notify('No "Color Primitives" collection in this file yet');
    } else if (msg.type === "load-sets") {
      // the gallery's saved sets, from this user's clientStorage (null on first run).
      const sets = await figma.clientStorage.getAsync(SETS_KEY);
      figma.ui.postMessage({ type: "sets-loaded", sets: sets || null });
    } else if (msg.type === "save-sets") {
      // persist the gallery's sets for this user (the localStorage the iframe can't use).
      await figma.clientStorage.setAsync(SETS_KEY, Array.isArray(msg.sets) ? msg.sets : []);
    }
  } catch (e) {
    // Log the technical detail to the console for debugging; show the user a friendly, actionable
    // message naming what was attempted (never the raw error / stack).
    console.error("[Color Tokens] '" + (msg && msg.type) + "' failed:", e);
    // Tell the iframe an apply FAILED so it can clear its optimistic "Applying…" toast (→ onApplyError).
    if (msg && msg.type === "apply") { try { figma.ui.postMessage({ type: "apply-error" }); } catch (e2) { /* UI gone */ } }
    const what = (msg && ACTIONS[msg.type]) || "complete that action";
    figma.notify("Color Tokens couldn't " + what + ". Please try again — if it keeps happening, email support@nonoun.io.", { error: true });
  }
};

// ── helpers ───────────────────────────────────────────────────────────────────
// rgbaOf — a DTCG color leaf's $value → Figma's {r,g,b,a} (components are already 0..1).
function rgbaOf(leaf) {
  const c = (leaf && leaf.$value) || leaf;
  const k = c.components;
  return { r: k[0], g: k[1], b: k[2], a: typeof c.alpha === "number" ? c.alpha : 1 };
}
// childKeys — a DTCG group's token children (skip $type/$value/$extensions).
const childKeys = (tree) => Object.keys(tree).filter((k) => k[0] !== "$");
// aliasTarget — the raw var name a semantic leaf points at (set when rawColl was on).
function aliasTarget(leaf) {
  const ad = leaf && leaf.$extensions && leaf.$extensions["com.figma.aliasData"];
  return ad ? ad.targetVariableName : null;
}
async function ensureCollection(name) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  return cols.find((c) => c.name === name) || figma.variables.createVariableCollection(name);
}
// ensureFloatCollection — OUR managed Type/Geometry collection for `name`, by PROVENANCE (the registry's
// stored id), creating + registering it if absent. Unlike ensureCollection (color), it NEVER adopts a
// same-named collection it didn't create — so applyFloatPlans' rename/prune can't ever hit a user's own
// "Typography"/"Geometry". A user manual-rename survives (we track id, not name); a user-deleted one is
// re-created. `reg` is mutated in place; the caller persists it once via writeFloatRegistry.
async function ensureFloatCollection(name, reg) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const known = reg[name] && cols.find((c) => c.id === reg[name]);
  if (known) return known;
  const made = figma.variables.createVariableCollection(name);
  reg[name] = made.id;
  return made;
}
// rgbaToHex — a Figma color value {r,g,b,a} (0..1) -> "#RRGGBB" (or "#RRGGBBAA" when a < 1),
// matching the generator's emitted hex form so a live value can be diffed against generated.
function rgbaToHex(c) {
  const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0").toUpperCase();
  const base = "#" + h(c.r) + h(c.g) + h(c.b);
  return typeof c.a === "number" && c.a < 1 ? base + h(c.a) : base;
}

// readRawColors — the live Color Primitives variable values, as { "{n}/{key}": "#RRGGBB(AA)" }. Read-only
// reference for the drift diff (NO reverse-derive of params — colors only). Returns {} if absent.
async function readRawColors() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const raw = cols.find((c) => c.name === RAW_COLLECTION);
  if (!raw) return { found: false, raw: {} };
  const mode = raw.modes[0].modeId;
  const all = await figma.variables.getLocalVariablesAsync();
  const out = {};
  for (const v of all) {
    if (v.variableCollectionId !== raw.id) continue;
    const val = v.valuesByMode ? v.valuesByMode[mode] : undefined;
    if (val && typeof val.r === "number") out[v.name] = rgbaToHex(val); // skip aliases (no .r)
  }
  return { found: true, raw: out };
}

async function varsByName(collectionId) {
  const all = await figma.variables.getLocalVariablesAsync();
  const m = {};
  for (const v of all) if (v.variableCollectionId === collectionId) m[v.name] = v;
  return m;
}

// ── the apply ───────────────────────────────────────────────────────────────────
// opts.rebuildSemantic — the opt-in "Regroup": delete the existing Color Modes collection so it is
// re-created fresh and adopts the bundle's (canonical, grouped) variable order. Figma keeps an
// existing variable's position on update, so a normal apply never reorders; only a fresh collection
// does. Color Primitives are untouched; bindings to the dropped Color Modes variables detach.
async function applyBundle(dtcg, opts) {
  opts = opts || {};
  const rawTree = dtcg && dtcg["palette.tokens.json"];
  const semLight = dtcg && dtcg["Light_tokens.json"];
  const semDark = dtcg && dtcg["Dark_tokens.json"];
  if (!rawTree || !semLight || !semDark) throw new Error("bundle missing palette/Light/Dark files");

  // 1) RAW collection — single "Value" mode, one COLOR var per stop/scrim.
  const raw = await ensureCollection(RAW_COLLECTION);
  raw.renameMode(raw.modes[0].modeId, "Value");
  const rawMode = raw.modes[0].modeId;
  const rawByName = await varsByName(raw.id);
  const currentRaw = new Set(); // names this bundle WANTS in Color Primitives — everything else is stale
  let rawCount = 0;
  for (const n of childKeys(rawTree)) {
    for (const key of childKeys(rawTree[n])) {
      const name = n + "/" + key;
      const v = rawByName[name] || figma.variables.createVariable(name, raw, "COLOR");
      v.setValueForMode(rawMode, rgbaOf(rawTree[n][key]));
      rawByName[name] = v;
      currentRaw.add(name);
      rawCount++;
    }
  }

  // 2) SEMANTIC collection — "Light" + "Dark" modes, each role ALIASED to its raw var.
  // Regroup: drop the existing Color Modes collection first so the rebuild creates every variable
  // fresh, in the bundle's canonical order (regular · containers · surfaces · scrims).
  let rebuilt = false;
  if (opts.rebuildSemantic) {
    const cols0 = await figma.variables.getLocalVariableCollectionsAsync();
    const old = cols0.find((c) => c.name === SEMANTIC_COLLECTION);
    if (old) { old.remove(); rebuilt = true; }
  }
  const sem = await ensureCollection(SEMANTIC_COLLECTION);
  const lightMode = sem.modes[0].modeId;
  sem.renameMode(lightMode, "Light");
  const darkMode = (sem.modes[1] && sem.modes[1].modeId) || sem.addMode("Dark");
  if (sem.modes[1]) sem.renameMode(darkMode, "Dark");
  const semByName = await varsByName(sem.id);
  const currentSem = new Set(); // names this bundle WANTS in Color Modes — everything else is stale
  let semCount = 0;
  for (const n of childKeys(semLight)) {
    for (const key of childKeys(semLight[n])) {
      const name = n + "/" + key;
      const v = semByName[name] || figma.variables.createVariable(name, sem, "COLOR");
      const lt = rawByName[aliasTarget(semLight[n][key])];
      const dt = rawByName[aliasTarget(semDark[n][key])];
      // Alias to the raw var (the cascade). Fall back to the resolved color if the raw
      // target is somehow absent, so a role is never left unset.
      v.setValueForMode(lightMode, lt ? figma.variables.createVariableAlias(lt) : rgbaOf(semLight[n][key]));
      v.setValueForMode(darkMode, dt ? figma.variables.createVariableAlias(dt) : rgbaOf(semDark[n][key]));
      semByName[name] = v;
      currentSem.add(name);
      semCount++;
    }
  }

  // 3) PRUNE orphans — make each GENERATED collection mirror the current bundle exactly, so a
  // scrim-model/format change or a removed/renamed/disabled palette can't leave stale variables
  // behind (e.g. the old base-index scrims 250-*/500-0..6/750-*). Scoped to these two generated
  // collections ONLY: rawByName/semByName are filtered by collection id (varsByName), so no other
  // collection is ever touched. Delete SEMANTIC orphans first — a stale semantic var may alias a
  // stale raw var we then remove, whereas every CURRENT semantic var aliases a CURRENT (kept) raw
  // var, so no live alias is broken.
  let pruned = 0;
  for (const name of Object.keys(semByName)) {
    if (!currentSem.has(name)) { semByName[name].remove(); pruned++; }
  }
  for (const name of Object.keys(rawByName)) {
    if (!currentRaw.has(name)) { rawByName[name].remove(); pruned++; }
  }

  return { raw: rawCount, semantic: semCount, pruned: pruned, rebuilt: rebuilt };
}

// ── the breakpoint-moded FLOAT apply (Type / Geometry) ────────────────────────────
// applyFloatPlans — execute the UI-computed apply PLANS that figma/binder/mode-apply-plan.mjs produces
// (one entry per collection: { collection, modes, defaultMode:"Base", addModes, variables:[{name,type,
// values:[{mode,value}]}] }). The plan is pure DATA the UI already ran validateModeInterchange + ordering
// over, so this file stays a thin EXECUTOR — there is no planner to inline or parity-gate (unlike the color
// cascade, which mirrors a role table). It mirrors the operation sequence documented in that module's header.
// Idempotent: collections, modes, and variables are reconciled BY NAME and stale ones pruned, so re-applying
// after a breakpoint/voice change converges the file to exactly the current plan (never doubling, never
// leaving a removed breakpoint's mode behind). Value-complete plans mean no mode is ever left unset.
async function applyFloatPlans(plans) {
  let collections = 0, variables = 0;
  const reg = readFloatRegistry(); // provenance: only ever touch a collection NONOUN created (see ensureFloatCollection)
  for (const plan of (Array.isArray(plans) ? plans : [])) {
    if (!plan || !plan.collection || !Array.isArray(plan.modes) || !plan.modes.length) continue;
    const coll = await ensureFloatCollection(plan.collection, reg);
    // The collection's DEFAULT mode (Figma rejects removing it) — rename it to the plan's first mode ("Base");
    // the rest are added (or reused) by NAME. Anchor on `defaultModeId`, not modes[0]: for a NONOUN-created
    // collection they coincide, but a foreign same-named collection's default may not be the first mode, and
    // pruning it would throw. (The headless mock has no defaultModeId → falls back to modes[0].)
    const defaultId = coll.defaultModeId || coll.modes[0].modeId;
    coll.renameMode(defaultId, plan.defaultMode);
    const findMode = (nm) => coll.modes.find((m) => m.name.toLowerCase() === String(nm).toLowerCase());
    const modeId = {};
    modeId[plan.defaultMode] = defaultId;
    for (const nm of plan.addModes) { const ex = findMode(nm); modeId[nm] = ex ? ex.modeId : coll.addMode(nm); }
    // prune stale modes (a breakpoint the user removed) — never the default, never the last remaining mode.
    const wanted = new Set(plan.modes.map((m) => String(m).toLowerCase()));
    for (const m of coll.modes.slice()) {
      if (m.modeId === defaultId) continue;
      if (!wanted.has(m.name.toLowerCase()) && coll.modes.length > 1) coll.removeMode(m.modeId);
    }
    // variables: create-or-reuse by name; write every mode's value; prune orphans scoped to THIS collection.
    const byName = await varsByName(coll.id);
    const current = new Set();
    for (const v of plan.variables) {
      const vr = byName[v.name] || figma.variables.createVariable(v.name, coll, v.type || "FLOAT");
      for (const pair of v.values) {
        const mid = modeId[pair.mode];
        if (mid != null && Number.isFinite(Number(pair.value))) vr.setValueForMode(mid, Number(pair.value));
      }
      byName[v.name] = vr; current.add(v.name); variables++;
    }
    for (const name of Object.keys(byName)) if (!current.has(name)) byName[name].remove();
    collections++;
  }
  writeFloatRegistry(reg); // persist the name→id provenance map (any newly-created collections)
  return { collections: collections, variables: variables };
}

// Exposed for the headless verifier (a no-op inside Figma's VM).
if (typeof module !== "undefined") module.exports = { applyBundle, applyFloatPlans, rgbaOf, aliasTarget, childKeys };
