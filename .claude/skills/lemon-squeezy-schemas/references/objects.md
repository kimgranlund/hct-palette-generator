# Lemon Squeezy API — Object Schemas

Reference for the 19 JSON:API resources of the Lemon Squeezy main API (`https://api.lemonsqueezy.com/v1/...`).

**Conventions that hold across every object:**

- All resources follow JSON:API: `{ "data": { "type", "id", "attributes", "relationships" }, "links": ... }`. Related resources arrive under `included` when requested with `?include=`.
- `id` is always a **string**, even when numeric (`"1"`). Checkouts use a UUID string id. Foreign keys inside `attributes` (`store_id`, `customer_id`, …) are **integers**.
- Timestamps are ISO 8601 date-time strings (e.g. `"2021-08-17T09:45:53.000000Z"`).
- **All money values are integers in cents** (`999` = $9.99), in the stated currency. Order/invoice/checkout money comes in three flavours: store-currency integer (`total`), USD integer (`total_usd`), and display string (`total_formatted`). `currency_rate` is a decimal **string**.
- `test_mode` (boolean) appears on most objects (not on: store, price, order-item, subscription-item, usage-record, discount-redemption, license-key-instance; on license-key it is returned but undocumented — see that section).
- Every `status` has a display twin `status_formatted` (title-case, human-readable). Never branch on `*_formatted` fields.
- `relationships.<name>.links` carries a `related` URL (the related resource) and a `self` URL (the relationship itself).
- Signed URLs (order receipt, invoice PDF, file download, customer portal, update-payment-method, checkout URL) carry `signature=`/`expires=` query params — treat them as opaque, short-lived, and never store them long-term.

---

## Store

JSON:API type: `stores`

| attribute | type | notes |
|---|---|---|
| `name` | string | store name |
| `slug` | string | identifies the store |
| `domain` | string | `{slug}.lemonsqueezy.com` or custom domain |
| `url` | string | fully-qualified store URL |
| `avatar_url` | string | store avatar image URL |
| `plan` | string | LS billing plan (e.g. `fresh`, `sweet`) |
| `country` | string | ISO 3166-1 alpha-2 (e.g. `US`) |
| `country_nicename` | string | full country name |
| `currency` | string | ISO 4217 store currency (e.g. `USD`) |
| `total_sales` | integer | all-time sales count |
| `total_revenue` | integer | cents, USD, all-time |
| `thirty_day_sales` | integer | sales count, last 30 days |
| `thirty_day_revenue` | integer | cents, USD, last 30 days |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on stores.

Relationships: has many Products, Orders, Subscriptions, License Keys.

## Product

JSON:API type: `products`

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `name` | string | product name |
| `slug` | string | identifies the product |
| `description` | string | HTML |
| `status` | string | `draft` \| `published` |
| `status_formatted` | string | display form |
| `thumb_url` | string\|null | 100x100 thumbnail, if one exists |
| `large_thumb_url` | string\|null | 1000x1000 thumbnail, if one exists |
| `price` | integer | cents |
| `price_formatted` | string | e.g. `$9.99` |
| `from_price` | integer\|null | cents; cheapest variant when multiple variants, else null |
| `from_price_formatted` | string\|null | display form of `from_price` |
| `to_price` | integer\|null | cents; most expensive variant when multiple variants, else null |
| `to_price_formatted` | string\|null | display form of `to_price` |
| `pay_what_you_want` | boolean | customer sets price at checkout |
| `buy_now_url` | string | hosted LS checkout URL for this product |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

URLs: `buy_now_url` is a ready-made hosted checkout link.

Relationships: belongs to a Store; has many Variants.

## Variant

JSON:API type: `variants`

A product always has at least one variant; a sole variant has `status: pending` and is the hidden "default" variant at checkout.

| attribute | type | notes |
|---|---|---|
| `product_id` | integer | owning product |
| `name` | string | variant name |
| `slug` | string | identifies the variant (UUID-like) |
| `description` | string | HTML |
| `has_license_keys` | boolean | generates license keys on purchase |
| `license_activation_limit` | integer | max activations per key |
| `is_license_limit_unlimited` | boolean | unlimited activations |
| `license_length_value` | integer | units until key expiry (with `license_length_unit`) |
| `license_length_unit` | string | `days` \| `months` \| `years` |
| `is_license_length_unlimited` | boolean | keys never expire; for subscription variants key expiry tracks the subscription |
| `links` | array | of `{ title, url }` objects |
| `sort` | integer | checkout display order |
| `status` | string | `pending` \| `draft` \| `published` |
| `status_formatted` | string | display form |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

