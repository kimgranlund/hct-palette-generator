# Lemon Squeezy API — endpoints & mechanics reference

Dense lookup reference for calling the Lemon Squeezy APIs. Two distinct APIs:
the **main API** (`/v1/…`, Bearer-authenticated, JSON:API) and the **License API**
(`/v1/licenses/…`, unauthenticated, plain JSON). Do not mix their conventions.

## 1. Main API mechanics

- **Base URL**: `https://api.lemonsqueezy.com/v1/` — HTTPS only; plain-HTTP calls fail.
- **Auth**: `Authorization: Bearer {api_key}`. Keys are created/managed in Lemon Squeezy
  account **Settings → API**. Keys exist in **live mode** and **test mode** (a test-mode key
  interacts with test-mode store data; create a live-mode key for production). Generated
  keys are **valid for a year**. Never expose keys client-side.
- **Required headers** (per the JSON:API spec, on ALL requests):

  ```
  Accept: application/vnd.api+json
  Content-Type: application/vnd.api+json
  ```

- **CORS/null-Origin escape hatch**: requests with a null `Origin` header (e.g. from a
  sandboxed iframe in a Figma plugin) can use the proxy base
  `https://api-cors-anywhere.lemonsqueezy.com` instead.
- **Rate limit**: **300 API calls per minute**. Successful responses carry
  `X-Ratelimit-Limit` and `X-Ratelimit-Remaining` headers; exceeding the limit returns
  `429 Too Many Requests`.
- **Versioning**: the major version prefixes every endpoint (`/v1`). Lemon Squeezy
  endeavours not to break backwards compatibility; a true breaking change ships as a new
  major version with the old one deprecated. Documented as **backwards-compatible** (your
  client must tolerate all of these):
  - adding new API resources
  - adding new optional request parameters to existing methods
  - adding new properties to existing responses
  - changing the order of properties in existing responses
  - adding new webhook event types
- **Responses**: JSON:API documents. Top-level `data` (object or array) with `type`, `id`
  (a string), `attributes`, plus optional `relationships`, `links`, `meta`. List responses
  add `meta.page`, `links.first/last/next/prev`, and `jsonapi: {"version": "1.0"}`.
- **Errors**: conventional HTTP codes — 2xx success, 4xx caller error, 5xx server (rare).
  Every 4xx body is a JSON:API errors array; each error object usually has `detail`,
  `status`, `title`:

  ```json
  {
    "jsonapi": { "version": "1.0" },
    "errors": [
      { "detail": "Unauthenticated.", "status": "401", "title": "Unauthorized" }
    ]
  }
  ```

## 2. Query conventions

- **Pagination** (all list endpoints, page-based): `page[number]` selects the page,
  `page[size]` sets results per page — **default 10, min 1, max 100**.
  `GET /v1/orders?page[number]=3&page[size]=100`.
  Responses include URL-encoded `links.first/last/next/prev` (absent `next` ⇒ last page;
  absent `prev` ⇒ first page) and a `meta.page` object:
  `{ "currentPage": 3, "from": 21, "lastPage": 5, "perPage": 10, "to": 30, "total": 47 }`.
- **Filtering** (list endpoints, by related object or value): `?filter[{parameter}]={value}`,
  combinable — e.g. `GET /v1/subscriptions?filter[product_id]=2`,
  `GET /v1/subscription-invoices?filter[status]=open&filter[store_id]=1`.
  Available filter parameters are per-resource; each "List all X" doc page states its own
  (most list endpoints accept `filter[store_id]`; child resources accept their parent id,
  e.g. `filter[subscription_id]`, `filter[order_id]`, `filter[product_id]`).
- **Including related resources**: `?include={relationship}` returns a top-level `included`
  array — e.g. `GET /v1/products/100?include=variants`. Relationship names come from each
  object's `relationships` block.
- **Nested queries**: fetch related objects without the parent via the `related` links,
  e.g. `GET /v1/products/100/variants`, `GET /v1/stores/1/orders`.
- **Sorting**: not documented as a general convention; the API's own pagination links show
  `sort` in use (e.g. `sort=-createdAt` on orders, `sort=name` on stores — `-` = descending).
  Only rely on `sort` where a specific endpoint documents it.
- **Sparse fieldsets**: not documented; do not rely on `fields[...]`.

## 3. Endpoint map

All paths relative to `https://api.lemonsqueezy.com`. `:id` = resource id.

