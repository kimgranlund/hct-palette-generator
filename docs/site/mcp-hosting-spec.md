# Hosted Brand-Kit MCP — Spec & Plan (Cloudflare, account-based)

**Status:** draft / design. **Owner:** NONOUN. **Gates:** the `hostedMcp` Pro flag (`src/engine/flags.js`).

The **hosted Brand-Kit MCP** is the live, always-current sibling of the free *downloadable* MCP server, and
the **recurring-value anchor** for the Pro subscription. **Decided model:** there is **one** hosted MCP
endpoint; a user **authenticates** when adding it to their agent (OAuth), and the server serves **their
account's** brand kits. Identity is a **NONOUN account via email magic-link**, linked to the Lemon Squeezy
subscription by email. This makes accounts + cloud-synced kits a first-class part of the product — the same
foundation the **Studio** (multi-seat) tier already assumes.

> **What changed from the first draft:** we moved from "publish a per-kit URL + bearer token (snapshot)" to
> "one endpoint + OAuth + account↔kit (live, synced)". That is a bigger build — it introduces **accounts**
> and **server-side kit sync** (the product is accountless today) — but it is the foundation Studio + an
> always-current/team-shared MCP both need, so we do it once.

---

## 1. Goals & constraints

**Goals**
- **One-line setup:** `claude mcp add --transport http brand-kit https://mcp.nonoun.io/mcp` → the agent
  triggers an OAuth sign-in (magic-link) → it serves **that account's** kits. No URLs or tokens to copy.
- **Always-current + team-shared:** kits live with the account; re-saving updates the hosted kit; Studio
  teammates on the same account see it — the recurring value the subscription is sold on.
- **Identical token surface** to the downloadable server (parity is a gate, not a hope).
- **Near-zero fixed cost**, free-tier-first on Cloudflare.

**Constraints (load-bearing — unchanged)**
- **The generator stays client-side.** The Vite SPA is static (Cloudflare **Pages**); the Figma plugin stays
  **offline** (`networkAccess:"none"`).
- **No `fetch` in the app bundle.** Auth + kit-sync are network calls → they go through **web-only seams**
  (injected by `src/main.ts`, like the Lemon Squeezy `_licenseService`), so `app.js` / the Figma `ui.html`
  bundle stay network-free. Account/sync UI is hidden when `inFigma`.
- **Entitlement-gated.** The hosted MCP serves only accounts with an active Pro/Studio entitlement, verified
  **server-side** (LS by email + webhook), never the client-side check.

**New scope this introduces**
- **NONOUN accounts** (email magic-link) — the product's first identity layer.
- **Server-side kit sync** — kits push from the app to the account so the MCP (and other devices) see them.

---

## 2. Recommended architecture at a glance

| Concern | Choice | Why |
|---|---|---|
| Static app | Cloudflare **Pages** | the SPA build + Figma bundle are static assets |
| Identity | **email magic-link**, NONOUN-owned, linked to LS by email | no passwords, no third-party IdP; one auth system for the app login + the MCP OAuth |
| Email delivery | **Resend** (Postmark/SES as alts) | simple API from a Worker, generous free tier (Cloudflare MailChannels free tier is gone) |
| MCP server + OAuth | Cloudflare **Worker** + **`workers-oauth-provider`** + **`McpAgent`** (Durable Objects) | the supported Cloudflare pattern for *authenticated* remote MCP; the access token carries the user identity into the handlers |
| Transport | **Streamable HTTP**, JSON-RPC 2.0 | the MCP remote transport agents speak |
| Kit blobs | **Workers KV** (`kit:<kitId>` → resolved `brand-kit.json`) | read-heavy, tiny JSON, global edge reads |
| Accounts / kits / subs | **D1** (SQLite) | relational: users · sessions · accounts(+members for Studio) · kits · ls_subscriptions |
| Entitlement | LS link by email + **webhook** → stored status (cron re-check) | serve-time reads stored status → LS downtime can't break serving (fail-open) |
| Client fallback | a user-generated **personal access token** (bearer) for non-OAuth clients | universal compatibility if a client can't do OAuth |
| Deploy | **`wrangler`**; secrets via `wrangler secret` | standard Cloudflare toolchain |