Deprecated attributes (moved to Price, still returned for backwards compatibility):

| attribute | type | notes |
|---|---|---|
| `price` | integer | DEPRECATED — cents |
| `is_subscription` | boolean | DEPRECATED |
| `interval` | string\|null | DEPRECATED — `day` \| `week` \| `month` \| `year` |
| `interval_count` | integer\|null | DEPRECATED — intervals between billings |
| `has_free_trial` | boolean | DEPRECATED — subscription variants only |
| `trial_interval` | string | DEPRECATED — `day` \| `week` \| `month` \| `year` |
| `trial_interval_count` | integer | DEPRECATED — trial length in `trial_interval` units |
| `pay_what_you_want` | boolean | DEPRECATED |
| `min_price` | integer | DEPRECATED — cents, PWYW minimum |
| `suggested_price` | integer | DEPRECATED — cents, PWYW suggestion |

Relationships: belongs to a Product; has one Price and many Files.

## Price

JSON:API type: `prices`

Prices are immutable-ish: changing a variant's price creates a **new** price object; old prices are retained (orders/subscription-items keep pointing at the price they were sold under).

| attribute | type | notes |
|---|---|---|
| `variant_id` | integer | owning variant |
| `category` | string | `one_time` \| `subscription` \| `lead_magnet` \| `pwyw` |
| `scheme` | string | `standard` \| `package` \| `graduated` \| `volume` |
| `usage_aggregation` | string\|null | `sum` \| `last_during_period` \| `last_ever` \| `max`; null when usage-based billing off |
| `unit_price` | integer\|null | cents; null when usage-based (use `unit_price_decimal`) or tiered (use `tiers`) |
| `unit_price_decimal` | string\|null | decimal string in cents; used only when usage-based billing on |
| `setup_fee_enabled` | boolean\|null | null for non-subscription pricing |
| `setup_fee` | integer\|null | cents; null for non-subscription pricing |
| `package_size` | integer | units per package (package scheme); `1` for standard/graduated/volume |
| `tiers` | array\|null | tier objects for volume/graduated: `{ last_unit (int or "inf"), unit_price (int cents or null), unit_price_decimal (string or null), fixed_fee (int cents, optional) }`; null for standard/package |
| `renewal_interval_unit` | string\|null | `day` \| `week` \| `month` \| `year`; null if not a subscription |
| `renewal_interval_quantity` | integer\|null | intervals between billings; null if not a subscription |
| `trial_interval_unit` | string\|null | `day` \| `week` \| `month` \| `year`; null if no trial |
| `trial_interval_quantity` | integer\|null | trial length; null if no trial |
| `min_price` | integer\|null | cents; only when `category=pwyw` |
| `suggested_price` | integer\|null | cents; only when `category=pwyw` |
| `tax_code` | string | `eservice` \| `ebook` \| `saas` |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on prices.

Relationships: belongs to a Variant; has many Subscription Items and Usage Records.

## Checkout

JSON:API type: `checkouts` — **id is a UUID string** (e.g. `"ac470bd4-7c41-474d-b6cd-0f296f5be02a"`).

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `variant_id` | integer | highlighted variant; all sibling variants shown unless limited via `product_options.enabled_variants` |
| `custom_price` | integer\|null | cents; overrides the variant price when non-null |
| `product_options` | object | product overrides — keys below |
| `checkout_options` | object | checkout UI options — keys below |
| `checkout_data` | object | prefill + custom data — keys below |
| `preview` | object | pricing preview; **only present when the checkout was created with `preview: true`**, keys below |
| `expires_at` | string\|null | ISO 8601; null = perpetual checkout |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |
| `url` | string | **signed** unique checkout URL; expires with `expires_at` when set |

`product_options` keys: `name`, `description`, `media` (array of image URLs), `redirect_url` (post-purchase redirect), `receipt_button_text`, `receipt_link_url`, `receipt_thank_you_note`, `enabled_variants` (array of variant ids; empty = all enabled).

