---
name: lemon-squeezy-api
description: >
  Use when calling the Lemon Squeezy API or designing/debugging an LS integration — auth and API
  keys, any endpoint (create a checkout, update/cancel a subscription, refund an order, CRUD
  webhooks, list orders/customers/license keys), the public License API (activate / validate /
  deactivate from the browser), webhook signature verification and event handling, pagination,
  filtering, rate limits, test mode ("create a checkout link", "verify X-Signature", "why am I
  getting 429/403", "change a subscriber's plan", "handle subscription_payment_failed"). For what an
  LS payload CONTAINS (attributes, enums, relationships), use lemon-squeezy-schemas.
---

# Calling the Lemon Squeezy API

**Never write an LS endpoint, parameter, or event name from memory — look it up in
[`references/endpoints.md`](references/endpoints.md)** (mechanics, the full endpoint map,
create-checkout and update-subscription deep dives, the License API contracts, webhook signing +
events; distilled from docs.lemonsqueezy.com 2026-07-02).

## Two different APIs — never mix their rules

| | Main API | License API |
|---|---|---|
| Base | `https://api.lemonsqueezy.com/v1/` | `https://api.lemonsqueezy.com/v1/licenses/` |
| Auth | `Authorization: Bearer <key>` — **a secret; server-side only, never in client code** | no Authorization header — the license key itself authenticates (safe client-side) |
| Content | JSON:API (`application/vnd.api+json` on both Accept and Content-Type) | form-encoded in (`application/x-www-form-urlencoded`), plain JSON out (not JSON:API) |
| Rate limit | 300 req/min (429 + `X-Ratelimit-*`) | 60 req/min |
| CORS | not for browsers | open — `access-control-allow-origin: *`, verified from this repo's deployed origin 2026-07-01 |

This repo's shipped integration uses the **License API only**, from the browser: `lsPost()` in
`src/main.ts` (form-encoded, 10s `AbortSignal.timeout`, 5xx→throw-as-transient, 4xx→parse-the-body)
feeding the fail-closed mappers in `src/engine/flags.js` (store pin `420293`, product pins in
`src/main.ts`). Read those two files before extending the integration — the seam design (fetch only
in `main.ts`, engines network-free) is load-bearing.

## The rules that prevent real bugs

- **A 4xx from the License API is an answer, not an error** — `{ valid:false, error }` bodies carry
  the verdict (invalid/expired key). Only 5xx/network is transient; treating 404 as "retry later"
  turns every typo'd key into an infinite spinner, treating 500 as "invalid" revokes paying users on
  an LS outage.
- **Webhooks: verify `X-Signature` (HMAC-SHA256 of the raw body) before parsing**, respond 2xx fast,
  process async. The event name is `meta.event_name`; the same event fires for dashboard actions and
  API actions.
- **Test mode is a parallel universe**: test-mode API keys only see test-mode data; a
  `test_mode: true` object in a live handler means a key/store mix-up, not a customer.
- **Money is integer cents** end to end; format at display only.
- **Store + product pinning**: any client-visible license flow must reject keys from foreign
  stores/products (`lemonEntitlement(json, { storeId, productIds })` is the house pattern — fail
  closed, treat a mismatch as an anomaly rather than `revoked`).

## Loop

Design the call → check the endpoint + params against
[`references/endpoints.md`](references/endpoints.md) → for payload fields, cross to
`lemon-squeezy-schemas` → build against **test mode** first → assert the failure shapes (429, 4xx
verdicts, signature mismatch) before the happy path.
