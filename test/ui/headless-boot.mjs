#!/usr/bin/env node
// headless-boot.mjs — TEMPORARY self-verification harness (Phase-3 interaction polish).
// A minimal DOM/window/localStorage shim so the real app.js web component boots in
// Node, then drives the new interactions: undo/redo, slider-drag coalescing,
// keyboard nav, handle-drag reorder, and zoom clamps. Exit 0=pass / 1=fail.
//
// NOT part of the build or verify.mjs — run ad hoc and removed after.

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ── tiny DOM shim ───────────────────────────────────────────────────────────────
let raf = [];
class CSSStyleDeclaration { constructor() { this._p = {}; } setProperty(k, v) { this._p[k] = String(v); } getPropertyValue(k) { return this._p[k] || ""; } }
class ClassList {
  constructor() { this._s = new Set(); }
  add(...c) { c.forEach((x) => this._s.add(x)); }
  remove(...c) { c.forEach((x) => this._s.delete(x)); }
  contains(c) { return this._s.has(c); }
  toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; }
  get value() { return [...this._s].join(" "); }
}
class Node { get nodeType() { return 1; } }
class El extends Node {
  constructor(tag) {
    super();
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.dataset = {};
    this.style = new CSSStyleDeclaration();
    this.classList = new ClassList();
    this._listeners = {};
    this._text = "";
    this.type = "";
    this.value = "";
    this.isContentEditable = false;
    this.disabled = false;
    this.offsetWidth = 0;  // layout size (transform-independent); tests set it explicitly
    this.offsetHeight = 0;
    this.selectionStart = null; // text-caret shim (for focus/caret-preservation test)
    this.selectionEnd = null;
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }
  get className() { return this.classList.value; }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ""; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith("data-")) this.dataset[k.slice(5)] = String(v); if (k === "disabled") this.disabled = true; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === "disabled") this.disabled = false; }
  append(...kids) { for (const k of kids) { const n = typeof k === "object" ? k : doc.createTextNode(String(k)); n.parentNode = this; this.children.push(n); } }
  appendChild(k) { this.append(k); return k; }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { if (this._listeners[t]) this._listeners[t] = this._listeners[t].filter((f) => f !== fn); }
  dispatch(t, ev = {}) {
    ev.type = t; ev.target = ev.target || this; ev.currentTarget = this;
    ev.preventDefault = ev.preventDefault || (() => {}); ev.stopPropagation = ev.stopPropagation || (() => {});
    for (const fn of this._listeners[t] || []) fn(ev);
  }
  setPointerCapture() {} releasePointerCapture() {}
  getBoundingClientRect() { return this._rect || { top: 0, bottom: 0, left: 0, right: 0, width: 200, height: 40 }; }
  // walk the subtree, collect matches for a few selector shapes we use
  _all(pred, out) { for (const c of this.children) { if (c instanceof El) { if (pred(c)) out.push(c); c._all(pred, out); } } return out; }
  querySelectorAll(sel) {
    if (sel === ".ramp-row[data-pi]") return this._all((e) => e.classList.contains("ramp-row") && "pi" in e.dataset, []);
    if (sel.startsWith(".")) { const c = sel.slice(1); return this._all((e) => e.classList.contains(c), []); }
    return this._all(() => false, []);
  }
  querySelector(sel) {
    // support compound ".a .b" by last-token class match within subtree
    const parts = sel.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    const cls = last.startsWith(".") ? last.slice(1) : null;
    if (!cls) return null;
    const found = this._all((e) => e.classList.contains(cls), []);
    return found[0] || null;
  }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  select() {}
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; }
  click() { this.dispatch("click", {}); }
  focus() { doc.activeElement = this; }
}

const docListeners = {};
const doc = {
  activeElement: null,
  documentElement: new El("html"),
  head: new El("head"),
  body: new El("body"),
  createElement: (t) => new El(t),
  createTextNode: (s) => { const n = new Node(); n._text = String(s); n.textContent = String(s); return n; },
  getElementById: () => null,
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  removeEventListener: (t, fn) => { if (docListeners[t]) docListeners[t] = docListeners[t].filter((f) => f !== fn); },
  dispatch: (t, ev = {}) => { ev.type = t; ev.preventDefault = ev.preventDefault || (() => {}); ev.stopPropagation = ev.stopPropagation || (() => {}); for (const fn of docListeners[t] || []) fn(ev); },
};
doc.documentElement.style = new CSSStyleDeclaration();

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let elementStack = [];
globalThis.document = doc;
globalThis.window = { document: doc };
globalThis.localStorage = localStorage;
globalThis.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
try { globalThis.navigator = { clipboard: null }; } catch { /* navigator is read-only in modern node; copy() is untested here */ }
globalThis.Blob = class { constructor(p) { this.size = (p && p[0] ? String(p[0]).length : 0); } };
globalThis.URL = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };
globalThis.setTimeout = globalThis.setTimeout; // keep real timers
const customElements = { _reg: {}, define(n, c) { this._reg[n] = c; }, get(n) { return this._reg[n]; } };
globalThis.customElements = customElements;
globalThis.HTMLElement = El;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });

// ── boot ─────────────────────────────────────────────────────────────────────────
await import("../../src/ui/app.js");
const App = customElements.get("hct-app");
ok(!!App, "custom element hct-app defined");

const app = new App();
app.classList = new ClassList();
app.dataset = {};
app.style = new CSSStyleDeclaration();
app._children = [];
// HctApp extends El (our HTMLElement), so connectedCallback + replaceChildren work.
app.connectedCallback();
const flushRaf = () => { const q = raf; raf = []; q.forEach((fn) => fn()); };

// open the first (seeded "Default") set
ok(app.sets && app.sets.length >= 1, "gallery seeded a default set");
app.openSet(app.sets[0].id);
flushRaf();
ok(app.view === "editor", "openSet entered editor view");
ok(app.doc && app.doc.palettes.length === 8, "doc has 8 palettes");

// ── (a) undo/redo + slider drag = ONE step ────────────────────────────────────────
const hue0 = app.doc.palettes[0].hue;
app.commit((d) => (d.palettes[0].hue = (hue0 + 40) % 360));
ok(app.doc.palettes[0].hue === (hue0 + 40) % 360, "committed hue change applied");
ok(app.canUndo(), "undo available after a commit");
app.undo();
ok(app.doc.palettes[0].hue === hue0, "undo restored hue");
ok(app.canRedo(), "redo available after undo");
app.redo();
ok(app.doc.palettes[0].hue === (hue0 + 40) % 360, "redo re-applied hue");
// reset to a clean stack for the drag test
app.undo();
ok(!app.canRedo() || app.doc.palettes[0].hue === hue0, "back to base hue");

// simulate a slider DRAG: many oninput, then a 'change' (release)
const histBefore = app.history.length;
const chroma0 = app.doc.palettes[0].chroma;
for (let v = chroma0; v <= chroma0 + 10 && v <= 100; v++) app.editDrag((d) => (d.palettes[0].chroma = v));
app.commitDrag(); // pointer release
const dragSteps = app.history.length - histBefore;
ok(dragSteps === 1, `a slider drag is ONE undo step (got ${dragSteps})`);
const draggedTo = app.doc.palettes[0].chroma;
app.undo();
ok(app.doc.palettes[0].chroma === chroma0, "one undo reverts the WHOLE drag");
app.redo();
ok(app.doc.palettes[0].chroma === draggedTo, "redo re-applies the whole drag");