`checkout_options` keys: `embed` (true = checkout overlay), `media`, `logo`, `desc`, `discount`, `subscription_preview` (each false = hide that element), color overrides as hex strings — `background_color`, `headings_color`, `primary_text_color`, `secondary_text_color`, `links_color`, `borders_color`, `checkbox_color`, `active_state_color`, `button_color`, `button_text_color`, `terms_privacy_color` — plus `locale` (ISO 639, null falls back to store then browser; supported: bg, hr, cs, da, nl, en, et, fil, fi, fr, de, el, hu, id, it, ja, ko, lv, lt, ms, mt, pl, pt, ro, ru, zh-CN, sk, sl, es, sv, th, tr, vi) and `dark` (deprecated in favor of the color options). The docs' JSON example also shows an undocumented `skip_trial` boolean.

`checkout_data` keys: `email`, `name`, `billing_address.country` (ISO 3166-1 alpha-2), `billing_address.zip`, `tax_number`, `discount_code`, `custom` (arbitrary object passed through to the order/webhooks), `variant_quantities` (list of quantity data objects).

`preview` keys (all money integers in cents): `currency`, `currency_rate`, `subtotal`, `discount_total`, `tax`, `total`, `subtotal_usd`, `discount_total_usd`, `tax_usd`, `total_usd`, and `subtotal_formatted` / `discount_total_formatted` / `tax_formatted` / `total_formatted` display strings.

URLs: `url` is the signed customer-facing checkout link — the primary output of creating a checkout.

Relationships: belongs to a Store; associated with a Variant. (`relationships` keys: `store`, `variant`.)

## Order

JSON:API type: `orders`

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `customer_id` | integer | purchasing customer |
| `identifier` | string | order UUID |
| `order_number` | integer | sequential per store |
| `user_name` | string | customer full name |
| `user_email` | string | customer email |
| `currency` | string | ISO 4217 order currency |
| `currency_rate` | string | decimal string; `1.0` when currency is USD |
| `subtotal` | integer | cents, order currency |
| `setup_fee` | integer | cents, order currency |
| `discount_total` | integer | cents, order currency |
| `tax` | integer | cents, order currency |
| `total` | integer | cents, order currency |
| `refunded_amount` | integer | cents, order currency |
| `subtotal_usd` | integer | cents, USD |
| `setup_fee_usd` | integer | cents, USD |
| `discount_total_usd` | integer | cents, USD |
| `tax_usd` | integer | cents, USD |
| `total_usd` | integer | cents, USD |
| `refunded_amount_usd` | integer | cents, USD |
| `tax_name` | string\|null | e.g. `VAT`, `Sales Tax`; null when no tax |
| `tax_rate` | string | decimal percentage (e.g. `"20.00"`) |
| `tax_inclusive` | boolean | tax-inclusive vs exclusive pricing |
| `status` | string | `pending` \| `failed` \| `paid` \| `refunded` \| `partial_refund` \| `fraudulent` |
| `status_formatted` | string | display form |
| `refunded` | boolean | true when **fully** refunded |
| `refunded_at` | string\|null | ISO 8601 when fully refunded |
| `subtotal_formatted` | string | display, order currency |
| `setup_fee_formatted` | string | display |
| `discount_total_formatted` | string | display |
| `tax_formatted` | string | display |
| `total_formatted` | string | display |
| `refunded_amount_formatted` | string | display |
| `first_order_item` | object | embedded first Order Item — keys below |
| `urls` | object | `{ receipt }` — keys below |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

`first_order_item` keys: `id`, `order_id`, `product_id`, `variant_id`, `price_id` (SDK — in the response but not the docs list), `quantity` (SDK — in the response but not the docs list), `product_name`, `variant_name`, `price` (cents, order currency), `created_at`, `updated_at`, `test_mode`.

URLs: `urls.receipt` — pre-signed URL to the customer's My Orders receipt page. A separate "Generate order invoice" endpoint returns a signed invoice download URL (not stored on the object).

Relationships: belongs to a Store; associated with a Customer; has many Order Items, Subscriptions, License Keys, Discount Redemptions.

SDK cross-check (`src/orders/types.ts`): SDK `OrderStatus` omits `partial_refund` (docs list it; treat docs as authoritative — partially refunded orders do occur). SDK adds `price_id` and `quantity` to `first_order_item`, both flagged "Not in the documentation, but in the response". All other attributes match 1:1; SDK relationship set matches the docs prose exactly (`store`, `customer`, `order-items`, `subscriptions`, `license-keys`, `discount-redemptions`).