| Resource | Endpoints |
|---|---|
| Users | `GET /v1/users/me` (retrieve the authenticated user) |
| Stores | `GET /v1/stores/:id` · `GET /v1/stores` |
| Customers | `POST /v1/customers` · `GET /v1/customers/:id` · `PATCH /v1/customers/:id` · `GET /v1/customers` |
| Products | `GET /v1/products/:id` · `GET /v1/products` |
| Variants | `GET /v1/variants/:id` · `GET /v1/variants` |
| Prices | `GET /v1/prices/:id` · `GET /v1/prices` |
| Files | `GET /v1/files/:id` · `GET /v1/files` |
| Orders | `GET /v1/orders/:id` · `GET /v1/orders` · `POST /v1/orders/:id/generate-invoice` · `POST /v1/orders/:id/refund` |
| Order items | `GET /v1/order-items/:id` · `GET /v1/order-items` |
| Subscriptions | `PATCH /v1/subscriptions/:id` (update) · `GET /v1/subscriptions/:id` · `GET /v1/subscriptions` · `DELETE /v1/subscriptions/:id` (cancel) |
| Subscription invoices | `GET /v1/subscription-invoices/:id` · `GET /v1/subscription-invoices` · `POST /v1/subscription-invoices/:id/generate-invoice` · `POST /v1/subscription-invoices/:id/refund` |
| Subscription items | `GET /v1/subscription-items/:id` · `GET /v1/subscription-items/:id/current-usage` · `PATCH /v1/subscription-items/:id` · `GET /v1/subscription-items` |
| Usage records | `POST /v1/usage-records` · `GET /v1/usage-records/:id` · `GET /v1/usage-records` |
| Discounts | `POST /v1/discounts` · `GET /v1/discounts/:id` · `DELETE /v1/discounts/:id` · `GET /v1/discounts` |
| Discount redemptions | `GET /v1/discount-redemptions/:id` · `GET /v1/discount-redemptions` |
| License keys | `GET /v1/license-keys/:id` · `PATCH /v1/license-keys/:id` · `GET /v1/license-keys` |
| License key instances | `GET /v1/license-key-instances/:id` · `GET /v1/license-key-instances` |
| Checkouts | `POST /v1/checkouts` · `GET /v1/checkouts/:id` · `GET /v1/checkouts` |
| Webhooks | `POST /v1/webhooks` · `GET /v1/webhooks/:id` · `PATCH /v1/webhooks/:id` · `DELETE /v1/webhooks/:id` · `GET /v1/webhooks` |
| Affiliates | `GET /v1/affiliates/:id` · `GET /v1/affiliates` |

Action-endpoint notes:
- `POST /v1/orders/:id/refund` and `POST /v1/subscription-invoices/:id/refund` take an
  optional `amount` attribute (cents); omitted ⇒ full refund.
- `POST …/generate-invoice` (orders + subscription-invoices) takes `name`, `address`,
  `city`, `state` (required for US/CA), `zip_code`, `country`, optional `notes`, `locale`
  — LS has announced these address fields will soon become **required**.
- `GET /v1/subscription-items/:id/current-usage` is usage-based-billing only (404
  otherwise); returns a `meta` object: `period_start`, `period_end`, `quantity`,
  `interval_unit` (`day|week|month|year`), `interval_quantity`.
- `POST /v1/usage-records` body: attributes `quantity` (positive int), `action`
  (`increment` default | `set`), relationship `subscription-item`.
- `DELETE /v1/discounts/:id` returns `204 No Content`.
- Create/update bodies are JSON:API: `{"data": {"type": "<plural-type>", ["id": "<id>",] "attributes": {…}, "relationships": {…}}}` — `id` is required in the body for PATCH.

## 4. Create a checkout — deep dive

`POST /v1/checkouts`. Creates a unique checkout URL for a specific variant. All attributes
optional; the **relationships block is required** (`store` + `variant`).

Attributes:

- `custom_price` — positive integer in **cents**, overrides the variant price. For
  subscriptions it is used for all renewals; if the subscription later changes variant, the
  new variant's price takes over.
- `product_options` — overrides for this checkout:
  `name`, `description`, `media` (array of image URLs), `redirect_url` (after successful
  purchase), `receipt_button_text`, `receipt_link_url`, `receipt_thank_you_note`,
  `enabled_variants` (array of variant IDs to show; empty ⇒ all variants enabled).
