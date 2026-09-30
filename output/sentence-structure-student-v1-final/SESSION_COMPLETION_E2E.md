# Student Sentence Structure V1 — 12/12 Session Completion E2E

- Run date: 2026-10-01
- Test: `node sentence-structure/completion.e2e.cjs`
- Browser: isolated headless Chromium context
- Storage: isolated assignment namespace; user profile/storage not used
- Records completed: 12 / 12
- E2E assertions: 82 passed, 0 failed
- Browser errors: 0

## Sentence flow

| # | Sentence ID | Step 3 |
|---:|---|---|
| 1 | corpus:2970 | Automatically skipped |
| 2 | corpus:25018 | Automatically skipped |
| 3 | corpus:2449 | Automatically skipped |
| 4 | corpus:2590 | V5 expression reviewed |
| 5 | corpus:2479 | Automatically skipped |
| 6 | corpus:58378 | Automatically skipped |
| 7 | corpus:26237 | V5 expression reviewed |
| 8 | corpus:2501 | V5 expression reviewed |
| 9 | corpus:23568 | V5 expression reviewed |
| 10 | corpus:2581 | V5 expression reviewed |
| 11 | corpus:2480 | V5 expression reviewed |
| 12 | corpus:59087 | Automatically skipped |

Every sentence passed STEP 1 → STEP 2 → STEP 3 or automatic skip → STEP 4. Progress advanced from 1/12 through 12/12.

## Completion behavior

- The twelfth sentence stored the twelfth unique result and stopped.
- No thirteenth record, random record, or first-record loop was opened.
- The final screen displayed “문장구조 연습을 완료했어요!” and “오늘 12문장을 모두 학습했어요.”
- The summary displayed completed sentences, restarted sentences, hint-provided sentences, and expressions.
- The primary CTA linked to the existing `../student/index.html` student portal.
- F5 retained the completed screen and all 12 results.
- Closing the tab and reopening it in the same isolated profile retained the completed screen.
- The 390px completion view had no horizontal overflow.

## Regression evidence

- Core tests: 40 / 40 passed
- Full Chromium UI checks: 196 / 196 passed
- Fast selection, editing, grammar-aware targeting, hints, answer comparison, chunking, V5, restart, progress, and step transitions: passed
- Teacher canonical, Gold, Chunking V1, R1–R9, S1–S5, vocabulary data, Apps Script, and operating DB: unchanged
