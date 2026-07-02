---
name: lemon-squeezy-schemas
description: >
  Use when reading, validating, mapping, or mocking ANY Lemon Squeezy payload — a webhook body, a
  main-API response, a License API result — or asking what an LS object contains ("what fields does
  an order have", "parse this subscription_updated webhook", "which statuses can a license key be
  in", "map the LS customer to our account model", "mock an LS order for a test"). The JSON:API
  object schemas for all 19 resources (store · product · variant · price · checkout · order ·
  order-item · customer · subscription · subscription-invoice · subscription-item · usage-record ·
  discount · discount-redemption · license-key · license-key-instance · file · webhook · affiliate),
  attributes + enums + relationship graph. For calling the API (auth, endpoints, webhook signing),
  use lemon-squeezy-api.
---

# Lemon Squeezy object schemas

**Never write an LS field name from memory — look it up in
[`references/objects.md`](references/objects.md)** (every attribute, enum, and relationship for all
19 resources, distilled from docs.lemonsqueezy.com 2026-07-02 and cross-checked against the official
TypeScript SDK). LS adds fields backwards-compatibly, so unknown-field tolerance is required in
parsers; absent-field tolerance is not (absence usually means you read the wrong object).

## The envelope (all main-API resources)

JSON:API throughout: `{ data: { type, id, attributes, relationships }, included?, meta?, links? }` —
`id` is a **string** (numeric inside), timestamps are ISO-8601 UTC, money is **integer cents** (USD
unless the attribute says otherwise), `test_mode` rides most objects. Webhook bodies are the same
resource shape plus `meta: { event_name, custom_data? }`.

## The two license shapes (the classic confusion)

- The **main-API `license-keys` resource** (Bearer-auth, JSON:API) — has `activation_limit`,
  `instances_count`, `disabled`, relationships to store/customer/order/product.
- The **License API response objects** (public endpoints; what a browser sees) — a FLAT
  `{ valid/activated, error, license_key: {…}, instance: {…}, meta: {…} }`, **not** JSON:API. The
  `meta` there carries `store_id` / `product_id` / customer fields — it is the only place the
  client can pin provenance.

This repo consumes the second shape only: the fail-closed mappers in `src/engine/flags.js`
(`lemonEntitlement` / `lemonActivation` — pinned to store `420293` + product ids in `src/main.ts`)
are the canonical example of defensive parsing: wrong store/product → rejected, malformed → anomaly,
never a silent unlock.

## Working with payloads

1. Identify the resource: `data.type` (main API / webhooks) or the endpoint you called (License API).
2. Open the object's section in [`references/objects.md`](references/objects.md); map only fields
   that exist there — enums verbatim (e.g. subscription `status` values), cents left as integers
   until display.
3. For webhook bodies, the event name lives in `meta.event_name`, never in `data`.
4. Validate the mapping the way `test/engine/flags.mjs` does for the license mappers: feed the
   documented success shape AND the documented failure/edge shapes (expired, disabled, wrong store)
   — a mapper only tested on the happy shape is untested.
