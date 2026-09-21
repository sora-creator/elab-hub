# Final Student Verb Span Policy

## Separate contracts

`GRAMMAR_HEAD`/finite carrier and `STUDENT_MEANING_VERB_SPAN` are different fields. A correct head does not prove that the pedagogical meaning span is correct.

Examples:

- head `needs` / student span `needs to be done`;
- head `decided` / student span `decided to stop`;
- head `wanted` / Teacher span `wanted`;
- finite `can` + lexical `reorganize` / student span `can reorganize`.

## Final8 result

- 13/14 predicates exact (92.9%).
- The sole mismatch is `corpus:2590`: AUTO `wanted to get`; Teacher `wanted`.
- Auxiliaries, modals, finite carriers, predicate identity, and ordinary finite spans were stable.

## Nonfinite complement policy

Neither blanket inclusion nor blanket exclusion matches Teacher Gold.

Validated inclusion evidence:

- `decided to stop`
- `need to recruit`
- `have to do`
- `needs to be done`

Validated exclusion evidence:

- `wanted` rather than `wanted to get`
- `is planning` rather than `is planning to discontinue`
- `are designed` rather than `are designed to suit`
- `expect` rather than `expect to be addressed`
- `can reorganize` rather than `can reorganize to receive`
- `involves` rather than `involves misleading`
- `urge`, excluding `to listen`
- `help`, excluding a bare-infinitive complement
- `enabled`, excluding the following coordinated to-infinitives

Therefore V1 uses a small construction-specific allowlist and routes every unvalidated construction to teacher review. Syntax alone cannot finalize the span.

## Particle and preposition

- Contiguous validated dependency particles (`make up`, `looked up`, `pull apart`) are included deterministically.
- Ordinary PP material is excluded by default.
- Lexically selected prepositions remain review-only: Teacher evidence includes both inclusion (`see through`, historical `live in`) and exclusion (`consists of`, `wait for`).

## Decision

- `STUDENT_VERB_SPAN V1 = PARTIAL`
- `NONFINITE POLICY = CONSTRUCTION_BASED`, with review fallback
- `PHRASAL PARTICLE = FINAL`
- `PREPOSITIONAL VERB = REVIEW_REQUIRED`
- `GENERAL PP = DEFAULT_EXCLUDE`
