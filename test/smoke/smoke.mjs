#!/usr/bin/env node
// smoke.mjs — a REAL-BROWSER smoke test (dependency-free). The node verifiers + the headless DOM
// shim (test/run.mjs) cover logic; this boots the actual built single-file in headless Chrome over
// CDP (node's built-in WebSocket + fetch — no Playwright/puppeteer, keeping the zero-dep ethos) and
// drives the core user flows: gallery hub → a category category → the editor → the export dialog.
//
// Run: `npm run build` then `npm run smoke`. Chrome is auto-detected (override with $CHROME_BIN).
// CI uses the runner's preinstalled google-chrome. Screenshots land in smoke-out/ (gitignored).
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const ARTIFACT = resolve(ROOT, "dist/nonoun-color-tokens.html"); // the offline single-file build
const OUT = resolve(ROOT, "smoke-out");

if (!existsSync(ARTIFACT)) { console.error(`smoke: missing ${ARTIFACT} — run \`npm run build\` first`); process.exit(1); }

// locate a Chrome/Chromium binary (CI runner has google-chrome; local dev may have Chrome[/Canary]).
const CHROME = [
  process.env.CHROME_BIN, process.env.CHROME_PATH,
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
].filter(Boolean).find((p) => existsSync(p));
if (!CHROME) { console.error("smoke: no Chrome/Chromium found — set $CHROME_BIN"); process.exit(1); }

const fails = [];
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fails.push(msg); };

