#!/usr/bin/env node
// verify.mjs — the figma-plugin-app validation adapter (CRITIC side).
// Gates the generator-as-Figma-plugin without Figma: manifest shape + offline, code.js
// parses + uses no network APIs, ui.html carries the generator + the bridge, AND the
// load-bearing contract — model.figmaBundle() fed to code.applyBundle() (on a MOCK figma)
// builds a raw-colors collection + a Semantic (Light/Dark) collection in which EVERY
// semantic var, in BOTH modes, is aliased to a raw var that was actually created.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { figmaBundle, defaultDocument } from "../../src/ui/model.mjs";

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

// ── ui.html: the generator + the Figma bridge ───────────────────────────────────
if (!existsSync(`${HERE}/ui.html`)) FAIL("ui", "ui.html not generated — run gen-ui.mjs");
else {
  const ui = readFileSync(`${HERE}/ui.html`, "utf8");
  if (!ui.includes("<hct-app>")) FAIL("ui", "ui.html does not embed the generator (<hct-app>)");
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
        };
        collections.push(c); return c;
      },
      async getLocalVariablesAsync() { return variables.slice(); },
      createVariable(name, coll, type) {
        const vm = {}; // shared: real Figma exposes valuesByMode; the cascade test reads .values
        const v = { id: "v" + id++, name, variableCollectionId: coll.id, type, values: vm, valuesByMode: vm,
          setValueForMode(mid, val) { vm[mid] = val; } };
        variables.push(v); return v;
      },
      createVariableAlias(v) { return { type: "VARIABLE_ALIAS", id: v.id }; },
    },
  };
  return { figma, collections, variables };
}

// ── END-TO-END contract: figmaBundle() -> applyBundle() on the mock ──────────────
let applyBundle;
const F = mockFigma();
try {
  const load = new Function("figma", "__html__", "module", code + "\nreturn { applyBundle };");
  applyBundle = load(F.figma, "<html>", undefined).applyBundle; // closes over the MOCK figma
} catch (e) { FAIL("parse", "code.js failed to load: " + e.message); }

