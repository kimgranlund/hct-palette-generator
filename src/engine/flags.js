// flags.js — the feature-flag + entitlement SUBSTRATE (item 7, Layer 1). Pure, no DOM, no storage, no
// network. Resolves what a user is entitled to from their per-machine `profile` ({ tier, flagOverrides }).
// The SINGLE place a gate is decided — every gated surface reads `flagOf(flags, key)`, never a raw
// `tier === "pro"` check, so the line moves in one place. Flags are BOOLEAN or VALUED (a numeric cap).
//
// Layers (build order): (1) THIS substrate — engine + persisted profile + the resolver (tier hardcoded
// free, zero payment code); (2) entitlement — a Lemon-Squeezy license key, validated client-side in the
// WEB APP, flips tier→pro; (3) the Settings « Account » home. The offline Figma plugin stays free.

// The flag keys + their per-tier values (the product's Pro line, from the item-7 Ratified Design).
// `maxSets` is VALUED (the free brand-kit cap); the rest are boolean capability gates.
export const FLAG_KEYS = ["maxSets", "proExport", "advancedTreatments", "hostedMcp"];

export const TIER_FLAGS = {
  free: { maxSets: 2, proExport: false, advancedTreatments: false, hostedMcp: false },
  pro: { maxSets: Infinity, proExport: true, advancedTreatments: true, hostedMcp: true },
};

// Master enforcement switch. Ships FALSE pre-launch: with NO purchase path yet, gating a feature OFF would
// just remove it from current users — so everyone resolves to the UNLOCKED (pro) values until Layer 2 wires
// payment and the product flips this to true. (The free/pro split below is defined + tested now, ready.)
export const TIERS_ENFORCED = false;

// resolveFlags(profile, opts?) → the resolved flag map. base = the tier's values when enforced, else the
// unlocked (pro) values; then any explicit flagOverrides (dev / QA / early-access) win.
export function resolveFlags(profile = {}, { enforced = TIERS_ENFORCED, nowMs } = {}) {
  // resolve the EFFECTIVE tier from the entitlement (a stored tier:"pro" with no valid entitlement is
  // free) — so the entitlement gate can't be bypassed by a direct caller, not just app.flagOf. Clockless:
  // pass nowMs to ALSO enforce expiry; without it only the no-entitlement spoof is caught, not staleness.
  const tier = resolveTier(profile, nowMs);
  const base = enforced ? TIER_FLAGS[tier] || TIER_FLAGS.free : TIER_FLAGS.pro;
  const overrides = profile && profile.flagOverrides && typeof profile.flagOverrides === "object" ? profile.flagOverrides : {};
  const out = { ...base };
  for (const k of FLAG_KEYS) if (k in overrides) out[k] = overrides[k];
  return out;
}

// flagOf(flags, key) → the flag's value (boolean or number). A missing key falls back to the most
// RESTRICTIVE (free) value, so a malformed flags map can never accidentally unlock a gate.
export function flagOf(flags, key) {
  if (flags && key in flags) return flags[key];
  return key in TIER_FLAGS.free ? TIER_FLAGS.free[key] : false;
}

// ── Layer 2: entitlement → tier ──────────────────────────────────────────────────────────────────────
// PURE — no DOM, no clock. The CALLER supplies `nowMs` (never Date.now here), so these stay deterministic +
// testable. An entitlement is the validated proof of purchase ({ status, expiresAt? } — Lemon-Squeezy-shaped);
// the stored `tier` alone can't fake Pro — it must be BACKED by a currently-active entitlement (resolveTier).

// entitlementActive(entitlement, nowMs) → true iff the entitlement is "active" AND not past its expiry.
// A missing/blank expiresAt = perpetual (never expires). A malformed entitlement → false (restrictive).
export function entitlementActive(entitlement, nowMs) {
  if (!entitlement || typeof entitlement !== "object" || entitlement.status !== "active") return false;
  if (entitlement.expiresAt != null) {
    const exp = Number(entitlement.expiresAt);
    if (Number.isFinite(exp) && Number(nowMs) > exp) return false;
  }
  return true;
}

// resolveTier(profile, nowMs) → the EFFECTIVE tier. "pro" iff the stored tier is pro AND the entitlement is
// currently active; otherwise "free". This is what every gate reads through (resolveFlags), so a stored
// tier:"pro" with no/expired entitlement can never unlock Pro.
export function resolveTier(profile, nowMs) {
  const p = profile && typeof profile === "object" ? profile : {};
  return p.tier === "pro" && entitlementActive(p.entitlement, nowMs) ? "pro" : "free";
}

// clampEntitlement(raw) → a sane { status, expiresAt? } or undefined. status must be a non-empty string;
// expiresAt is kept only when finite. Everything else drops (no passthrough of untrusted fields).
function clampEntitlement(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.status !== "string" || !raw.status) return undefined;
  const ent = { status: raw.status };
  if (raw.expiresAt != null) {
    const exp = Number(raw.expiresAt);
    if (Number.isFinite(exp)) ent.expiresAt = exp;
  }
  return ent;
}

