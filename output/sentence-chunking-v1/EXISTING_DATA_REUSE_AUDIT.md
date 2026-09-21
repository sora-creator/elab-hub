# Existing Data Reuse Audit

## 조사 범위

- `grammar/exams.db`: 13,234 sentence rows
- Gold41 reference: 공식 Gold33 + Final Holdout8
- 기존 Pilot/Final annotation bundles
- full-corpus candidate mining 결과

현재 DB schema는 exam/source metadata, sentence text, 기존 grammar tags를 저장한다. full-corpus dependency와 chunk 정답은 저장하지 않는다.

## 재사용 가능 데이터

| 데이터 | 범위 | Chunking 용도 | 신뢰 수준 |
|---|---|---|---|
| sentence text/source/question | 13,234 | immutable input, provenance | 높음 |
| UI token/char offset | annotation 또는 parser projection | 클릭 junction, span 재생성 | alignment 검증 필요 |
| punctuation | text/parser | 강한 boundary 후보 | 후보만 |
| POS/tag/dep/head/morph | local spaCy on demand | marker·coordination·nonfinite 후보 | 정답 아님 |
| parser-to-UI mapping | 기존 annotation pipeline | parser evidence를 UI token에 투영 | alignment 실패 시 review |
| teacher subject span | Gold41 | 골격 보존·주어 끝 후보 | teacher-confirmed |
| teacher student verb span | Gold41 | 동사구 내부 no-split | teacher-confirmed |
| clause candidates/markers | 기존 pipeline | subordinate/relative 후보 | supporting evidence only |
| S1–S5 | Gold41 | Pilot 균형·연습 단계 | teacher-confirmed |
| Interpretation Feature | 일부 Gold | 설명 tag, candidate priority | boundary와 별도 |
| legacy grammar tags | corpus DB | to-V/분사 후보 검색 | coarse retrieval |

## Full-corpus 재사용 규모

기존 shadow mining은 새 NLP 시스템 없이 현 pipeline을 재사용할 수 있음을 보여준다.

- 13,234 rows, 12,293 normalized unique texts
- fresh to-infinitive candidate sentences: 1,738
- fresh V-ing complement candidates: 378
- fresh passive nonfinite candidates: 72
- fresh particle candidates: 527
- fresh preposition/general-PP union: 5,982
- fresh acceptable-subject candidates: 29

이 수치는 chunk 정답 개수가 아니라 boundary-risk 검색 가능 범위다. class 간 중복이 있으므로 합산하지 않는다.

## 재사용 시 주의

1. Clause engine은 supporting feature다. `corpus:23568`처럼 finite unit은 찾았지만 MAIN/content association이 틀릴 수 있다.
2. Full corpus DB의 dependency는 canonical truth가 아니다. 필요 시 같은 local parser/version으로 재생성하고 provenance를 기록한다.
3. Teacher S/V는 Gold41에서만 확정값이다. 나머지 corpus에서는 AUTO feature로만 사용한다.
4. source-marker backlog 32건은 Chunking 입력 정제와 분리한다. marker 후보가 canonical text에 남은 문장은 Pilot에 넣지 않는다.

## 현재 없는 데이터

- Teacher-confirmed chunk boundaries: 0
- validated chunk generation rules: 0
- acceptable chunk variants: 0
- chunking-specific error taxonomy: 0
- student chunking response data: 0

결론: 기존 데이터는 후보 생성과 Pilot 선정에 충분하지만, Chunk 정답 정책은 Pilot12 Teacher Review로 새로 만들어야 한다.