## Order Item

JSON:API type: `order-items`

| attribute | type | notes |
|---|---|---|
| `order_id` | integer | owning order |
| `product_id` | integer | purchased product |
| `variant_id` | integer | purchased variant |
| `product_name` | string | snapshot at purchase |
| `variant_name` | string | snapshot at purchase |
| `price` | integer | cents, order currency; for PWYW = whatever the customer entered |
| `quantity` | integer | positive |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on the order-item docs page (the embedded `first_order_item` on Order does carry one).

Relationships: belongs to an Order; associated with a Product and a Variant.

## Customer

JSON:API type: `customers`

Created automatically on a customer's first purchase (or via Create a customer).

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `name` | string | full name |
| `email` | string | email address |
| `status` | string | email-marketing status: `subscribed` \| `unsubscribed` \| `archived` \| `requires_verification` \| `invalid_email` \| `bounced` |
| `city` | string\|null | |
| `region` | string\|null | |
| `country` | string | two-letter code |
| `total_revenue_currency` | integer | cents, USD, lifetime revenue from this customer |
| `mrr` | integer | cents, USD, monthly recurring revenue |
| `status_formatted` | string | display form |
| `country_formatted` | string | full country name |
| `total_revenue_currency_formatted` | string | display |
| `mrr_formatted` | string | display |
| `urls` | object | `{ customer_portal }` — see below |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

URLs: `urls.customer_portal` — pre-signed Customer Portal URL, valid 24h from request; **null** if the customer has never bought a subscription in the store.

Relationships: belongs to a Store; has many Orders, Subscriptions, License Keys.

## Subscription

JSON:API type: `subscriptions`

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `customer_id` | integer | subscribing customer |
| `order_id` | integer | originating order |
| `order_item_id` | integer | originating order item |
| `product_id` | integer | subscribed product |
| `variant_id` | integer | subscribed variant |
| `product_name` | string | |
| `variant_name` | string | |
| `user_name` | string | customer full name |
| `user_email` | string | customer email |
| `status` | string | `on_trial` \| `active` \| `paused` \| `past_due` \| `unpaid` \| `cancelled` \| `expired` — lifecycle notes below |
| `status_formatted` | string | title-case (`past_due` → `Past due`) |
| `card_brand` | string\|null | `visa` \| `mastercard` \| `amex` \| `discover` \| `jcb` \| `diners` \| `unionpay`; empty for non-card payments |
| `card_last_four` | string\|null | last 4 digits; empty for non-card payments |
| `payment_processor` | string | `stripe` \| `paypal` |
| `pause` | object\|null | `{ mode: "void"\|"free", resumes_at: ISO 8601 }`; null unless status is `paused` |
| `cancelled` | boolean | when true: `status=cancelled` and `ends_at` populated |
| `trial_ends_at` | string\|null | ISO 8601; only when `status=on_trial`, else null |
| `billing_anchor` | integer | day of month (1–31) payments are collected |
| `first_subscription_item` | object\|null | embedded first Subscription Item — keys below; null when no item (e.g. free trial) |
| `urls` | object | signed management URLs — see below |
| `renews_at` | string | ISO 8601; end of current billing cycle / next invoice (for `past_due`: next retry) |
| `ends_at` | string\|null | ISO 8601; set only for `cancelled`/`expired` |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

Status lifecycle: `past_due` = a renewal failed; LS retries 4 times over 2 weeks, then flips to `unpaid` (dunning rules may then expire it). `cancelled` = still valid on a grace period until `ends_at`. `expired` = ended; revoke access.

`first_subscription_item` keys: `id`, `subscription_id`, `price_id`, `quantity`, `is_usage_based` (SDK — in the response but not the docs list), `created_at`, `updated_at`.

URLs (all pre-signed, valid 24h from request):
- `urls.update_payment_method` — payment/billing management page (usable with Lemon.js overlays).
- `urls.customer_portal` — full Customer Portal.
- `urls.update_customer_portal` — upgrade/downgrade in the Customer Portal; PayPal-based subscriptions only, null otherwise. **Naming caveat:** the docs prose calls it `update_customer_portal`, but the docs' own JSON example and the SDK both show the key as `customer_portal_update_subscription` — match on the latter in real payloads.

