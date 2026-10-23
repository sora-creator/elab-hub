# Pilot12 Post-R6 Metrics

Source: final reviewed 12-record snapshot with dataset fingerprint `a07cb5bfc526b707e21f15033300256c085e03aef2b9dc9aa9780198369d1d7b`.

## Overall

| Metric | Before | After |
|---|---:|---:|
| AI candidates | 50 | 48 |
| Teacher-policy exact candidates | 41 | 41 |
| Boundary candidate recall | 100.0% | 100.0% |
| Policy exact | 82.0% | 85.42% |
| False split candidates | 9 | 7 |
| Missed boundaries | 0 | 0 |

Precision improved without sacrificing recall.

## Rule proposal counts

| Rule | Before | After | Regression |
|---|---:|---:|---|
| R1 | 16 | 16 | 0 |
| R2 | 5 | 5 | 0 |
| R3 | 20 | 20 | 0 |
| R4 | 1 | 1 | 0 |
| R5 | 0 | 0 | 0 |
| R6 | 4 | 2 | intended −2 |
| R7 | 1 | 1 | 0 |
| R8 | 0 | 0 | 0 |
| R9 | 3 | 3 | 0 |

## Gold preservation

- Pilot12 canonical: 12/12
- DATA_INCOMPLETE: 0
- Unresolved conflict: 0
- Teacher canonical changed: 0
- Additional Teacher review required: 0
