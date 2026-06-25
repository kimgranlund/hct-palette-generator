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
  // wait for the CDP endpoint, then open the page target.
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  if (!wsUrl) throw new Error("Chrome CDP did not come up");
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

  await evalJS(`${el}.toggleDrawer(true)`); await sleep(400);
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.drawer");return !!d && d.open && Math.round(d.getBoundingClientRect().height) === innerHeight})()`), "export drawer opens as a full-height <dialog>");
  await evalJS(`${el}.toggleDrawer(false)`); await sleep(200);

  mkdirSync(OUT, { recursive: true });
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
  // the Cancel/Create CTA is justified to the trailing edge (right) of the dialog.
  ok(await evalJS(`(()=>{const d=${el}.querySelector("dialog.newpal").getBoundingClientRect();const c=${el}.querySelector(".newpal-create").getBoundingClientRect();return (d.right - c.right) < 24 && (c.left - d.left) > d.width*0.5})()`), "footer CTA is right/end-justified");
  const npShot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT, "new-palette.png"), Buffer.from(npShot.data, "base64"));
  console.log("  · screenshot → smoke-out/new-palette.png");
  // Custom tab: the picker + a live, in-place preview refresh on slider input.
  await evalJS(`(()=>{${el}.newPalTab="custom";${el}.newPalCustom={hue:300,chroma:70};${el}.render();})()`); await sleep(250);
  ok(await evalJS(`!!${el}.querySelector(".newpal-custom") && ${el}.querySelector(".newpal-ramp").children.length >= 19`), "Custom tab shows the picker + live palette preview");
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