- `checkout_options` — checkout page behaviour/branding:
  `embed` (true ⇒ checkout overlay), `media`, `logo`, `desc`, `discount` (false ⇒ hide
  discount-code field), `skip_trial` (true ⇒ remove free trial), `subscription_preview`
  (false ⇒ hide "You will be charged…" text), color overrides (`background_color`,
  `headings_color`, `primary_text_color`, `secondary_text_color`, `links_color`,
  `borders_color`, `checkbox_color`, `active_state_color`, `button_color`,
  `button_text_color`, `terms_privacy_color` — hex), `locale` (ISO 639 code, overrides
  store/browser locale; defaults `null`), `dark` (deprecated in favor of color options).
- `checkout_data` — prefill + custom data:
  `email`, `name`, `billing_address.country` (ISO 3166-1 alpha-2), `billing_address.zip`,
  `tax_number`, `discount_code`, `custom` (arbitrary object passed through to webhooks as
  `meta.custom_data`, e.g. `"custom": {"user_id": "123"}`), `variant_quantities` (list of
  `{"variant_id": 123, "quantity": 3}` objects).
- `expires_at` — ISO 8601 date-time when the checkout expires; `null` ⇒ perpetual.
- `preview` — boolean; if true the response includes a `preview` object (currency,
  subtotal/discount_total/tax/total, `*_usd` and `*_formatted` variants).
- `test_mode` — boolean; create the checkout in test mode.

Relationships: `store` (the store the checkout belongs to) and `variant` (the variant sold).
By default all variants of the product are shown with the selected one highlighted — use
`product_options.enabled_variants` to restrict.

Minimal working request:

```json
POST /v1/checkouts
{
  "data": {
    "type": "checkouts",
    "attributes": {
      "checkout_data": { "email": "user@example.com", "custom": { "user_id": "123" } }
    },
    "relationships": {
      "store":   { "data": { "type": "stores",   "id": "1" } },
      "variant": { "data": { "type": "variants", "id": "1" } }
    }
  }
}
```

Returns a Checkout object; the shareable checkout link is `data.attributes.url` (a signed
`…/checkout/custom/{uuid}?expires=…&signature=…` URL). Checkout ids are UUIDs.

## 5. Update a subscription — deep dive

`PATCH /v1/subscriptions/:id` (body must carry `"type": "subscriptions"` and the `"id"`).
Used to upgrade/downgrade plans, pause collection, change the billing date, cancel/resume.

Attributes:

- `variant_id` — the Variant to switch the subscription to. Required when changing
  product/variant. **Proration default**: the next bill is prorated (e.g. $50 plan bought
  Apr 1, upgraded to $100 on Apr 15 ⇒ May 1 charge = $100 renewal + $50 used time − $25
  unused credit = $125). Downgrades issue a credit applied to the next invoice. A plan
  change bills immediately / moves the billing date if the billing cycle changes
  (monthly→yearly etc.), the subscription stops/starts being free, or a trial starts/ends.
- `invoice_immediately` — if `true`, updates are charged immediately: a new prorated
  invoice is generated and payment attempted. Default `false`. Overridden by
  `disable_prorations` if both set.
- `disable_prorations` — if `true`, no proration is charged; the customer simply pays the
  new price at the next renewal. Default `false`. Overrides `invoice_immediately`.
