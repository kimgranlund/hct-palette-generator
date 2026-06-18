// app.js — the DOM app for the HCT Palette Generator.
//
// One <hct-app> web component. The `document` (a palette SET) is the single
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
} from "./model.mjs";
import { STORAGE_KEY, serialize, hydrate } from "./persist.js";
import { FIGMA_PLUGIN } from "./figma-plugin-assets.js";
import { TRAVEL_PRESETS } from "./travel-presets.js";
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
// the result once as <style id="hct-app-theme"> into <head>, so every --c-* role and
// raw var is available globally for styles.css to consume. We use the FIXED default
// set (not the user's edited doc) so the chrome stays stable while a doc is edited.
const APP_THEME_STYLE_ID = "hct-app-theme";
function ensureAppTheme() {
  if (typeof document === "undefined" || !document.head) return;
  if (document.getElementById(APP_THEME_STYLE_ID)) return; // inject exactly once
  const style = document.createElement("style");
  style.id = APP_THEME_STYLE_ID;
  style.textContent = appThemeCSS();
  document.head.appendChild(style);
}

// setColorScheme — flip the document's color-scheme so EVERY light-dark() token —
// the generated --c-* chrome tokens included — resolves to the chosen mode.
function setColorScheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root) root.style.colorScheme = theme; // "light" | "dark"
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

class HctApp extends HTMLElement {
  connectedCallback() {
    ensureAppTheme(); // inject the generated --c-* design tokens once, globally
    this.sets = loadSets();
    // session (UI-only, not persisted with the doc)
    this.view = "gallery"; // gallery | editor
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
    this.canvasTheme = "light"; // canvas preview color-scheme — INDEPENDENT of app chrome ◐
    this.canvasView = "palettes"; // canvas content: palettes (the ramps) | scrims | mapping (the role→raw table)
    this.stopsMode = "core"; // palette ramp density: core (19 display stops) | extended (25 EXPORT_STOPS)
    this.mapTextMode = false; // Mapping table raw-token editor: false = select menu, true = free text input
    this.viewport = { panX: 0, panY: 0, zoom: 1 };
    this.theme = "light";
    this.exportOpen = false;
    this.exportTab = "css";
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
    this.render();
  }