```
                       ┌────────────────────────────── Cloudflare ───────────────────────────────┐
 Browser (user) ──────▶│  Pages: the static generator (SPA)                                       │
   │  sign in / sync    │      │  POST /auth/start{email}        POST /api/kits/<id>{kit}          │
   │  (web-only seams)   │      ▼  (magic link emailed)            ▼  (signed-in + Pro)             │
   └───────────────────▶│  Worker (mcp.nonoun.io)                                                  │
                        │   • magic-link auth → session (D1)   • kit sync → KV(kit:<id>) + D1       │
                        │   • LS link by email (+ webhook)     • OAuth server (workers-oauth-provider)
                        │                                                                           │
 AI agent (Claude…) ───▶│  POST /mcp  (Streamable HTTP)                                             │
   claude mcp add        │   1. discovers OAuth metadata → registers → /authorize                   │
                        │   2. user signs in via the SAME magic-link → consent → access token       │
                        │   3. McpAgent resolves the user → serves THEIR account's kits (KV)         │
                        │                                                                           │
 Lemon Squeezy webhook ▶│  POST /api/webhook (HMAC) → upsert subscription by email → entitlement    │
                        └───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The two delivery modes (parity)

| | **Free — downloadable** (today) | **Pro — hosted, account-based** (this spec) |
|---|---|---|
| Where | `mcp/brand-kit-server.mjs`, on the user's machine | one Cloudflare Worker, always on |
| Transport | JSON-RPC over **stdio** | JSON-RPC over **Streamable HTTP** + **OAuth** |
| Kit source | a sibling `brand-kit.json` snapshot | the account's **synced, live** kits (KV) |
| Setup | unzip + `claude mcp add -- node …` | `claude mcp add --transport http brand-kit https://mcp.nonoun.io/mcp` → sign in |
| Multi-kit | one file = one kit | the account's kits via `list_kits` + a `kit` arg |
| Surface | **identical** (same core module) | **identical** (same core module) |

Surface (identical across both): tools `list_palettes` · `get_ramp` · `resolve_token` · `get_semantic` ·
`nearest_token` · `get_type` · `get_geometry` (+ **`list_kits`** and an optional `kit` arg on the hosted
server); resources `brand://kit|palettes|semantic/light|semantic/dark|type|geometry|guide`; prompt
`apply_brand`; protocol `2025-06-18`.

---

## 4. Accounts & magic-link auth

- **Sign up / in:** the app (or the OAuth `/authorize` screen) asks for an email → `POST /auth/start` → the
  Worker mints a single-use, short-TTL (~15 min) token, stores its hash in D1, and emails a link
  (`https://app.nonoun.io/auth/verify?token=…`) via Resend → clicking it `POST /auth/verify` → the Worker
  creates a **session** (a row in D1 + an httpOnly, Secure session cookie for the app).
- **Link to the LS subscription by email:** the LS **webhook** (`order_created`, `subscription_*`) upserts a
  `ls_subscriptions` row keyed by the purchase email; an account's entitlement = the subscription whose
  email matches. **Fallback** when the account email ≠ the checkout email: a one-time "enter your license
  key to link" action (validates via LS, attaches the subscription to the account).
- **Studio (teams):** an account can be a **team** with members (the `account_members` table). A Studio
  subscription's seats = the team's members; all members see the team's kits + the hosted MCP. This is why
  accounts (not per-kit tokens) are the right substrate for Studio.

---

## 5. The MCP OAuth flow (what "authenticate when adding to Claude" means)

The Worker is an **OAuth 2.1 authorization server** via `workers-oauth-provider` (supports the dynamic
client registration MCP clients use). The magic-link login **is** the login step inside `/authorize`:

1. `claude mcp add --transport http brand-kit https://mcp.nonoun.io/mcp`.
2. Claude fetches the protected-resource + auth-server **metadata**, **registers dynamically**, opens the
   browser to **`/authorize`**.
