<!-- voice-check: rulebook — cites drifted values as cautionary examples; the checker exempts it -->
# Fact sheet — the pinned numbers

The single source for every count, name, price, and claim in customer-facing copy. **Copy never
invents or "remembers" a number — it cites this sheet, and this sheet cites the code.** A drifted fact
here is a defect; update it in the same change that alters the product (the store copy's 53-role era
is the cautionary tale — the product had moved to 59 while the copy still said 53).

| Fact | Value | Verify at |
|---|---|---|
| Product name | **Ultimate Tokens by NONOUN** (first mention) → Ultimate Tokens | `index.html` `<title>` |
| Maker | **NONOUN** (always uppercase) | brand mark, `public/icons/` |
| Internal id (never customer-facing) | `nonoun-color-tokens` | `package.json` |
| Live app | `https://kimgranlund.github.io/nonoun-color-tokens/` (until `app.nonoun.io`) | README badge |
| Semantic roles per palette | **59**, resolved for Light + Dark | `.claude/docs/spec/data/role-table.json` `rolesPerPalette` |
| Default palettes | **8** | `role-table.json` `defaults` |
| Tonal ramp | **050–950** (19 display stops; 25 in exports with the extra stops) | `src/engine/tonal.js` `STOPS`/`EXPORT_STOPS` |
| Color model | **OKLCH-native** source of truth; HCT/CAM16 + OKHSL modeling; HEX derived for output only | `src/engine/` |
| Distribution modes | even · **perceptual (default)** · peak, plus vibrancy, relative-chroma, chroma floor | `src/engine/tonal.js` |
| Composing systems | **3** — Color · Typography · Geometry (one document, one editor) | `CLAUDE.md` |
| Type voices | **7** — Display · Heading Editorial · Heading Context · Heading Eyebrow · Body · UI · Code | `src/engine/type.mjs` `make7` |
| Type treatments | **5** — Product / Lifestyle · Luxury / Premium · Editorial / Magazine · Technical / Data · Brutalist / Statement | `src/engine/type.mjs` `TYPE_TREATMENTS` |
| Geometry | size ramp **XS–2XL** on one centering law: edge padding = (height − glyph) / 2 | `src/engine/geometry.mjs` |
| Geometry treatments | **5** — Comfortable · Compact / Dense · Spacious / Airy · Touch / Mobile · Pill / Rounded | `src/engine/geometry.mjs` `GEO_TREATMENTS` |
| Color Categories | **7** categories (Architecture · Cuisine · Film · Literature · Music · Nature · Travel), 12 volumes × 4 = **48 palettes each, 336 total**, each sourced + storied | `src/ui/categories/` |
| Export formats | CSS custom properties (HEX or OKLCH) · Tailwind v4 · shadcn/ui · DTCG · JSON · Figma variables · Figma UI3 (Material) · re-importable Config · Download-all `.zip` | `src/engine/exports.js` |
| Export settings | CSS units px / rem / em · color format HEX / OKLCH · per-system Include toggles | Settings → Export |
| Figma plugin | **free, fully offline** (`networkAccess: none`); binds semantic variables with a raw→semantic cascade + breakpoint modes | `figma/plugin/manifest.json` |
| Brand-Kit MCP | zero-dependency stdio server download, pre-filled with your tokens, for Claude Code / Cursor / any MCP agent; **hosted** endpoint is a Pro feature (not yet live — never market it as live) | `mcp/` |
| Dependencies | **zero** runtime dependencies; ships as one self-contained file that runs offline | `package.json`, `dist/nonoun-color-tokens.html` |
| Privacy | local-first: your browser + your Figma file; the **only network call is the license check** | `src/main.ts` |
| Free tier | full generator · **2 brand kits** · core exports · base treatments · offline Figma plugin · MCP download | `src/engine/flags.js` |
| Pro | **$39/year, per user** — unlimited kits · complete export suite · advanced treatments · hosted MCP (when live) · updates + support | store, `flags.js` |
| Studio | **$149/year for 5 seats**, +**$19/seat/year** — Pro for a team, one account | store |
| Refund | **14 days**, full, no questions | store policy |
| Store | Lemon Squeezy (`ultimate-tokens.lemonsqueezy.com`) | store-copy.md |
| Dogfooding | the app chrome runs on the very tokens it generates | README |

**Rules of use**

1. Copy cites these values verbatim — "59 semantic roles", never "almost 60", never a remembered 53.
2. A feature behind a flag that isn't live (hosted MCP; enforcement pre-flip) is **never marketed as
   available**; "when live" phrasing or omission only.
3. When the product changes a value, update this sheet **in the same change**, then sweep **every
   customer-facing surface** — not just this corpus: `grep -rn "<old>" .claude/docs/marketing/
   README.md index.html src/ui/app.js` (the 53-defect lived *outside* the corpus; the sweep that only
   covers the corpus recreates it).
4. **Deployed surfaces don't grep.** Copy already pasted into external dashboards must be re-pasted
   after a fact changes. The checklist: the **Lemon Squeezy store** (product pages, checkout, emails),
   the **Figma Community listing**, any social bios/pinned posts. Track the re-paste in the same PR
   that changes the fact, as an unchecked box the human closes.