if (applyBundle) {
  const bundle = figmaBundle(defaultDocument());
  const expect = (tree) => Object.keys(tree).filter((n) => n[0] !== "$")
    .reduce((a, n) => a + Object.keys(tree[n]).filter((k) => k[0] !== "$").length, 0);
  const rawExpect = expect(bundle["palette.tokens.json"]);
  const semExpect = expect(bundle["Light_tokens.json"]);

  try {
    const res = await applyBundle(bundle);
    const raw = F.collections.find((c) => c.name === "raw-colors");
    const sem = F.collections.find((c) => c.name === "Semantic");
    if (!raw) FAIL("apply", "no raw-colors collection created");
    if (!sem) FAIL("apply", "no Semantic collection created");
    if (sem && sem.modes.map((m) => m.name).join() !== "Light,Dark") FAIL("apply", `Semantic modes = ${sem && sem.modes.map((m) => m.name)}, want Light,Dark`);
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
      if (aliased !== semExpect * 2) FAIL("cascade", `${aliased} aliased mode-values, expected ${semExpect * 2} (37 roles × palettes × 2 modes)`);
    }

    // ── IDEMPOTENT re-apply: a 2nd run finds-or-creates → updates in place, never doubles ──
    // (the user re-runs the plugin on the same file repeatedly; duplicate collections/vars/
    //  modes would corrupt the variable panel). Proven, not assumed.
    const res2 = await applyBundle(bundle);
    const rawColls = F.collections.filter((c) => c.name === "raw-colors").length;
    const semColls = F.collections.filter((c) => c.name === "Semantic").length;
    if (rawColls !== 1) FAIL("idempotent", `re-apply made ${rawColls} raw-colors collections, want 1`);
    if (semColls !== 1) FAIL("idempotent", `re-apply made ${semColls} Semantic collections, want 1`);
    const rawVars2 = F.variables.filter((v) => raw && v.variableCollectionId === raw.id).length;
    const semVars2 = F.variables.filter((v) => sem && v.variableCollectionId === sem.id).length;
    if (rawVars2 !== rawExpect) FAIL("idempotent", `re-apply left ${rawVars2} raw vars, want ${rawExpect} (no duplicates)`);
    if (semVars2 !== semExpect) FAIL("idempotent", `re-apply left ${semVars2} semantic vars, want ${semExpect} (no duplicates)`);
    if (sem && sem.modes.map((m) => m.name).join() !== "Light,Dark") FAIL("idempotent", `re-apply left Semantic modes = ${sem && sem.modes.map((m) => m.name)}, want Light,Dark (no duplicate mode)`);
    if (res2.raw !== rawExpect || res2.semantic !== semExpect) FAIL("idempotent", `re-apply reported ${res2.raw}/${res2.semantic} vars, want ${rawExpect}/${semExpect}`);
  } catch (e) { FAIL("apply", "applyBundle threw: " + e.message); }

  // ── CONFIG round-trip via the file's root pluginData (the project source of truth, travels with the
  //    .fig): save → stored IN the file → load → posted back; AND "apply" embeds the config alongside the vars. ──
  if (F.figma.ui._h) {
    const cfg = { name: "T", palettes: [{ name: "P", hue: 7, chroma: 50, skew: 0, lift: 0, on: true }], roleOverrides: { onSurface: { light: "900" } } };
    await F.figma.ui._h({ type: "save-config", config: cfg });
    if (JSON.stringify(JSON.parse(F.figma.root.getPluginData("hct-config") || "null")) !== JSON.stringify(cfg)) FAIL("config", "save-config did not store the config in the file's root pluginData (must travel with the file, not clientStorage)");
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "load-config" });
    const loaded = F.figma.ui._posted.find((m) => m && m.type === "config-loaded");
    if (!loaded) FAIL("config", "load-config posted no {type:'config-loaded'} message");
    else if (JSON.stringify(loaded.config) !== JSON.stringify(cfg)) FAIL("config", "load-config did not round-trip the saved config");

    // "apply" must ALSO embed the params in the file, so a read reproduces them losslessly (not from colors).
    F.figma.root._pd = {}; // clear, then apply with an embedded config
    const cfg2 = { name: "Embedded", palettes: [{ name: "Q", hue: 200, chroma: 60, skew: 0, lift: 0, on: true }] };
    await F.figma.ui._h({ type: "apply", dtcg: figmaBundle(defaultDocument()), config: cfg2 });
    if (JSON.stringify(JSON.parse(F.figma.root.getPluginData("hct-config") || "null")) !== JSON.stringify(cfg2)) FAIL("config", "apply did not embed the config in the file (read-back would be lossy)");

    // ── READ-VARIABLES (drift reference): the live raw-colors values come back as #RRGGBB(AA) hexes ──
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "read-variables" });
    const read = F.figma.ui._posted.find((m) => m && m.type === "variables-read");
    if (!read) FAIL("read", "read-variables posted no {type:'variables-read'} message");
    else if (!read.found) FAIL("read", "read-variables did not find the raw-colors collection");
    else {
      const names = Object.keys(read.raw);
      if (names.length !== rawExpect) FAIL("read", `read ${names.length} raw values, expected ${rawExpect}`);
      if (!names.every((k) => /^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(read.raw[k]))) FAIL("read", "a read raw value is not a #RRGGBB(AA) hex");
    }
  } else {
    FAIL("config", "code.js registered no figma.ui.onmessage handler");
  }
}

// ── REPORT ───────────────────────────────────────────────────────────────────────
for (const g of ["manifest", "offline", "vmsyntax", "ui", "parse", "apply", "cascade", "idempotent", "config", "read"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: figma-plugin-app — manifest + offline code.js + bridged ui.html + the figmaBundle→variables cascade");
process.exit(0);
