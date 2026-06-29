#!/usr/bin/env node
// flags.mjs — verifier for the feature-flag substrate (src/engine/flags.js). Pure, no DOM.
import * as F from "../../src/engine/flags.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── the tier tables: every key has a free + pro value; maxSets is valued, the rest boolean ──
ok(F.FLAG_KEYS.length >= 1 && F.FLAG_KEYS.every((k) => k in F.TIER_FLAGS.free && k in F.TIER_FLAGS.pro), "every FLAG_KEY has a free + pro value");
ok(F.TIER_FLAGS.free.maxSets === 2 && F.TIER_FLAGS.pro.maxSets === Infinity, `free caps brand kits at 2; pro unlimited (got ${F.TIER_FLAGS.free.maxSets}/${F.TIER_FLAGS.pro.maxSets})`);
ok(F.TIER_FLAGS.free.proExport === false && F.TIER_FLAGS.pro.proExport === true, "proExport is a pro capability");

// ── resolveFlags ENFORCED: the tier drives the values ──
{
  const free = F.resolveFlags({ tier: "free" }, { enforced: true });
  // pro REQUIRES a valid entitlement now (resolveFlags folds resolveTier) — a bare tier:"pro" is free.
  const pro = F.resolveFlags({ tier: "pro", entitlement: { status: "active" } }, { enforced: true });
  ok(free.maxSets === 2 && free.proExport === false && free.hostedMcp === false, "enforced free → the free values");
  ok(pro.maxSets === Infinity && pro.proExport === true && pro.advancedTreatments === true, "enforced pro (with an active entitlement) → the pro values");
  ok(F.resolveFlags({ tier: "nope" }, { enforced: true }).proExport === false, "an unknown tier resolves as free");
  // SPOOF CLOSED at the engine: a stored tier:"pro" with NO/expired entitlement resolves to FREE through
  // resolveFlags directly (not just app.flagOf) — a faked-tier consumer can't unlock Pro.
  ok(F.resolveFlags({ tier: "pro" }, { enforced: true }).proExport === false, "enforced tier:pro WITHOUT an entitlement → free values (entitlement gate is engine-level)");
  ok(F.resolveFlags({ tier: "pro", entitlement: { status: "active", expiresAt: 1000 } }, { enforced: true, nowMs: 2000 }).proExport === false, "enforced tier:pro with an EXPIRED entitlement (nowMs past expiry) → free values");
}

// ── resolveFlags UNENFORCED (pre-launch): everyone unlocked regardless of tier ──
{
  const f = F.resolveFlags({ tier: "free" }, { enforced: false });
  ok(f.maxSets === Infinity && f.proExport === true, "unenforced → unlocked (pro values) even for a free tier");
}

// ── the shipped switch is OFF — no feature gated before a purchase path exists (no regression today) ──
ok(F.TIERS_ENFORCED === false, "TIERS_ENFORCED ships false (pre-launch)");
ok(F.resolveFlags({ tier: "free" }).proExport === true && F.resolveFlags({ tier: "free" }).maxSets === Infinity, "with the default switch, a free user is fully unlocked (current behavior preserved)");

// ── overrides (dev / QA / early-access) win over the tier values ──
{
  const f = F.resolveFlags({ tier: "free", flagOverrides: { proExport: true, maxSets: 5 } }, { enforced: true });
  ok(f.proExport === true && f.maxSets === 5, "flagOverrides win over the tier values");
}

// ── flagOf: boolean + valued + the restrictive safe default ──
ok(F.flagOf({ proExport: true }, "proExport") === true, "flagOf returns a boolean flag");
ok(F.flagOf({ maxSets: 7 }, "maxSets") === 7, "flagOf returns a valued flag");
ok(F.flagOf({}, "proExport") === false && F.flagOf({}, "maxSets") === 2, "flagOf safe default = the restrictive (free) value");
ok(F.flagOf(null, "nope") === false, "flagOf unknown key / null flags → false");

// ── clampProfile: sanitize, default free, keep only known+typed overrides, no empty {} ──
ok(F.clampProfile(null).tier === "free" && !("flagOverrides" in F.clampProfile(null)), "clampProfile(null) → {tier:free} (no empty overrides object)");
ok(F.clampProfile({ tier: "pro" }).tier === "pro", "clampProfile keeps a valid pro tier");
ok(F.clampProfile({ tier: "garbage" }).tier === "free", "clampProfile drops an invalid tier → free");
{
  const c = F.clampProfile({ tier: "free", flagOverrides: { proExport: true, maxSets: 9.7, hostedMcp: "yes", maxSets2: 3, advancedTreatments: false } });
  ok(c.flagOverrides.proExport === true && c.flagOverrides.maxSets === 9 && c.flagOverrides.advancedTreatments === false, "clampProfile keeps valid overrides (maxSets floored to int)");
  ok(!("hostedMcp" in c.flagOverrides) && !("maxSets2" in c.flagOverrides), "clampProfile drops wrong-typed + unknown override keys");
  // round-trip: a clamped profile is idempotent through JSON
  ok(JSON.stringify(F.clampProfile(JSON.parse(JSON.stringify(c)))) === JSON.stringify(c), "a clamped profile round-trips through JSON unchanged");
}