// serve the single-file over http (a real origin, so localStorage/color-scheme behave as in the wild).
const html = readFileSync(ARTIFACT);
const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const PORT = 9333;
const proc = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${PORT}`, "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++idc; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expression, awaitPromise = false) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

try {
  // Wait for the CDP endpoint, then open the page target. Cold CI runners can take well over 15s to
  // start Chrome's debugger, so this is generous + two-phase: (1) poll /json/version until the debugger
  // is LISTENING, then (2) create the tab (/json/new can briefly lag the version endpoint). Both report
  // how long they waited + the last error, so a real failure is diagnosable instead of a bare timeout.
  const cdp = async (path, init) => { const r = await fetch(`http://127.0.0.1:${PORT}${path}`, init); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const DEADLINE_MS = 45000, INTERVAL_MS = 400;
  let lastErr = "no response", up = false;
  for (let waited = 0; waited < DEADLINE_MS && !up; waited += INTERVAL_MS) {
    try { await cdp("/json/version"); up = true; } catch (e) { lastErr = e.message; await sleep(INTERVAL_MS); }
  }
  if (!up) throw new Error(`Chrome CDP did not come up within ${DEADLINE_MS / 1000}s (last: ${lastErr})`);
  let wsUrl = null;
  for (let i = 0; i < 25 && !wsUrl; i++) {
    try { wsUrl = (await cdp(`/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).webSocketDebuggerUrl; }
    catch (e) { lastErr = e.message; await sleep(INTERVAL_MS); }
  }
  if (!wsUrl) throw new Error(`Chrome CDP target did not open after the debugger came up (last: ${lastErr})`);
  ws = new WebSocket(wsUrl);
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable"); await send("Runtime.enable");
  await sleep(2500); // boot the web component + first render

  const el = `document.querySelector("nonoun-color-tokens")`;
  ok(await evalJS(`!!${el} && !!${el}.querySelector(".gallery")`), "gallery boots");
  ok(await evalJS(`${el}.querySelectorAll(".category-card").length === 7`), "hub renders 7 category cards");

  await evalJS(`${el}.openCategory("travel")`, true); await sleep(1200);
  ok(await evalJS(`${el}.category === "travel" && ${el}.querySelectorAll(".preset").length === 48`), "Travel category lazy-loads 48 palettes");
  ok(await evalJS(`${el}.querySelectorAll(".preset-vol").length === 12`), "12 volume groups render");

  await evalJS(`${el}.closeCategory()`);
  await evalJS(`${el}.openSet(${el}.sets[0].id)`); await sleep(800);
  ok(await evalJS(`${el}.view === "editor" && !!${el}.querySelector(".canvas-header")`), "opening a set enters the editor");
  ok(await evalJS(`${el}.querySelectorAll(".ramp-row").length >= 1`), "editor renders palette ramps");

  mkdirSync(OUT, { recursive: true }); // ensure the screenshot dir exists before the first capture

  // cross-scheme regression: dragging a row while the canvas preview is LIGHT but the app chrome is
  // DARK must render the floating clone in the CANVAS scheme (light) — its light-dark() tokens resolve
  // where it visually belongs, not the dark host it's re-parented into. Only meaningful cross-scheme.
  await evalJS(`(()=>{${el}.theme="dark";${el}.colorMode="light";${el}.render();})()`); await sleep(150);
  const xsPt = await evalJS(`(()=>{const h=${el}.querySelector(".drag-handle");if(!h)return null;const r=h.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (xsPt) {
    await evalJS(`(()=>{const h=${el}.querySelector(".drag-handle");h.dispatchEvent(new PointerEvent("pointerdown",{clientX:${xsPt.x},clientY:${xsPt.y},bubbles:true,cancelable:true}));document.dispatchEvent(new PointerEvent("pointermove",{clientX:${xsPt.x},clientY:${xsPt.y + 60},bubbles:true,cancelable:true}));})()`);
    await sleep(120);
    ok(await evalJS(`(()=>{const g=${el}.querySelector(".drag-ghost");return !!g && getComputedStyle(g).colorScheme.includes("light")})()`), "drag-ghost resolves in the canvas scheme (light), not the dark host");
    await evalJS(`document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true}))`); await sleep(80);
  }
  await evalJS(`(()=>{${el}.theme="system";${el}.canvasTheme="system";${el}.colorMode="light";${el}.render();})()`); await sleep(150);

  // Color "Both" / Compare mode — the Mode control's third option renders the scene in Light + Dark
  // side by side (two .compare-col, each forcing its own color-scheme) in one pannable canvas.
  await evalJS(`${el}.setColorMode("both")`); await sleep(200);
  ok(await evalJS(`(()=>{const c=${el}.querySelectorAll(".canvas-compare .compare-col");return c.length===2 && getComputedStyle(c[0]).colorScheme.includes("light") && getComputedStyle(c[1]).colorScheme.includes("dark")})()`), "Color Both mode renders a Light + Dark Compare (two scheme-forced columns)");
  const cmpShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "compare.png"), Buffer.from(cmpShot.data, "base64"));
  console.log("  · screenshot → smoke-out/compare.png");
  await evalJS(`${el}.setColorMode("light")`); await sleep(120);

  // drag-to-reorder: a real handle-drag lifts a floating clone (.drag-ghost) and opens a dashed drop
  // placeholder (.drop-ghost) at the landing slot; the source row collapses.
  const dragPt = await evalJS(`(()=>{const h=${el}.querySelector(".drag-handle");if(!h)return null;const r=h.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (dragPt) {
    await evalJS(`(()=>{const h=${el}.querySelector(".drag-handle");h.dispatchEvent(new PointerEvent("pointerdown",{clientX:${dragPt.x},clientY:${dragPt.y},bubbles:true,cancelable:true}));document.dispatchEvent(new PointerEvent("pointermove",{clientX:${dragPt.x},clientY:${dragPt.y + 230},bubbles:true,cancelable:true}));})()`);
    await sleep(140);
    ok(await evalJS(`!!${el}.querySelector(".drag-ghost") && !!${el}.querySelector(".drop-ghost")`), "drag-to-reorder lifts a floating clone + opens a drop placeholder");
    const dragShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(OUT, "drag-reorder.png"), Buffer.from(dragShot.data, "base64"));
    console.log("  · screenshot → smoke-out/drag-reorder.png");
    // 10px drop sensitivity: the placeholder (proposed placement) is the hit area — a move within 10px
    // of its bottom edge does NOT reslot; past 10px it does. anchor = the data-pi the drop lands before.
    const phInfo = () => evalJS(`(()=>{const p=${el}.querySelector(".drop-ghost");if(!p)return null;const r=p.getBoundingClientRect();let n=p.nextSibling;while(n&&!(n.classList&&n.classList.contains("ramp-row")&&n.getAttribute&&n.getAttribute("data-pi")!=null))n=n.nextSibling;return {bottom:Math.round(r.bottom),anchor:(n?n.getAttribute("data-pi"):"end")}})()`);
    const dragTo = (yy) => evalJS(`document.dispatchEvent(new PointerEvent("pointermove",{clientX:${dragPt.x},clientY:${yy},bubbles:true,cancelable:true}))`);
    const p0 = await phInfo();
    if (p0) {
      await dragTo(p0.bottom + 5); await sleep(70);
      const p1 = await phInfo();
      ok(p1 && p1.anchor === p0.anchor, `within 10px of the placeholder edge the drop slot is stable (anchor ${p0.anchor})`);
      await dragTo(p0.bottom + 40); await sleep(70);
      const p2 = await phInfo();
      ok(p2 && p2.anchor !== p0.anchor, `moving >10px past the edge reslots the drop (anchor ${p0.anchor} → ${p2 && p2.anchor})`);
    }
    await evalJS(`document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true}))`); await sleep(120);
    ok(await evalJS(`!${el}.querySelector(".drag-ghost") && !${el}.querySelector(".drop-ghost")`), "releasing the drag removes the clone + placeholder");
  }

  await evalJS(`${el}.toggleDrawer(true)`); await sleep(400);
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.drawer");return !!d && d.open && Math.round(d.getBoundingClientRect().height) === innerHeight})()`), "export drawer opens as a full-height <dialog>");
  // Systems opt-in: Color / Typography / Geometry toggle chips govern Download-All + the Brand-Kit MCP.
  ok(await evalJS(`(()=>{const c=[...${el}.querySelectorAll(".drawer-systems .chip")];return c.length===3 && c.every(b=>b.classList.contains("on"))})()`), "Export drawer shows 3 system toggles (Color/Typography/Geometry), all on by default");
  const drawerShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "export-systems.png"), Buffer.from(drawerShot.data, "base64"));
  console.log("  · screenshot → smoke-out/export-systems.png");
  // toggling Geometry off un-presses its chip (still ≥1 selected, so it sticks)
  ok(await evalJS(`(()=>{${el}.toggleExportSystem("geometry");const c=[...${el}.querySelectorAll(".drawer-systems .chip")].find(b=>b.textContent.trim()==="Geometry");return c && !c.classList.contains("on")})()`), "toggling Geometry off un-presses its chip");
  await evalJS(`${el}.exportSystems={color:true,type:true,geometry:true};${el}.render()`); await sleep(80);
  await evalJS(`${el}.toggleDrawer(false)`); await sleep(200);

  // Apply-to-Figma consent gate: a centered "back up your variables first" road-block before writing.
  await evalJS(`(()=>{try{localStorage.removeItem("nonoun-color-tokens-apply-consent-v1")}catch(e){};${el}.setInFigma(true);${el}.requestApplyToFigma(false);})()`); await sleep(300);
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.apply-gate");if(!d||!d.open)return false;const r=d.getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<2 && !!${el}.querySelector(".apply-gate-warn")})()`), "Apply-to-Figma consent gate opens (centered, back-up warning) before posting");
  const gateShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "apply-gate.png"), Buffer.from(gateShot.data, "base64"));
  console.log("  · screenshot → smoke-out/apply-gate.png");
  await evalJS(`(()=>{${el}.closeApplyGate();${el}.setInFigma(false);})()`); await sleep(150);

  // Settings modal: token-mapping prefs (primary accent 550/450 ↔ 500/500, on-colors).
  await evalJS(`${el}.openSettings()`); await sleep(300);
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.settings");return !!d && d.open && ${el}.querySelectorAll(".settings-row").length>=2})()`), "Settings modal opens with the token-mapping rows");
  const setShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "settings.png"), Buffer.from(setShot.data, "base64"));
  console.log("  · screenshot → smoke-out/settings.png");
  await evalJS(`${el}.closeSettings()`); await sleep(120);

  // Typography SECTION: the app-header switcher flips this.section → the full 41-step canvas specimen.
  await evalJS(`${el}.setSection("typography")`); await sleep(300);
  ok(await evalJS(`(()=>{return ${el}.section==="typography" && ${el}.querySelectorAll(".type-spec-line").length===41 && ${el}.querySelectorAll(".type-spec-group").length===7})()`), "Typography section shows the full 41-step specimen across the 7 named groups");
  ok(await evalJS(`(()=>{return !!${el}.querySelector(".tyi-voices") && ${el}.querySelectorAll(".an-card").length>=4})()`), "Typography section: right-pane inspector + left-rail analysis cards render");
  // entering the section injects the SELF-HOSTED base64 @font-face <style> — no CDN, so it renders the real
  // faces offline + in the Figma plugin (networkAccess:none). Confirm there's NO Google Fonts CDN request.
  ok(await evalJS(`(()=>{const s=document.getElementById("nonoun-type-fonts");return !!s && s.tagName==="STYLE" && /@font-face/.test(s.textContent) && /base64/.test(s.textContent) && /Inter Tight/.test(s.textContent)})()`), "Typography injects the self-hosted base64 @font-face (renders offline + in the Figma plugin)");
  ok(await evalJS(`(()=>{return ![...document.querySelectorAll("link[href]")].some(l=>/fonts\\.(googleapis|gstatic)\\.com/.test(l.href))})()`), "no Google Fonts CDN request (offline-proof + Figma networkAccess:none compliant)");
  // all four embedded faces must actually APPLY in real layout (the DOM is what the app renders) — measured
  // by a width delta vs monospace at the weights the specimen uses. NB: document.fonts.check() and canvas
  // measureText give false negatives for variable fonts in Chromium, so we measure real DOM layout instead.
  await sleep(700);
  const applyReport = await evalJS(`(async()=>{await document.fonts.ready;const mk=(ff,w)=>{const s=document.createElement("span");s.style.cssText='position:absolute;visibility:hidden;font-size:48px;font-weight:'+w+';white-space:nowrap;font-family:'+ff;s.textContent='Yao Ming Featured Matchups';document.body.appendChild(s);const x=s.offsetWidth;s.remove();return x;};const fams=["Inter","Inter Tight","Source Serif 4","JetBrains Mono"];const out={};for(const f of fams){const base=mk("monospace",400);out[f]=Math.abs(mk('"'+f+'", monospace',400)-base)>1 && Math.abs(mk('"'+f+'", monospace',700)-base)>1;}return out;})()`, true);
  console.log("  · embedded fonts apply (DOM):", JSON.stringify(applyReport));
  ok(applyReport && applyReport["Source Serif 4"] && applyReport["Inter Tight"] && applyReport["JetBrains Mono"] && applyReport["Inter"], "all 4 self-hosted faces APPLY in real DOM layout (incl. the Source Serif 4 serif)");
  // screenshot at a Source Serif 4 treatment (Luxury) so the artifact visibly proves the SERIF renders.
  await evalJS(`${el}.commit((d)=>{ d.type = { treatment: "luxury", bodyBase: 16 }; })`); await sleep(900);
  const tyShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "typography.png"), Buffer.from(tyShot.data, "base64"));
  console.log("  · screenshot → smoke-out/typography.png (Luxury / Source Serif 4)");

  // Typography breakpoint MODES (Phase 5): the Mode control adds a named bodyBase variant; switching it
  // re-resolves the whole specimen at the mode's body size.
  await evalJS(`${el}.addTypeMode(); ${el}._setActiveTypeBodyBase(13)`); await sleep(200);
  ok(await evalJS(`(()=>{return ${el}.doc.type.modes && ${el}.doc.type.modes.length===1 && [...${el}.querySelectorAll('[data-fk^="tmode:"]')].length>=2 && ${el}._activeType().bodyBase===13})()`), "Typography breakpoint mode: + adds a mode, the Mode control shows Base + it, and the specimen re-resolves at the mode's body size");
  const bpShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "type-breakpoint.png"), Buffer.from(bpShot.data, "base64"));
  console.log("  · screenshot → smoke-out/type-breakpoint.png");

  await evalJS(`${el}.commit((d)=>{ d.type = { treatment: "product", bodyBase: 16 }; }); ${el}.typeMode="base"`); await sleep(120);
  await evalJS(`${el}.setSection("color")`); await sleep(120);

  // Geometry SECTION: the app-header switcher flips this.section → the full dimensional dataset (the 6-step
  // control ramp on the centering law + the radius + space ladders), left analysis rail + right inspector.
  await evalJS(`${el}.setSection("geometry")`); await sleep(300);
  ok(await evalJS(`(()=>{return ${el}.section==="geometry" && ${el}.querySelectorAll(".geom-spec-line").length===6})()`), "Geometry section shows the 6-step control ramp (XS..2XL) on the canvas");
  ok(await evalJS(`(()=>{return !!${el}.querySelector(".geom-spec .geom-shared-note") && ${el}.querySelectorAll(".an-card").length>=4 && (!!${el}.querySelector(".tyi-voices") || !!${el}.querySelector(".insp-title"))})()`), "Geometry section: left-rail analysis cards + right-pane inspector + the type-composition note render");
  ok(await evalJS(`(()=>{const b=${el}.querySelector(".geom-ctl");if(!b)return false;const r=b.getBoundingClientRect();return r.height>=18 && r.height<=80})()`), "Geometry specimen renders a real mock control box on the ramp");
  const geoShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "geometry.png"), Buffer.from(geoShot.data, "base64"));
  console.log("  · screenshot → smoke-out/geometry.png");
  await evalJS(`${el}.setSection("color")`); await sleep(120);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "editor.png"), Buffer.from(shot.data, "base64"));
  console.log("  · screenshot → smoke-out/editor.png");

  // New-Palette modal: a CENTERED top-layer <dialog> with the "Derive from" strip + the 3 tabs.
  await evalJS(`${el}.openNewPalette()`); await sleep(400);
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.newpal");if(!d||!d.open)return false;const r=d.getBoundingClientRect();return Math.abs((r.left+r.right)/2 - innerWidth/2) < 2 && Math.abs((r.top+r.bottom)/2 - innerHeight/2) < 2})()`), "New-Palette modal opens centered in the top layer");
  ok(await evalJS(`${el}.querySelectorAll(".newpal-chip").length >= 1 && ${el}.querySelectorAll(".newpal-rel").length === 6`), "modal shows the context strip + all 6 Relative relationships");
  // swatch-only chips: no inline text, the palette name lives in the title (hover tooltip).
  ok(await evalJS(`(()=>{const c=${el}.querySelector(".newpal-chip");return !!c.getAttribute("title") && c.textContent.trim()===""})()`), "context chips are swatch-only (name in title)");
  // two-column previews: left = hue circle + chroma curve; right = the proposed-palette ramp.
  ok(await evalJS(`!!${el}.querySelector(".newpal-hc svg") && ${el}.querySelectorAll(".newpal-diagram").length === 2 && ${el}.querySelector(".newpal-ramp").children.length >= 19`), "Relative tab renders hue circle + chroma curve + ramp preview");
  // priority order: the Dominant changes per relationship, the Primary (the anchor it pivots on) does NOT.
  const swAt = (rel) => evalJS(`(()=>{${el}.newPalRel="${rel}";${el}.render();const s=${el}.querySelectorAll(".newpal-pp-sw");return [s[0]&&s[0].getAttribute("style"), s[1]&&s[1].getAttribute("style")]})()`);
  const swAnchor = await swAt("anchor"), swContrast = await swAt("contrast");
  ok(swAnchor[1] && swAnchor[1] === swContrast[1], "Primary reference swatch is stable across relationships (the priority anchor)");
  ok(swAnchor[0] && swAnchor[0] !== swContrast[0], "Dominant swatch changes with the relationship (anchor ≠ contrast)");
  await evalJS(`(()=>{${el}.newPalRel="extend";${el}.render();})()`); await sleep(150);
  // the priority chain shows the ordered context (primary + secondary/tertiary…), primary marked.
  ok(await evalJS(`${el}.querySelectorAll(".newpal-pp-chain-sw").length >= 3 && ${el}.querySelectorAll(".newpal-pp-chain-sw.primary").length === 1`), "Relative preview shows the priority chain (primary marked)");
  // the Cancel/Create CTA is justified to the trailing edge (right) of the dialog.
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.newpal").getBoundingClientRect();const c=${el}.querySelector(".newpal-create").getBoundingClientRect();return (d.right - c.right) < 24 && (c.left - d.left) > d.width*0.5})()`), "footer CTA is right/end-justified");
  const npShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "new-palette.png"), Buffer.from(npShot.data, "base64"));
  console.log("  · screenshot → smoke-out/new-palette.png");
  // Custom tab: the picker + a live, in-place preview refresh on slider input.
  await evalJS(`(()=>{${el}.newPalTab="custom";${el}.newPalCustom={hue:300,chroma:70};${el}.render();})()`); await sleep(250);
  ok(await evalJS(`!!${el}.querySelector(".newpal-custom") && ${el}.querySelector(".newpal-ramp").children.length >= 19`), "Custom tab shows the picker + live palette preview");
  ok(await evalJS(`(()=>{const i=${el}.querySelector(".newpal-color-input");return !!i && i.getAttribute("type")==="color" && /^#[0-9a-fA-F]{6}$/.test(i.value)})()`), "Custom tab has a native color picker seeded from the proposed color");
  const npCustomShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "new-palette-custom.png"), Buffer.from(npCustomShot.data, "base64"));
  console.log("  · screenshot → smoke-out/new-palette-custom.png");
  await evalJS(`(()=>{${el}.newPalTab="relative";${el}.render();})()`); await sleep(200);
  // the modal is draggable by its header — synthesize a header-drag and confirm it offsets.
  await evalJS(`(()=>{const a=${el};a._beginNewPalDrag({clientX:200,clientY:200,target:{},preventDefault(){}});document.dispatchEvent(new PointerEvent('pointermove',{clientX:260,clientY:240}));document.dispatchEvent(new PointerEvent('pointerup',{}));})()`);
  await sleep(120);
  ok(await evalJS(`/translate\\(\\s*60px\\s*,\\s*40px\\s*\\)/.test(${el}.querySelector("dialog.newpal").style.transform)`), "New-Palette modal is draggable by its header (offsets via transform)");
  await evalJS(`${el}.closeNewPalette()`); await sleep(150);
} catch (e) {
  fails.push("smoke threw: " + e.message);
} finally {
  try { ws && ws.close(); } catch { /* */ }
  proc.kill("SIGKILL");
  server.close();
}

if (fails.length) { console.error(`\nSMOKE FAIL (${fails.length}):\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log("\nSMOKE PASS — gallery · category · editor · export dialog all render in a real browser");
process.exit(0);
