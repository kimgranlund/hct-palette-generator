// app.js — the DOM app for the HCT Palette Generator.
//
// One <nonoun-color-tokens> web component. The `document` (a palette SET) is the single
// source of truth; the whole right side is projectView(document), recomputed on
// every edit — NEVER stored. Palette SETS persist to localStorage; the gallery
// lists them. The six validated capability modules do all the color/token work
// (imported through model.mjs); this file only owns DOM + interaction.

import {
  defaultDocument,
  projectView,
  tokenCount,
  slug,
  contrastRatio,
  appThemeCSS,
  hctToRgb,
  STOPS,
  figmaBundle,
  configFromVariables,
  seedFromKeyColor,
  hexToOklch,
  SCRIM_BASES,
  SCRIM_STEPS,
} from "./model.mjs";
import { STORAGE_KEY, serialize, hydrate } from "./persist.js";
import { FIGMA_PLUGIN } from "./figma-plugin-assets.js";
import { CATEGORY_INDEX, loadCategory } from "./categories/index.js";
import { deriveNeutral, deriveRelative, RELATIONSHIPS } from "../engine/derive.mjs";
import { zipStore } from "./zip.mjs";
import { icon, brandMark } from "./icons.js";

// ── Multi-set storage ─────────────────────────────────────────────────────────
// persist.js owns ONE document's serialize/hydrate. The gallery needs many sets,
// so we keep an index of sets under a sibling key; each set's doc is hydrated
// through persist.hydrate so every field is domain-clamped on load.
const SETS_KEY = STORAGE_KEY + "-sets";
// The single "source of truth" config slot. In the browser it's a localStorage key; in a Figma
// plugin the config lives IN the file on the document's root pluginData (round-tripped over the bridge).
const PROJECT_KEY = STORAGE_KEY + "-project";

// README shipped inside the Download-All zip's experimental figma-aliased/ folder (OD-004).
const ALIASED_README = `figma-aliased/ — EXPERIMENTAL plugin-free cascade (OD-004)
==========================================================
Same tokens as ../figma/, but the Light/Dark variables carry com.figma.aliasData so they
ALIAS the raw primitives instead of embedding resolved colors — i.e. editing a Color
Primitive cascades to every semantic role, WITHOUT the NONOUN plugin.

This native-import path is UNVERIFIED end-to-end. The ../figma/ (resolved) files always
import cleanly; the NONOUN Figma plugin is the reliable cascade. Use this only to test
native import, and import the primitives FIRST.

To test (Figma → Local variables → Import):
  1. Import palette.tokens.json   → creates the "Color Primitives" collection.
  2. Import Light_tokens.json then Dark_tokens.json → creates "Color Modes".
  3. Open a semantic variable (e.g. primary). It should show as an ALIAS to a
     Color Primitives variable (not a flat color), and editing that primitive should
     update it. If it imports as resolved colors (no alias) or errors on import, the
     cascade did not resolve — use the plugin instead.
`;

// One-time storage-key migration: the key prefix was renamed "hct-palette-state-v1" -> "nonoun-color-tokens"
// (the product rename, CHANGELOG 1.12). Copy any sets/config saved under the OLD keys into the new ones so a
// returning user keeps their work. Idempotent (only fills an ABSENT new key) and tolerates a throwing
// localStorage (a Figma sandboxed iframe) the same way save() does.
function migrateStorageKeys() {
  try {
    for (const [oldK, newK] of [["hct-palette-state-v1-sets", SETS_KEY], ["hct-palette-state-v1-project", PROJECT_KEY]]) {
      const old = localStorage.getItem(oldK);
      if (old != null && localStorage.getItem(newK) == null) localStorage.setItem(newK, old);
    }
  } catch {}
}

function loadSets() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(SETS_KEY) || "null");
  } catch {
    raw = null;
  }
  if (!raw || !Array.isArray(raw.sets) || raw.sets.length === 0) {
    // Seed one "Default" set on first run.
    const seed = defaultDocument();
    const id = "set-" + Date.now().toString(36);
    const sets = [{ id, name: "Default", doc: serialize(seed), updated: Date.now() }];
    saveSets(sets);
    return sets;
  }
  return raw.sets;
}

function saveSets(sets) {
  // A sandboxed iframe (e.g. a Figma plugin UI) blocks localStorage — accessing it
  // throws a SecurityError. Persistence is best-effort: degrade to no-persistence
  // rather than crash the whole app on boot (loadSets's read is guarded too).
  try {
    localStorage.setItem(SETS_KEY, JSON.stringify({ sets }));
  } catch {
    /* no persistence available — run in-memory */
  }
}

function newSet(name) {
  const doc = serialize(defaultDocument());
  return { id: "set-" + Math.random().toString(36).slice(2, 9), name, doc, updated: Date.now() };
}

// ── app-theme injection (dogfooding) ────────────────────────────────────────────
// The chrome themes itself with the tokens the tool generates. On boot we run the
// tool's own `exportCSS` over the FIXED 8 default palettes (appThemeCSS) and inject
// the result once as <style id="nonoun-color-tokens-theme"> into <head>, so every --c-* role and
// raw var is available globally for styles.css to consume. We use the FIXED default
// set (not the user's edited doc) so the chrome stays stable while a doc is edited.
const APP_THEME_STYLE_ID = "nonoun-color-tokens-theme";
function ensureAppTheme() {
  if (typeof document === "undefined" || !document.head) return;
  if (document.getElementById(APP_THEME_STYLE_ID)) return; // inject exactly once
  const style = document.createElement("style");
  style.id = APP_THEME_STYLE_ID;
  style.textContent = appThemeCSS();
  document.head.appendChild(style);
}

// setColorScheme — flip the document's color-scheme so EVERY light-dark() token —
// the generated --c-* chrome tokens included — resolves to the chosen mode. "system" maps to
// "light dark" so the browser follows the OS prefers-color-scheme.
function setColorScheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root) root.style.colorScheme = theme === "system" ? "light dark" : theme; // "light" | "dark" | "light dark"
}

// ── tiny helpers ───────────────────────────────────────────────────────────────
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "style") el.setAttribute("style", v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};
const fmt = (x, d = 0) => Number(x).toFixed(d);
const ago = (ts) => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
};

const CURVES = ["linear", "sine", "cubic", "logistic", "exp"];

// Damping presets — named one-click setups for the four differential-damping knobs
// (damp · dampCurve · dampAmp · dampBias), so the curve is discoverable without
// hand-tuning. "Default" is the legacy edge-damp (backward-compatible).
const DAMP_PRESETS = [
  { name: "Default", damp: 80, dampCurve: 1.5, dampAmp: 0, dampBias: 0 },
  { name: "Calm ends", damp: 92, dampCurve: 2.6, dampAmp: 0, dampBias: 0 },
  { name: "Vivid mids", damp: 70, dampCurve: 1.5, dampAmp: 55, dampBias: 0 },
  { name: "Shade-heavy", damp: 84, dampCurve: 1.5, dampAmp: 12, dampBias: 55 },
  { name: "Tint-heavy", damp: 84, dampCurve: 1.5, dampAmp: 12, dampBias: -55 },
  { name: "Flat", damp: 35, dampCurve: 1, dampAmp: 0, dampBias: 0 },
];

// ── primitive factories ─────────────────────────────────────────────────────────
// Small, presentational builders shared across the render methods so a control's
// contract (markup + a11y) lives in ONE place instead of being re-typed inline.
// Pure builders take their handlers as arguments and live here; the one stateful,
// focus-managing control (segmented) is a class method below (it needs `this` to
// re-focus after a render). See docs/spec/references/component-inventory.md.

// switchControl — an accessible on/off (or either/or) switch. Replaces the old
// `<div class=toggle onclick>` which had no role, no tab focus, and no keyboard. A
// real <button role=switch> gets :focus-visible + Enter/Space toggling from the
// platform; aria-checked carries the state to assistive tech. `label` is the visible
// value (Enabled / oklch / gamut …); `ariaLabel` is the stable purpose, since the
// sibling <label> (when present) is not programmatically associated.
const switchControl = ({ on, onToggle, label, ariaLabel }) =>
  h(
    "button",
    {
      type: "button",
      class: "toggle" + (on ? " on" : ""),
      role: "switch",
      "aria-checked": on ? "true" : "false",
      "aria-label": ariaLabel,
      onclick: onToggle,
    },
    h("span", { class: "track", "aria-hidden": "true" }),
    h("span", { class: "toggle-label" }, label),
  );

// swatch — a fixed-size color chip, the single source for the app's many little color
// squares (inspector dot, role refs, …). `alpha:true` lays the fill over the shared
// checkerboard (.swatch.alpha, defined once in CSS) so translucent colors read as
// translucent. `size` drives the --sw custom property; decorative, so aria-hidden.
const swatch = (hex, { size = 16, alpha = false, cls = "", title } = {}) =>
  h(
    "span",
    {
      class: "swatch" + (alpha ? " alpha" : "") + (cls ? " " + cls : ""),
      style: `--sw:${size}px` + (alpha ? "" : `;background:${hex}`),
      title,
      "aria-hidden": "true",
    },
    alpha ? h("span", { class: "swatch-fill", style: `background:${hex}` }) : false,
  );

// btn — the app's button with a small, orthogonal variant vocabulary: ghost (default,
// bordered), primary (accent fill), danger (ghost + danger hover), bare (no chrome — for
// buttons that bring their own, e.g. copy-float / map-reset). Anything position- or
// layout-specific (add-pal-btn, figma-plugin-btn, …) is an extra `cls`, NOT a variant —
// that separation is the whole point (it un-pollutes the variant axis). Icon-only buttons
// MUST pass `ariaLabel`. `children` is a node or an array of nodes.
const BTN_VARIANT = { ghost: "ghost", primary: "primary", danger: "ghost danger", bare: "" };
const btn = (children, { variant = "ghost", cls = "", title, ariaLabel, ariaPressed, onclick, type = "button", disabled } = {}) =>
  h(
    "button",
    {
      type,
      class: [BTN_VARIANT[variant] ?? "ghost", cls].filter(Boolean).join(" "),
      title,
      "aria-label": ariaLabel,
      "aria-pressed": ariaPressed,
      disabled: disabled ? true : undefined,
      onclick,
    },
    ...(Array.isArray(children) ? children : [children]),
  );

// color-scheme toggles (app chrome + canvas preview): a 3-state cycle rendered icon-only.
// sun = light, moon = dark, the split-circle "theme" glyph = system (follow the OS).
const SCHEME_ICON = { system: "theme", light: "sun", dark: "moon" };
const SCHEME_NEXT = { system: "light", light: "dark", dark: "system" };

// chip — a small pill. mode "interactive" (a <button>, `on` = active/pressed) or "status"
// (a non-interactive <span> badge, optional `tone`). Folds the in-flow pill stylings
// (damp-presets, map-drift-sum) onto one .chip primitive. The absolutely-positioned
// tile-tag overlay badge stays separate — it is an overlay, not an in-flow chip.
const chip = (label, { mode = "status", on = false, tone = "", cls = "", title, onclick } = {}) => {
  const klass = ["chip", on ? "on" : "", tone, cls].filter(Boolean).join(" ");
  return mode === "interactive"
    ? h("button", { type: "button", class: klass, "aria-pressed": on ? "true" : "false", title, onclick }, label)
    : h("span", { class: klass, title }, label);
};

// field — a labeled control row. ASSOCIATES the <label> with the control (label[for] +
// control[id]) so the visible label IS the control's accessible name and clicking it
// focuses the control — the association the inline .field rows lacked (Name / Distribution
// / Curve were screen-reader-nameless). The caller builds the control; field() stamps the
// id and a fallback aria-label (left intact if the control already carries one, e.g. a
// switchControl). NB: sliders carry their own label+readout, so they are not field()s.
const field = (labelText, control, { labelTitle } = {}) => {
  const id = "fld-" + String(labelText).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (control && control.setAttribute) {
    control.setAttribute("id", id);
    if (!control.getAttribute("aria-label")) control.setAttribute("aria-label", labelText);
  }
  return h("div", { class: "field" }, h("label", { for: id, title: labelTitle }, labelText), control);
};

class HctApp extends HTMLElement {
  connectedCallback() {
    ensureAppTheme(); // inject the generated --c-* design tokens once, globally
    migrateStorageKeys(); // copy any pre-rename saved sets/config into the new key namespace
    this.sets = loadSets();
    // session (UI-only, not persisted with the doc)
    this.view = "gallery"; // gallery | editor
    this.category = null; // open Category category slug within the gallery hub (null = hub). UI-session only.
    this._categoryData = {}; // slug → { VOLUMES, PRESETS } cache for lazily-loaded category modules
    this.inFigma = false; // set true by the Figma bridge (gen-ui.mjs) on figma-init → reveals "Add Variables → Figma"
    this.liveVars = null; // { "{n}/{key}": hex } read from the file (read-only drift reference); null = not read
    this.liveVarsFound = false; // whether the file has a raw-colors collection (gates the gallery import row)
    this.fileConfig = null; // the LOSSLESS parametric config embedded in the Figma file (root pluginData), if any
    this._loadRequested = false; // true while an EXPLICIT load is in flight (so the gallery auto-probe doesn't auto-open)
    this._figmaProbed = false; // one-shot guard: probe the file's config + variables once when the gallery opens in Figma
    this.activeId = null;
    this.doc = null;
    this.savedSnapshot = null; // JSON string of last-saved doc -> dirty detection
    this.sel = { kind: "palette", id: 0 };
    this.segment = "palette"; // right-pane segmented control: palette | global | roles
    this.panesLeft = true; // left analysis rail shown (ui-session state, like segment — never persisted)
    this.panesRight = true; // right inspector shown
    this.canvasTheme = "system"; // canvas preview color-scheme: system (follow OS) | light | dark — INDEPENDENT of app chrome ◐
    this.canvasView = "palettes"; // canvas content: palettes (the ramps) | scrims | mapping (the role→raw table)
    this.stopsMode = "core"; // palette ramp density: core (19 display stops) | extended (25 EXPORT_STOPS)
    this.mapTextMode = false; // Mapping table raw-token editor: false = select menu, true = free text input
    this.viewport = { panX: 0, panY: 0, zoom: 1 };
    this.theme = "system"; // app chrome color scheme: system (follows OS) | light | dark
    this.exportOpen = false;
    this.exportTab = "css";
    // New-Palette modal (a native <dialog>, like the export drawer). newPalCtx = Set of context
    // palette indices to derive from (initialized on open: all non-system palettes on).
    this.newPalOpen = false;
    this.newPalTab = "relative"; // relative | environmental | custom
    this.newPalRel = "extend"; // selected Relative relationship
    this.newPalCtx = null; // Set<number> of included palette indices
    this.newPalCustom = null; // { hue, chroma } for the Custom tab (seeded on open)
    this.newPalDrag = { x: 0, y: 0 }; // drag offset from the centered position (header-drag)
    // Apply-to-Figma consent gate (back up your variables first). Cookieable for normal apply; the
    // destructive Regroup always re-shows. See requestApplyToFigma / renderApplyGate.
    this.applyGateOpen = false;
    this.applyGateRebuild = false; // the pending action: false = apply, true = regroup
    this.applyGateDontShow = false; // the "don't show again" checkbox (transient, reset on open)
    this.settingsOpen = false; // the Settings modal (token-mapping + app prefs)
    this.figmaFile = "light"; // which Figma mode file the Figma tab previews/downloads
    this.hover = null; // hovered swatch info for footers
    this.search = "";
    // ── undo / redo (whole-document snapshots) ───────────────────────────────
    // history/future hold serialized doc snapshots (the SAME bytes persist.js
    // stores). A COMMITTED edit pushes the PRE-edit doc onto history and clears
    // future; undo/redo move snapshots between the two stacks. Pan/zoom/segment/
    // selection/theme are UI-session — they never touch these stacks.
    this.history = []; // past states (most-recent last)
    this.future = []; // redo branch
    this._dragSnap = null; // pending pre-drag snapshot (a slider drag = ONE step)
    this._dragTimer = null; // debounce timer that commits a settled drag
    this.HISTORY_MAX = 100;
    setColorScheme(this.theme); // flip the chrome's light-dark() tokens to the initial theme
    this._installKeyboard(); // editor-scoped keyboard shortcuts (guarded vs text inputs)
    // when the OS scheme flips while we follow it ("system"), re-render so the canvas preview's
    // computed light/dark hex tracks it live (the chrome's light-dark() tokens update on their own).
    if (typeof matchMedia !== "undefined") {
      this._mqlScheme = matchMedia("(prefers-color-scheme: dark)");
      this._onSchemeChange = () => { if (this.theme === "system" || this.canvasTheme === "system") this.render(); };
      this._mqlScheme.addEventListener("change", this._onSchemeChange);
    }
    this.render();
  }

  disconnectedCallback() {
    if (this._onKeyDown) document.removeEventListener("keydown", this._onKeyDown);
    if (this._mqlScheme && this._onSchemeChange) this._mqlScheme.removeEventListener("change", this._onSchemeChange);
  }

  // ── doc lifecycle ──────────────────────────────────────────────────────────
  openSet(id) {
    const rec = this.sets.find((s) => s.id === id);
    if (!rec) return;
    this.activeId = id;
    this.doc = hydrate(rec.doc);
    this.doc.name = rec.name;
    this.savedSnapshot = JSON.stringify(serialize(this.doc));
    this.sel = { kind: "palette", id: Math.min(this.doc.selected || 0, this.doc.palettes.length - 1) };
    this.segment = "palette";
    this.exportOpen = false;
    this.history = []; // a fresh doc starts with an empty undo stack
    this.future = [];
    this._dragSnap = null;
    if (this._dragTimer) { clearTimeout(this._dragTimer); this._dragTimer = null; }
    this.fit();
    this.view = "editor";
    this.render();
  }

  isDirty() {
    return this.savedSnapshot !== JSON.stringify(serialize(this.doc));
  }

  save() {
    const rec = this.sets.find((s) => s.id === this.activeId);
    if (!rec) return;
    rec.doc = serialize(this.doc);
    rec.name = this.doc.name;
    rec.updated = Date.now();
    this.savedSnapshot = JSON.stringify(rec.doc);
    this.persistSets();
  }

  // mutate the document, autosave, and re-project. NOTE: this is the raw mutate
  // path; it does NOT snapshot history. Discrete edits go through commit() (one
  // undo step each); continuous slider drags go through editDrag() (the whole
  // drag coalesces into one step).
  //
  // opts.live: during a continuous drag we must NOT do a full render() — that
  // replaceChildren() would DESTROY the very <input type=range> the user is
  // dragging (and the palette-name <input> being typed into), killing the native
  // pointer drag / dropping focus mid-word. So a live edit updates ONLY the
  // live-preview surfaces in place (liveRefresh) and leaves the right pane (the
  // active control) untouched. The drag's settle ('change') does a full render().
  edit(fn, opts = {}) {
    fn(this.doc);
    this.doc.selected = this.sel.kind === "palette" ? this.sel.id : this.doc.selected;
    this.save();
    if (opts.live) this.liveRefresh();
    else this.render();
  }

  // liveRefresh — a PARTIAL, in-place update of just the live-preview surfaces,
  // used during a slider drag / name-input typing so the active control's DOM
  // node is never replaced. Re-projects the doc, then surgically updates:
  //   • the canvas SCENE ROWS — replace the children of the EXISTING .canvas-scene
  //     element (keep the element itself so its pan/zoom transform is preserved),
  //   • the LEFT analysis rail's graph cards in place (sliders live in the RIGHT
  //     pane, so rebuilding the left pane's graphs can't disturb the drag),
  //   • the canvas-footer + app-footer readouts.
  // The right pane (and the dragged <input>) is left entirely alone.
  liveRefresh() {
    // Coalesce to ONE rebuild per animation frame. A slider drag fires `oninput` many times
    // per frame; re-projecting the whole doc (CAM16 math for every palette) + rebuilding the
    // canvas scene on EVERY event janks the drag — mildly in a browser, badly in Figma's
    // throttled iframe (the reported "buggy when dragging"). The doc is already mutated
    // synchronously by edit(), and the slider readout updates synchronously in its oninput,
    // so deferring only the heavy VISUAL refresh keeps state + the number live while smoothing.
    if (this._liveRaf != null) return;
    this._liveRaf = requestAnimationFrame(() => {
      this._liveRaf = null;
      this._liveRefreshNow();
    });
  }

  _liveRefreshNow() {
    const view = projectView(this.doc);
    this._view = view;

    // canvas scene rows — keep the .canvas-scene element (transform lives on it),
    // swap only its children so swatches reflect the new colors live.
    const scene = this.querySelector(".canvas-scene");
    if (scene) scene.replaceChildren(this._canvasScene(view));

    // canvas backdrop — lmin/lmax drive it, so repaint it as those sliders drag.
    const area = this.querySelector(".canvas-area");
    if (area) area.style.setProperty("--canvas-bg", this.canvasBg());

    // right-pane example card — repaint its role colors live (no inputs inside it,
    // so this never touches the dragged slider sitting in .seg-body above it).
    const ex = this.querySelector(".seg-example");
    if (ex) ex.replaceChildren(this.exampleCard(view));

    // damping-curve graph (Global tab) — redraw m(stop) live as Falloff/Amplify/Bias
    // drag; it's input-free, so refreshing it doesn't disturb the dragged slider.
    const dg = this.querySelector(".damp-graph");
    if (dg) dg.replaceChildren(this.graphDamping(this.doc));

    // left analysis rail — rebuild its graph cards in place (right-pane untouched).
    const leftBody = this.querySelector(".left-pane .an-body");
    if (leftBody) leftBody.replaceChildren(...this.analysisCards(view));
    // keep the "Analysis · <name>" header label in sync with the selection.
    const anSel = this.querySelector(".left-pane .an-sel");
    if (anSel) anSel.textContent = view.palettes[this.selectedIndex()]?.name || "";

    // footers — recompute the counts / warning readout in place.
    this.paintCanvasFooter();
    this.paintAppFooter(view);
  }

  // ── undo / redo ────────────────────────────────────────────────────────────
  // snapshot — the exact bytes persist.js stores (deep, plain, domain-clamped on
  // hydrate). Stacks hold these so undo/redo restore a WHOLE document.
  snapshot() {
    return JSON.stringify(serialize(this.doc));
  }

  // pushHistory — record the CURRENT (pre-mutation) doc as an undo point and
  // truncate the redo branch (editing after undo discards what was undone).
  // Bounded to HISTORY_MAX; the oldest entry is dropped past the cap.
  pushHistory() {
    this.history.push(this.snapshot());
    if (this.history.length > this.HISTORY_MAX) this.history.shift();
    this.future.length = 0; // a new committed edit kills the redo branch
  }

  // commit — a COMMITTED discrete edit = ONE undo step: snapshot the pre-edit
  // doc, then mutate/save/render. (add/delete/rename/enable/global/reorder.)
  commit(fn) {
    this.pushHistory();
    this.edit(fn);
  }

