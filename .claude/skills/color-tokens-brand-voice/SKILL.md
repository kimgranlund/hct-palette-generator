---
name: color-tokens-brand-voice
description: >
  Use BEFORE writing any customer-facing words for Ultimate Tokens / NONOUN — store or landing copy,
  README marketing, social posts, launch announcements, product descriptions, in-app microcopy,
  upgrade/limit/error strings, lifecycle emails, release notes — or when judging them ("write the
  launch post", "update the store page", "add an upsell string", "does this sound like us?"). The
  operational voice instrument: the toolmaker persona and the per-surface posture table, the
  enforceable language rules, fact-pinning against the pinned fact sheet, the mechanical voice-check
  script, and the two-layer ship gate. The marketing-manager agent loads this first for ALL
  brand/marketing writing.
---

# Writing in the NONOUN voice

Two documents are canonical — read both before drafting (each is one page):

- **`.claude/docs/marketing/voice/voice-platform.md`** — who is speaking (persona, identity), what it
  argues from (the five stances), how it sets per surface (the six postures, §4), the language rules
  (§5), and the **scoring rubric (§6)**. This skill applies the platform; it never restates it — if
  they ever disagree, the platform wins and this skill is stale (fix it in the same change).
- **`.claude/docs/marketing/fact-sheet.md`** — every count, price, name, and claim a copy may use.
  Copy CITES the sheet; it never remembers a number. The product once moved 53 → 59 semantic roles
  while the store copy kept saying 53 — that class of defect is what the sheet exists to kill.

## Procedure

1. **Name the surface first.** Find its row in the platform's §4 posture table (landing/store · docs ·
   social · in-app microcopy · email · limits/errors). If the piece has no row, that's a platform gap —
   extend §4 (same change), don't improvise a register.
2. **Pick the stance.** Every piece argues at most one or two of the five §3 convictions. A piece that
   argues none is filler; a piece that argues four is a brochure.
3. **Draft with the fact sheet open.** Pull each number/price/name from it verbatim. Features behind a
   dark flag (hosted MCP; anything pre-enforcement) are never marketed as available.
4. **Layer 1 — the mechanical gate:** `node .claude/skills/color-tokens-brand-voice/scripts/
   voice-check.mjs <file…>` — pinned-fact drift, a non-live feature in the present tense (the hosted
   MCP is the standing case), banned lexicon, hype pricing, exclamation/emoji discipline. **Any error
   fails the piece outright**; warnings are review prompts. Rulebook docs (the platform, the fact
   sheet) self-exempt via a `voice-check: rulebook` pragma in their first lines — copy never carries it.
5. **Layer 2 — score §6's judged axes** (One idea · Voice fidelity · Claim discipline · Density ·
   Surface fit · Reader respect; anchors at 5/4/3/1). **A fail must cite a quoted sentence — no quote,
   no fail.** Shippable = every axis ≥ 4. Revise and re-run 4–5 until it clears.

## The rules that actually get broken

- **The upgrade-prompt triad:** every upsell states the limit hit, the price, and the exit — all
  three, nothing withheld — and sells only **at a ceiling the user just touched**, never mid-flow.
  Cancellation/downgrade copy is written to the same standard as purchase copy.
- **One pivot per section** (long-form) / **one per piece** (short-form). The pivot is the
  *construction* — claim + contrastive negation ("Tokens, derived — not guessed."; "measured, not
  hand-nudged") — not the em-dash glyph; parenthetical dashes are ordinary punctuation.
- **The only exclamation in the product's entire surface** is the post-purchase "You're Pro. 🎉" —
  a protected eccentricity (§5): query it, never "correct" it.
- **Prices plainly:** "$39/year, per user" — never "just", "only", or strike-through theatre.
- **Peer jargon yes, growth-speak no:** OKLCH, DTCG, semantic roles need no apology; "leverage",
  "empower", "unlock value" never appear (full banned list lives in the script — extend it there,
  not in prose).
- **Demonstrate, don't assert:** marketing surfaces show the tool's real render (the README hero rule —
  "no mockup"); a claim that can't be shown in-product isn't made.

## Keeping it true

When the product changes anything the corpus states — a count, a price, a format, a tier boundary —
update `fact-sheet.md` **in the same change**, then sweep: `grep -rn "<old value>"
.claude/docs/marketing/` and fix every hit. A drifted marketing fact is a defect of the same severity
as a failing test (`CLAUDE.md` · "Context is memory").
