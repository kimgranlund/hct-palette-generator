<!-- voice-check: rulebook — this doc quotes banned lexicon as rules; the checker exempts it -->
# The NONOUN voice platform

The canonical voice record for **Ultimate Tokens by NONOUN** and the NONOUN brand. Every piece of
brand, product, or marketing writing is authored against this platform and gated by §6. Operational
application lives in the `color-tokens-brand-voice` skill; pinned product facts live in
[`../fact-sheet.md`](../fact-sheet.md) — this document owns *who is speaking and how*, not the numbers.

---

## 1 · Identity — who NONOUN is

**NONOUN** is a one-person workshop that sells the instrument it makes. The name is a refusal: *no
noun* — strip away the object, the ornament, the brand-as-thing, and what remains is the **system of
relations**: hue to ramp, ramp to role, scale to step. The name cashes out as a grammar rule, not a
slogan: **no nouns, just verbs** — derive, map, bind, ship (§5). The etymology stays internal;
customer copy never explains the name.

**Ultimate Tokens** is the instrument: a perceptual design-token generator whose thesis is
**derivation over guesswork**. "Ultimate" is defended the same way — *ultima*, the last term of a
series: the tokens at the **end of the derivation**, a position, not a boast. **"Ultimate" is a proper
name, never an adjective** — copy never constructs "the ultimate X". The product's engineering ethos —
zero dependencies, offline-capable, engines pure, output verifiable — *is* the brand ethos; the voice
never claims a value the code doesn't embody.

Naming discipline: **"Ultimate Tokens by NONOUN"** at first formal mention (store, page titles,
legal); **"Ultimate Tokens"** thereafter; **NONOUN** is the maker, always uppercase; the internal id
`nonoun-color-tokens` never appears in customer-facing copy (code identifiers, paths, and URLs are
exempt until the app moves off the project domain).

## 2 · Persona — who is speaking

**The toolmaker at their bench.** Not a salesperson at a booth — a maker showing another maker how the
instrument works, by using it in front of them.

- **Speaks from the work.** Demonstrates rather than asserts: the README's hero image is the tool's
  real render, "no mockup" — that move *is* the persona.
- **Precise, not cold.** The warmth is in the respect — for the reader's time, intelligence, and craft.
- **Quietly confident.** Quality is stated plainly and once; the persona never begs, inflates, or
  hedges what it can prove.
- **A maker among makers.** The reader is a peer: a design engineer, a product designer, a studio.
  Peer jargon (OKLCH, DTCG, semantic roles) needs no apology; growth-speak never appears.
- **The persona is a compass, not a costume.** Workshop vocabulary ("bench", "instrument",
  "workshop") steers *how* copy is written and **never appears in customer-facing copy itself** —
  copy that performs craftsmanship instead of demonstrating it has failed this section.
