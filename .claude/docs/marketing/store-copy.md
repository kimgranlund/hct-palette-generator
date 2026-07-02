# Ultimate Tokens by NONOUN — Lemon Squeezy store corpus

The complete, paste-ready store copy for the Lemon Squeezy store
(`ultimate-tokens.lemonsqueezy.com`, store id `420293`) and the in-app tie-ins that mirror it.

**How this doc is keyed.** Every copy block below names the exact Lemon Squeezy object and attribute
it pastes into — e.g. `products[1182548].attributes.description` — following the object schemas in the
[`lemon-squeezy-schemas`](../../skills/lemon-squeezy-schemas/references/objects.md) skill. Where a
storefront field (SEO, tagline, policy, email) is a dashboard setting rather than a JSON:API attribute,
the block says so and names the dashboard location. Facts are pinned by [`fact-sheet.md`](fact-sheet.md);
voice by [`voice/voice-platform.md`](voice/voice-platform.md) — gate every edit with the
`color-tokens-brand-voice` voice-check script before shipping.

**The objects this corpus keys to:**

| Object | id | Notes |
|---|---|---|
| Store | `420293` | `ultimate-tokens.lemonsqueezy.com` · name "Ultimate Tokens by NONOUN" |
| Product — Pro | `1182548` | → variant `1849393` · $39/year, per user · license keys enabled |
| Product — Studio | `1182535` | → variant `1849376` · $149/year, 5 seats · +$19/seat/year, usage-based per seat |
| Pro checkout deep-link | — | `https://ultimate-tokens.lemonsqueezy.com/checkout/buy/1849393` |
| Studio checkout deep-link | — | `https://ultimate-tokens.lemonsqueezy.com/checkout/buy/1849376` |

**Locked decisions:** **annual subscription** · **two tiers — Pro (single user) + Studio (team)** ·
precise/craft voice (matches the app).

- **Pro** — **$39 / year**, per user. Includes every update and customer support. Cancel anytime.
- **Studio** — **$149 / year for 5 seats**, then **$19 / seat / year** for extras, managed in one place.

**Placeholders** — replace before publishing:

| Token | Meaning |
|---|---|
| `{{APP_URL}}` | The web app URL (e.g. `app.nonoun.io`) |
| `{{SUPPORT_EMAIL}}` | Support address (default `support@nonoun.io`) |
| `{{CUSTOMER_PORTAL}}` | Lemon Squeezy customer portal (manage / cancel) |
| `{{LICENSE_KEY}}` · `{{RENEWAL_DATE}}` · `{{PERIOD_END}}` · `{{SEATS}}` | Injected by Lemon Squeezy per order |
| `{{CODE}}` / `{{N}}` / `{{DATE}}` | Discount-code template fields |

