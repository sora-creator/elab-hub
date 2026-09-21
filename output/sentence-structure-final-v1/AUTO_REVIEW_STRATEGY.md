# AUTO / Teacher Review Strategy

## Current decision

The classifier and gate are safe to run in shadow mode and to build review queues. They are not yet authorized to publish unattended AUTO Gold.

## Routes

### AUTO

Only when source provenance is complete and subject, verb, clause, token alignment, and Level have no unresolved risk. Initially sample-audit 10–20% even after AUTO publication is authorized.

### TEACHER_REVIEW

Use for post-head subject complements, acceptable-subject candidates, nonfinite scope, prepositional verbs, be+p.p. uncertainty, and otherwise stable complex structures.

### ALWAYS_REVIEW

Use for parser disagreement, discontinuity, inversion/ellipsis/shared structure, unresolved source provenance, deep structures combining several risk families, and validation failures.

## Final8 shadow result

- AUTO: 0/8
- TEACHER_REVIEW: 7/8
- ALWAYS_REVIEW: 1/8
- FALSE_AUTO_APPROVAL: 0/0

Official Gold33 was AUTO 5, TEACHER_REVIEW 19, ALWAYS_REVIEW 9, with observed false AUTO 0/5. The combined 41-sentence routing reference is therefore 5/26/10. Because the Final8 set intentionally targeted uncertain structures, these shares are not a corpus forecast.

## Planning-only workload scenario

If the biased 41-sentence distribution were applied mechanically to 13,234 sentences:

- AUTO: about 1,614 (12.2%)
- TEACHER_REVIEW: about 8,396 (63.4%)
- ALWAYS_REVIEW: about 3,228 (24.4%)

These numbers are conservative planning bounds, not measured corpus counts. The existing mining results show thousands of overlapping nonfinite and preposition candidates, so summing candidate counts would double-count sentences. Run the frozen gate corpus-wide in shadow mode before estimating teacher hours.

## Operational answer

Teachers should **not** manually Gold all 13,234 sentences. For V1 development, no more Gold is required. For a later unattended-AUTO launch decision, validate a minimal fresh sample of at least five genuinely AUTO-likely sentences; this is release monitoring, not a blocker for building V1.

## Decision

`AUTO APPROVAL = SHADOW_ONLY`. Candidate classifier role: **Teacher Review queue generator**.
