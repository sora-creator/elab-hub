# Interpretation Feature Policy

## Separation from structural Level

Interpretation Features describe meaning-level obstacles that remain even after a student identifies the sentence skeleton. They do not create a second numeric difficulty and do not change S1–S5.

Keep the feature system optional, evidence-grounded, and non-blocking for Gold.

## Proposed subtype: `VERB_PATTERN`

Add `VERB_PATTERN` to the taxonomy in a future implementation phase.

Example:

- evidence: `misleading a consumer into thinking`
- normalized pattern: `mislead A into V-ing`
- instructional purpose: alert the teacher that the construction, not the clause count, is the primary interpretation obstacle.

`VERB_PATTERN` is preferable to the broader `CONSTRUCTION_PATTERN` for V1 because it is specific enough to support exercise assignment and evidence highlighting. Broader constructions can be added later only when repeated examples require them.

## Contract

- Every feature has explicit token evidence.
- AUTO may propose a feature, but Teacher may retain or remove it.
- Features do not alter subject, verb span, clause structure, Level, or Gold.
- Students receive at most one numeric Level; features appear as descriptive learning tags only when useful.

## Decision

- `INTERPRETATION FEATURE = KEEP_SEPARATE`
- `VERB_PATTERN = RECOMMENDED`
