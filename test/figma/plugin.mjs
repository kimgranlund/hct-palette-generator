#!/usr/bin/env node
// verify.mjs — the figma-plugin-app validation adapter (CRITIC side).
// Gates the generator-as-Figma-plugin without Figma: manifest shape + offline, code.js
// parses + uses no network APIs, ui.html carries the generator + the bridge, AND the
// load-bearing contract — model.figmaBundle() fed to code.applyBundle() (on a MOCK figma)
// builds a Color Primitives collection + a Color Modes (Light/Dark) collection in which EVERY
// semantic var, in BOTH modes, is aliased to a raw var that was actually created.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { figmaBundle, defaultDocument } from "../../src/ui/model.mjs";
import * as TYPE from "../../src/engine/type.mjs";
import * as GEOM from "../../src/engine/geometry.mjs";
import { modeApplyPlan } from "../../figma/binder/mode-apply-plan.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "figma", "plugin"); // the generator-as-plugin lives in figma/plugin/
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// ── manifest: the plugin shape + offline (AC-P3) ────────────────────────────────
const mani = JSON.parse(readFileSync(`${HERE}/manifest.json`, "utf8"));
if (mani.main !== "code.js") FAIL("manifest", `main=${mani.main}, want code.js`);
if (mani.ui !== "ui.html") FAIL("manifest", `ui=${mani.ui}, want ui.html`);
if (!Array.isArray(mani.editorType) || !mani.editorType.includes("figma")) FAIL("manifest", "editorType must include 'figma'");
const na = mani.networkAccess;
const offline = na === "none" || (na && Array.isArray(na.allowedDomains) && na.allowedDomains.length === 1 && na.allowedDomains[0] === "none");
if (!offline) FAIL("manifest", "networkAccess must be 'none' — the plugin is offline by design (AC-P3)");

