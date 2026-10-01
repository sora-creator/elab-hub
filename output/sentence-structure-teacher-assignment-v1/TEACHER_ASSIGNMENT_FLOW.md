# Sentence Structure Teacher Assignment Flow V1

1. 교사가 기존 과제배정 화면에서 학생 또는 그룹을 선택한다.
2. `문장구조 연습`을 열고 제목, 문장 수, S1–S5 범위, 힌트 수준, 읽기 도움, 마감일을 정한다.
3. `AI 자동 추천`으로 Student V1 검증 카탈로그의 완성된 초안을 만든다.
4. 영어 문장, S Level, 확인 가능한 source, V5 표현 여부를 미리 본다. source가 없으면 추정하지 않는다.
5. 필요한 문장만 `다른 문장`으로 교체한다.
6. 최종 요약을 확인하고 `과제 배정`을 누른다.
7. 새 SentenceSet을 저장한 다음 Assignment/Target 저장을 검증한다.

다중 학생과 그룹은 기존 `createAssignmentsBatchV2` 계약을 그대로 사용한다. 실제 학생 링크도 기존 학생 포털을 재사용한다.