// editing after undo truncates redo
app.undo(); // back to chroma0
app.commit((d) => (d.palettes[1].lift = (d.palettes[1].lift || 0) + 1));
ok(!app.canRedo(), "editing after undo truncated the redo branch");

// ── (b) keyboard nav ───────────────────────────────────────────────────────────────
app.selectPalette(0);
const fireKey = (key, opt = {}) => doc.dispatch("keydown", { key, target: doc.body, ...opt });
fireKey("ArrowDown");
ok(app.selectedIndex() === 1, "ArrowDown selects next palette");
fireKey("ArrowUp");
ok(app.selectedIndex() === 0, "ArrowUp selects prev palette");
fireKey("ArrowUp"); // wrap to last
ok(app.selectedIndex() === app.doc.palettes.length - 1, "ArrowUp wraps to last");
fireKey("2");
ok(app.segment === "global", "key '2' -> Global segment");
fireKey("3");
ok(app.segment === "roles", "key '3' -> Roles segment");
fireKey("1");
ok(app.segment === "palette", "key '1' -> Palette segment");
app.toggleDrawer(true);
ok(app.exportOpen, "drawer opened");
fireKey("Escape");
ok(!app.exportOpen, "Esc closes the open drawer");
// Esc again (no drawer) deselects
app.selectPalette(2);
fireKey("Escape");
ok(app.sel.kind === "none", "Esc with no drawer deselects");

// (e) typing in an input must NOT trigger shortcuts
app.selectPalette(0);
const segBefore = app.segment;
const fakeInput = new El("input"); fakeInput.type = "text";
doc.dispatch("keydown", { key: "2", target: fakeInput });
ok(app.segment === segBefore, "key '2' in a text input does NOT switch segment");
doc.dispatch("keydown", { key: "ArrowDown", target: fakeInput });
ok(app.selectedIndex() === 0, "ArrowDown in a text input does NOT move selection");
// but undo/redo DO work from inside an input (standard editor behavior)
app.commit((d) => (d.palettes[0].lift = (d.palettes[0].lift || 0) + 1));
const liftAfter = app.doc.palettes[0].lift;
const histLen = app.history.length;
doc.dispatch("keydown", { key: "z", target: fakeInput, metaKey: true });
ok(app.history.length === histLen - 1, "Cmd+Z from an input consumed an undo step");
ok(app.doc.palettes[0].lift === liftAfter - 1, "Cmd+Z from an input actually undid the edit");

// ── (c) handle-drag reorder ─────────────────────────────────────────────────────────
app.openSet(app.sets[0].id); // fresh doc, clean history
flushRaf();
app.selectPalette(0); // select palettes[0] ("Neutral")
const name0 = app.doc.palettes[0].name;
const name1 = app.doc.palettes[1].name;
const selName = app.doc.palettes[app.selectedIndex()].name;
const histR = app.history.length;
// wire the stack rects so hit-testing maps pointer-y to a target row
const stack = app._rampStack;
const rows = stack.querySelectorAll(".ramp-row[data-pi]");
rows.forEach((r, idx) => { r._rect = { top: idx * 50, bottom: idx * 50 + 50, left: 0, right: 200, width: 200, height: 50 }; });
// begin reorder on palettes[0]'s handle
const handle0 = rows[0].querySelector(".drag-handle");
ok(!!handle0, "row 0 has a drag handle");
app._beginReorder({ currentTarget: handle0, pointerId: 1, stopPropagation() {}, preventDefault() {} }, 0);
// move pointer down past row[1]'s midpoint -> drop after row 1
app._onReorderMove({ clientY: rows[1]._rect.bottom - 5, preventDefault() {} });
app._onReorderUp();
ok(app.doc.palettes[0].name === name1 && app.doc.palettes[1].name === name0, `reorder swapped [0]<->[1] (now ${app.doc.palettes[0].name}, ${app.doc.palettes[1].name})`);
ok(app.history.length - histR === 1, `reorder is ONE undo step (got ${app.history.length - histR})`);
ok(app.doc.palettes[app.selectedIndex()].name === selName, "selection stayed on the same palette after reorder");
app.undo();
ok(app.doc.palettes[0].name === name0 && app.doc.palettes[1].name === name1, "undo reverts the reorder");

// reverse-direction reorder: drag a lower row UP above row 0
flushRaf();
const rows2 = app._rampStack.querySelectorAll(".ramp-row[data-pi]");
rows2.forEach((r, idx) => { r._rect = { top: idx * 50, bottom: idx * 50 + 50, left: 0, right: 200, width: 200, height: 50 }; });
const nm2 = app.doc.palettes[2].name;
const handle2 = rows2[2].querySelector(".drag-handle");
app._beginReorder({ currentTarget: handle2, pointerId: 2, stopPropagation() {}, preventDefault() {} }, 2);
app._onReorderMove({ clientY: rows2[0]._rect.top + 5, preventDefault() {} }); // above row 0 midpoint
app._onReorderUp();
ok(app.doc.palettes[0].name === nm2, `drag-up moved palette to index 0 (now ${app.doc.palettes[0].name})`);
app.undo();
ok(app.doc.palettes[2].name === nm2, "undo reverts the drag-up reorder");

// ── (d) zoom clamps + Fit recenters ──────────────────────────────────────────────────
for (let i = 0; i < 50; i++) app.zoomBy(-1);
ok(app.viewport.zoom === 0.25, `zoom clamps at 0.25 (got ${app.viewport.zoom})`);
for (let i = 0; i < 50; i++) app.zoomBy(1);
ok(app.viewport.zoom === 4, `zoom clamps at 4 (got ${app.viewport.zoom})`);
app.viewport.panX = 999; app.viewport.panY = -500;
fireKey("f");
ok(app.viewport.panX === 0 && app.viewport.panY === 0 && app.viewport.zoom === 1, "Fit recenters to (0,0) at zoom 1");
// keyboard +/- also clamp
app.fit();
for (let i = 0; i < 50; i++) fireKey("+");
ok(app.viewport.zoom === 4, "key '+' clamps at 4");
for (let i = 0; i < 50; i++) fireKey("-");
ok(app.viewport.zoom === 0.25, "key '-' clamps at 0.25");

// ── (f) live drag does NOT replace the active control (the click-and-drag fix) ───────
// Each slider oninput used to trigger a FULL render() that replaced the very
// <input type=range> being dragged — killing the native pointer drag. The fix
// routes drags through a PARTIAL liveRefresh that leaves the right pane (and the
// dragged input) untouched while updating the canvas scene + analysis rail.

// tree-walk helpers over the shim's plain `children` arrays.
const walk = (node, pred, out = []) => {
  if (!node || !node.children) return out;
  for (const c of node.children) {
    if (c instanceof El) { if (pred(c)) out.push(c); walk(c, pred, out); }
  }
  return out;
};
const findIn = (root, pred) => walk(root, pred)[0] || null;
const isRange = (e) => e.tagName === "INPUT" && (e.attrs.type === "range" || e.getAttribute("type") === "range");
const isText = (e) => e.tagName === "INPUT" && (e.attrs.type === "text" || e.getAttribute("type") === "text");

