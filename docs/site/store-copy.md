# Ultimate Tokens by NONOUN — Store Copy

Paste-ready copy for the Lemon Squeezy store (`ultimate-tokens.lemonsqueezy.com`, store id `420293`) and
the in-app tie-ins.

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

> **⚠ Follow-up.** Studio **seat enforcement** is a code change (in progress): the license check was
> validate-only, so it didn't cap seats. The 5-seat (+$19 extra) model uses the Lemon Squeezy `/activate`
> (instance) flow — each device consumes one seat, freed on removal. The customer copy below describes that
> behaviour. (Free/Pro/Studio capability split confirmed; it comes from `src/engine/flags.js`.)

---

## A · Store-level

**Store name**

```
Ultimate Tokens by NONOUN
```

**Store tagline (≤60 chars)**

```
Perceptual color, type & geometry — as tokens you ship.
```

**Store description (short)**

> Ultimate Tokens is a perceptual design-token generator. Derive an OKLCH-true color system, a type scale,
> and a geometry system from one source — then export them to CSS, Figma variables, and your AI agents,
> perfectly in sync.

**SEO meta title**

```
Ultimate Tokens by NONOUN — perceptual design-token generator
```

**SEO meta description (≤155 chars)**

```
Derive OKLCH-true color, type & geometry systems from one source. Export to CSS, DTCG, Tailwind, shadcn, Figma variables & MCP. Free to start.
```

**Open-graph / social card description**

> One brand kit. Three composing systems — color, type, geometry. Every export, derived and in sync. Free
> to start; Pro is $39/year, Studio for teams.

**Logo alt text**

```
Ultimate Tokens by NONOUN
```

---

## B · The products

### Pro (single user)

**Product name**

```
Ultimate Tokens — Pro
```

**Short summary (subtitle / one-liner)**

> A perceptual color, type & geometry token system — exported to CSS, Figma, and your AI agents from one
> source of truth. $39/year.

**Full description (long-form body)**

> ### Tokens, derived — not guessed
> Ultimate Tokens turns a few perceptual decisions into a complete design system. Pick a key color and it
> derives an even, OKLCH-true tonal ramp. Map it to **53 semantic roles** across light and dark. Compose a
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
> - **Hosted Brand-Kit MCP** — a live endpoint your agents read directly, no local server to run
>
> **$39 a year**, per user — every update and customer support included. Cancel anytime.
>
> ### Built to stay yours
> No sign-up to start. Your work lives in your browser and your Figma file — nothing leaves your machine
> but the license check. The Figma plugin is free and runs fully offline.

### Studio (team)

**Product name**

```
Ultimate Tokens — Studio
```

**Short summary**

> Pro for your whole team — multiple seats at a reduced per-seat rate, managed in one place.

**Full description**

> ### Everything in Pro, for the team
> Studio gives every member of your studio the full Pro toolkit — unlimited brand kits, the complete export
> suite, advanced treatments, and the hosted Brand-Kit MCP — at a **reduced per-seat rate**, billed once and
> managed from a single account.
>
> - **5 seats included** — add more anytime at $19 / seat / year
> - **One place to manage** — assign and reassign seats as the team changes
> - **Every update and priority support**, included for all seats
>
> **$149/year** includes **5 seats**; add more at **$19/seat/year**. Need a bigger team or an invoice?
> Email {{SUPPORT_EMAIL}}.

**Feature / benefit bullets (shared spec block)**

```
• OKLCH-native — perceptually even ramps; HEX derived only for output
• 53 semantic roles per palette, light + dark
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
| 53 semantic roles, light + dark | ✓ | ✓ | ✓ |
| Figma plugin (offline) | ✓ | ✓ | ✓ |
| Brand kits | Up to 2 | **Unlimited** | **Unlimited** |
| Export suite | Core | **Complete** | **Complete** |
| Advanced type & geometry treatments | — | ✓ | ✓ |
| Brand-Kit MCP | Download | **Hosted** | **Hosted** |
| Updates + customer support | — | ✓ | ✓ |
| Seats | 1 | 1 | **5 included (+$19 each)** |
| Price | Free | **$39/year** | **$149/year (5 seats)** |

**"What's included" (post-purchase summary)**

> An Ultimate Tokens **Pro** subscription · unlimited brand kits · the complete export suite · advanced
> treatments · hosted Brand-Kit MCP · every update and customer support for as long as you're subscribed.

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

**Pricing labels + billing notes**

```
Pro      $39 / year · per user
         Every update and support included. Cancel anytime.

Studio   $149 / year · 5 seats   (+$19 / seat / year)
         Pro for your whole team. Billed yearly.