> **Seat enforcement is live** (shipped #131): the 5-seat (+$19 extra) model uses the Lemon Squeezy
> `/activate` (instance) flow — each device consumes one seat, freed on removal. The customer copy below
> describes that behaviour. (The Free/Pro/Studio capability split comes from `src/engine/flags.js`.)
>
> **Tier enforcement (`TIERS_ENFORCED`) is a separate app flag** from a product being published — the
> products below are `published` so checkout works; when enforcement flips is a `flags.js` decision, not
> a copy one. Nothing here markets a state the app can't yet demonstrate.

---

## 1 · Store object — `stores[420293]`

**`stores.attributes.name`** — store name

```
Ultimate Tokens by NONOUN
```

**`stores.attributes.slug` · `.domain` · `.url`** — identity (set once; read-only on the object)

```
slug:   ultimate-tokens
domain: ultimate-tokens.lemonsqueezy.com
url:    https://ultimate-tokens.lemonsqueezy.com
```

**`stores.attributes.avatar_url`** — the store avatar (uploaded in **Settings → Store**). The API
exposes the URL only; the alt text below is a storefront/dashboard value, not a JSON:API attribute.

**Avatar / logo alt text**

```
Ultimate Tokens by NONOUN
```

**Storefront tagline** — dashboard-only (**Settings → Store**); not on the `stores` API object (≤60 chars)

```
Perceptual color, type & geometry — as tokens you ship.
```

**Storefront description (short)** — dashboard-only (**Settings → Store**)

> Ultimate Tokens is a perceptual design-token generator. Derive an OKLCH-true color system, a type scale,
> and a geometry system from one source — then export them to CSS, Figma variables, and your AI agents,
> perfectly in sync.

**SEO meta title** — dashboard-only (**Settings → SEO**)

```
Ultimate Tokens by NONOUN — perceptual design-token generator
```

**SEO meta description** — dashboard-only (**Settings → SEO**, ≤155 chars)

```
Derive OKLCH-true color, type & geometry systems from one source. Export to CSS, DTCG, Tailwind, shadcn, Figma variables & MCP. Free to start.
```

**Open-graph / social card description** — dashboard-only (**Settings → SEO**)

> One brand kit. Three composing systems — color, type, geometry. Every export, derived and in sync. Free
> to start; Pro is $39/year, Studio for teams.

---

## 2 · Products

The feature-bullet block, comparison table, and FAQ (§2.3) are part of each product's **`description`
HTML** (the product-page body) — LS has no separate bullets/FAQ field. Keep them appended to both
products' descriptions, and keep them identical across the two pages.

### 2.1 · Pro — `products[1182548]`

**`products[1182548].attributes.name`**

```
Ultimate Tokens — Pro
```

**`products[1182548].attributes.status`** → `published`. **`.buy_now_url`** is an LS-generated hosted
checkout link (read-only); the app links the variant deep-link `…/checkout/buy/1849393` instead (§4.1).

**Listing excerpt** — the first ~160 chars of `description` that LS shows on the product card; write the
rest of the body to begin after it so the card truncates on a complete thought

> A perceptual color, type & geometry token system — exported to CSS, Figma, and your AI agents from one
> source of truth. $39/year.

**`products[1182548].attributes.description`** — full long-form body

> ### Tokens, derived — not guessed
> Ultimate Tokens turns a few perceptual decisions into a complete design system. Pick a key color and it
> derives an even, OKLCH-true tonal ramp. Map it to **59 semantic roles** across light and dark. Compose a
> type scale and a geometry system from the same source — every step measured, not hand-nudged.
>
> ### One source, every export
> Ship the whole kit without a hand-off: **CSS custom properties**, **W3C design tokens (DTCG)**,
> **Tailwind**, and **shadcn**. Bind it to **Figma variables** — Color Primitives and Color Modes, aliased
> so a raw-color edit cascades to every role. Or serve it to your AI coding agents over **MCP**, so they
> build with your exact tokens instead of guessing a hex.
>
> ### What Pro unlocks
> Free gives you the full generator and two brand kits — enough to ship a real system. **Pro removes the
> ceiling:**
> - **Unlimited brand kits** — every client, product, and experiment in one place
> - **The complete export suite** — every target, every format
> - **Advanced type & geometry treatments**
> - **Hosted Brand-Kit MCP, when it ships** — Pro will include the hosted endpoint; today every tier
>   gets the downloadable server
>
> **$39 a year**, per user — every update and customer support included. Cancel anytime.
>
> ### Built to stay yours
> No sign-up to start. Your work lives in your browser and your Figma file — nothing leaves your machine
> but the license check. The Figma plugin is free and runs fully offline.

### 2.2 · Studio — `products[1182535]`

**`products[1182535].attributes.name`**

```
Ultimate Tokens — Studio
```

**`products[1182535].attributes.status`** → `published`. **`.buy_now_url`** is LS-generated; the app
links the variant deep-link `…/checkout/buy/1849376` instead (§4.2).

**Listing excerpt** — first ~160 chars of `description` on the product card

> Pro for your whole team — 5 seats at a reduced per-seat rate, managed from one account. Add more anytime
> at $19/seat/year.

**`products[1182535].attributes.description`** — full body

> ### Everything in Pro, for the team
> Studio gives every member of your studio the full Pro toolkit — unlimited brand kits, the complete export
> suite, and advanced treatments — at a **reduced per-seat rate**, billed once and managed from a single
> account.
>
> - **5 seats included** — add more anytime at $19 / seat / year
> - **One place to manage** — assign and reassign seats as the team changes
> - **Every update and priority support**, included for all seats
>
> **$149/year** includes **5 seats**; add more at **$19/seat/year**. Need a bigger team or an invoice?
> Email {{SUPPORT_EMAIL}}.

### 2.3 · Shared product-page blocks — appended to both `products[*].attributes.description`

**Feature / benefit bullets (shared spec block)**

```
• OKLCH-native — perceptually even ramps; HEX derived only for output
• 59 semantic roles per palette, light + dark
• Three composing systems — Color · Typography · Geometry
• Exports: CSS · DTCG · Tailwind · shadcn
• Figma variables — semantic binding cascade + breakpoint modes
• Brand-Kit MCP — feed your exact tokens to Claude, Cursor, VS Code
• Free Figma plugin, fully offline
• Your data stays in your browser / your file
```

**Free vs Pro vs Studio — comparison table**

| | Free | Pro | Studio |
|---|---|---|---|
| The full generator (Color · Type · Geometry) | ✓ | ✓ | ✓ |
| 59 semantic roles, light + dark | ✓ | ✓ | ✓ |
| Figma plugin (offline) | ✓ | ✓ | ✓ |
| Brand kits | Up to 2 | **Unlimited** | **Unlimited** |
| Export suite | Core | **Complete** | **Complete** |
| Advanced type & geometry treatments | — | ✓ | ✓ |
| Brand-Kit MCP | Download | Download (**hosted when live**) | Download (**hosted when live**) |
| Customer support | — | ✓ | ✓ (priority) |
| Seats | 1 | 1 | **5 included (+$19 each)** |
| Price | Free | **$39/year** | **$149/year (5 seats)** |

**"What's included" (post-purchase summary block)**

> An Ultimate Tokens **Pro** subscription · unlimited brand kits · the complete export suite · advanced
> treatments · every update and customer support for as long as you're subscribed.

**FAQ**

> **Is this a subscription?**
> Yes. Pro is **$39/year per user**, and it includes every update and customer support. Cancel anytime —
> you keep Pro through the period you've paid for.
>
> **What's the Studio license?**
> Studio is Pro for a whole team: **$149/year for 5 seats**, plus **$19/seat/year** for extras, managed
> from one account. Each person activates on their own device and that device takes a seat; remove it to
> free the seat back up. Pick Studio at checkout, or email {{SUPPORT_EMAIL}} for a bigger team or an invoice.
>
> **How do I activate my license?**
> Open the web app, go to **Settings → Account**, paste your key, and click **Validate**. Pro unlocks on
> that machine; repeat on any device you work from.
>
> **What happens if I cancel?**
> You keep Pro until the end of your paid period, then your account returns to Free. Your saved brand kits
> stay put — you're simply back to the Free limits until you resubscribe.
>
> **Does the Figma plugin need Pro?**
> No — the Figma plugin is free and runs fully offline. Pro lives in the web app.
>
> **What can I export?**
> CSS custom properties, W3C design tokens (DTCG), Tailwind, and shadcn — plus Figma variables and a
> Brand-Kit MCP server for AI agents.
>
> **Where is my data stored?**
> In your browser and your Figma file. Nothing is uploaded; the only network call is the one that validates
> your license.
>
> **Can I use it for commercial work?**
> Yes. The license covers personal and commercial projects.
>
> **What if it's not for me?**
> Email {{SUPPORT_EMAIL}} within 14 days for a full refund, no questions.

**Pricing labels + billing notes** (product-page price block)

```
Pro      $39 / year · per user
         Every update and support included. Cancel anytime.

Studio   $149 / year · 5 seats   (+$19 / seat / year)
         Pro for your whole team. Billed yearly.
```

---

## 3 · Variants

The variant **`name`** and **`description`** show at checkout, under the product name — this is the text
a buyer reads at the moment of purchase. LS composes the order summary from product name + variant name +
`variants.attributes.description` + price; there is no separate "checkout line" field.

### 3.1 · Pro variant — `variants[1849393]`

**`variants[1849393].attributes.name`**

```
Annual, per user
```

**`variants[1849393].attributes.description`** (shows at checkout)

> Ultimate Tokens Pro for one maker — $39/year, renewing until you cancel. One license key, activated on
> every device you work from.

Context (not customer copy): `has_license_keys: true`; `license_activation_limit` is set for one
person's own devices — this is not a seat model (that's Studio). Keys track the subscription
(`is_license_length_unlimited` semantics for subscription variants).