app.openSet(app.sets[0].id); // fresh doc + clean stacks
flushRaf();
app.setSegment("palette");
app.selectPalette(0);
app.render();
flushRaf();

const rightPane = findIn(app, (e) => e.classList.contains("right-pane"));
ok(!!rightPane, "right pane present");
const sceneEl0 = app.querySelector(".canvas-scene");
ok(!!sceneEl0, "canvas-scene present");
sceneEl0.style.transform = "translate(-50%, -50%) translate(7px, 9px) scale(1.5)"; // a pan/zoom transform

// the FIRST range input in the Palette inspector is Hue.
const hueInput0 = findIn(rightPane, isRange);
ok(!!hueInput0, "found a hue <input type=range> in the Palette inspector");
// its sibling <b> readout (the fmtFn label) — first <b> in the same .field.
const hueField = findIn(rightPane, (e) => e.classList.contains("field") && findIn(e, isRange) === hueInput0);
const hueLabelB0 = hueField ? findIn(hueField, (e) => e.tagName === "B") : null;
ok(!!hueLabelB0, "hue slider has a <b> value readout");

const sel = app.selectedIndex();
const hueStart = app.doc.palettes[sel].hue;
let sameNode = true;
let lastV = hueStart;
for (let k = 1; k <= 6; k++) {
  const v = (hueStart + k * 5) % 360;
  hueInput0.value = String(v);
  hueInput0.dispatch("input", {}); // target defaults to the input itself
  // (a) the SAME <input> instance survives every input (NOT replaced).
  const cur = findIn(app.querySelector(".right-pane"), isRange);
  if (cur !== hueInput0) sameNode = false;
  lastV = v;
}
ok(sameNode, "(a) the hue <input> is the SAME node after every input event (not replaced)");
// (b) the doc's hue followed the drag.
ok(app.doc.palettes[sel].hue === lastV, `(b) doc.palettes[${sel}].hue updated to the dragged value (${app.doc.palettes[sel].hue})`);
// (c) .canvas-scene is the SAME element (transform preserved) but its rows reflect the new color.
const sceneEl1 = app.querySelector(".canvas-scene");
ok(sceneEl1 === sceneEl0, "(c) .canvas-scene is the SAME element across the drag (pan/zoom transform preserved)");
ok(sceneEl1.style.transform === "translate(-50%, -50%) translate(7px, 9px) scale(1.5)", "(c) the scene transform survived the live drag");
const rowSwatchHexes = walk(sceneEl1, (e) => e.tagName === "I" && /background:/.test(e.attrs.style || "")).map((e) => e.attrs.style);
ok(rowSwatchHexes.length > 0, "(c) canvas scene rows re-rendered with swatch fills (reflect new color)");
// (e) the value label <b> updated live (tracks the thumb).
ok(hueLabelB0.textContent.includes(String(lastV)), `(e) the hue <b> readout updated live to "${hueLabelB0.textContent}"`);

// (d) a single 'change' (pointer release) commits EXACTLY ONE undo step.
const histPre = app.history.length;
hueInput0.dispatch("change", {});
ok(app.history.length - histPre === 1, `(d) one 'change' commits exactly ONE undo step (got ${app.history.length - histPre})`);
app.undo();
ok(app.doc.palettes[sel].hue === hueStart, "(d) that one undo reverts the WHOLE hue drag");

// ── (g) same for a GLOBAL slider (Tension) ───────────────────────────────────────────
app.setSegment("global");
app.render();
flushRaf();
const sceneG0 = app.querySelector(".canvas-scene");
const gPane = app.querySelector(".right-pane");
const tensionInput = findIn(gPane, isRange); // first global slider = Tension
ok(!!tensionInput, "found a global slider <input type=range>");
const tStart = app.doc.tension;
const tHistPre = app.history.length;
let gSame = true;
for (let v = tStart + 1; v <= tStart + 6 && v <= 100; v++) {
  tensionInput.value = String(v);
  tensionInput.dispatch("input", {});
  if (findIn(app.querySelector(".right-pane"), isRange) !== tensionInput) gSame = false;
}
ok(gSame, "(g) the global slider <input> is the SAME node throughout the drag");
ok(app.doc.tension !== tStart, `(g) doc.tension updated during the drag (${app.doc.tension})`);
ok(app.querySelector(".canvas-scene") === sceneG0, "(g) .canvas-scene element preserved during the global drag");
tensionInput.dispatch("change", {});
ok(app.history.length - tHistPre === 1, `(g) the global drag is ONE undo step (got ${app.history.length - tHistPre})`);

// ── (h) palette-NAME input: typing must NOT replace the input (focus/caret survive) ──
app.setSegment("palette");
app.selectPalette(0);
app.render();
flushRaf();
const nPane = app.querySelector(".right-pane");
const nameInput0 = findIn(nPane, isText); // first text input in the inspector = Name
ok(!!nameInput0, "found the palette-name <input type=text>");
nameInput0.focus();
ok(doc.activeElement === nameInput0, "name input has focus before typing");
const typed = "Azur";
let nameSame = true;
for (let k = 1; k <= typed.length; k++) {
  nameInput0.value = typed.slice(0, k);
  nameInput0.dispatch("input", {});
  const cur = findIn(app.querySelector(".right-pane"), isText);
  if (cur !== nameInput0) nameSame = false;
}
ok(nameSame, "(h) the palette-name <input> is the SAME node while typing (not replaced)");
ok(doc.activeElement === nameInput0, "(h) focus stays on the name input through typing (caret preserved)");
ok(app.doc.palettes[0].name === typed, `(h) doc palette name updated live to "${app.doc.palettes[0].name}"`);
const nHistPre = app.history.length;
nameInput0.dispatch("change", {});
ok(app.history.length - nHistPre === 1, `(h) the whole rename is ONE undo step (got ${app.history.length - nHistPre})`);

// ── (i) NON-drag edits + UI still do a FULL render (regression guard) ─────────────────
app.openSet(app.sets[0].id);
flushRaf();
const palCount0 = app.doc.palettes.length;
app.addPalette(); // commit() path → full render
ok(app.doc.palettes.length === palCount0 + 1, "add palette (full-render path) still works");
app.setSegment("roles");
ok(app.segment === "roles" && !!app.querySelector(".roles-table"), "segmented control still switches panels (full render)");
app.setSegment("palette");