- `pause` — payment-collection pause object, or `null` to unpause:
  - `mode`: `void` (don't charge — services unavailable, invoices voided) or
    `free` (keep the service running free while collection is halted)
  - `resumes_at` (optional): ISO 8601 date-time when collection resumes
- `cancelled` — `true` cancels the subscription (enters a grace period until `ends_at`);
  set back to `false` before `ends_at` to resume.
- `trial_ends_at` — ISO 8601 date-time when the free trial should end.
- `billing_anchor` — integer day-of-month (1–31) on which invoices are collected; the
  change takes effect at the next occurrence of that day (a paid, prorated trial bridges
  the gap, charged in full when it ends). If a month lacks the day (e.g. 31 in November),
  the customer is charged on the month's last day. `null` or `0` resets the anchor to the
  current date and removes any active trial.

**PayPal caveat**: for subscriptions paid via PayPal this endpoint will NOT modify the
subscription — instead redirect the customer to
`subscription.attributes.urls.customer_portal_update_subscription`.

Returns the updated Subscription object (`status`, `pause`, `cancelled`, `trial_ends_at`,
`billing_anchor`, `first_subscription_item`, `urls.update_payment_method`,
`urls.customer_portal`, `renews_at`, `ends_at`, …).

Cancel = `DELETE /v1/subscriptions/:id` → returns the subscription in `cancelled` state.

## 6. The License API (separate API — different rules)

Endpoints live under `https://api.lemonsqueezy.com/v1/licenses/`. This is a **separate API
from the main Lemon Squeezy API** with different requirements:

- **No `Authorization` header** — requests authenticate by the license key itself
  (safe to call from client-side/app code; keys are managed per-order in LS).
- Headers: `Accept: application/json` on all requests; POST bodies use
  `Content-Type: application/x-www-form-urlencoded` (per the docs; parameters are simple
  form fields, not JSON:API documents).
- Responses: always plain JSON (not JSON:API).
- **Rate limit: 60 requests per minute.**
- Errors: 4XX status + an `error` string field in the body.
  Documented codes: `400` an error occurred (see `error`), `404` item not found,
  `422` a required field invalid or missing.

`license_key.status` is one of: `inactive` (valid, no activations), `active` (≥1
activation), `expired` (expiry passed — product license length or subscription expired),
`disabled` (manually disabled in the dashboard).

Shared response objects (all three endpoints):

- `license_key`: `{ "id", "status", "key", "activation_limit", "activation_usage",
  "created_at", "expires_at" }` — `id` can be used against the main API
  (`GET /v1/license-keys/:id`); `expires_at` may be `null`.
- `meta`: `{ "store_id", "order_id", "order_item_id", "product_id", "product_name",
  "variant_id", "variant_name", "customer_id", "customer_name", "customer_email" }` —
  the id fields link back to main-API resources; names/emails are convenience copies.
- `error`: message string, `null` on success.

### POST /v1/licenses/activate

Parameters: `license_key` (required), `instance_name` (required — a label identifying the
new instance in Lemon Squeezy).

Returns: `activated` (boolean) · `error` · `license_key` · `instance` · `meta`.
`instance` = `{ "id": "<uuid>", "name": "<instance_name>", "created_at": "<ISO 8601>" }` —
**store `instance.id`; it is required to deactivate (and to validate a specific instance).**

Failure example (HTTP 400): `{ "activated": false, "error": "This license key has reached
the activation limit.", "license_key": {…}, "meta": {…} }`.

### POST /v1/licenses/validate

Parameters: `license_key` (required), `instance_id` (optional — if included, validates
that license key instance; otherwise validates the key itself and the response contains
`"instance": null`).

Returns: `valid` (boolean) · `error` · `license_key` · `instance` (or `null`) · `meta`.
An invalid/not-found key yields `valid: false` with an `error` string (HTTP 400/404).

### POST /v1/licenses/deactivate

Parameters: `license_key` (required), `instance_id` (required — the id returned at
activation).

Returns: `deactivated` (boolean) · `error` · `license_key` (with decremented
`activation_usage`) · `meta`. No `instance` object is returned.

```sh
curl -X POST https://api.lemonsqueezy.com/v1/licenses/activate \
  -H "Accept: application/json" \
  -d "license_key=38b1460a-5104-4067-a91d-77b872934d51" \
  -d "instance_name=my-machine"
```

## 7. Webhooks

**Creating**: dashboard **Settings → Webhooks**, or via the API (`POST /v1/webhooks` with
attributes `url` (required), `events` (required array of event types), `secret` (required —
the signing secret, normally a random string 6–40 chars; never returned by the API, view it
in the dashboard), `test_mode`; relationship `store`). Manage with
`GET/PATCH/DELETE /v1/webhooks/:id`, list with `GET /v1/webhooks`. Webhook object
attributes: `store_id`, `url`, `events`, `last_sent_at`, `created_at`, `updated_at`,
`test_mode`. Recent deliveries (payloads + resend) are logged on the dashboard webhooks
settings page.

**Delivery**: a `POST` to your URL with headers
`Content-Type: application/json` · `X-Event-Name: <event>` · `X-Signature: <hmac>`.
HTTPS callback URLs get their SSL certificate verified before sending. Respond `200` to
acknowledge; any other status ⇒ **up to three retries with exponential backoff
(≈5s, 25s, 125s)**, then the delivery is marked failed and not retried.

**Payload envelope**: the body is the JSON:API resource object for the event, wrapped with
a `meta` block. If custom data was attached at checkout (`checkout_data.custom`), it
arrives as `meta.custom_data` on all Order, Subscription and License-key events:

```json
{
  "meta": { "event_name": "order_created", "custom_data": { "user_id": "123" } },
  "data": { "type": "orders", "id": "1", "attributes": { … }, "relationships": { … } }
}
```

**Signature verification**: `X-Signature` is an **HMAC-SHA256 hex digest of the raw request
body** keyed with the signing secret. Compare in constant time:

```js
import crypto from "node:crypto";
const digest = Buffer.from(
  crypto.createHmac("sha256", SIGNING_SECRET).update(request.rawBody).digest("hex"), "utf8");
const signature = Buffer.from(request.get("X-Signature") || "", "utf8");
if (!crypto.timingSafeEqual(digest, signature)) throw new Error("Invalid signature.");
```

Hash the **raw** body bytes — parse JSON only after verification.

**Full event list** (17 events; `Data Sent` = the JSON:API object in `data`):

| Event | Data sent | Fires when |
|---|---|---|
| `order_created` | Order | new order successfully placed |
| `order_refunded` | Order | full or partial refund on an order |
| `customer_updated` | Customer | customer data changed/updated |
| `subscription_created` | Subscription | new subscription created (an `order_created` always accompanies it) |
| `subscription_updated` | Subscription | any subscription change — the documented "catch-all" |
| `subscription_cancelled` | Subscription | cancelled by customer/store owner; grace period until next billing date, resumable |
| `subscription_resumed` | Subscription | resumed after cancellation |
| `subscription_expired` | Subscription | ended after cancellation, or dunning completed for `past_due` |
| `subscription_paused` | Subscription | payment collection paused |
| `subscription_unpaused` | Subscription | payment collection resumed after pause |
| `subscription_payment_success` | Subscription invoice | subscription payment succeeded |
| `subscription_payment_failed` | Subscription invoice | renewal payment failed |
| `subscription_payment_recovered` | Subscription invoice | successful payment after a failure (a `subscription_payment_success` always accompanies it) |
| `subscription_payment_refunded` | Subscription invoice | subscription payment refunded |
| `license_key_created` | License key | license key created from a new order (an `order_created` always accompanies it) |
| `license_key_updated` | License key | license key updated |
| `affiliate_activated` | Affiliate | affiliate activated |

Documented recommended minimum: single payments → `order_created`; subscriptions →
`subscription_created` + `subscription_payment_success` + `subscription_updated`
(`subscription_updated` fires alongside every lifecycle event after the initial payment,
so granular lifecycle events are usually redundant).

## Sources

Fetched 2026-07-02 from docs.lemonsqueezy.com:

- https://docs.lemonsqueezy.com/api (test mode, versioning, rate limiting)
- https://docs.lemonsqueezy.com/api/getting-started/requests
- https://docs.lemonsqueezy.com/api/getting-started/responses
- https://docs.lemonsqueezy.com/api/checkouts/create-checkout
- https://docs.lemonsqueezy.com/api/subscriptions/update-subscription
- https://docs.lemonsqueezy.com/api/subscriptions/cancel-subscription
- https://docs.lemonsqueezy.com/api/orders/generate-order-invoice
- https://docs.lemonsqueezy.com/api/orders/issue-refund
- https://docs.lemonsqueezy.com/api/subscription-invoices/generate-subscription-invoice
- https://docs.lemonsqueezy.com/api/subscription-invoices/issue-refund
- https://docs.lemonsqueezy.com/api/subscription-items/retrieve-subscription-item-current-usage
- https://docs.lemonsqueezy.com/api/usage-records/create-usage-record
- https://docs.lemonsqueezy.com/api/discounts/create-discount
- https://docs.lemonsqueezy.com/api/discounts/delete-discount
- https://docs.lemonsqueezy.com/api/customers/create-customer
- https://docs.lemonsqueezy.com/api/users/retrieve-user
- https://docs.lemonsqueezy.com/api/webhooks/the-webhook-object
- https://docs.lemonsqueezy.com/api/webhooks/create-webhook
- https://docs.lemonsqueezy.com/api/license-api
- https://docs.lemonsqueezy.com/api/license-api/activate-license-key
- https://docs.lemonsqueezy.com/api/license-api/validate-license-key
- https://docs.lemonsqueezy.com/api/license-api/deactivate-license-key
- https://docs.lemonsqueezy.com/help/webhooks
- https://docs.lemonsqueezy.com/help/webhooks/webhook-requests
- https://docs.lemonsqueezy.com/help/webhooks/signing-requests
- https://docs.lemonsqueezy.com/help/webhooks/event-types