### 3.2 · Studio variant — `variants[1849376]`

**`variants[1849376].attributes.name`**

```
Annual, 5 seats
```

**`variants[1849376].attributes.description`** (shows at checkout)

> Ultimate Tokens Pro for a team — $149/year for 5 seats, then $19/seat/year for more. Each device
> activation consumes one seat; remove it to free the seat back up.

Context (not customer copy): `has_license_keys: true`; `license_activation_limit: 5` (the 5 included
seats); extra seats bill usage-based at $19/seat/year via usage records on the subscription item. Each
device `/activate` (instance) consumes one seat; removing the instance frees it (shipped #131). This is
the source of the seat copy above and in the Studio email (§5).

---

## 4 · Checkout — `checkouts` (hosted links + API `product_options`)

### 4.1 · Hosted checkout links (what the buttons and app point at)

```
Pro:    https://ultimate-tokens.lemonsqueezy.com/checkout/buy/1849393
Studio: https://ultimate-tokens.lemonsqueezy.com/checkout/buy/1849376
```

Each product also carries an LS-generated `products[*].attributes.buy_now_url` (read-only) — the app uses
the variant deep-links above so the right plan is highlighted.

**Buy buttons** (landing page / app)

```
Pro:     Subscribe — $39/year
Studio:  Get Studio seats
```

**Checkout reassurance footer** — landing page, near the button (the LS checkout page itself is
LS-templated; this line lives on our surfaces)

```
Instant license key by email · Cancel anytime · 14-day refund · Secure checkout by Lemon Squeezy
```

### 4.2 · API checkout — `POST /checkouts` `product_options` (when the app creates checkouts)

When the app creates a checkout programmatically it can override the product presentation and the
post-purchase receipt. Defaults inherit the product; fill a field only where the checkout context differs.

| `product_options` field | Value |
|---|---|
| `name` | *(inherit the product — leave empty)* |
| `description` | *(inherit the product — leave empty; fill only for a context-specific checkout, e.g. an embedded checkout on the landing page)* |
| `receipt_button_text` | `Open Ultimate Tokens` |
| `receipt_link_url` | `{{APP_URL}}` |
| `redirect_url` | *(empty — keep the LS receipt so the thank-you note + button show; set to `{{APP_URL}}` only to skip straight to the app)* |
| `receipt_thank_you_note` | per product, below |

**Pro — `product_options.receipt_thank_you_note`** (checkout for variant `1849393`)

> Thanks for going Pro. Your license key is in your purchase email — open Ultimate Tokens, go to Settings →
> Account, paste the key, and click Validate. Anything at all: {{SUPPORT_EMAIL}}. — NONOUN

**Studio — `product_options.receipt_thank_you_note`** (checkout for variant `1849376`)

> Thanks for bringing Ultimate Tokens to your team. Your team license key is in your purchase email — each
> member activates under Settings → Account, then Validate, and every device activation takes one of your 5
> seats. Manage seats and billing anytime at {{CUSTOMER_PORTAL}}. — NONOUN

**`checkout_data`** (prefill + pass-through) — set `email` / `name` only when you already know the buyer;
`discount_code` to pre-apply a launch code (§6); `custom` to carry an internal reference through to the
order and webhooks. Never hardcode a buyer's details into a shared link.

---

## 5 · Discounts — `discounts[<id>]`

### 5.1 · Launch discount (the object)

**`discounts.attributes.name`** — customers see this at checkout, next to the price; write it as a
fragment that reads beside a number

```
Launch pricing
```

**`discounts.attributes.code`** — checkout code; uppercase letters + digits, 3–256 chars (schema).
Convention: one short, memorable, campaign-tied token — e.g. `LAUNCH`, `FOUNDING`. One code per campaign;
let it stop working at `expires_at`.

**`discounts.attributes.amount` + `.amount_type`** — `amount_type: percent` with `amount: <N>` for N% off
(or `fixed` in cents). Scope it to the tiers via `is_limited_to_products` when the campaign is Pro-only.

**`discounts.attributes.duration`** — for the annual plan, `once` maps to the copy phrase "first year"
(the initial invoice only). Use `repeating` + `duration_in_months` or `forever` only if the intent
actually differs; keep the word in the copy honest to the field.

**`discounts.attributes.expires_at`** — a **real** deadline. Set it, and let the code stop working then.

**Announcement template** (owned in full by [`launch/launch-kit.md`](launch/launch-kit.md); this line is
the checkout-adjacent version, and its `{{DATE}}` equals `expires_at`)

> Launch pricing: use **{{CODE}}** for {{N}}% off your first year of Ultimate Tokens Pro through {{DATE}}.

### 5.2 · The honesty rule (platform §4)

Time-boxed launch pricing is honest only when the deadline is real. Set `expires_at`, name the same date
in the copy, and let the code expire on it. No strike-through theatre, no "only/just $…" framing, no
countdown that resurrects itself. The price is stated plainly and the exit is always the same date.

---

## 6 · Post-purchase — order-confirmation surfaces

**Confirmation / thank-you page** — the app's post-redirect welcome at `{{APP_URL}}` (richer than the LS
receipt note in §4.2, which carries the short version). This block holds the product's one protected
celebration.