// ── (j) canvas backdrop tracks the GLOBAL tonal range + the canvas ◐ ──────────────────
const { hctToRgb: _hct } = await import("../../src/ui/model.mjs");
const grayAt = (L) => { const v = _hct(0, 0, L).rgb[0]; const hx = v.toString(16).padStart(2, "0").toUpperCase(); return "#" + hx + hx + hx; };
const bgAttr = () => (app.querySelector(".canvas-area").getAttribute("style") || "");
// light preview sits at the LIGHT end (lmax); a full render writes --canvas-bg inline.
app.canvasTheme = "light"; app.doc.lmax = 100; app.render(); flushRaf();
ok(app.canvasBg() === grayAt(100), `(j1) light canvas bg = gray(lmax) (got ${app.canvasBg()})`);
ok(bgAttr().includes(grayAt(100)), "(j2) rendered .canvas-area carries inline --canvas-bg = gray(lmax)");
// lowering lmax pulls the light backdrop off pure white — it FOLLOWS the control.
app.doc.lmax = 90; app.render(); flushRaf();
ok(app.canvasBg() === grayAt(90) && grayAt(90) !== "#FFFFFF", `(j3) backdrop follows lmax down off white (got ${app.canvasBg()})`);
// dark preview sits at the DARK end (lmin), independent of app chrome.
app.canvasTheme = "dark"; app.doc.lmin = 5; app.render(); flushRaf();
ok(app.canvasBg() === grayAt(5), `(j4) dark canvas bg = gray(lmin) (got ${app.canvasBg()})`);
// a LIVE drag of lmin repaints the backdrop via liveRefresh, no full render.
app.doc.lmin = 20; app.liveRefresh(); flushRaf(); // liveRefresh now defers the repaint to the frame
ok(app.querySelector(".canvas-area").style.getPropertyValue("--canvas-bg") === grayAt(20), `(j5) liveRefresh repaints --canvas-bg from lmin (got ${app.querySelector(".canvas-area").style.getPropertyValue("--canvas-bg")})`);

// ── (k) live example card present on ALL 3 tabs, painted from selected roles ──────────
const { projectView: _pv } = await import("../../src/ui/model.mjs");
const styleOf = (el) => (el ? el.getAttribute("style") || "" : "");
const surfaceOf = (pal, d) => { const r = pal.roles.find((x) => x.key === "surface"); return d ? r.darkHex : r.lightHex; };
app.canvasTheme = "light"; app.render(); flushRaf();
for (const seg of ["palette", "global", "roles"]) {
  app.setSegment(seg); flushRaf();
  ok(!!app.querySelector(".seg-example") && !!app.querySelector(".example-card"), `(k1:${seg}) example card present on the ${seg} tab`);
  ok(app.querySelectorAll(".example-card").length === 1, `(k1b:${seg}) exactly ONE card (no top+bottom duplicate) on the ${seg} tab`);
}
ok(app.querySelectorAll(".sem-mini").length === 0, "(k1c) the old top-of-Roles preview (.sem-mini) is gone");
const kp = _pv(app.doc).palettes[app.selectedIndex()];
const kMain = kp.roles.find((r) => r.suffix === "").lightHex;
ok(styleOf(app.querySelector(".example-card")).includes(surfaceOf(kp, false)), `(k2) card surface = palette surface role (${surfaceOf(kp, false)})`);
ok(styleOf(app.querySelector(".ex-btn")).includes(kMain), `(k3) primary button = palette main role (${kMain})`);
// flipping the canvas ◐ swaps the card to the dark refs (different from light).
app.canvasTheme = "dark"; app.render(); flushRaf();
ok(styleOf(app.querySelector(".example-card")).includes(surfaceOf(kp, true)) && surfaceOf(kp, true) !== surfaceOf(kp, false), `(k4) canvas ◐ flips the card to the dark ref (${surfaceOf(kp, true)})`);
// a live control drag repaints the card with new role colors, no full render.
app.canvasTheme = "light"; app.render(); flushRaf();
app.doc.palettes[app.selectedIndex()].chroma = 8; app.liveRefresh(); flushRaf();
const kSurface3 = surfaceOf(_pv(app.doc).palettes[app.selectedIndex()], false);
ok(styleOf(app.querySelector(".example-card")).includes(kSurface3), `(k5) liveRefresh repaints the card from new role colors (${kSurface3})`);

// ── (l) wheel/zoom keeps the content point UNDER THE CURSOR fixed ──────────────────────
const sceneEl = app.querySelector(".canvas-scene");
sceneEl.offsetWidth = 400; sceneEl.offsetHeight = 300;
app.viewport = { panX: 0, panY: 0, zoom: 1 };
// app transform is translate(-50%,-50%) translate(pan) scale(zoom): a screen offset s
// from centre maps to scene point p = (s - pan + offset/2) / zoom.
const scenePt = (sx, sy) => ({
  x: (sx - app.viewport.panX + sceneEl.offsetWidth / 2) / app.viewport.zoom,
  y: (sy - app.viewport.panY + sceneEl.offsetHeight / 2) / app.viewport.zoom,
});
const cur = { x: 70, y: -40 }; // an OFF-centre cursor
const before = scenePt(cur.x, cur.y);
app.zoomAround(2.2, cur.x, cur.y);
const after = scenePt(cur.x, cur.y);
ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6, `(l1) point under cursor fixed across zoom (Δ ${(after.x - before.x).toFixed(3)},${(after.y - before.y).toFixed(3)})`);
ok(app.viewport.panX !== 0 && app.viewport.zoom === 2.2, `(l2) off-centre zoom pans toward the cursor (panX=${app.viewport.panX.toFixed(1)})`);
// the +/- buttons zoom about the viewport CENTRE (cursor 0,0): the centre stays put.
app.viewport = { panX: 0, panY: 0, zoom: 1 };
const cBefore = scenePt(0, 0);
app.zoomBy(1);
const cAfter = scenePt(0, 0);
ok(Math.abs(cBefore.x - cAfter.x) < 1e-6 && Math.abs(cBefore.y - cAfter.y) < 1e-6, `(l3) +/- buttons keep the viewport centre fixed`);

// ── (m) full render() preserves focus + caret (durable replaceChildren hardening) ─────
const findFk = (fk) => { const w = (n) => { for (const c of n.children || []) { if (c.dataset && c.dataset.fk === fk) return c; const f = w(c); if (f) return f; } return null; }; return w(app); };
app.openSet(app.sets[0].id); flushRaf(); app.setSegment("palette"); flushRaf();
const nameI = findFk("pname");
ok(!!nameI, "(m0) palette name input carries a data-fk");
nameI.focus(); nameI.selectionStart = 2; nameI.selectionEnd = 2;
ok(document.activeElement === nameI, "(m0b) name input focused before render");
app.render(); // a FULL render — replaceChildren rebuilds the whole subtree
const nameI2 = findFk("pname");
ok(nameI2 && nameI2 !== nameI, "(m1) render rebuilt the name input (a genuinely new node)");
ok(document.activeElement === nameI2, "(m2) focus restored to the rebuilt input");
ok(nameI2.selectionStart === 2 && nameI2.selectionEnd === 2, `(m3) caret position restored (got ${nameI2.selectionStart})`);
// a focused slider survives a full render too (keyed by its label).
app.setSegment("global"); flushRaf();
const sl = findFk("slider:Tension") || findFk("slider:Damp");
ok(!!sl, "(m4) global sliders carry a data-fk");
sl.focus(); app.render();
ok(document.activeElement === findFk(sl.dataset.fk), "(m5) focus restored to the rebuilt slider");

// ── (n) double-click resets the canvas view to origin @ 100% ──────────────────────────
app.viewport = { panX: 120, panY: -80, zoom: 2.5 };
app.querySelector(".canvas-area").dispatch("dblclick", {});
ok(app.viewport.panX === 0 && app.viewport.panY === 0 && app.viewport.zoom === 1, `(n) double-click resets the view (got ${JSON.stringify(app.viewport)})`);

