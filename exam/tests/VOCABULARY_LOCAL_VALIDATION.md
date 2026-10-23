# 최종 어휘 3,200개 로컬 검증

## 범위

- 최종 입력: `outputs/vocab-final-3200/ELAB_운영용_정규어휘DB_3200.xlsx`
- 운영 staging: `vocab-import-1788704841156` (테스트에서 접근하지 않음)
- XLSX SHA-256: `9016fedba2d326a6385d2f5c31bbfdf31aa38696a3f23c3ea4fd2d22b2f7bdb5`
- 운영 배포, Google Sheet 접근, 운영 staging/commit은 수행하지 않는다.

## 수정·추가 파일

- `exam/sheet_backend.gs`: 어휘 목록 조회 함수만 변경
- `teacher/vocabulary-db.html`: 페이지 UI와 메모리 XLSX 검토 모드
- `exam/tests/vocabulary_db_integration.test.js`, `vocabulary_db_xlsx_ui.test.js`: 최종 XLSX 기준으로 기존 테스트 변경
- `exam/tests/vocabulary_final_xlsx.test.js`, `vocabulary_pagination.test.js`: 실제 파일·서버 페이지네이션 테스트 추가
- `exam/tests/helpers/final-vocabulary.js`, `local-only-browser.cjs`, `vocabulary-review-ui.cjs`: 최종 데이터 검증, 네트워크 격리, 실제 파일 UI 테스트
- `exam/tests/run-local.cjs`, `fetch-local-assets.cjs`: 회귀 실행기와 정적 라이브러리 준비
- `package.json`, `package-lock.json`: 기존 설치본과 일치하는 XLSX 테스트 의존성 및 실행 명령
- 이 문서: 실행 방법, 검증 범위, 알려진 한계

## 실행

프로젝트 루트에서 다음 명령을 실행한다. Windows PowerShell에서는 `npm.cmd`를 사용한다.

```powershell
npm.cmd run test:vocabulary
npm.cmd run test:local
```

전체 UI 회귀에 필요한 공개 정적 JS가 없을 때 한 번만 준비한다.

```powershell
node exam/tests/fetch-local-assets.cjs
```

이 준비 명령은 Tailwind, PDF.js, Tesseract의 공개 스크립트만 `output/local-test-assets`에 저장한다. 테스트 실행 자체는 외부 네트워크를 사용하지 않는다. Playwright 임시 브라우저에서 localhost 요청은 실제 서버 대신 로컬 파일로 응답하며, 시험용 API는 각 테스트의 메모리 fixture로 응답한다. 나머지 네트워크 요청은 차단한다. 기존 탭·프로필은 사용하지 않는다. 폰트 CSS는 시스템 폰트 대체 fixture를 사용하므로 웹폰트 렌더링 자체는 검증 범위가 아니다.

전체 결과는 `output/vocabulary-local-tests/results.json`, 선택 실행 결과는 `results-selected.json`, 개별 로그는 `<테스트파일>.log`에 저장한다. UI 캡처도 같은 폴더에 저장한다.

## 실제 XLSX 검증

`helpers/final-vocabulary.js`는 최종 파일을 실제로 읽는다. 다른 파일을 `ELAB_VOCAB_XLSX`로 지정하면 실패한다. 실행기는 이전 환경변수 경로를 지우고 최종 파일만 사용한다.

- 전체 3,200행, 고유 sense_id 3,200, 중복 0, 필수값 누락 0
- V1/V2/V3/V4/V5 = 800/800/800/600/200
- active TRUE 3,200 / curriculum_active TRUE 3,200 / archive_only FALSE 3,200
- confirmed_level 및 curriculum_level 범위·일치 확인
- molecule, cell 포함 / decorative art, deep down 제외
- primary와 additional이 함께 선택된 경우 primary가 뒤에 오는 사례 0

