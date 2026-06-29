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

// clampProfile(raw) → a sanitized profile { tier, flagOverrides?, licenseKey?, entitlement?, checkedAt? }.
// Unknown/invalid drops; default free. flagOverrides keeps only known keys with the right TYPE (maxSets =
// a finite int ≥ 0; the rest boolean). The Layer-2 payment fields are OPTIONAL and individually clamped:
// licenseKey = a non-empty string · entitlement = a sane {status, expiresAt?} · checkedAt = a finite ms ≥ 0.
// Emit order is stable (tier → flagOverrides → licenseKey → entitlement → checkedAt) so JSON round-trips.
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
  const ent = clampEntitlement(p.entitlement);
  if (ent) out.entitlement = ent;
  if (p.checkedAt != null) {
    const ca = Number(p.checkedAt);
    if (Number.isFinite(ca) && ca >= 0) out.checkedAt = ca;
  }
  return out;
}

// ── Layer 2 (web wiring): Lemon-Squeezy response → entitlement ─────────────────────────────────────────
// lemonEntitlement(json, opts?) → the license SEAM's { ok, entitlement?, error? } from a Lemon-Squeezy
// POST /v1/licenses/validate response. PURE — no fetch, no clock: the WEB entry (src/main.ts) does the
// network call and hands the parsed JSON here, so this stays in the engine (testable) while app.js + the
// offline Figma bundle stay network-free. A key is good ONLY when LS reports valid:true AND
// license_key.status === "active"; an ISO `expires_at` maps to entitlement.expiresAt (ms, re-checked by
// entitlementActive at gate time). Optional `storeId` PINS activation to one store, so a valid key from a
// DIFFERENT Lemon-Squeezy store is rejected. Every failure is a friendly, user-safe message (no raw detail).
export function lemonEntitlement(json, { storeId = null } = {}) {
  const GENERIC = "We couldn't validate that license key. Check it and try again.";
  if (!json || typeof json !== "object") return { ok: false, error: GENERIC };
  const lk = json.license_key && typeof json.license_key === "object" ? json.license_key : {};
  // Store pinning is FAIL-CLOSED: once a storeId is configured, the key must carry a matching meta.store_id.
  // A missing store_id (or a mismatch) is rejected — a pinned gate never opens on an unverifiable response.
  if (storeId != null) {
    const respStore = json.meta && json.meta.store_id;
    if (respStore == null || String(respStore) !== String(storeId)) {
      return { ok: false, error: "That license key is for a different product." };
    }
  }
  if (json.valid !== true || lk.status !== "active") {
    const error =
      lk.status === "expired" ? "That license has expired — renew it from your account to continue." :
      lk.status === "disabled" ? "That license has been disabled. Contact support if that's unexpected." :
      GENERIC;
    return { ok: false, error };
  }
  const entitlement = { status: "active" };
  if (lk.expires_at) {
    const t = Date.parse(lk.expires_at);
    if (Number.isFinite(t)) entitlement.expiresAt = t;
  }
  return { ok: true, entitlement };
}