  disconnectedCallback() {
    if (this._onKeyDown) document.removeEventListener("keydown", this._onKeyDown);
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
    saveSets(this.sets);
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
        ...enabled.slice(0, 8).map((p) => {
          const mid = p.ramp.find((s) => s.stop === 550) || p.ramp[Math.floor(p.ramp.length / 2)];
          return h("i", { style: `background:${mid.hex}` });
        }),
      );
      const tile = h(
        "button",
        { class: "set-tile", onclick: () => this.openSet(rec.id) },
        // tags ride the preview: count bottom-left, the updated-time bottom-right (the slot a preset
        // tile uses for its "preset" badge), and the delete button top-right (it keeps pointer-events
        // + stopPropagation so it still deletes rather than opening the set). The meta row keeps the name.
        h(
          "div",
          { class: "set-thumb" },
          strip,
          h(
            "span",
            {
              class: "del",
              title: "Delete set",
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

  // buildPresetTiles — the read-only "Presets" shelf. Presets ship in code (TRAVEL_PRESETS,
  // generated from docs/spec/colors/), never in localStorage; clicking one OPENS AN EDITABLE COPY into
  // the user's sets (openConfigAsSet hydrates + appends + opens). Filtered by the same search box.
  buildPresetTiles() {
    const q = this.search.trim().toLowerCase();
    const visible = TRAVEL_PRESETS.filter((p) => !q || p.name.toLowerCase().includes(q));
    return visible.map((preset) => {
      const v = projectView(hydrate(preset));
      const enabled = v.palettes.filter((p) => p.on);
      // Preview the 6 CURATED colors only (the trailing danger/warning/success are near-identical
      // across presets and made every tile look the same). Widths emphasize the primary tier
      // (~55/35/10, primary-base biggest), so a tile reads as "this palette's main color". The 550
      // stop is now the lift-anchored prime ≈ the source color, so the strip is representative.
      const SAMPLED_W = [36, 19, 19, 16, 6, 4];
      const strip = h(
        "div",
        { class: "strip" },
        ...enabled.slice(0, 6).map((p, i) => {
          const mid = p.ramp.find((s) => s.stop === 550) || p.ramp[Math.floor(p.ramp.length / 2)];
          return h("i", { style: `background:${mid.hex};flex:${SAMPLED_W[i] || 1}` });
        }),
      );
      return h(
        "button",
        { class: "set-tile preset", title: `Open a copy of “${preset.name}”`, onclick: () => this.openConfigAsSet(preset, `Opened “${preset.name}”`) },
        // both the "preset" tag (bottom-right) and the palette-count (bottom-left) ride the preview;
        // the meta row below carries just the name.
        h(
          "div",
          { class: "set-thumb" },
          strip,
          h("span", { class: "tile-tag tile-preset" }, "preset"),
          h("span", { class: "tile-tag tile-count" }, `${enabled.length} palettes`),
        ),
        h(
          "div",
          { class: "set-meta" },
          h("div", { class: "nm" }, preset.name),
        ),
      );
    });
  }

  // refreshTiles — re-render ONLY the grid hosts' children. Used on search input
  // so the <input> element is never replaced and keeps focus + caret. Refreshes BOTH
  // the presets shelf and your sets (one search filters both).
  refreshTiles() {
    if (this._gridHost) this._gridHost.replaceChildren(...this.buildTiles());
    if (this._presetGridHost) this._presetGridHost.replaceChildren(...this.buildPresetTiles());
  }

  renderGallery() {
    // In Figma, probe the file ONCE on open: the embedded config (lossless) if present, else the
    // variable structure (lossy fallback). Both reads return async and re-render the gallery here.
    if (this.inFigma && !this._figmaProbed) this.probeFigmaProject();

    // The search <input> is created ONCE and reused across renders so typing never
    // loses focus (the BUG: re-render replaced it). On input we only refresh tiles.
    if (!this._searchInput) {
      this._searchInput = h("input", {
        type: "search",
        "data-fk": "search",
        "aria-label": "Search palette sets",
        placeholder: "Search…",
        value: this.search,
        oninput: (e) => {
          this.search = e.target.value;
          this.refreshTiles(); // tiles only — input stays put, focus + caret preserved
        },
      });
    } else {
      // reuse: keep its current value in sync without touching the DOM node identity.
      if (this._searchInput.value !== this.search) this._searchInput.value = this.search;
    }

    this._gridHost = h("div", { class: "set-grid" }, ...this.buildTiles());
    // Read-only curated "Presets" — ship in code (TRAVEL_PRESETS), open as an editable copy.
    this._presetGridHost = h("div", { class: "set-grid preset-grid" }, ...this.buildPresetTiles());

    return h(
      "div",
      { class: "gallery" },
      this.toastEl || (this.toastEl = h("div", { class: "toast" })),
      h(
        "header",
        { class: "gallery-header" },
        h("div", { class: "brand" }, brandMark(), "Color Tokens by NONOUN"),
        h("div", { class: "spacer" }),
        h("button", { class: "ghost", onclick: () => this.loadFromProject(), title: this.inFigma ? "Load the config saved in this Figma file" : "Load the config saved to the project (Source of Truth)" }, icon("download"), "Project"),
        h("button", { class: "ghost", onclick: () => this.importSet(), title: "Import a palette config (.json) exported from Export → Config" }, icon("upload"), "Import"),
        h("button", { class: "ghost", onclick: () => this.createSet() }, "+ New"),
        this.themeBtn(),
      ),
      h(
        "div",
        { class: "gallery-body" },
        this.renderFigmaImportRow(), // a separate row ABOVE the sets when this Figma file already has palette variables
        h(
          "div",
          { class: "gallery-title" },
          h("h2", {}, "Your Palettes"),
          h("div", { class: "spacer" }),
          this._searchInput,
        ),
        this._gridHost,
        // Curated presets shelf (read-only), below your own palettes. Opening one copies it into Your Palettes.
        h(
          "div",
          { class: "gallery-title" },
          h("h2", {}, "Presets"),
          h("span", { class: "title-count" }, String(TRAVEL_PRESETS.length)),
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
    } catch { /* no frame */ }
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
        h("button", { class: "primary", onclick: () => this.openConfigAsSet(this.fileConfig, "Opened the saved palette") }, "Open saved palette"),
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
        h("button", { class: "ghost", onclick: () => this.readFromFigmaVariables() }, "Read approx →"),
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
    saveSets(this.sets);
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
        saveSets(this.sets);
        this.openSet(id);
        this.toast("Imported " + name);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  deleteSet(id) {
    this.sets = this.sets.filter((s) => s.id !== id);
    saveSets(this.sets);
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
      this.toastEl || (this.toastEl = h("div", { class: "toast" })),
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
      h(
        "button",
        {
          class: "ghost undo-btn",
          title: "Undo (⌘Z)",
          disabled: this.canUndo() ? null : true,
          onclick: () => this.undo(),
        },
        icon("arrow-counter-clockwise"), "Undo",
      ),
      h(
        "button",
        {
          class: "ghost redo-btn",
          title: "Redo (⇧⌘Z)",
          disabled: this.canRedo() ? null : true,
          onclick: () => this.redo(),
        },
        icon("arrow-clockwise"), "Redo",
      ),
      h("button", { class: "ghost", onclick: () => this.createSet() }, icon("plus"), "New"),
      h(
        "button",
        { class: "primary", title: "Open export drawer", onclick: () => this.toggleDrawer(true) },
        icon("export"), "Export",
      ),
      this.themeBtn(),
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

  themeBtn() {
    return h(
      "button",
      {
        class: "ghost",
        title: "Toggle light / dark (UI only — never exported)",
        "aria-label": "App theme: " + this.theme + " — toggle light / dark",
        "aria-pressed": this.theme === "dark" ? "true" : "false",
        onclick: () => {
          this.theme = this.theme === "light" ? "dark" : "light";
          this.dataset.theme = this.theme;
          // Flip the CHROME too: set color-scheme on :root so every generated
          // light-dark() --c-* token (now driving the chrome) resolves to the new mode.
          setColorScheme(this.theme);
          this.render();
        },
      },
      icon("theme"), this.theme,
    );
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
        h(
          "button",
          {
            class: "preset" + (active(p) ? " on" : ""),
            "aria-pressed": active(p) ? "true" : "false",
            title: `damp ${p.damp} · falloff ${p.dampCurve} · amplify ${p.dampAmp} · bias ${p.dampBias}`,
            onclick: () =>
              this.commit((doc) => {
                doc.damp = p.damp;
                doc.dampCurve = p.dampCurve;
                doc.dampAmp = p.dampAmp;
                doc.dampBias = p.dampBias;
              }),
          },
          p.name,
        ),
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
      d.palettes.push({ name: "Palette " + (d.palettes.length + 1), hue: 200, chroma: 60, skew: -20, lift: 0, on: true });
    });
    this.selectPalette(this.doc.palettes.length - 1);
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
      h(
        "div",
        { class: "segmented canvas-seg", role: "tablist", "aria-label": "Canvas view" },
        ...[["palettes", "Palettes"], ["scrims", "Scrims"], ["mapping", "Mapping"]].map(([id, label]) =>
          h(
            "button",
            {
              class: this.canvasView === id ? "on" : "",
              role: "tab",
              "aria-selected": this.canvasView === id ? "true" : "false",
              title: {
                scrims: "Scrims — the 7 translucent 500 overlays per palette, over a checkerboard",
                mapping: "Semantic Mapping — each role's Light/Dark raw token, as a table",
                palettes: "Palettes — the tonal ramps",
              }[id],
              onclick: () => this.setCanvasView(id),
            },
            label,
          ),
        ),
      ),
      // stops density (Palettes + Scrims ramps): 19 core stops vs the 25 extended set (half-steps).
      this.canvasView !== "mapping"
        ? h(
            "div",
            { class: "segmented canvas-seg", role: "group", "aria-label": "Ramp stops" },
            ...[["core", "Core", "19 stops · 050/100/150/200/…"], ["extended", "All", "25 stops · adds 075/125/175/825/875/925"]].map(([id, label, tip]) =>
              h(
                "button",
                {
                  class: this.stopsMode === id ? "on" : "",
                  "aria-pressed": this.stopsMode === id ? "true" : "false",
                  title: tip,
                  onclick: () => this.setStopsMode(id),
                },
                label,
              ),
            ),
          )
        : false,
      // canvas color-scheme — flips ONLY the canvas content's preview (light/dark),
      // independent of the app-chrome theme toggle in the app-header.
      h(
        "button",
        {
          class: "ghost",
          title: "Canvas color-scheme (preview only — independent of app chrome)",
          "aria-label": "Canvas preview scheme: " + this.canvasTheme + " — toggle light / dark",
          "aria-pressed": this.canvasTheme === "dark" ? "true" : "false",
          onclick: () => {
            this.canvasTheme = this.canvasTheme === "light" ? "dark" : "light";
            this.render();
          },
        },
        icon("theme"), "canvas " + this.canvasTheme,
      ),
      h(
        "button",
        {
          class: "ghost",
          "aria-label": "Fit — reset the canvas view to centre at 100%",
          onclick: () => {
            this.fit();
            this.render();
          },
        },
        icon("crosshair"), "Fit",
      ),
      h("button", { class: "ghost", "aria-label": "Zoom out", onclick: () => this.zoomBy(-1) }, icon("minus")),
      h("span", { class: "zoom-readout", role: "status", "aria-live": "polite", "aria-label": "Zoom level" }, Math.round(this.viewport.zoom * 100) + "%"),
      h("button", { class: "ghost", "aria-label": "Zoom in", onclick: () => this.zoomBy(1) }, icon("plus")),
      h("div", { class: "spacer" }),
      h("button", { class: "ghost add-pal-btn", onclick: () => this.addPalette() }, icon("plus"), "Palette"),
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
    const stop = ramp && ramp.find((s) => s.stop === (this.canvasTheme === "dark" ? 875 : 125));
    if (stop) return stop.hex;
    const L = this.canvasTheme === "dark" ? (this.doc.lmin ?? 5) : (this.doc.lmax ?? 100);
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
    const s = ramp.find((x) => x.stop === (this.canvasTheme === "dark" ? 925 : 75));
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
        class: "canvas-area canvas-scheme-" + this.canvasTheme + (isTable ? " is-table" : ""),
        style: "--canvas-bg:" + this.canvasBg(),
        role: "group",
        "aria-label": isTable ? "Semantic mapping table" : "Palette canvas — drag to pan, wheel to zoom, double-click to reset",
      },
      isTable ? false : h("div", { class: "origin-dot" }),
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
  renderMappingScene(view) {
    const vp = view.palettes[this.selectedIndex()];
    if (!vp) return h("div", { class: "empty-note" }, "Select a palette to see its semantic mapping");
    const n = slug(vp.name);
    const ov = this.doc.roleOverrides || {};
    const ovCount = Object.keys(ov).reduce((a, k) => a + Object.keys(ov[k] || {}).length, 0);
    // raw refs you can re-point a role to: the 25 solid stops + the 7 scrim steps (500-{step}).
    const validRefs = [...vp.fullRamp.map((s) => String(s.stop)), ..."100 175 250 300 400 450 550".split(" ").map((st) => "500-" + st)];
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
          overridden ? h("button", { class: "map-reset", title: "Reset to canonical", onclick: () => this.clearRoleOverride(r.key, mode) }, icon("arrow-counter-clockwise", { size: 13 })) : false,
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
      h(
        "div",
        { class: "map-head" },
        h("b", {}, "Semantic Mapping"),
        h("small", {}, `${vp.name} · ${vp.roles.length} roles${ovCount ? " · " + ovCount + " re-pointed" : ""}`),
        h("div", { class: "spacer" }),
        // drift summary chip (after a live read) — does the file match what I'd generate now?
        drift ? h("span", { class: "map-drift-sum " + (drift.drifted ? "has-drift" : "in-sync") }, drift.drifted ? `${drift.drifted} drifted` : "in sync") : false,
        // read the live raw-colors variables from the file and diff (Figma only).
        this.inFigma ? h("button", { class: "ghost", title: "Read the live raw-colors variables from this file and compare (drift)", onclick: () => this.readLiveVariables() }, icon("arrows-clockwise"), "Read live") : false,
        ovCount ? h("button", { class: "ghost", title: "Revert all re-points to the canonical mapping", onclick: () => this.clearAllOverrides() }, "Reset " + ovCount) : false,
        h(
          "button",
          { class: "ghost", "aria-pressed": this.mapTextMode ? "true" : "false", title: "Switch the raw-token editor between a select menu and a free text input", onclick: () => this.setMapTextMode(!this.mapTextMode) },
          icon("arrows-left-right"), this.mapTextMode ? "text" : "select",
        ),
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
    this._reorderMove = (ev) => this._onReorderMove(ev);
    this._reorderUp = (ev) => this._onReorderUp(ev);
    document.addEventListener("pointermove", this._reorderMove);
    document.addEventListener("pointerup", this._reorderUp);
    document.addEventListener("pointercancel", this._reorderUp);
    this.classList.add("reordering");
  }

  // _onReorderMove — hit-test the row under the pointer, compute insert-before/after
  // by the row midpoint, and paint a single drop indicator on that row.
  _onReorderMove(ev) {
    const st = this._reorder;
    if (!st) return;
    this._reordering = true;
    ev.preventDefault();
    const rects = this._rowRects();
    if (!rects.length) return;
    const y = ev.clientY;
    let target = null;
    for (const r of rects) {
      if (y < r.mid) { target = { pi: r.pi, before: true }; break; }
      target = { pi: r.pi, before: false }; // past the last midpoint -> after last
    }
    if (!target) target = { pi: rects[rects.length - 1].pi, before: false };
    st.dropPi = target.pi;
    st.before = target.before;
    st.moved = true;
    // paint indicator
    for (const r of rects) r.el.classList.remove("drop-before", "drop-after");
    const hit = rects.find((r) => r.pi === target.pi);
    if (hit) hit.el.classList.add(target.before ? "drop-before" : "drop-after");
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
    const ids = ["palette", "global", "roles"];
    const seg = (id, label) =>
      h(
        "button",
        {
          class: this.segment === id ? "on" : "",
          // WAI-ARIA tabs: roving tabindex (only the selected tab is tab-focusable),
          // arrow keys move between tabs, the panel below is the tabpanel.
          role: "tab",
          id: "tab-" + id,
          "aria-controls": "seg-panel",
          "aria-selected": this.segment === id ? "true" : "false",
          tabindex: this.segment === id ? "0" : "-1",
          onclick: () => this.setSegment(id),
          onkeydown: (e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const cur = ids.indexOf(this.segment);
            const next = ids[(cur + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
            this.setSegment(next); // re-render then focus the new tab (preserved by data-fk path)
            const el = this.querySelector("#tab-" + next);
            if (el && el.focus) el.focus();
          },
        },
        label,
      );
    let body;
    if (this.segment === "global") body = this.renderGlobalInspector();
    else if (this.segment === "roles") body = this.renderRolesInspector(view);
    else body = this.renderPaletteInspector(view);
    return h(
      "aside",
      { class: "right-pane" },
      // header row: while OPEN the right toggle hugs the inner (canvas-side) edge, left of
      // the Inspector tabs; once collapsed it is rendered in the canvas-header instead.
      h("div", { class: "pane-head" },
        this.panesRight ? this.paneToggle("right") : false,
        h("div", { class: "segmented", role: "tablist", "aria-label": "Inspector" }, seg("palette", "Palette"), seg("global", "Global"), seg("roles", "Roles"))),
      h("div", { class: "seg-body", "data-scroll": "seg-body", role: "tabpanel", id: "seg-panel", "aria-labelledby": "tab-" + this.segment }, body),
      // Pinned below the panel on EVERY tab: a live component preview wired to the
      // selected palette's roles (surface / onSurface / onSurfaceVariant + primary).
      h("div", { class: "seg-example" }, this.exampleCard(view)),
    );
  }

  // exampleCard — a tiny real component (a surface with text + a primary button)
  // painted from the SELECTED palette's semantic roles, in the canvas light/dark
  // ref. It demonstrates the roles in situ; it has no inputs, so liveRefresh can
  // re-render it as controls drag without disturbing the panel above.
  exampleCard(view) {
    const p = view.palettes[this.selectedIndex()];
    const roles = p?.roles || [];
    const dark = this.canvasTheme === "dark";
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
    const cr = view.contrast.find((c) => c.palette === p.name);

    return h(
      "div",
      {},
      h("h3", { class: "insp-title" }, h("span", { class: "swatch-dot", style: `background:${(vp.ramp.find((s) => s.stop === 550) || vp.ramp[9]).hex};width:16px;height:16px` }), "Palette"),
      h("div", { class: "insp-sub" }, "Tune hue · chroma · skew · lift — live"),
      // In the Scrims view, surface the sub-variant relationship at the top of the inspector.
      this.canvasView === "scrims" ? this.scrimContext(view) : false,
      h(
        "div",
        { class: "field" },
        h("label", {}, "Name"),
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
        h(
          "div",
          {
            class: "toggle" + (p.on !== false ? " on" : ""),
            onclick: () => this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false))),
          },
          h("span", { class: "track" }),
          h("span", {}, p.on !== false ? "Enabled" : "Disabled"),
        ),
      ),
      this.slider("Hue", p.hue, 0, 360, 1, (v) => fmt(v) + "°", (v) => this.editDrag((d) => (d.palettes[i].hue = v))),
      this.slider("Chroma", p.chroma, 0, 100, 1, (v) => fmt(v) + "%", (v) => this.editDrag((d) => (d.palettes[i].chroma = v))),
      this.slider("Skew", p.skew, -100, 100, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].skew = v))),
      this.slider("Lift", p.lift, -40, 40, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].lift = v))),
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
      cr ? this.renderContrast(cr) : null,
      h(
        "div",
        { class: "insp-actions" },
        h("button", { class: "ghost", onclick: () => this.duplicatePalette(i) }, icon("copy"), "Duplicate"),
        h("button", { class: "ghost danger", onclick: () => this.deletePalette(i) }, icon("trash"), "Delete"),
      ),
    );
  }

