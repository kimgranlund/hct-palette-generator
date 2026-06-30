# Hosted Brand-Kit MCP — Spec & Plan (Cloudflare)

**Status:** draft / design. **Owner:** NONOUN. **Gates:** the `hostedMcp` Pro flag (`src/engine/flags.js`).

The **hosted Brand-Kit MCP** is the live, always-current sibling of the free *downloadable* MCP server. It
is the **recurring-value anchor** for the Pro subscription: the generator itself has no server cost (hard to
justify a sub on), but a hosted, always-current, team-shareable MCP endpoint does. This spec defines how it
runs on **Cloudflare**, reusing the existing server surface, without disturbing the static/offline generator.

---

## 1. Goals & constraints

**Goals**
- A Pro user **publishes** their brand kit and gets a **stable URL** their AI agents connect to directly —
  no local server, always current (re-publishing updates it in place).
- **Identical surface** to the downloadable server: the same tools, resources, and prompt, so an agent
  behaves the same whether the kit is local or hosted (parity is a gate, not a hope).
- **Near-zero fixed cost** (the project's standing philosophy) — scales from $0 on Cloudflare's free tiers.

**Constraints (load-bearing)**
- **The generator stays client-side.** The Vite SPA is static (Cloudflare **Pages**); the Figma plugin stays
  **offline** (`networkAccess:"none"`). The hosted MCP is an **additive, opt-in backend** only Pro users who
  publish ever touch.
- **No `fetch` in the app bundle.** The *publish* call is a network call, so — exactly like the Lemon Squeezy
  license seam — it goes through a **web-only seam** (`_mcpPublisher`, injected by `src/main.ts`), keeping
  `app.js` / the Figma `ui.html` bundle network-free.
- **Entitlement-gated.** Publishing + serving require a valid Pro entitlement (the Lemon Squeezy license),
  verified **server-side** in the Worker (the in-app check from #128 is client-side and not trustable here).

---

## 2. Recommended architecture at a glance

| Concern | Choice | Why |
|---|---|---|
| Static app | Cloudflare **Pages** | the app is moving to Cloudflare; the SPA build + Figma bundle are static assets |
| MCP server | Cloudflare **Worker**, **Streamable HTTP**, **stateless** | the brand-kit server is read-only & holds no session state → no Durable Objects, no per-session cost |
| Kit storage | **Workers KV** (`kit:<kitId>` → resolved `brand-kit.json`) | read-heavy, tiny JSON (tens of KB), globally replicated, fast edge reads |
| Metadata / ownership | **D1** (SQLite) — `kits` table | relational (owner → kits), status/entitlement, revocation, token hash |
| Auth (serve) | per-kit **bearer token** (`Authorization: Bearer …`) | universally supported by MCP clients; simplest secure MVP (OAuth is a later option) |
| Auth (publish) | **server-side LS license validation** (pin store `420293`, require active) | the only trustable entitlement check |
| Revocation | **Lemon Squeezy webhook** → mark kit revoked + periodic re-check | serving reads STORED status, so LS downtime never breaks live serving (fail-open per the hosting plan) |
| Deploy | **`wrangler`**; secrets via `wrangler secret`; tests via **miniflare/`wrangler dev`** | standard Cloudflare toolchain |

```
                         ┌─────────────────────────── Cloudflare ───────────────────────────┐
  Browser (Pro user) ───▶│  Pages: the static generator (SPA)                                │
        │  publish        │      │                                                            │
        │  (web-only seam) │      ▼  POST /api/publish { kit, licenseKey }                     │
        └────────────────▶│  Worker (mcp.nonoun.io)                                           │
                          │   • validates LS license (store 420293, active)  ── api.lemonsqueezy
                          │   • writes kit JSON → KV(kit:<id>)                                 │
                          │   • writes metadata + token hash → D1(kits)                        │
                          │   • returns { url, token }                                         │
                          │                                                                    │
  AI agent (Claude Code,  │  GET/POST /mcp/<kitId>   (Streamable HTTP, JSON-RPC 2.0)           │
  Cursor, …) ────────────▶│   • Authorization: Bearer <token> → D1 lookup (active? unexpired?) │
                          │   • reads KV(kit:<id>) → serves tools/resources/prompts            │
                          │                                                                    │
  Lemon Squeezy webhook ─▶│  POST /api/webhook (HMAC-verified) → mark kit revoked on lapse     │
                          └────────────────────────────────────────────────────────────────────┘
```

---

## 3. The two MCP delivery modes (parity)

| | **Free — downloadable** (today) | **Pro — hosted** (this spec) |
|---|---|---|
| Where | `mcp/brand-kit-server.mjs`, runs on the user's machine | a Cloudflare Worker, always on |
| Transport | JSON-RPC 2.0 over **stdio** | JSON-RPC 2.0 over **Streamable HTTP** |
| Kit source | a sibling `brand-kit.json` file | KV, keyed by `kitId` |
| Freshness | the snapshot the user downloaded | live — re-publish updates in place |
| Setup | unzip + `claude mcp add -- node brand-kit-server.mjs` | `claude mcp add --transport http brand-kit <url> --header "Authorization: Bearer <token>"` |
| Surface | **identical** — 7 tools · 6 resources · `apply_brand` prompt | **identical** (same core module) |

The surface today (must stay identical across both): tools `list_palettes` · `get_ramp` · `resolve_token`
· `get_semantic` · `nearest_token` · `get_type` · `get_geometry`; resources `brand://kit|palettes|semantic/
light|semantic/dark|type|geometry|guide`; prompt `apply_brand`; protocol `2025-06-18`.

---

## 4. Code reuse — extract a transport-agnostic core (parity gate)

Today `mcp/brand-kit-server.mjs` interleaves the **domain surface** (tools/resources/prompts + helpers
`findPalette`, `nearestToken`, `semanticFor`, `usageGuide`) with the **stdio plumbing** (`process.stdin`,
newline framing). To serve the same surface from a Worker, factor the surface out:

- **`mcp/brand-kit-core.mjs`** — PURE, transport-agnostic. Exports `buildSurface(kit) → { TOOLS, RESOURCES,
  PROMPTS, SERVER, PROTOCOL_VERSION }` and a single `handle(message, surface) → response|null` (the
  JSON-RPC dispatch: `initialize` · `tools/list` · `tools/call` · `resources/list` · `resources/read` ·
  `prompts/list` · `prompts/get` · `ping`). No I/O.
- **`mcp/brand-kit-server.mjs`** (stdio) — thin: read `brand-kit.json`, `buildSurface`, frame stdin/stdout
  around `handle`.
- **The Worker** — thin: read the kit from KV, `buildSurface`, wrap `handle` in a Streamable HTTP request
  handler.

**Parity gate:** a test asserts the two entry points expose byte-identical tool/resource/prompt lists for
the same kit (mirrors how `figma-semantic-binder/code.js` is parity-gated against `bind-plan.mjs`). This is
**Phase A** and is shippable in-repo *now*, before any hosting exists.

---

## 5. The Worker — MCP over Streamable HTTP (stateless)

- **Endpoint:** `POST /mcp/<kitId>` accepts a JSON-RPC message and responds with `application/json` (a single
  JSON-RPC response). For a synchronous, read-only server **no SSE stream is required**; `GET /mcp/<kitId>`
  may 405 or return an empty SSE per spec. No `Mcp-Session-Id` — **sessionless** (each call re-reads KV).
- **Why stateless (no Durable Objects):** the server holds no mutable session state; every tool is a pure
  read of the kit. This avoids Cloudflare's `McpAgent`/Durable-Object cost + complexity. (If a future tool
  needs per-session state, revisit — `McpAgent` is the escape hatch.)
- **Per-request flow:** resolve `kitId` → check `Authorization: Bearer` against D1 (`active`, not revoked,
  entitlement unexpired) → `kit = JSON.parse(KV.get("kit:"+kitId))` → `buildSurface(kit)` → `handle(msg)`.
- **CORS:** MCP clients are usually server-side (no CORS), but browser-hosted clients need it — set
  permissive CORS on `/mcp/*` (or echo the request origin) and handle `OPTIONS` preflight.

---

## 6. Data model

**KV** — the served payload, one key per kit:
```
kit:<kitId>  →  the resolved brand-kit.json  (brandKit(doc, systems) output: palettes, ramps,
                the 59 semantic roles light+dark, type, geometry, name, generator)
```

**D1** — `kits` (ownership, auth, lifecycle):
| column | meaning |
|---|---|
| `kit_id` (PK) | the unguessable id in the URL path |
| `owner` | the Lemon Squeezy customer id / license-key hash |
| `name` | the kit's display name |
| `token_hash` | SHA-256 of the per-kit bearer token (never store the raw token) |
| `status` | `active` \| `revoked` |
| `entitlement_expires_at` | mirrors the LS subscription period (serve-time check) |
| `created_at` · `updated_at` | timestamps |

`kitId` and `token` are independent random secrets: the URL can be shared (read-discoverable) while access
still requires the token. A Pro user may publish **multiple** kits (one row each) — Pro is unlimited.

---

## 7. Flows

**Publish** (app → Worker)
1. Pro user clicks **Publish to hosted MCP** (web only; gated by `flagOf("hostedMcp")`).
2. The web-only `_mcpPublisher` seam `POST`s `{ kit: brandKit(doc, systems), licenseKey, kitId? }` to
   `https://mcp.nonoun.io/api/publish`.
3. Worker **validates the LS license** server-side (store `420293`, status active) → on fail, 402.
4. Worker mints `kitId` (first publish) + a `token`, writes `kit:<kitId>` to KV and the row to D1.
5. Returns `{ url: "https://mcp.nonoun.io/mcp/<kitId>", token }`. The app shows the URL + token + the
   `claude mcp add --transport http …` snippet + a copy button.

**Update / re-publish** — same call with the existing `kitId` → overwrites KV, re-checks entitlement,
bumps `updated_at`. The URL is stable; agents pick up the new tokens with no reconfig.

**Unpublish** — `POST /api/unpublish { kitId, licenseKey }` → delete KV + mark D1 `revoked`.

**Revocation on lapse** — Lemon Squeezy **webhook** (`subscription_cancelled` / `subscription_expired` /
`license_key_updated`) → HMAC-verify → mark the owner's kits `revoked` (or set `entitlement_expires_at`).
Serving reads the **stored** status, so a lapsed sub stops serving without a live LS call per request, and
**LS downtime never breaks live serving** (the hosting plan's fail-open rule). A periodic re-validate
(cron Trigger) backstops missed webhooks.

**Token rotation** — `POST /api/rotate { kitId, licenseKey }` → new token hash; old token stops working.

---

## 8. Security

- **Read-only, low blast radius.** Every tool is a pure read of the user's own brand tokens — no write
  tools, no outbound fetches, no private data beyond the kit. The lethal-trifecta (private data + untrusted
  content + exfiltration) does not apply: there's nothing to exfiltrate and no action to hijack.
- **Tenant isolation:** `kitId` is unguessable and never enumerated; one kit's request can never read
  another's KV key. The bearer token gates access; store only its SHA-256.
- **Transport:** HTTPS only (Cloudflare default). Never log token/license values.
- **Abuse:** Cloudflare **rate-limiting rules** + WAF on `/mcp/*` and `/api/*`; DDoS is Cloudflare-handled.
- **Webhook authenticity:** verify the LS `X-Signature` HMAC with the webhook secret (a Worker secret).
- **Input validation:** the tool args are already domain-validated in the core (`resolve_token` slug/scheme,
  `nearest_token` hex) — keep that in `brand-kit-core.mjs`.

---

## 9. App integration (the `hostedMcp` gate)

- In the export drawer's **Config** sub-bar, beside **Download Brand-Kit MCP** (free), add **Publish to
  hosted MCP** — gated by `flagOf("hostedMcp")`. When locked, reuse `_proUpsell()` (→ Settings « Account »).
- When Pro: publish → render the live **URL + token + `claude mcp add` snippet** + **Manage** (re-publish /
  unpublish / rotate). Persist the `kitId` on the doc/profile so the app shows "published" state.
- **Web-only by construction:** the publish `fetch` lives in the `_mcpPublisher` seam injected by
  `src/main.ts` (exactly like `_licenseService`), so `app.js` and the Figma bundle stay network-free; the
  publish UI is hidden when `inFigma` (the plugin is offline/free).
- **`hostedMcp` flag is BLOCKED until the Worker exists** — leave it `false`/unwired in `TIER_FLAGS` until
  Phase D, so the gate can't promise a capability that isn't deployed.

---

## 10. Deployment & ops

- **Pages:** the static SPA build (the existing single-file/Vite output) + the Figma bundle artifact.
- **Worker (`mcp.nonoun.io`):** the MCP server + `/api/*` + the webhook, with KV + D1 bindings; deployed via
  `wrangler`. Secrets (`LS_WEBHOOK_SECRET`, any LS API key) via `wrangler secret put`.
- **Domains:** `app.nonoun.io` (Pages) · **`mcp.nonoun.io`** (Worker) — a dedicated subdomain keeps the MCP
  surface + publish API isolated from the app origin.
- **Cost (free-tier-first):** Workers 100k req/day free ($5/mo → 10M); KV 100k reads/day free; D1 free tier.
  Realistically **$0** at launch volume, scaling to single-digit dollars — consistent with the near-zero
  fixed-cost plan.
- **Observability:** Workers logs / Logpush; a `/health` route; alert on webhook-verify failures.

---

## 11. Phased plan (each phase shippable)

| Phase | Deliverable | Touches | Verifiable by |
|---|---|---|---|
| **A. Core + parity** | extract `mcp/brand-kit-core.mjs`; stdio server reuses it; parity test | repo only (no hosting) | `npm test` (a new `mcp/core` parity verifier) |
| **B. The Worker** | a stateless Streamable-HTTP MCP Worker serving a kit from KV (read-only, no auth yet) | new `worker/` (separate from the app build) | miniflare/`wrangler dev` + an MCP client smoke |
| **C. Publish + storage + entitlement** | `/api/publish` · `/api/unpublish`, KV+D1, server-side LS validation, bearer token | `worker/` | Worker integration tests (mock LS) |
| **D. App integration** | the `_mcpPublisher` web-only seam + the Publish UI behind `flagOf("hostedMcp")`; **un-block the `hostedMcp` flag** | `src/main.ts`, `src/ui/app.js`, `flags.js` | headless `(hm)` leg (seam stub) + the offline-bundle guard |
| **E. Lifecycle + hardening** | LS webhook revocation, cron re-validate, rate-limiting, token rotation, the Manage UI | `worker/`, app | webhook signature test; revocation test |

**Phase A can start now** and is pure in-repo work (no Cloudflare account needed) — it also de-risks B/C by
locking the shared surface first.

---

## 12. Open decisions (need your call)

1. **Auth model:** per-kit **bearer token** (recommended MVP — simplest, universal) vs full **MCP OAuth**
   (Cloudflare `workers-oauth-provider`; a nicer "connect your account" UX, more to build).
2. **Read policy:** **token-required** (recommended) vs **public-read** (URL alone serves; simpler to share,
   but anyone with the link reads the kit — fine if you consider brand tokens non-secret).
3. **URL shape:** `mcp.nonoun.io/mcp/<kitId>` (recommended) vs a path on the app domain.
4. **Metadata store:** **D1** (recommended — relational owner→kits, revocation queries) vs all-in-**KV**
   (simpler, but awkward for "list a user's kits" / webhook fan-out).
5. **Cloudflare `McpAgent`/Durable Objects** vs the **hand-rolled stateless Worker** (recommended — our
   server is read-only/stateless, so DO is cost+complexity we don't need).
6. **Hosted-kit limit:** unlimited per Pro user (matches `maxSets:∞`) vs a soft cap.

---

## 13. Risks & open questions

- **MCP client compatibility:** confirm the target clients (Claude Code, Cursor, VS Code, ChatGPT) speak
  **Streamable HTTP** + bearer headers. Claude Code does (`claude mcp add --transport http … --header`).
  Keep SSE as a fallback only if a target client needs it.
- **Parity drift:** the hosted, downloaded, and in-app token outputs must stay identical — the Phase-A core
  + parity gate is the guard; extend it to cover the Worker in B.
- **Revocation latency:** webhook + cron means a lapsed sub stops serving within minutes, not instantly —
  acceptable for a read-only token feed; documented.
- **Offline-Figma invariant:** the publish path must never enter the plugin bundle — enforced by the
  `_mcpPublisher` seam (web-only) + the existing `figma/plugin.mjs` no-network grep extended if needed.