```

---

## C · Checkout

**Checkout product lines**

> **Pro** — Ultimate Tokens · Unlimited brand kits + the complete export suite. $39/year, per user.
>
> **Studio** — Ultimate Tokens · Pro for your whole team. $149/year for 5 seats, +$19 each.

**Buy buttons**

```
Pro:     Subscribe — $39/year
Studio:  Get Studio seats
```

**Checkout reassurance footer**

```
Instant license key by email · Cancel anytime · 14-day refund · Secure checkout by Lemon Squeezy
```

**Discount-code announcement (template)**

> Launch pricing: use **{{CODE}}** for {{N}}% off your first year of Ultimate Tokens Pro through {{DATE}}.

---

## D · Post-purchase

**Confirmation / thank-you page**

> ### You're Pro. 🎉
> Your license key is on its way to your inbox. To unlock Pro:
> 1. Open Ultimate Tokens at **{{APP_URL}}**
> 2. Go to **Settings → Account**
> 3. Paste your key and hit **Validate**
>
> That's it — unlimited kits and the full export suite are live. Questions? **{{SUPPORT_EMAIL}}**.

**Receipt / subscription-confirmation email**

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

**Studio welcome email**

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

**License-key delivery (if sent separately)**

```
Subject: Your Ultimate Tokens Pro key — activate in 30 seconds
```

> Here's your Pro key:
> **{{LICENSE_KEY}}**
>
> Paste it into **Settings → Account** at {{APP_URL}} and click Validate. The Figma plugin stays free and
> offline — no key needed there.

**Onboarding nudge (a few days later, optional)**

```
Subject: Three things to try with Pro
```

> Now that you're Pro:
> 1. **Spin up a kit per client** — there's no limit anymore.
> 2. **Export the full suite** — drop the same tokens into CSS, Figma, and Tailwind without re-deriving.
> 3. **Point your AI agent at the hosted MCP** — it'll build with your exact roles instead of guessing.
>
> Stuck on anything? Reply to this email.

---

## E · Subscription lifecycle emails

**Renewal reminder (optional)**

```
Subject: Your Ultimate Tokens Pro renews soon
```

> A heads-up: your Ultimate Tokens Pro subscription renews on **{{RENEWAL_DATE}}** at $39/year. Nothing to
> do — it'll carry on, updates and support included. Manage or cancel anytime at {{CUSTOMER_PORTAL}}.

**Payment failed (dunning)**

```
Subject: We couldn't renew your Pro subscription
```

> We tried to renew your Ultimate Tokens Pro subscription but the payment didn't go through. Update your
> payment method at {{CUSTOMER_PORTAL}} to keep Pro — your kits and settings are untouched in the meantime.

**Cancellation confirmation**

```
Subject: Your Pro subscription is canceled
```

> Your Ultimate Tokens Pro subscription is canceled. You keep Pro until **{{PERIOD_END}}**, then your
> account returns to Free — your saved kits stay safe. Changed your mind? Resubscribe anytime at {{APP_URL}}.

**Subscription ended / downgraded to Free**

```
Subject: Your Pro period has ended
```

> Your Ultimate Tokens Pro period has ended, so your account is back to Free. Your brand kits are still
> here — you're just back to the Free limits. Resubscribe whenever you like: {{APP_URL}}.

---

## F · Policies (lite)

**Refund policy**

> If Ultimate Tokens Pro isn't right for you, email {{SUPPORT_EMAIL}} within **14 days** of purchase for a
> full refund — no questions asked.

**License terms summary (EULA-lite)**

> Ultimate Tokens **Pro** is an annual, per-user subscription ($39/year). It entitles one individual to the
> Pro features for the paid period, with updates and support included, and renews yearly until canceled.
> **Studio** covers multiple named users on one team at a reduced per-seat rate — don't exceed your seat
> count, and manage members from your account. Don't share or resell keys. Use it for personal and
> commercial work, on as many projects and clients as you like. Tokens and design systems you create are
> entirely yours.

**Support line**

```
Questions, licensing, or team plans → {{SUPPORT_EMAIL}}
```

---

## G · In-app & storefront tie-ins

**In-app Account panel** (drop-in replacements for the shipped microcopy)

```
Plan row (Free):   "Free — the core generator. A Pro license unlocks the rest."
Upgrade row title: "Upgrade to Pro"
Upgrade row desc:  "Unlimited brand kits, the complete export suite, advanced
                    treatments, and hosted MCP. From $39/year — updates &
                    support included."
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

**Launch announcement (social / newsletter)**

> Ultimate Tokens is out. Derive a perceptual color, type, and geometry system from one source — then
> export it to CSS, Figma variables, and your AI agents, in sync. Free to start; Pro is $39/year, Studio
> for teams. → {{APP_URL}}

**Short social variants**

```
• Design tokens, derived — not guessed. Color, type, geometry from one
  source; every export in sync. Free to start. → {{APP_URL}}
• OKLCH-true ramps, 53 semantic roles, light + dark. Export to CSS, Figma,
  and MCP without a hand-off. Pro $39/yr. → {{APP_URL}}
• Stop hand-nudging hex. Pick a key color; ship a whole system. → {{APP_URL}}
```
