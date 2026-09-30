# Backend Integration — Next Step

Do not connect the prototype directly to operating Apps Script yet.

## Recommended next phase

1. Add a versioned `SENTENCE_STRUCTURE` content reference and Assignment launch contract.
2. Map the local result object to a server-side attempt payload with idempotent request IDs.
3. Map the four error types to ReviewItems without changing existing Wrongnote records.
4. Resolve `reading_support_level` from an explicit assignment or student setting; do not infer a new profile field.
5. Run an isolated staging assignment and retry/idempotency audit before any production write.

The frozen student dataset builder should remain the only bridge from private Teacher exports to a deployable, minimal runtime asset.