// ── (o) accessibility: roles, aria-labels, keyboard-operable controls ─────────────────
const walkOne = (pred) => { const w = (n) => { for (const c of n.children || []) { if (c.getAttribute && pred(c)) return c; const f = w(c); if (f) return f; } return null; }; return w(app); };
app.openSet(app.sets[0].id); flushRaf(); app.setSegment("global"); flushRaf();
const slA = findFk("slider:Tension") || findFk("slider:Damp");
ok(slA && slA.getAttribute("aria-label") === slA.dataset.fk.split(":")[1], "(o1) sliders carry an aria-label matching their control");
const tablist = app.querySelector(".segmented");
ok(tablist && tablist.getAttribute("role") === "tablist", "(o2) .segmented is role=tablist");
ok(!!walkOne((c) => c.getAttribute("role") === "tab" && c.getAttribute("aria-selected") === "true"), "(o3) the active tab has aria-selected=true");
ok(app.querySelector(".seg-body").getAttribute("role") === "tabpanel", "(o4) the inspector panel is role=tabpanel");
ok(!!walkOne((c) => c.getAttribute("aria-label") === "Zoom in") && !!walkOne((c) => c.getAttribute("aria-label") === "Zoom out"), "(o5) icon-only zoom +/- buttons have aria-labels");
app.setSegment("palette"); flushRaf();
const enable = app.querySelector(".enable");
ok(enable && enable.getAttribute("role") === "button" && enable.getAttribute("tabindex") === "0" && enable.getAttribute("aria-pressed") != null, "(o6) ●/○ enable toggle has button role + tabindex + aria-pressed");
const onBefore = app.doc.palettes.filter((p) => p.on !== false).length;
enable.dispatch("keydown", { key: "Enter" });
ok(app.doc.palettes.filter((p) => p.on !== false).length !== onBefore, "(o7) Enter on the enable toggle flips a palette (keyboard-operable, was a dead <span>)");
ok((app.querySelector(".canvas-area").getAttribute("aria-label") || "").length > 0, "(o8) canvas-area carries an aria-label");

// ── (p) analysis graphs: legends + the 4.5:1 contrast threshold marker ────────────────
app.openSet(app.sets[0].id); flushRaf();
ok(app.querySelectorAll(".an-legend").length >= 2, `(p1) multi-series graphs carry a legend (got ${app.querySelectorAll(".an-legend").length})`);
ok(app.querySelectorAll(".an-leg-mark").length >= 4, `(p2) legend chips present (got ${app.querySelectorAll(".an-leg-mark").length})`);
ok(app.querySelectorAll(".an-thresh").length === 3, `(p3) each contrast bar shows the 4.5:1 threshold line (got ${app.querySelectorAll(".an-thresh").length})`);

// ── (q) differential damping: controls, live curve graph, real effect ─────────────────
app.openSet(app.sets[0].id); flushRaf(); app.setSegment("global"); flushRaf();
ok(!!findFk("slider:Falloff") && !!findFk("slider:Amplify") && !!findFk("slider:Bias"), "(q1) Global tab has Falloff/Amplify/Bias sliders");
ok(!!app.querySelector(".damp-graph"), "(q2) the damping-curve graph is present in the Global tab");
const dgBefore = app.querySelector(".damp-graph").children[0]?.innerHTML || "";
app.doc.dampAmp = 80; app.liveRefresh(); flushRaf();
const dgAfter = app.querySelector(".damp-graph").children[0]?.innerHTML || "";
ok(dgBefore !== dgAfter && dgAfter.length > 50, "(q3) liveRefresh redraws the damping curve from the new params (input-free)");
const c0 = _pv({ ...app.doc, dampAmp: 0, dampBias: 0, dampCurve: 1.5 }).exports.css;
const c1 = _pv({ ...app.doc, dampAmp: 60, dampBias: 40, dampCurve: 1.5 }).exports.css;
ok(c0 !== c1, "(q4) amplify+bias change the generated/exported ramp");
// defaults must reproduce legacy output (backward-compat): m=1 at the centre stop
const cDefault = _pv({ ...app.doc, dampAmp: 0, dampBias: 0, dampCurve: 1.5 });
ok(cDefault.exports.css.length > 0, "(q5) default differential params produce a valid export (legacy-equivalent)");

// ── (r) damping presets: one click sets all four knobs + highlights the active chip ───
app.openSet(app.sets[0].id); flushRaf(); app.setSegment("global"); flushRaf();
const presets = app.querySelectorAll(".preset");
ok(presets.length >= 5, `(r1) the Global tab shows damping preset chips (got ${presets.length})`);
// click "Vivid mids" (amp 55) — find it by its title carrying amplify 55
const vivid = presets.find((b) => (b.getAttribute("title") || "").includes("amplify 55"));
ok(!!vivid, "(r2) a 'Vivid mids' preset (amplify 55) is present");
const presetHist = app.history.length;
if (vivid) vivid.click();
ok(app.doc.dampAmp === 55 && app.doc.damp === 70 && app.doc.dampBias === 0, `(r3) clicking a preset sets all four knobs (amp=${app.doc.dampAmp}, damp=${app.doc.damp})`);
ok(app.history.length - presetHist === 1, "(r4) a preset is ONE undo step");
// the now-matching chip is marked active
app.setSegment("global"); flushRaf();
const onChip = app.querySelectorAll(".preset").filter((b) => b.classList.contains("on"));
ok(onChip.length === 1 && (onChip[0].getAttribute("title") || "").includes("amplify 55"), `(r5) exactly the matching preset chip is highlighted (got ${onChip.length})`);

// ── (s) Figma Light/Dark export — separate per-mode files + drawer tab ────────────────
const fv = _pv(app.doc);
ok(fv.exports.figma && !!fv.exports.figma.light && !!fv.exports.figma.dark && !!fv.exports.figma.raw, "(s1) projectView exposes figma.light/dark/raw");
ok(fv.exports.figma.light !== fv.exports.figma.dark, "(s2) the Light and Dark files differ");
ok(JSON.parse(fv.exports.figma.light).$extensions["com.figma.modeName"] === "Light" && JSON.parse(fv.exports.figma.dark).$extensions["com.figma.modeName"] === "Dark", "(s3) each file carries its Figma mode name");
ok(Object.keys(JSON.parse(fv.exports.figma.light).danger || {}).filter((k) => k !== "$extensions").length === 37, "(s4) the Light file has all 37 roles per palette");
app.exportOpen = true; app.exportTab = "figma"; app.render(); flushRaf();
const bar = app.querySelector(".figma-files");
const fileBtns = bar ? bar.children.filter((c) => c.tagName === "BUTTON") : [];
ok(fileBtns.length === 3, `(s5) the Figma tab shows 3 per-mode file buttons (got ${fileBtns.length})`);
fileBtns[1].click(); // Dark
ok(app.figmaFile === "dark", "(s6) clicking a mode-file button switches the previewed/downloaded file");

// ── (t) the Binder plugin is inlined + downloadable from the Figma tab ────────────────
const { FIGMA_PLUGIN: FP } = await import("../../src/ui/figma-plugin-assets.js");
ok(FP && !!FP.manifest && !!FP.code && FP.code.length > 1000, "(t1) the Binder plugin (manifest + code) is inlined");
ok(JSON.parse(FP.manifest).id === "hct-semantic-binder", "(t2) the plugin manifest is valid + identifies the binder");
app.exportOpen = true; app.exportTab = "figma"; app.render(); flushRaf();
ok(!!app.querySelector(".figma-plugin-btn"), "(t3) the Figma tab offers a 'Binder plugin' download");
let dl = 0; const realDl = app.download.bind(app);
app.download = () => { dl++; };
app.downloadFigmaPlugin();
ok(dl >= 1, "(t4) the plugin download emits the plugin file(s)");
app.download = realDl;

