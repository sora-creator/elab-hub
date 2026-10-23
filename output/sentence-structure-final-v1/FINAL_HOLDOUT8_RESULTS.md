# Final Holdout8 Results

## Audit basis

- Dataset: `final-holdout8`
- Fingerprint: `ea125d88dffa1c8371780f71d12c382cd10a3856c6bcd6c82444c1f9b0f5bedf`
- Export: `sentence-structure-final-holdout8-20260922-0225.json`
- Exported at: `2026-09-21T17:25:02.010Z`
- Export SHA-256: `B2B1D2B9978202EB251F03A48E1A148AC299F334DD2C568355AE04EFCDE51696`
- Record order: `58378, 60837, 23009, 2590, 24339, 23568, 24238, 26675`
- Status: **8/8 GOLD_READY**

This is an analysis-only comparison of frozen AUTO data and exported Teacher Gold. No teacher answer, parser, rule, classifier, Level, or gate was changed.

## Product metrics

| Product output | Sentence exact | Instance exact | Result |
|---|---:|---:|---|
| Student subject primary | 6/8 (75.0%) | 12/14 (85.7%) | two subject projection errors |
| Student subject acceptable match | 6/8 (75.0%) | 12/14 (85.7%) | no Final8 acceptable span repaired a primary miss |
| Student meaning verb span | 7/8 (87.5%) | 13/14 (92.9%) | one `want + to-V` boundary error |
| S1–S5 Level | 8/8 (100%) | 8/8 (100%) | exact |

Official Gold33 remains a separate reference set:

- subject primary: 79/81 clauses (97.5%);
- verb span: 78/86 predicates (90.7%);
- clause structure: 33/33 sentences under the earlier clause-confirmation workflow;
- Level: 33/33 sentences.

The simple Gold33+Final8 reference totals are subject 91/95 (95.8%), verb 91/100 (91.0%), and Level 41/41. Clause accuracy is not aggregated to 41 because Final8 no longer required teachers to verify internal clause metadata. These totals are not production prevalence estimates because both holdouts intentionally over-sample difficult boundaries.

## Sentence-level findings

| ID | Subject result | Verb result | Level | Key finding |
|---|---|---|---|---|
| `corpus:58378` | 2/2 exact | 2/2 exact | S3 exact | `We all` candidate was proposed but not accepted into Teacher Gold |
| `corpus:60837` | 1/2 exact | 2/2 exact | S3 exact | AUTO omitted `to a situation` from the main subject |
| `corpus:23009` | exact | exact | S2 exact | `decided to stop` included; later purpose `to get` excluded |
| `corpus:2590` | exact | changed | S2 exact | AUTO `wanted to get`; Teacher `wanted` |
| `corpus:24339` | 2/2 exact | 2/2 exact | S3 exact | Teacher excluded both passive `to be addressed` and later `to receive` from host spans |
| `corpus:23568` | 2/3 exact | 3/3 exact | S4 exact | finite units were found, but MAIN/content labels and the content subject association are wrong |
| `corpus:24238` | exact | exact | S2 exact | Teacher retained `consists`, excluding `of` |
| `corpus:26675` | 2/2 exact | 2/2 exact | S3 exact | ordinary PP excluded; embedded relative S/V exact |

## `corpus:2590`

- Clean text: `They wanted to get rich quick and blow their money on fast cars and expensive champagne.`
- Teacher subject: `They`
- Teacher student verb span: `wanted`
- AUTO student verb span: `wanted to get`
- Teacher Level: S2, matching AUTO.
- `(②)` removal did not shift any meaningful token index and did not alter subject, Teacher verb, Level, source provenance, or Gold status.

## `corpus:23568`

Teacher Gold student S/V units are:

1. `Greenwashing / involves`
2. omitted-that content: `a good or service / is`
3. comparative clause: `it / is`

`misleading` and `thinking` are not finite/main student predicates. AUTO retained the three finite verbs, but attached the second clause to AUTO subject `involves` instead of `a good or service`. It also labels the `Greenwashing / involves` unit `NOUN_THAT` and the omitted-that content unit `MAIN`, the reverse of their semantic roles. Thus:

- finite-clause inventory/count: useful;
- clause type/association core: not exact;
- student subject/predicate association: not exact;
- student verb spans: exact;
- instructional difficulty: the construction `mislead A into V-ing`, separate from S/V structural complexity.

The Final8 export contains unchanged AUTO-derived clause metadata, but the simplified Gold workflow did not require teachers to confirm it. Stored AUTO/teacher equality must therefore not be reported as clause accuracy. The earlier Gold33 clause result remains valid for its former confirmation workflow; Final8 supplies one contrary semantic case.

## Candidate classifier

All candidate objects, including conservative fallbacks:

- 22 objects total;
- 16/22 spans equal Teacher Gold;
- 13/14 predicates have at least one candidate equal to Teacher Gold;
- one mismatch was not repaired by any candidate: `corpus:2590`.

Risk-specific candidates are more informative than the inflated all-object total:

| Candidate type | Teacher match |
|---|---:|
| `INCLUDE_TO_INFINITIVE_CANDIDATE` | 1/3 |
| `PASSIVE_NONFINITE_CANDIDATE` | 0/1 |
| `INCLUDE_VING_COMPLEMENT_CANDIDATE` | 0/1 |
| `PREPOSITIONAL_VERB_CANDIDATE` | 0/1 |
| `GENERAL_PP` exclusion | 3/3 |
| `FINITE_ONLY` | 4/4 |
| `REVIEW_REQUIRED` fallback/current span | 8/9 |

Therefore the classifier is useful as a **Teacher Review queue generator**, not as an automatic answer finalizer.

## Shadow gate

Applying the already documented conservative gate without changing it:

- AUTO: 0/8
- TEACHER_REVIEW: 7/8
- ALWAYS_REVIEW: 1/8 (`corpus:23568`)
- FALSE_AUTO_APPROVAL: 0/0

This validates risk routing, not unattended AUTO precision.
