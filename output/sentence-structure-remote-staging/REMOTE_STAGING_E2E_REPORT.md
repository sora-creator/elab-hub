# Sentence Structure Remote Staging E2E Report

## Result

Remote staging Sentence Structure E2E: **PASS**

The E2E used the deployed staging `/exec` endpoint and its isolated spreadsheet. Local mocks were used only for the separate regression suite, not as a substitute for remote persistence.

## Remote scenarios

| Scenario | Result |
|---|---|
| Staging student login and assignment list | PASS — Chrome showed 5 in progress and 1 completed after the run |
| Assignment launch | PASS — the student portal appended the signed assignment context and opened the Sentence Structure app |
| Attempt single creator | PASS — repeated launch returned the same attempt ID |
| Attempts created | PASS — 6 actual / 6 expected |
| NONE hint assignment | PASS |
| BASIC hint assignment | PASS |
| DETAILED hint assignment | PASS |
| Wrong subject, correct verb | PASS — result flags false/true; one SUBJECT_SPAN item introduced, no VERB_SPAN item introduced |
| Correct subject, wrong verb | PASS — result flags true/false; one VERB_SPAN item introduced, no new SUBJECT_SPAN item |
| Both wrong | PASS — both error histories incremented without duplicate ReviewItem creation |
| Acceptable subject | PASS — correct, ReviewItem delta 0 |
| Accepted surface verb | PASS — `can probably expect` accepted against canonical `can expect`, ReviewItem delta 0 |
| Free-form chunking | PASS — custom boundaries `[0,3]`, `chunk_completed=true`, ReviewItem delta 0 |
| V5 exposure | PASS — 3 expression IDs recorded; no VocabularyDB/mastery/wrongnote write |
| Retry | PASS — two existing items remained two and became REVIEWED after correct retry |
| Completion | PASS — attempt and assignment completed only after sentence 8 |
| Resume | PASS — after three remote results the same attempt returned three results; real Chrome F5 retained remote progress (`1 / 8` in the separately seeded BASIC scenario) |
| Result summary | PASS — 8 completed, 8 subject-correct, 8 verb-correct, 8 hint-used, 3 expressions seen |
| Wrongnote readback | PASS — two Sentence Structure items visible through both API and the real Wrongnote UI |

## Real browser evidence

- Browser: existing signed-in Chrome controlled through the local student page and the remote staging endpoint.
- Student portal login: PASS
- Assignment list: PASS
- Assignment launch: PASS
- F5 resume: PASS
- Completed assignment tab: PASS
- Wrongnote screen: PASS — `문장구조 오답 2개`
- Console errors: 0

## Existing-track regression

Because the isolated staging spreadsheet did not contain Vocabulary, Grammar, Reading, or Practice content fixtures, no fake content rows were inserted. The deployed endpoint was exercised read-only for each existing route and returned the expected routed response (`found:false` for absent content; Vocabulary capability issuance remained responsive). Local contract regressions also passed:

- Vocabulary: remote route smoke PASS; local fixed-assignment/result persistence PASS
- Grammar: remote route smoke PASS; local Grammar V1 PASS
- Reading: remote route smoke PASS; static Reading V1 PASS
- Practice Exam: remote route smoke PASS; assignment/attempt contracts PASS

These checks verify routing and contract preservation without broadening the approved staging-write scope.

## Local regression totals

- Sentence Structure core: 40/40 PASS
- Sentence Structure staging browser: 12/12 PASS, errors 0
- Isolated completion E2E: 82 checks PASS, errors 0
- Integration/legacy track suite: 7/7 PASS
- Reading V1 static suite: 15 checks PASS