// ── code.js: parses + uses no network / dynamic-import APIs ──────────────────────
const code = readFileSync(`${HERE}/code.js`, "utf8");
const codeNoComments = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""); // ignore the comment that NAMES these
if (/\bfetch\s*\(|new\s+(XMLHttpRequest|WebSocket)|\bimport\s*\(/.test(codeNoComments)) FAIL("offline", "code.js calls a network or dynamic-import API");

// Figma's plugin VM (jsvm-cpp) is NOT modern V8: optional catch binding (ES2019 — `catch {`
// with no param) PARSE-fails there, yet loads fine in Node — so this verifier's own
// new Function() load below can't catch it (real incident 2026-06-17: the whole plugin failed
// to run with "Syntax error: Unexpected token {"). Guard it statically. Write `catch (e) {`.
if (/\bcatch\s*\{/.test(codeNoComments)) FAIL("vmsyntax", "code.js uses optional catch binding (`catch {`) — Figma's plugin VM rejects it; use `catch (e) {`");

// ── compliance: no RAW developer error surfaced to users, no stale product branding ─────────────
// Figma policy rejects plugins that show raw error text / stack traces. The catch must notify a
// friendly, handled message (technical detail goes to console.error, not figma.notify).
if (/figma\.notify\([^;]*\b(?:e\.message|String\(e\)|err\.message|\.stack)\b/.test(codeNoComments))
  FAIL("compliance", "code.js surfaces a raw error in figma.notify — show a friendly message; log the detail to console only");
if (/figma\.notify\([^;]*HCT/.test(codeNoComments))
  FAIL("compliance", "a user-facing figma.notify still says 'HCT' (stale branding) — the product is 'Ultimate Tokens by NONOUN'");

// ── ui.html: the generator + the Figma bridge ───────────────────────────────────
if (!existsSync(`${HERE}/ui.html`)) FAIL("ui", "ui.html not generated — run gen-ui.mjs");
else {
  const ui = readFileSync(`${HERE}/ui.html`, "utf8");
  if (!ui.includes("<nonoun-color-tokens>")) FAIL("ui", "ui.html does not embed the generator (<nonoun-color-tokens>)");
  if (!/figma-init/.test(ui) || !/pluginMessage/.test(ui) || !/figmaBundle/.test(ui))
    FAIL("ui", "ui.html missing the bridge (figma-init listener / pluginMessage / figmaBundle())");
  if (!/config-loaded/.test(ui) || !/applyLoadedConfig/.test(ui))
    FAIL("ui", "ui.html missing the config round-trip bridge (config-loaded → applyLoadedConfig)");
  if (!/variables-read/.test(ui) || !/receiveLiveVariables/.test(ui))
    FAIL("ui", "ui.html missing the drift-diff bridge (variables-read → receiveLiveVariables)");
}

// ── a mock figma: in-memory collections + variables ─────────────────────────────
function mockFigma() {
  const collections = [], variables = [];
  let id = 0;
  const figma = {
    showUI() {},
    notify() {},
    closePlugin() {},
    // the document root carries the embedded config (setPluginData is a synchronous string store).
    root: { _pd: {}, setPluginData(k, v) { this._pd[k] = String(v); }, getPluginData(k) { return this._pd[k] || ""; } },
    ui: { _h: null, _posted: [], postMessage(m) { this._posted.push(m); }, set onmessage(fn) { this._h = fn; }, get onmessage() { return this._h; } },
    clientStorage: { _s: {}, async setAsync(k, v) { this._s[k] = v; }, async getAsync(k) { return this._s[k]; } },
    variables: {
      async getLocalVariableCollectionsAsync() { return collections.slice(); },
      createVariableCollection(name) {
        const c = {
          id: "c" + id++, name, modes: [{ modeId: "m" + id++, name: "Mode 1" }],
          renameMode(mid, nm) { const m = this.modes.find((x) => x.modeId === mid); if (m) m.name = nm; },
          addMode(nm) { const m = { modeId: "m" + id++, name: nm }; this.modes.push(m); return m.modeId; },
          removeMode(mid) { const i = this.modes.findIndex((x) => x.modeId === mid); if (i > 0) this.modes.splice(i, 1); }, // i>0: never the default
          remove() { // real Figma drops the collection AND its variables
            const i = collections.indexOf(this); if (i >= 0) collections.splice(i, 1);
            for (let j = variables.length - 1; j >= 0; j--) if (variables[j].variableCollectionId === this.id) variables.splice(j, 1);
          },
        };
        collections.push(c); return c;
      },
      async getLocalVariablesAsync() { return variables.slice(); },
      createVariable(name, coll, type) {
        const vm = {}; // shared: real Figma exposes valuesByMode; the cascade test reads .values
        const v = { id: "v" + id++, name, variableCollectionId: coll.id, type, values: vm, valuesByMode: vm,
          setValueForMode(mid, val) { vm[mid] = val; },
          remove() { const i = variables.indexOf(this); if (i >= 0) variables.splice(i, 1); } };
        variables.push(v); return v;
      },
      createVariableAlias(v) { return { type: "VARIABLE_ALIAS", id: v.id }; },
    },
  };
  return { figma, collections, variables };
}

// ── END-TO-END contract: figmaBundle() -> applyBundle() on the mock ──────────────
let applyBundle, applyFloatPlans;
const F = mockFigma();
try {
  const load = new Function("figma", "__html__", "module", code + "\nreturn { applyBundle, applyFloatPlans };");
  const loaded = load(F.figma, "<html>", undefined); // closes over the MOCK figma
  applyBundle = loaded.applyBundle; applyFloatPlans = loaded.applyFloatPlans;
} catch (e) { FAIL("parse", "code.js failed to load: " + e.message); }

if (applyBundle) {
  const bundle = figmaBundle(defaultDocument());
  const expect = (tree) => Object.keys(tree).filter((n) => n[0] !== "$")
    .reduce((a, n) => a + Object.keys(tree[n]).filter((k) => k[0] !== "$").length, 0);
  const rawExpect = expect(bundle["palette.tokens.json"]);
  const semExpect = expect(bundle["Light_tokens.json"]);

  try {
    const res = await applyBundle(bundle);
    const raw = F.collections.find((c) => c.name === "Color Primitives");
    const sem = F.collections.find((c) => c.name === "Color Modes");
    if (!raw) FAIL("apply", "no Color Primitives collection created");
    if (!sem) FAIL("apply", "no Color Modes collection created");
    if (sem && sem.modes.map((m) => m.name).join() !== "Light,Dark") FAIL("apply", `Color Modes modes = ${sem && sem.modes.map((m) => m.name)}, want Light,Dark`);
    if (res.raw !== rawExpect) FAIL("apply", `created ${res.raw} raw vars, expected ${rawExpect}`);
    if (res.semantic !== semExpect) FAIL("apply", `created ${res.semantic} semantic vars, expected ${semExpect}`);

    if (raw && sem) {
      const rawIds = new Set(F.variables.filter((v) => v.variableCollectionId === raw.id).map((v) => v.id));
      const lightId = sem.modes[0].modeId, darkId = sem.modes[1].modeId;
      let aliased = 0, bad = 0;
      for (const v of F.variables.filter((v) => v.variableCollectionId === sem.id)) {
        for (const mid of [lightId, darkId]) {
          const val = v.values[mid];
          if (!val || val.type !== "VARIABLE_ALIAS" || !rawIds.has(val.id)) { bad++; continue; }
          aliased++;
        }
      }
      if (bad > 0) FAIL("cascade", `${bad} semantic mode-values are not aliased to a created raw var`);
      if (aliased !== semExpect * 2) FAIL("cascade", `${aliased} aliased mode-values, expected ${semExpect * 2} (59 roles × palettes × 2 modes)`);
    }

    // ── IDEMPOTENT re-apply: a 2nd run finds-or-creates → updates in place, never doubles ──
    // (the user re-runs the plugin on the same file repeatedly; duplicate collections/vars/
    //  modes would corrupt the variable panel). Proven, not assumed.
    const res2 = await applyBundle(bundle);
    const rawColls = F.collections.filter((c) => c.name === "Color Primitives").length;
    const semColls = F.collections.filter((c) => c.name === "Color Modes").length;
    if (rawColls !== 1) FAIL("idempotent", `re-apply made ${rawColls} Color Primitives collections, want 1`);
    if (semColls !== 1) FAIL("idempotent", `re-apply made ${semColls} Color Modes collections, want 1`);
    const rawVars2 = F.variables.filter((v) => raw && v.variableCollectionId === raw.id).length;
    const semVars2 = F.variables.filter((v) => sem && v.variableCollectionId === sem.id).length;
    if (rawVars2 !== rawExpect) FAIL("idempotent", `re-apply left ${rawVars2} raw vars, want ${rawExpect} (no duplicates)`);
    if (semVars2 !== semExpect) FAIL("idempotent", `re-apply left ${semVars2} semantic vars, want ${semExpect} (no duplicates)`);
    if (sem && sem.modes.map((m) => m.name).join() !== "Light,Dark") FAIL("idempotent", `re-apply left Color Modes modes = ${sem && sem.modes.map((m) => m.name)}, want Light,Dark (no duplicate mode)`);
    if (res2.raw !== rawExpect || res2.semantic !== semExpect) FAIL("idempotent", `re-apply reported ${res2.raw}/${res2.semantic} vars, want ${rawExpect}/${semExpect}`);

    // ── ORPHAN PRUNE: re-apply removes any var NOT in the current bundle, in BOTH generated
    //    collections — old-format scrims (250-*/500-0..6/750-*) and removed/renamed/disabled
    //    palettes — so the file mirrors the generator exactly (full-mirror pruning). ──
    F.figma.variables.createVariable("neutral/500-0", raw, "COLOR"); // old base-index scrim
    F.figma.variables.createVariable("neutral/750-3", raw, "COLOR"); // old 750-base scrim
    F.figma.variables.createVariable("ghost/050", raw, "COLOR");     // removed-palette raw solid
    F.figma.variables.createVariable("ghost/primary", sem, "COLOR"); // removed-palette semantic var
    const res3 = await applyBundle(bundle);
    const inColl = (cid) => F.variables.filter((v) => v.variableCollectionId === cid).map((v) => v.name);
    const rawNames3 = inColl(raw.id), semNames3 = inColl(sem.id);
    for (const dead of ["neutral/500-0", "neutral/750-3", "ghost/050"]) if (rawNames3.includes(dead)) FAIL("prune", `orphan raw var '${dead}' not pruned`);
    if (semNames3.includes("ghost/primary")) FAIL("prune", "orphan semantic var 'ghost/primary' not pruned");
    if (rawNames3.length !== rawExpect) FAIL("prune", `Color Primitives has ${rawNames3.length} vars after prune, want ${rawExpect}`);
    if (semNames3.length !== semExpect) FAIL("prune", `Color Modes has ${semNames3.length} vars after prune, want ${semExpect}`);
    if (res3.pruned !== 4) FAIL("prune", `apply reported pruned=${res3.pruned}, expected 4`);

    // ── REGROUP: apply with {rebuildSemantic} DELETES + re-creates the Color Modes collection (so it
    //    adopts the bundle's canonical order), leaving Color Primitives + the var counts intact and
    //    NOT duplicating the collection. The fresh semantic vars created in the bundle's role order. ──
    const semColl0 = F.collections.find((c) => c.name === "Color Modes");
    const res4 = await applyBundle(bundle, { rebuildSemantic: true });
    if (!res4.rebuilt) FAIL("regroup", "applyBundle({rebuildSemantic:true}) did not report rebuilt");
    const semColls4 = F.collections.filter((c) => c.name === "Color Modes");
    if (semColls4.length !== 1) FAIL("regroup", `after regroup there are ${semColls4.length} Color Modes collections, want 1`);
    if (semColls4[0] === semColl0) FAIL("regroup", "regroup reused the old Color Modes collection (should be a fresh one)");
    if (res4.semantic !== semExpect) FAIL("regroup", `regroup created ${res4.semantic} semantic vars, want ${semExpect}`);
    const semNames4 = inColl(semColls4[0].id);
    if (semNames4.length !== semExpect) FAIL("regroup", `Color Modes has ${semNames4.length} vars after regroup, want ${semExpect}`);
    // order check: the fresh collection's variable order matches the bundle's (regular → … → scrims)
    const wantOrder = Object.keys(bundle["Light_tokens.json"]).filter((n) => n[0] !== "$")
      .flatMap((n) => Object.keys(bundle["Light_tokens.json"][n]).filter((k) => k[0] !== "$").map((k) => n + "/" + k));
    if (semNames4.join(",") !== wantOrder.join(",")) FAIL("regroup", "regrouped Color Modes order != bundle (canonical) order");
    const lastSeven = semNames4.slice(-7);
    if (!lastSeven.every((nm) => /\/scrim/.test(nm))) FAIL("regroup", `last 7 regrouped vars are not scrims: ${lastSeven}`);
  } catch (e) { FAIL("apply", "applyBundle threw: " + e.message); }

  // ── CONFIG round-trip via the file's root pluginData (the project source of truth, travels with the
  //    .fig): save → stored IN the file → load → posted back; AND "apply" embeds the config alongside the vars. ──
  if (F.figma.ui._h) {
    const cfg = { name: "T", palettes: [{ name: "P", hue: 7, chroma: 50, skew: 0, lift: 0, on: true }], roleOverrides: { onSurface: { light: "900" } } };
    await F.figma.ui._h({ type: "save-config", config: cfg });
    if (JSON.stringify(JSON.parse(F.figma.root.getPluginData("nonoun-color-tokens-config") || "null")) !== JSON.stringify(cfg)) FAIL("config", "save-config did not store the config in the file's root pluginData (must travel with the file, not clientStorage)");
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "load-config" });
    const loaded = F.figma.ui._posted.find((m) => m && m.type === "config-loaded");
    if (!loaded) FAIL("config", "load-config posted no {type:'config-loaded'} message");
    else if (JSON.stringify(loaded.config) !== JSON.stringify(cfg)) FAIL("config", "load-config did not round-trip the saved config");

    // "apply" must ALSO embed the params in the file, so a read reproduces them losslessly (not from colors).
    F.figma.root._pd = {}; // clear, then apply with an embedded config
    const cfg2 = { name: "Embedded", palettes: [{ name: "Q", hue: 200, chroma: 60, skew: 0, lift: 0, on: true }] };
    await F.figma.ui._h({ type: "apply", dtcg: figmaBundle(defaultDocument()), config: cfg2 });
    if (JSON.stringify(JSON.parse(F.figma.root.getPluginData("nonoun-color-tokens-config") || "null")) !== JSON.stringify(cfg2)) FAIL("config", "apply did not embed the config in the file (read-back would be lossy)");

    // LEGACY fallback: a file saved under the pre-rename "hct-config" key still loads (forward-migrated).
    F.figma.root._pd = {};
    const legacyCfg = { name: "Legacy", palettes: [{ name: "L", hue: 33, chroma: 44, skew: 0, lift: 0, on: true }] };
    F.figma.root.setPluginData("hct-config", JSON.stringify(legacyCfg)); // saved before the rename
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "load-config" });
    const legacyLoaded = F.figma.ui._posted.find((m) => m && m.type === "config-loaded");
    if (!legacyLoaded || JSON.stringify(legacyLoaded.config) !== JSON.stringify(legacyCfg)) FAIL("config", "load-config did not fall back to the legacy 'hct-config' key");

    // ── READ-VARIABLES (drift reference): the live Color Primitives values come back as #RRGGBB(AA) hexes ──
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "read-variables" });
    const read = F.figma.ui._posted.find((m) => m && m.type === "variables-read");
    if (!read) FAIL("read", "read-variables posted no {type:'variables-read'} message");
    else if (!read.found) FAIL("read", "read-variables did not find the Color Primitives collection");
    else {
      const names = Object.keys(read.raw);
      if (names.length !== rawExpect) FAIL("read", `read ${names.length} raw values, expected ${rawExpect}`);
      if (!names.every((k) => /^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(read.raw[k]))) FAIL("read", "a read raw value is not a #RRGGBB(AA) hex");
    }
  } else {
    FAIL("config", "code.js registered no figma.ui.onmessage handler");
  }
}