// ── (u) per-palette edge hue rotation slider + engine effect ──────────────────────────
app.openSet(app.sets[0].id); flushRaf(); app.setSegment("palette"); flushRaf();
ok(!!findFk("slider:Edge hue"), "(u1) the palette inspector has an Edge hue slider");
const uIdx = app.selectedIndex();
app.doc.palettes[uIdx].hueShift = 0;
const uBefore = _pv(app.doc).palettes[uIdx].ramp.map((s) => s.hex).join();
app.doc.palettes[uIdx].hueShift = 45; app.liveRefresh(); flushRaf();
const uAfter = _pv(app.doc).palettes[uIdx].ramp.map((s) => s.hex).join();
ok(uBefore !== uAfter, "(u2) a nonzero edge hue rotates the ramp colors (engine threads hueShift)");
// and the mid stop (s=0) is unchanged by the rotation (pivot), the ends move most
const ramp0 = _pv({ ...app.doc, palettes: app.doc.palettes.map((p, j) => j === uIdx ? { ...p, hueShift: 0 } : p) }).palettes[uIdx].ramp;
const rampR = _pv(app.doc).palettes[uIdx].ramp;
const mid0 = ramp0.find((s) => s.stop === 500).hex, midR = rampR.find((s) => s.stop === 500).hex;
ok(mid0 === midR, "(u3) the rotation pivots on the centre stop (500 unchanged)");

// ── (v) edge-hue same-direction toggle ────────────────────────────────────────────────
app.openSet(app.sets[0].id); flushRaf(); app.setSegment("palette"); flushRaf();
ok(!!app.querySelector(".mini-check"), "(v1) the palette inspector has the same-direction mini-checkbox");
const vIdx = app.selectedIndex();
app.doc.palettes[vIdx].hueShift = 40; app.doc.palettes[vIdx].hueSameDir = false;
const oppRamp = _pv(app.doc).palettes[vIdx].ramp.map((s) => s.hex).join();
app.doc.palettes[vIdx].hueSameDir = true;
const sameRamp = _pv(app.doc).palettes[vIdx].ramp.map((s) => s.hex).join();
ok(oppRamp !== sameRamp, "(v2) same-direction bend changes the ramp vs opposite torsion");
app.doc.palettes[vIdx].hueSameDir = false; app.render(); flushRaf();
const vcb = app.querySelector(".mini-check").children.find((c) => c.tagName === "INPUT");
vcb.dispatch("change", { target: { checked: true } });
ok(app.doc.palettes[vIdx].hueSameDir === true, "(v3) clicking the checkbox sets hueSameDir");

// ── (x) Figma plugin wire: inFigma flag + applyToFigma posts the bundle to the sandbox ─
let posted = null;
const realParent = globalThis.parent;
globalThis.parent = { postMessage: (m) => { posted = m; } };
app.setInFigma(true);
ok(app.inFigma === true, "(x) setInFigma(true) flips the inFigma flag (bridge reveals 'Add Variables → Figma')");
app.applyToFigma();
ok(
  posted && posted.pluginMessage && posted.pluginMessage.type === "apply" &&
    posted.pluginMessage.dtcg && typeof posted.pluginMessage.dtcg === "object",
  "(x) applyToFigma posts {pluginMessage:{type:'apply', dtcg}} — the UI→sandbox bridge contract",
);
globalThis.parent = realParent;
app.setInFigma(false);

// ── (y) Config export ⇄ Import round-trips (serialize → JSON → hydrate) ────────────────
const { serialize: ser, hydrate: hyd } = await import("../../src/ui/persist.js");
const cfgJson = JSON.stringify(ser(app.doc));   // what the drawer's "Config" tab emits
const reparsed = JSON.parse(cfgJson);           // what the gallery's ⬆ Import parses
ok(Array.isArray(reparsed.palettes) && reparsed.palettes.length > 0, "(y) Config export carries palettes[] — the importable shape");
ok(hyd(reparsed).palettes.length === app.doc.palettes.length, "(y) Config round-trips: hydrate(parse(config)) preserves the palette count");

