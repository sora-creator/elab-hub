# ELAB Sentence Chunking V1 — Final Policy

## Scope

Chunking V1 separates canonical correctness from level-specific presentation support. Teacher canonical remains the source of truth; AI proposals are review drafts.

## Canonical correctness

- `MUST_SPLIT`: the boundary must be selected.
- `OPTIONAL_SPLIT`: either selecting or omitting the boundary is correct.
- `NO_SPLIT`: selecting the boundary is incorrect unless a presentation-only support layer explicitly renders it.

Teacher approval stores one complete `teacher_boundary_policy` snapshot for every token junction. Legacy chunk variants remain evidence only.

## R1–R9

1. R1 — conjunction boundary
2. R2 — overt relative-clause boundary
3. R3 — prepositional-phrase boundary
4. R4 — V-ed modifier boundary
5. R5 — V-ing modifier boundary
6. R6 — to-infinitive boundary
7. R7 — omitted-relative boundary
8. R8 — omitted content-clause conjunction boundary
9. R9 — long subject–verb-distance boundary

R1/R2/R3/R4/R5/R7/R8/R9 retain their pre-freeze behavior.

## Final R6 exception

R6 does not propose a split when parser structure confirms a semi-modal or necessity chain:

- `have / has / had + to + V`
- `need / needs / needed + to + V`
- passive continuations such as `needs to be + p.p.`
- auxiliary variants such as `will have to + V`

The guard requires the recognized left verb, a parser `TO` auxiliary, and a downstream infinitive verb head within the chain. A teacher student-verb span may support the evidence but does not activate the exception by itself.

Ordinary complement/control verbs remain R6 candidates: `try to`, `want to`, `plan to`, `decide to`, `expect to`, `urge A to`, `designed to`.

## Support presentation layers

- `FOUNDATION`: finest scaffold for beginning readers.
- `BEGINNER`: canonical plus selected support splits.
- `INTERMEDIATE`: MUST plus principal OPTIONAL boundaries.
- `ADVANCED`: MUST-centered minimal presentation.

Support boundaries never change canonical correctness and are excluded from exact-match correctness evaluation.

## V5 expressions

V5 expression detection is a separate vocabulary-support axis. It can protect or flag lexical spans for review, but pending V5 work does not block Chunking canonical completion and does not write to the operating VocabularyDB.
