# Remote Sentence Structure Wrongnote Evidence

## Canonical item behavior

The existing ELAB policy keeps one active ReviewItem per student/content/error identity and records repeated outcomes as ReviewEvents. Therefore the isolated scenarios are evaluated by newly introduced item/event deltas, not by expecting a new duplicate ReviewItem for every attempt.

| Submission | Subject result | Verb result | Wrongnote effect |
|---|---:|---:|---|
| Wrong subject only | false | true | SUBJECT_SPAN introduced once; VERB_SPAN not introduced |
| Wrong verb only | true | false | VERB_SPAN introduced once; no new SUBJECT_SPAN |
| Both wrong | false | false | Both histories incremented; total canonical items stayed 2 |
| Acceptable subject | true | true | Delta 0 |
| Accepted surface verb | true | true | Delta 0 |
| Free-form chunking difference | true | true | Delta 0 |
| Correct retry | true | true | Existing 2 items changed to REVIEWED; item count stayed 2 |

## Final readback

- Track: `SENTENCE_STRUCTURE`
- Error types: `SUBJECT_SPAN`, `VERB_SPAN`
- Final canonical ReviewItems: 2
- Final ReviewEvents: 7
- Both items expose student answer and correct answer payloads.
- Both items link to an assignment target and attempt.
- Both items have `status=REVIEWED` after the successful retry.
- Both items have `wrong_count=2`, representing their two wrong outcomes across isolated scenarios.

## Browser readback

The student portal's Wrongnote link opened against the staging endpoint. The real UI showed:

- `문장구조 오답 2개`
- repeated-error count 2
- staging assignment bundles in the Sentence Structure track

No Vocabulary wrongnote was created by V5 exposure, and free-form chunking did not create a wrongnote.
