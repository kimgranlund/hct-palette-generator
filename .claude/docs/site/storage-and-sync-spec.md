# SPEC — Storage & Offline-First Sync

**Status:** draft / design (for later). **Rubric:** authoring-specs (gate dims S1·S2·S4·S7).
**Composes under:** `docs/site/mcp-hosting-spec.md` (the hosted MCP serves the kits this layer syncs).
**Altitude:** behavior + contracts; algorithms/file layout deferred to LLD.

A durable storage + **offline-first background sync** layer so **everything a user makes is stored and
retrievable — including free/anonymous users** — and a **reliable sync engine that runs safely in the
background**. The app stays local-first (works fully offline); sync is additive and never on the UI's
critical path; the Figma plugin stays offline.

---

## 1. PRD goals (trace targets)

| ID | Goal |
|---|---|
| **PRD-G1** | **Never lose work.** Everything a user creates is durably stored and retrievable — for free/anonymous users too, not only Pro/Studio. |
| **PRD-G2** | **Offline-first.** The app is fully functional offline; sync is additive, automatic, and never blocks or degrades the UI. |
| **PRD-G3** | **Seamless identity progression.** Anonymous → claimed into an email-magic-link account → Pro/Studio, with **zero data loss** at every step. |
| **PRD-G4** | **Multi-device + team continuity.** A signed-in user's work is available on all their devices; Studio team members share the team's work. |
| **PRD-G5** | **Feed the hosted MCP.** Synced kits are the source the hosted MCP serves (composes under the MCP/accounts spec). |
| **PRD-G6** | **Safe · private · low-cost.** Background sync never corrupts or loses local data; data has a clear retention/deletion policy; cost stays near-zero; the Figma plugin stays offline. |

## 2. Scope & non-goals

**In scope:** the local-first store; the durable outbox + background sync engine; anonymous→account claim;
per-doc conflict resolution; deletion + retention; the server sync API + storage (Cloudflare); owner
isolation. **Non-goals (v1):** real-time multi-user co-editing / CRDT merge (LWW only — see Open Items);
rich version history/branching beyond a single conflict copy; syncing app *preferences* (only documents/kits
are synced in v1).

## 3. Architecture overview (right-altitude)

- **Local store (source of truth):** the app reads/writes a durable local store; the UI never waits on the
  network. (Local engine — IndexedDB-class — chosen in LLD.)
- **Outbox:** every change appends an idempotency-keyed **mutation** to a durable local queue.
- **Sync worker:** a background process drains the outbox to the server (push) and merges server changes back
  (pull), with retry/backoff; opportunistic on connectivity; runs in a Service Worker when available,
  foreground reconciler otherwise. **Web-only** (never in the Figma plugin).
- **Owner reference:** an **anonymous device id** until sign-in; an **account id** after. Anonymous data is
  **claimed** into the account on sign-up.
- **Server (Cloudflare):** D1 for doc metadata + the mutation ledger + ownership; KV/R2 for doc blobs; keyed
  by owner reference. Reuses the accounts/auth from `mcp-hosting-spec.md`.

---

## 4. Requirements

Each: **statement** (MUST/SHOULD) · **Trace** · **AC** (Given/When/Then or measurable).

### 4.1 Storage & retrieval

- **SPEC-R1 — Immediate local durability.** Every create/edit/delete MUST be persisted to the durable local
  store **before** any network attempt and survive reload/crash. *Trace: PRD-G1, PRD-G2.*
  **AC:** Given a doc edit, When the tab is killed immediately after the edit returns, Then on reload the
  edit is present in the local store (no network involved).
- **SPEC-R2 — Server replication (lazy for anonymous).** Account-owned docs MUST replicate to server storage
  continuously. Anonymous docs MUST stay **local-only until a first sync trigger** — the first **export**,
  **hosted-MCP use**, or **sign-in** — after which that device's docs replicate and stay replicated.
  Replicated docs MUST be retrievable by their owner reference. *Trace: PRD-G1, PRD-G6 (bounds free-user
  cost).* **AC:** Given an anonymous user who has never exported, used the MCP, or signed in, When they
  create/edit docs, Then **no** server storage is written for them (local only); And Given they then export
  (a trigger), When sync completes, Then `POST /sync/pull` for that device returns those docs and a different
  owner reference does not.
- **SPEC-R2a — Trigger is sticky.** Once any sync trigger has fired for a device, replication MUST remain on
  for that device's docs (it does not revert to local-only). *Trace: PRD-G1.* **AC:** Given a device whose
  trigger fired, When the user later edits offline and reconnects without re-triggering, Then the edits still
  replicate.