> ### You're Pro. 🎉
> Your license key is on its way to your inbox. To unlock Pro:
> 1. Open Ultimate Tokens at **{{APP_URL}}**
> 2. Go to **Settings → Account**
> 3. Paste your key and hit **Validate**
>
> That's it — unlimited kits and the full export suite are live. Questions? **{{SUPPORT_EMAIL}}**.

**Receipt / subscription-confirmation email** — pastes into **Settings → Emails → Order confirmation**
(LS injects the license key and receipt automatically; this is the custom message body)

```
Subject: Your Ultimate Tokens Pro subscription
```

> Thanks for going Pro.
>
> Your license key:
> **{{LICENSE_KEY}}**
>
> Activate it in three steps:
> 1. Open {{APP_URL}}
> 2. Settings → Account
> 3. Paste the key → Validate
>
> Your subscription is **$39/year** and renews on **{{RENEWAL_DATE}}** — every update and customer support
> included. Manage or cancel anytime at {{CUSTOMER_PORTAL}}. Keep this email as your proof of purchase.
>
> Anything at all: {{SUPPORT_EMAIL}}.
>
> — NONOUN

**Studio welcome email** — **Settings → Emails → Order confirmation** for the Studio product (or your
webhook mailer, keyed on the Studio variant)

```
Subject: Your Ultimate Tokens Studio license
```