Relationships: belongs to a Store; associated with a Customer, an Order, an Order Item, a Product, a Variant, Subscription Invoices and Subscription Items. (SDK relationship keys: `store`, `customer`, `order`, `order-item`, `product`, `variant`, `subscription-items`, `subscription-invoices`.)

SDK cross-check (`src/subscriptions/types.ts`): SDK is **missing `payment_processor`** (documented, and present in payloads — docs win). SDK's `SubscriptionStatus` union contains a stray `"pause"` member and a duplicated `"cancelled"` — an SDK typing bug, not a real status; the real set is the 7 documented values. SDK types `card_brand`/`card_last_four` as `| null` where docs say "empty" for non-card payments. SDK `urls` type uses `customer_portal_update_subscription` (matching the example payload, not the docs prose). SDK adds `is_usage_based` to `first_subscription_item`.

## Subscription Invoice

JSON:API type: `subscription-invoices`

Generated at purchase (`initial`) and each renewal (`renewal`) or plan change (`updated`).

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `subscription_id` | integer | owning subscription |
| `customer_id` | integer | billed customer |
| `user_name` | string | customer full name |
| `user_email` | string | customer email |
| `billing_reason` | string | `initial` \| `renewal` \| `updated` |
| `card_brand` | string\|null | `visa` \| `mastercard` \| `amex` \| `discover` \| `jcb` \| `diners` \| `unionpay`; empty for non-card |
| `card_last_four` | string\|null | last 4 digits; empty for non-card |
| `currency` | string | ISO 4217 invoice currency |
| `currency_rate` | string | decimal string; `1.0` when USD |
| `status` | string | `pending` \| `paid` \| `void` \| `refunded` \| `partial_refund` |
| `status_formatted` | string | display form |
| `refunded` | boolean | fully refunded |
| `refunded_at` | string\|null | ISO 8601 when fully refunded |
| `subtotal` | integer | cents, invoice currency |
| `discount_total` | integer | cents, invoice currency |
| `tax` | integer | cents, invoice currency |
| `tax_inclusive` | boolean | tax-inclusive vs exclusive |
| `total` | integer | cents, invoice currency |
| `refunded_amount` | integer | cents, invoice currency |
| `subtotal_usd` | integer | cents, USD |
| `discount_total_usd` | integer | cents, USD |
| `tax_usd` | integer | cents, USD |
| `total_usd` | integer | cents, USD |
| `refunded_amount_usd` | integer | cents, USD |
| `subtotal_formatted` | string | display |
| `discount_total_formatted` | string | display |
| `tax_formatted` | string | display |
| `total_formatted` | string | display |
| `refunded_amount_formatted` | string | display |
| `urls` | object | `{ invoice_url }` — see below |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

URLs: `urls.invoice_url` — signed PDF download URL (signed but does **not** expire); null while `status` is `pending`.

Relationships: belongs to a Subscription and a Store. (`relationships` keys in the example: `store`, `subscription`, `customer`.)

## Subscription Item

JSON:API type: `subscription-items`

Links a Price to a Subscription plus quantity.

| attribute | type | notes |
|---|---|---|
| `subscription_id` | integer | owning subscription |
| `price_id` | integer | associated price |
| `quantity` | integer | unit quantity; `0` when the variant is usage-based |
| `is_usage_based` | boolean | usage-based billing enabled on the related product/variant |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on subscription-items.

Relationships: belongs to a Subscription and a Price; has many Usage Records. (`relationships` keys: `subscription`, `price`, `usage-records`.)

## Usage Record

JSON:API type: `usage-records`

Reports usage for a usage-based Subscription Item.

| attribute | type | notes |
|---|---|---|
| `subscription_item_id` | integer | owning subscription item |
| `quantity` | integer | usage reported |
| `action` | string | `increment` (added to period total) \| `set` (replaces period total) |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on usage-records.

Relationships: belongs to a Subscription Item.

## Discount

JSON:API type: `discounts`

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `name` | string | discount name |
| `code` | string | checkout code; uppercase letters+digits, 3–256 chars |
| `amount` | integer | fixed amount **in cents** or a percentage — interpret via `amount_type` |
| `amount_type` | string | `percent` \| `fixed` |
| `is_limited_to_products` | boolean | restricted to certain products/variants |
| `is_limited_redemptions` | boolean | limited number of redemptions |
| `max_redemptions` | integer | max redemptions when limited |
| `starts_at` | string\|null | ISO 8601; null = no start date |
| `expires_at` | string\|null | ISO 8601; null = no expiry |
| `duration` | string | for subscriptions: `once` \| `repeating` (with `duration_in_months`) \| `forever` |
| `duration_in_months` | integer | months applied when `duration=repeating` |
| `status` | string | `draft` \| `published` |
| `status_formatted` | string | display form |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

