# Auto Chunk Candidate Strategy

## 역할

AUTO는 정답 chunk를 만들지 않는다. token junction별 boundary 후보와 근거를 제안하고 Teacher가 추가·삭제한 결과를 축적한다.

## 후보 생성 순서

1. canonical sentence와 UI tokens를 로드한다.
2. punctuation, parser markers, conjunction, nonfinite, subject/verb, clause candidates를 UI token junction으로 투영한다.
3. no-split constraint를 적용한다.
4. 너무 가까운 후보를 억제하고 우선순위를 정한다.
5. `auto_chunk_candidates[]`만 저장한다.

## 후보 family

### 높은 우선순위

- colon/semicolon/dash 같은 major punctuation 뒤
- overt subordinate marker 앞
- relative marker 앞
- `than` 비교절 앞
- 명확한 삽입구의 양쪽 edge

### 중간 우선순위

- 긴 subject 완결 뒤
- 긴 PP 또는 modifier edge
- 독립 목적/부가 의미의 to-V·V-ing 진입
- 길고 대칭적인 coordination edge

### 낮은 우선순위 / review

- zero-marker content clause
- parser가 disagree하는 clause association
- lexical preposition/verb pattern에 의존하는 경계
- 짧은 ambiguous modifier

## No-split constraint

다음 junction에는 기본 후보를 만들지 않는다.

- Teacher student verb span 내부
- Teacher primary subject span 내부
- auxiliary–lexical verb, modal–verb, be–participle 내부
- validated particle 내부
- determiner/adjective와 head noun 사이
- punctuation token 내부 또는 parser-to-UI alignment 실패 지점

Gold가 없는 corpus에서는 teacher span 대신 고신뢰 AUTO span을 soft constraint로 사용하며, 불확실하면 `REVIEW_REQUIRED`로 낮춘다.

## 과분절 억제

- 기본 최소 chunk 길이: 2 UI tokens. 단, 교육적으로 완결된 1-token chunk는 Teacher만 허용한다.
- 연속 junction 후보는 하나로 병합하거나 낮은 confidence 후보를 제거한다.
- 짧은 문장은 no-boundary도 정상 후보다.
- chunk 개수는 Level 산식에 넣지 않는다.
- slash를 많이 제안하는 것이 recall 향상으로 간주되지 않는다.

## 초기 평가 지표

Pilot12에서 다음을 측정한다.

- boundary precision/recall/F1 against Teacher primary
- 문장 exact boundary set
- over-segmentation: extra boundary count
- under-segmentation: missing boundary count
- no-split violation count
- reason family별 accept/remove count

표본이 12개이므로 자동 확정 임계치는 정하지 않는다. 최소 목적은 어떤 reason family가 반복적으로 수용되는지 확인하는 것이다.

## 결론

기존 feature만으로 AUTO candidate 생성은 가능하다. 그러나 `corpus:23568` 같은 clause association 오류가 있으므로 V1 후보는 항상 Teacher Review를 거쳐야 한다.