**primary 판정 기준:** 운영 XLSX에는 `is_primary`가 없다. 같은 최종 폴더의 `ELAB_전체기출_어휘마스터DB_최종.xlsx`, `StudentCurriculum3200`에서 sense_id로 `is_primary`를 연결하고, 실제 운영 XLSX의 행 순서를 비교한다. `sense_order=1`은 이 대표 뜻 표시와 같지 않다. 저장된 Validation 요약값을 그대로 믿는 테스트가 아니다.

추가 관측: 선택된 additional 17행은 해당 primary가 3,200개 안에 없다. 이는 필수 셀 누락이나 순서 역전과 다른 지표이며 `missing_primary`로 별도 출력한다. 기존 파일의 선정 결과를 그대로 검증하며 XLSX는 수정하지 않는다.

## 페이지네이션

`listVocabularyDbV1`은 인증 후 VocabularyDB만 한 번 일괄 읽고 필터 → 정렬 → 페이지 추출 순서로 처리한다. 시트 생성·헤더 보완 함수는 호출하지 않는다.

- 기본 limit 200, 범위 1~500
- page는 1부터, offset은 0부터
- offset 우선, 기존 cursor도 호환. 둘 다 없으면 `(page-1)*limit`
- 응답: items, total_count, total_pages, page, offset, limit, has_more
- 기존 total, next_cursor 응답 유지
- 모든 정렬의 최종 동률 기준은 sense_id
- UI는 200행씩 렌더링하며 필터·검색·정렬 변경 시 1페이지로 이동
- 늦게 도착한 이전 응답은 현재 목록을 덮어쓰지 못함
- 서버와 로컬 XLSX의 정렬·필터 방식 일치

안정적 정렬은 조회 중 데이터가 동일한 조건에서 중복·누락을 방지한다. 다른 사용자가 페이지 사이에 DB 자체를 수정하는 경우를 위한 서버 스냅샷 기능은 이번 범위에 포함하지 않는다.

## 로컬 검토 모드

1. `teacher/vocabulary-db.html`을 직접 열거나 기존 로컬 서버에서 연다.
2. 기본 상태는 노란색 **로컬 XLSX 검토 모드**다. 연결 설정이 있어도 자동 API 조회하지 않는다.
3. 최종 운영용 3,200 XLSX를 파일 선택으로 연다.
4. 전체·레벨별 통계, 검색, 필터, 이전/다음 페이지로 내용을 검토한다.
5. 서버 staging, 실제 반영, 수정, 세트 생성 버튼은 이 모드에서 비활성이다.
6. 새로고침하면 메모리의 파일 데이터는 사라진다.

**서버 DB 목록으로 전환**을 눌러야 설정된 서버에 조회한다. 파일을 새로 선택하면 다시 로컬 검토 모드가 된다. 페이지는 구 배포본의 cursor/total 응답도 해석하지만, 새 안정 정렬과 조회 전용 보장은 수정한 백엔드 코드에 대한 것이다. 이번 작업에서는 배포하지 않는다.

## 회귀 한계

최종 로컬 실행(2026-09-07): `node exam/tests/run-local.cjs` — **50개 중 49개 통과, 1개 실패**. 어휘 관련 5개 테스트는 모두 통과했다. 기존 고정 단어 세트, 과제 배정, 학생 시험, 결과 저장 회귀도 통과했다. 모바일 390px·데스크톱 1280px의 실제 XLSX 검토 및 서버 페이지 UI 테스트가 통과했고, 최종 XLSX 해시는 작업 전후 동일했다.

기존 `ui_0h1_e2e.js`는 삭제된 단어암기 `sessions` 탭을 클릭하므로 현재 화면에서 타임아웃된다. 현재 `vocab/index.html`의 탭은 `words`, `make`다. 해당 오래된 종합 테스트나 관련 운영 화면은 이번 어휘 DB 수정에 맞춰 임의 변경하지 않았다. 개별 어휘 세트·고정 세트·과제·시험·결과 테스트와 새 어휘 DB 테스트의 결과는 각 로그로 확인한다.