3. Not signed in → the Worker shows "enter your email" → magic link → verified → **consent** ("Allow Claude
   to read your brand kits?") → the Worker issues an **authorization code** → redirects back to Claude.
4. Claude exchanges the code for an **access token** (+ refresh token).
5. Claude calls `/mcp` with `Authorization: Bearer <access token>` → **`McpAgent`** resolves the user from
   the token → serves **that account's** kits.

One auth system, two entry points (app session **and** the MCP OAuth `/authorize`). A **personal access
token** (generated in the app) is the documented fallback for any client that can't do OAuth.

---

## 6. Kit sync (app → account)

- **When:** while signed in **and** Pro/Studio, saving a set pushes its **resolved** kit (`brandKit(doc,
  systems)`) to `POST /api/kits/<kitId>` (the web-only `_kitSync` seam). The app still keeps the local
  localStorage copy — the cloud copy is what the hosted MCP serves.
- **What:** the same `brand-kit.json` the downloadable server consumes (palettes, ramps, 59 roles light+dark,
  type, geometry, name) → KV `kit:<kitId>`; the metadata row (owner, name, updatedAt) → D1.
- **Active kit:** the app marks one kit "active for MCP" (or all are exposed via `list_kits`). Single-brand
  users get their one kit; agencies/Studio scope with the `kit` arg.
- **Conflict/versioning:** last-write-wins per kit (a single owner editing); store `updatedAt`. Multi-device
  concurrent edits are out of scope for v1 (note it).

---

## 7. Code reuse — transport-agnostic core (parity gate)

Unchanged from the first draft and still **Phase A**: extract **`mcp/brand-kit-core.mjs`** (PURE) exporting
`buildSurface(kit) → { TOOLS, RESOURCES, PROMPTS, SERVER, PROTOCOL_VERSION }` + `handle(message, surface)`
(the JSON-RPC dispatch). The stdio server (download) and the Worker (hosted) both import it → identical
surface, **parity-gated by a test** (mirrors `bind-plan.mjs` ↔ `figma-semantic-binder/code.js`). The hosted
server adds `list_kits` + the `kit` arg on top of the shared core. Shippable in-repo now, no Cloudflare
needed — it de-risks everything downstream by locking the surface first.

---

## 8. Data model (D1 + KV)

**KV** — `kit:<kitId>` → the resolved `brand-kit.json` (the served payload).

**D1**
| table | columns (essentials) |
|---|---|
| `users` | `user_id` · `email` (unique) · `created_at` |
| `magic_links` | `token_hash` · `user_id` · `expires_at` · `used_at` (single-use) |
| `sessions` | `session_id` · `user_id` · `expires_at` |
| `accounts` | `account_id` · `owner_user_id` · `name` (personal or Studio team) |
| `account_members` | `account_id` · `user_id` · `role` (for Studio seats) |
| `kits` | `kit_id` · `account_id` · `name` · `active` · `updated_at` (blob is in KV) |
| `ls_subscriptions` | `email` · `ls_subscription_id` · `status` · `variant` (Pro/Studio) · `current_period_end` |

Entitlement(account) = join `accounts → users.email → ls_subscriptions` (active + unexpired). OAuth
access/refresh tokens are managed by `workers-oauth-provider` (its own KV/DO storage).

---

## 9. Security

- **MCP is read-only, low blast radius:** every tool is a pure read of the account's own brand tokens — no
  write tools, no outbound fetches, no private data beyond the kit. The lethal trifecta doesn't apply.
- **Magic links:** single-use, short-TTL, hashed at rest, HTTPS-only; rate-limit `/auth/start` per email/IP
  to prevent enumeration + email bombing.
- **Sessions/tokens:** httpOnly + Secure + SameSite cookies for the app session; OAuth tokens scoped to
  `mcp:read`, short-lived access + rotating refresh (handled by the provider); never log token/link values.
- **Tenant isolation:** a request only ever reads the authenticated account's kits; `kitId`s are unguessable.
- **Webhook authenticity:** verify the LS `X-Signature` HMAC (a Worker secret).
- **Abuse/DDoS:** Cloudflare rate-limiting + WAF on `/mcp`, `/auth/*`, `/api/*`; Cloudflare handles DDoS.

---

## 10. App integration

- **Sign-in UI:** a lightweight "Sign in" (email → "check your inbox") in the app shell / Settings « Account »
  — **web only** (hidden `inFigma`). Signed-in + Pro unlocks **cloud sync** + the **hosted MCP** panel.
- **Hosted-MCP panel** (Config / Account): shows the **one** endpoint URL + the `claude mcp add` snippet +
  per-kit "active for MCP" toggles + a personal-access-token generator (fallback) + "this kit is live".
  Gated by `flagOf("hostedMcp")`; locked → `_proUpsell()`.
- **Web-only seams** (in `src/main.ts`, like `_licenseService`): `_authClient` (magic-link start/verify,
  session), `_kitSync` (push kits), `_mcpAccount` (endpoint/token management). `app.js` + the Figma bundle
  stay network-free; the offline Figma plugin shows none of this.
- **`hostedMcp` stays unwired in `TIER_FLAGS`** until the Worker + accounts exist (Phase E), so the gate
  never promises an undeployed capability.

---

## 11. Deployment & ops

- **Pages:** the static SPA + the Figma bundle artifact (`app.nonoun.io`).
- **Worker (`mcp.nonoun.io`):** MCP + OAuth + `/auth/*` + `/api/*` + the LS webhook; bindings: KV, D1,
  Durable Objects (McpAgent + the OAuth provider). Secrets (`RESEND_API_KEY`, `LS_WEBHOOK_SECRET`, session
  signing key, an LS API key for license-link validation) via `wrangler secret`.
- **Domains:** `app.nonoun.io` (Pages) · `mcp.nonoun.io` (Worker). Magic-link return + OAuth redirect URIs
  registered to these.
- **Cost (free-tier-first):** Workers/KV/D1 free tiers cover launch volume; Resend free tier for email;
  Durable Objects bill on paid Workers ($5/mo) — realistically single-digit dollars/mo, consistent with
  near-zero fixed cost. (DO is the one new line item vs. the tokenless design — the price of real auth.)
- **Observability:** Workers logs / Logpush; a `/health` route; alert on webhook-verify + email-send failures.

---

## 12. Phased plan (each shippable)

| Phase | Deliverable | Touches | Verifiable by |
|---|---|---|---|
| **A. Core + parity** | extract `mcp/brand-kit-core.mjs`; stdio server reuses it; parity test | repo only | `npm test` (new `mcp/core` verifier) |
| **B. Accounts + email** | D1 users/sessions/magic_links; `/auth/start` + `/auth/verify`; Resend | `worker/` | Worker integration tests (mock email) |
| **C. Kit sync** | `/api/kits/*`; KV blobs + D1 metadata; the `_kitSync` seam (stubbed in tests) | `worker/`, app seam | sync round-trip test |
| **D. The authed MCP** | `workers-oauth-provider` + `McpAgent` serving the account's kits (`list_kits` + `kit` arg) | `worker/` | an OAuth-capable MCP client smoke; parity vs the core |
| **E. App integration** | sign-in UI + sync + the hosted-MCP panel; **un-block `hostedMcp`**; LS webhook → entitlement | `src/main.ts`, `app.js`, `flags.js`, `worker/` | headless `(hm)` leg (seam stubs) + offline-bundle guard |
| **F. Studio + hardening** | team accounts/members; revocation; rate-limit; PAT fallback; manage UI | `worker/`, app | webhook/revocation + team-access tests |

**Phase A starts now** (pure in-repo, no Cloudflare account) and is independent of every decision below.

---

## 13. Open decisions (smaller now)

1. **Email provider:** **Resend** (recommended) vs Postmark / SES.
2. **`McpAgent`/Durable Objects** (recommended — the supported authed-MCP path) vs a hand-rolled stateless
   OAuth-token-validated Worker (cheaper, more to build/own).
3. **Multi-kit UX:** `list_kits` + a `kit` arg (recommended) vs a single "active" kit per account.
4. **Email↔license mismatch:** require same email vs the "enter license key to link" fallback (recommended).
5. **Studio teams in v1** vs deferring teams to Phase F (recommended — ship solo accounts first).

## 14. Risks & open questions

- **OAuth client coverage:** confirm the target agents do MCP OAuth (Claude Code/Desktop do); the **PAT
  fallback** covers the rest.
- **Accounts are new surface area:** auth, sessions, email deliverability, and kit-sync are real
  build+ops cost — sequenced behind Phase A so the surface/parity is locked first.
- **Parity drift:** hosted ↔ downloaded ↔ in-app token output must stay identical — the core + parity gate
  is the guard, extended to the Worker in D.
- **Revocation latency:** webhook + cron → a lapsed sub stops serving within minutes (fine for a read-only
  feed; documented).
- **Offline-Figma invariant:** auth/sync/MCP paths must never enter the plugin bundle — enforced by the
  web-only seams + the existing `figma/plugin.mjs` no-network grep.
