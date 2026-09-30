# Student Flow Specification

## Step 1 — Find the subject and verb phrase

The student switches between “주어 선택” and “동사구 선택,” clicks one contiguous answer span, and adds it. Multiple spans remain separate. Subject scoring accepts an exact primary span or an exact teacher-registered acceptable span. Verb scoring accepts only the frozen student meaning verb span.

The first incorrect submission gives one retry without revealing all answers. The second submission reveals the reviewed spans and allows the student to continue.

## Step 2 — Chunk the sentence

Each token junction is clickable. A selected junction displays `/`. The hint button displays dotted presentation guides without selecting an answer.

- MUST_SPLIT omitted: incorrect
- OPTIONAL_SPLIT selected or omitted: correct
- NO_SPLIT selected: incorrect

## Step 3 — Feedback

Only incorrect junctions receive corrective feedback. Internal identifiers such as R1–R9, dependency, clause type, and predicate are not shown.

## Step 4 — Key expressions

This step appears only when the frozen review contains an approved V5 expression. It shows the expression, Korean meaning, and sentence evidence.

## Step 5 — Next sentence

The result is written to the prototype-only localStorage document, then the next reviewed sentence opens at the top.

## Reading support

- FOUNDATION: canonical guides plus the finest frozen support layer
- BEGINNER: canonical guides plus selected support splits
- INTERMEDIATE: MUST and OPTIONAL guides
- ADVANCED: MUST-centered minimal guides

These guides never alter canonical scoring or automatically enter a student answer.