// ── Layer 2: entitlementActive — active + unexpired only; clockless (nowMs is a param) ──
const T0 = 1_700_000_000_000; // a fixed "now"
ok(F.entitlementActive({ status: "active" }, T0) === true, "entitlementActive: active + no expiry → true (perpetual)");
ok(F.entitlementActive({ status: "active", expiresAt: T0 + 1000 }, T0) === true, "entitlementActive: active + future expiry → true");
ok(F.entitlementActive({ status: "active", expiresAt: T0 - 1000 }, T0) === false, "entitlementActive: active but past expiry → false (expired)");
ok(F.entitlementActive({ status: "disabled" }, T0) === false, "entitlementActive: a non-active status → false");
ok(F.entitlementActive(null, T0) === false && F.entitlementActive(undefined, T0) === false, "entitlementActive: missing/garbage entitlement → false");

// ── Layer 2: resolveTier — the entitlement (not the raw stored tier) drives pro ──
ok(F.resolveTier({ tier: "pro", entitlement: { status: "active" } }, T0) === "pro", "resolveTier: tier:pro + active entitlement → pro");
ok(F.resolveTier({ tier: "pro", entitlement: { status: "active", expiresAt: T0 - 1 } }, T0) === "free", "resolveTier: tier:pro + expired entitlement → free");
ok(F.resolveTier({ tier: "pro" }, T0) === "free", "resolveTier: tier:pro with NO entitlement → free (a stored tier can't fake pro)");
ok(F.resolveTier({ tier: "free", entitlement: { status: "active" } }, T0) === "free", "resolveTier: tier:free → free even with an active entitlement");
ok(F.resolveTier(null, T0) === "free", "resolveTier: garbage profile → free");

// ── Layer 2: clampProfile round-trips the optional payment fields + drops invalid ones ──
{
  const c = F.clampProfile({ tier: "pro", licenseKey: "PRO-ABCD-1234", entitlement: { status: "active", expiresAt: T0, extra: "drop-me" }, checkedAt: T0 });
  ok(c.tier === "pro" && c.licenseKey === "PRO-ABCD-1234" && c.checkedAt === T0, "clampProfile keeps a valid licenseKey + checkedAt");
  ok(c.entitlement && c.entitlement.status === "active" && c.entitlement.expiresAt === T0 && !("extra" in c.entitlement), "clampProfile clamps entitlement to a sane {status, expiresAt} shape (drops extra fields)");
  ok(JSON.stringify(F.clampProfile(JSON.parse(JSON.stringify(c)))) === JSON.stringify(c), "a Layer-2 clamped profile round-trips through JSON unchanged");
}
{
  const c = F.clampProfile({ tier: "pro", licenseKey: 42, entitlement: { status: 7 }, checkedAt: "soon" });
  ok(!("licenseKey" in c), "clampProfile drops a non-string licenseKey");
  ok(!("entitlement" in c), "clampProfile drops an entitlement whose status isn't a string");
  ok(!("checkedAt" in c), "clampProfile drops a non-numeric checkedAt");
  ok(c.tier === "pro" && Object.keys(c).join() === "tier", "an all-invalid Layer-2 profile clamps to just { tier }");
}
ok(!("expiresAt" in F.clampProfile({ entitlement: { status: "active", expiresAt: "whenever" } }).entitlement), "clampProfile drops a non-finite entitlement.expiresAt but keeps the entitlement");

