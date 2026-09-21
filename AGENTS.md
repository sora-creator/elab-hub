# 통합 웹앱 — 단어암기 · 시험보기 · 문법학습

## 개요
학생 학습 흐름(단어암기 → 시험보기 → 문법학습)에 맞춰 기존에 따로 있던 세 도구를
하나의 사이트 밑에 모은 허브. **빌드 도구 없음** — 세 모듈 다 원래부터 zero-build
단일 HTML 앱이었고, 이 관습을 그대로 유지한 채 폴더만 나눠서 정적 다중 페이지
사이트로 합쳤다(Vite/SPA 같은 빌드 파이프라인은 도입하지 않음 — 각 모듈을 Codex
Code로 직접 열어 수정하는 지금 작업 방식과 안 맞고 얻는 것도 적음).

**⚠️ 내부 링크는 항상 실제 파일까지 정확히 적을 것**(`./vocab/`✗ → `./vocab/index.html`✓):
GitHub Pages나 로컬 `http.server`는 폴더 링크를 열면 자동으로 그 폴더의 `index.html`을
찾아주지만, **`file://`로 더블클릭해서 열 때는 그 자동 처리가 없어서 폴더 안 파일
목록(색인)이 그대로 뜬다.** 이 앱은 서버 없이 더블클릭으로도 열리는 걸 전제로 하므로
새 모듈/링크를 추가할 때마다 이 점을 반드시 지킬 것.

시험 PDF/폴더의 생성·정리·rename 작업은 `docs/EBSI_PDF_NAMING_CONTRACT.md`를 따른다.

## 구조
```
통합 웹앱/
├── index.html              허브(교사 홈) — 카드 4개(단어암기/시험보기/문법학습/학생관리)
├── vocab/index.html        단어암기 (원본: VocaTest/index.html, 복사본 — 원본이 라이브라 그대로 둠)
├── exam/index.html         시험보기 (원본: 모의고사 시험보기 프로그램/, 이동함 — 원래 폴더는 비어 있음)
├── exam/sheet_backend.gs   허브 백엔드(Google Apps Script) — 시험보기 + 문법학습 공유 + 학생 로스터/배정까지 전부 여기서 처리
├── exam/AGENTS.md          (시험보기 모듈 자체 설계 문서, 그대로 이동)
├── grammar/index.html      문법학습 (원본: 모의고사 문법분석 프로그램/mockexam_tool.html, 복사본 + 학생용 화면 추가)
├── grammar/여기에 PDF 끌어놓기.bat   spaCy 정확 태깅용 드래그앤드롭 런처
├── grammar/exams.db        문법 태깅 결과가 쌓이는 SQLite (파이썬 파이프라인 전용)
├── grammar/mockexam_db/    spaCy 태깅 파이썬 파이프라인 전체(ingest/export_json/drop_ingest 등) —
│                           원래 `모의고사 문법분석 프로그램/` 안에 있었는데 그 폴더를 나중에
│                           통째로 지울 예정이라 여기로 옮겨옴. 예전엔 Windows 정션으로
│                           `mockexam_db`라는 이름을 붙여썼는데, 이번에 아예 **폴더 이름 자체를
│                           `mockexam_db`로** 만들어서 정션 없이도 `from mockexam_db import ...`가
│                           되게 정리함(정션 제거함, 더 이상 어디에도 없음)
├── teacher/students.html   학생 관리(교사 전용) — 로스터 + 학생별 배정
├── teacher/dashboard.html  통합 대시보드(교사 전용) — 단어+시험 결과 한 화면, 학생 필터
└── student/index.html      학생 접속 포털 — 이름+PIN → 배정된 3개 카드
```

## 교사 화면 vs 학생 화면
- **교사 화면**: `index.html`(허브), `vocab/`, `exam/`(세션 없이 열면), `grammar/`(`?study=` 없이 열면), `teacher/students.html`. 전부 교사 본인 브라우저에서 씀.
- **학생 화면**: `student/index.html`(이름+PIN 포털), `vocab/?session=...`, `exam/?session=...`, `grammar/?study=...`. 전부 링크를 통해서만 들어가고 교사용 관리 UI가 전혀 안 보임.
- 학생들에게는 **`student/` 주소 하나만** 공유하면 됨(반 전체가 같은 링크를 쓰고 이름+PIN으로 자기 걸 찾음). 개별 모듈 링크(`vocab/?session=...` 등)는 `teacher/students.html`에서 배정해두면 학생 포털이 대신 안내해줌.