  // editDrag — a continuous control (slider) edit. The FIRST input of a drag
  // captures the pre-drag snapshot once; every input mutates live; a ~250ms
  // settle (release/pause) commits that single snapshot, so one drag = one step.
  editDrag(fn) {
    if (this._dragSnap == null) this._dragSnap = this.snapshot(); // pre-drag state, once
    this.edit(fn, { live: true }); // partial in-place update — never replace the active control
    if (this._dragTimer) clearTimeout(this._dragTimer);
    this._dragTimer = setTimeout(() => this.commitDrag(), 250);
  }

  // commitDrag — flush a settled drag's single pre-drag snapshot onto history.
  // Called by the debounce AND eagerly on slider 'change' (pointer release).
  commitDrag() {
    if (this._dragTimer) { clearTimeout(this._dragTimer); this._dragTimer = null; }
    if (this._dragSnap == null) return;
    this.history.push(this._dragSnap);
    if (this.history.length > this.HISTORY_MAX) this.history.shift();
    this.future.length = 0;
    this._dragSnap = null;
  }

  canUndo() { return this.history.length > 0; }
  canRedo() { return this.future.length > 0; }

  undo() {
    this.commitDrag(); // flush any in-flight drag so it's a distinct step first
    if (!this.history.length) return;
    this.future.push(this.snapshot()); // current state becomes a redo point
    this._restore(this.history.pop());
  }

  redo() {
    this.commitDrag();
    if (!this.future.length) return;
    this.history.push(this.snapshot()); // current state becomes an undo point
    this._restore(this.future.pop());
  }

  // _restore — load a snapshot as the live doc, re-project, re-persist, and keep
  // the selection in range. Goes through hydrate so every field is domain-clamped.
  // hydrate() drops `name` (not a domain field), so carry it from the snapshot.
  _restore(snap) {
    const raw = JSON.parse(snap);
    this.doc = hydrate(raw);
    this.doc.name = typeof raw.name === "string" ? raw.name : this.doc.name;
    const max = this.doc.palettes.length - 1;
    this.sel = { kind: "palette", id: Math.max(0, Math.min(this.sel.id, max)) };
    this.doc.selected = this.sel.id;
    this.save();
    this.render();
  }

  // ── keyboard shortcuts ───────────────────────────────────────────────────────
  // Installed once on the document. Undo/redo work editor-wide; the nav keys
  // (↑↓ 1/2/3 Esc f +/-) fire ONLY when the editor is shown and focus is NOT in a
  // text field (so typing a palette/set name is never hijacked). Pan/zoom/segment/
  // selection are UI-session — none of these keys snapshot history.
  _installKeyboard() {
    this._onKeyDown = (e) => this._handleKey(e);
    document.addEventListener("keydown", this._onKeyDown);
  }

