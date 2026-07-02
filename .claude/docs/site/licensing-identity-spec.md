# Licensing identity — email-bound licenses (decision record + plan)

**Decided 2026-07-02:** the unit of license enforcement is the **email**, not the device. A license
unlocks **any number of computers and Figma installs** as long as the person using it is the person
the license belongs to — i.e. their email matches the key's associated email. Device/activation
counts stop being the seat model; they remain only as an abuse backstop.

Related records: `mcp-hosting-spec.md` (Phase B introduces the NONOUN account = email magic-link —
the same identity this spec leans on) · `storage-and-sync-spec.md` (the account the kits sync to) ·
`.claude/docs/marketing/store-copy.md` §3 (the customer-facing seat copy this eventually rewrites).

## What Lemon Squeezy already gives us (no new purchase-side work)

The email ↔ license association **already exists at purchase**:

- Every License API `validate`/`activate` response carries `meta.customer_email` (+ `customer_id`,
  `customer_name`) — see `lemon-squeezy-api` references §6.
- The main-API `license-keys` resource carries `user_email`; orders/subscriptions carry
  `user_name`/`user_email`; `order_created` / subscription webhooks deliver them server-side — see
  `lemon-squeezy-schemas`.

So "associate an email with a license #" is done by LS on day one. The work is **verifying that the
person presenting the key owns that email**, and moving enforcement onto that check.

## Phase 1 — interim, client-only (no accounts needed; ships with today's architecture)

1. **Dashboard:** set `license_activation_limit` high enough to never bind one person (e.g. **25**,
   Pro and Studio-per-seat alike) — activations stop being seats and become an abuse ceiling only.
2. **App:** the Account panel asks for **email + license key** (today: key only). On
   activate/validate, the mapper compares the entered email to `meta.customer_email`
   (case-insensitive, trimmed). Mismatch → reject as an anomaly (the same fail-closed posture as the
   store/product pins in `src/engine/flags.js` — a mismatch is never `revoked`).
3. **Honesty note (claim discipline):** this proves *knowledge* of the purchase email, not ownership
   of the inbox — friction against key-sharing, not cryptography. Customer copy may say "your
   license works on all your devices — it's tied to your email"; it may NOT say "secure" or
   "verified" until Phase 2.

Code touchpoints when Phase 1 is built: `src/engine/flags.js` (`lemonActivation`/`lemonEntitlement`
gain an `email` opt + `emailMatch` check, unit-tested on match/mismatch/casing), `src/main.ts`
(`_licenseService` passes the email through), `src/ui/app.js` (Account panel email field +
microcopy via the marketing corpus).

## Phase 2 — verified identity (rides mcp-hosting Phase B; the real thing)

- **Magic-link verification:** the NONOUN account (email, verified by link — the Phase B Worker)
  becomes the identity; the app validates key + *verified session email* against the LS association.
- **Server-side roster:** LS webhooks upsert `license ↔ email` into D1 on `order_created` /
  subscription events; "enter license key to link" remains the fallback for mismatched purchase
  emails.
- **Studio becomes named seats:** a seat = a **person (email)**, 5 included (+$19/seat/year), devices
  unlimited per person. The seat roster lives with the account system; LS activation instances stop
  being the seat ledger. Seat management UI = assign/remove emails.
- **Figma plugin stays offline and free** — identity never enters the plugin.

## What does NOT change yet

- **Shipped behavior (#131) stays as-is until Phase 1 lands:** device activation consumes an
  activation; `enterLicense`→activate, `clearLicense`→deactivate.
- **Customer copy** keeps describing shipped behavior (store-copy §3 context notes point here).
  When Phase 1 ships, the variant descriptions + FAQ move to "tied to your email, works on all your
  devices" — through the `color-tokens-brand-voice` loop.
- **Go-live (#158) does not wait for this.** The flip is orthogonal; only the runbook's
  activation-limit guidance changes (high ceiling, not 3–5).

## Comms decision (same date)

All customer communication eventually comes and goes from **support@nonoun.io** — lifecycle emails
(cancellation, ended, renewal) will route through our own mailer sending as support@nonoun.io once
one exists; LS-native emails carry the copy until then. `{{SUPPORT_EMAIL}}` is pinned to
support@nonoun.io across the corpus.