## 왜 페이지 이동/복사가 다른가
- **vocab**: `VocaTest`는 지금 실제 학생이 쓰는 라이브 서비스(GitHub Pages)라 원본을
  건드리지 않고 **복사**만 했다. 통합 사이트를 배포하기 전까지는 기존 라이브 링크가 그대로
  살아있다.
- **exam**: 아직 아무도 안 쓰고 있어서 원본을 통합 폴더로 **이동**했다. 원래
  `모의고사 시험보기 프로그램/` 폴더에는 새 위치를 알리는 `README_MOVED.txt`만 남겨둠.
- **grammar**: 처음엔 `mockexam_tool.html`만 복사하고 파이썬 CLI는 원본 폴더에 남겨뒀었지만,
  사용자가 "`모의고사 문법분석 프로그램` 폴더를 나중에 통째로 지울 것"이라고 해서 파이썬
  파이프라인(`ingest.py`/`export_json.py`/`drop_ingest.py`/`db.py`/`extract.py`/`tagger.py`/
  `regex_tagger.py`/`spacy_tagger.py`/`verbs.py`/`query.py`)과 `exams.db`를 전부
  `grammar/mockexam_db/`, `grammar/exams.db`로 **이동**했다. 이제 `모의고사 문법분석
  프로그램/` 폴더는 (원본 `mockexam_tool.html`/`core.js`/`test_node.js`만 남아있고) 아무
  의존성 없이 **삭제해도 안전**하다. `모의고사_프로그램`(문제은행 태깅 프로그램)은 애초에
  이번 통합 대상이 아니었어서 지워도 ELAB에 영향 없음.
- **exams.db 위치 관련 실수 기록**: 이관 작업 중 처음엔 `모의고사 문법분석 프로그램/exams.db`
  (안 쓰이던 옛 파일, 0~소수 문장)를 옮겼다가, 실제 `ingest.py`가 쓰던 DB는 스크립트 위치
  기준 계산(`dirname(dirname(__file__))`) 때문에 사실 `프로그램/exams.db`(루트, 196+155
  문장 실데이터)였다는 걸 뒤늦게 발견해서 바로잡았다. **파일 경로를 계산으로 구하는 코드는
  겉보기 폴더 구조만 보고 옮기면 안 되고, 실제로 import해서 값을 찍어보고 확인해야 함.**

## 모듈 간 데이터 공유
콘텐츠 자체(단어장, 시험 이미지, 문법 문장 DB)는 여전히 모듈별로 독립적 — 자동 연동 없음,
교사가 직접 보고 판단(요구사항 그대로 유지). 다만 **"학생 로스터/배정"과 "시험보기+문법학습의
학생 공유 백엔드"는 하나로 합쳤다** — `exam/sheet_backend.gs` 하나가 다음 4곳에서 공유됨:
- `exam/index.html` (시험 게시/응시/결과)
- `grammar/index.html` (문법 문장 세트 공유/조회)
- `teacher/students.html` (학생 로스터 + 배정 저장/조회)
- `student/index.html` (이름+PIN으로 배정 조회)

각 페이지가 이 백엔드에 저장하는 localStorage 키: `mockexam.delivery`(exam),
`grammarhub.delivery`(grammar), `hub.delivery`(teacher/students.html, teacher/dashboard.html),
`vpang.delivery`(vocab — VocaTest 원래 키 그대로) — 값(url+token)은 전부 같은 웹훅을
가리키게 등록해야 서로 연동됨.