  // _isTextTarget — true when focus is in a text input / textarea / contenteditable,
  // where the bare nav keys must yield to the field (only undo/redo still apply).
  _isTextTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "select") return true;
    if (tag === "input") {
      const ty = (t.type || "text").toLowerCase();
      // range/checkbox/etc. are NOT text — but text/search/number/etc. ARE.
      return !["range", "checkbox", "radio", "button", "color", "submit"].includes(ty);
    }
    return false;
  }

  _handleKey(e) {
    if (this.view !== "editor") return;
    const meta = e.metaKey || e.ctrlKey;

    // Undo / redo — work regardless of focus (standard editor behavior).
    if (meta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (meta && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      this.redo();
      return;
    }

    // Everything below is bare (no modifier) and must NOT fire while typing.
    if (meta || e.altKey) return;
    if (this._isTextTarget(e.target)) return;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        this._selectRelative(-1);
        return;
      case "ArrowDown":
        e.preventDefault();
        this._selectRelative(1);
        return;
      case "1":
        e.preventDefault();
        this.setSegment("palette");
        return;
      case "2":
        e.preventDefault();
        this.setSegment("global");
        return;
      case "3":
        e.preventDefault();
        this.setSegment("roles");
        return;
      case "[":
        e.preventDefault();
        this.toggleLeftPane();
        return;
      case "]":
        e.preventDefault();
        this.toggleRightPane();
        return;
      case "Escape":
        e.preventDefault();
        if (this.exportOpen) this.toggleDrawer(false);
        else this._deselect();
        return;
      case "f":
      case "F":
        e.preventDefault();
        this.fit();
        this.render();
        return;
      case "+":
      case "=": // unshifted '+' key
        e.preventDefault();
        this.zoomBy(1);
        return;
      case "-":
      case "_":
        e.preventDefault();
        this.zoomBy(-1);
        return;
    }
  }

  // _selectRelative — move the selection by ±1 with WRAP across all palettes.
  _selectRelative(dir) {
    const n = this.doc.palettes.length;
    if (n === 0) return;
    const cur = this.selectedIndex();
    const next = ((cur + dir) % n + n) % n; // wrap both directions
    this.selectPalette(next);
  }

  // _deselect — Esc with no drawer open: clear the right-pane/graph selection.
  // selectedIndex() clamps, so the panes fall back to palette 0; we mark the
  // session as having no explicit pick (kind:"none") so nothing renders 'sel'.
  _deselect() {
    this.sel = { kind: "none", id: this.sel.id };
    this.render();
  }

  fit() {
    // Recenter to origin (0,0) at the default zoom (no pan, 100%).
    this.viewport = { panX: 0, panY: 0, zoom: 1 };
  }

  // ── render dispatch ──────────────────────────────────────────────────────────
  render() {
    // DURABLE fix for the "replaceChildren nukes the focused control" class of bug
    // (it bit gallery-search, palette names, set name, and sliders). render() still
    // rebuilds the whole subtree, but we snapshot the focused control (by its stable
    // data-fk), its text caret, and every [data-scroll] region's offset BEFORE the
    // swap and put the user exactly back AFTER — so any fk-tagged input survives a
    // full render, not just the few with bespoke liveRefresh patches.
    const focus = this._captureFocus();
    this.replaceChildren(this.view === "gallery" ? this.renderGallery() : this.renderEditor());
    this.dataset.theme = this.theme;
    // The app-footer renders an empty shell with stable hooks; paint its dynamic
    // readouts now (the same path liveRefresh uses during a drag).
    if (this.view === "editor") this.paintAppFooter(this._view);
    this._restoreFocus(focus);
    this._syncDrawer(); // (re)open/close the native <dialog> to match exportOpen (top layer)
    this._syncNewPal(); // same, for the New-Palette modal
    this._syncApplyGate(); // same, for the Apply-to-Figma consent gate
    this._syncSettings(); // same, for the Settings modal
  }

  // _syncDrawer — reconcile the native export <dialog> with this.exportOpen AFTER each render.
  // render() rebuilds the whole subtree (a fresh, closed <dialog> each time), so an open drawer
  // must be re-promoted to the top layer via showModal(). Guarded so the headless DOM shim (no
  // showModal) and any unsupported host fall back to plain state (exportOpen) with no error.
  _syncDrawer() {
    const d = this.querySelector(".drawer");
    if (!d || typeof d.showModal !== "function") return;
    if (this.exportOpen && !d.open) { try { d.showModal(); } catch { /* not attached yet */ } }
    else if (!this.exportOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }

  // _walkFind — first element in this subtree matching pred (works in the browser
  // AND the headless DOM shim; avoids attribute-selector support in querySelector).
  _walkFind(pred) {
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.dataset && pred(c)) return c;
        const f = walk(c);
        if (f) return f;
      }
      return null;
    };
    return walk(this);
  }

  // _captureFocus — snapshot the focused control (by data-fk), its caret, and the
  // scroll offsets of [data-scroll] regions, BEFORE a render swaps the DOM out.
  _captureFocus() {
    const snap = { fk: null, s: null, e: null, scroll: [] };
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.fk) {
      snap.fk = a.dataset.fk;
      try { snap.s = a.selectionStart; snap.e = a.selectionEnd; } catch { /* range / non-text */ }
    }
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.dataset && c.dataset.scroll != null) snap.scroll.push([c.dataset.scroll, c.scrollTop || 0, c.scrollLeft || 0]);
        walk(c);
      }
    };
    walk(this);
    return snap;
  }

  // _restoreFocus — after the render, put scroll + focus + caret back where they were.
  _restoreFocus(snap) {
    for (const [key, top, left] of snap.scroll) {
      const el = this._walkFind((c) => c.dataset.scroll === key);
      if (el) { try { el.scrollTop = top; el.scrollLeft = left; } catch { /* detached */ } }
    }
    if (!snap.fk) return;
    const el = this._walkFind((c) => c.dataset.fk === snap.fk);
    if (el && el !== document.activeElement) {
      el.focus && el.focus();
      if (snap.s != null && el.setSelectionRange) {
        try { el.setSelectionRange(snap.s, snap.e); } catch { /* not a text field */ }
      }
    }
  }

  // ═══════════════════════════ GALLERY ═══════════════════════════
  // buildTiles — the filtered tile list for the current search query. Split out
  // so typing can refresh ONLY the grid container, never the <input> (which would
  // drop focus). Returns the array of tile/new-tile nodes.
  buildTiles() {
    const q = this.search.trim().toLowerCase();
    const visible = this.sets.filter((s) => !q || s.name.toLowerCase().includes(q));

    const tiles = visible.map((rec) => {
      const v = projectView(hydrate(rec.doc));
      const enabled = v.palettes.filter((p) => p.on);
      const strip = h(
        "div",
        { class: "strip" },
        ...enabled.slice(0, 8).map((p) => h("i", { style: `background:${p.key}` })), // p.key = vivid identity color
      );
      // A card with a PRIMARY action (open) + a SECONDARY action (delete). The tile is a
      // role=button div — NOT a <button> — so the delete can be a real, keyboard-focusable
      // <button> without nesting interactives. Enter/Space on the tile opens it.
      const tile = h(
        "div",
        {
          class: "set-tile",
          role: "button",
          tabindex: "0",
          "aria-label": `Open palette set ${rec.name}`,
          onclick: () => this.openSet(rec.id),
          onkeydown: (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            this.openSet(rec.id);
          },
        },
        // tags ride the preview: count bottom-left, the updated-time bottom-right (the slot a preset
        // tile uses for its "preset" badge), and the delete button top-right (it keeps stopPropagation
        // so it deletes rather than opening the set). The meta row keeps the name.
        h(
          "div",
          { class: "set-thumb" },
          strip,
          h(
            "button",
            {
              type: "button",
              class: "del",
              title: "Delete set",
              "aria-label": `Delete palette set ${rec.name}`,
              onclick: (e) => {
                e.stopPropagation();
                this.deleteSet(rec.id);
              },
            },
            icon("trash", { size: 13 }),
          ),
          h("span", { class: "tile-tag tile-count" }, `${enabled.length} ${enabled.length === 1 ? "palette" : "palettes"}`),
          h("span", { class: "tile-tag tile-preset" }, ago(rec.updated)),
        ),
        h(
          "div",
          { class: "set-meta" },
          h("div", { class: "nm" }, rec.name),
        ),
      );
      return tile;
    });

    const newTile = h(
      "div",
      { class: "new-tile", onclick: () => this.createSet() },
      h("div", { class: "plus" }, icon("plus", { size: 22 })),
      h("div", {}, "New set"),
    );

    if (this.sets.length === 0)
      return [h("div", { class: "empty-note" }, "Create your first palette set")];
    if (tiles.length === 0 && this.search.trim())
      return [newTile, h("div", { class: "empty-note" }, `No sets match “${this.search.trim()}”`)];
    return [newTile, ...tiles];
  }

  // buildPresetTiles — the read-only palette shelf for ONE category category (its lazily-loaded
  // { VOLUMES, PRESETS }). Presets ship in code (generated from docs/spec/colors/categories/), never in
  // localStorage; clicking one OPENS AN EDITABLE COPY into the user's sets (openConfigAsSet hydrates +
  // appends + opens). Grouped by volume; filtered by the search box.
  buildPresetTiles(data) {
    if (!data) return [];
    const { VOLUMES, PRESETS } = data;
    const q = this.search.trim().toLowerCase();
    const visible = PRESETS.filter((p) => !q || p.name.toLowerCase().includes(q));
    // group by VOLUME (each category ships as 12 volumes of 4 palettes), in order.
    const byVol = new Map();
    for (const p of visible) { const v = p.vol || "—"; if (!byVol.has(v)) byVol.set(v, []); byVol.get(v).push(p); }
    if (byVol.size === 0) return [h("div", { class: "empty-note" }, `No palettes match “${this.search.trim()}”`)];
    return [...byVol.entries()].map(([vol, ps]) => {
      const vi = VOLUMES[vol];
      return h(
        "div",
        { class: "preset-vol" },
        h(
          "div",
          { class: "preset-vol-head" },
          h("span", { class: "preset-vol-num" }, "Vol " + vol),
          vi && vi.title ? h("span", { class: "preset-vol-title" }, vi.title) : false,
          vi && vi.intro ? h("p", { class: "preset-vol-intro" }, vi.intro) : false,
        ),
        h("div", { class: "set-grid preset-grid" }, ...ps.map((p) => this.presetTile(p))),
      );
    });
  }

  // presetTile — one read-only preset card. Clicking opens an editable copy into the user's sets.
  presetTile(preset) {
    const v = projectView(hydrate(preset));
    const enabled = v.palettes.filter((p) => p.on);
    const SAMPLED_W = [36, 19, 19, 16, 6, 4];
    const strip = h(
      "div",
      { class: "strip" },
      ...enabled.slice(0, 6).map((p, i) => h("i", { style: `background:${p.key};flex:${SAMPLED_W[i] || 1}` })),
    );
    return h(
      "button",
      { class: "set-tile preset", title: `Open a copy of “${preset.name}”`, onclick: () => this.openConfigAsSet(preset, `Opened “${preset.name}”`) },
      h(
        "div",
        { class: "set-thumb" },
        strip,
        h("span", { class: "tile-tag tile-preset" }, preset.story ? "story" : "preset"),
        h("span", { class: "tile-tag tile-count" }, `${enabled.length} palettes`),
      ),
      h("div", { class: "set-meta" }, h("div", { class: "nm" }, preset.name)),
    );
  }

  // refreshTiles — re-render ONLY the grid hosts' children. Used on search input so the <input>
  // element is never replaced and keeps focus + caret. On the hub, search filters Your Palettes; inside
  // a category category it filters that category's palette shelf (only one host exists per view).
  refreshTiles() {
    if (this._gridHost) this._gridHost.replaceChildren(...this.buildTiles());
    if (this._presetGridHost && this.category)
      this._presetGridHost.replaceChildren(...this.buildPresetTiles(this._categoryData[this.category]));
  }

  // openCategory / closeCategory — navigate the gallery hub. Opening a category lazily loads its module
  // (one code-split chunk; cached after first open) and re-renders into the category page; while the
  // chunk is in flight the page shows a "Loading…" note. closeCategory returns to the hub.
  openCategory(slug) {
    this.category = slug;
    this.search = "";
    if (this._categoryData[slug]) { this.render(); return Promise.resolve(this._categoryData[slug]); }
    this.render(); // loading state
    return loadCategory(slug)
      .then((m) => { if (m) this._categoryData[slug] = m; if (this.category === slug) this.render(); return m; })
      .catch(() => { if (this.category === slug) this.render(); return null; });
  }
  closeCategory() { this.category = null; this.search = ""; this.render(); }

  // categoryCard — one category tile on the hub: a color strip sampled from the category + its name,
  // eyebrow, tagline, and palette count. Clicking opens the category page.
  categoryCard(c) {
    return h(
      "button",
      { class: "category-card", title: `Open ${c.category}`, onclick: () => this.openCategory(c.slug) },
      h("div", { class: "category-strip" }, ...c.strip.map((hex) => h("i", { style: `background:${hex}` }))),
      h(
        "div",
        { class: "category-card-body" },
        c.eyebrow ? h("div", { class: "category-card-eyebrow" }, c.eyebrow) : false,
        h("div", { class: "category-card-title" }, c.category),
        c.tagline ? h("p", { class: "category-card-tagline" }, c.tagline) : false,
        h("span", { class: "category-card-count" }, `${c.count} palettes`),
      ),
    );
  }

  // ensureSearchInput — the search <input> is created ONCE and reused across renders so typing never
  // loses focus (the BUG: re-render replaced it). On input we only refresh tiles.
  ensureSearchInput(label) {
    if (!this._searchInput) {
      this._searchInput = h("input", {
        type: "search",
        "data-fk": "search",
        "aria-label": label,
        placeholder: "Search…",
        value: this.search,
        oninput: (e) => {
          this.search = e.target.value;
          this.refreshTiles(); // tiles only — input stays put, focus + caret preserved
        },
      });
    } else if (this._searchInput.value !== this.search) {
      this._searchInput.value = this.search; // reuse: sync value without touching node identity
    }
    this._searchInput.setAttribute("aria-label", label);
    return this._searchInput;
  }

  renderGallery() {
    // In Figma, probe the file ONCE on open: the embedded config (lossless) if present, else the
    // variable structure (lossy fallback). Both reads return async and re-render the gallery here.
    if (this.inFigma && !this._figmaProbed) this.probeFigmaProject();

    return h(
      "div",
      { class: "gallery" },
      this.toastEl || (this.toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" })),
      h(
        "header",
        { class: "gallery-header" },
        h("div", { class: "brand" }, brandMark(), "Color Tokens by NONOUN"),
        h("div", { class: "spacer" }),
        btn([icon("download"), "Project"], { onclick: () => this.loadFromProject(), title: this.inFigma ? "Load the config saved in this Figma file" : "Load the config saved to the project (Source of Truth)" }),
        btn([icon("upload"), "Import"], { onclick: () => this.importSet(), title: "Import a palette config (.json) exported from Export → Config" }),
        btn("+ New", { onclick: () => this.createSet() }),
        this.themeBtn(),
      ),
      this.category ? this.renderCategoryBody() : this.renderHubBody(),
    );
  }

  // renderHubBody — the gallery home: a STICKY masthead (title + search · description) over the
  // scrolling content — Your Palettes (your saved sets) and the Categories category grid.
  renderHubBody() {
    this._presetGridHost = null;
    this._gridHost = h("div", { class: "set-grid" }, ...this.buildTiles());
    return h(
      "div",
      { class: "gallery-body" },
      // sticky masthead — title + search (row 1), description (row 2).
      h(
        "div",
        { class: "gallery-masthead" },
        h(
          "div",
          { class: "masthead-row" },
          h("h1", { class: "masthead-title" }, "Color Tokens"),
          h("div", { class: "spacer" }),
          this.ensureSearchInput("Search your palette sets"),
        ),
        h("p", { class: "masthead-desc" }, "Generate perceptual color palettes and semantic design tokens. Build your own set, or open a curated color category as a starting point."),
      ),
      h(
        "div",
        { class: "gallery-content" },
        this.renderFigmaImportRow(), // a separate row ABOVE the sets when this Figma file already has palette variables
        h("div", { class: "gallery-title" }, h("h2", {}, "Your Palettes")),
        this._gridHost,
        // Color Categories — read-only curated categories. Opening a palette copies it into Your Palettes.
        h(
          "div",
          { class: "gallery-title categories-head" },
          h("h2", {}, "Color Categories"),
          h("span", { class: "title-count" }, String(CATEGORY_INDEX.length)),
        ),
        h("p", { class: "categories-lede" }, "Palettes sourced from real places, dishes, films, books, scenes, biomes — read for their colour, not their cliché. Open any palette as an editable copy."),
        h("div", { class: "category-grid" }, ...CATEGORY_INDEX.map((c) => this.categoryCard(c))),
      ),
    );
  }

  // renderCategoryBody — one category category page: a STICKY masthead (back-eyebrow + search · title ·
  // description) over the category's 12 volumes × 4 palettes (lazily loaded). The eyebrow row doubles
  // as the back affordance to the hub.
  renderCategoryBody() {
    this._gridHost = null;
    const card = CATEGORY_INDEX.find((c) => c.slug === this.category) || { category: this.category, count: 0 };
    const data = this._categoryData[this.category];
    this._presetGridHost = data
      ? h("div", { class: "preset-shelf" }, ...this.buildPresetTiles(data))
      : h("div", { class: "preset-shelf" }, h("div", { class: "empty-note" }, "Loading…"));
    return h(
      "div",
      { class: "gallery-body" },
      h(
        "div",
        { class: "gallery-masthead category" },
        h(
          "div",
          { class: "masthead-row" },
          // the eyebrow IS the back affordance: ‹ + the category eyebrow → return to the hub.
          h(
            "button",
            { class: "category-back-eyebrow", title: "Back to all color categories", "aria-label": "Back to all color categories", onclick: () => this.closeCategory() },
            icon("caret-left", { size: 13 }),
            h("span", {}, card.eyebrow || "All color categories"),
          ),
          h("div", { class: "spacer" }),
          this.ensureSearchInput(`Search ${card.category} palettes`),
        ),
        h("h1", { class: "masthead-title masthead-serif" }, card.category),
        card.tagline ? h("p", { class: "masthead-desc" }, card.tagline) : false,
      ),
      h(
        "div",
        { class: "gallery-content" },
        h(
          "div",
          { class: "gallery-title" },
          h("h2", {}, "Palettes"),
          h("span", { class: "title-count" }, String(card.count)),
        ),
        this._presetGridHost,
      ),
    );
  }

  // probeFigmaProject — one-shot read of the file on gallery open (Figma only): the embedded config
  // (load-config → config-loaded → applyLoadedConfig records this.fileConfig) AND the raw-colors
  // structure (read-variables → variables-read → receiveLiveVariables). Both replies re-render the
  // gallery, revealing the import row — preferring the lossless config, falling back to the variables.
  probeFigmaProject() {
    if (this._figmaProbed || !this.inFigma) return;
    this._figmaProbed = true;
    try {
      parent.postMessage({ pluginMessage: { type: "load-config" } }, "*");   // the exact saved config (preferred)
      parent.postMessage({ pluginMessage: { type: "read-variables" } }, "*"); // the variable structure (fallback)
      parent.postMessage({ pluginMessage: { type: "load-sets" } }, "*");      // the gallery's saved sets (clientStorage)
    } catch { /* no frame */ }
  }

  // persistSets — write the gallery's sets to durable storage. The browser uses localStorage; a Figma
  // plugin iframe can't (opaque origin), so it ALSO posts them to code.js → figma.clientStorage.
  persistSets() {
    saveSets(this.sets); // localStorage — best-effort; a no-op in the sandboxed Figma iframe
    if (this.inFigma) {
      try { parent.postMessage({ pluginMessage: { type: "save-sets", sets: this.sets } }, "*"); } catch { /* no frame */ }
    }
  }

  // receiveStoredSets — the reply to load-sets (Figma): the user's sets from figma.clientStorage.
  // Restore them into the gallery; on first run (none stored) persist the seeded Default so it
  // survives the next open. Ignored once the user has left the gallery (don't clobber a live edit).
  receiveStoredSets(sets) {
    if (this.view !== "gallery") return;
    if (Array.isArray(sets) && sets.length) this.sets = sets;
    else this.persistSets(); // first run for this user — persist the seeded Default to clientStorage
    this.render();
  }

  // renderFigmaImportRow — the "read a project" affordance ABOVE "Your Palettes" (Figma only).
  // Prefers the file's embedded config (an EXACT round-trip); falls back to seeding from the raw-colors
  // variables (APPROXIMATE — only each family's 500 hue+chroma, no skew/lift/curves).
  renderFigmaImportRow() {
    if (!this.inFigma) return false;
    if (this.fileConfig && Array.isArray(this.fileConfig.palettes) && this.fileConfig.palettes.length) {
      const np = this.fileConfig.palettes.length;
      return h(
        "div",
        { class: "figma-import-row" },
        h("span", { class: "fir-icon" }, "◆"),
        h(
          "div",
          { class: "fir-text" },
          h("strong", {}, "This file has a saved HCT palette"),
          h("span", { class: "fir-sub" }, `${np} ${np === 1 ? "palette" : "palettes"} with full controls — opens exactly as saved.`),
        ),
        h("div", { class: "spacer" }),
        btn("Open saved palette", { variant: "primary", onclick: () => this.openConfigAsSet(this.fileConfig, "Opened the saved palette") }),
      );
    }
    if (this.liveVarsFound) {
      const families = new Set();
      for (const name of Object.keys(this.liveVars || {})) {
        const i = name.indexOf("/");
        if (i > 0) families.add(name.slice(0, i));
      }
      const n = families.size;
      if (!n) return false;
      return h(
        "div",
        { class: "figma-import-row is-approx" },
        h("span", { class: "fir-icon" }, "◆"),
        h(
          "div",
          { class: "fir-text" },
          h("strong", {}, "This file has a color structure (no saved config)"),
          h("span", { class: "fir-sub" }, `${n} ${n === 1 ? "family" : "families"} — approximate read (each family's 500 hue + chroma). For an exact round-trip, re-apply from the editor to embed the full config.`),
        ),
        h("div", { class: "spacer" }),
        btn("Read approx →", { onclick: () => this.readFromFigmaVariables() }),
      );
    }
    return false;
  }

  // readFromFigmaVariables — seed a new set from the file's variables (the APPROXIMATE fallback when no
  // config is embedded). configFromVariables recovers each family's 500 hue+chroma; openConfigAsSet then
  // shape-clamps + opens it. The user refines the controls and re-applies (which embeds an exact config).
  readFromFigmaVariables() {
    const config = configFromVariables(this.liveVars);
    if (!config) { this.toast("No readable color families in this file"); return; }
    this.openConfigAsSet(config, "Read approximate palette from variables");
  }

  createSet() {
    const name = "Set " + (this.sets.length + 1);
    const rec = newSet(name);
    this.sets.push(rec);
    this.persistSets();
    this.openSet(rec.id);
  }

  // importSet — load a palette config (.json from Export → Config) as a NEW set. The file
  // is UNTRUSTED data: JSON.parse (never eval), require a real palettes[] shape, then
  // hydrate() domain-clamps every field. A junk/empty file is rejected, not opened.
  importSet() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(String(reader.result)); } catch { parsed = null; }
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.palettes) || parsed.palettes.length === 0) {
          this.toast("Import failed — not a palette config (.json)");
          return;
        }
        const doc = hydrate(parsed); // clamps every field to its domain; ignores anything off-shape
        const name = (typeof parsed.name === "string" && parsed.name.trim()) || file.name.replace(/\.[^.]+$/, "") || "Imported";
        doc.name = name;
        const id = "set-" + Date.now().toString(36);
        this.sets.push({ id, name, doc: serialize(doc), updated: Date.now() });
        this.persistSets();
        this.openSet(id);
        this.toast("Imported " + name);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  deleteSet(id) {
    this.sets = this.sets.filter((s) => s.id !== id);
    this.persistSets();
    this.render();
  }

  // ═══════════════════════════ EDITOR ═══════════════════════════
  renderEditor() {
    const view = projectView(this.doc);
    this._view = view;

    return h(
      "div",
      { class: "editor" + (this.panesLeft ? "" : " left-collapsed") + (this.panesRight ? "" : " right-collapsed") },
      this.renderAppHeader(),
      this.renderLeftPane(view),
      this.renderCenter(view),
      this.renderRightPane(view),
      this.renderAppFooter(),
      this.renderDrawer(view),
      this.renderNewPalette(view),
      this.renderApplyGate(),
      this.renderSettings(),
      this.toastEl || (this.toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" })),
    );
  }

  renderAppHeader() {
    return h(
      "header",
      { class: "app-header" },
      h(
        "div",
        {
          class: "brand brand-link",
          role: "button",
          tabindex: "0",
          title: "Back to gallery",
          onclick: () => this.toGallery(),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toGallery(); } },
        },
        brandMark(),
        "Color Tokens",
      ),
      h("input", {
        class: "docname",
        "data-fk": "docname",
        type: "text",
        value: this.doc.name,
        title: "Set name",
        // rename coalesces into one undo step. editDrag does a PARTIAL liveRefresh
        // (the app-header is left untouched), so this <input> keeps focus + caret
        // while typing. blur/Enter ('change') settles the undo step and renders.
        oninput: (e) => this.editDrag((d) => (d.name = e.target.value)),
        onchange: () => {
          this.commitDrag();
          this.render();
        },
      }),
      h("div", { class: "spacer" }),
      // trailing strip: undo · redo · scheme · new · export.
      btn(icon("arrow-counter-clockwise"), { cls: "undo-btn", title: "Undo (⌘Z)", ariaLabel: "Undo", disabled: !this.canUndo(), onclick: () => this.undo() }),
      btn(icon("arrow-clockwise"), { cls: "redo-btn", title: "Redo (⇧⌘Z)", ariaLabel: "Redo", disabled: !this.canRedo(), onclick: () => this.redo() }),
      this.themeBtn(),
      btn(icon("gear"), { cls: "settings-btn", title: "Settings — token mapping & preferences", ariaLabel: "Settings", onclick: () => this.openSettings() }),
      btn([icon("plus"), "New"], { onclick: () => this.createSet() }),
      btn([icon("export"), "Export"], { variant: "primary", cls: "export-open-btn", title: "Open export drawer", onclick: () => this.toggleDrawer(true) }),
    );
  }

  // toggleLeftPane / toggleRightPane — collapse/expand a side pane (the .editor grid track → 0).
  // Ephemeral ui-session state (like segment); a full render re-applies the modifier class.
  toggleLeftPane() { this.panesLeft = !this.panesLeft; this.render(); }
  toggleRightPane() { this.panesRight = !this.panesRight; this.render(); }

  // paneToggle — the collapse/expand control for one side pane. The SAME button renders
  // in two places by state: while the pane is OPEN it lives in that pane's own header
  // (left → the Analysis label, right → the Inspector tab row); once COLLAPSED it pops to
  // the canvas-header (left → its left edge, right → its right edge) so there's always a
  // visible affordance to bring the pane back. `.on` + aria-pressed track "pane shown".
  paneToggle(side) {
    const left = side === "left";
    const shown = left ? this.panesLeft : this.panesRight;
    return h("button", {
      class: "ghost pane-toggle pane-toggle-" + side + (shown ? " on" : ""),
      "data-fk": "pane-" + side,
      title: (shown ? "Collapse" : "Show") + (left ? " the analysis pane ([)" : " the inspector pane (])"),
      "aria-label": (shown ? "Collapse" : "Show") + (left ? " left analysis pane" : " right inspector pane"),
      "aria-pressed": shown ? "true" : "false",
      onclick: () => (left ? this.toggleLeftPane() : this.toggleRightPane()),
    }, icon("sidebar", { cls: left ? "" : "flip-x" }));
  }

  toGallery() {
    this.view = "gallery";
    this.render();
  }

  // app-chrome color scheme — icon-only (sun/moon/auto), cycles system → light → dark.
  themeBtn() {
    return btn(icon(SCHEME_ICON[this.theme] || "theme"), {
      cls: "scheme-btn",
      title: "App theme: " + this.theme + " (UI only) — click to cycle system / light / dark",
      ariaLabel: "App theme: " + this.theme + " — cycle system / light / dark",
      onclick: () => {
        this.theme = SCHEME_NEXT[this.theme] || "system";
        this.dataset.theme = this.theme;
        // Flip the CHROME too: color-scheme on :root so every generated light-dark() --c-*
        // token resolves to the new mode ("system" → "light dark" → follows the OS).
        setColorScheme(this.theme);
        this.render();
      },
    });
  }

  // canvas-preview color scheme — icon-only (sun/moon/auto), cycles system → light → dark.
  // "system" follows the OS; INDEPENDENT of the app-chrome theme.
  canvasThemeBtn() {
    return btn(icon(SCHEME_ICON[this.canvasTheme] || "theme"), {
      cls: "scheme-btn",
      title: "Canvas preview scheme: " + this.canvasTheme + " — click to cycle system / light / dark",
      ariaLabel: "Canvas preview scheme: " + this.canvasTheme + " — cycle system / light / dark",
      onclick: () => {
        this.canvasTheme = SCHEME_NEXT[this.canvasTheme] || "system";
        this.render();
      },
    });
  }

  // resolvedCanvasScheme — the concrete light/dark the canvas paints in: "system" maps to the OS
  // preference (prefers-color-scheme), everything else is itself.
  resolvedCanvasScheme() {
    if (this.canvasTheme === "system") {
      return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return this.canvasTheme;
  }

  // ── left pane (ANALYSIS rail) ─────────────────────────────────────────────────
  // Stacked, scrollable analysis graphs for the SELECTED palette + (hue wheel) the
  // whole enabled set. Every datum comes from projectView(doc) — never stored.
  renderLeftPane(view) {
    const idx = this.selectedIndex();
    const vp = view.palettes[idx];
    const name = vp ? vp.name : "";

    return h(
      "aside",
      { class: "left-pane" },
      h("div", { class: "pane-label" }, "Analysis", h("span", { class: "an-sel" }, name),
        // while OPEN the left toggle hugs this header's inner (canvas-side) edge; once
        // collapsed it is rendered in the canvas-header instead (see renderCanvasHeader).
        this.panesLeft ? this.paneToggle("left") : false),
      // .an-body wraps just the graph cards so liveRefresh can rebuild them in
      // place (replaceChildren) without touching the pane label or the pane shell.
      h("div", { class: "an-body" }, ...this.analysisCards(view)),
    );
  }

  // analysisCards — the left rail's graph cards for the current view. Shared by
  // the full render (renderLeftPane) and the in-place liveRefresh, so a drag
  // updates these graphs without a full re-render.
  analysisCards(view) {
    const idx = this.selectedIndex();
    const card = (label, body) =>
      h(
        "div",
        { class: "an-card" },
        h("div", { class: "an-label" }, label),
        body,
      );
    return [
      card("L*×C — applied chroma vs gamut ceiling", this.graphLC(view, idx)),
      card("Tone curve — L* per stop", this.graphTone(view, idx)),
      card("Chroma curve — applied vs ceiling", this.graphChroma(view, idx)),
      card("Contrast — on-colors vs fills (≥4.5:1)", this.graphContrast(view, idx)),
      card("Hue wheel — all enabled palettes", this.graphHueWheel(view)),
    ];
  }

  // legend — a small key under a multi-series graph (chips match the SVG strokes:
  // `solid` = applied/accent line, `faint` = a dashed reference line, `fill` = the
  // gamut-ceiling area). Without it the overlaid lines are ambiguous.
  legend(items) {
    return h(
      "div",
      { class: "an-legend" },
      ...items.map((it) =>
        h("span", { class: "an-leg" }, h("span", { class: "an-leg-mark " + it.mark }), it.label),
      ),
    );
  }

  // selectedIndex — the index of the palette driving the right pane + graphs,
  // clamped into range.
  selectedIndex() {
    const n = this.doc.palettes.length;
    let i = this.sel.kind === "palette" ? this.sel.id : this.doc.selected || 0;
    return Math.max(0, Math.min(i, n - 1));
  }

  // L*×C plot (moved OUT of the canvas) — applied chroma vs gamut ceiling + tone line.
  graphLC(view, idx) {
    const target = view.plot[idx] || view.plot[0];
    if (!target) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 168, pad = 26;
    const pts = target.points;
    const maxC = Math.max(8, ...pts.map((p) => Math.max(p.ceiling, p.applied))) * 1.05;
    const X = (c) => pad + (c / maxC) * (W - pad - 8);
    const Y = (l) => 8 + ((100 - l) / 100) * (H - pad - 8);
    const ceilPath =
      "M" + pts.map((p) => `${X(p.ceiling).toFixed(1)},${Y(p.tone).toFixed(1)}`).join(" L") +
      ` L${X(0)},${Y(pts[pts.length - 1].tone).toFixed(1)} L${X(0)},${Y(pts[0].tone).toFixed(1)} Z`;
    const appliedPath = "M" + pts.map((p) => `${X(p.applied).toFixed(1)},${Y(p.tone).toFixed(1)}`).join(" L");
    const tonePath = "M" + pts.map((p) => `${X(0).toFixed(1)},${Y(p.tone).toFixed(1)}`).join(" L");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="${Y(100) + 3}">100</text>
        <text x="6" y="${Y(0)}">0</text>
        <text x="${W - 14}" y="${H - pad + 20}">C→</text>
        <path class="lc-ceiling" d="${ceilPath}"/>
        <path class="lc-toneline" d="${tonePath}"/>
        <path class="lc-applied" d="${appliedPath}"/>
        ${pts.map((p) => `<circle class="lc-dot" cx="${X(p.applied).toFixed(1)}" cy="${Y(p.tone).toFixed(1)}" r="2"/>`).join("")}
      </svg>`;
    return h(
      "div",
      {},
      h("div", { class: "an-svg", html: svg }),
      this.legend([
        { mark: "solid", label: "applied C" },
        { mark: "fill", label: "gamut ceiling" },
        { mark: "faint", label: "tone L*" },
      ]),
    );
  }

  // Tone curve — L* (tone) per stop across the ramp.
  graphTone(view, idx) {
    const vp = view.palettes[idx];
    if (!vp) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 120, pad = 22;
    const pts = vp.ramp;
    const X = (i) => pad + (i / (pts.length - 1)) * (W - pad - 8);
    const Y = (t) => 8 + ((100 - t) / 100) * (H - pad - 8);
    const line = "M" + pts.map((s, i) => `${X(i).toFixed(1)},${Y(s.tone).toFixed(1)}`).join(" L");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="${Y(100) + 3}">L*</text>
        <text x="${W - 26}" y="${H - pad + 18}">stops</text>
        <path class="lc-applied" d="${line}"/>
        ${pts.map((s, i) => `<circle class="lc-dot" cx="${X(i).toFixed(1)}" cy="${Y(s.tone).toFixed(1)}" r="1.8"/>`).join("")}
      </svg>`;
    return h("div", { class: "an-svg", html: svg });
  }

  // Chroma curve — applied chroma per stop vs the gamut ceiling (edge damping).
  graphChroma(view, idx) {
    const vp = view.palettes[idx];
    if (!vp) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 120, pad = 22;
    const pts = vp.ramp;
    const maxC = Math.max(8, ...pts.map((s) => Math.max(s.maxc, s.chroma))) * 1.05;
    const X = (i) => pad + (i / (pts.length - 1)) * (W - pad - 8);
    const Y = (c) => (H - pad + 8) - (c / maxC) * (H - pad - 8);
    const ceil = "M" + pts.map((s, i) => `${X(i).toFixed(1)},${Y(s.maxc).toFixed(1)}`).join(" L");
    const applied = "M" + pts.map((s, i) => `${X(i).toFixed(1)},${Y(s.chroma).toFixed(1)}`).join(" L");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="14">C</text>
        <text x="${W - 26}" y="${H - pad + 18}">stops</text>
        <path class="lc-toneline" d="${ceil}"/>
        <path class="lc-applied" d="${applied}"/>
        ${pts.map((s, i) => `<circle class="lc-dot" cx="${X(i).toFixed(1)}" cy="${Y(s.chroma).toFixed(1)}" r="1.6"/>`).join("")}
      </svg>`;
    return h(
      "div",
      {},
      h("div", { class: "an-svg", html: svg }),
      this.legend([
        { mark: "solid", label: "applied C" },
        { mark: "faint", label: "gamut ceiling" },
      ]),
    );
  }

  // Contrast — the selected palette's on-color vs fill ratios; flag <4.5:1.
  graphContrast(view, idx) {
    const vp = view.palettes[idx];
    const cr = vp ? view.contrast.find((c) => c.palette === vp.name) : null;
    if (!cr) return h("div", { class: "an-empty" }, "—");
    const bar = (label, ratio) => {
      const pass = ratio >= 4.5;
      const pct = Math.min(100, (ratio / 7) * 100);
      return h(
        "div",
        { class: "an-bar" },
        h("span", { class: "an-bk" }, label),
        h(
          "span",
          { class: "an-track" },
          // the WCAG 4.5:1 pass line (track spans 0–7:1, so 4.5/7 ≈ 64.3%).
          h("span", { class: "an-thresh", title: "4.5:1 minimum" }),
          h("span", { class: "an-fill" + (pass ? "" : " bad"), style: `width:${pct.toFixed(0)}%` }),
        ),
        h("b", { class: pass ? "pass" : "fail" }, ratio.toFixed(2) + " ", icon(pass ? "check" : "warning", { size: 12 })),
      );
    };
    return h(
      "div",
      { class: "an-contrast" },
      bar("on/fill", cr.onFill),
      bar("vs #fff", cr.onWhite),
      bar("vs #000", cr.onBlack),
    );
  }

  // dampPresets — a row of one-click chips that set all four damping knobs together.
  // The chip matching the current values is highlighted; each is a single undo step.
  dampPresets() {
    const d = this.doc;
    const active = (p) =>
      d.damp === p.damp && d.dampCurve === p.dampCurve && d.dampAmp === p.dampAmp && d.dampBias === p.dampBias;
    return h(
      "div",
      { class: "damp-presets" },
      ...DAMP_PRESETS.map((p) =>
        chip(p.name, {
          mode: "interactive",
          on: active(p),
          title: `damp ${p.damp} · falloff ${p.dampCurve} · amplify ${p.dampAmp} · bias ${p.dampBias}`,
          onclick: () =>
            this.commit((doc) => {
              doc.damp = p.damp;
              doc.dampCurve = p.dampCurve;
              doc.dampAmp = p.dampAmp;
              doc.dampBias = p.dampBias;
            }),
        }),
      ),
    );
  }

  // Damping curve — the global chroma multiplier m(stop) the differential damping
  // produces across the ramp. Crosses the 1× line (unity); dips at the ends (damp),
  // can bulge in the mids (amplify), and tilts with bias. Palette-independent.
  graphDamping(doc) {
    const W = 244, H = 116, pad = 22;
    const damp = (doc.damp ?? 80) / 100;
    const gamma = doc.dampCurve ?? 1.5;
    const amp = (doc.dampAmp ?? 0) / 100;
    const bias = (doc.dampBias ?? 0) / 100;
    const M = (stop) => {
      const s = (stop - 500) / 450;
      const uG = Math.abs(s) ** gamma;
      const sideW = Math.max(0, 1 + bias * Math.sign(s));
      return Math.max(0, 1 + amp * (1 - uG) - damp * sideW * uG);
    };
    const ymax = Math.max(1.15, 1 + amp) * 1.05;
    const X = (i) => pad + (i / (STOPS.length - 1)) * (W - pad - 8);
    const Y = (m) => H - pad + 8 - (m / ymax) * (H - pad - 8);
    const line = "M" + STOPS.map((st, i) => `${X(i).toFixed(1)},${Y(M(st)).toFixed(1)}`).join(" L");
    const y1 = Y(1).toFixed(1);
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <line class="dg-unity" x1="${pad}" y1="${y1}" x2="${W - 6}" y2="${y1}"/>
        <text x="2" y="${(+y1 - 3).toFixed(1)}">1×</text>
        <text x="${pad}" y="${H - pad + 18}">light</text>
        <text x="${W - 24}" y="${H - pad + 18}">dark</text>
        <path class="lc-applied" d="${line}"/>
        ${STOPS.map((st, i) => `<circle class="lc-dot" cx="${X(i).toFixed(1)}" cy="${Y(M(st)).toFixed(1)}" r="1.6"/>`).join("")}
      </svg>`;
    return h("div", { class: "an-svg", html: svg });
  }

  // Hue wheel — every ENABLED palette's hue plotted around a circle (whole set).
  graphHueWheel(view) {
    const W = 200, H = 200, cx = W / 2, cy = H / 2, R = 78;
    const sel = this.selectedIndex();
    const dots = this.doc.palettes
      .map((p, i) => ({ p, i, on: view.palettes[i] && view.palettes[i].on }))
      .filter((x) => x.on)
      .map(({ p, i }) => {
        const vp = view.palettes[i];
        const mid = vp.ramp.find((s) => s.stop === 550) || vp.ramp[Math.floor(vp.ramp.length / 2)];
        const a = ((p.hue - 90) * Math.PI) / 180; // 0° at top, clockwise
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const r = i === sel ? 7 : 5;
        const ring = i === sel ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r + 3}" class="hw-ring"/>` : "";
        return ring + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${mid.hex}" class="hw-dot"/>`;
      })
      .join("");
    const ticks = [0, 90, 180, 270]
      .map((d) => {
        const a = ((d - 90) * Math.PI) / 180;
        return `<text x="${(cx + Math.cos(a) * (R + 14)).toFixed(1)}" y="${(cy + Math.sin(a) * (R + 14) + 3).toFixed(1)}" text-anchor="middle">${d}°</text>`;
      })
      .join("");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" class="hw-circle"/>
        ${ticks}
        ${dots}
      </svg>`;
    return h("div", { class: "an-svg hw", html: svg });
  }

  // selectPalette — pick the palette that drives the right pane + selected graphs.
  selectPalette(id) {
    const max = this.doc.palettes.length - 1;
    this.sel = { kind: "palette", id: Math.max(0, Math.min(id, max)) };
    this.doc.selected = this.sel.id;
    this.render();
  }

  // setSegment — switch the right-pane segmented control (kept in ui-session state).
  setSegment(seg) {
    this.segment = seg;
    this.render();
  }

  // setCanvasView — switch the canvas between the palette ramps, the scrim overlays, and the
  // semantic-mapping table (ui-session state, like canvasTheme — never persisted with the doc).
  setCanvasView(v) {
    this.canvasView = v;
    this.render();
  }

  // segmented — the one segmented control for the whole app: a row of buttons where
  // exactly one is active. Bakes in the APG keyboard model the hand-rolled variants
  // were missing — roving tabindex (only the active button is tab-focusable) + Arrow
  // keys that move selection AND focus. role:"tablist" (tabs that switch a view —
  // buttons get role=tab + aria-selected + aria-controls) or role:"group" (a
  // single-select button group — buttons get aria-pressed). onSelect re-renders; we
  // then re-focus the newly-active button by its stable id, because the fk-restore
  // path (see _restoreFocus) would otherwise return focus to the OLD button.
  segmented(items, value, onSelect, opts = {}) {
    const { baseClass = "segmented", cls = "", ariaLabel, role = "tablist", controls, idPrefix = "seg" } = opts;
    const tabs = role === "tablist";
    const ids = items.map((it) => it.id);
    const bid = (id) => idPrefix + "-" + id;
    const mk = (it) => {
      const on = it.id === value;
      return h(
        "button",
        {
          type: "button",
          class: on ? "on" : "",
          id: bid(it.id),
          "data-fk": idPrefix + ":" + it.id,
          role: tabs ? "tab" : undefined,
          "aria-selected": tabs ? (on ? "true" : "false") : undefined,
          "aria-pressed": tabs ? undefined : on ? "true" : "false",
          "aria-controls": tabs ? controls : undefined,
          tabindex: on ? "0" : "-1",
          title: it.title,
          onclick: () => onSelect(it.id),
          onkeydown: (e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const cur = ids.indexOf(value);
            const next = ids[(cur + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
            onSelect(next); // re-renders
            const el = this.querySelector("#" + bid(next));
            if (el && el.focus) el.focus();
          },
        },
        it.label,
      );
    };
    return h(
      "div",
      { class: (baseClass + " " + cls).trim(), role, "aria-label": ariaLabel },
      ...items.map(mk),
    );
  }

  // setStopsMode — core (19 display stops) vs extended (25 EXPORT_STOPS) for the palette ramps.
  setStopsMode(v) {
    this.stopsMode = v;
    this.render();
  }

  // _canvasScene — the canvas content for the current view (one place, two call sites).
  _canvasScene(view) {
    if (this.canvasView === "scrims") return this.renderScrimsScene(view);
    if (this.canvasView === "mapping") return this.renderMappingScene(view);
    return this.renderRampsScene(view);
  }

  setMapTextMode(v) {
    this.mapTextMode = v;
    this.render();
  }

  // setRoleOverride — re-point a role's raw ref for one mode. Stored as a per-doc override on
  // top of the canonical role table (doc.roleOverrides); applied in projectView + the exporters.
  // One undo step; persisted. An empty/whitespace ref is ignored (use the reset ↺ to revert).
  setRoleOverride(key, mode, ref) {
    ref = String(ref || "").trim();
    if (!ref) return;
    this.commit((d) => {
      d.roleOverrides = d.roleOverrides || {};
      d.roleOverrides[key] = { ...(d.roleOverrides[key] || {}), [mode]: ref };
    });
  }

  // commitMapRaw — free-text editor: the user typed a full token name ("neutral-600"); strip the
  // palette prefix to the ref and store it (unknown refs degrade gracefully in resolveRoleHex).
  commitMapRaw(key, mode, tokenName, n) {
    const s = String(tokenName || "").trim();
    const ref = s.startsWith(n + "-") ? s.slice(n.length + 1) : s;
    this.setRoleOverride(key, mode, ref);
  }

  // clearRoleOverride — revert one mode of one role to canonical (drop the entry if now empty).
  clearRoleOverride(key, mode) {
    this.commit((d) => {
      const e = d.roleOverrides && d.roleOverrides[key];
      if (!e) return;
      delete e[mode];
      if (Object.keys(e).length === 0) delete d.roleOverrides[key];
    });
  }

  clearAllOverrides() {
    this.commit((d) => (d.roleOverrides = {}));
  }

  addPalette() {
    this.commit((d) => {
      // A new palette starts from clean defaults: every shaping control reset to neutral (skew/lift 0,
      // edge-hue 0, same-dir off) so it never inherits the previous palette's tweaks — only the
      // hue/chroma seed defines it. (Global controls are doc-level and shared, so they're untouched.)
      d.palettes.push({ name: "Palette " + (d.palettes.length + 1), hue: 200, chroma: 60, skew: 0, lift: 0, hueShift: 0, hueSameDir: false, on: true });
    });
    this.selectPalette(this.doc.palettes.length - 1);
  }

  // ── New-Palette modal ──────────────────────────────────────────────────────────
  // "+ Palette" opens a native <dialog> (top layer, like the export drawer) that DERIVES a
  // new palette instead of dropping a default. Three modes (segmented tabs):
  //   • Relative — a color-theory relationship (extend/complete/contrast/bridge/anchor/
  //     recontextualize) computed from the included palettes' identity colors.
  //   • Environmental — a neutral/environment tone (chroma-weighted-mean hue + a clamped low
  //     chroma) per docs/spec/color-neutral-derivation.md.
  //   • Custom — pick Hue + Chroma directly (parametric, the classic seed).
  // A/B derive a TARGET OKLCH (engine/derive.mjs), seed hue+chroma from it (seedFromKeyColor),
  // and retain it as the dominant key color; C sets hue+chroma straight. The "Derive from"
  // strip toggles which existing palettes feed A/B — system/status palettes start excluded.

  // status palettes (success/warning/error/…) carry meaning, not character — off by default.
  _isSystemPalette(name) {
    return /\b(success|positive|warning|error|danger|critical|negative|info)\b/.test(String(name || "").toLowerCase());
  }

  openNewPalette() {
    const ps = this.doc.palettes || [];
    this.newPalCtx = new Set(ps.map((_, i) => i).filter((i) => ps[i].on !== false && !this._isSystemPalette(ps[i].name)));
    if (!this.newPalCustom) this.newPalCustom = { hue: 210, chroma: 55 };
    this.newPalDrag = { x: 0, y: 0 }; // reset to centered each open (offset from margin:auto centre)
    this.newPalOpen = true;
    this.render();
  }
  closeNewPalette() { this.newPalOpen = false; this.render(); }

  _toggleCtx(i) {
    const ctx = this.newPalCtx || (this.newPalCtx = new Set());
    if (ctx.has(i)) ctx.delete(i); else ctx.add(i);
    this.render();
  }

  // _beginNewPalDrag — drag the modal by its header. The dialog is centered via `inset:0;
  // margin:auto`, so we offset from centre with a live `transform: translate()` (set in place,
  // no re-render → smooth) and remember the offset in newPalDrag so the next render re-applies it.
  // A drag that starts on a header control (the close button) is ignored.
  _beginNewPalDrag(e) {
    if (e.target && e.target.closest && e.target.closest("button")) return;
    const d = this.querySelector(".newpal");
    if (!d) return;
    const sx = e.clientX, sy = e.clientY;
    const base = { ...(this.newPalDrag || { x: 0, y: 0 }) };
    const move = (ev) => {
      this.newPalDrag = { x: base.x + (ev.clientX - sx), y: base.y + (ev.clientY - sy) };
      d.style.transform = `translate(${this.newPalDrag.x}px, ${this.newPalDrag.y}px)`;
    };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    if (e.preventDefault) e.preventDefault();
  }

  // _syncNewPal — mirror _syncDrawer for the New-Palette <dialog>: re-promote to the top layer
  // after each render (render rebuilds a fresh, closed dialog). Guarded for the headless shim.
  _syncNewPal() {
    const d = this.querySelector(".newpal");
    if (!d || typeof d.showModal !== "function") return;
    if (this.newPalOpen && !d.open) { try { d.showModal(); } catch { /* not attached yet */ } }
    else if (!this.newPalOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }

  // a context palette is "neutral" (deprioritized as a derivation primary) if it's named neutral/grey
  // or its identity is near-grey — so a derived/leading neutral never becomes the Relative primary.
  _isNeutralPalette(p, vp) {
    if (/\b(neutral|grey|gray)\b/i.test(String((p && p.name) || ""))) return true;
    return !!(vp && vp.key && hexToOklch(vp.key)[1] < 0.02);
  }

  // the included context palette indices in PRIORITY ORDER: non-neutral palettes first (in palette
  // order — so the first non-neutral is the "primary"), neutrals last. Drives samples[0] = primary.
  _orderedContext(view) {
    const ctx = this.newPalCtx || new Set();
    return [...ctx]
      .filter((i) => view.palettes[i] && view.palettes[i].key)
      .sort((a, b) => {
        const na = this._isNeutralPalette(this.doc.palettes[a], view.palettes[a]) ? 1 : 0;
        const nb = this._isNeutralPalette(this.doc.palettes[b], view.palettes[b]) ? 1 : 0;
        return (na - nb) || (a - b); // neutrals last; otherwise palette index order
      });
  }

  // samples for A/B = each included palette's vivid identity color as OKLCH [L,C,H], PRIORITY-ORDERED
  // (samples[0] = the primary, so deriveRelative pivots on it — see derive.mjs).
  newPalSamples(view) {
    return this._orderedContext(view).map((i) => hexToOklch(view.palettes[i].key));
  }

  // the primary context color (the highest-priority, first non-neutral included palette) — the hex
  // the Relative relationships pivot on, shown as the preview's reference swatch.
  _primaryContextHex(view) {
    const o = this._orderedContext(view);
    return o.length ? view.palettes[o[0]].key : null;
  }

  // the current tab's target: { oklch } for relative/environmental (null if no context), or
  // { custom:true } for the parametric tab.
  newPalTarget(view) {
    if (this.newPalTab === "custom") return { custom: true };
    const samples = this.newPalSamples(view);
    if (!samples.length) return null;
    return { oklch: this.newPalTab === "environmental" ? deriveNeutral(samples) : deriveRelative(this.newPalRel, samples) };
  }

  createNewPalette(view) {
    // the preview IS the source of truth — commit the same palette _newPalProposed projected.
    const proposed = this._newPalProposed(view);
    if (!proposed) { this.toast("Pick at least one palette to derive from"); return; }
    const tab = this.newPalTab;
    const name = "Palette " + (this.doc.palettes.length + 1);
    const pal = { name, hue: proposed.pal.hue, chroma: proposed.pal.chroma, skew: 0, lift: 0, hueShift: 0, hueSameDir: false, on: true };
    if (proposed.pal.keyColors) pal.keyColors = proposed.pal.keyColors; // A/B retain the derived dominant
    this.newPalOpen = false; // close on the commit's render (newPalOpen drives _syncNewPal)
    this.commit((d) => d.palettes.push(pal));
    this.selectPalette(this.doc.palettes.length - 1);
    this.toast(tab === "environmental" ? "Neutral palette derived" : tab === "custom" ? "Palette created" : "Palette derived");
  }

  renderNewPalette(view) {
    const ps = this.doc.palettes || [];
    const ctx = this.newPalCtx || new Set();
    const samples = this.newPalSamples(view);
    const needsCtx = this.newPalTab !== "custom";
    const blocked = needsCtx && samples.length === 0;
    const proposed = blocked ? null : this._newPalProposed(view); // the would-be palette (projected, uncommitted)
    const previewCss = proposed ? proposed.hex : null;
    const TABS = [
      { id: "relative", label: "Relative" },
      { id: "environmental", label: "Environmental" },
      { id: "custom", label: "Custom" },
    ];
    const drag = this.newPalDrag || { x: 0, y: 0 };
    return h(
      "dialog",
      {
        class: "newpal",
        "aria-label": "New palette",
        style: `transform: translate(${drag.x}px, ${drag.y}px)`,
        onclick: (e) => { if (e.target === e.currentTarget) this.closeNewPalette(); },
        oncancel: (e) => { e.preventDefault(); this.closeNewPalette(); },
      },
      // header doubles as the drag handle (move the whole modal); the close button is excluded.
      h(
        "div",
        { class: "drawer-head newpal-head", onpointerdown: (e) => this._beginNewPalDrag(e) },
        h("h3", {}, icon("plus"), "New palette"),
        h("div", { class: "spacer" }),
        btn(icon("x"), { ariaLabel: "Close", onclick: () => this.closeNewPalette() }),
      ),
      // "Derive from" strip — swatch-only chips (name on hover); tap to include/exclude (A/B only).
      h(
        "div",
        { class: "newpal-ctx" + (needsCtx ? "" : " muted") },
        h("div", { class: "newpal-ctx-head" }, h("b", {}, "Derive from"), h("small", {}, needsCtx ? (samples.length ? samples.length + " selected" : "select at least one") : "not used in Custom")),
        h(
          "div",
          { class: "newpal-chips" },
          ...ps.map((p, i) => {
            const vp = view.palettes[i];
            const on = ctx.has(i);
            return h("button", {
              type: "button",
              class: "newpal-chip" + (on ? " on" : ""),
              "aria-pressed": on ? "true" : "false",
              "aria-label": p.name + (on ? " (included)" : " (excluded)"),
              disabled: needsCtx ? undefined : true,
              title: p.name, // the palette name on hover (the swatch carries no text)
              style: `background:${vp ? vp.key : "#888"}`,
              onclick: () => this._toggleCtx(i),
            });
          }),
        ),
      ),
      this.segmented(TABS, this.newPalTab, (id) => { this.newPalTab = id; this.render(); }, { ariaLabel: "Derivation mode", cls: "newpal-seg", role: "group", idPrefix: "npt" }),
      // body = two columns: LEFT = diagrams (hue×chroma circle + chroma curve), RIGHT = the
      // segment's selection/picker + the proposed-palette preview (swatches + ramp).
      h(
        "div",
        { class: "newpal-body" },
        h(
          "div",
          { class: "newpal-cols" },
          h("div", { class: "newpal-col newpal-col-left" }, ...this._newPalDiagrams(view, proposed)),
          h("div", { class: "newpal-col newpal-col-right" }, ...this._newPalRight(view, samples, blocked, proposed)),
        ),
      ),
      h(
        "div",
        { class: "newpal-foot" },
        h(
          "div",
          { class: "newpal-preview" },
          h("span", { class: "newpal-sw", style: `background:${previewCss || "transparent"}` }),
          h("small", {}, blocked ? "Select a palette to derive from" : "Proposed"),
        ),
        h("div", { class: "spacer" }),
        btn("Cancel", { onclick: () => this.closeNewPalette() }),
        btn("Create palette", { variant: "primary", cls: "newpal-create", disabled: blocked, onclick: () => this.createNewPalette(view) }),
      ),
    );
  }

  // _newPalProposed — the would-be palette for the current settings, PROJECTED (not committed):
  // returns { pal, view, vp, hex, target, pos } or null when A/B has no context. `pal` is the
  // minimal palette object (hue/chroma + keyColors for A/B); `view` is its throwaway projectView
  // (palettes[0] = vp, carrying .key + .ramp) so the diagrams + ramp render from real engine output.
  _newPalProposed(view) {
    const tab = this.newPalTab;
    let pal, target = null;
    if (tab === "custom") {
      const c = this.newPalCustom || { hue: 210, chroma: 55 };
      pal = { name: "_probe", hue: Math.round(c.hue), chroma: Math.round(c.chroma), on: true };
    } else {
      const samples = this.newPalSamples(view);
      if (!samples.length) return null;
      target = tab === "environmental" ? deriveNeutral(samples) : deriveRelative(this.newPalRel, samples);
      const s = seedFromKeyColor(target) || { hue: 200, chroma: 60 };
      pal = { name: "_probe", hue: s.hue, chroma: s.chroma, on: true, keyColors: [{ role: "dominant", oklch: target.map(Number) }] };
    }
    let pv;
    try { pv = projectView({ ...this.doc, palettes: [pal] }); } catch { return null; }
    const vp = pv.palettes[0];
    // the proposed dot's polar position: target hue/chroma for A/B; the rendered identity for Custom.
    const oklch = target || hexToOklch(vp.key);
    return { pal, view: pv, vp, hex: vp.key, target, pos: { H: oklch[2], C: oklch[1] } };
  }

  // LEFT column — the diagrams. The hue×chroma circle places every context color (and the proposed
  // one) at angle = hue, radius ∝ chroma; the chroma curve reuses the analysis-rail graph.
  _newPalDiagrams(view, proposed) {
    return [
      h(
        "div",
        { class: "newpal-diagram" },
        h("div", { class: "newpal-diagram-title" }, "Hue × chroma — context + proposed"),
        this._hueCircle(view, proposed),
      ),
      h(
        "div",
        { class: "newpal-diagram" },
        h("div", { class: "newpal-diagram-title" }, "Chroma curve — applied vs ceiling"),
        proposed ? this.graphChroma(proposed.view, 0) : h("div", { class: "an-empty" }, "—"),
      ),
    ];
  }

  // _hueCircle — a polar plot: 0° at top, clockwise (90° right · 180° bottom · 270° left). Each dot
  // sits at its hue angle; its distance from centre is its chroma normalized to the busiest sample
  // (greys fall to the middle, vivids to the rim). The proposed color wears an accent ring.
  _hueCircle(view, proposed) {
    const ctx = this.newPalCtx || new Set();
    const dots = [];
    for (const i of ctx) {
      const vp = view.palettes[i];
      if (!vp || !vp.key) continue;
      const [, C, H] = hexToOklch(vp.key);
      dots.push({ H, C, fill: vp.key, on: false });
    }
    if (proposed) dots.push({ H: proposed.pos.H, C: proposed.pos.C, fill: proposed.hex, on: true });
    const SZ = 280, cx = SZ / 2, cy = SZ / 2, R = SZ / 2 - 30;
    const maxC = Math.max(0.08, ...dots.map((d) => d.C)); // floor so a near-grey-only set still spreads
    const at = (H, C) => {
      const rr = R * Math.min(1, C / maxC), a = (H * Math.PI) / 180;
      return [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
    };
    const dotSvg = dots.map((d) => {
      const [x, y] = at(d.H, d.C);
      return d.on
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" class="hc-ring"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" class="hc-dot" fill="${d.fill}"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="hc-dot" fill="${d.fill}"/>`;
    }).join("");
    const svg = `
      <svg width="${SZ}" height="${SZ}" viewBox="0 0 ${SZ} ${SZ}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" class="hc-rim"/>
        <text x="${cx}" y="13" class="hc-axis" text-anchor="middle">0°</text>
        <text x="${SZ - 4}" y="${cy + 4}" class="hc-axis" text-anchor="end">90°</text>
        <text x="${cx}" y="${SZ - 3}" class="hc-axis" text-anchor="middle">180°</text>
        <text x="4" y="${cy + 4}" class="hc-axis" text-anchor="start">270°</text>
        ${dotSvg}
      </svg>`;
    return h("div", { class: "an-svg newpal-hc", html: svg });
  }

  // RIGHT column — segment-specific: the selection/picker, then the proposed-palette preview.
  _newPalRight(view, samples, blocked, proposed) {
    const pane = h("div", { class: "newpal-pp-host" }, this._newPalPreviewPane(view, proposed));
    if (this.newPalTab === "relative") return [this._relSelect(), pane];
    if (this.newPalTab === "environmental") {
      return [
        h("p", { class: "newpal-note" }, "A neutral environment tone for backgrounds, surfaces, dividers, and system text. Its hue is the chroma-weighted average of the selected palettes — the saturated members set the temperature — at a chroma low enough to still read as grey."),
        blocked ? false : h("p", { class: "newpal-readout" }, ...this._envReadout(samples)),
        pane,
      ];
    }
    return [this._customPicker(proposed), pane];
  }

  // the relationship radio group (a single column inside the right pane).
  _relSelect() {
    return h(
      "div",
      { class: "newpal-rels", role: "radiogroup", "aria-label": "Relationship" },
      ...RELATIONSHIPS.map((r) => {
        const on = this.newPalRel === r.id;
        return h(
          "button",
          {
            type: "button",
            class: "newpal-rel" + (on ? " on" : ""),
            role: "radio",
            "aria-checked": on ? "true" : "false",
            onclick: () => { this.newPalRel = r.id; this.render(); },
          },
          h("b", { class: "newpal-rel-label" }, r.label),
          h("small", { class: "newpal-rel-hint" }, r.hint),
        );
      }),
    );
  }

  // the Custom picker — a native color picker + parametric Hue/Chroma sliders. Picking a color seeds
  // hue/chroma from it (CAM16 recovery); the sliders fine-tune. Both touch newPalCustom (not the
  // doc/undo stack) and refresh the preview + diagrams in place (a full render would recreate the
  // range input mid-drag / detach the OS color panel) — the sliders re-sync on the picker's `change`.
  _customPicker(proposed) {
    const c = this.newPalCustom || (this.newPalCustom = { hue: 210, chroma: 55 });
    const slider = (label, key, min, max, fmtFn) => {
      const readout = h("b", {}, fmtFn(c[key]));
      return h(
        "div",
        { class: "field" },
        h("label", {}, label, readout),
        h("input", {
          type: "range",
          "data-fk": "npc:" + key,
          "aria-label": label,
          min, max, step: 1, value: c[key],
          oninput: (e) => { const v = parseFloat(e.target.value); c[key] = v; readout.textContent = fmtFn(v); this._refreshNewPalPreview(); },
        }),
      );
    };
    return h(
      "div",
      { class: "newpal-custom" },
      h("p", { class: "newpal-note" }, "Pick a color, or set hue and chroma directly. The ramp builds from these the same way every palette does."),
      h(
        "div",
        { class: "field newpal-color-field" },
        h("label", {}, "Color"),
        h("input", {
          type: "color",
          class: "newpal-color-input",
          "data-fk": "npc:color",
          "aria-label": "Pick a color",
          value: (proposed && proposed.hex) || "#888888",
          // live: recover hue/chroma from the picked color + refresh the preview in place (don't
          // rebuild the input mid-pick — that would detach the OS color panel).
          oninput: (e) => { const s = seedFromKeyColor(hexToOklch(e.target.value)); if (s) { c.hue = s.hue; c.chroma = s.chroma; this._refreshNewPalPreview(); } },
          // settle: full render so the Hue/Chroma sliders move to reflect the picked color.
          onchange: () => this.render(),
        }),
      ),
      slider("Hue", "hue", 0, 360, (v) => fmt(v) + "°"),
      slider("Chroma", "chroma", 0, 100, (v) => fmt(v) + "%"),
    );
  }

  // the proposed-palette preview: the proposed Dominant swatch, the Primary it's derived relative to
  // (Relative only — the priority anchor), the priority chain of the remaining context, and the full
  // generated ramp — the colors before committing.
  _newPalPreviewPane(view, proposed) {
    if (!proposed) return h("div", { class: "newpal-preview-pane empty" }, h("small", {}, "Select a palette to derive from"));
    const isRel = this.newPalTab === "relative";
    const chain = isRel ? this._orderedContext(view).map((i) => view.palettes[i].key) : [];
    const ord = ["Primary (anchor)", "Secondary", "Tertiary", "Quaternary"];
    return h(
      "div",
      { class: "newpal-preview-pane" },
      h("div", { class: "newpal-pp-label" }, "Proposed palette"),
      h(
        "div",
        { class: "newpal-pp-swatches" },
        this._ppSwatch("Dominant", proposed.hex),
        chain.length ? this._ppSwatch("Primary", chain[0], "the priority color this relationship pivots on") : false,
      ),
      // priority chain (Relative): the ordered context — primary first, then secondary/tertiary — so
      // the priority order driving the relationship is visible, not just the single anchor.
      isRel && chain.length > 1
        ? h(
            "div",
            { class: "newpal-pp-chain" },
            h("small", {}, "Context priority"),
            h(
              "div",
              { class: "newpal-pp-chain-row" },
              ...chain.map((hex, i) =>
                h("span", { class: "newpal-pp-chain-sw" + (i === 0 ? " primary" : ""), style: `background:${hex}`, title: ord[i] || `#${i + 1}` }),
              ),
            ),
          )
        : false,
      h(
        "div",
        { class: "newpal-ramp" },
        ...proposed.vp.ramp.map((s) => h("i", { class: s.inGamut ? "" : "oog", style: `background:${s.hex}`, title: `${s.stop} · ${s.hex}` })),
      ),
    );
  }
  _ppSwatch(label, css, title) {
    return h("div", { class: "newpal-pp-sw-item", title }, h("span", { class: "newpal-pp-sw", style: `background:${css}` }), h("small", {}, label));
  }

  // _envReadout — the derived neutral's hue + chroma, as a short human line under the description.
  _envReadout(samples) {
    const [, C, H] = deriveNeutral(samples);
    return ["Derived neutral: ", h("b", {}, fmt(H) + "° hue"), ", ", h("b", {}, "chroma " + C.toFixed(3)), " — a tinted grey."];
  }

  // _refreshNewPalPreview — recompute the diagrams + preview pane IN PLACE (no full render), so the
  // Custom sliders stay smooth mid-drag (their input nodes, in the right column, are never touched).
  _refreshNewPalPreview() {
    const view = this._view || projectView(this.doc);
    const blocked = this.newPalTab !== "custom" && this.newPalSamples(view).length === 0;
    const proposed = blocked ? null : this._newPalProposed(view);
    const left = this.querySelector(".newpal-col-left");
    if (left) left.replaceChildren(...this._newPalDiagrams(view, proposed));
    const host = this.querySelector(".newpal-pp-host");
    if (host) host.replaceChildren(this._newPalPreviewPane(view, proposed));
    const sw = this.querySelector(".newpal-sw");
    if (sw) sw.style.background = proposed ? proposed.hex : "transparent";
  }

  // ── center column ────────────────────────────────────────────────────────────
  renderCenter(view) {
    return h(
      "div",
      { class: "center" },
      this.renderCanvasHeader(),
      this.renderCanvasArea(view),
      this.renderCanvasFooter(),
    );
  }

  renderCanvasHeader() {
    return h(
      "div",
      { class: "canvas-header" },
      // when the LEFT pane is collapsed its toggle pops here, at the canvas's left edge.
      !this.panesLeft ? this.paneToggle("left") : false,
      // canvas content toggle — palette ramps vs the scrim overlays.
      this.segmented(
        [
          { id: "palettes", label: "Palettes", title: "Palettes — the tonal ramps" },
          { id: "scrims", label: "Scrims", title: "Scrims — the 7 translucent 500 overlays per palette, over a checkerboard" },
          { id: "mapping", label: "Mapping", title: "Semantic Mapping — each role's Light/Dark raw token, as a table" },
        ],
        this.canvasView,
        (id) => this.setCanvasView(id),
        { cls: "canvas-seg", ariaLabel: "Canvas view", idPrefix: "cview" },
      ),
      // stops density (Palettes + Scrims ramps): 19 core stops vs the 25 extended set (half-steps).
      this.canvasView !== "mapping"
        ? this.segmented(
            [
              { id: "core", label: "Core", title: "19 stops · 050/100/150/200/…" },
              { id: "extended", label: "All", title: "25 stops · adds 075/125/175/825/875/925" },
            ],
            this.stopsMode,
            (id) => this.setStopsMode(id),
            { cls: "canvas-seg", ariaLabel: "Ramp stops", role: "group", idPrefix: "stops" },
          )
        : false,
      // trailing tool group, right-aligned: fit · scheme · zoom · + Palette.
      h("div", { class: "spacer" }),
      // fit/orient — reset the canvas view to centre at 100% (icon-only).
      btn(icon("crosshair"), {
        title: "Fit — reset the canvas view to centre at 100%",
        ariaLabel: "Fit — reset the canvas view to centre at 100%",
        onclick: () => {
          this.fit();
          this.render();
        },
      }),
      // canvas preview color-scheme (sun/moon/auto) — independent of the app chrome.
      this.canvasThemeBtn(),
      btn(icon("minus"), { ariaLabel: "Zoom out", onclick: () => this.zoomBy(-1) }),
      h("span", { class: "zoom-readout", role: "status", "aria-live": "polite", "aria-label": "Zoom level" }, Math.round(this.viewport.zoom * 100) + "%"),
      btn(icon("plus"), { ariaLabel: "Zoom in", onclick: () => this.zoomBy(1) }),
      btn([icon("plus"), "Palette"], { cls: "add-pal-btn", title: "Create a new palette — derive it from your palette set, or pick one custom", onclick: () => this.openNewPalette() }),
      // when the RIGHT pane is collapsed its toggle pops here, at the canvas's right edge.
      !this.panesRight ? this.paneToggle("right") : false,
    );
  }

  // zoomAround — set the zoom to z1, keeping the content point under (cx, cy)
  // FIXED, where (cx, cy) is a pixel offset from the viewport centre. The scene's
  // CSS transform is `translate(-50%,-50%) translate(pan) scale(zoom)`, so a scene
  // point p maps to screen = zoom*p + pan - half-the-(unscaled)-scene. That
  // half-size term (scene.offsetWidth/2, ignored by transforms) is exactly what the
  // old wheel math dropped — so zoom drifted toward the content's centre, not the
  // cursor. Re-including it makes both the wheel (cursor) and the +/- buttons
  // (centre, cx=cy=0) zoom about the right point.
  zoomAround(z1, cx = 0, cy = 0) {
    z1 = Math.min(4, Math.max(0.25, z1));
    const scene = this.querySelector(".canvas-scene");
    const k = z1 / this.viewport.zoom;
    const ax = cx + (scene ? scene.offsetWidth : 0) / 2;
    const ay = cy + (scene ? scene.offsetHeight : 0) / 2;
    this.viewport.panX = ax - (ax - this.viewport.panX) * k;
    this.viewport.panY = ay - (ay - this.viewport.panY) * k;
    this.viewport.zoom = z1;
    this.applyTransform();
  }

  zoomBy(dir) {
    // keyboard / button zoom: about the viewport centre (cx = cy = 0).
    this.zoomAround(this.viewport.zoom * (dir > 0 ? 1.15 : 1 / 1.15));
  }

  // applyTransform — push the live viewport (panX, panY, zoom) onto the inner
  // content layer as a single CSS transform. The scene is CSS-anchored at the
  // viewport center (top/left 50%); we translate by pan + half its own size so
  // origin (0,0) is the viewport center, then scale. Also refreshes the readout.
  applyTransform() {
    const scene = this.querySelector(".canvas-scene");
    if (scene) {
      const { panX, panY, zoom } = this.viewport;
      scene.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoom})`;
    }
    const r = this.querySelector(".zoom-readout");
    if (r) r.textContent = Math.round(this.viewport.zoom * 100) + "%";
    this.paintCanvasFooter();
  }

  // canvasBg — the canvas backdrop. When a palette is EXPLICITLY selected it's that palette's
  // NEAR-EDGE color: its 125 stop in light preview, its 875 stop in dark (a faintly-hued near-edge
  // tone, so the backdrop carries a touch of the palette's own hue rather than washing to pure
  // white/black). Read from fullRamp — 125/875 are EXPORT-only half-steps, absent from the 19-stop
  // display `ramp`. Follows selection (selectPalette → render) and lmin/lmax. With NO explicit
  // selection (Esc, or a click on empty canvas → _deselect), it reverts to the DEFAULT neutral gray.
  canvasBg() {
    const v = this._view || projectView(this.doc);
    const pal = this.sel.kind === "palette" && v && v.palettes[this.selectedIndex()];
    const ramp = pal && (pal.fullRamp || pal.ramp);
    const stop = ramp && ramp.find((s) => s.stop === (this.resolvedCanvasScheme() === "dark" ? 875 : 125));
    if (stop) return stop.hex;
    const L = this.resolvedCanvasScheme() === "dark" ? (this.doc.lmin ?? 5) : (this.doc.lmax ?? 100);
    const g = hctToRgb(0, 0, L).rgb[0].toString(16).padStart(2, "0").toUpperCase();
    return "#" + g + g + g;
  }

  // containerBg — a palette ROW container is tinted with that palette's OWN faintly-hued tone, so
  // each card carries a wash of its palette. It tracks the CANVAS preview scheme (75 in light, 925
  // in dark — symmetric, mirroring canvasBg's 125/875): the row's name text is var(--ink), which
  // resolves per the canvas-area's color-scheme (= canvasTheme), so a fixed light 75 in dark preview
  // would land light text on a light card. Read from fullRamp — 75/925 are EXPORT-only half-steps,
  // absent from the 19-stop display ramp. Returns "" if absent, so the theme-aware CSS default holds.
  containerBg(vp) {
    const ramp = vp && (vp.fullRamp || vp.ramp);
    if (!ramp) return "";
    const s = ramp.find((x) => x.stop === (this.resolvedCanvasScheme() === "dark" ? 925 : 75));
    return s ? s.hex : "";
  }

  // The canvas IS the 2D pannable space; the ramp rows ARE the palette navigator. The Mapping
  // view is a DATA TABLE, not a visual scene — it scrolls instead of pan/zoom (is-table).
  renderCanvasArea(view) {
    const isTable = this.canvasView === "mapping";
    const scene = this._canvasScene(view);
    const area = h(
      "div",
      {
        class: "canvas-area canvas-scheme-" + this.resolvedCanvasScheme() + (isTable ? " is-table" : ""),
        style: "--canvas-bg:" + this.canvasBg(),
        role: "group",
        "aria-label": isTable ? "Semantic mapping table" : "Palette canvas — drag to pan, wheel to zoom, double-click to reset",
      },
      h("div", { class: "canvas-scene" }, scene),
    );
    if (!isTable) {
      // shift-drag (or middle-drag) pans · wheel zooms about cursor · click selects.
      this.wirePanZoom(area);
      // Apply the live transform after layout so the readout + centering are correct.
      requestAnimationFrame(() => this.applyTransform());
    }
    return area;
  }

  // wirePanZoom — pointer-based pan/zoom on the canvas inner content layer.
  // origin (0,0) is the CENTER of the viewport (the .canvas-scene is anchored at
  // 50%/50% in CSS); panX/panY translate from there. A movement threshold keeps a
  // pan-drag from registering as a swatch-row click.
  wirePanZoom(area) {
    const st = { down: false, panning: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0, btn: 0 };
    const THRESH = 4; // px before a press becomes a pan (not a click)

    area.addEventListener("pointerdown", (e) => {
      // pan on shift-drag OR middle-button drag; plain primary press is a click.
      const wantsPan = e.shiftKey || e.button === 1;
      st.down = true;
      st.moved = false;
      st.panning = wantsPan;
      st.btn = e.button;
      st.sx = e.clientX;
      st.sy = e.clientY;
      st.ox = this.viewport.panX;
      st.oy = this.viewport.panY;
      if (wantsPan) {
        area.classList.add("panning");
        area.setPointerCapture && area.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });

    area.addEventListener("pointermove", (e) => {
      // footer x/y readout (relative to viewport center).
      const r = area.getBoundingClientRect();
      this._xy = {
        x: Math.round(e.clientX - r.left - r.width / 2),
        y: Math.round(e.clientY - r.top - r.height / 2),
      };
      if (st.down) {
        const dx = e.clientX - st.sx;
        const dy = e.clientY - st.sy;
        if (!st.moved && Math.hypot(dx, dy) > THRESH) {
          st.moved = true;
          // a primary-button drag with no modifier becomes a pan once it crosses
          // the threshold, so dragging the canvas always pans.
          if (!st.panning) {
            st.panning = true;
            area.classList.add("panning");
            area.setPointerCapture && area.setPointerCapture(e.pointerId);
          }
        }
        if (st.panning) {
          this.viewport.panX = st.ox + dx;
          this.viewport.panY = st.oy + dy;
          this.applyTransform();
          e.preventDefault();
        }
      }
      this.paintCanvasFooter();
    });

    const end = (e) => {
      if (st.panning) {
        area.classList.remove("panning");
        area.releasePointerCapture && e && e.pointerId != null && area.releasePointerCapture(e.pointerId);
      }
      // expose for the swatch-row click guard: did this gesture move?
      this._didDrag = st.moved && st.panning;
      st.down = false;
      st.panning = false;
    };
    area.addEventListener("pointerup", end);
    area.addEventListener("pointercancel", end);

    area.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // zoom about the cursor: keep the content point under the pointer fixed.
        const r = area.getBoundingClientRect();
        const px = e.clientX - r.left - r.width / 2; // cursor relative to centre
        const py = e.clientY - r.top - r.height / 2;
        this.zoomAround(this.viewport.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), px, py);
      },
      { passive: false },
    );

    // double-click anywhere on the canvas = reset the view to origin @ 100%.
    area.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.fit();
      this.applyTransform();
    });

    // a plain click on EMPTY canvas clears the selection → canvasBg reverts to the default
    // neutral backdrop. A click inside a ramp-row is a SELECT (handled by the row's own onclick,
    // which runs first); a pan-drag is not a click. We walk parentNode (not .closest) so this
    // also holds under the headless DOM shim.
    area.addEventListener("click", (e) => {
      if (this._didDrag) { this._didDrag = false; return; } // a pan, not a click
      for (let n = e.target; n && n !== area; n = n.parentNode)
        if (n.classList && n.classList.contains("ramp-row")) return; // a row handled the selection
      if (this.sel.kind === "palette") this._deselect();
    });
  }

  // Ramps scene — each ENABLED palette = a clickable navigator row: name + ●/○
  // enable toggle + its stop swatches. Click (not drag) selects that palette.
  renderRampsScene(view) {
    const rows = this.doc.palettes
      .map((p, i) => ({ p, i, vp: view.palettes[i] }))
      .filter((x) => x.vp && x.vp.on)
      .map(({ p, i, vp }) => {
        // highlight only when there's an EXPLICIT palette selection (Esc clears it)
        const selected = this.sel.kind === "palette" && this.selectedIndex() === i;
        const stops = this.stopsMode === "extended" ? vp.fullRamp : vp.ramp; // 25 vs 19
        const strip = h(
          "div",
          { class: "ramp-strip" },
          ...stops.map((s) =>
            h("i", {
              style: `background:${s.hex}`,
              class: s.inGamut ? "" : "oog",
              title: `${vp.name} ${s.stop} · ${s.hex} · tone ${fmt(s.tone)}`,
              onmouseenter: () => {
                this.hover = { name: vp.name, stop: s.stop, hex: s.hex, tone: s.tone, inGamut: s.inGamut };
                this.paintCanvasFooter();
              },
              onmouseleave: () => {
                this.hover = null;
                this.paintCanvasFooter();
              },
            }),
          ),
        );
        return h(
          "div",
          {
            class: "ramp-row" + (selected ? " sel" : ""),
            style: this.containerBg(vp) ? "background:" + this.containerBg(vp) : null, // tint = palette's 150 stop
            "data-pi": i, // real index into doc.palettes (for reorder hit-testing)
            // click selects the palette — but never on a pan-drag OR a handle-drag.
            onclick: () => {
              if (this._didDrag || this._reordering) {
                this._didDrag = false;
                this._reordering = false; // consume the post-reorder click guard
                return;
              }
              this.selectPalette(i);
            },
          },
          h(
            "div",
            { class: "ramp-head" },
            this.dragHandle(i),
            h(
              "span",
              {
                class: "enable",
                title: "Toggle enabled",
                // a clickable span is invisible to the keyboard — give it button
                // semantics, focusability, and Enter/Space activation.
                role: "button",
                tabindex: "0",
                "aria-pressed": p.on !== false ? "true" : "false",
                "aria-label": (p.on !== false ? "Disable " : "Enable ") + vp.name + " palette",
                onclick: (e) => {
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
                onkeydown: (e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
              },
              icon(p.on !== false ? "dot" : "circle", { size: 13 }),
            ),
            h("span", { class: "ramp-name" }, vp.name, h("small", {}, `${stops.length} stops`)),
          ),
          // retained key colors (when set): the brand colors, above the generated ramp,
          // each captioned with its nearest stop (the perceptual placement). Off-ramp by design.
          this.keyStrip(vp),
          strip,
        );
      });
    // disabled palettes still appear as ghost rows so they can be re-enabled.
    const offRows = this.doc.palettes
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.on === false)
      .map(({ p, i }) =>
        h(
          "div",
          {
            class: "ramp-row off",
            "data-pi": i,
            onclick: () => {
              if (this._reordering) { this._reordering = false; return; }
              this.selectPalette(i);
            },
          },
          h(
            "div",
            { class: "ramp-head" },
            this.dragHandle(i),
            h(
              "span",
              {
                class: "enable",
                title: "Enable",
                onclick: (e) => {
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = true));
                },
              },
              icon("circle", { size: 13 }),
            ),
            h("span", { class: "ramp-name off" }, p.name || "(unnamed)", h("small", {}, "disabled")),
          ),
        ),
      );
    if (rows.length === 0 && offRows.length === 0) return h("div", { class: "empty-note" }, "No palettes");
    const stack = h("div", { class: "ramp-stack" }, ...rows, ...offRows);
    this._wireReorder(stack); // pointer-drag the ⋮⋮ handle to reorder palettes
    return stack;
  }

  // renderScrimsScene — the canvas "Scrims" view. Per ENABLED palette, the 7 scrim roles
  // (scrimWeakest..scrimStrongest = the 500-base color at 10–55% alpha, already resolved in
  // view.palettes[i].roles as #RRGGBBAA). Each cell paints the translucent color over a
  // light/dark split so the alpha — and how it reads on light vs dark content — is visible.
  // Reuses the ramp-row chrome (drag-reorder, enable, selection) so both views feel identical.
  // scrimAlpha — recover a scrim's alpha % from its #RRGGBBAA byte, so the label always matches
  // the actual color (never a hardcoded list that can drift from SCRIM_STEPS). Nearest 0.5%.
  scrimAlpha(hex8) {
    return Math.round((parseInt(hex8.slice(7, 9), 16) / 255) * 200) / 2;
  }

  renderScrimsScene(view) {
    const rows = this.doc.palettes
      .map((p, i) => ({ p, i, vp: view.palettes[i] }))
      .filter((x) => x.vp && x.vp.on)
      .map(({ p, i, vp }) => {
        const selected = this.sel.kind === "palette" && this.selectedIndex() === i;
        // The FULL scrim ramp: the palette's 500 color at every stop's alpha (alpha% = stop/10),
        // one cell per stop, honoring the Core-19 / All-25 toggle — parallel to the palette ramp.
        const stops = this.stopsMode === "extended" ? vp.fullRamp : vp.ramp;
        const base = vp.fullRamp.find((s) => s.stop === 500) || vp.ramp[Math.floor(vp.ramp.length / 2)];
        const hex500 = (base ? base.hex : "#808080").slice(0, 7); // the solid 500 color, opaque
        const strip = h(
          "div",
          { class: "scrim-strip" },
          ...stops.map((s) => {
            const aByte = Math.round((s.stop / 1000) * 255).toString(16).padStart(2, "0").toUpperCase();
            const hex8 = hex500 + aByte;
            const a = this.scrimAlpha(hex8); // = stop/10, recovered from the byte
            const pad = String(s.stop).padStart(3, "0");
            return h(
              "div",
              {
                class: "scrim-cell",
                title: `${vp.name} · scrim ${pad} · 500 @ ${a}% · ${hex8}`,
                onmouseenter: () => {
                  this.hover = { kind: "scrim", name: vp.name, label: pad, alpha: a, hex: hex8 };
                  this.paintCanvasFooter();
                },
                onmouseleave: () => {
                  this.hover = null;
                  this.paintCanvasFooter();
                },
              },
              h("i", { class: "scrim-fill", style: `background:${hex8}` }),
            );
          }),
        );
        return h(
          "div",
          {
            class: "ramp-row scrim-row" + (selected ? " sel" : ""),
            style: this.containerBg(vp) ? "background:" + this.containerBg(vp) : null, // tint = palette's 150 stop
            "data-pi": i,
            onclick: () => {
              if (this._didDrag || this._reordering) {
                this._didDrag = false;
                this._reordering = false;
                return;
              }
              this.selectPalette(i);
            },
          },
          h(
            "div",
            { class: "ramp-head" },
            this.dragHandle(i),
            h(
              "span",
              {
                class: "enable",
                title: "Toggle enabled",
                role: "button",
                tabindex: "0",
                "aria-pressed": p.on !== false ? "true" : "false",
                "aria-label": (p.on !== false ? "Disable " : "Enable ") + vp.name + " palette",
                onclick: (e) => {
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
                onkeydown: (e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
              },
              icon(p.on !== false ? "dot" : "circle", { size: 13 }),
            ),
            h("span", { class: "ramp-name" }, vp.name, h("small", {}, `500 base · ${stops.length} scrims`)),
          ),
          strip,
        );
      });
    if (rows.length === 0) return h("div", { class: "empty-note" }, "No enabled palettes — toggle one on to see its scrims");
    const stack = h("div", { class: "ramp-stack" }, ...rows);
    this._wireReorder(stack); // reorder works in the scrim view too
    return stack;
  }

  // renderMappingScene — the Semantic Mapping table for the SELECTED palette: every role's
  // chain, one row per mode — [ Mode · swatch · semantic-token · raw-token ]. Read-only for now
  // (the raw/semantic names are the values from the canonical role table; editing them — a
  // per-doc remap/rename — and bidirectional load are the next step, pending the data-model call).
  // keyStrip — the retained key colors row (dominant/supportive) for one palette, captioned with
  // each color's nearest stop. Shown above the ramp AND atop the mapping table so the brand colors
  // stay visible across canvas views (not just the Palettes view).
  keyStrip(vp) {
    if (!vp || !vp.keyColors || !vp.keyColors.length) return false;
    return h(
      "div",
      { class: "key-strip" },
      ...vp.keyColors.map((kc) =>
        h(
          "div",
          { class: "key-cell", title: `${kc.role}${kc.name ? " · " + kc.name : ""} · ${kc.css} · ≈ stop ${kc.nearStop} · drift ${kc.drift}` },
          h("span", { class: "key-fill", style: `background:${kc.css}` }),
          h("small", {}, kc.role + " ≈" + kc.nearStop),
        ),
      ),
    );
  }

  renderMappingScene(view) {
    const vp = view.palettes[this.selectedIndex()];
    if (!vp) return h("div", { class: "empty-note" }, "Select a palette to see its semantic mapping");
    const n = slug(vp.name);
    const ov = this.doc.roleOverrides || {};
    const ovCount = Object.keys(ov).reduce((a, k) => a + Object.keys(ov[k] || {}).length, 0);
    // raw refs you can re-point a role to: the 25 solid stops + every scrim ref (base-step), built
    // from the SAME SCRIM_BASES × SCRIM_STEPS the engine/exporters use — so the scrim roles
    // (e.g. scrim-weakest → 500-50) always have a matching option instead of falling back to 050.
    const scrimRefs = SCRIM_BASES.flatMap((b) => SCRIM_STEPS.map((st) => String(b).padStart(3, "0") + "-" + st));
    const validRefs = [...vp.fullRamp.map((s) => String(s.stop)), ...scrimRefs];
    const tokenName = (ref) => n + "-" + (ref.includes("-") ? ref : ref.padStart(3, "0")); // the displayed raw-token name
    const padRef = (ref) => (ref.includes("-") ? ref : ref.padStart(3, "0"));
    const drift = this.liveVars ? this.driftSummary() : null; // the Figma drift-diff summary, if a live read was done
    // per-mode drift cell: check = matches the file / ✗ drifted / — not in the file / · not read yet.
    const driftCell = (ref, hex) => {
      const st = this.driftStatus(n + "/" + padRef(ref), hex);
      const title = { match: "Matches the file", drift: "Drifted from the file", absent: "Not in the file" }[st]
        || "Click Read live to compare with the file";
      const mark = st === "match" ? icon("check", { size: 12 })
        : st === "drift" ? icon("x", { size: 12 })
        : st === "absent" ? "—" : "·";
      return h("td", { class: "map-file" }, h("span", { class: "map-drift map-drift-" + (st || "none"), title }, mark));
    };

    const rawEditor = (r, mode, ref, overridden) =>
      this.mapTextMode
        ? h("input", {
            class: "map-raw-input" + (overridden ? " ov" : ""),
            type: "text",
            value: tokenName(ref),
            "data-fk": "map:" + r.key + ":" + mode,
            "aria-label": r.name + " " + mode + " raw token",
            onchange: (e) => this.commitMapRaw(r.key, mode, e.target.value, n),
          })
        : h(
            "select",
            {
              class: "map-raw-select" + (overridden ? " ov" : ""),
              "data-fk": "map:" + r.key + ":" + mode,
              "aria-label": r.name + " " + mode + " raw token",
              onchange: (e) => this.setRoleOverride(r.key, mode, e.target.value),
            },
            ...validRefs.map((vr) => h("option", vr === ref ? { value: vr, selected: "selected" } : { value: vr }, tokenName(vr))),
          );

    const modeRow = (r, mode, hex, ref) => {
      const overridden = !!(ov[r.key] && ov[r.key][mode] != null);
      return h(
        "tr",
        { class: "map-row map-" + mode + (mode === "light" ? " map-role-top" : "") + (overridden ? " map-ov" : "") },
        h("td", { class: "map-mode" }, mode === "light" ? "Light" : "Dark"),
        h("td", { class: "map-sw" }, h("span", { class: "map-swatch" }, h("span", { class: "map-swatch-fill", style: `background:${hex}` }))),
        h("td", { class: "map-sem" }, h("code", {}, r.name)),
        h(
          "td",
          { class: "map-raw" },
          rawEditor(r, mode, ref, overridden),
          overridden ? btn(icon("arrow-counter-clockwise", { size: 13 }), { variant: "bare", cls: "map-reset", title: "Reset to canonical", ariaLabel: "Reset to canonical", onclick: () => this.clearRoleOverride(r.key, mode) }) : false,
        ),
        this.inFigma ? driftCell(ref, hex) : false, // drift vs the live Figma variable (#3)
      );
    };
    const bodyRows = vp.roles.flatMap((r) => [
      modeRow(r, "light", r.lightHex, r.lightRef),
      modeRow(r, "dark", r.darkHex, r.darkRef),
    ]);
    return h(
      "div",
      { class: "map-wrap" },
      this.keyStrip(vp), // the palette's retained key colors, visible here too (not just the ramps view)
      h(
        "div",
        { class: "map-head" },
        h("b", {}, "Semantic Mapping"),
        h("small", {}, `${vp.name} · ${vp.roles.length} roles${ovCount ? " · " + ovCount + " re-pointed" : ""}`),
        h("div", { class: "spacer" }),
        // drift summary chip (after a live read) — does the file match what I'd generate now?
        drift ? chip(drift.drifted ? `${drift.drifted} drifted` : "in sync", { tone: drift.drifted ? "has-drift" : "in-sync" }) : false,
        // read the live raw-colors variables from the file and diff (Figma only).
        this.inFigma ? btn([icon("arrows-clockwise"), "Read live"], { title: "Read the live raw-colors variables from this file and compare (drift)", onclick: () => this.readLiveVariables() }) : false,
        ovCount ? btn("Reset " + ovCount, { title: "Revert all re-points to the canonical mapping", onclick: () => this.clearAllOverrides() }) : false,
        btn([icon("arrows-left-right"), this.mapTextMode ? "text" : "select"], {
          ariaPressed: this.mapTextMode ? "true" : "false",
          title: "Switch the raw-token editor between a select menu and a free text input",
          onclick: () => this.setMapTextMode(!this.mapTextMode),
        }),
      ),
      h(
        "table",
        { class: "map-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Mode"), h("th", { class: "map-sw" }, ""), h("th", {}, "Semantic token"), h("th", {}, "Raw token"), this.inFigma ? h("th", {}, "File") : false)),
        h("tbody", {}, ...bodyRows),
      ),
    );
  }

  // dragHandle — the ⋮⋮ grip that starts a reorder drag. Its pointerdown stops
  // propagation so it NEVER reaches the canvas pan handler, and the row's onclick
  // is suppressed during/after a reorder (this._reordering guard), so dragging the
  // handle neither pans the canvas nor selects the row.
  dragHandle(i) {
    return h("span", {
      class: "drag-handle",
      title: "Drag to reorder",
      "data-handle": i,
      onpointerdown: (e) => this._beginReorder(e, i),
    });
  }

  // _wireReorder — keep a handle on the live stack node for hit-testing during a
  // drag. Rows carry data-pi (their real doc.palettes index); we read the rects
  // at move-time so the target insertion index is always current.
  _wireReorder(stack) {
    this._rampStack = stack;
  }

  // _rowRects — current [{ pi, top, bottom, mid, el }] for every row in the stack,
  // top-to-bottom. Recomputed per drag-move (cheap; few rows).
  _rowRects() {
    const stack = this._rampStack;
    if (!stack) return [];
    return Array.from(stack.querySelectorAll(".ramp-row[data-pi]")).map((el) => {
      const r = el.getBoundingClientRect();
      return { pi: Number(el.getAttribute("data-pi")), top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2, el };
    });
  }

  // _beginReorder — start a handle-drag. Stops propagation (no canvas pan), sets
  // the reorder guard, and installs document-level move/up so the drag tracks even
  // when the pointer leaves the handle. The actual move happens once on release.
  _beginReorder(e, src) {
    e.stopPropagation(); // never let the canvas pan-handler see this press
    e.preventDefault();
    this._reorder = { src, dropPi: src, before: true, moved: false };
    this._reordering = false; // becomes true once the pointer actually moves
    const handle = e.currentTarget;
    if (handle && handle.setPointerCapture) {
      try { handle.setPointerCapture(e.pointerId); } catch {}
    }
    // find the source ROW for the grabbed handle (parentNode walk — works in the browser AND the
    // headless DOM shim, which has no Element.closest / attribute selectors).
    let srcRow = handle;
    while (srcRow && !(srcRow.classList && srcRow.classList.contains("ramp-row"))) srcRow = srcRow.parentNode;
    this._reorder.srcRow = srcRow || null;
    this._buildDragGhost(e, srcRow); // lift a floating clone + drop a placeholder (browser only; no-ops in the shim)
    this._reorderMove = (ev) => this._onReorderMove(ev);
    this._reorderUp = (ev) => this._onReorderUp(ev);
    document.addEventListener("pointermove", this._reorderMove);
    document.addEventListener("pointerup", this._reorderUp);
    document.addEventListener("pointercancel", this._reorderUp);
    this.classList.add("reordering");
  }

  // _buildDragGhost — the visual lift. Clones the dragged row into a viewport-fixed "ghost" that
  // tracks the cursor, and replaces the source row with a same-size dashed PLACEHOLDER so the list
  // visibly parts to show where the drop will land. Appended to the HOST (not the transformed canvas
  // scene) so `position:fixed` is viewport-relative. Guarded: in the headless DOM shim (no cloneNode /
  // real layout) it returns early, leaving the reorder LOGIC unchanged.
  _buildDragGhost(e, srcRow) {
    const st = this._reorder;
    if (!srcRow || typeof srcRow.cloneNode !== "function" || typeof srcRow.getBoundingClientRect !== "function") return;
    const rect = srcRow.getBoundingClientRect();
    if (!rect || !rect.width) return;
    st.grabDx = (e.clientX ?? rect.left) - rect.left;
    st.grabDy = (e.clientY ?? rect.top) - rect.top;
    const ghost = srcRow.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("sel"); // the lifted clone isn't the selection ring
    // The ghost is re-parented to the HOST (for viewport-fixed positioning), but the row it clones
    // lives in the CANVAS — whose color-scheme (the ◐ preview toggle) is independent of the app chrome.
    // Pin the canvas's resolved scheme on the ghost so its light-dark() tokens (--ink, --panel, …)
    // resolve in the mode it visually belongs to, not the host's (else a light-canvas row dragged while
    // the chrome is dark renders dark-mode text on the light row).
    ghost.style.colorScheme = this.resolvedCanvasScheme();
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    this.appendChild(ghost);
    st.ghostEl = ghost;
    const ph = document.createElement("div");
    ph.className = "drop-ghost";
    ph.style.height = rect.height + "px";
    st.placeholderEl = ph;
    // drop the placeholder into the source's slot, then collapse the source — the lift is immediate.
    if (srcRow.parentNode) srcRow.parentNode.insertBefore(ph, srcRow);
    srcRow.style.display = "none";
  }

  // _syncDropFromPlaceholder — read the committed drop (dropPi/before) from the placeholder's live DOM
  // position: it drops BEFORE the next real row, or AFTER the previous one if it's at the very end. The
  // collapsed source row (data-pi === src) is skipped so it never reads as the target.
  _syncDropFromPlaceholder() {
    const st = this._reorder;
    const ph = st && st.placeholderEl;
    if (!ph || !ph.parentNode) return;
    const isRow = (n) => n && n.classList && n.classList.contains("ramp-row") && n.getAttribute && n.getAttribute("data-pi") != null && Number(n.getAttribute("data-pi")) !== st.src;
    let next = ph.nextSibling;
    while (next && !isRow(next)) next = next.nextSibling;
    if (next) { st.dropPi = Number(next.getAttribute("data-pi")); st.before = true; return; }
    let prev = ph.previousSibling;
    while (prev && !isRow(prev)) prev = prev.previousSibling;
    if (prev) { st.dropPi = Number(prev.getAttribute("data-pi")); st.before = false; }
  }

  // _teardownDragGhost — remove the floating clone + placeholder and un-hide the source row. The
  // subsequent render() rebuilds the stack anyway; this just keeps the frame clean before it.
  _teardownDragGhost() {
    const st = this._reorder;
    if (!st) return;
    if (st.ghostEl && st.ghostEl.parentNode) st.ghostEl.parentNode.removeChild(st.ghostEl);
    if (st.placeholderEl && st.placeholderEl.parentNode) st.placeholderEl.parentNode.removeChild(st.placeholderEl);
    if (st.srcRow && st.srcRow.style) st.srcRow.style.display = "";
    st.ghostEl = null; st.placeholderEl = null;
  }

  // _onReorderMove — the floating clone tracks the cursor 1:1; the DROP slot is decided relative to
  // the PLACEHOLDER's own position (the proposed placement) with a 10px deadzone, so it only reslots
  // when the cursor moves clearly past the placeholder's edge — stable, never jittering from the
  // reflow. Headless (no placeholder) falls back to the row-midpoint hit-test so the verifier holds.
  _onReorderMove(ev) {
    const st = this._reorder;
    if (!st) return;
    this._reordering = true;
    st.moved = true;
    if (ev.preventDefault) ev.preventDefault();
    const y = ev.clientY;
    // the floating clone follows the cursor (anchored under the original grab point).
    if (st.ghostEl) st.ghostEl.style.transform = `translate(${(ev.clientX ?? 0) - (st.grabDx || 0)}px, ${(y ?? 0) - (st.grabDy || 0)}px)`;

    // Browser path — the hit area is the placeholder (proposed placement) ± SENS px. Step the
    // placeholder one row toward the cursor while it's past the deadzone (bounded, to keep up with a
    // fast flick), re-reading rects each step since each move reflows the list.
    const SENS = 10; // px the cursor must pass the placeholder edge before the drop reslots
    if (st.placeholderEl && typeof st.placeholderEl.getBoundingClientRect === "function") {
      for (let guard = 0; guard < 64; guard++) {
        const ph = st.placeholderEl.getBoundingClientRect();
        const rows = this._rowRects().filter((r) => r.bottom - r.top > 1); // visible rows (not the collapsed source)
        const above = rows.filter((r) => r.bottom <= ph.top + 2).pop();    // row immediately above the placeholder
        const below = rows.find((r) => r.top >= ph.bottom - 2);            // row immediately below it
        if (above && y < ph.top - SENS) { st.placeholderEl.parentNode.insertBefore(st.placeholderEl, above.el); continue; }
        if (below && y > ph.bottom + SENS) { st.placeholderEl.parentNode.insertBefore(st.placeholderEl, below.el.nextSibling); continue; }
        break; // cursor is within the proposed slot's hit area — stable
      }
      this._syncDropFromPlaceholder();
      return;
    }

    // Headless / no placeholder — row-midpoint hit-test (unchanged) so the reorder verifier still works.
    const rects = this._rowRects().filter((r) => r.bottom - r.top > 1);
    if (!rects.length) return;
    let target = null;
    for (const r of rects) {
      if (y < r.mid) { target = { pi: r.pi, before: true }; break; }
      target = { pi: r.pi, before: false };
    }
    if (!target) target = { pi: rects[rects.length - 1].pi, before: false };
    st.dropPi = target.pi;
    st.before = target.before;
  }

  // _onReorderUp — finalize. Translate (dropPi, before) into a destination index in
  // doc.palettes, splice the source there as ONE undo step, and keep `selected` on
  // the SAME palette object (track it by identity across the move).
  _onReorderUp() {
    const st = this._reorder;
    document.removeEventListener("pointermove", this._reorderMove);
    document.removeEventListener("pointerup", this._reorderUp);
    document.removeEventListener("pointercancel", this._reorderUp);
    this.classList.remove("reordering");
    this._teardownDragGhost(); // remove the floating clone + placeholder, un-hide the source row
    this._reorder = null;
    // NOTE: leave this._reordering TRUE if a move happened — the row's onclick
    // fires right after this pointerup and must be suppressed; it (or the next
    // _beginReorder / pointerdown) clears the flag.
    if (!st || !st.moved) { this._reordering = false; this.render(); return; }

    const pals = this.doc.palettes;
    const from = st.src;
    // destination index BEFORE removal: index of dropPi, +1 if dropping "after".
    let to = pals.findIndex((_, idx) => idx === st.dropPi);
    if (st.before === false) to += 1;
    // adjust for the slice-out of `from` when from precedes the insertion point.
    if (from < to) to -= 1;
    to = Math.max(0, Math.min(to, pals.length - 1));
    if (to === from) { this._reordering = false; this.render(); return; }

    // Track the currently-selected palette by identity so selection follows it.
    const selPal = this.doc.palettes[this.selectedIndex()];
    this.pushHistory(); // ONE undo step for the whole reorder
    const [moved] = pals.splice(from, 1);
    pals.splice(to, 0, moved);
    // keep `selected` on the SAME palette object (now at its new index)
    const newSel = this.doc.palettes.indexOf(selPal);
    if (newSel >= 0) {
      this.sel = { kind: "palette", id: newSel };
      this.doc.selected = newSel;
    }
    this.save(); // persist the reordered doc + corrected selection in one shot
    this.render();
    // safety net: if no stray click consumes the guard, clear it next tick.
    setTimeout(() => { this._reordering = false; }, 0);
  }

  renderCanvasFooter() {
    return h("div", { class: "canvas-footer" }, h("span", { class: "cf-body" }, "drag to pan · wheel to zoom · double-click to reset"));
  }

  paintCanvasFooter() {
    const el = this.querySelector(".canvas-footer .cf-body");
    if (!el) return;
    const xy = this._xy || { x: 0, y: 0 };
    const z = Math.round(this.viewport.zoom * 100);
    if (this.hover && this.hover.kind === "scrim") {
      el.replaceChildren(
        document.createTextNode(`x:${xy.x} y:${xy.y} · ${z}% · `),
        h("span", { class: "sw", style: `background:${this.hover.hex}` }),
        document.createTextNode(`${this.hover.name} · ${this.hover.label} · 750 @ ${this.hover.alpha}% · ${this.hover.hex}`),
      );
    } else if (this.hover) {
      el.replaceChildren(
        document.createTextNode(`x:${xy.x} y:${xy.y} · ${z}% · `),
        h("span", { class: "sw", style: `background:${this.hover.hex}` }),
        document.createTextNode(`${this.hover.hex} · tone ${fmt(this.hover.tone)} · `),
        icon(this.hover.inGamut ? "check" : "x", { size: 12 }),
        document.createTextNode(this.hover.inGamut ? " in-gamut" : " out-of-gamut"),
      );
    } else {
      el.textContent = `x:${xy.x} y:${xy.y} · ${z}% · drag pan · wheel zoom · dbl-click reset`;
    }
  }

  // ── right pane (segmented inspector) ──────────────────────────────────────────
  // [ Palette | Global | Roles ] — three panels over the SELECTED palette. The
  // selection lives in ui-session state (this.segment); default is Palette.
  renderRightPane(view) {
    const hasStory = !!view.story;
    const seg = this.segment === "story" && !hasStory ? "palette" : this.segment; // story tab only when there is one
    let body;
    if (seg === "story") body = this.renderStoryInspector(view);
    else if (seg === "global") body = this.renderGlobalInspector();
    else if (seg === "roles") body = this.renderRolesInspector(view);
    else body = this.renderPaletteInspector(view);
    const tabs = [{ id: "palette", label: "Palette" }, { id: "global", label: "Global" }, { id: "roles", label: "Roles" }];
    if (hasStory) tabs.push({ id: "story", label: "Story" });
    return h(
      "aside",
      { class: "right-pane" },
      // header row: while OPEN the right toggle hugs the inner (canvas-side) edge, left of
      // the Inspector tabs; once collapsed it is rendered in the canvas-header instead.
      h("div", { class: "pane-head" },
        this.panesRight ? this.paneToggle("right") : false,
        this.segmented(tabs, seg, (id) => this.setSegment(id), { ariaLabel: "Inspector", idPrefix: "tab", controls: "seg-panel" })),
      h("div", { class: "seg-body", "data-scroll": "seg-body", role: "tabpanel", id: "seg-panel", "aria-labelledby": "tab-" + seg }, body),
      // Pinned below the panel on EVERY tab: a live component preview wired to the
      // selected palette's roles (surface / onSurface / onSurfaceVariant + primary).
      h("div", { class: "seg-example" }, this.exampleCard(view)),
    );
  }

  // renderStoryInspector — the holistic "Story" tab: the set's concept narrative + the curated
  // colors (name · role · description) + the 60/30/10 groups + what the palette refuses. Mirrors the
  // source's cover layout. Present only for sets that carry a story (the curated travel volumes).
  renderStoryInspector(view) {
    const s = view.story;
    if (!s) return h("div", { class: "empty-note" }, "No story for this palette set.");
    const HIER = { d: "Dominant", s: "Supporting", a: "Accent" };
    const cols = view.palettes.filter((p) => p.colorName); // the curated colors carry the story
    return h(
      "div",
      { class: "story-pane" },
      s.kicker ? h("div", { class: "story-kicker" }, s.kicker) : false,
      s.title ? h("h3", { class: "story-title" }, s.title) : false,
      s.narrative ? h("p", { class: "story-narrative" }, s.narrative) : false,
      cols.length
        ? h(
            "div",
            { class: "story-colors" },
            ...cols.map((p) =>
              h(
                "div",
                { class: "story-color" },
                h("span", { class: "story-swatch", style: `background:${p.key}` }),
                h(
                  "div",
                  { class: "story-color-meta" },
                  h("div", { class: "story-color-name" }, p.colorRole ? h("span", { class: "color-role" }, p.colorRole) : false, p.colorName),
                  p.description ? h("p", { class: "story-color-note" }, p.description) : false,
                ),
              ),
            ),
          )
        : false,
      s.groups && s.groups.length
        ? h(
            "div",
            { class: "story-groups" },
            ...s.groups.map((g) =>
              h(
                "div",
                { class: "story-group" },
                h("div", { class: "story-group-head" }, h("b", {}, HIER[g.hier] || g.hier), h("span", { class: "story-group-pct" }, g.pct + "%")),
                g.note ? h("p", {}, g.note) : false,
              ),
            ),
          )
        : false,
      s.refuses ? h("div", { class: "story-refuses" }, h("b", {}, "Refuses"), h("p", {}, s.refuses)) : false,
    );
  }

  // exampleCard — a tiny real component (a surface with text + a primary button)
  // painted from the SELECTED palette's semantic roles, in the canvas light/dark
  // ref. It demonstrates the roles in situ; it has no inputs, so liveRefresh can
  // re-render it as controls drag without disturbing the panel above.
  exampleCard(view) {
    const p = view.palettes[this.selectedIndex()];
    const roles = p?.roles || [];
    const dark = this.resolvedCanvasScheme() === "dark";
    const sl = slug(p?.name || "");
    const byKey = {};
    for (const r of roles) byKey[r.key] = r;
    const pick = (role) => (role ? (dark ? role.darkHex : role.lightHex) : "transparent");
    const main = roles.find((r) => r.suffix === "");
    const onMain = roles.find((r) => r.suffix === "-on-" + sl);
    return h(
      "div",
      { class: "example-card", style: "background:" + pick(byKey.surface) },
      h("div", { class: "ex-title", style: "color:" + pick(byKey.onSurface) }, "surface · onSurface"),
      h(
        "div",
        { class: "ex-sub", style: "color:" + pick(byKey.onSurfaceVariant) },
        "onSurfaceVariant",
      ),
      h(
        "button",
        {
          class: "ex-btn",
          tabindex: "-1",
          style: "background:" + pick(main) + ";color:" + pick(onMain),
        },
        "primary",
      ),
    );
  }

  // slider — a range control. `onInput(v)` mutates live (through editDrag, which
  // does a PARTIAL liveRefresh — it never replaces this <input>, so the native
  // pointer drag survives). The whole drag coalesces into ONE undo step (editDrag
  // debounce). On 'oninput' we also update the sibling <b> readout DIRECTLY from
  // the event so it tracks the thumb (it lives in the right pane, which liveRefresh
  // deliberately leaves untouched). 'change' fires on pointer release: flush the
  // drag's single snapshot (eager commit) AND do a full render() so the right
  // pane's labels, the analysis rail, and the footers all reconcile post-drag.
  slider(label, value, min, max, step, fmtFn, onInput) {
    const readout = h("b", {}, fmtFn(value));
    return h(
      "div",
      { class: "field" },
      h("label", {}, label, readout),
      h("input", {
        type: "range",
        "data-fk": "slider:" + label,
        "aria-label": label, // the <label> sibling isn't associated; name the control for SR
        min,
        max,
        step,
        value,
        oninput: (e) => {
          const v = parseFloat(e.target.value);
          readout.textContent = fmtFn(v); // live readout — don't rebuild the label
          onInput(v);
        },
        onchange: () => {
          this.commitDrag(); // pointer release / keyboard step = settle the undo step
          this.render(); // full render: reconcile the right pane + rails once
        },
      }),
    );
  }

  // scrimContext — the sub-variant preview shown atop the Palette inspector while the canvas is
  // in the Scrims view. Scrims have NO independent controls — they ARE this palette's 500 stop at
  // fixed alpha — so the panel shows the 7 swatches and makes the shared-edit relationship explicit:
  // editing Hue / Chroma / Skew / Lift below moves the palette and its scrims together.
  scrimContext(view) {
    const vp = view.palettes[this.selectedIndex()];
    if (!vp) return false;
    const KEYS = ["scrimWeakest", "scrimWeaker", "scrimWeak", "scrim", "scrimStrong", "scrimStronger", "scrimStrongest"];
    const byKey = {};
    for (const r of vp.roles) byKey[r.key] = r;
    return h(
      "div",
      { class: "scrim-context" },
      h("div", { class: "scrim-ctx-head" }, h("b", {}, "Scrims"), h("small", {}, "500 base · 10–55% alpha")),
      h(
        "div",
        { class: "scrim-ctx-strip" },
        ...KEYS.map((k) => {
          const hex8 = (byKey[k] && byKey[k].lightHex) || "#00000000";
          return h("div", { class: "scrim-cell sm", title: `${this.scrimAlpha(hex8)}% · ${hex8}` }, h("i", { class: "scrim-fill", style: `background:${hex8}` }));
        }),
      ),
      h("p", { class: "scrim-ctx-note" }, "A scrim is a sub-variant of this palette — its 500 stop at a fixed alpha. Edit Hue · Chroma · Skew · Lift below and the palette and its scrims move together."),
    );
  }

  renderPaletteInspector(view) {
    const i = this.selectedIndex();
    const p = this.doc.palettes[i];
    if (!p) return h("div", {}, "No palette selected");
    const vp = view.palettes[i];
    // skew + lift shape the CIELAB tone curve (toneAt) — they have NO effect in the OKHSL distribution
    // modes (perceptual/peak step lightness directly), so hide them there, matching the Global controls.
    const isEven = this.doc.toneMode === "even";

    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, swatch((vp.ramp.find((s) => s.stop === 550) || vp.ramp[9]).hex, { size: 16 }), "Palette"),
      h("div", { class: "insp-sub" }, isEven ? "Tune hue · chroma · skew · lift — live" : (this.doc.toneMode === "perceptual" ? "Tune hue · chroma · cusp pull — live" : "Tune hue · chroma — live")),
      // curated story for this color (preset palettes): its evocative name, role, and description.
      vp.colorName
        ? h(
            "div",
            { class: "color-story" },
            h("div", { class: "color-story-name" }, vp.colorRole ? h("span", { class: "color-role" }, vp.colorRole) : false, vp.colorName),
            vp.description ? h("p", { class: "color-story-note" }, vp.description) : false,
          )
        : false,
      // In the Scrims view, surface the sub-variant relationship at the top of the inspector.
      this.canvasView === "scrims" ? this.scrimContext(view) : false,
      field(
        "Name",
        h("input", {
          type: "text",
          "data-fk": "pname",
          value: p.name,
          // typing coalesces into one undo step (editDrag debounce). editDrag does
          // a PARTIAL liveRefresh — it never replaces this <input> (the right pane
          // is left alone), so focus + caret survive mid-word. The canvas row name
          // + analysis header update live. blur/Enter ('change') settles + renders.
          oninput: (e) => this.editDrag((d) => (d.palettes[i].name = e.target.value)),
          onchange: () => {
            this.commitDrag();
            this.render(); // settle: reconcile the right pane + rails post-edit
          },
        }),
      ),
      h(
        "div",
        { class: "field" },
        switchControl({
          on: p.on !== false,
          ariaLabel: "Palette enabled",
          label: p.on !== false ? "Enabled" : "Disabled",
          onToggle: () => this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false))),
        }),
      ),
      this.slider("Hue", p.hue, 0, 360, 1, (v) => fmt(v) + "°", (v) => this.editDrag((d) => (d.palettes[i].hue = v))),
      this.slider("Chroma", p.chroma, 0, 100, 1, (v) => fmt(v) + "%", (v) => this.editDrag((d) => (d.palettes[i].chroma = v))),
      isEven ? this.slider("Skew", p.skew, -100, 100, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].skew = v))) : false,
      isEven ? this.slider("Lift", p.lift, -40, 40, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].lift = v))) : false,
      // Cusp pull (perceptual only) — this palette's override of the global Vibrancy: how far its
      // richest stop is nudged toward 500. Starts at the inherited global value; the peak mode pins it.
      this.doc.toneMode === "perceptual"
        ? this.slider("Cusp pull", p.cuspPull ?? (this.doc.vibrancy ?? 0), 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].cuspPull = v)))
        : false,
      // Edge hue rotation — bipolar, centre 0. The readout shows the light/dark torsion:
      // left = light + / dark −, right = light − / dark + (the slider value = the dark edge).
      this.slider(
        "Edge hue",
        p.hueShift ?? 0,
        -60,
        60,
        1,
        (v) => {
          if (v === 0) return "0°";
          const light = -v; // light-end rotation; dark = +v (opposite) or = light (same-direction)
          const dark = p.hueSameDir ? light : v;
          const sgn = (x) => (x > 0 ? "+" : "−") + Math.abs(x);
          return `${sgn(light)}/${sgn(dark)}°`;
        },
        (v) => this.editDrag((d) => (d.palettes[i].hueShift = v)),
      ),
      // mini-checkbox: bend both ends the SAME direction (|s|) instead of opposite torsion (s)
      h(
        "label",
        { class: "mini-check", title: "Bend both ends the same direction (instead of opposite torsion)" },
        h("input", {
          type: "checkbox",
          checked: p.hueSameDir === true,
          onchange: (e) => this.commit((d) => (d.palettes[i].hueSameDir = e.target.checked)),
        }),
        "ends bend same way",
      ),
      this.keyColorsEditor(i, vp),
      h(
        "div",
        { class: "insp-actions" },
        btn([icon("copy"), "Duplicate"], { onclick: () => this.duplicatePalette(i) }),
        btn([icon("trash"), "Delete"], { variant: "danger", onclick: () => this.deletePalette(i) }),
      ),
    );
  }

  // keyColorsEditor — the palette's retained brand colors as two EXPRESSIONS: `dominant`
  // (the main color) and `supportive` (optional). Each is a big swatch (≈ half width) with
  // its ramp placement (≈ stop + drift), a "seed" (align the family to it), and remove. An
  // empty slot captures the palette's current identity color in one click. Values are OKLCH.
  keyColorsEditor(i, vp) {
    const placed = vp.keyColors || []; // [{role, css, nearStop, drift, ...}]
    const slot = (role) => {
      const pl = placed.find((p) => p.role === role);
      if (pl) {
        return h(
          "div",
          { class: "key-slot filled" },
          h("span", { class: "key-fill", style: `background:${pl.css}` }),
          h(
            "div",
            { class: "key-meta" },
            h("span", { class: "key-role" }, role),
            h("span", { class: "key-place", title: `drift ${pl.drift} — perceptual distance to that stop` }, "≈ " + pl.nearStop),
          ),
          h(
            "div",
            { class: "key-acts" },
            btn(icon("arrows-clockwise"), { variant: "bare", cls: "key-act", title: "Seed the palette's hue + chroma from this color", ariaLabel: `Seed palette from ${role} key color`, onclick: () => this.seedFromKey(i, role) }),
            btn(icon("trash"), { variant: "bare", cls: "key-act", title: "Remove", ariaLabel: `Remove ${role} key color`, onclick: () => this.commit((d) => { d.palettes[i].keyColors = (d.palettes[i].keyColors || []).filter((k) => k.role !== role); }) }),
          ),
        );
      }
      return h(
        "button",
        { type: "button", class: "key-slot empty", title: `Add a ${role} key color (captures this palette's current color; edit by seeding)`, "aria-label": `Add ${role} key color`, onclick: () => this.addKeyColor(i, role) },
        icon("plus"), h("span", {}, "Add " + role),
      );
    };
    return h(
      "div",
      { class: "field key-colors" },
      h("label", {}, "Key colors", h("small", {}, "dominant · supportive")),
      h("div", { class: "key-slots" }, slot("dominant"), slot("supportive")),
    );
  }

  // addKeyColor — capture the palette's current identity color (its vivid `key`) as a key
  // color in OKLCH, tagged with the role. One undo step.
  addKeyColor(i, role) {
    const vp = (this._view || projectView(this.doc)).palettes[i];
    if (!vp) return;
    const oklch = hexToOklch(vp.key);
    this.commit((d) => { (d.palettes[i].keyColors = (d.palettes[i].keyColors || []).filter((k) => k.role !== role)).push({ role, oklch }); });
  }

  // seedFromKey — set the palette's hue + chroma from a key color (CAM16 recovery), so the
  // generated ramp's family matches the brand color. One undo step.
  seedFromKey(i, role) {
    const kc = (this.doc.palettes[i].keyColors || []).find((k) => k.role === role);
    const s = kc && seedFromKeyColor(kc.oklch);
    if (!s) return;
    this.commit((d) => { d.palettes[i].hue = s.hue; d.palettes[i].chroma = s.chroma; });
  }

  duplicatePalette(i) {
    this.commit((d) => {
      const src = d.palettes[i];
      d.palettes.splice(i + 1, 0, { ...src, name: src.name + " copy" });
    });
    this.selectPalette(i + 1);
  }

  deletePalette(i) {
    if (this.doc.palettes.length <= 1) {
      this.toast("Can't delete the last palette");
      return;
    }
    this.commit((d) => d.palettes.splice(i, 1));
    this.selectPalette(Math.max(0, i - 1));
  }

  renderGlobalInspector() {
    const d = this.doc;
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("gear"), "Global controls"),
      h("div", { class: "insp-sub" }, "Tone curve shared by every palette"),
      field(
        "Distribution",
        h(
          "select",
          { onchange: (e) => this.commit((doc) => (doc.toneMode = e.target.value)) },
          ...["perceptual", "even", "peak"].map((m) => h("option", { value: m, selected: d.toneMode === m }, m)),
        ),
        { labelTitle: "perceptual: even OKHSL-lightness steps + gamut chroma (no near-white dead zone). even: the classic CIELAB curve (tone-aligned across hues; Curve/Tension/Chroma-basis apply). peak: cusp anchored at stop 500." },
      ),
      // Vibrancy (perceptual only): pulls the ramp's center toward the hue's chroma cusp, so the mid
      // stops read vibrant — the fix for hues whose vivid expression is off-center (e.g. yellow). At
      // 100 it equals "peak" mode. Hidden in even (CIELAB) + peak (already pinned at the cusp).
      d.toneMode === "perceptual"
        ? this.slider("Vibrancy", d.vibrancy, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.vibrancy = v)))
        : false,
      // Curve · Tension · Chroma-basis shape the CIELAB "even" path ONLY — hide them in the OKHSL modes.
      d.toneMode === "even"
        ? field(
            "Curve",
            h(
              "select",
              { onchange: (e) => this.commit((doc) => (doc.curve = e.target.value)) },
              ...CURVES.map((c) => h("option", { value: c, selected: d.curve === c }, c)),
            ),
          )
        : false,
      d.toneMode === "even"
        ? this.slider("Tension", d.tension, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.tension = v)))
        : false,
      this.slider("L* min", d.lmin, 0, 40, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.lmin = v))),
      this.slider("L* max", d.lmax, 60, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.lmax = v))),
      this.slider("Damp", d.damp, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.damp = v))),
      // chroma floor (even mode only): lifts the damped light/dark ends back toward the palette's
      // intended chroma so low-chroma ramps don't dead-zone to near-white; never over-saturates.
      d.toneMode === "even"
        ? this.slider("Chroma floor", d.chromaFloor, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.chromaFloor = v)))
        : false,
      // differential damping curve — falloff (shape) · amplify (mid boost) · bias (L↔D)
      h("div", { class: "sub-head" }, "Differential curve"),
      this.dampPresets(),
      this.slider("Falloff", d.dampCurve, 0.5, 4, 0.1, (v) => fmt(v, 1), (v) => this.editDrag((doc) => (doc.dampCurve = v))),
      this.slider("Amplify", d.dampAmp, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.dampAmp = v))),
      this.slider(
        "Bias",
        d.dampBias,
        -100,
        100,
        1,
        (v) => (v === 0 ? "0" : (v > 0 ? "dark " : "light ") + fmt(Math.abs(v))),
        (v) => this.editDrag((doc) => (doc.dampBias = v)),
      ),
      h("div", { class: "damp-graph" }, this.graphDamping(d)),
      field(
        "Hue space",
        switchControl({
          on: d.hueSpace === "oklch",
          ariaLabel: "Hue space — OKLCH when on, CAM16 when off",
          label: d.hueSpace,
          onToggle: () => this.commit((doc) => (doc.hueSpace = doc.hueSpace === "oklch" ? "cam16" : "oklch")),
        }),
      ),
      // On-color policy — opt-in WCAG-safe on-colors. Default "fixed" (light tint both modes, ADR-003);
      // "contrast" flips on{N}/on{N}Variant to the better-contrasting end vs the accent fill, per mode.
      field(
        "On-colors",
        switchControl({
          on: d.onColorMode === "contrast",
          ariaLabel: "On-color policy — WCAG contrast when on, fixed light tint when off",
          label: d.onColorMode === "contrast" ? "contrast" : "fixed",
          onToggle: () => this.commit((doc) => (doc.onColorMode = d.onColorMode === "contrast" ? "fixed" : "contrast")),
        }),
        { labelTitle: "fixed: on-colors are the light tint in both modes (ADR-003). contrast: on{N}/on{N}Variant flip to the end with the best WCAG contrast vs the accent fill, per mode — accessible, but no longer uniform." },
      ),
      d.toneMode === "even"
        ? field(
            "Chroma basis",
            switchControl({
              on: d.relChroma,
              ariaLabel: "Chroma basis — gamut when on, peak when off",
              label: d.relChroma ? "gamut" : "peak",
              onToggle: () => this.commit((doc) => (doc.relChroma = !doc.relChroma)),
            }),
            { labelTitle: "peak: chroma is % of each hue's own peak. gamut: % of every stop's gamut ceiling — palettes harmonize across hue." },
          )
        : false,
    );
  }

  // Roles panel — the 37-role table for the selected palette: key · suffix · the
  // light ref swatch + the dark ref swatch · plus a small live semantic preview.
  renderRolesInspector(view) {
    const idx = this.selectedIndex();
    const p = view.palettes[idx] || view.palettes[0];
    const ns = p ? slug(p.name) : "";
    return h(
      "div",
      {},
      h("h3", { class: "insp-title" }, icon("roles"), "Roles"),
      h("div", { class: "insp-sub" }, `${p ? p.name : ""} — 37 semantic roles · light / dark refs`),
      // (the live component preview is pinned at the bottom of the pane on every
      // tab — see .seg-example / exampleCard — so the Roles panel no longer repeats
      // it here at the top.)
      h(
        "div",
        { class: "roles-table" },
        h(
          "div",
          { class: "rrow rhead" },
          h("span", { class: "k" }, "key"),
          h("span", { class: "suf" }, "suffix"),
          h("span", { class: "sw-pair" }, h("span", {}, "L"), h("span", {}, "D")),
        ),
        ...(p
          ? p.roles.map((r) =>
              h(
                "div",
                { class: "rrow" },
                h("span", { class: "k", title: "--c-" + ns + r.suffix }, r.key),
                h("span", { class: "suf" }, r.suffix || "—"),
                h(
                  "span",
                  { class: "sw-pair" },
                  swatch(r.lightHex, { size: 16, title: "light ref " + r.lightHex }),
                  swatch(r.darkHex, { size: 16, title: "dark ref " + r.darkHex }),
                ),
              ),
            )
          : []),
      ),
    );
  }

  // ── app footer ────────────────────────────────────────────────────────────────
  // Static structure (the · separators, theme, spacer) is built once; the dynamic
  // readouts carry stable class hooks (.af-pals / .af-tokens / .af-save / .af-warn)
  // so paintAppFooter can reconcile them in place during a live drag — preserving
  // the flex-gap rhythm of the original multi-span footer (no full re-render).
  renderAppFooter() {
    return h(
      "footer",
      { class: "app-footer" },
      h("span", { class: "af-pals" }),
      h("span", {}, "·"),
      h("span", { class: "af-tokens" }),
      h("span", {}, "·"),
      h("span", {}, this.theme),
      h("span", {}, "·"),
      h("span", { class: "af-save" }),
      h("div", { class: "spacer" }),
      h("span", { class: "af-warn" }),
    );
  }

  // paintAppFooter — fill / reconcile the app-footer's dynamic readouts in place.
  // Called by the full render (after renderAppFooter builds the shell) and by
  // liveRefresh during a drag, so swatch edits update the counts without a render.
  paintAppFooter(view) {
    view = view || this._view;
    if (!view) return;
    const enabled = view.palettes.filter((p) => p.on).length;
    const warns = view.contrast.filter((c) => c.onFill < 4.5); // on-color (50/550) < 4.5

    const pals = this.querySelector(".app-footer .af-pals");
    if (pals) pals.textContent = `${enabled} palettes`;
    const tokens = this.querySelector(".app-footer .af-tokens");
    if (tokens) tokens.textContent = `${tokenCount(this.doc)} tokens`;

    const save = this.querySelector(".app-footer .af-save");
    if (save) {
      const dirty = this.isDirty();
      save.className = dirty ? "af-save dirty" : "af-save saved";
      save.replaceChildren(icon(dirty ? "dot" : "check", { size: 12 }), dirty ? " unsaved" : " saved");
    }

    const warn = this.querySelector(".app-footer .af-warn");
    if (warn) {
      warn.className = warns.length ? "af-warn warn" : "af-warn";
      warn.textContent = warns.length ? `⚠ ${warns.length} on-color < 4.5:1` : "contrast ok";
    }
  }

  // ── export drawer ────────────────────────────────────────────────────────────
  toggleDrawer(open) {
    this.exportOpen = open;
    this.render(); // render() → _syncDrawer() promotes/dismisses the native <dialog> in the top layer
    // showModal() moves focus INTO the dialog on open and the browser traps Tab there; on close
    // we return focus to the opener. Guarded to a no-op in the headless DOM (no real focus).
    if (!open) {
      const opener = this.querySelector(".export-open-btn");
      if (opener && opener.focus) opener.focus();
    }
  }

  renderDrawer(view) {
    // Export formats grouped by DESTINATION (what consumes the output); the item names
    // only the variant. Group = where it goes, so labels never collide (no "CSS / CSS").
    // Internal ids (css/oklch/tailwind/…) are unchanged — only the display labels.
    const FORMAT_GROUPS = [
      ["CSS", [["css", "Hex"], ["oklch", "OKLCH"]]],
      ["Frameworks", [["tailwind", "Tailwind v4"], ["shadcn", "shadcn/ui"]]],
      ["Design tools", [["figma", "Figma"], ["ui3", "Figma UI3"], ["dtcg", "DTCG"], ["json", "JSON"]]],
      ["Project", [["config", "Config"]]],
    ];
    // The three Figma mode files: [stateKey, label, real filename to import as].
    const FIGMA = [
      ["light", "Light", "Light_tokens.json"],
      ["dark", "Dark", "Dark_tokens.json"],
      ["raw", "Raw values", "palette.tokens.json"],
    ];
    const isFigma = this.exportTab === "figma";
    const isConfig = this.exportTab === "config";
    const figCur = FIGMA.find((f) => f[0] === this.figmaFile) || FIGMA[0];
    const code = isConfig
      ? JSON.stringify(serialize(this.doc), null, 2) // the parametric doc — re-importable via the gallery's ⬆ Import
      : isFigma
        ? view.exports.figma[this.figmaFile]
        : view.exports[this.exportTab];
    const bytes = new Blob([code]).size;

    // A native <dialog>: showModal() (see _syncDrawer) promotes it to the browser TOP LAYER —
    // above every stacking context with no z-index race — and gives ::backdrop, focus trapping,
    // background inert, and Esc for free. open/close is driven by exportOpen via _syncDrawer.
    return h(
      "dialog",
      {
        class: "drawer",
        "aria-label": "Export",
        // a click that lands on the dialog box itself (i.e. the ::backdrop) closes it; clicks on
        // the content hit child nodes, so they don't.
        onclick: (e) => { if (e.target === e.currentTarget) this.toggleDrawer(false); },
        // Esc → native 'cancel'. Keep exportOpen the single source of truth: cancel the default
        // close and route through toggleDrawer so the state + the dialog stay in lockstep.
        oncancel: (e) => { e.preventDefault(); this.toggleDrawer(false); },
      },
      h(
        "div",
        { class: "drawer-head" },
        h("h3", {}, icon("export"), "Export"),
        h("div", { class: "spacer" }),
        btn(icon("x"), { ariaLabel: "Close export drawer", onclick: () => this.toggleDrawer(false) }),
      ),
        h(
          "div",
          { class: "drawer-format" },
          h("label", { for: "export-format" }, "Format"),
          h(
            "select",
            {
              id: "export-format",
              "aria-label": "Export format",
              onchange: (e) => {
                this.exportTab = e.target.value;
                this.render();
              },
            },
            ...FORMAT_GROUPS.map(([label, items]) =>
              h(
                "optgroup",
                { label },
                ...items.map(([id, lab]) =>
                  h("option", id === this.exportTab ? { value: id, selected: "selected" } : { value: id }, lab),
                ),
              ),
            ),
          ),
        ),
        // Figma sub-bar: the import note on its own row, then [mode-file segmented | Binder plugin].
        isFigma
          ? h(
              "div",
              { class: "figma-bar" },
              h("span", { class: "figma-note" }, "One file per Figma variable-mode — import Light & Dark into the two modes of one collection, then run the Binder plugin for the live raw→semantic cascade."),
              h(
                "div",
                { class: "figma-bar-row" },
                this.segmented(
                  FIGMA.map(([id, label]) => ({ id, label })),
                  this.figmaFile,
                  (id) => {
                    this.figmaFile = id;
                    this.render();
                  },
                  { baseClass: "figma-files", ariaLabel: "Figma mode file", role: "group", idPrefix: "ffile" },
                ),
                btn([icon("download"), "Binder plugin"], {
                  cls: "figma-plugin-btn",
                  title: "Download the HCT Semantic Binder plugin (manifest.json + code.js). In Figma: Plugins → Development → Import plugin from manifest — it aliases each semantic role to its raw variable so editing a raw color cascades.",
                  onclick: () => this.downloadFigmaPlugin(),
                }),
                // Opt-in (inside Figma only): re-create Color Modes so it adopts the grouped order
                // (Figma won't reorder existing variables on a normal apply). Lives here, beside the
                // Binder plugin, because it's a Figma-tab action — re-creates vars, so bound layers
                // need reconnecting.
                this.inFigma
                  ? btn([icon("arrows-clockwise"), "Regroup"], {
                      cls: "figma-regroup",
                      title: "Rebuild the Color Modes variables in grouped order (regular · containers · surfaces · scrims). Re-creates them, so layers bound to them will need reconnecting. Color Primitives are untouched.",
                      onclick: () => this.requestApplyToFigma(true),
                    })
                  : false,
              ),
            )
          : false,
        // Config sub-bar: the project source-of-truth actions live ABOVE the code, not in the footer.
        isConfig
          ? h(
              "div",
              { class: "config-bar" },
              btn([icon("upload"), "Save to project"], { title: this.inFigma ? "Save this config into this Figma file (travels with the file)" : "Save this config to the project (localStorage)", onclick: () => this.saveToProject() }),
              btn([icon("download"), "Load from project"], { title: this.inFigma ? "Load the config saved in this Figma file" : "Load the config saved to the project", onclick: () => this.loadFromProject() }),
              h("span", { class: "config-note" }, this.inFigma ? "Source of truth: this Figma file (travels with the file)" : "Source of truth: your browser (localStorage)"),
            )
          : false,
        // The code block carries its OWN floating copy affordance (top-right), so the footer stays a
        // single download action instead of a row of competing buttons.
        h(
          "div",
          // the output for the format chosen in the drawer-format <select> above.
          { class: "drawer-code", role: "region", "aria-label": "Export output" },
          btn([icon("copy"), "Copy"], { variant: "bare", cls: "copy-float", title: "Copy to clipboard", ariaLabel: "Copy", onclick: () => this.copy(code) }),
          h("pre", { class: "drawer-pre" }, code),
        ),
        h(
          "div",
          { class: "drawer-foot" },
          h("span", { class: "meta" }, `${(bytes / 1024).toFixed(1)} KB · ${isFigma ? figCur[2] : isConfig ? "re-importable config" : tokenCount(this.doc) + " tokens"}`),
          // Footer actions kept in ONE group so they never split across rows: the foot is
          // flex-wrap and .meta has flex:1, so as separate children Download all wrapped below
          // Apply. As a single .foot-actions child they stay together (Apply left, Download right).
          h(
            "div",
            { class: "foot-actions" },
            // Inside Figma, applying variables directly is the point — primary action, on the LEFT.
            this.inFigma
              ? btn([icon("flag"), "Apply Variables"], {
                  variant: "primary",
                  cls: "figma-apply",
                  title: "Create/update the Color Primitives + Color Modes (Light/Dark) variable collections directly in this Figma file",
                  onclick: () => this.requestApplyToFigma(),
                })
              : false,
            // (Regroup moved to the Figma tab's sub-bar, beside the Binder plugin button.)
            // ONE download action — every format in its own folder + the config, as a single .zip.
            btn([icon("download"), "Download All"], { variant: "primary", title: "Download every format (css-hex, css-oklch, json, dtcg, figma, ui3) in its own folder + the config, as one .zip", onclick: () => this.downloadAllZip(view) }),
          ),
        ),
    );
  }

  // downloadAllZip — ONE archive with every format in its own folder + the re-importable config at the
  // root. Built with the dependency-free store-only ZIP writer (zip.mjs) so it works offline / in the
  // Figma sandbox. Folders mirror the formats: css-hex / css-oklch / json / dtcg / figma / ui3.
  downloadAllZip(view) {
    const s = slug(this.doc.name || "palette");
    const ex = view.exports;
    const files = [
      { name: `css-hex/${s}.css`, data: ex.css },
      { name: `css-oklch/${s}.css`, data: ex.oklch },
      { name: `json/${s}.json`, data: ex.json },
      { name: `dtcg/${s}.tokens.json`, data: ex.dtcg },
      { name: "figma/Light_tokens.json", data: ex.figma.light },
      { name: "figma/Dark_tokens.json", data: ex.figma.dark },
      { name: "figma/palette.tokens.json", data: ex.figma.raw },
      { name: `ui3/${s}.json`, data: ex.ui3 },
      { name: `tailwind/${s}.css`, data: ex.tailwind },
      { name: `shadcn/${s}.css`, data: ex.shadcn },
      { name: `nonoun-color-tokens-${s}-config.json`, data: JSON.stringify(serialize(this.doc), null, 2) },
    ];
    // figma-aliased/ — the SAME tokens, but the Light/Dark leaves carry com.figma.aliasData targeting
    // the "Color Primitives" collection (figmaBundle). For TESTING plugin-free import / the live cascade
    // (OD-004, unverified end-to-end). The default figma/ files (resolved) always import; the plugin is
    // the reliable cascade. See figma-aliased/README.txt.
    const aliased = this.figmaBundle();
    files.push(
      { name: "figma-aliased/palette.tokens.json", data: JSON.stringify(aliased["palette.tokens.json"], null, 2) },
      { name: "figma-aliased/Light_tokens.json", data: JSON.stringify(aliased["Light_tokens.json"], null, 2) },
      { name: "figma-aliased/Dark_tokens.json", data: JSON.stringify(aliased["Dark_tokens.json"], null, 2) },
      { name: "figma-aliased/README.txt", data: ALIASED_README },
    );
    const bytes = zipStore(files);
    this.downloadBytes(bytes, `nonoun-color-tokens-${s}.zip`, "application/zip");
  }

  // _saveBlob — save a Blob to disk. PREFERS the File System Access API (showSaveFilePicker): an
  // explicit save dialog that writes the file directly, so it works in embedded/sandboxed webviews
  // that ignore <a download> and would otherwise NAVIGATE to (preview) the blob. Falls back to the
  // universal <a download> anchor when the picker is unsupported or blocked. Cancelling the dialog
  // is a no-op (never force a fallback download the user just dismissed).
  async _saveBlob(blob, filename) {
    if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
      try {
        const ext = (String(filename).match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        const opts = { suggestedName: filename };
        if (ext) opts.types = [{ description: ext.toUpperCase() + " file", accept: { [blob.type || "application/octet-stream"]: ["." + ext] } }];
        const handle = await window.showSaveFilePicker(opts);
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        this.toast("Downloaded " + filename);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // user dismissed the save dialog — don't fall through
        // any other error (unsupported option, SecurityError, blocked in a sandbox) → anchor fallback
      }
    }
    // Fallback: <a download> + a blob URL — the universal path (works in any top-level browser tab).
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;            // property form is the most reliably-honored "save, don't navigate"
      a.setAttribute("download", filename);
      a.rel = "noopener";
      a.style.display = "none";
      document.body.append(a);
      a.click();
      // Defer cleanup: removing the anchor / revoking the URL synchronously after click() races the
      // (async, for a binary blob) download, so the browser navigates to/previews the blob instead of
      // saving it. Give the download a beat to start before tearing down.
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
      this.toast("Downloaded " + filename);
    } catch {
      this.toast("Download failed");
    }
  }

  // downloadBytes — save raw bytes (the binary sibling of download()); e.g. the Download-All .zip.
  downloadBytes(bytes, filename, type) {
    this._saveBlob(new Blob([bytes], { type: type || "application/octet-stream" }), filename);
  }

  // figmaBundle — public accessor: the DTCG (raw + Light/Dark, aliased) for the
  // CURRENT doc, the payload the Figma-plugin bridge posts to its code.js sandbox.
  figmaBundle() {
    return figmaBundle(this.doc);
  }

  // setInFigma — the Figma bridge (gen-ui.mjs) calls this on figma-init so the app knows
  // it runs inside Figma and can reveal the "Add Variables → Figma" action in the drawer.
  setInFigma(on) {
    this.inFigma = !!on;
    // Re-render in ANY view, not just the editor: figma-init arrives ASYNC (after the app has
    // already rendered the startup GALLERY), so the gallery must re-render here to run its one-shot
    // probeFigmaProject() — otherwise the file's saved config never surfaces as the import row.
    // (Bug: editor-only re-render → gallery never probed → "saved config doesn't show in gallery".)
    this.render();
  }

  // applyToFigma — post the current DTCG bundle to the plugin sandbox (code.js), which
  // creates/updates the raw-colors + Light/Dark variable collections. A safe no-op outside
  // a Figma plugin: parent === window and nothing listens for the pluginMessage envelope.
  // requestApplyToFigma — the GATED entry the Apply / Regroup buttons call. Shows a "back up your
  // variables first" road-block (explicit consent + destructive-overwrite warning) before touching
  // the file. Normal apply is cookieable ("don't show again"); the destructive Regroup ALWAYS warns.
  requestApplyToFigma(rebuild = false) {
    if (!rebuild && this._applyConsented()) { this.applyToFigma(false); return; }
    this.applyGateRebuild = !!rebuild;
    this.applyGateDontShow = false;
    this.applyGateOpen = true;
    this.render();
  }
  closeApplyGate() { this.applyGateOpen = false; this.render(); }
  // confirm the gate: persist consent (normal apply only) + run the real apply.
  confirmApplyGate() {
    const rebuild = this.applyGateRebuild;
    if (!rebuild && this.applyGateDontShow) this._setApplyConsent();
    this.applyGateOpen = false;
    this.applyToFigma(rebuild);
  }
  // consent is a per-USER preference (not doc-bound) → localStorage, versioned so a material change to
  // apply-behavior can re-surface the warning by bumping the key. (Figma's iframe localStorage may be
  // session-scoped — re-warning once per session for a destructive action is acceptable / safe.)
  _applyConsentKey() { return "nonoun-color-tokens-apply-consent-v1"; }
  _applyConsented() { try { return localStorage.getItem(this._applyConsentKey()) === "1"; } catch { return false; } }
  _setApplyConsent() { try { localStorage.setItem(this._applyConsentKey(), "1"); } catch { /* storage blocked */ } }

  applyToFigma(rebuild = false) {
    // rebuild = the opt-in "Regroup" path: re-create the Color Modes collection so it adopts the
    // canonical grouped order (Figma keeps existing variables' positions on a normal update). It
    // re-creates the semantic variables — bound layers detach (warned in the apply gate).
    try {
      // Send the variables AND the exact params together — code.js embeds the config in the file
      // (root pluginData) so a later read reproduces this state losslessly, not approximately.
      parent.postMessage({ pluginMessage: { type: "apply", dtcg: this.figmaBundle(), config: serialize(this.doc), rebuildSemantic: !!rebuild } }, "*");
      this.toast(rebuild ? "Regrouping Color Modes…" : "Sent to Figma — check the Variables panel");
    } catch {
      /* not in a frame / blocked — nothing to apply to */
    }
  }

  // _syncApplyGate — reconcile the gate <dialog> with applyGateOpen (mirrors _syncDrawer/_syncNewPal).
  _syncApplyGate() {
    const d = this.querySelector(".apply-gate");
    if (!d || typeof d.showModal !== "function") return;
    if (this.applyGateOpen && !d.open) { try { d.showModal(); } catch { /* not attached */ } }
    else if (!this.applyGateOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }

  // renderApplyGate — the "back up your variables first" consent road-block shown before Apply/Regroup.
  // A Figma review gate (explicit awareness before modifying the file) AND destructive-overwrite
  // protection (Apply can overwrite same-named variables that components are bound to).
  renderApplyGate() {
    const rebuild = this.applyGateRebuild;
    const MAPPINGS_DOC = "https://nonoun.io/docs/mappings";
    return h(
      "dialog",
      {
        class: "apply-gate",
        "aria-label": rebuild ? "Regroup Color Modes" : "Apply variables to Figma",
        onclick: (e) => { if (e.target === e.currentTarget) this.closeApplyGate(); },
        oncancel: (e) => { e.preventDefault(); this.closeApplyGate(); },
      },
      h(
        "div",
        { class: "drawer-head" },
        h("h3", {}, icon("warning"), rebuild ? "Regroup Color Modes" : "Apply variables to this file"),
        h("div", { class: "spacer" }),
        btn(icon("x"), { ariaLabel: "Close", onclick: () => this.closeApplyGate() }),
      ),
      h(
        "div",
        { class: "apply-gate-body" },
        h("p", { class: "apply-gate-lede" }, rebuild
          ? "Regroup deletes and re-creates the Color Modes variables so they adopt the grouped order. Any layers or styles bound to them will detach and need reconnecting. (Color Primitives are untouched.)"
          : "This creates or updates the Color Primitives + Color Modes variable collections in this file. Variables with the same names are overwritten — which can re-skin components already bound to them (sometimes exactly what you want)."),
        h(
          "div",
          { class: "apply-gate-warn" },
          icon("warning", { size: 16 }),
          h("div", {}, h("b", {}, "Back up your file first."), " Duplicate the file (or the collections) before applying, so you can roll back if a mapping overwrites something you meant to keep."),
        ),
        h("p", { class: "apply-gate-learn" },
          "Re-routing semantic tokens onto existing variables? ",
          h("button", { type: "button", class: "linklike", onclick: () => { try { window.open(MAPPINGS_DOC, "_blank", "noopener"); } catch {} } }, "Learn how mappings work →"),
        ),
        // "Don't show again" — normal apply only; the destructive Regroup always warns.
        rebuild ? false : h(
          "label",
          { class: "apply-gate-dontshow" },
          h("input", {
            type: "checkbox",
            checked: this.applyGateDontShow ? true : undefined,
            onchange: (e) => { this.applyGateDontShow = !!e.target.checked; },
          }),
          h("span", {}, "Don't show this again"),
        ),
      ),
      h(
        "div",
        { class: "apply-gate-foot" },
        h("div", { class: "spacer" }),
        btn("Cancel", { onclick: () => this.closeApplyGate() }),
        btn(rebuild ? "Regroup variables" : "Apply variables", { variant: "primary", cls: "apply-gate-go", onclick: () => this.confirmApplyGate() }),
      ),
    );
  }

  // ── Settings modal (token mapping + preferences) ──────────────────────────────────────
  openSettings() { this.settingsOpen = true; this.render(); }
  closeSettings() { this.settingsOpen = false; this.render(); }
  _syncSettings() {
    const d = this.querySelector(".settings");
    if (!d || typeof d.showModal !== "function") return;
    if (this.settingsOpen && !d.open) { try { d.showModal(); } catch { /* not attached */ } }
    else if (!this.settingsOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }

  // a labeled setting row: a title + description on the left, a segmented control on the right.
  _settingRow(title, desc, items, value, onSelect, idPrefix) {
    return h(
      "div",
      { class: "settings-row" },
      h("div", { class: "settings-row-text" }, h("b", {}, title), h("small", {}, desc)),
      this.segmented(items, value, onSelect, { ariaLabel: title, role: "group", cls: "settings-seg", idPrefix }),
    );
  }

  renderSettings() {
    const d = this.doc;
    const accentRef = d.accentRef === "single" ? "single" : "mode";
    const onColorMode = d.onColorMode === "contrast" ? "contrast" : "fixed";
    return h(
      "dialog",
      {
        class: "settings",
        "aria-label": "Settings",
        onclick: (e) => { if (e.target === e.currentTarget) this.closeSettings(); },
        oncancel: (e) => { e.preventDefault(); this.closeSettings(); },
      },
      h(
        "div",
        { class: "drawer-head" },
        h("h3", {}, icon("gear"), "Settings"),
        h("div", { class: "spacer" }),
        btn(icon("x"), { ariaLabel: "Close settings", onclick: () => this.closeSettings() }),
      ),
      h(
        "div",
        { class: "settings-body" },
        h("div", { class: "settings-section-title" }, "Token mapping"),
        this._settingRow(
          "Primary accent",
          "How the prime accent role exports. Mode-specific picks the better-contrast stop per scheme; Single uses one mode-agnostic token.",
          [{ id: "mode", label: "Mode-specific · 550 / 450" }, { id: "single", label: "Single · 500 / 500" }],
          accentRef,
          (id) => this.commit((doc) => { doc.accentRef = id; }),
          "setaccent",
        ),
        this._settingRow(
          "On-colors",
          "Text/icon colors on accent fills. Fixed pins the light tint (050 / 200); Contrast flips to the WCAG-safer end per mode.",
          [{ id: "fixed", label: "Fixed · 050 / 200" }, { id: "contrast", label: "WCAG contrast" }],
          onColorMode,
          (id) => this.commit((doc) => { doc.onColorMode = id; }),
          "setoncolor",
        ),
        h("p", { class: "settings-note" }, "These are resolution-layer mapping choices — they re-point how roles resolve, not the ramps. They travel with the set and apply to every export."),
      ),
      h(
        "div",
        { class: "settings-foot" },
        h("div", { class: "spacer" }),
        btn("Done", { variant: "primary", onclick: () => this.closeSettings() }),
      ),
    );
  }

  // ── project source of truth (config round-trip I/O) ───────────────────────────────────
  // The "config" is the PARAMETRIC doc (serialize) — palettes' hue/chroma/skew/lift, the global
  // controls, AND roleOverrides — never resolved colors (colors are always re-derived). So a
  // round-trip restores the generator's exact state. Figma → the document's root pluginData (embedded
  // IN the .fig, travels with the file); browser → localStorage. (A read-only diff against the live
  // Figma variables, and the approximate variable-derived seed, are separate fallback paths.)
  saveToProject() {
    const config = serialize(this.doc);
    if (this.inFigma) {
      try { parent.postMessage({ pluginMessage: { type: "save-config", config } }, "*"); this.toast("Saved to the Figma file"); } catch { /* no frame */ }
      return;
    }
    try { localStorage.setItem(PROJECT_KEY, JSON.stringify(config)); this.toast("Saved to project"); }
    catch { this.toast("Save failed — no storage available"); }
  }

  // loadFromProject — restore the config. Figma posts {load-config} and the answer arrives async
  // as {config-loaded} (relayed to applyLoadedConfig by the bridge); browser reads localStorage now.
  loadFromProject() {
    this._loadRequested = true; // an EXPLICIT load → applyLoadedConfig should OPEN it (not just record)
    if (this.inFigma) {
      try { parent.postMessage({ pluginMessage: { type: "load-config" } }, "*"); } catch { this._loadRequested = false; }
      return;
    }
    let raw = null;
    try { raw = localStorage.getItem(PROJECT_KEY); } catch { raw = null; }
    if (!raw) { this._loadRequested = false; this.toast("No saved project config"); return; }
    try { this.applyLoadedConfig(JSON.parse(raw)); } catch { this._loadRequested = false; this.toast("Project config is corrupt"); }
  }

  // applyLoadedConfig — the answer to a load-config request: UNTRUSTED config in (a stored slot or a
  // Figma {config-loaded} message). On the gallery AUTO-PROBE (no explicit load in flight) it only
  // RECORDS whether the file has an embedded config (this.fileConfig → reveals the import row); it does
  // NOT auto-open. An EXPLICIT load (⬇ Project / Open-saved set _loadRequested) opens it as a set.
  applyLoadedConfig(config) {
    const valid = !!(config && typeof config === "object" && Array.isArray(config.palettes) && config.palettes.length);
    if (this.view !== "editor" && !this._loadRequested) {
      this.fileConfig = valid ? config : null; // gallery probe: record availability, render the row
      this.render();
      return;
    }
    this._loadRequested = false;
    if (!valid) { this.toast("No saved project config"); return; }
    this.openConfigAsSet(config, "Loaded from project");
  }

  // openConfigAsSet — shape-clamp an (untrusted) config and open it as a new set. hydrate() domain-clamps
  // every field, so a junk/partial config is sanitized, never trusted as-is.
  openConfigAsSet(config, toastMsg) {
    const doc = hydrate(config);
    const name = (typeof config.name === "string" && config.name.trim()) || "Project";
    doc.name = name;
    const id = "set-" + Date.now().toString(36);
    this.sets.push({ id, name, doc: serialize(doc), updated: Date.now() });
    this.persistSets();
    this.openSet(id);
    if (toastMsg) this.toast(toastMsg);
  }

  // ── read-only Figma-variables reference + drift diff (#3) ──────────────────────────────
  // Read the live raw-colors variables from the FILE and compare to what the generator would emit
  // now → per-token drift in the Mapping table (✓ match / ✗ drifted / — absent). Read-only: it never
  // reconstructs params (you cannot reverse-derive hue/chroma from a color), it only diffs colors.
  readLiveVariables() {
    if (!this.inFigma) { this.toast("Reading live variables is a Figma-plugin feature"); return; }
    try { parent.postMessage({ pluginMessage: { type: "read-variables" } }, "*"); } catch { /* no frame */ }
  }

  receiveLiveVariables(payload) {
    this.liveVars = (payload && payload.raw) || {};
    this.liveVarsFound = !!(payload && payload.found);
    this.render();
    // On the gallery the read is a silent structure PROBE (the import row reflects the result);
    // the per-token drift summary only makes sense against an open document, so toast only there.
    if (this.view !== "editor") return;
    if (!this.liveVarsFound) { this.toast("No raw-colors collection in this file yet"); return; }
    const d = this.driftSummary();
    this.toast(d.drifted ? `${d.drifted} of ${d.total} tokens drifted from the file` : `In sync — all ${d.total} match the file`);
  }

  // driftStatus — generated raw var "{n}/{key}" + its generated hex vs the live read.
  // null = no read yet; "absent" = not in the file; "match" / "drift".
  driftStatus(varName, genHex) {
    if (!this.liveVars) return null;
    const live = this.liveVars[varName];
    if (live == null) return "absent";
    return live.toUpperCase() === String(genHex).toUpperCase() ? "match" : "drift";
  }

  driftSummary() {
    const rawTree = this.figmaBundle()["palette.tokens.json"] || {};
    let total = 0, drifted = 0, absent = 0;
    for (const n of Object.keys(rawTree)) {
      if (n[0] === "$") continue; // skip DTCG group metadata ($type/$extensions)
      for (const key of Object.keys(rawTree[n])) {
        if (key[0] === "$") continue;
        const st = this.driftStatus(n + "/" + key, (rawTree[n][key].$value || {}).hex);
        if (st === null) continue;
        total++;
        if (st === "drift") drifted++;
        if (st === "absent") absent++;
      }
    }
    return { total, drifted, absent };
  }

  // downloadFigmaPlugin — the HCT Semantic Binder plugin's two files (manifest.json +
  // code.js). Drop both into one folder, then Figma → Plugins → Development → Import
  // plugin from manifest. It creates the raw→semantic alias cascade native import can't.
  downloadFigmaPlugin() {
    this.download(FIGMA_PLUGIN.manifest, "manifest.json");
    setTimeout(() => this.download(FIGMA_PLUGIN.code, "code.js"), 150);
  }

  copy(text) {
    const done = () => this.toast("Copied to clipboard");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }
  fallbackCopy(text, done) {
    const ta = h("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      this.toast("Copy failed");
    }
    ta.remove();
  }

  // download — save text (CSS/JSON/etc.). Routes through _saveBlob, so it benefits from the same
  // File System Access save dialog (and anchor fallback) the .zip uses.
  download(text, filename) {
    this._saveBlob(new Blob([text], { type: "text/plain" }), filename);
  }

  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove("show"), 1800);
  }
}

customElements.define("nonoun-color-tokens", HctApp);

// expose a couple of pure helpers for any console poking / future tests.
export { HctApp, contrastRatio };
