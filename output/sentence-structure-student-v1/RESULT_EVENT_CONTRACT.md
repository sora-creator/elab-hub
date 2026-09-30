# Local Result Event Contract

```json
{
  "sentence_id": "corpus:25018",
  "structure_level": "S1",
  "subject_attempts": 1,
  "subject_correct": true,
  "verb_attempts": 1,
  "verb_correct": true,
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

## Future wrongnote error types

- `SUBJECT_SPAN`
- `VERB_SPAN`
- `REQUIRED_CHUNK_MISSED`
- `FORBIDDEN_CHUNK_USED`

## Current persistence

The prototype stores an array of these objects under a fingerprinted localStorage namespace. It performs no network request and no operating write.
