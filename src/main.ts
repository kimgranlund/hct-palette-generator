// Entry point: mount the HCT Palette Generator.
//
// The web component + its stylesheet live under `src/ui/` (app.js customElements.define's
// <nonoun-color-tokens> and pulls in the `./model.mjs` → `../engine/…` ES-module graph). We import them
// here and drop <nonoun-color-tokens> into the page; Vite resolves and bundles the graph.
import "./ui/styles.css";
import "./ui/app.js";
// flags.js is an intentionally-untyped pure engine module (the project keeps its JS engines vanilla, no
// .d.ts); import its pure mapper across the JS→TS seam. tsc has no declaration for it → implicit any here,
// which is exactly what we want (the engine owns the contract; it's unit-tested in test/engine/flags.mjs).
// @ts-expect-error -- no declaration file for the JS engine module, by design (self-clears if it ever gets one)
import { lemonEntitlement } from "./engine/flags.js";

// ── Pro licensing (WEB ONLY) ────────────────────────────────────────────────────────────────────────
// app.js exposes a pluggable license SEAM (el._licenseValidator) with an OFFLINE default, so the file
// stays network-free inside the offline Figma plugin bundle (manifest networkAccess:"none" — the bundle is
// rooted at app.js by scripts/bundle.mjs and NEVER includes this entry). Here in the WEB entry we assign
// the REAL validator that talks to Lemon Squeezy's public License API. No API key is needed: the license
// key itself is the credential, and validate/activate are designed for client-side use. The pure
// response→entitlement mapping lives in the engine (lemonEntitlement — unit-tested); this layer is the fetch.
type LicenseResult = { ok: boolean; entitlement?: { status: string; expiresAt?: number }; error?: string };
type LicensedElement = HTMLElement & { _licenseValidator?: (key: string) => Promise<LicenseResult> };

// Optionally PIN activation to this Lemon Squeezy store (rejects a valid key issued by a DIFFERENT store).
// null = accept any active key the storefront issues; set the numeric store id to lock activation down.
const LEMON_STORE_ID: number | null = null;

async function lemonSqueezyLicenseValidator(key: string): Promise<LicenseResult> {
  const resp = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ license_key: key }).toString(),
  });
  let json: unknown = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  return lemonEntitlement(json, { storeId: LEMON_STORE_ID });
}

const root = document.querySelector<HTMLElement>("#app");
if (root) {
  root.innerHTML = "<nonoun-color-tokens></nonoun-color-tokens>";
  // The element upgrades synchronously on innerHTML (app.js already ran customElements.define), so it's
  // present here; swap its offline default seam for the real Lemon-Squeezy validator before any user action.
  const el = root.querySelector("nonoun-color-tokens") as LicensedElement | null;
  if (el) el._licenseValidator = lemonSqueezyLicenseValidator;
}
