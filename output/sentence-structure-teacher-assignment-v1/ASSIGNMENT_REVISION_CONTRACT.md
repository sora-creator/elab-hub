# Assignment Revision Contract V1

현재 Attempt는 assignment content/config snapshot을 완전하게 보존하는 revision 구조가 아니다. 따라서 V1은 revision을 자동 생성하지 않는다.

- Low risk: `title`, `due_at` — 시작 뒤에도 허용
- Medium risk: `hint_level`, `reading_support` — 시작 뒤 차단
- High risk: sentence set/list/order — 시작 뒤 차단
- Content edit eligibility: 활성 Target이 모두 `NOT_STARTED`이고 연결된 Attempt가 0개일 때만 true
- Pre-start sentence edit: 새 immutable SentenceSet 생성 후 Assignment의 `content_ref_id`와 `content_link`를 함께 변경
- Post-start content edit: `assignment started`로 거부

향후 시작 뒤 콘텐츠 변경이 필요하면 AssignmentRevision과 Attempt snapshot을 별도로 설계해야 한다.