> Studio is ready — **{{SEATS}} seats** for your team.
>
> Your team license key:
> **{{LICENSE_KEY}}**
>
> Share it with your team. Each person activates their seat the same way: **Settings → Account** at
> {{APP_URL}} → paste the key → **Validate**. Manage seats and billing at {{CUSTOMER_PORTAL}}.
>
> Need to change your seat count or want an invoice? Just reply — {{SUPPORT_EMAIL}}.

**License-key delivery (if sent separately)** — a standalone transactional email, if you split key
delivery from the order confirmation

```
Subject: Your Ultimate Tokens Pro key — activate in 30 seconds
```

> Here's your Pro key:
> **{{LICENSE_KEY}}**
>
> Paste it into **Settings → Account** at {{APP_URL}} and click Validate. The Figma plugin stays free and
> offline — no key needed there.

**Onboarding nudge (a few days later, optional)** — your webhook mailer, not an LS-native email

```
Subject: Three things to try with Pro
```

> Now that you're Pro:
> 1. **Spin up a kit per client** — there's no limit anymore.
> 2. **Export the full suite** — drop the same tokens into CSS, Figma, and Tailwind without re-deriving.
> 3. **Download the Brand-Kit MCP and point your AI agent at it** — it'll build with your exact roles
>    instead of guessing.
>
> Stuck on anything? Reply to this email.

---

## 7 · Subscription lifecycle emails

Which system sends these — LS's built-in subscription emails vs. your own webhook-driven transactional
mail — is a deployment decision (see open questions in the hand-off). The copy is written to paste into
whichever; LS renewal reminders and dunning are configurable in **Settings → Emails**.

**Renewal reminder (optional)** — **Settings → Emails → Subscription renewal reminder**

```
Subject: Your Ultimate Tokens Pro renews soon
```

> A heads-up: your Ultimate Tokens Pro subscription renews on **{{RENEWAL_DATE}}** at $39/year. Nothing to
> do — it'll carry on, updates and support included. Manage or cancel anytime at {{CUSTOMER_PORTAL}}.

**Payment failed (dunning)** — **Settings → Emails → Payment failed** (LS sends this on `past_due`)

```
Subject: We couldn't renew your Pro subscription
```

> We tried to renew your Ultimate Tokens Pro subscription but the payment didn't go through. Update your
> payment method at {{CUSTOMER_PORTAL}} to keep Pro — your kits and settings are untouched in the meantime.

**Cancellation confirmation** — your webhook mailer on `subscription_cancelled` (the customer keeps access
until `ends_at`)

```
Subject: Your Pro subscription is canceled
```

