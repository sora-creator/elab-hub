# Sentence Structure Student V1 — Implementation Report

## Scope

Local-only student practice page built from the frozen Sentence Structure Gold and Sentence Chunking V1 Pilot12. No parser, rule, level, teacher canonical, Apps Script, or operating data changes were made.

## Page

- Source: `sentence-structure/index.html`
- Dataset: 12 reviewed sentences
- Runtime: generated local fixture `output/sentence-structure-student-v1/student-v1-data.js`
- Storage namespace: `elab.student.sentence-structure.v1.<dataset fingerprint>`

## Implemented

- Exact primary-or-acceptable subject span scoring
- Exact frozen student meaning verb span scoring
- Multiple subject and verb spans
- Two-attempt structure flow with delayed answer reveal
- Junction-based chunk input
- MUST / OPTIONAL / NO_SPLIT evaluation
- FOUNDATION / BEGINNER / INTERMEDIATE / ADVANCED visual hints
- Approved V5 expression display
- Frozen S1–S5 display
- Local progress and result persistence
- Responsive 390px layout

## Data safety

The builder removes PDF paths, source provenance, parser tokens, dependency metadata, teacher history, and review timestamps. It emits only the fields required by the student prototype. Teacher exports remain local inputs and are never loaded by the page.

## Source-marker protection

`corpus:2590` uses the clean sentence ending in `champagne.` and contains no numbered source marker token.