// clampProfile(raw) → a sanitized profile { tier, flagOverrides?, licenseKey?, instanceId?, entitlement?,
// checkedAt? }. Unknown/invalid drops; default free. flagOverrides keeps only known keys with the right TYPE
// (maxSets = a finite int ≥ 0; the rest boolean). The Layer-2 payment fields are OPTIONAL and individually
// clamped: licenseKey = a non-empty string · instanceId = a non-empty string (the Lemon-Squeezy activation
// instance that holds this device's SEAT) · entitlement = a sane {status, expiresAt?} · checkedAt = a finite
// ms ≥ 0. Emit order is stable (tier → flagOverrides → licenseKey → instanceId → entitlement → checkedAt).
export function clampProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const out = { tier: p.tier === "pro" ? "pro" : "free" };
  const fo = {};
  if (p.flagOverrides && typeof p.flagOverrides === "object") {
    for (const k of FLAG_KEYS) {
      if (!(k in p.flagOverrides)) continue;
      const v = p.flagOverrides[k];
      if (k === "maxSets") {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) fo[k] = Math.floor(n);
      } else if (typeof v === "boolean") fo[k] = v;
    }
  }
  if (Object.keys(fo).length) out.flagOverrides = fo;
  if (typeof p.licenseKey === "string" && p.licenseKey) out.licenseKey = p.licenseKey;
  if (typeof p.instanceId === "string" && p.instanceId) out.instanceId = p.instanceId;
  const ent = clampEntitlement(p.entitlement);
  if (ent) out.entitlement = ent;
  if (p.checkedAt != null) {
    const ca = Number(p.checkedAt);
    if (Number.isFinite(ca) && ca >= 0) out.checkedAt = ca;
  }
  return out;
}

// ── Layer 2 (web wiring): Lemon-Squeezy responses → entitlement / seat ─────────────────────────────────
// These map the parsed JSON from Lemon-Squeezy's public License API to the seam's result shapes. ALL PURE —
// no fetch, no clock: the WEB entry (src/main.ts) does the network calls and hands the JSON here, so this
// stays in the engine (testable) while app.js + the offline Figma bundle stay network-free. A license is
// good only when LS reports the key `active`; an ISO `expires_at` maps to entitlement.expiresAt (ms,
// re-checked by entitlementActive at gate time). `storeId` PINS to one store (FAIL-CLOSED), so a key from a
// DIFFERENT Lemon-Squeezy store is rejected. Every failure is a friendly, user-safe message (no raw detail).
const LICENSE_GENERIC_ERROR = "We couldn't validate that license key. Check it and try again.";

// storePinFails(json, storeId) → an error string when the response's store doesn't match the pinned one
// (FAIL-CLOSED: a missing meta.store_id also fails), else null. Shared by validate + activate.
function storePinFails(json, storeId) {
  if (storeId == null) return null;
  const respStore = json && json.meta && json.meta.store_id;
  if (respStore == null || String(respStore) !== String(storeId)) return "That license key is for a different product.";
  return null;
}

// licenseKeyResult(lk) → { entitlement } when the key object is `active`, else { error } (friendly per status).
function licenseKeyResult(lk) {
  const key = lk && typeof lk === "object" ? lk : {};
  if (key.status !== "active") {
    const error =
      key.status === "expired" ? "That license has expired — renew it from your account to continue." :
      key.status === "disabled" ? "That license has been disabled. Contact support if that's unexpected." :
      LICENSE_GENERIC_ERROR;
    return { error };
  }
  const entitlement = { status: "active" };
  if (key.expires_at) {
    const t = Date.parse(key.expires_at);
    if (Number.isFinite(t)) entitlement.expiresAt = t;
  }
  return { entitlement };
}

// lemonEntitlement(json, opts?) → { ok, entitlement?, error? } from a POST /v1/licenses/validate response —
// the (re)check path. Requires valid:true AND an active key.
export function lemonEntitlement(json, { storeId = null } = {}) {
  if (!json || typeof json !== "object") return { ok: false, error: LICENSE_GENERIC_ERROR };
  const pin = storePinFails(json, storeId);
  if (pin) return { ok: false, error: pin };
  if (json.valid !== true) {
    const r = licenseKeyResult(json.license_key);
    return { ok: false, error: r.error || LICENSE_GENERIC_ERROR };
  }
  const r = licenseKeyResult(json.license_key);
  return r.entitlement ? { ok: true, entitlement: r.entitlement } : { ok: false, error: r.error };
}

// lemonActivation(json, opts?) → { ok, entitlement?, instanceId?, error? } from a POST /v1/licenses/activate
// response — the SEAT-CONSUMING path. activated:true means a seat was taken AND instance.id is the handle to
// release it later (deactivate). activated:false is the rejection: a seat-limit hit becomes a friendly
// message that names the seat count; otherwise the key's own status (expired/disabled) or LS's error message.
export function lemonActivation(json, { storeId = null } = {}) {
  if (!json || typeof json !== "object") return { ok: false, error: LICENSE_GENERIC_ERROR };
  const pin = storePinFails(json, storeId);
  if (pin) return { ok: false, error: pin };
  if (json.activated !== true) {
    const lk = json.license_key || {};
    const limit = Number(lk.activation_limit);
    if (Number.isFinite(limit) && Number(lk.activation_usage) >= limit) {
      return { ok: false, error: `All ${limit} seat${limit === 1 ? "" : "s"} on this license are in use. Free one up by removing the license on another device, or add a seat.` };
    }
    const r = licenseKeyResult(lk); // a status-based message if the key itself is expired/disabled
    return { ok: false, error: r.error || (typeof json.error === "string" && json.error) || LICENSE_GENERIC_ERROR };
  }
  const r = licenseKeyResult(json.license_key);
  if (!r.entitlement) return { ok: false, error: r.error };
  const inst = json.instance;
  const instanceId = inst && typeof inst === "object" && inst.id != null ? String(inst.id) : undefined;
  return { ok: true, entitlement: r.entitlement, instanceId };
}

// lemonDeactivation(json) → { ok } from a POST /v1/licenses/deactivate response. Best-effort (freeing a
// seat); a falsy/garbage response is just { ok:false } and the caller still clears the local license.
export function lemonDeactivation(json) {
  return { ok: !!(json && typeof json === "object" && json.deactivated === true) };
}