Relationships: belongs to a Store; has many Discount Redemptions.

## Discount Redemption

JSON:API type: `discount-redemptions`

A record of a discount applied to an order; discount fields are snapshots at redemption time.

| attribute | type | notes |
|---|---|---|
| `discount_id` | integer | redeemed discount |
| `order_id` | integer | order it was applied to |
| `discount_name` | string | snapshot |
| `discount_code` | string | snapshot |
| `discount_amount` | integer | fixed cents or percentage per `discount_amount_type` |
| `discount_amount_type` | string | `percent` \| `fixed` |
| `amount` | integer | cents actually discounted from the order (order currency) |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on discount-redemptions.

Relationships: belongs to a Discount and an Order.

## License Key

JSON:API type: `license-keys`

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `customer_id` | integer | owning customer |
| `order_id` | integer | originating order |
| `order_item_id` | integer | originating order item |
| `product_id` | integer | licensed product |
| `user_name` | string | customer full name |
| `user_email` | string | customer email |
| `key` | string | full license key (UUID format) |
| `key_short` | string | `XXXX-` + last 12 chars |
| `activation_limit` | integer | max activations |
| `instances_count` | integer | current activation count |
| `disabled` | boolean | docs describe boolean; docs example and SDK show integer `0` — accept both truthy forms |
| `status` | string | `inactive` \| `active` \| `expired` \| `disabled` |
| `status_formatted` | string | display form |
| `expires_at` | string\|null | ISO 8601; null = perpetual |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | (SDK) present in responses; missing from the docs attribute list |

Relationships: belongs to a Store; associated with an Order, Order Item, Product; has many License Key Instances. (SDK relationship keys add `customer`: `store`, `customer`, `order`, `order-item`, `product`, `license-key-instances`.)

SDK cross-check (`src/licenseKeys/types.ts`): SDK adds `test_mode: boolean` — the docs page omits it (both from the attribute list and the JSON example) but it is in real responses. SDK types `disabled` as `number` while the docs prose says boolean (`true` if disabled); the docs example value is `0`. SDK includes a `customer` relationship the docs prose omits (consistent with `customer_id` existing). All other fields match.

## License Key Instance

JSON:API type: `license-key-instances`

One activation of a license key.

| attribute | type | notes |
|---|---|---|
| `license_key_id` | integer | owning license key |
| `identifier` | string | activation UUID — the `instance_id` returned by the License API "activate" call |
| `name` | string | instance label (e.g. a machine or domain name) |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on license-key-instances.

Relationships: belongs to a License Key.

## File

JSON:API type: `files`

A downloadable digital good attached to a variant.

| attribute | type | notes |
|---|---|---|
| `variant_id` | integer | owning variant (the docs page lists this field twice — a docs quirk, it is one field) |
| `identifier` | string | file UUID |
| `name` | string | filename (e.g. `example.pdf`) |
| `extension` | string | e.g. `pdf` |
| `download_url` | string | **signed** URL; expires after 1 hour; rate-limited to 10 downloads/day/IP |
| `size` | integer | bytes |
| `size_formatted` | string | e.g. `5.5 MB` |
| `version` | string\|null | software version if set (e.g. `1.0.0`) |
| `sort` | integer | display order |
| `status` | string | `draft` \| `published` |
| `createdAt` | string | ISO 8601 — **camelCase**, unlike every other object |
| `updatedAt` | string | ISO 8601 — **camelCase**, unlike every other object |
| `test_mode` | boolean | created in test mode |

URLs: `download_url` is signed, 1-hour expiry — fetch fresh, never persist.

Relationships: belongs to a Variant.

## Webhook

JSON:API type: `webhooks`

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `url` | string | destination endpoint events are POSTed to |
| `events` | array | of event-name strings (e.g. `order_created`, `order_refunded`) |
| `last_sent_at` | string\|null | ISO 8601 of last delivery; null if none sent yet |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |
| `test_mode` | boolean | created in test mode |

