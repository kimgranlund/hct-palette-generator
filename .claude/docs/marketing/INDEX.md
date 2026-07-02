# Marketing corpus — Ultimate Tokens by NONOUN

Everything a customer reads, in one place, under one voice. Authored and maintained by the
**marketing-manager** agent through the **color-tokens-brand-voice** skill — every piece gated by the
voice-check script and the platform rubric before it ships.

## The foundation (read first)

| Doc | Owns |
|---|---|
| [`voice/voice-platform.md`](voice/voice-platform.md) | WHO speaks and HOW — persona, identity, the five stances, six postures, language rules, the scoring rubric (§6) |
| [`fact-sheet.md`](fact-sheet.md) | Every pinned count, price, name, and claim — copy cites it, never remembers |

## The materials

| Doc | Surface |
|---|---|
| [`store-copy.md`](store-copy.md) | Lemon Squeezy store: products, checkout, lifecycle emails, FAQ, policies, in-app tie-ins |
| [`product/boilerplate.md`](product/boilerplate.md) | The description ladder — one-liner → long — for directories, cards, press |
| [`product/figma-plugin.md`](product/figma-plugin.md) | The Figma Community listing |
| [`product/brand-kit-mcp.md`](product/brand-kit-mcp.md) | The MCP story — download copy, directory listing, agent pitch, setup block |
| [`launch/launch-kit.md`](launch/launch-kit.md) | Announcements, social variants, the demonstration thread |
| [`web/landing.md`](web/landing.md) | Landing-page copy blocks for `app.nonoun.io` |

## Working agreements

- **Edit through the loop.** Surface → posture → stance → fact-pinned draft →
  `node .claude/skills/color-tokens-brand-voice/scripts/voice-check.mjs <file>` → §6 rubric ≥ 4 on
  every axis. A pinned-fact error fails the piece outright.
- **Drift is a defect.** A product change that alters a stated fact updates `fact-sheet.md` in the
  same change, then sweeps this corpus (`grep -rn "<old>" .claude/docs/marketing/`) — plus the README
  marketing prose and `index.html` meta if they carry it.
- **This corpus is public** (the repo is public). Strategy, pricing experiments, and anything
  pre-decision live in `.claude/docs/other/` (private, uncommitted) until decided.