- **Smallness is a feature, stated as one.** Lifecycle mail is signed by the maker ("— NONOUN" or the
  maker's name), never a team that doesn't exist. The one-person shop is why the instrument is built
  to outlive attention: the single file runs offline forever *because* there's no server farm behind
  it — that line converts the bus-factor objection into proof of §3's ownership conviction.

## 3 · Stance — what the voice argues from

**The thesis (the zag no competitor can say):** *one decision, exported everywhere — change it once
and every export re-derives together.* Exports don't drift from each other because they aren't kept
in sync; they are the same decision, derived per target. Copy states it that way — re-derivation on
change — never as "your exports can never be stale" (a shipped CSS file and a later-edited kit are
different snapshots; the claim is about the kit, not the customer's deploy pipeline).

The supporting convictions:

1. **Derived, not guessed.** A few perceptual choices in; a complete, measured system out.
   Hand-nudging is the enemy. The signature line — *"Tokens, derived — not guessed."* — is the thesis
   compressed.
2. **Perceptual truth is the substrate.** Color is modeled where human vision is even; the popular hex
   format is an output, not a source of truth. (This is the *how* under the thesis — in 2026 perceptual
   color alone is table stakes; the differentiation is deriving **color, type, and geometry from one
   source**. Copy leads with the system, not the color space. Vendor and protocol names stay out of
   conviction sentences — they live in the fact sheet and date whatever carries them.)
3. **Built to stay yours.** Local-first by default: no sign-up to start, works offline, nothing leaves
   the machine but the license check. Anything hosted is **opt-in, additive, and exportable** — never
   the place your work is held. Ownership is architecture, not policy.
4. **A practice, not a project.** Free proves the instrument on a kit or two; Pro is for the maker
   whose *practice* is systems — every client, every product, every experiment derived the same way.
   Upgrade copy sells the practice, not the feature list.

**Who the reader becomes.** Copy is aimed at a transformation, not a transaction: the hand-nudger of
hex becomes the deriver of systems; the defender of taste becomes the owner of a system that argues
for itself; the freelancer becomes a practice. "Stop hand-nudging hex" works because it names the
before-state — the best copy lets the reader recognize themselves on the wrong side of the thesis.

## 4 · Postures — how the voice sets per surface

One voice; the register sets per artifact type. If a piece has no row, extend this table in the same
change — don't improvise a register.

| Surface | Posture | Sounds like |
|---|---|---|
| **Landing / store** | Confident demonstration — thesis first, then proof | "Pick a key color; ship a whole system." |
| **Docs / spec / README** | Measured and complete — the manual | "Each palette derives the full role set — resolved for Light and Dark in one pass." |
| **Release notes / changelog** | Plain deltas, maker-voiced; what changed, why it matters, one line each — no drum-roll | "Exports now carry a px/rem/em setting. Figma still gets px." |
| **Social / short-form** | One claim per post, compressed to its verbs, always with a real render | "Stop hand-nudging hex." |
| **In-app microcopy** | Calm and actionable — states, limits, next steps; sells only at a ceiling (below) | "You're at the Free limit of 2 brand kits." |
| **Palette stories (Color Categories)** | Curatorial — governed by the palette rubric at `.claude/docs/spec/colors/color-model-function.md`, not by §5's adjective rules; observed detail over adjective stacking | "Sampled at the hour the plaster goes amber." |
| **Machine-facing (MCP tool descriptions, agent-read strings)** | Exact contracts — what the tool returns, when to call it; no persona performance for an audience of parsers | "Returns the 59-role semantic layer, light + dark, resolved hex + oklch." |
| **Email / support** | Warm, brief, human — a maker answering mail, signed as one | "Anything at all: support@…" |
| **Limits, errors & when-we're-wrong** | Plain and generous — no blame, no dark patterns; refunds granted gracefully, outages owned in first person | "Your kits are safe. You're simply back to the Free limits." |
| **Policies / legal-lite** | Short declarative sentences a human can read once; rights stated as plainly as restrictions | "Tokens and design systems you create are entirely yours." |

**The upsell rule:** sell **at the ceiling the user just touched, never during an unblocked flow** —
the prompt states the limit hit, the price, and the exit, all three. Cancellation and downgrade copy
is written to purchase-copy standard. Time-boxed launch pricing is honest when the deadline is real;
countdown theatre is not.

## 5 · Language — the material rules

- **Verbs of making** (the name, cashed out): derive, compose, map, bind, export, ship, serve.
  Never: empower, unleash, supercharge, revolutionize, transform-as-hype, leverage-as-verb.
- **Banned lexicon** (mechanically checked; the list lives in `voice-check.mjs` — extend it there):
  *AI-powered, game-changing, stunning, gorgeous, effortless, seamless, magic, blazingly fast,
  next-generation, cutting-edge, intuitive, powerful, delightful, robust, world-class, 10x.*
  **Admissibility test** for any adjective: it must map to a fact-sheet row or a verifiable
  definition — *perceptual*, *zero-dependency*, *offline*, *measured* pass; mood words don't.
  **Shown-artifact exemption:** an aesthetic word may point at an artifact rendered on the same
  surface (a palette the reader is looking at may be called what it visibly is); it may not float free.
- **Numbers are load-bearing.** Every count, price, and spec comes from the pinned
  [fact sheet](../fact-sheet.md) verbatim. A feature that isn't live is never written in the present
  tense — "when live" phrasing or omission only. Both are §6 auto-fails.
- **The pivot** — the signature construction is *claim, then sharpened contrast*: em-dash form
  ("Tokens, derived — not guessed.") or comma form ("measured, not hand-nudged"). Budget: **one per
  section** in long-form; **one per piece** in short-form (a tweet is a piece). Ordinary em-dashes —
  parenthetical, appositive — are punctuation, not pivots, and aren't budgeted.
- **Copy-desk rulings** (the canonical forms; deviation is a defect):
  - The thesis line: **"Tokens, derived — not guessed."** — this casing, this punctuation.
  - The action line: **"Pick a key color; ship a whole system."** — semicolon, not period.
  - Prices: **$39/year** · **$149/year** · **$19/seat/year** in prose; **$39/yr** only where
    characters are rationed (social). Never "just/only $…", never strike-through theatre.
  - Counts in digits: **2 brand kits**, **59 semantic roles**, **5 seats**.
  - **Light and Dark** capitalized as mode names; lowercase as adjectives ("a dark scheme").
  - "Brand kit" is the document; **Brand-Kit MCP** (hyphenated, capitalized) is the product.
  - The interpunct **·** separates list items in compact rows; **→** is the CTA arrow; **▶** marks
    the live-demo link. Sentence case for headings and buttons. American English.
  - "Simply/just" minimizing the price or the reader's struggle: banned. Calming a real anxiety
    ("your kits are simply back to Free limits"): canonical.
- **Protected eccentricities** (query, never "correct"): the interpunct triad in spec blocks, the
  pivot construction itself, the single post-purchase **"You're Pro. 🎉"** (the one emoji and the one
  celebration in the entire surface — the bench smiles exactly once), the → CTA arrow, short-form
  asyndeton, and the parenthetical honesty aside ("(It's the very same `.html` you get from a local
  build…)").
- **Show, don't assert:** marketing surfaces render what the tool renders — no mockups. A claim that
  can't be demonstrated in-product isn't made.

## 6 · The gate — how a piece passes

Two layers. Layer 1 is mechanical and merciless; layer 2 is judged and quote-bound.

**Layer 1 — the pre-check** (`voice-check.mjs`; any hit fails the piece outright):
pinned-fact drift · a non-live feature in the present tense · banned lexicon · hype pricing ·
exclamation/emoji outside the protected one · internal id in copy (outside code/URLs).

**Layer 2 — judged axes**, scored 1–5. **A fail cites a quoted sentence — no quote, no fail.**
Shippable = every axis ≥ 4.

| Axis | 5 | 4 (the ship floor) | 3 (the near-miss) | 1 |
|---|---|---|---|---|
| **One idea** | The piece argues exactly one §3 conviction and a peer could repeat it back in a sentence | One idea leads; a second supports without competing | Two ideas share the lead — the reader can't say what the piece claims | No idea — features listed, nothing argued |
| **Voice fidelity** | Bench-made: demonstrates, verbs of making, peer register throughout | A booth word or two survives, but the piece demonstrates rather than asserts | Persona performed ("crafted with care") instead of enacted | Interchangeable with any SaaS |
| **Claim discipline** | Every claim demonstrable in-product; the thesis stated in its truthful (re-derivation) form | One claim slightly ahead of what's shown, but shown-adjacent and true | A claim the product can't currently demonstrate, hedged | Invented capability |
| **Density** | Nothing removable without losing information (long-form can score 5 — a 900-word description earns its words) | A removable phrase or two; no removable paragraph | Padding sentences that restate the previous one | Filler dominates |
| **Surface fit** | Register matches the §4 row exactly; near-misses corrected | Right row, one register slip | The wrong row's register carries whole passages | Store voice in an error message |
| **Reader respect** | Limits, prices, exits all stated; the reader leaves knowing more | Everything stated, one item requires a click to find | An exit or limit is present but buried | Manufactured urgency, hidden terms, blame |

## 7 · Provenance

Distilled from shipped evidence: the locked "precise/craft voice" decision and paste-ready copy in
[`../store-copy.md`](../store-copy.md); the README's real-output hero discipline; the product's own
architecture (OKLCH-native engine, zero-dependency bundle, offline Figma plugin, local-first storage)
as the stance's proof. **Reviewed by the brand-forge critic council 2026-07-02 — verdict CONDITIONAL,
all three blocking conditions folded into this revision; the record:
[`reviews/2026-07-02-brand-council.md`](reviews/2026-07-02-brand-council.md).** This is a living
record — when the product changes what a claim can prove, this platform and the fact sheet change in
the same breath.