  renderContrast(cr) {
    const row = (label, ratio) => {
      const pass = ratio >= 4.5;
      return h(
        "div",
        { class: "cr" },
        h("span", {}, label),
        h("b", { class: pass ? "pass" : "fail" }, ratio.toFixed(2) + ":1 ", icon(pass ? "check" : "warning", { size: 12 })),
      );
    };
    return h(
      "div",
      { class: "field" },
      h("label", {}, "Contrast (prime fill 550)"),
      h("div", { class: "contrast-box" }, row("on-color (50)", cr.onFill), row("vs white", cr.onWhite), row("vs black", cr.onBlack)),
    );
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
      {},
      h("h3", { class: "insp-title" }, icon("gear"), "Global controls"),
      h("div", { class: "insp-sub" }, "Tone curve shared by every palette"),
      h(
        "div",
        { class: "field" },
        h("label", {}, "Curve"),
        h(
          "select",
          { onchange: (e) => this.commit((doc) => (doc.curve = e.target.value)) },
          ...CURVES.map((c) => h("option", { value: c, selected: d.curve === c }, c)),
        ),
      ),
      this.slider("Tension", d.tension, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.tension = v))),
      this.slider("L* min", d.lmin, 0, 40, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.lmin = v))),
      this.slider("L* max", d.lmax, 60, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.lmax = v))),
      this.slider("Damp", d.damp, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.damp = v))),
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
      h(
        "div",
        { class: "field" },
        h("label", {}, "Hue space"),
        h(
          "div",
          {
            class: "toggle" + (d.hueSpace === "oklch" ? " on" : ""),
            onclick: () => this.commit((doc) => (doc.hueSpace = doc.hueSpace === "oklch" ? "cam16" : "oklch")),
          },
          h("span", { class: "track" }),
          h("span", {}, d.hueSpace),
        ),
      ),
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
                  h("span", { class: "sw", title: "light ref " + r.lightHex, style: `background:${r.lightHex}` }),
                  h("span", { class: "sw", title: "dark ref " + r.darkHex, style: `background:${r.darkHex}` }),
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
    this.render();
  }

  renderDrawer(view) {
    const tabs = [
      ["css", "CSS"],
      ["oklch", "OKLCH"],
      ["json", "JSON"],
      ["dtcg", "DTCG"],
      ["figma", "Figma"],
      ["ui3", "UI3"],
      ["config", "Config"],
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

    return h(
      "div",
      {},
      h("div", { class: "drawer-scrim" + (this.exportOpen ? " open" : ""), onclick: () => this.toggleDrawer(false) }),
      h(
        "div",
        { class: "drawer" + (this.exportOpen ? " open" : "") },
        h(
          "div",
          { class: "drawer-head" },
          h("h3", {}, icon("export"), "Export"),
          h("div", { class: "spacer" }),
          h("button", { class: "ghost", onclick: () => this.toggleDrawer(false) }, icon("x")),
        ),
        h(
          "div",
          { class: "drawer-tabs" },
          ...tabs.map(([id, label]) =>
            h(
              "button",
              {
                class: this.exportTab === id ? "on" : "",
                onclick: () => {
                  this.exportTab = id;
                  this.render();
                },
              },
              label,
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
                h(
                  "div",
                  { class: "figma-files" },
                  ...FIGMA.map(([id, label]) =>
                    h(
                      "button",
                      {
                        class: this.figmaFile === id ? "on" : "",
                        onclick: () => {
                          this.figmaFile = id;
                          this.render();
                        },
                      },
                      label,
                    ),
                  ),
                ),
                h(
                  "button",
                  {
                    class: "ghost figma-plugin-btn",
                    title: "Download the HCT Semantic Binder plugin (manifest.json + code.js). In Figma: Plugins → Development → Import plugin from manifest — it aliases each semantic role to its raw variable so editing a raw color cascades.",
                    onclick: () => this.downloadFigmaPlugin(),
                  },
                  icon("download"), "Binder plugin",
                ),
              ),
            )
          : false,
        // Config sub-bar: the project source-of-truth actions live ABOVE the code, not in the footer.
        isConfig
          ? h(
              "div",
              { class: "config-bar" },
              h("button", { class: "ghost", title: this.inFigma ? "Save this config into this Figma file (travels with the file)" : "Save this config to the project (localStorage)", onclick: () => this.saveToProject() }, icon("upload"), "Save to project"),
              h("button", { class: "ghost", title: this.inFigma ? "Load the config saved in this Figma file" : "Load the config saved to the project", onclick: () => this.loadFromProject() }, icon("download"), "Load from project"),
              h("span", { class: "config-note" }, this.inFigma ? "Source of truth: this Figma file (travels with the file)" : "Source of truth: your browser (localStorage)"),
            )
          : false,
        // The code block carries its OWN floating copy affordance (top-right), so the footer stays a
        // single download action instead of a row of competing buttons.
        h(
          "div",
          { class: "drawer-code" },
          h("button", { class: "copy-float", title: "Copy to clipboard", "aria-label": "Copy", onclick: () => this.copy(code) }, icon("copy"), "Copy"),
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
              ? h(
                  "button",
                  {
                    class: "primary figma-apply",
                    title: "Create/update the raw-colors + Light/Dark variable collections directly in this Figma file",
                    onclick: () => this.applyToFigma(),
                  },
                  icon("flag"), "Apply Variables",
                )
              : false,
            // ONE download action — every format in its own folder + the config, as a single .zip.
            h("button", { class: "primary", title: "Download every format (css-hex, css-oklch, json, dtcg, figma, ui3) in its own folder + the config, as one .zip", onclick: () => this.downloadAllZip(view) }, icon("download"), "Download All"),
          ),
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
      { name: `hct-${s}-config.json`, data: JSON.stringify(serialize(this.doc), null, 2) },
    ];
    const bytes = zipStore(files);
    this.downloadBytes(bytes, `hct-${s}-export.zip`, "application/zip");
  }

  // downloadBytes — trigger a browser download of raw bytes (the binary sibling of download()).
  downloadBytes(bytes, filename, type) {
    try {
      const blob = new Blob([bytes], { type: type || "application/octet-stream" });
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
  applyToFigma() {
    try {
      // Send the variables AND the exact params together — code.js embeds the config in the file
      // (root pluginData) so a later read reproduces this state losslessly, not approximately.
      parent.postMessage({ pluginMessage: { type: "apply", dtcg: this.figmaBundle(), config: serialize(this.doc) } }, "*");
      this.toast("Sent to Figma — check the Variables panel");
    } catch {
      /* not in a frame / blocked — nothing to apply to */
    }
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
    saveSets(this.sets);
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

  download(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.setAttribute("download", filename);
    a.rel = "noopener";
    a.style.display = "none";
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    this.toast("Downloaded " + filename);
  }

  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove("show"), 1800);
  }
}

customElements.define("hct-app", HctApp);

// expose a couple of pure helpers for any console poking / future tests.
export { HctApp, contrastRatio };
