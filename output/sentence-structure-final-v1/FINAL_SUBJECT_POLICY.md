# Final Student Subject Policy

## V1 canonical answer

`STUDENT_SUBJECT_PRIMARY` is the minimum complete noun phrase, pronoun, or clause that a student should read as one subject unit. A clause marker is excluded. The internal grammatical head remains separately stored as `subject_head`.

Examples supported by Gold evidence include `your school`, `all safety rules`, `One of the aims of these activities`, `the economic benefits of ecosystem services`, and `Her heart`.

## Final8 result

- Primary exact: 12/14 clauses (85.7%).
- Acceptable match: 12/14 clauses (85.7%).
- Errors:
  1. `our first, immediate, automatic reaction` omitted the selected post-head complement `to a situation`.
  2. In `corpus:23568`, AUTO associated the content-clause subject with `involves`; Teacher Gold is `a good or service`.

These are implementation/projection errors, not ambiguity in the subject answer definition. Together with Gold33 at 79/81, the primary subject policy is stable enough to freeze for V1 while complex projections remain review-routed.

## Additional acceptable answers

The contract remains:

- exact primary match OR exact match to one explicitly accepted additional span is correct;
- candidates never become truth automatically;
- over-selection is wrong unless explicitly recorded by the teacher.

Final8 generated one high-confidence candidate, `We all`, for `corpus:58378`; Teacher Gold did not accept it. Gold33 contains the accepted `We all` case for `corpus:25018`. Across these two targeted cases, one candidate was accepted and one was not. This confirms that generation is ready as a non-destructive suggestion mechanism, but not as auto-acceptance.

## Routing

AUTO eligibility requires a contiguous primary span with no unresolved post-head complement, appositive, coordination, clause-marker, or subject-association risk. Otherwise route to Teacher Review; parser disagreement or discontinuity routes to Always Review.

## Decision

- `STUDENT_SUBJECT_PRIMARY = FINAL`
- `ACCEPTABLE_SUBJECT_CANDIDATES = READY` for teacher-confirmed candidates only
- automatic acceptance of acceptable candidates = prohibited
