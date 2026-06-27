## Foundations — the model a role change leans on

These are the load-bearing ideas. If adding a role feels like it needs a new mechanism, you are probably
fighting one of these. The full taxonomy + rationale is owned by
`docs/spec/references/knowledge-03-semantic-system.md` and the answer key by `docs/spec/data/role-table.json`
— this file is only the mental model the *procedure* assumes.

### 1. Two layers: raw primitives (mode-independent) → semantic roles (the light/dark flip)

Raw tonal stops (`050`…`950`, the extra stops, and scrim ramps) are computed per palette and carry no notion
of light vs dark. The **flip lives only in the semantic layer**: each role in `src/engine/semantic.js`
declares a `light` ref AND a `dark` ref. So a role is "this token resolves to *this* stop in light mode and
*that* stop in dark mode." Adding a role is adding one `{ key, suffix, light, dark }` row — never a new
primitive.

### 2. A ref is a stop name — solid or scrim

- **Solid**: `'550'` — a tonal stop. `refKey('550') → '550'`; `refKey('50') → '050'` (zero-padded to 3).
- **Scrim**: `'500-200'` — the **500** color at alpha% = step/10 (so `500-200` = 500 @ 20%). It tracks the
  500 stop as hue/chroma/skew/lift change, i.e. it is a translucency sub-variant of the palette.
  `refKey('500-200') → '500-200'` (base padded, `-step` suffix kept verbatim).

`refKey` (in `semantic.js`, re-imported by `bind-plan.mjs`, and replicated in the Figma `code.js`) is the
single normaliser — it is why a ref can't drift between "50" and "050". Pick refs from a neighbour in the
same group.

**Ref validity, exactly (the `refs-canonical` gate, `test/engine/semantic.mjs`):** every role's `light`/`dark`
is run through `validPrim`. A solid ref must be in `EXPORT_STOPS`. A **scrim** ref `500-{step}` must have
base ∈ `SCRIM_BASES` (just `500`) and step ∈ `EXPORT_STOPS` (line ~23). Separately, the scrim-KEYED roles
(keys matching `/^scrim/`) get a TIGHTER check (line ~32): their step must be in `SCRIM_STEPS`. Because
`SCRIM_STEPS ⊂ EXPORT_STOPS`, **"pick a scrim step that is in `SCRIM_STEPS`" is the safe author rule** for
any role — it satisfies both checks. (This is why non-scrim roles can legally ride a scrim ref like
`containerDisabled`'s `500-100` — `100` is in `EXPORT_STOPS`.)

### 3. Name-prefixed vs shared rows

`semanticRoles(n)` substitutes `{n}` (lowercase slug) and `{N}` (Capitalized):

- **Accent** (`${n}`, `${n}Dim`, `${n}Hover`, …) and **on-accent** (`on${N}`, `on${N}Active`, …) keys are
  name-prefixed — they differ per palette (`primaryHover`, `successHover`).
- **Shared** roles — onSurface\*, placeholder, outline\*, container\*, inverse\*, surface\*, background, and
  all scrims — use a literal key, IDENTICAL for every palette. They are the same token in `neutral` and
  `warning`.

This is why the answer key (`role-table.json#roleTable`) only stores the **primary** palette: the shared
rows are name-independent, and the name-prefixed ones are mechanically derived by substitution. The
`success`-substitution check in `test/engine/semantic.mjs` proves the substitution still works.

### 4. The resolution layer sits ON TOP of the canonical table

`semanticRoles` is the canonical, *unchanging* table (the equality gate depends on that). Three exported
functions take its output and re-point specific roles at resolution time, WITHOUT mutating the canonical
table:

- `applyOnColorContrast(roles, n, lumOf, onColorMode)` — when `onColorMode === "contrast"`, flips the
  accent on-colors (`-on-${n}`, `-on-${n}-variant`, `-on-${n}-hover`, `-on-${n}-active`) to whichever
  extreme end (light vs dark) maximizes WCAG contrast against the SPECIFIC fill they sit on (prime/variant
  ride 550/450; hover rides 650/350; active rides 750/250). `-on-${n}-disabled` is deliberately ABSENT from
  the `M` map — a disabled label opts out of the contrast guarantee.
- `applyAccentRef(roles, accentRef)` — `"single"` maps only the prime accent (empty suffix) to 500/500.
- `applyRoleOverrides(roles, overrides)` — per-doc editor customization; absent fields keep canonical.

`src/engine/exports.js` (`derivePalette`) calls these in order — `applyOnColorContrast(applyAccentRef(...))`
then `applyRoleOverrides` — before resolving each ref to a color. The consequence for a role author: **if you
add an `on{N}…` role, decide whether it belongs in the contrast map** (`M` in `applyOnColorContrast`). A
normal label-on-fill → yes (with its own state fill); an inert/disabled label → leave it out.

### 5. Scrims are emitted LAST, by a parallel-array loop

The 7 scrim strengths come from `SCRIM_STRENGTH_STEPS` (the alpha steps `50,100,200,300,400,500,600`) zipped
with `SCRIM_SUFFIXES` and `SCRIM_KEYS` — three arrays that MUST stay the same length and order
(weakest→strongest). They are pushed in a loop after every other role so the emitted token order groups
regular colors → containers → surfaces → scrims (cleaner Figma variable / CSS list). Adding/removing a scrim
means editing all three arrays AND the scrim-count asserts (`scrims.length !== 7` in
`test/engine/semantic.mjs:30`; the `(z)` `=== 7` group assert in `headless-boot.mjs`), not just the role
count.

### 6. One source, many mirrors — why parity is the whole game

The role set is authored once in `semantic.js`, but its shape is independently encoded in:

- `docs/spec/data/role-table.json` — the hand-maintained **answer key** (deep-equality gate). No generator.
- `figma/binder/figma-semantic-binder/code.js#roleTable(n)` — a **hardcoded copy** (the Figma sandbox can't
  `import` the `.mjs`). `bind-plan.mjs` is the pure importable planner that the verifier imports; `code.js`
  replicates the same rows verbatim.
- A scatter of **count literals** in tests + one UI label (`app.js:4046`) + spec prose.

Most emitters/exports/Mapping/MCP **DERIVE** from each palette's resolved `roles`, so they need no edit — a
new role flows through automatically. The lone exception is the **ShadCN** export (`exportShadcn`,
exports.js ~504): it maps a FIXED `SHADCN_ORDER` over a curated suffix-lookup `MAP`, so a new role neither
breaks it nor appears in it. The job is keeping the two hand-written encodings (answer key + Figma copy) +
the literals in lockstep. The historical "36 vs 37" incident (the artifact silently lost `surfaceHighest`)
is exactly the failure this discipline prevents.