- **SPEC-R3 — Cross-device retrieval.** A user MUST be able to list and fetch all docs for their owner
  reference on any device that presents it (same anonymous device id, or any device signed into the account).
  *Trace: PRD-G1, PRD-G4.* **AC:** Given account A has docs from device 1, When device 2 signs into A and
  pulls, Then device 2's local store contains A's non-deleted docs.

### 4.2 Identity spectrum & claim

- **SPEC-R4 — Anonymous owner reference.** On first run the client MUST generate a stable, unguessable
  anonymous **device id** (≥128 bits entropy), persist it locally, and use it as the owner reference until
  sign-in. *Trace: PRD-G1, PRD-G3.* **AC:** Given a fresh install, When it boots, Then a 128-bit-class id
  exists in local storage and is sent as the owner reference on sync; it is stable across reloads.
- **SPEC-R5 — Claim on sign-in (zero loss).** On the first sign-in on a device, the system MUST re-own that
  device's anonymous docs to the account, idempotently, with **no doc lost or duplicated**; subsequent edits
  are account-owned. *Trace: PRD-G3.* **AC:** Given device D has N anonymous docs, When the user signs into
  account A, Then A owns exactly those N docs (∪ A's existing), none duplicated; re-running claim is a no-op.
- **SPEC-R6 — Claim contention.** A device's anonymous data MUST be claimable by **at most one** account
  (first claim wins; a later claim by another account is rejected, not destructive). *Trace: PRD-G3, PRD-G6.*
  **AC:** Given device D already claimed by account A, When account B attempts to claim D, Then the server
  returns `409 already_claimed` and D's data is unchanged.
- **SPEC-R7 — Team visibility (Studio).** Account-owned docs MUST be visible to all members of a Studio team
  account, per the member's role. *Trace: PRD-G4.* **AC:** Given team T with members U1, U2 and a doc owned
  by T, When U2 pulls, Then U2 receives the doc (read per role).

### 4.3 Offline-first

- **SPEC-R8 — Full offline function.** With no connectivity the app MUST support create/edit/delete/list/open
  entirely from the local store; no network call is on any user-action critical path. *Trace: PRD-G2.*
  **AC:** Given the network is offline, When the user creates and edits a doc, Then every action succeeds
  with no error and no spinner blocking input.
- **SPEC-R9 — Automatic resume.** Mutations made offline MUST sync automatically on reconnect with **no user
  action**. *Trace: PRD-G2.* **AC:** Given M offline mutations queued, When connectivity returns, Then within
  the SPEC-N3 target the outbox drains to empty and the server reflects all M.

### 4.4 The sync engine (outbox · background · idempotent · safe)

- **SPEC-R10 — Durable outbox.** Each change MUST append a mutation carrying a client-generated **idempotency
  key** to a durable local outbox that survives reload/crash until the mutation is acknowledged. *Trace:
  PRD-G2, PRD-G6.* **AC:** Given a queued mutation, When the tab crashes before sync, Then on reload the
  mutation is still in the outbox and is sent exactly as authored.
- **SPEC-R11 — Background, non-blocking, backoff.** A background process MUST drain the outbox when online,
  retrying transient failures with **bounded exponential backoff + jitter**, without blocking or degrading
  the UI; it MUST run in a Service Worker (Background Sync) when available, with a foreground reconciler
  fallback. *Trace: PRD-G2, PRD-G6.* **AC:** Given the server returns 503 thrice then 200, When sync runs,
  Then it retries with increasing delay (jittered), eventually applies, and the main thread stays responsive
  (no long task > 50ms attributable to sync) throughout.
- **SPEC-R12 — Effectively-once apply.** Mutation application MUST be idempotent: at-least-once delivery + the
  idempotency key MUST yield effectively-once server apply (a retried or duplicated mutation neither
  duplicates a doc nor double-applies). *Trace: PRD-G6.* **AC:** Given a mutation applied with key K, When the
  identical mutation (key K) is received again, Then the server returns the prior result and makes no further
  change.
- **SPEC-R13 — Partial-failure safety.** Within a push batch, applied mutations MUST be acknowledged and
  removed from the outbox while failed ones remain queued; a failed sync MUST never corrupt, roll back, or
  drop local data. *Trace: PRD-G6.* **AC:** Given a 3-mutation batch where #2 is rejected, When the response
  returns, Then #1 and #3 leave the outbox, #2 remains for retry, and the local store is unchanged by the
  failure.
- **SPEC-R14 — Web-only.** The sync engine MUST run only in the web app and MUST be absent from the offline
  Figma plugin bundle (a web-only seam, like `_licenseService`). *Trace: PRD-G6.* **AC:** Given the Figma
  `ui.html` bundle, When grepped, Then it contains no sync `fetch`/Service-Worker registration; the plugin
  works offline with local-only storage.

### 4.5 Conflict resolution

- **SPEC-R15 — Deterministic LWW + conflict copy.** Concurrent edits to one doc MUST resolve by
  **last-writer-wins** on `(version, updatedAt, ownerRef)` (in that tiebreak order), and the losing body MUST
  be preserved as a recoverable **conflict copy**, never silently discarded. *Trace: PRD-G2, PRD-G4.*
  **AC:** Given device 1 and device 2 both edit doc X from base version v, When both sync, Then the server's
  X equals the higher-precedence write, the other write is retrievable as a conflict copy, and both devices
  converge to that state on next pull.
- **SPEC-R16 — Non-clobbering pull.** Pull MUST merge remote changes into the local store **without**
  overwriting un-synced local mutations (reconcile against the outbox; never blind-overwrite). *Trace:
  PRD-G2.* **AC:** Given local doc X has an un-synced edit, When a pull returns a remote X, Then the local
  un-synced edit is retained (and itself pushed, then resolved per SPEC-R15) — not lost.

### 4.6 Deletion & retention

- **SPEC-R17 — Tombstone deletion.** Deletion MUST be a soft-delete (tombstone with `deletedAt`) that syncs;
  a delete on one device MUST propagate to all the owner's devices. *Trace: PRD-G1, PRD-G6.* **AC:** Given
  doc X deleted on device 1, When device 2 pulls, Then X is marked deleted (absent from the active list) on
  device 2.
- **SPEC-R18 — Anonymous retention bound.** Unclaimed anonymous server data MUST be hard-deleted after
  **90 days** from last activity (or on hitting the per-device cap, SPEC-N5), disclosed to the user;
  claimed/account data is retained while the account exists. *Trace: PRD-G1, PRD-G6.* **AC:** Given an
  anonymous device idle past the retention window, When the retention job runs, Then its server data is
  hard-deleted and a subsequent pull returns empty; the local copy is unaffected.
- **SPEC-R19 — User-initiated permanent deletion.** A user MUST be able to permanently delete a doc or their
  entire account/data, honored on the server within SPEC-N6. *Trace: PRD-G6.* **AC:** Given a delete-account
  request, When confirmed, Then within the SLA all the account's docs + metadata are hard-deleted server-side
  and no longer retrievable.

### 4.7 Security & isolation

- **SPEC-R20 — Owner isolation.** A request MUST only read/write docs owned by the caller's owner reference;
  cross-owner access MUST be impossible. *Trace: PRD-G6.* **AC:** Given owner A's session, When it requests a
  doc owned by B, Then the server returns `404` (not-found, no existence leak) and never B's data.
- **SPEC-R21 — Owner-reference authentication.** The anonymous device id MUST be an unguessable capability
  secret; every sync endpoint MUST authenticate the owner reference (an anonymous device token or an account
  session) over HTTPS, and MUST NOT log token/id values. *Trace: PRD-G6.* **AC:** Given a request with a
  missing/invalid owner token, When it hits any `/sync/*`, Then the server returns `401` and performs no
  storage access.

---

## 5. Typed interface contracts (S4)

### 5.1 Data shapes

```ts
type OwnerRef =
  | { kind: "device"; deviceId: string }   // anonymous (unguessable, ≥128-bit)
  | { kind: "account"; accountId: string }; // post sign-in

interface DocEnvelope {
  id: string;                 // stable doc id (client-minted UUID)
  type: "brand-kit";          // v1 syncs documents/kits only
  body: unknown;              // the serialized doc (serialize(doc)); ≤ SPEC-N4 bytes
  version: number;            // server logical version, monotonic per doc
  updatedAt: string;          // ISO; LWW tiebreak after version
  deletedAt?: string | null;  // tombstone (SPEC-R17)
}

interface Mutation {
  mutationId: string;         // idempotency key (client UUID) — SPEC-R10/R12
  docId: string;
  op: "upsert" | "delete";
  baseVersion: number;        // the version the client edited from (0 = new)
  body?: unknown;             // present for upsert
  clientTs: string;           // ISO
}
```

### 5.2 Sync API (Cloudflare Worker, HTTPS, auth per SPEC-R21)

```
POST /sync/push        Authorization: <owner token | account session>
  req:  { mutations: Mutation[] }                          // ≤ SPEC-N4b per batch
  res:  { results: Array<{
            mutationId: string;
            status: "applied" | "conflict" | "rejected";
            serverVersion?: number;                         // applied/conflict
            serverBody?: unknown;                           // on conflict: the winning body
            conflictCopyId?: string;                        // on conflict: the preserved losing copy
            error?: ErrorCode;                              // on rejected
          }> }

POST /sync/pull        Authorization: <owner token | account session>
  req:  { since?: string; docIds?: string[] }              // cursor; omit = full
  res:  { changes: DocEnvelope[]; cursor: string }          // incl. tombstones

POST /account/claim    Authorization: <account session>     // SPEC-R5/R6
  req:  { deviceId: string }
  res:  { claimed: number } | { error: "already_claimed" }

DELETE /docs/:id       Authorization: <owner>               // SPEC-R19 (hard delete)
DELETE /account        Authorization: <account session>     // SPEC-R19 (account purge)

ErrorCode = "unauthorized" | "not_found" | "already_claimed"
          | "payload_too_large" | "rate_limited" | "version_gap" | "server_error";
HTTP:  200 ok · 401 unauthorized · 404 not_found · 409 already_claimed
       413 payload_too_large · 429 rate_limited · 5xx server_error (client retries)
```

### 5.3 Client sync state machine

```
clean ──edit──▶ dirty ──(online)──▶ pushing ──┬─applied──▶ clean
   ▲                                          ├─conflict─▶ resolve(LWW + conflict copy) ──▶ clean
   └──────────── retry(backoff+jitter) ◀──────┴─5xx/offline─▶ queued
pull(on open / focus / periodic): pulling ──merge(non-clobbering, SPEC-R16)──▶ clean
```

---

## 6. Non-functional requirements (S8 — measurable targets)

| ID | NFR | Target |
|---|---|---|
| **SPEC-N1** | **Durability** | No acknowledged mutation is ever lost; the outbox persists across reload/crash until acked (0 data-loss in SPEC-R10/R13 tests). |
| **SPEC-N2** | **Local action latency** | A create/edit returns from the local store in **< 50 ms** p95; never gated on network. |
| **SPEC-N3** | **Sync convergence** | When online, a change reaches the server within **≤ 5 s** (debounced); on reconnect, a queued outbox drains within **≤ 10 s** for ≤ 100 mutations. |
| **SPEC-N4** | **Payload caps** | Doc body **≤ 256 KB** (a brand kit is tens of KB); **SPEC-N4b** push batch **≤ 100** mutations / **≤ 1 MB**; over-cap → `413`. |
| **SPEC-N5** | **Anonymous retention** | Unclaimed anonymous server data retained **90 days from last activity**, then hard-deleted, **and** capped per device; disclosed in-app. (Server data only exists after a sync trigger, SPEC-R2.) |
| **SPEC-N6** | **Deletion SLA** | User-initiated permanent deletion completes server-side within **≤ 24 h**. |
| **SPEC-N7** | **Background safety** | Sync produces no main-thread long task **> 50 ms**; bounded concurrency; circuit-breaks after repeated failure and resumes on reconnect. |
| **SPEC-N8** | **Security/transport** | HTTPS only; owner isolation (SPEC-R20) has zero cross-owner reads in tests; no token/id logged. |
| **SPEC-N9** | **Cost** | Free-tier-first; storage cost bounded by SPEC-N4/N5; anonymous-user storage cannot grow unbounded (retention + caps). |

---

## 7. Composition & invariants

- **Feeds the MCP (PRD-G5):** the synced `brand-kit` body **is** the payload the hosted MCP serves
  (`mcp-hosting-spec.md` §6) — one storage layer, two readers (the app and the MCP Worker).
- **Reuses accounts/auth:** owner-reference authentication reuses the magic-link account + session from
  `mcp-hosting-spec.md` §4–5; the anonymous device token is the pre-account owner credential.
- **Offline-Figma invariant:** all sync code is a **web-only seam** (`src/main.ts`), absent from the plugin
  bundle (SPEC-R14) — the plugin remains local-only/offline.

## 8. Open items (NON-normative — resolve before/at LLD)

1. **Local engine:** IndexedDB vs OPFS for the local store + outbox (capacity, durability, worker access).
2. **Blob store:** KV vs R2 vs D1-blob for doc bodies (size, read cost, consistency).
3. **Per-device anonymous cap** (SPEC-N5): the byte/doc count that caps a single anonymous device's server
   data (the 90-day window itself is decided).
4. **Background mechanism:** Service Worker Background Sync vs Periodic Background Sync vs a foreground
   reconciler-only baseline (browser support coverage).
5. **Conflict model beyond LWW:** if real-time co-editing is ever in scope, revisit CRDT/OT (explicit
   non-goal in v1).

**Decided (folded into the normative spec):** anonymous storage is **local-only until a first sync trigger**
(export / hosted-MCP use / sign-in), then replicated and sticky — SPEC-R2/R2a. Unclaimed anonymous server
data is retained **90 days** from last activity — SPEC-N5/R18.