// ── (z) canvas "Scrims" view: toggle + the 7 translucent 750 overlays the view paints ─
const { projectView: projectViewZ } = await import("../../src/ui/model.mjs");
app.setCanvasView("scrims");
ok(app.canvasView === "scrims", "(z) setCanvasView('scrims') flips the canvas view");
let scrimSceneZ = null, scrimThrew = false;
try { scrimSceneZ = app.renderScrimsScene(app._view || projectViewZ(app.doc)); } catch { scrimThrew = true; }
ok(!scrimThrew && scrimSceneZ, "(z) renderScrimsScene renders without throwing");
const scrimRolesZ = (app._view || projectViewZ(app.doc)).palettes[0].roles.filter((r) => /^scrim/.test(r.key));
ok(scrimRolesZ.length === 7, "(z) 7 scrim roles per palette feed the view (scrimWeakest..scrimStrongest)");
ok(scrimRolesZ.every((r) => /^#[0-9A-Fa-f]{8}$/.test(r.lightHex)), "(z) each scrim role is #RRGGBBAA (750 base + alpha) — paintable directly as a CSS overlay");
ok(app.scrimContext(app._view || projectViewZ(app.doc)), "(z) scrimContext renders the scrim sub-variant panel for the right pane");
// the Scrims tab shows the FULL scrim ramp — one cell per stop (19 core), not just the 7 roles.
const enabledZ = app.doc.palettes.filter((p) => p.on !== false).length;
const scrimCellsZ = walk(scrimSceneZ, (e) => e.classList && e.classList.contains("scrim-cell")).length;
ok(scrimCellsZ === enabledZ * 19, `(z) Scrims tab = the full 19-stop ramp per enabled palette: ${scrimCellsZ} cells for ${enabledZ} palettes (core)`);
// liveRefresh now coalesces to one rAF per frame — the Figma slider-drag jank fix.
app._liveRaf = null;
app.liveRefresh();
const rafIdZ = app._liveRaf;
app.liveRefresh();
ok(rafIdZ != null && app._liveRaf === rafIdZ, "(z) liveRefresh coalesces — a 2nd call in the same frame schedules no extra rebuild");
flushRaf(); // drain the scheduled frame
app.setCanvasView("palettes");

// ── (aa) stops toggle (19 core / 25 extended) + the Semantic Mapping table ────────────
const pvAA = app._view || projectViewZ(app.doc);
ok(pvAA.palettes[0].ramp.length === 19 && pvAA.palettes[0].fullRamp.length === 25,
  `(aa) projectView exposes ramp (19 core) + fullRamp (25 extended) — got ${pvAA.palettes[0].ramp.length}/${pvAA.palettes[0].fullRamp.length}`);
const roleAA = pvAA.palettes[0].roles[0];
ok(roleAA.name && roleAA.lightRaw && roleAA.darkRaw && roleAA.lightRaw.includes("-"),
  "(aa) roles carry name + lightRaw/darkRaw token names for the mapping table");
app.setStopsMode("extended");
ok(app.stopsMode === "extended", "(aa) setStopsMode('extended') flips the ramp density");
app.setStopsMode("core");
app.setCanvasView("mapping");
let mapSceneAA = null, mapThrewAA = false;
try { mapSceneAA = app.renderMappingScene(pvAA); } catch { mapThrewAA = true; }
ok(!mapThrewAA && mapSceneAA, "(aa) renderMappingScene renders without throwing");
const swAA = walk(mapSceneAA, (e) => e.classList && e.classList.contains("map-swatch")).length;
ok(swAA === pvAA.palettes[0].roles.length * 2, `(aa) mapping table = 2 rows (Light/Dark) per role: ${swAA} swatches for ${pvAA.palettes[0].roles.length} roles`);
// editable mapping: a per-doc override re-points a role, flows to projectView, and persists.
const { serialize: serAA, hydrate: hydAA } = await import("../../src/ui/persist.js");
app.doc.roleOverrides = {};
app.setRoleOverride("onSurface", "light", "900");
ok(app.doc.roleOverrides.onSurface && app.doc.roleOverrides.onSurface.light === "900", "(aa) setRoleOverride records a per-doc re-point");
const onSAA = projectViewZ(app.doc).palettes[0].roles.find((r) => r.key === "onSurface");
ok(onSAA.lightRef === "900" && onSAA.lightRaw.endsWith("-900"), "(aa) projectView applies the override (onSurface light → 900)");
ok(hydAA(serAA(app.doc)).roleOverrides.onSurface.light === "900", "(aa) the override survives serialize → hydrate (persists)");
let mapOvThrew = false; try { app.renderMappingScene(projectViewZ(app.doc)); } catch { mapOvThrew = true; }
ok(!mapOvThrew, "(aa) the editable mapping table renders with an override applied");
app.clearRoleOverride("onSurface", "light");
ok(!app.doc.roleOverrides.onSurface, "(aa) clearRoleOverride reverts the role to canonical");
app.setCanvasView("palettes");

// ── (bb) config round-trip to the project source of truth (browser localStorage path) ─
app.inFigma = false;
app.doc.lmin = 11; // a marker to prove the PARAMETRIC state round-trips (not resolved colors)
const setsBeforeBB = app.sets.length;
app.saveToProject();
app.loadFromProject();
ok(app.sets.length === setsBeforeBB + 1, "(bb) loadFromProject restored the saved config as a new set");
ok(app.doc.lmin === 11, "(bb) the project config round-trips the parametric state (lmin marker survived)");

// ── (cc) drift diff (#3): driftStatus/driftSummary compare generated vs a live read ───
app.inFigma = true;
app.liveVars = null;
ok(app.driftStatus("neutral/550", "#ABCDEF") === null, "(cc) driftStatus is null before a live variable read");
const rawTreeCC = app.figmaBundle()["palette.tokens.json"];
const liveCC = {};
for (const nn of Object.keys(rawTreeCC)) { if (nn[0] === "$") continue; for (const k of Object.keys(rawTreeCC[nn])) if (k[0] !== "$") liveCC[nn + "/" + k] = rawTreeCC[nn][k].$value.hex; }
const firstCC = Object.keys(liveCC)[0];
const genCC = liveCC[firstCC];
liveCC[firstCC] = "#000000"; // force exactly one token to drift
app.receiveLiveVariables({ found: true, raw: liveCC });
const dsCC = app.driftSummary();
ok(dsCC.total > 0 && dsCC.drifted === 1, `(cc) driftSummary flags exactly the one drifted token (${dsCC.drifted}/${dsCC.total})`);
ok(app.driftStatus(firstCC, genCC) === "drift", "(cc) the forced-mismatch token reads 'drift'");
const lastCC = Object.keys(liveCC)[Object.keys(liveCC).length - 1];
ok(app.driftStatus(lastCC, liveCC[lastCC]) === "match", "(cc) an unchanged token reads 'match'");
app.inFigma = false; app.liveVars = null;

// ── (dd) gallery "read from Figma" row: probe on open; PREFER the embedded config (exact),
//        fall back to the variable-derived seed (approximate) ──
app.inFigma = true; app._figmaProbed = false; app.liveVars = null; app.liveVarsFound = false; app.fileConfig = null;
const probedDD = [];
const realParentDD = globalThis.parent;
globalThis.parent = { postMessage: (m) => { probedDD.push(m && m.pluginMessage && m.pluginMessage.type); } };
app.toGallery(); flushRaf();                        // the gallery render fires the one-shot probe
ok(probedDD.includes("load-config") && probedDD.includes("read-variables"), "(dd) opening the gallery in Figma probes BOTH the embedded config and the variables");
ok(app._figmaProbed === true, "(dd) the probe is one-shot (guarded against re-firing every render)");
ok(!app.querySelector(".figma-import-row"), "(dd) no import row before the probe answers");

// EXACT path: the file carries an embedded config (the lossless source of truth). The auto-probe must
// RECORD it (reveal the row) WITHOUT auto-opening a set.
const savedCfgDD = { name: "Saved", palettes: [
  { name: "neutral", hue: 267, chroma: 25, skew: -20, lift: 0, on: true },
  { name: "primary", hue: 268, chroma: 95, skew: -10, lift: 5, on: true },
] };
const setsBeforeExact = app.sets.length;
app.applyLoadedConfig(savedCfgDD);                  // simulates the bridge's {config-loaded} on the gallery probe
ok(app.view === "gallery" && app.sets.length === setsBeforeExact, "(dd) the gallery probe RECORDS the embedded config without auto-opening a set");
ok(!!app.fileConfig && app.fileConfig.palettes.length === 2, "(dd) the embedded config is recorded as fileConfig");
const rowExactDD = app.querySelector(".figma-import-row"); // shim querySelector matches one class — check the modifier via classList
ok(rowExactDD && !rowExactDD.classList.contains("is-approx"), "(dd) the EXACT (non-approx) import row is shown when the file has an embedded config");
app.openConfigAsSet(app.fileConfig, "Opened the saved palette");
ok(app.view === "editor" && app.sets.length === setsBeforeExact + 1, "(dd) 'Open saved palette' opens the embedded config as a set");
ok(app.doc.palettes[1].skew === -10 && app.doc.palettes[1].lift === 5, "(dd) the embedded config round-trips EXACTLY (skew/lift preserved, NOT reverse-derived)");

// APPROX fallback: no embedded config, but the file has a raw-colors structure → the variable-derived row.
app.toGallery(); app.fileConfig = null; app.liveVars = null; app.liveVarsFound = false;
app.receiveLiveVariables({ found: true, raw: { "brandx/500": "#4F46E5", "brandx/050": "#EEEEFF", "extra/500": "#22AA55" } });
const rowApproxDD = app.querySelector(".figma-import-row");
ok(rowApproxDD && rowApproxDD.classList.contains("is-approx"), "(dd) with no config but a variable structure, the APPROXIMATE row is shown");
const setsBeforeApprox = app.sets.length;
app.readFromFigmaVariables();
ok(app.sets.length === setsBeforeApprox + 1 && app.doc.palettes.length === 2, "(dd) 'Read approx' seeds a set with one palette per family (brandx, extra)");

// not-found path: no config AND no structure → no row offered.
app.toGallery(); app.fileConfig = null; app.receiveLiveVariables({ found: false, raw: {} });
ok(!app.querySelector(".figma-import-row"), "(dd) a file with neither config nor variables offers no import row");

globalThis.parent = realParentDD;
app.inFigma = false; app.liveVars = null; app.liveVarsFound = false; app.fileConfig = null; app._figmaProbed = false; app._loadRequested = false;
app.toGallery();

// ── (gg) figma-init AFTER the gallery is already on screen must re-render → fire the probe ──
// Regression: setInFigma() re-rendered ONLY in the editor. But figma-init arrives ASYNC, after the
// STARTUP gallery has already rendered — so the gallery never re-rendered, never probed, and the
// file's saved config never surfaced (looked like "save didn't work / nothing in the gallery").
// setInFigma must re-render in ANY view. Here: on the gallery, inFigma flips true via figma-init.
const probedGG = [];
const realParentGG = globalThis.parent;
globalThis.parent = { postMessage: (m) => { probedGG.push(m && m.pluginMessage && m.pluginMessage.type); } };
ok(app.view === "gallery" && app.inFigma === false && app._figmaProbed === false, "(gg) preconditions: on the gallery, not yet in Figma, not yet probed");
app.setInFigma(true); // figma-init arrives while the gallery is already shown
ok(app._figmaProbed === true, "(gg) figma-init on the already-open gallery re-renders → fires the one-shot file probe");
ok(probedGG.includes("load-config"), "(gg) the gallery probe posts load-config so the file's saved config can surface");
globalThis.parent = realParentGG;
app.inFigma = false; app._figmaProbed = false; app.fileConfig = null;
app.toGallery();

// ── (hh) Travel-presets shelf: read-only curated presets; opening one copies it into your sets ──
const { TRAVEL_PRESETS: TP } = await import("../../src/ui/travel-presets.js");
ok(Array.isArray(TP) && TP.length === 48, `(hh) 48 travel presets ship in code (got ${TP && TP.length})`);
ok(TP.every((p) => p.palettes.length === 9), "(hh) each preset has 9 palettes (6 sampled + danger/warning/success)");
const SLOTS = ["primary-base","primary-muted","secondary-base","secondary-muted","accent-base","accent-muted","danger","warning","success"];
ok(TP.every((p) => JSON.stringify(p.palettes.map((x) => x.name)) === JSON.stringify(SLOTS)), "(hh) every preset uses the {tier}-{rank} + status naming model, identically");
app.toGallery(); flushRaf();
ok(app.querySelectorAll(".preset").length === 48, `(hh) the gallery renders a read-only preset tile per preset (got ${app.querySelectorAll(".preset").length})`);
const presetNames = new Set(TP.map((p) => p.name));
ok(!app.sets.some((s) => presetNames.has(s.name)), "(hh) presets are NOT seeded into your sets (they ship in code, read-only)");
const setsBeforeHH = app.sets.length;
const keaPreset = TP.find((p) => /Kea/.test(p.name));
app.openConfigAsSet(keaPreset, "Opened");
ok(app.view === "editor" && app.sets.length === setsBeforeHH + 1, "(hh) opening a preset adds an EDITABLE copy to your sets + enters the editor");
ok(app.doc.palettes.length === 9 && app.doc.palettes[0].name === "primary-base", "(hh) the opened copy carries the 9 named palettes (primary-base first)");
ok(app.doc.palettes.some((p) => p.name === "danger") && app.doc.palettes.some((p) => p.name === "success"), "(hh) the status palettes (danger/warning/success) are present in the copy");
app.toGallery(); flushRaf();
app.search = "Kea"; app.refreshTiles();
const filteredHH = app.querySelectorAll(".preset").length;
ok(filteredHH >= 1 && filteredHH < 48, `(hh) the search box filters the preset shelf too (got ${filteredHH} for "Kea")`);
app.search = ""; app.refreshTiles(); app.toGallery();

// ── (ee) "Download all (.zip)": one foldered archive of every format + the re-importable config ──
const setName0 = app.doc.name;
let zipCap = null;
const realDB = app.downloadBytes.bind(app);
app.downloadBytes = (bytes, filename) => { zipCap = { bytes, filename }; }; // intercept the binary download
app.doc.name = "My Set";
app.downloadAllZip(projectViewZ(app.doc));
app.downloadBytes = realDB;
app.doc.name = setName0;
ok(zipCap && zipCap.filename === "hct-my-set-export.zip", `(ee) downloads a single .zip named from the set (${zipCap && zipCap.filename})`);
const zb = zipCap ? zipCap.bytes : new Uint8Array();
ok(zb[0] === 0x50 && zb[1] === 0x4b && zb[2] === 0x03 && zb[3] === 0x04, "(ee) the archive begins with a ZIP local-file-header signature (PK\\x03\\x04)");
const eocd = zb.length - 22; // EOCD has no trailing comment → it's the final 22 bytes
const eocdSig = zb[eocd] === 0x50 && zb[eocd + 1] === 0x4b && zb[eocd + 2] === 0x05 && zb[eocd + 3] === 0x06;
const entries = zb[eocd + 10] | (zb[eocd + 11] << 8);
ok(eocdSig && entries === 9, `(ee) the EOCD reports 9 entries — one per format folder + the config (got ${entries})`);
const zipText = Buffer.from(zb).toString("latin1");
const wantPaths = ["css-hex/", "css-oklch/", "json/", "dtcg/", "figma/Light_tokens.json", "figma/Dark_tokens.json", "figma/palette.tokens.json", "ui3/", "hct-my-set-config.json"];
ok(wantPaths.every((p) => zipText.includes(p)), "(ee) every format folder + the config file is present in the archive");

// ── (ff) the HCT brand doubles as "back to gallery"; the ◀ Gallery button is removed ──
app.openSet(app.sets[0].id);                         // into the editor
ok(app.view === "editor", "(ff) opened the editor");
const brandFF = app.querySelector(".brand-link");
ok(brandFF && brandFF.attrs.role === "button" && brandFF.attrs.tabindex === "0", "(ff) the HCT brand is a focusable role=button");
const textOfFF = (e) => (e._text || "") + (e.children || []).map(textOfFF).join("");
const galleryBtnsFF = walk(app, (e) => e.tagName === "BUTTON" && /Gallery/.test(textOfFF(e)));
ok(galleryBtnsFF.length === 0, "(ff) the ◀ Gallery button was removed from the header");
brandFF.click();                                     // clicking the brand returns to the gallery
ok(app.view === "gallery", "(ff) clicking the HCT brand navigates back to the gallery");

// ── (w) localStorage DENIED (a Figma plugin's sandboxed iframe) — must not crash ──────
const realLS = globalThis.localStorage;
const deny = () => { throw new Error("SecurityError: localStorage access is denied"); };
globalThis.localStorage = { getItem: deny, setItem: deny, removeItem: deny };
let lsCrash = false;
try { app.save(); } catch { lsCrash = true; }   // save() -> saveSets -> localStorage.setItem
globalThis.localStorage = realLS;
ok(!lsCrash, "(w) save() tolerates a throwing localStorage (Figma sandboxed iframe) — degrades to no-persistence, never crashes boot");

// ── report ──────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error("HEADLESS BOOT FAIL:");
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("HEADLESS BOOT PASS — all Phase-3 interaction assertions hold");
process.exit(0);