### vocab(VocaTest) 연동 — "선택 기능"으로 얹은 이유
VocaTest는 이미 라이브로 쓰이던 앱이라 **기존 동작(링크 만들어서 교사가 직접 공유)을 절대
깨지 않는 것**이 최우선이었다. 그래서 허브 연동은 전부 "웹훅이 허브 백엔드를 가리킬 때만
추가로 동작하는" 형태로 넣었다:
- **학생 선택 드롭다운**(`loadRosterInto`): 테스트 만들기 탭에서 `listStudents` 조회를
  시도해 성공할 때만 `#t-roster-wrap`을 보여줌. 실패/미설정이면 드롭다운 자체가 안 뜨고
  기존 자유입력 `#t-student`만 남음.
- **자동 배정**(`autoAssignVocab`): 단일 링크 생성 직후 `saveAssignment`를 단어 필드만
  담아 호출. 실패해도 무시(링크는 이미 만들어졌고 복사해서 보내는 기존 경로는 그대로).
  폴더별 다중 링크(perFolder) 경로는 "어느 링크가 그 학생 배정인지" 모호해서 제외함.
- **결과 전송**: `sendResult`가 보내는 body에 `action:'submitVocabResult'`만 추가됨.
  예전 VocaTest 전용 개인 Apps Script는 모르는 필드를 무시하므로 하위호환 유지.

**중요**: 백엔드의 `handleSaveAssignment_`는 **전달된 필드만 갱신하는 merge 방식**이어야
한다. vocab은 단어 필드만 보내고 `teacher/students.html`은 보통 전체를 보내는데, 덮어쓰기
방식이면 서로의 배정을 지워버린다.

### 시험보기 "문항 단위 배정"
`teacher/students.html`에서 학생에게 시험을 배정할 때 문항 번호(예: `30,31`)를 지정하면,
그 시험 링크에 `&nums=30,31`이 붙는다. `exam/index.html`의 학생 화면이 이 파라미터를
그대로 서버(`fetchExam`/`submitResult`)에 전달하면, 서버가 `Exams` 시트의
`questionNumsJson`을 기준으로 해당 문항만 골라서 내려주고 채점도 그 부분집합 기준으로 한다
— 프론트의 1문항씩 렌더링 로직은 전혀 안 바뀜(서버가 이미 걸러진 목록을 주기 때문).

### 문법학습 학생 공유
`grammar/index.html`에서 교사가 문법 태그로 검색한 뒤 "🔗 학생에게 공유"를 누르면 그
결과 문장들이 `GrammarSets` 시트에 저장되고 `?study=SETKEY&hook=...` 링크가 나온다. 이
링크로 들어가면(학생 화면) 검색/업로드 UI는 전혀 안 보이고 배정된 문장 목록만 읽기전용으로
보여준다.

## 경로가 왜 그대로 동작하는가
vocab·exam 모듈은 링크를 `location.origin + location.pathname`으로 만들기 때문에
서브폴더(`vocab/`, `exam/`)로 옮겨도 코드 수정 없이 그대로 동작한다(각자 자기 폴더
기준으로 링크가 만들어짐). grammar 모듈은 pdf.js를 CDN에서 불러오고 나머지는
localStorage만 쓰므로 폴더 위치와 무관하게 동작한다.

## 남은 일
- 실제 GitHub Pages 배포 전환은 아직 안 함 — 지금은 로컬에서 `index.html`을 정적
  서버로 띄워서 확인하는 단계. VocaTest의 라이브 링크를 이 통합 사이트로 언제 옮길지는
  사용자가 결정할 일(사용자가 "완성되고 나서 제일 마지막에 한 번만" 하기로 함).
- 통합 대시보드(`teacher/dashboard.html`)는 **단어암기 + 시험보기 결과만** 모아 봄.
  문법학습은 "읽기 자료"라 점수/결과 개념이 없어서 아직 대시보드에 안 들어감(나중에
  "확인함" 체크 같은 걸 넣으면 추가 가능).
- `exam/sheet_backend.gs`를 실제로 재배포해야 이번에 추가된 기능(문항 단위 배정, 문법
  공유, 학생 로스터)이 동작함 — Apps Script 코드라 이 세션에서 직접 실행/배포는 불가능,
  사용자가 "배포 관리 > 새 버전"으로 재배포 필요.
