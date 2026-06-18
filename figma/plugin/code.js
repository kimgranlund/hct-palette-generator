// code.js — HCT Palette Generator, Figma plugin SANDBOX (the `main`).
//
// Runs in Figma's plugin VM: the `figma` global is available, but there is NO DOM, no
// fetch/XMLHttpRequest/WebSocket, no localStorage (ADR-010 / AC-P3 — offline by design;
// manifest networkAccess is "none"). The generator UI runs in the iframe (ui.html); this
// file only (a) opens that UI and (b) on an "apply" message turns the posted DTCG bundle
// into two Figma variable COLLECTIONS:
//
//   raw-colors  (mode "Value")        — one COLOR var per stop/scrim, the concrete colors
//   Semantic    (modes "Light","Dark")— one COLOR var per role, each mode ALIASED to the
//                                        raw var named by the leaf's com.figma.aliasData
//                                        (the live raw→semantic cascade native import can't do)
//
// The bundle comes from the UI's figmaBundle() = exportDTCG(state, { rawColl:"raw-colors" }),
// so this file is palette-agnostic: it walks the tree, it does NOT hard-code the role table.

const RAW_COLLECTION = "raw-colors";
const SEMANTIC_COLLECTION = "Semantic";

figma.showUI(__html__, { width: 1440, height: 900, themeColors: true });
// Tell the UI it is running inside Figma so it reveals its "Apply to Figma" button.
figma.ui.postMessage({ type: "figma-init" });

// CONFIG_KEY — the generator's parametric config, persisted IN this file on the DOCUMENT ROOT via
// setPluginData. This is the "source of truth" round-trip: the exact hue/chroma/skew/lift, global
// controls, AND role overrides — NOT the resolved colors (those are the variables, written by "apply",
// and cannot reverse-derive the params). Root pluginData is saved inside the .fig and TRAVELS WITH THE
// FILE (shared with everyone who opens it), unlike clientStorage which is per-user-machine. So a read
// reproduces the generator's state LOSSLESSLY instead of approximating it from the 500 colors.
const CONFIG_KEY = "hct-config";

// writeConfig / readConfig — the file-embedded parametric config (root pluginData is a string store;
// getPluginData returns "" when unset). JSON-encoded; a corrupt value reads back as null, never throws.
function writeConfig(config) { figma.root.setPluginData(CONFIG_KEY, JSON.stringify(config)); }
function readConfig() {
  const raw = figma.root.getPluginData(CONFIG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; } // NB: param required — Figma's plugin VM rejects optional catch binding (ES2019)
}

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  try {
    if (msg.type === "apply") {
      const r = await applyBundle(msg.dtcg);
      // Embed the exact params in the file ALONGSIDE the variables, so a later read round-trips
      // losslessly (the variables alone can only seed an approximate hue/chroma).
      if (msg.config) writeConfig(msg.config);
      figma.notify(`HCT: ${r.raw} raw + ${r.semantic} semantic vars (Light/Dark)`);
    } else if (msg.type === "save-config") {
      writeConfig(msg.config);
      figma.notify("HCT: config saved into this file");
    } else if (msg.type === "load-config") {
      const config = readConfig();
      figma.ui.postMessage({ type: "config-loaded", config });
      if (!config) figma.notify("HCT: no saved config in this file");
    } else if (msg.type === "read-variables") {
      const live = await readRawColors(); // read-only reference for the drift diff
      figma.ui.postMessage({ type: "variables-read", found: live.found, raw: live.raw });
      if (!live.found) figma.notify("HCT: no raw-colors collection in this file yet");
    }
  } catch (e) {
    figma.notify("HCT failed: " + (e && e.message ? e.message : String(e)), { error: true });
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
// rgbaToHex — a Figma color value {r,g,b,a} (0..1) -> "#RRGGBB" (or "#RRGGBBAA" when a < 1),
// matching the generator's emitted hex form so a live value can be diffed against generated.
function rgbaToHex(c) {
  const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0").toUpperCase();
  const base = "#" + h(c.r) + h(c.g) + h(c.b);
  return typeof c.a === "number" && c.a < 1 ? base + h(c.a) : base;
}

// readRawColors — the live raw-colors variable values, as { "{n}/{key}": "#RRGGBB(AA)" }. Read-only
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
async function applyBundle(dtcg) {
  const rawTree = dtcg && dtcg["palette.tokens.json"];
  const semLight = dtcg && dtcg["Light_tokens.json"];
  const semDark = dtcg && dtcg["Dark_tokens.json"];
  if (!rawTree || !semLight || !semDark) throw new Error("bundle missing palette/Light/Dark files");

  // 1) RAW collection — single "Value" mode, one COLOR var per stop/scrim.
  const raw = await ensureCollection(RAW_COLLECTION);
  raw.renameMode(raw.modes[0].modeId, "Value");
  const rawMode = raw.modes[0].modeId;
  const rawByName = await varsByName(raw.id);
  let rawCount = 0;
  for (const n of childKeys(rawTree)) {
    for (const key of childKeys(rawTree[n])) {
      const name = n + "/" + key;
      const v = rawByName[name] || figma.variables.createVariable(name, raw, "COLOR");
      v.setValueForMode(rawMode, rgbaOf(rawTree[n][key]));
      rawByName[name] = v;
      rawCount++;
    }
  }

  // 2) SEMANTIC collection — "Light" + "Dark" modes, each role ALIASED to its raw var.
  const sem = await ensureCollection(SEMANTIC_COLLECTION);
  const lightMode = sem.modes[0].modeId;
  sem.renameMode(lightMode, "Light");
  const darkMode = (sem.modes[1] && sem.modes[1].modeId) || sem.addMode("Dark");
  if (sem.modes[1]) sem.renameMode(darkMode, "Dark");
  const semByName = await varsByName(sem.id);
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
      semCount++;
    }
  }

  return { raw: rawCount, semantic: semCount };
}

// Exposed for the headless verifier (a no-op inside Figma's VM).
if (typeof module !== "undefined") module.exports = { applyBundle, rgbaOf, aliasTarget, childKeys };
