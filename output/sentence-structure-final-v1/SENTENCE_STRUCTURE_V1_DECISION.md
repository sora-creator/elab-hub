# Sentence Structure V1 Freeze Decision

## Product scope

Freeze the student-facing V1 scope to:

1. find student subject and meaning verb span;
2. sentence chunking / 끊어읽기;
3. one structural Level, S1–S5.

Clause type, parent/depth, grammar head, predicate internals, be+p.p., candidate classification, and Interpretation Features remain supporting infrastructure rather than mandatory student-facing concepts.

## Freeze matrix

| Area | Decision | Meaning |
|---|---|---|
| Student subject | FINAL | policy is stable; risky projections remain routed |
| Student verb span | PARTIAL | core chains stable; meaning boundaries are construction-sensitive |
| Clause engine core | NOT_FINAL | Gold33 was stable, but Final8 exposes a MAIN/content type-association error |
| Student S/V projection | PARTIAL | two Final8 subject projections and one verb span differed |
| S1–S5 | FINAL | 41/41 reference exact |
| Acceptable subject candidates | READY | suggestion only; explicit teacher acceptance required |
| Nonfinite | CONSTRUCTION_BASED | validated allowlist plus review fallback |
| Phrasal particle | FINAL | validated contiguous particle dependencies included |
| Prepositional verb | REVIEW_REQUIRED | lexical/sense evidence is not deterministic enough |
| Interpretation Feature | KEEP_SEPARATE | descriptive, no second numeric difficulty |
| AUTO approval | SHADOW_ONLY | queueing ready; unattended publication not ready |

## Clause engine nuance

Final8 preserved all AUTO-derived clause metadata, but that metadata was not a required Teacher Gold confirmation. It cannot be treated as 14/14 verified. In `corpus:23568`, the engine found three finite units but labels the main `Greenwashing / involves` unit `NOUN_THAT`, labels the omitted-that content unit `MAIN`, and initially projects the wrong content subject. Therefore `CLAUSE ENGINE CORE` is not frozen as semantically final, while `STUDENT S/V PROJECTION` remains partial and protected by review routing.

## Gold decision

No more Gold is required to build Sentence Structure V1. Do not start a random 50-sentence review. A later AUTO-publication decision may use five fresh AUTO-likely cases, but that is a deployment gate rather than V1 product validation.

## Next development

Move the primary development effort to **Sentence Chunking / 끊어읽기**. Continue subject/verb refinements only when chunking work or shadow monitoring exposes a repeated deterministic failure; do not continue open-ended micro-tuning.

## Separate backlog

Source-marker cleaning remains outside this decision: SAFE 10, REVIEW_REQUIRED 22, total 32 candidates.

## Final decision

`SENTENCE STRUCTURE V1 = READY_TO_BUILD`