// ── breakpoint-moded FLOAT apply (Type + Geometry) — the NATIVE side of #125's interchange export ──
// applyFloatPlans executes the UI-computed plans (figma/binder/mode-apply-plan.mjs.modeApplyPlan) against
// the figma API: one collection per system, mode[0]="Base" + one mode per breakpoint, value-complete FLOAT
// vars. Proven (not assumed): idempotent re-apply, stale-mode prune on breakpoint removal, orphan-var prune.
if (applyFloatPlans) {
  try {
    const typeIx = TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), [{ name: "Mobile", scale: TYPE.typeScale({ treatment: "product", bodyBase: 13 }) }]);
    const geomIx = GEOM.geomTokensFigmaModes(GEOM.geomScale({ treatment: "comfortable", baseHeight: 28 }), [{ name: "Desktop", scale: GEOM.geomScale({ treatment: "comfortable", baseHeight: 40 }) }]);
    const fr = await applyFloatPlans([...modeApplyPlan(typeIx), ...modeApplyPlan(geomIx)]);

    const typ = F.collections.find((c) => c.name === "Typography");
    const geo = F.collections.find((c) => c.name === "Geometry");
    if (!typ) FAIL("floatapply", "no Typography collection created");
    if (!geo) FAIL("floatapply", "no Geometry collection created");
    if (typ && typ.modes.map((m) => m.name).join() !== "Base,Mobile") FAIL("floatapply", `Typography modes = ${typ && typ.modes.map((m) => m.name)}, want Base,Mobile`);
    if (geo && geo.modes.map((m) => m.name).join() !== "Base,Desktop") FAIL("floatapply", `Geometry modes = ${geo && geo.modes.map((m) => m.name)}, want Base,Desktop`);
    if (fr.collections !== 2) FAIL("floatapply", `applyFloatPlans reported ${fr.collections} collections, want 2`);

    // every Typography var is FLOAT + value-complete across both modes; per-mode values DIFFER (16 vs 13).
    if (typ) {
      const tVars = F.variables.filter((v) => v.variableCollectionId === typ.id);
      const planLen = modeApplyPlan(typeIx)[0].variables.length;
      if (tVars.length !== planLen) FAIL("floatapply", `Typography has ${tVars.length} vars, want ${planLen}`);
      if (!tVars.every((v) => v.type === "FLOAT")) FAIL("floatapply", "a Typography variable is not FLOAT");
      const baseId = typ.modes[0].modeId, mobId = typ.modes[1].modeId;
      const bodyMd = tVars.find((v) => v.name === "Body/MD/size");
      if (!bodyMd) FAIL("floatapply", "Body/MD/size variable missing");
      else if (!Number.isFinite(bodyMd.valuesByMode[baseId]) || !Number.isFinite(bodyMd.valuesByMode[mobId])) FAIL("floatapply", "Body/MD/size not value-complete across modes");
      else if (bodyMd.valuesByMode[baseId] === bodyMd.valuesByMode[mobId]) FAIL("floatapply", "Body/MD/size Base == Mobile (per-mode values should differ at bodyBase 16 vs 13)");
    }

    // IDEMPOTENT re-apply — no duplicate collection / modes / variables.
    await applyFloatPlans([...modeApplyPlan(typeIx), ...modeApplyPlan(geomIx)]);
    if (F.collections.filter((c) => c.name === "Typography").length !== 1) FAIL("floatidem", "re-apply duplicated the Typography collection");
    if (typ && typ.modes.length !== 2) FAIL("floatidem", `re-apply left ${typ && typ.modes.length} Typography modes, want 2`);
    const tVars2 = typ ? F.variables.filter((v) => v.variableCollectionId === typ.id).length : 0;
    if (tVars2 !== modeApplyPlan(typeIx)[0].variables.length) FAIL("floatidem", `re-apply left ${tVars2} Typography vars (duplicates)`);

    // BREAKPOINT REMOVED ⇒ the stale mode is pruned (re-apply with no breakpoints ⇒ Base only).
    await applyFloatPlans(modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), [])));
    if (typ && typ.modes.map((m) => m.name).join() !== "Base") FAIL("floatprune", `after removing the breakpoint, Typography modes = ${typ && typ.modes.map((m) => m.name)}, want Base`);

    // ORPHAN VAR pruned — a synthetic collection: apply {a,b} then {a} ⇒ b removed, a updated to 9.
    const synthVar = (name, value) => ({ name, type: "FLOAT", values: [{ mode: "Base", value }] });
    await applyFloatPlans([{ collection: "Synth", modes: ["Base"], defaultMode: "Base", addModes: [], variables: [synthVar("a", 1), synthVar("b", 2)] }]);
    await applyFloatPlans([{ collection: "Synth", modes: ["Base"], defaultMode: "Base", addModes: [], variables: [synthVar("a", 9)] }]);
    const synth = F.collections.find((c) => c.name === "Synth");
    const sVars = synth ? F.variables.filter((v) => v.variableCollectionId === synth.id) : [];
    if (sVars.some((v) => v.name === "b")) FAIL("floatprune", "orphan variable 'b' not pruned on re-apply");
    const aVar = sVars.find((v) => v.name === "a");
    if (!aVar) FAIL("floatprune", "variable 'a' missing after re-apply");
    else if (aVar.valuesByMode[synth.modes[0].modeId] !== 9) FAIL("floatprune", "variable 'a' not updated to 9 on re-apply");

    // PROVENANCE: apply must NEVER canonicalize a USER's own pre-existing same-named collection — it tracks
    // the collections IT created by id in root pluginData and makes a SEPARATE one. Fresh mock so the user's
    // "Typography" is the only one until apply runs.
    const F2 = mockFigma();
    const a2 = new Function("figma", "__html__", "module", code + "\nreturn { applyFloatPlans };")(F2.figma, "<html>", undefined).applyFloatPlans;
    const userColl = F2.figma.variables.createVariableCollection("Typography"); // the user's own, pre-existing
    F2.figma.variables.createVariable("user/keepme", userColl, "FLOAT").setValueForMode(userColl.modes[0].modeId, 123);
    await a2(modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product" }), [])));
    if (F2.collections.filter((c) => c.name === "Typography").length !== 2) FAIL("floatprov", `expected the user's Typography + a separate NONOUN one (2), got ${F2.collections.filter((c) => c.name === "Typography").length}`);
    if (!F2.variables.some((v) => v.variableCollectionId === userColl.id && v.name === "user/keepme")) FAIL("floatprov", "apply pruned a variable from the user's OWN Typography collection");
    if (userColl.modes[0].name !== "Mode 1") FAIL("floatprov", "apply renamed the default mode of the user's OWN Typography collection");
    await a2(modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product" }), []))); // re-apply: reconcile OURS by id, not the user's
    if (F2.collections.filter((c) => c.name === "Typography").length !== 2) FAIL("floatprov", "re-apply made a 3rd Typography (provenance registry not persisted to root pluginData)");
  } catch (e) { FAIL("floatapply", "applyFloatPlans threw: " + e.message); }
} else {
  FAIL("floatapply", "code.js exported no applyFloatPlans");
}