> Your Ultimate Tokens Pro subscription is canceled. You keep Pro until **{{PERIOD_END}}**, then your
> account returns to Free — your saved kits stay safe. Changed your mind? Resubscribe anytime at {{APP_URL}}.

**Subscription ended / downgraded to Free** — your webhook mailer on `subscription_expired`

```
Subject: Your Pro period has ended
```

> Your Ultimate Tokens Pro period has ended, so your account is back to Free. Your brand kits are still
> here — you're just back to the Free limits. Resubscribe whenever you like: {{APP_URL}}.

---

## 8 · Policies (lite) — store policy fields

**Refund policy** — **Settings → Store → Refund policy** (or the product-level refund policy field)

> If Ultimate Tokens Pro isn't right for you, email {{SUPPORT_EMAIL}} within **14 days** of purchase for a
> full refund — no questions asked.

**License terms summary (EULA-lite)** — **Settings → Store → Terms of service** (or a linked terms page)

> Ultimate Tokens **Pro** is an annual, per-user subscription ($39/year). It entitles one individual to the
> Pro features for the paid period, with updates and support included, and renews yearly until canceled.
> **Studio** covers multiple named users on one team at a reduced per-seat rate — don't exceed your seat
> count, and manage members from your account. Don't share or resell keys. Use it for personal and
> commercial work, on as many projects and clients as you like. Tokens and design systems you create are
> entirely yours.

**Support line** — footer / contact field

```
Questions, licensing, or team plans → {{SUPPORT_EMAIL}}
```

---

## 9 · In-app & storefront tie-ins

Not a Lemon Squeezy surface — these paste into the app (`src/ui/app.js` microcopy). They live in this
corpus so the upgrade triad (limit · price · exit) stays consistent with the checkout and email copy above.

**In-app Account panel** (drop-in replacements for the shipped microcopy)

```
Plan row (Free):   "Free — the core generator. A Pro license unlocks the rest."
Upgrade row title: "Upgrade to Pro"
Upgrade row desc:  "Unlimited brand kits, the complete export suite, and
                    advanced treatments. From $39/year — updates & support
                    included."
Upgrade button:    "Get Pro →"
Buy-link:          "Don't have a key? Get a Pro license →"
License help:      "Paste the key from your purchase email to unlock Pro."
```

**Upgrade prompt when a Free user hits the 2-kit cap**

> You're at the Free limit of 2 brand kits. **Go Pro** for unlimited kits — $39/year, cancel anytime.
> `[ Get Pro → ]`

**Expired-subscription banner (the engine downgrades to Free on expiry)**

> Your Pro subscription has ended — you're back to Free. Your kits are safe. **Resubscribe** to unlock
> unlimited kits and the full export suite again.
> `[ Resubscribe → ]`

**Launch announcement + social variants** — moved to
[`launch/launch-kit.md`](launch/launch-kit.md), which owns all announcement/social copy.

---

## 10 · Deployed-surfaces re-paste checklist

Copy already pasted into the Lemon Squeezy dashboard doesn't grep (fact-sheet rule 4). When a pinned fact
changes, walk the dashboard top-to-bottom and re-paste each field below:

1. **Settings → Store** — store name · avatar (+ alt) · storefront tagline · short description.
2. **Settings → SEO** — meta title · meta description · open-graph / social card.
3. **Products → Pro (`1182548`)** — name · status · full `description` (long-form + shared §2.3 blocks) ·
   the listing-excerpt lead.
4. **Products → Studio (`1182535`)** — name · status · full `description` (long-form + shared §2.3 blocks) ·
   the listing-excerpt lead.
5. **Variants → Pro (`1849393`)** — name · description.
6. **Variants → Studio (`1849376`)** — name · description.
7. **Checkout / API `product_options`** — `receipt_button_text` · `receipt_link_url` ·
   `receipt_thank_you_note` (Pro + Studio) · `redirect_url` · the buy buttons + reassurance footer on the
   landing page.
8. **Discounts** — launch discount `name` · `code` · `amount`/`amount_type` · `duration` · `expires_at`.
9. **Settings → Emails** — order-confirmation body (Pro + Studio) · renewal reminder · payment-failed ·
   (cancellation / ended, if sent from LS rather than your webhook mailer).
10. **Settings → Store → Policies** — refund policy · terms of service · support line.
11. **App (`src/ui/app.js`)** — Account-panel microcopy · the 2-kit upgrade prompt · the expired banner
    (not an LS surface; re-paste in the app).
