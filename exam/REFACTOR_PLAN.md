# 개별문제 페이지 구조 리팩터링 계획

## 1. 목표
- 교사 화면과 학생 화면의 책임을 분리해서 코드 가독성과 유지보수성을 높인다.
- 한 파일에 몰린 UI/상태/백엔드 통신/렌더링 로직을 역할별 파일로 나눈다.
- 이후 기능 추가(문항 단위 배정, 오답노트, 결과 분석 등)를 쉽게 붙일 수 있게 만든다.

## 2. 현재 문제점
- [exam/index.html](exam/index.html) 안에 교사 화면, 학생 화면, 업로드, 미리보기, 저장/조회, PDF 처리,
  끊어읽기 마킹 위젯, 폴더 문제은행(FolderBank, ~600줄) 로직이 모두 한 `<script>`에 섞여 있다(전체 2475줄).
- 같은 데이터(draft, exam, answers, times)를 여러 함수에서 서로 다른 방식으로 다루고 있다.
- UI 렌더링과 상태 변경이 뒤섞여 있어 버그 추적이 어렵다.

## 3. 목표 구조 — 파일 분리
이 앱은 `file://`로 더블클릭해서 여는 게 전제라 `type="module"`(ES import)은 로컬에서 CORS로
막혀서 못 쓴다. 그래서 옛날 방식 `<script src="...">` 여러 개를 순서대로 로드해서 전역을
공유하는 식으로 나눈다.

```
exam/
  index.html              HTML 뼈대 + <style> + <script src> 목록만
  js/
    utils.js              esc/uid/$/$all/toast/askConfirm/askPrompt/sleep/jsonpFetch/hookPost/elabNav/readImageCompressed
    sheetService.js        deliveryCfg/saveDelivery/myExams/saveMyExam (백엔드 설정 저장소)
    questionTypes.js       QUESTION_TYPE_GROUPS/classifyQuestionType
    pdfService.js          HEADER_PATTERNS/analyzePdf/buildQuestionImages/슬라이싱 헬퍼
    passageBank.js         끊어읽기 마킹 위젯(createPassageMarker) + FolderBank(문장은행) — 가장 큰 덩어리
    studentApp.js          StudentApp + SentenceStudentApp
    teacherApp.js           TeacherApp 셸 + 탭 6개(SentenceSubmissions/BoundaryEditor/Preview/Answer/Publish/Settings/Results) — 탭 간 draft 등 공유 상태가 많아 한 파일로 유지
    app.js                 appState/setAppState/renderMode/boot (제일 마지막 로드, 나머지를 엮음)
```

탭별 추가 분리는 필요해지면 나중에 진행(우선순위 낮음으로 보류).

## 4. 진행 순서 (위험도 낮은 순, 단계마다 검증 후 다음 단계)
1. **utils.js** — 의존성 없는 순수 헬퍼부터 분리. 교사/학생 화면 콘솔 에러 없는지 확인.
2. **sheetService.js** — 설정 탭 저장/조회 확인.
3. **questionTypes.js** — 정답입력 탭 유형 자동분류 확인.
4. **pdfService.js** — PDF 업로드→문항 자동분리 확인.
5. **passageBank.js** — 문장 마킹/폴더 관리 탭 전체 흐름 확인.
6. **studentApp.js** — 학생 응시(문항형+끊어읽기형) 전체 흐름 확인.
7. **teacherApp.js** — 교사 탭 6개 전체 흐름 확인.
8. **app.js** — `index.html`에서 인라인 스크립트 제거하고 `<script src>` 순서 배선 마무리.

각 단계는 "코드를 옮기기만 하고 로직은 안 바꾼다" 원칙. 단계마다 git diff로 순수 이동인지
확인 후 다음 단계로 넘어간다.

## 5. 구현 기준
- 화면 렌더링 함수는 상태만 받아서 HTML을 만들도록 한다.
- 상태 변경은 `setState()` 같은 단일 진입점으로 통제한다(`appState`/`setAppState`는 이미 도입됨).
- UI 이벤트는 직접 DOM 조작보다 작은 핸들러로 분리한다.
- 기존 기능은 먼저 유지한 채, 구조만 단계적으로 바꾼다.

## 6. 진행 상황
- [x] `appState`/`renderMode` 도입 (이전 세션에서 완료)
- [x] 1. utils.js
- [x] 2. sheetService.js
- [x] 3. questionTypes.js
- [x] 4. pdfService.js
- [x] 5. passageBank.js
- [x] 6. studentApp.js
- [x] 7. teacherApp.js
- [x] 8. app.js + index.html 정리
