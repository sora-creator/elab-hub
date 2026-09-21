# Chunking V1 Data Model

## 원칙

- 기존 sentence/token/source annotation은 immutable input이다.
- AUTO 후보와 Teacher canonical을 분리한다.
- tokenization version과 sentence fingerprint를 고정한다.
- span convention은 `start_token` inclusive, `end_token` exclusive다.
- canonical chunk는 전체 문장을 gap·overlap 없이 정확히 한 번 덮는다.

## Record schema

```json
{
  "sentence_id": "corpus:23568",
  "sentence_fingerprint": "...",
  "tokenization_version": "legacy-whitespace-v1",
  "tokens": [],
  "chunking_version": "chunking-v1",
  "auto_chunk_candidates": [
    {
      "boundary_after_token": 1,
      "reason": "SUBJECT_PREDICATE_SCAFFOLD",
      "confidence": "MEDIUM",
      "evidence_token_indexes": [0, 1],
      "source": "AUTO_CANDIDATE"
    }
  ],
  "teacher_primary_chunks": [
    {
      "chunk_id": "ch1",
      "chunk_order": 1,
      "start_token": 0,
      "end_token": 2,
      "text": "Greenwashing involves",
      "boundary_after": true,
      "teacher_reason": "SCAFFOLD"
    }
  ],
  "teacher_acceptable_chunk_variants": [],
  "teacher_chunking_verified": true,
  "reviewed_at": "ISO-8601",
  "review_method": "TEACHER_CHUNK_BOUNDARY_REVIEW",
  "history": []
}
```

## Boundary representation

학생이 클릭하는 대상은 token 자체가 아니라 token 사이의 junction이다. `boundary_after_token: 4`는 UI token 4 뒤에 slash가 있음을 뜻한다. 마지막 token 뒤의 문장 종료는 slash candidate로 저장하지 않는다.

Teacher canonical은 `teacher_primary_chunks[]`다. boundary 목록은 chunk span에서 파생한다. 같은 사실을 두 canonical 필드에 중복 저장하지 않는다.

## Candidate reason enum

- `PUNCTUATION_MAJOR`
- `SUBORDINATOR_ENTRY`
- `RELATIVE_ENTRY`
- `COMPARISON_ENTRY`
- `PARENTHETICAL_EDGE`
- `LONG_MODIFIER_EDGE`
- `SUBJECT_PREDICATE_SCAFFOLD`
- `NONFINITE_ENTRY`
- `PARTICIPIAL_ENTRY`
- `COORDINATION_EDGE`
- `TEACHER_PATTERN_CANDIDATE`
- `REVIEW_REQUIRED`

`confidence`는 정답 확률이 아니라 후보 우선순위다. 가능한 값은 `HIGH`, `MEDIUM`, `LOW`다.

## Validation

Teacher primary chunks는 다음을 모두 만족해야 한다.

1. chunk가 1개 이상이다.
2. 첫 chunk는 token 0에서 시작한다.
3. 이전 `end_token`과 다음 `start_token`이 같다.
4. 마지막 `end_token`이 token count와 같다.
5. gap/overlap/빈 chunk가 없다.
6. 저장된 `text`가 token span에서 재생성한 text와 같다.
7. boundary가 token 내부나 source-marker artifact에 놓이지 않는다.
8. source sentence fingerprint가 일치한다.

## Acceptable variants

V1 저장 형식은 향후 확장을 위해 배열을 예약하지만 기본값은 빈 배열이다. Pilot12에서 동일 construction의 복수 정답 필요가 최소 두 번 반복되기 전에는 제품 채점에 사용하지 않는다.

## Provenance

Teacher 수정은 AUTO 후보를 덮어쓰지 않는다. history에는 candidate 수용·제거, 수동 boundary 추가·삭제, 최종 확인을 기록한다. 기존 Sentence Gold와 Chunk Gold는 별도 상태다.