The signing `secret` is write-only (supplied on create/update); it is not returned on the object.

Relationships: belongs to a Store.

## Affiliate

JSON:API type: `affiliates`

Created when a user applies to a store's affiliate program.

| attribute | type | notes |
|---|---|---|
| `store_id` | integer | owning store |
| `user_id` | integer | the LS user who is the affiliate |
| `user_name` | string | affiliate full name |
| `user_email` | string | affiliate email |
| `share_domain` | string | domain the affiliate promotes from |
| `status` | string | `active` \| `pending` \| `disabled` |
| `application_note` | string | free-text application note |
| `products` | array\|null | products enabled for this affiliate (JSON); null = all/none restriction unset |
| `total_earnings` | integer | cents, lifetime earnings |
| `unpaid_earnings` | integer | cents, not yet paid out |
| `created_at` | string | ISO 8601 |
| `updated_at` | string | ISO 8601 |

No `test_mode` on affiliates.

Relationships: belongs to a Store; associated with a User.

---

## Relationship graph

Arrows read "has many →" unless marked (1) for has-one / belongs-to-one.

```
store
├─→ products
│    └─→ variants
│         ├─(1) price          (new price object per price change; old ones retained)
│         │      ├─→ subscription-items
│         │      └─→ usage-records          (via subscription-items)
│         └─→ files
├─→ customers
│    ├─→ orders
│    ├─→ subscriptions
│    └─→ license-keys
├─→ checkouts                  (1) variant   — points into the catalog
├─→ orders
│    ├─→ order-items           (1) product, (1) variant each
│    ├─→ subscriptions
│    ├─→ license-keys
│    └─→ discount-redemptions
├─→ subscriptions              (1) customer, (1) order, (1) order-item, (1) product, (1) variant
│    ├─→ subscription-invoices (also (1) store, (1) customer)
│    └─→ subscription-items    (1) price
│         └─→ usage-records
├─→ discounts
│    └─→ discount-redemptions  (1) order
├─→ license-keys               (1) customer, (1) order, (1) order-item, (1) product
│    └─→ license-key-instances
├─→ webhooks
└─→ affiliates                 (1) user
```

Compact arrow list:

- store → products → variants → { price → (subscription-items, usage-records), files }
- store → checkouts → variant
- store → orders → order-items → (product, variant); orders → subscriptions, license-keys, discount-redemptions
- store → customers → (orders, subscriptions, license-keys)
- subscription → subscription-invoices; subscription → subscription-items → usage-records; subscription-item → price
- store → discounts → discount-redemptions → order
- store → license-keys → license-key-instances
- store → webhooks; store → affiliates → user

## Sources

Docs pages (docs.lemonsqueezy.com), fetched 2026-07-02:

- https://docs.lemonsqueezy.com/api/stores/the-store-object
- https://docs.lemonsqueezy.com/api/products/the-product-object
- https://docs.lemonsqueezy.com/api/variants/the-variant-object
- https://docs.lemonsqueezy.com/api/prices/the-price-object
- https://docs.lemonsqueezy.com/api/checkouts/the-checkout-object
- https://docs.lemonsqueezy.com/api/orders/the-order-object
- https://docs.lemonsqueezy.com/api/order-items/the-order-item-object
- https://docs.lemonsqueezy.com/api/customers/the-customer-object
- https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object
- https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object
- https://docs.lemonsqueezy.com/api/subscription-items/the-subscription-item-object
- https://docs.lemonsqueezy.com/api/usage-records/the-usage-record-object
- https://docs.lemonsqueezy.com/api/discounts/the-discount-object
- https://docs.lemonsqueezy.com/api/discount-redemptions/the-discount-redemption-object
- https://docs.lemonsqueezy.com/api/license-keys/the-license-key-object
- https://docs.lemonsqueezy.com/api/license-key-instances/the-license-key-instance-object
- https://docs.lemonsqueezy.com/api/files/the-file-object
- https://docs.lemonsqueezy.com/api/webhooks/the-webhook-object
- https://docs.lemonsqueezy.com/api/affiliates/the-affiliate-object

SDK cross-check (official TypeScript SDK, github.com/lmsqueezy/lemonsqueezy.js, `main`, fetched 2026-07-02):

- `src/orders/types.ts`
- `src/subscriptions/types.ts`
- `src/licenseKeys/types.ts`
