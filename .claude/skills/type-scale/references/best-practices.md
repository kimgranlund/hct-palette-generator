## Best practices — changing the typography engine

The non-obvious do/don'ts (each a real trap in this engine), then a worked walkthrough from the
treatment/specimen history.

### Derive, never hand-author

- **No magic numbers in a treatment.** The whole point of the engine (mirroring color) is that every step's
  size/line/tracking is DERIVED. If a step looks wrong, change the voice's `base`/`ratio`/`leading`/
  `trackingEm` knob and let `buildCategory` recompute — never paste a resolved px size into a treatment row.
  The header says it: "no hand-authored magic numbers" (`type.mjs:5`).
- **Resize with `bodyBase`, not individual bases.** `factor = bodyBase / Body.base` scales every voice
  together while preserving ratios. Bumping one voice's `base` to "make it bigger" desyncs the system. The
  `bodyBase` test (`test:62–65`) asserts a larger bodyBase scales Display up too — that lockstep is the
  feature.
- **Keep tracking optical (an em coefficient).** `trackingEm` × size — so the tracking grows with the step.
  Don't switch to a flat px value; the `Display.XL < Display.XS` ("tracking scales with size") gate
  (`test:55`) enforces it. Display stays negative, UI / the caps Headings stay positive.
- **Stay inside the leading bands** (display 1.05–1.2, heading 1.05–1.3, prose 1.45–1.65, UI 1.25–1.5, mono
  ~1.5). They come from `docs/spec/typography/README.md` + ui-compose-typography; a Body leading of 1.2
  would render cramped prose and silently leave the prose band.

### The font-family QUOTING guard (the Safari trap)

- **Always emit family names QUOTED** (`--font-{role}: '{family}'`, `type.mjs:122`). A name with a digit —
  `Source Serif 4`, `Inter Tight` — is invalid *unquoted* in a strict CSS parser, and **Safari drops the
  entire declaration** → the specimen renders in the fallback. Chrome is forgiving, so the smoke (Chrome-
  only) stays green while Safari is broken (see the smoke-is-Chrome-only-Safari-blind-spot memory). The
  verifier pins `typeTokensCSS(luxury)` (which uses `Source Serif 4`) contains `--font-display: 'Source
  Serif 4'` (`test:78–79`). If you refactor the emitter, keep the quotes. This is the type analog of color's
  "anchors are truth": a quiet break that looks fine until you test the second browser.

### Case is a per-treatment decision

- **Don't blanket-force Display to UPPERCASE.** Display is title/sentence case in four of five treatments;
  ONLY Brutalist/`statement` opts in (via `dTransform:"uppercase"`, `type.mjs:82`). The test asserts
  *exactly one* treatment sets an uppercase Display (`test:26`) — adding a second (or removing Brutalist's)
  turns the gate red. The two standing caps voices are Heading Context and Heading Eyebrow (hardcoded
  `"uppercase"` in `make7`, `type.mjs:51–52`), and they track POSITIVE; Display caps (Brutalist) track
  NEGATIVE. Don't swap those tracking signs.

### Treatments + voices come as complete sets

- **A new treatment must pass the full `fonts` palette** (`display/heading/body/ui/mono` — five roles) and
  call `make7` so all seven voices resolve — the test asserts every treatment has the seven groups + `fonts`
  (`test:11`), and `roleOf` needs every role's family present (note `technical` + `editorial` point `fonts.ui`
  at JetBrains Mono — `ui` and `mono` can share a family). Supply `note` too; the UI specimen reads it.
- **A new voice group means a new `cat(...)` line in `make7`** — its role flows from `cat`'s first arg into
  `roleOf` automatically, and the emitters map over `categories`, so the CSS/DTCG token emits for free. But
  the `GROUPS7` list in `test/engine/type.mjs:9` and `docs/spec/typography/README.md`'s "seven groups" table
  both hardcode the seven — update them, and expect the "every treatment has the 7 groups" assert to need
  the new name. (Eight groups is a taxonomy change, not just code.)

### The fonts are a manual, two-ended chain

- **`src/ui/type-fonts.js` is generated — never hand-edit it.** Regenerate with `npm run gen:type-fonts`.
- **It is NOT in `build` or `test`** (`package.json:16,18` — neither calls `gen:type-fonts`). Forgetting to
  run it after a font change leaves the old embedded set; the new face renders in the fallback (and the smoke
  won't catch it — fonts aren't asserted). After running it, COMMIT the regenerated `type-fonts.js`.
- **Wire a new font at BOTH ends:** add it to the treatment's `fonts` AND to `scripts/gen-type-fonts.mjs#
  FAMILIES` (name + the variable `wght` axis, e.g. `wght@400..900`). Only-`fonts` → no embedded woff2 →
  fallback render. Only-`FAMILIES` → embedded but unused. Then regenerate + commit.

### Pure + deterministic

- `type.mjs` is pure, no DOM, no RNG, no clock. `round()` (`type.mjs:14`) is the only rounding helper; keep
  `letterSpacing` at 2 dp and sizes integer. Same config → identical tokens (the emitters are deterministic
  by construction).

## Worked walkthrough — adding a treatment / tuning a voice (condensed)

The pattern behind the 5-treatment set + the per-voice character knobs (and the quoting fix in its lineage):

1. **Decided the voice, not the font.** A treatment is a *voice* — case + weight contrast + tracking +
   leading + scale. e.g. `luxury` = restraint: a high-contrast serif set LIGHT (`dWeight 400`) and large
   (`dBase 76`), airy prose (`bLead 1.65`), wide-tracked caps labels (`hcTrack 0.18`, `eyeTrack 0.26`). The
   font palette (`Source Serif 4` display/heading, `Inter` body/ui) serves the voice.
2. **Expressed it as `make7` knob overrides**, not hand-authored sizes — every override is a `base`/`ratio`/
   `leading`/`weight`/`trackingEm`/`transform` value; `buildCategory` derives the 41 steps. Kept leadings
   inside the bands and tracking optical.
3. **Made Brutalist the ONLY ALL-CAPS Display** (`dTransform:"uppercase"`), leaving the other four
   title/sentence. The "exactly one uppercase Display" gate (`test:26`) locks this in.
4. **Confirmed the Safari quoting guard.** Because `luxury` + `editorial` use `Source Serif 4` (a digit
   name), the emitter MUST quote it — the `typeTokensCSS(luxury) → '--font-display: 'Source Serif 4''` assert
   (`test:78–79`) is the backstop. (Lineage: the unquoted-digit-name break is exactly the
   smoke-is-Chrome-only memory's Safari class.)
5. **Validated** — `node test/engine/type.mjs` (all green: 5×7, roleOf, caps voices, one-uppercase-Display,
   monotonic, optical tracking, Code 8-step, bodyBase scaling, the quoting guard, DTCG composite — prints
   `type PASS`), then `npm test`. For a font change, also ran `npm run gen:type-fonts`, committed
   `src/ui/type-fonts.js`, and eyeballed the specimen in Safari (the smoke is Chrome-only).