# ELAB V1–V5 Vocabulary DB Integration Plan

## Source audit

- Source workbook: `ELAB_V1-V5_통합_어휘DB_모의고사+수능_2022-2026 (1).xlsx`
- Import sheet: `ELAB_Import`
- Rows: 13,359
- Unique `sense_id`: 13,359
- Duplicate or missing `sense_id`: 0
- Levels: V1 2,149 / V2 2,573 / V3 3,098 / V4 3,014 / V5 2,525
- Active rows: 13,359
- Words with multiple senses: 2,341
- `DAY` is not imported or stored.

## Existing → integrated mapping

| Source/new concept | Existing ELAB field | Integration rule |
| --- | --- | --- |
| `sense_id` | `WordsV2.word_id`, `VocabSetItemsV2.word_id`, `WordAttemptItemsV2.word_id` | Use the authoritative sense ID as the compatible word item ID for imported content. Never derive identity from `word`. |
| `vocab_id` | none | Store in `VocabularyDB.vocab_id`; use only to group senses sharing a spelling. |
| `word` | `WordsV2.term` | Copy into set snapshot and compatibility row. |
| `meaning` | `WordsV2.meaning` | Copy into set snapshot and compatibility row. |
| `level` | none in old item schema | Store as confirmed `VocabularyDB.level`; copy to `level_snapshot` when a set is created. |
| existing Vocab set | `VocabSetsV2` | Keep sheet and IDs. Append level/selection metadata fields only. |
| existing set membership | `VocabSetItemsV2` | Keep old fields. Append `sense_id` and immutable word/meaning/level snapshots. |
| assignment | `AssignmentsV2` | Continue with `content_type=VOCAB`, `content_ref_id=vocab_set_id`. |
| student progress | `AssignmentTargetsV2`, `AttemptsV2` | No contract change. |
| item result | `WordAttemptItemsV2` | Existing `word_id` carries `sense_id` for imported sets. |
| wrongnote | `ReviewItemsV2`, `ReviewEventsV2` | Existing WORD review path continues using the same sense ID. |

## New sheets

### VocabularyDB

Authoritative sense catalog. `sense_id` is the primary key. `level` is the confirmed level. A differing incoming level is recorded as `recommended_level` with review status instead of silently replacing the confirmed level.

### VocabularyImportsV2

One row per preview/commit request, including counts, status, source filename and timestamps.

### VocabularyImportErrorsV2

Validation errors keyed by import request and source row. No token or student-sensitive data is stored.

### VocabularyImportStagingV2

Short-lived import staging keyed by request ID and source row. Staging is isolated from the live catalog until explicit commit. Old staging data can be deactivated only by a separate maintenance action; commit never deletes live vocabulary data.

## Import transaction

1. Teacher selects XLSX/CSV in `teacher/vocabulary-db.html`.
2. Browser reads only `ELAB_Import`, validates required columns, types and duplicate `sense_id`.
3. Rows are uploaded in bounded chunks to staging under a new request ID.
4. Server preview compares staged rows with `VocabularyDB` and records new/changed/unchanged/error counts.
5. Teacher confirms the displayed preview.
6. Server commit upserts by `sense_id` under ScriptLock and writes the import history result.
7. Existing Vocab sets, set snapshots, Attempts and results are untouched.

## Update policy

- Existing sets never read mutable `VocabularyDB` values at launch; they use `VocabSetItemsV2` snapshots.
- New word/meaning/importance/frequency/active values apply to newly created sets.
- If an existing confirmed `level` differs from the incoming level, retain the existing level and set `recommended_level` plus `level_review_status=REVIEW_REQUIRED`.
- Import commit is idempotent per request ID.
- Duplicate `sense_id` inside one source file blocks preview/commit.

## Set creation and assignment

- Teacher filters V1–V5, searches word/meaning, sorts by importance/frequency/alphabetical.
- Selection modes: importance, random, unlearned-first, wrong-first.
- Preview returns explicit `sense_id` rows; creation uses those exact IDs.
- `VocabSetsV2` and `VocabSetItemsV2` are written together.
- Each set item stores `word_snapshot`, `meaning_snapshot`, and `level_snapshot`.
- The existing assignment workspace lists the resulting `VocabSetsV2` row and assigns it through the existing batch API.

## Rollback

- Before production import, export the entire Google Spreadsheet and record Apps Script version.
- A failed preview requires no rollback because live `VocabularyDB` is unchanged.
- A failed commit is identified by request ID. Do not delete rows manually; restore the Spreadsheet backup or run a separately reviewed request-scoped rollback procedure.
- Existing Vocab sets and student results are not part of the import mutation and must never be deleted during rollback.
