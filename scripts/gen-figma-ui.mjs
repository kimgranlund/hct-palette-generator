// gen-ui.mjs — build the plugin's ui.html from the offline single-file generator bundle
// + a tiny Figma bridge. The generator itself is unchanged (single source = ui-app); the
// bridge only flips the app's `inFigma` flag when code.js announces {type:"figma-init"},
// which reveals the app's own "⚑ Add Variables → Figma" action inside the Export drawer
// (the app then posts figmaBundle() to the sandbox itself, via applyToFigma()). Regenerate
// after a UI change:  node scripts/bundle.mjs && node scripts/gen-figma-ui.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = `${HERE}/../dist/nonoun-color-tokens.html`;

// The bridge is injected just before </body>. It uses Figma's UI⇄code postMessage contract:
//   code.js → UI:  figma.ui.postMessage(x)        → window 'message' event, e.data.pluginMessage = x
//   UI → code.js:  parent.postMessage({pluginMessage:x}, '*')  → figma.ui.onmessage = (x)=>{}
const BRIDGE = `
<script>
(function(){
  // Tell the generator it's inside Figma so it reveals its own "⚑ Add Variables → Figma"
  // action in the Export drawer. code.js posts {type:"figma-init"} right after showUI; the
  // message can land before <hct-app> is upgraded, so poll briefly until setInFigma exists.
  function markInFigma(){
    var app=document.querySelector("hct-app");
    if(app&&typeof app.setInFigma==="function"){ app.setInFigma(true); return; }
    setTimeout(markInFigma,50);
  }
  function app(){ return document.querySelector("hct-app"); }
  addEventListener("message",function(e){
    var m=e.data&&e.data.pluginMessage;       // sandbox→UI: read e.data.pluginMessage, not e.data
    if(!m) return;
    if(m.type==="figma-init") markInFigma();
    // config round-trip: code.js read the config from figma.clientStorage; hand it to the generator.
    if(m.type==="config-loaded"){ var a=app(); if(a&&typeof a.applyLoadedConfig==="function") a.applyLoadedConfig(m.config); }
    // drift diff: code.js read the live raw-colors variables; hand them to the generator to compare.
    if(m.type==="variables-read"){ var b=app(); if(b&&typeof b.receiveLiveVariables==="function") b.receiveLiveVariables(m); }
  });
})();
</script>`;

const src = readFileSync(BUNDLE, "utf8");
if (!src.includes("</body>")) throw new Error("bundle has no </body> to inject the bridge before");
const html = src.replace("</body>", BRIDGE + "\n</body>");
writeFileSync(`${HERE}/../figma/plugin/ui.html`, html);
console.log("wrote figma/plugin/ui.html", (html.length / 1024).toFixed(1) + " KB");
