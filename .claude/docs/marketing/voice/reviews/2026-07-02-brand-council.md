<!-- voice-check: rulebook — a review record; quotes findings verbatim -->
# Brand council review — voice platform · 2026-07-02

**Artifact:** `voice-platform.md` (first draft) + `fact-sheet.md` · **Panel:** ten critics (strategy:
Luke S. lead, John H., Mark P., Nick L., Brian C., Rory S. · voice: David A., George L., Tim D.,
Mary N.), cold reads in isolated contexts. **Verdict: CONDITIONAL** — "the skeleton is earned; the
halo is invented." All three blocking conditions were folded into the platform revision this record
ships with.

## The blockers (all fixed in the same PR)

- **B-1 · Hosted MCP sold as live.** The store copy marketed the hosted Brand-Kit MCP as a live Pro
  endpoint in five places (incl. an onboarding instruction a paying customer could not execute),
  while the fact sheet forbade exactly that. *Fixed:* "when it ships / hosted when live" phrasing or
  omission at every site; onboarding now points at the real download. **Open action (user):** verify
  the deployed Lemon Squeezy store doesn't still carry the old copy — deployed surfaces don't grep
  (fact-sheet rule 4).
- **B-2 · Manufactured provenance.** §7 claimed council review before any review happened. *Fixed:*
  the claim now carries the review date and points at this record.
- **B-3 · The rubric couldn't produce the same score twice.** Only 1/5 anchored; the ship gate sat on
  the undefined 4/3 boundary; axes overlapped (one banned word tanked three axes); the hosted-MCP
  defect scored a passing 4 as written. *Fixed:* §6 rebuilt as a two-layer gate — mechanical
  auto-fails (fact drift, non-live-feature-in-present-tense, banned lexicon, hype pricing) + six
  judged axes with 5/4/3/1 anchors, quote-required fails, and George L.'s "One idea" axis.
- **B-4 · The em-dash rule was undecidable** (28 uses in the platform itself; the exemplar contained
  no em-dash). *Fixed:* the budget now targets the pivot *construction* (claim + contrastive
  negation, em-dash or comma form), one per section long-form / one per piece short-form; ordinary
  em-dashes are punctuation.
- **B-5 · Fact-pinning had holes where the last defect lived.** The sweep covered only the corpus
  (the 53-defect lived outside it); the sheet itself had drifted ("Heading 1–3" vs the real Editorial
  · Context · Eyebrow). *Fixed:* sweep widened to README/index.html/app strings; rule 4 added (the
  deployed-surfaces re-paste checklist); heading + treatment names corrected to the engine's.

## Folded quality revisions

§3 restructured around the one zag — **"one decision, exported everywhere — change it once and every
export re-derives together"** (David A.'s falsification-proof wording; the panel's consensus
crown-jewel) — with perceptual modeling demoted to substrate, vendor names out of conviction
sentences, ownership rescoped for a hosted future ("opt-in, additive, exportable"), and Brian C.'s
transformation lens ("Who the reader becomes" + "a practice, not a project"). §2: "master" cut,
"not a software vendor" corrected, compass-not-costume rule, Rory S.'s smallness rules (maker-signed
mail, the workshop-insurance line). §1: the *ultima* defense + "never an adjective"; the name wired
to the verbs rule; etymology internal-only. §4 grew four rows (release notes, palette stories →
palette-rubric jurisdiction, machine-facing, policies, when-we're-wrong) + the upsell-at-the-ceiling
rule. §5: copy-desk rulings (canonical thesis casing, price formats, digits, Light/Dark, Brand-Kit
MCP), the adjective admissibility test, the shown-artifact exemption, the protected-eccentricities
clause (the 🎉 kept by 2-to-1 panel ruling, codified as the only emoji).

## Deferred (tracked, not blocking)

- **Design sub-council** on the mark-vs-name tension (a letterform-on-a-square is a noun) and the
  shipped icon kit — whether the mark should derive from the tool's own ramp + geometry law.
- **Machine-facing audit:** the MCP server's tool descriptions have never been voice-reviewed.
- **`facts.json` + a test-suite gate** asserting the fact sheet against the engine (today the pin is
  the voice-check script's regex table).
- Three-examples-per-posture-row (incl. a corrected near-miss) as the §4 exemplar corpus grows.
