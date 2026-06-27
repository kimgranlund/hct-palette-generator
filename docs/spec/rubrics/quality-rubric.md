# Quality Rubric — HCT Palette Generator Spec

> Two layers. **Layer A** is spec-author's generic 10-dimension rubric (score 0–10 each,
> target 85+, no dimension below 6). **Layer B** is project-specific completeness checks a
> generic rubric won't catch. Use Layer A for the autoresearch scoring loop; use Layer B as
> a hard gate — any Layer B failure blocks delivery regardless of Layer A score.

## Layer A — Generic dimensions (from spec-author)

| # | Dimension | Question | Project-specific watch-out |
|---|-----------|----------|----------------------------|
| 1 | Grounding | Every claim traceable? | engine constants/anchors traceable to `data/`; Figma-import claims to the docs research |
| 2 | Completeness | Every boundary: what/form/authority/failure? | each export format's exact shape; each engine fn's edge branches |
| 3 | Dual readability | Narrative AND reference? | 📐💡⚠️ markers consistent; "How to Read" present |
| 4 | Structural clarity | ToC navigable, spine ordered? | knowledge docs each have a ToC if long |
| 5 | Vocabulary precision | Terms match glossary? | "tone"=L\*, "chroma %"=of peak, "prime"=550/450 used consistently |
| 6 | Decision explicitness | ODs have ID/options/tradeoffs? | OD-001..005 tracked; ADRs separate from ODs |
| 7 | Anti-pattern awareness | Failure modes guarded? | the 6 anti-patterns reference ADRs |
| 8 | Differentiation | "Why this" grounded? | HCT-vs-OKLCH argument; resolved-vs-aliased grounded in Figma behavior |
| 9 | Actionability | Implementer can build? | TS interfaces derivable; formulas literal; role table machine-readable |
| 10 | Traceability | Requirement→principle→source? | each fenced choice → ADR → rationale/evidence |

Scoring card and exit conditions: identical to spec-author's `quality-rubric.md`
(score → fix weakest → re-score; exit at ≥85 with no dimension <6).

## Layer B — Project completeness gate (pass/fail)

Mark each. **Any FAIL blocks delivery.**

### B1 — Engine
- [ ] Both forward (`cam16FromXyz`) and inverse (`xyzFromCam16` / `hctToRgb`) are specified.
- [ ] `hctToRgb`'s three early branches (tone≤0, tone≥100, chroma<0.4) are all documented.
- [ ] Gamut epsilon (`-0.0001 .. 100.0001`) and iteration counts (18) are stated, not vague.
- [ ] Verification anchors exist with a numeric tolerance, and the tolerance is met.
- [ ] Viewing conditions are stated as fixed and the derivation inputs are named.

### B2 — Tonal scale
- [ ] All five curves given as formulas, with the `tension` lerp ranges.
- [ ] `toneAt` gamma-skew (`3^(skew/100)`) and cosine lift (centered 500) are explicit.
- [ ] Chroma target (% of `peakC`) and damping formula (`^1.5`) are explicit.
- [ ] Display vs export stop sets are both enumerated.

### B3 — Semantic system
- [ ] The full 53-role table is present or referenced as machine-readable data.
- [ ] Two-layer rule stated: raw flat, semantic carries the flip.
- [ ] On-color rule (`050`/`200`, both modes) stated WITH the contrast caveat (OD-001).
- [ ] Scrim rule (7 roles on the 500 ramp, `500-{step}`) stated.
- [ ] Surface Dim/Bright (non-mirror) vs Low/High (mirror) distinction is explicit.

### B4 — Exports
- [ ] All five formats have an exact output shape (a mini example each).
- [ ] Resolved-vs-aliased decision stated with the Figma-import rationale (ADR-002).
- [ ] Padding rule (`pad3`/`refKey`) stated.
- [ ] UI3 schema flagged as non-native (ADR-007).
- [ ] Zip is documented as dependency-free/offline.

### B5 — Plugin
- [ ] Cascade-by-reference mechanism (`createVariableAlias`) explained.
- [ ] Parity-with-generator requirement stated.
- [ ] Run steps and the two failure modes documented.

### B6 — Cross-cutting
- [ ] Determinism + three-implementation parity stated as an invariant.
- [ ] Every fenced choice has an ADR; ADRs are distinct from open decisions.
- [ ] The "decisions an agent will try to fix" map is present (regeneration safety).

## Delivery gate
Deliver only when **Layer A total ≥ 85, no dimension < 6, AND every Layer B item passes.**