// ── Layer 2 (web wiring): lemonEntitlement — map a Lemon-Squeezy /licenses/validate response → the seam ──
ok(F.lemonEntitlement({ valid: true, license_key: { status: "active" } }).ok === true, "lemonEntitlement: valid:true + active → ok");
ok(F.lemonEntitlement({ valid: true, license_key: { status: "active" } }).entitlement.expiresAt === undefined, "lemonEntitlement: no expires_at → perpetual (no expiresAt)");
{
  const iso = "2030-01-01T00:00:00.000Z";
  const r = F.lemonEntitlement({ valid: true, license_key: { status: "active", expires_at: iso } });
  ok(r.ok === true && r.entitlement.status === "active" && r.entitlement.expiresAt === Date.parse(iso), "lemonEntitlement: maps expires_at (ISO) → entitlement.expiresAt (ms)");
  // the mapped entitlement must satisfy the SAME gate enterLicense re-checks
  ok(F.entitlementActive(r.entitlement, Date.parse(iso) - 1) === true, "lemonEntitlement: its entitlement reads active before expiry through entitlementActive");
}
ok(F.lemonEntitlement({ valid: false, license_key: { status: "inactive" } }).ok === false, "lemonEntitlement: valid:false → not ok");
ok(F.lemonEntitlement({ valid: true, license_key: { status: "expired" } }).ok === false, "lemonEntitlement: status not active (even if valid flag) → not ok");
ok(/expired/i.test(F.lemonEntitlement({ valid: false, license_key: { status: "expired" } }).error), "lemonEntitlement: expired status → a friendly 'expired' message");
ok(/disabled/i.test(F.lemonEntitlement({ valid: false, license_key: { status: "disabled" } }).error), "lemonEntitlement: disabled status → a friendly 'disabled' message");
ok(F.lemonEntitlement(null).ok === false && typeof F.lemonEntitlement(null).error === "string", "lemonEntitlement: null/garbage JSON → friendly error (no throw)");
ok(F.lemonEntitlement({}).ok === false, "lemonEntitlement: empty object → not ok");
// store pinning: a valid, active key issued by a DIFFERENT Lemon-Squeezy store is rejected; a match passes.
ok(F.lemonEntitlement({ valid: true, license_key: { status: "active" }, meta: { store_id: 42 } }, { storeId: 7 }).ok === false, "lemonEntitlement: storeId mismatch → rejected");
ok(F.lemonEntitlement({ valid: true, license_key: { status: "active" }, meta: { store_id: 7 } }, { storeId: 7 }).ok === true, "lemonEntitlement: storeId match → ok");
ok(F.lemonEntitlement({ valid: true, license_key: { status: "active" } }, { storeId: 7 }).ok === false, "lemonEntitlement: storeId set but response carries no meta.store_id → rejected (fail-closed)");
ok(F.lemonEntitlement({ valid: true, license_key: { status: "active" } }).ok === true, "lemonEntitlement: storeId UNset (null) → store check skipped, any active key passes (soft-launch default)");

// ── Layer 2 (seats): lemonActivation — the seat-consuming POST /v1/licenses/activate path ──
{
  const r = F.lemonActivation({ activated: true, license_key: { status: "active" }, instance: { id: "inst-123" } });
  ok(r.ok === true && r.entitlement.status === "active" && r.instanceId === "inst-123", "lemonActivation: activated + active key → ok with the instance id (the seat handle)");
}
ok(F.lemonActivation({ activated: true, license_key: { status: "active" }, instance: { id: 99 } }).instanceId === "99", "lemonActivation: a numeric instance id is stringified");
ok(F.lemonActivation({ activated: true, license_key: { status: "active" } }).instanceId === undefined, "lemonActivation: activated but no instance object → ok, instanceId undefined");
{
  const r = F.lemonActivation({ activated: false, license_key: { status: "active", activation_limit: 5, activation_usage: 5 } });
  ok(r.ok === false && /\b5 seats\b/.test(r.error), "lemonActivation: at the activation limit → a friendly seat-limit message naming the count");
}
ok(/\b1 seat\b/.test(F.lemonActivation({ activated: false, license_key: { status: "active", activation_limit: 1, activation_usage: 1 } }).error), "lemonActivation: singular 'seat' at a 1-seat limit");
ok(/expired/i.test(F.lemonActivation({ activated: false, license_key: { status: "expired", activation_limit: 5, activation_usage: 1 } }).error), "lemonActivation: NOT at limit + an expired key → the key-status message (not a seat message)");
ok(F.lemonActivation({ activated: true, license_key: { status: "active" }, meta: { store_id: 42 } }, { storeId: 7 }).ok === false, "lemonActivation: store mismatch → rejected (fail-closed, shared with validate)");
ok(F.lemonActivation(null).ok === false && typeof F.lemonActivation(null).error === "string", "lemonActivation: null/garbage JSON → friendly error (no throw)");

// ── Layer 2 (seats): lemonDeactivation — frees a seat ──
ok(F.lemonDeactivation({ deactivated: true }).ok === true, "lemonDeactivation: deactivated:true → ok");
ok(F.lemonDeactivation({ deactivated: false }).ok === false && F.lemonDeactivation(null).ok === false && F.lemonDeactivation({}).ok === false, "lemonDeactivation: false/garbage/missing → not ok");

// clampProfile keeps a valid instanceId (the seat handle) and drops a non-string one
ok(F.clampProfile({ tier: "pro", instanceId: "inst-1" }).instanceId === "inst-1", "clampProfile keeps a string instanceId");
ok(!("instanceId" in F.clampProfile({ tier: "pro", instanceId: 42 })), "clampProfile drops a non-string instanceId");
{
  const c = F.clampProfile({ tier: "pro", licenseKey: "PRO-A-1", instanceId: "inst-1", entitlement: { status: "active" }, checkedAt: 5 });
  ok(JSON.stringify(F.clampProfile(JSON.parse(JSON.stringify(c)))) === JSON.stringify(c), "a profile with an instanceId round-trips through JSON unchanged (stable emit order)");
}

if (fails.length) { console.error(`flags FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("flags PASS — tier tables · resolveFlags · flagOf · clampProfile · entitlementActive · resolveTier · lemonEntitlement · lemonActivation · lemonDeactivation (Layer 2 + seats)");
process.exit(0);
