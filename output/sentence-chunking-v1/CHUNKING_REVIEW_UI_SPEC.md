# Chunking Teacher Review UI Spec

## 형태

기존 Sentence Review Adapter를 변경하는 대신 별도 `chunking-pilot12` review mode를 권장한다. 기존 S/V·Level·Gold는 읽기 전용 참고 정보이며 Chunking state는 별도 namespace에 저장한다.

## 기본 화면

1. source sentence
2. PDF/source 확인 완료 표시
3. 현재 Teacher subject/verb highlight
4. token junction editor
5. chunk preview
6. `[✓ 대표 끊어읽기 확정]`

고급 parser 정보는 접힘 영역에만 둔다.

## Interaction

문장 token 사이에 넓은 클릭 target을 배치한다.

```text
Greenwashing [ ] involves [/] misleading [ ] a consumer ...
```

- junction 클릭: slash 추가/제거
- AUTO 후보: 연한 표시, 아직 정답 아님
- Teacher boundary: 강한 표시
- S/V no-split 영역: 얇은 background band
- preview: slash가 적용된 여러 줄 의미 단위
- undo/redo 또는 마지막 변경 취소
- `[자동 후보로 되돌리기]`는 명시적 secondary action

## Confirm flow

한 번의 확인 클릭으로:

1. 현재 boundary set validation
2. `teacher_primary_chunks[]` 생성
3. `teacher_chunking_verified=true`
4. reviewed_at/review_method/history 기록
5. IndexedDB 저장 readback 확인
6. 다음 Pilot 문장 이동

저장 실패 시 다음 문장으로 이동하지 않는다.

## Validation UX

무반응 금지. 예:

- 빈 chunk가 생김: “연속된 끊기 표시를 하나 제거하세요.”
- token coverage 오류: “문장 전체가 의미 단위에 포함되지 않았습니다.”
- fingerprint mismatch: “원문이 변경되어 기존 끊어읽기를 적용할 수 없습니다.”

## Primary와 acceptable

V1 UI는 대표안 하나만 편집한다. acceptable variant 버튼은 만들지 않는다. Pilot에서 반복 필요가 확인된 후 고급 기능으로 추가한다.

## Persistence/import/export

- dataset id: `chunking-pilot12`
- fingerprint: 12 IDs/order/text/tokenization 기반
- IndexedDB namespace는 Sentence Review와 분리
- export에는 immutable sentence reference, AUTO candidates, Teacher primary, provenance를 포함
- Pilot50/Final8 Teacher Gold import와 cross-namespace merge 금지

## Mobile

390px에서 token과 junction target이 자연스럽게 wrap되어야 한다. 가로 스크롤을 만들지 않고, junction target은 최소 32px 높이의 클릭 영역을 확보한다.

## 구현 전 남은 결정

1. punctuation을 앞 chunk와 뒤 chunk 중 어디에 시각적으로 붙일지
2. Teacher가 1-token chunk를 허용할 때 warning만 줄지 차단할지
3. chunk preview에 한국어 의미 메모를 V1에 넣을지 이후 단계로 미룰지
4. Pilot 평가에서 exact boundary set과 교육적 만족도 중 무엇을 1차 지표로 둘지

권장 기본값은 punctuation을 앞 chunk에 유지하고, 1-token chunk는 warning만 제공하며, 한국어 메모는 V1에서 제외하고, Teacher primary boundary exact를 1차 지표로 쓰는 것이다.
