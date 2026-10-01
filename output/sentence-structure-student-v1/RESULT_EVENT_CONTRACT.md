# Local Result Event Contract

```json
{
  "sentence_id": "corpus:25018",
  "structure_level": "S1",
  "subject_answers": [[0, 1]],
  "verb_answers": [[2]],
  "subject_attempts": 1,
  "subject_correct": true,
  "verb_attempts": 1,
  "verb_correct": true,
  "student_chunk_boundaries": [],
  "chunk_completed": true,
  "chunk_required_missed": 0,
  "chunk_forbidden_used": 0,
  "chunk_optional_used": 0,
  "hint_used": true,
  "reading_support_level": "foundation",
  "expression_ids_shown": [],
  "error_types": [],
  "completed_at": "ISO-8601 timestamp"
}
```

## Wrongnote error types

- `SUBJECT_SPAN`
- `VERB_SPAN`

Chunking is free-form in Student V1. `student_chunk_boundaries` is retained as learning analytics, but chunk differences never create a ReviewItem or increase a wrong count.

## Current persistence

Local preview stores these objects under a fingerprinted localStorage namespace. Assignment launch posts the same raw + derived object to the existing Sentence Structure result store; the backend trusts the V1 scorer's derived S/V booleans and does not implement a second scoring rule.