// ── apply RESPECTS the export-system toggles: a message with NO dtcg (Color toggled off) skips the color
//    collections entirely while still applying the Type/Geometry float plans. Driven through the real handler. ──
{
  const F3 = mockFigma();
  new Function("figma", "__html__", "module", code)(F3.figma, "<html>", undefined); // run code.js → registers onmessage on F3
  if (typeof F3.figma.ui._h !== "function") FAIL("applysys", "code.js registered no onmessage handler on the fresh mock");
  else {
    const typePlan = modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product" }), []));
    await F3.figma.ui._h({ type: "apply", floatPlans: typePlan, config: { name: "x" } }); // Color OFF → no dtcg
    if (F3.collections.some((c) => c.name === "Color Primitives" || c.name === "Color Modes")) FAIL("applysys", "apply with no dtcg still created a Color collection (the Color toggle was ignored)");
    if (!F3.collections.some((c) => c.name === "Typography")) FAIL("applysys", "apply with no dtcg did not apply the Typography float plan");
    // COMPLETION FEEDBACK: a finished apply posts {apply-done} back to the UI (its counts drive the "Applied N…" toast).
    const done = F3.figma.ui._posted.find((m) => m && m.type === "apply-done");
    if (!done) FAIL("applydone", "a completed apply posted no {apply-done} message to the UI (no done-feedback)");
    else if (!(done.floatVars > 0)) FAIL("applydone", `apply-done floatVars=${done.floatVars}, expected the applied Typography variables`);
  }
}

// ── apply FAILURE posts {apply-error} so the UI can clear its optimistic "Applying…" toast ──
{
  const F4 = mockFigma();
  new Function("figma", "__html__", "module", code)(F4.figma, "<html>", undefined);
  await F4.figma.ui._h({ type: "apply", dtcg: { "palette.tokens.json": null } }); // missing Light/Dark → applyBundle throws
  if (!F4.figma.ui._posted.some((m) => m && m.type === "apply-error")) FAIL("applydone", "a FAILED apply posted no {apply-error} message to the UI");
}

// ── REPORT ───────────────────────────────────────────────────────────────────────
for (const g of ["manifest", "offline", "vmsyntax", "ui", "parse", "apply", "cascade", "idempotent", "prune", "floatapply", "floatidem", "floatprune", "floatprov", "applysys", "applydone", "config", "read"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: figma-plugin-app — manifest + offline code.js + bridged ui.html + the figmaBundle→variables cascade + the Type/Geometry breakpoint-mode apply");
process.exit(0);
