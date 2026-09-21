# ELAB Local Teacher Gold Review Adapter V1

EBSi 원본 시험지의 폴더·파일 표준과 안전한 rename/매핑 절차는 프로젝트의 canonical 계약인 [docs/EBSI_PDF_NAMING_CONTRACT.md](../../docs/EBSI_PDF_NAMING_CONTRACT.md)를 따릅니다.

## PDF source manifest 갱신

Review 화면은 실행 중 디스크를 재검색하지 않고 `pdf-source-manifest.generated.js`만 조회합니다. PDF를 추가하거나 교체한 뒤 프로젝트 루트에서 다음 명령으로 읽기 전용 인벤토리와 manifest를 다시 생성합니다.

```powershell
node tools/sentence-structure-review/build-pdf-source-manifest.cjs
```

생성물은 `pdf-source-manifest.generated.json`(감사·통계용)과 `pdf-source-manifest.generated.js`(브라우저용)입니다. 확정 순서는 exact basename, 제한적인 normalized basename exact이며, year/grade/month/exam type만 맞는 파일은 `REVIEW_REQUIRED` 후보로만 기록합니다. 중복 basename도 자동 확정하지 않습니다. 파일 크기와 수정 시각이 포함되어 PDF 교체 후 stale 여부를 비교할 수 있습니다.

미연결 source에서 교사가 직접 선택한 PDF는 업로드되지 않으며 별도 로컬 IndexedDB에 `source_file` 단위로 보관됩니다. 따라서 같은 source의 다른 문장과 F5 후에 재사용됩니다. 이 mapping 저장소는 교사 annotation/Gold 저장소와 분리되어 있고 기존 검수 결과를 자동 변경하지 않습니다.

운영 ELAB와 분리된 로컬 교사 검수 도구입니다. 설치·빌드 없이 [index.html](index.html)을 브라우저에서 열 수 있으며, 원본 PDF 자동 연결까지 사용할 때는 아래 localhost 실행 방식을 권장합니다. 원본 JSON, 운영 HTML, Apps Script, SQLite를 수정하지 않습니다. PDF와 worker 연결은 현재 local origin/file/blob만 허용하며 외부 네트워크는 허용하지 않습니다.

## 시작

프로젝트 루트에서 최초 한 번 입력 snapshot을 준비합니다. 이 작업은 이번 구현에서 이미 실행했습니다.

```powershell
node tools/sentence-structure-review/prepare.cjs
```

`file://` 더블클릭도 지원하지만, 웹앱과 별도 EBSi PDF 라이브러리를 같은 origin으로 열려면 PowerShell에서 웹서버 루트를 `Desktop`으로 지정해 실행합니다.

```powershell
py -m http.server 8010 --directory "$env:USERPROFILE\Desktop"
```

Review Adapter 주소:

```text
http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/tools/sentence-structure-review/index.html
```

localhost 실행 중에는 local-only manifest의 `http_server_root` 아래에 있는 검증된 PDF 경로만 현재 HTTP origin의 URL로 변환합니다. 따라서 웹앱과 PDF 라이브러리를 모두 localhost URL로 열 수 있습니다. 각 경로 segment는 URL encoding하며 `#page=N`을 유지합니다. 서버 루트 밖의 경로는 추측해 열지 않고 화면에 매핑 오류를 표시합니다. teacher source provenance에는 변환 URL이 아니라 원래 Windows `pdf_path`가 계속 저장됩니다. 다른 위치를 쓰면 `ELAB_PDF_HTTP_ROOT`와 manifest 생성기의 `ELAB_EBSI_PDF_ROOT`를 설정합니다.

입력 Source of Truth는 `output/sentence-structure-pilot/PILOT_50_ANNOTATIONS.json`입니다. 준비 스크립트는 원본 SHA-256과 전체 데이터를 `output/sentence-structure-review/pilot-data.js`에 저장합니다. 기존 교사 export가 있으면 **절대 덮어쓰지 않습니다**. 입력을 임의로 변경한 경우 fingerprint가 다른 검수 파일은 가져오기를 거부합니다.

## 검수 순서

1. 왼쪽 대기열에서 문장을 고릅니다. PDF 텍스트 자동 대조 근거가 있는 12개는 `AUTO_SOURCE_CHECK_OK`로 먼저 보이며, 교사 확인으로 간주하지 않습니다. 나머지 38개는 `SOURCE_PENDING`입니다.
2. 왼쪽 **원본 PDF** 패널은 로컬에 포함한 pdf.js 3.11.174로 현재 source page 한 장만 렌더링합니다. `− / +`는 화면 맞춤 기준 50–300% 확대, **화면 맞춤**은 100%, **문장 위치**는 강조 문장으로 복귀합니다. 확대된 문서는 마우스로 끌어 가로·세로 이동할 수 있고, 일반 wheel은 세로 이동, Shift+wheel은 가로 이동, Ctrl+wheel은 PDF 확대/축소입니다. 원문 문장은 exact 또는 whitespace-normalized exact가 유일하게 성립할 때만 반투명 노란색으로 표시하고 자동으로 가운데에 둡니다. fuzzy/부분 일치는 사용하지 않으며 실패하면 명확한 문구와 **다시 찾기**를 표시합니다. **새 창에서 PDF 열기**도 보조 기능으로 유지합니다. 나머지 문장은 **원문 PDF 선택**으로 교사가 직접 로컬 파일을 고릅니다. page metadata가 없으므로 첫 페이지에서 문항을 직접 찾으며 가짜 page를 만들지 않습니다. 파일은 업로드되지 않고 브라우저 메모리에서만 열립니다.
3. 실제 PDF와 문장을 대조한 뒤 **PDF 확인 · 원문 일치**를 한 번 누릅니다. custom viewer의 렌더링·자동 강조 또는 새 창 열기는 PDF 열람으로만 기록되며 자동으로 source verified가 되지 않습니다. 교사가 확인 버튼을 명시적으로 눌렀을 때 한 atomic action으로 `pdf_visual_reviewed`, `teacher_source_pdf`, reviewed timestamp/method와 `TEACHER_SOURCE_VERIFIED`를 함께 기록합니다. 이전 2단계 UI에서 visual review만 저장된 상태도 버튼을 막지 않고 최종 확인으로 승격할 수 있습니다. PDF를 아직 열지 않은 클릭은 무시하지 않고 정확한 이유를 안내합니다. 원문이 다르면 이 버튼 대신 **원문 수정 필요**를 사용합니다. 수정하면 source/token 확인과 S/V·절·역할·Level 승인이 해제됩니다.
4. 상단의 고정형 **검수 진행** 패널에는 현재 영어 문장과 year/grade/month/question/Level metadata가 함께 표시되어 아래쪽 검수 중에도 계속 참고할 수 있습니다. 기본은 데스크톱 3줄·모바일 2줄이며 **전체 보기/접기**로 전환하고, 문장을 누르면 SOURCE 영역으로 돌아갑니다. 데스크톱에서는 패널 상단 손잡이를 마우스로 끌어 위치를 옮길 수 있습니다. 1단계 PDF 원문 확인이 끝나 2단계로 넘어가면 패널이 주어·동사구 영역을 가리지 않도록 왼쪽 PDF 열로 자동 이동하며, 이후 교사가 옮긴 위치는 현재 문장의 재렌더 동안 유지되고 다음 문장에서 초기화됩니다. 좁은 화면은 기존 sticky 배치를 유지합니다. 남은 항목을 누르면 해당 검수 영역으로 이동합니다. 각 필수 확인이 저장되면 현재 validator 순서에서 이미 완료된 항목을 건너뛰고 다음 미확인 영역으로 자동 이동하며, 해당 카드를 잠시 주황색으로 강조합니다. **학생이 찾을 주어**와 번호가 붙은 **학생이 찾을 동사구**를 확인한 뒤 **이 주어·동사구가 맞습니다**를 한 번 누르면 token 정렬과 해당 절을 함께 확인합니다. 각 항목의 수정 버튼을 누르면 공용 하단 편집기가 아니라 선택한 주절·관계절·부사절 등 해당 절 카드의 바로 아래에 `주어 수정 중`, `동사구 1 수정 중` 편집기가 열리고 해당 항목의 단어만 선택 표시됩니다. 다른 절을 선택하면 이전 편집기는 닫히고 새 절 아래로 이동합니다. 동사구 편집은 `teacher_predicates[]`의 선택된 한 항목만 변경하며 평면 legacy 합집합을 직접 편집하지 않습니다. 학생 동사구는 `has been studying`, `can solve`, `has been solved`, `wants to study`처럼 학생이 하나의 의미 단위로 파악할 전체 span입니다.
5. be+p.p. 후보가 있는 표현에만 형용사/수동태/애매함 선택 영역이 나타납니다. 후보는 be 뒤의 **비-be lexical past participle**입니다. 따라서 `have been dismissive`, `has been studying`, `has been happy`의 `been`은 후보가 아니며 UI와 Gold 확인 요구가 없습니다. `has been considered`는 `considered`, `could not be performed`는 `performed`가 판정 대상입니다.
6. 한국어로 표시된 **학습 요소**를 확인합니다. 각 항목에는 현재 교사 확인 annotation을 우선한 근거 phrase가 표시되고, 아직 절 확인 전이면 auto annotation 근거에 `시스템 추천`을 표시합니다. 근거를 누르면 원문의 해당 token만 노란색으로 강조되고 카드에는 `현재 보고 있는 근거`라고 표시됩니다. 노란색은 승인 상태가 아니라 현재 focus이며, 교사 확인 완료는 초록색으로 구분합니다. 저장된 span으로 연결할 수 없는 항목은 새 span을 추측하지 않고 `근거 확인 필요`로 표시합니다. 이 문장이 어려운 이유는 자동 Context 값을 읽기 쉬운 문장으로 요약합니다.
   **해석할 때 주의할 표현**은 Structure Skill과 별도인 선택 정보입니다. 상위 개념은 `INTERPRETATION_FEATURE`이고 하위 유형은 `DISCOURSE_ADVERB`, `PRONOUN_REFERENCE`, `CONTEXT_DEPENDENT_MEANING`, `NEGATION`, `COMPARISON`, `PHRASAL_VERB`, `IDIOM_EXPRESSION`, `QUANTITY_EXPRESSION`입니다. 기본 화면에는 각각 문맥 연결 부사, 대명사 지시 대상, 문맥 의존 의미, 부정 표현, 비교 표현, 구동사, 관용 표현, 수량 표현으로 표시합니다. 모든 항목은 실제 evidence token span을 가지며 클릭하면 해당 문장 근거를 강조합니다. 이 선택 정보는 Structure Level·Skill·Gold 조건을 바꾸지 않습니다.
7. **문장구조 난이도** S1~S5 중 하나를 누르면 선택 자체가 교사 확인으로 저장됩니다. 자세한 추천 근거와 복잡도 수치는 접힌 영역에 있습니다. `보류`를 고르면 기존 데이터는 남습니다.
8. 진행 패널의 필수 검수가 모두 완료되어 버튼이 활성화되면 **Gold 승인**을 누릅니다. canonical `GOLD_READY`와 IndexedDB 저장본 read-back이 모두 확인된 경우에만 650ms 동안 완료 메시지를 보여준 뒤 **미검수 다음** 정책으로 다음 문장을 렌더링하고 화면 맨 위의 PDF/원문 영역으로 이동합니다. 현재 필터에 다음 문장이 없으면 필터를 해제하고 전체 목록의 다음 미검수 문장으로 이어갑니다. `GOLD_READY`, `DEFERRED`, `REJECTED`는 건너뜁니다. 1차 Pilot 목표인 Gold 15개에 도달하면 자동 이동을 중단하고 완료 안내와 **검수 JSON 내보내기** 버튼을 표시합니다. 이 버튼은 운영 게시/DB import를 하지 않습니다.
9. **검수 JSON 내보내기**, **요약 내보내기**로 파일을 보관합니다. 브라우저 다운로드 위치는 브라우저 설정을 따릅니다. 권장 보관 폴더는 `output/sentence-structure-review/`입니다.

기본 화면에서는 내부 `predicate`, token index, finite/lexical/auxiliary, provenance, clause ID/parent/depth/range, Error Type, raw JSON을 숨깁니다. 이 값과 편집 기능은 화면 아래 **고급 분석 보기** 안에 그대로 유지됩니다.

한 문장을 되돌리는 버튼은 teacher draft만 초기화하고 이전 수정본을 해당 문장의 이력에 남깁니다. 전체 50개 reset은 없습니다. `REJECTED`도 삭제하지 않습니다.

## 초기 파일과 실제 교사 결과 구분

`prepare.cjs`가 처음 만든 `sentence-structure-pilot50-review.json`과 `sentence-structure-pilot50-summary.md`는 **미검수 초기 초안**입니다. 출처 근거 12개, 교사 원문 확인 0개, Gold 0개입니다. 파일 이름과 무관하게 승인 상태를 자동 생성하지 않습니다. 교사가 실제 검수한 뒤 브라우저에서 새 파일로 내보내야 합니다.

자동 저장은 원본 fingerprint별 고정 IndexedDB(`elab.teacher-review.indexeddb.v1.<fingerprint>`)의 `sentence_reviews` store에 문장 ID별 teacher overlay와 history만 기록합니다. immutable Pilot `auto`는 저장본에 중복하지 않고 F5 시 파일 baseline을 만든 뒤 IndexedDB teacher overlay를 검증·병합합니다. 각 교사 action은 IndexedDB transaction 완료와 read-back teacher-state 일치 확인 뒤에만 성공으로 표시하며, 실패하면 메모리 변경도 직전 상태로 되돌립니다.

이전 버전의 `elab.local.teacher-gold-review.v1.<fingerprint>` localStorage 저장본이 있고 IndexedDB 저장본이 아직 없으면 시작 시 자동으로 형식과 fingerprint를 검증하고, IndexedDB write/read-back 및 teacher/history exact comparison을 거쳐 비파괴 이관합니다. 기존 localStorage 키와 값은 fallback backup으로 그대로 남기며 자동 저장이 이 키를 다시 쓰거나 삭제하지 않습니다. 화면 아래 `로컬 검수 저장: 정상/오류`에서 현재 저장 상태를 확인할 수 있습니다. 정상 자동 저장도 최종 JSON 백업을 대신하지 않습니다.

## 출력 계약

루트:

```text
format: ELAB_SENTENCE_TEACHER_REVIEW_V1
review_version: 1
input_fingerprint: SHA-256 of original input bytes
input_path, created_at, exported_at
publish_allowed: false
records[50]
```

문장 record:

```text
sentence_id
auto: original Pilot record in full, immutable
teacher:
  original_extracted_text
  teacher_corrected_text (null or separate revision text)
  teacher_tokens (whitespace tokens + char offsets)
  teacher_clauses[]:
    clause_id
    auto_subject_indexes, auto_verb_indexes, auto_finite_carrier_indexes
    teacher_type, teacher_parent, teacher_depth, teacher_start, teacher_end
    teacher_subject_indexes
    teacher_predicates[] (Gold canonical source):
      predicate_id, predicate_order, source_auto_predicate_id
      auto_student_verb_span_indexes, teacher_student_verb_span_indexes
      auto_finite_carrier_indexes, teacher_finite_carrier_indexes
      auto_lexical_verb_indexes, teacher_lexical_verb_indexes
      auto_auxiliary_indexes, teacher_auxiliary_indexes
      auto_nonfinite_complement_indexes, teacher_nonfinite_complement_indexes
      auto_be_pp_candidate_index, auto_be_pp_classification, auto_be_pp_reason
      auto_predicate_structure
      teacher_be_pp_classification, teacher_be_pp_verified
    teacher_verb_indexes, teacher_finite_carrier_indexes (legacy compatibility unions)
    teacher_verified, exception_type, exception_reason, feature_error, review_note
  teacher_verb_roles[]:
    index, auto_role, auto_subtype, teacher_role, teacher_nonfinite
  teacher_skills, teacher_error_types, teacher_context_features
  interpretation_features[]:
    type, evidence_token_indexes, evidence_text
    source: AUTO | TEACHER
    teacher_removed
  teacher_level, teacher_level_reason, instructional_value
  source_note, review_note, reviewed_at, revision
  auto_source_check_ok, auto_source_check_origin, pdf_visual_reviewed
  source_verified, source_verification_origin, teacher_source_confirmed
  teacher_source_pdf:
    pdf_reference, pdf_path or local_reference
    page, page_status, question_no, reviewed_at
    review_method: TEACHER_VISUAL_PDF_REVIEW
  token_verified, roles_verified, skills_verified, errors_verified
  context_verified, level_verified, disposition, gold_approved
history[]: timestamp, revision, action, before, after
review_status: derived, not trusted as an imported permission
gold_validation_errors[]
```

원본 `auto`에는 `auto_level_candidate`, proposed level, source, parser tokens, parser S/V, context, complexity, 오류 후보가 모두 남습니다.

`auto_source_check_ok`는 기존 PDF 텍스트 자동 대조 근거이고 `source_verified` / `teacher_source_confirmed`는 실제 PDF를 본 교사의 확인입니다. `AUTO_SOURCE_CHECK_OK ≠ TEACHER_SOURCE_VERIFIED`이며 Gold에는 후자와 `teacher_source_pdf` provenance가 필요합니다. 이전 버전 검수 JSON에 PDF 열람 provenance가 없으면 import 시 기존 원문 확인을 교사 확인으로 승격하지 않고 해제합니다. Level이나 구조를 바꾸면 관련 확인 상태가 해제됩니다. `review_status`나 `gold_approved`만 바꿔서는 validation을 통과할 수 없습니다.

Gold 동사 정답의 canonical source는 `teacher_predicates[]`입니다. `teacher_verb_indexes`와 절 단위 `teacher_finite_carrier_indexes`는 기존 소비자를 위한 compatibility field이며, 각각 모든 predicate의 교사 span/finite 배열을 중복 제거한 합집합으로 항상 동기화됩니다. 병렬 predicate의 경계와 순서는 이 평면 필드가 아니라 `predicate_id`와 `predicate_order`로 보존합니다.

## Validation과 계산의 범위

- 50개 ID와 원본 annotation을 보존하고, import 시 baseline과 대조합니다.
- MAIN S와 1개 이상의 predicate는 필수이며 각 required predicate에는 학생 해석 동사구 span이 필요합니다. 종속절의 빈 S에는 목록에 있는 exception과 명시적인 이유가 필요합니다.
- predicate ID·순서·token 범위·auto provenance를 검사합니다. 실제 be+p.p. candidate에만 `teacher_be_pp_verified=true`를 요구합니다.
- `[이 주어·동사구가 맞습니다]`는 화면의 canonical 주어와 모든 동사구 및 token 정렬을 한 번에 확인하며, be+p.p. 판정과 독립적입니다. 주어·동사구·predicate를 수정하면 해당 절 확인이 다시 필요합니다.
- be+p.p. 후보는 형용사/수동태/애매함 중 하나를 선택하는 즉시 분류와 `teacher_be_pp_verified=true`를 한 이력 작업으로 저장합니다. 이 판정은 이미 확인한 주어·동사구를 다시 미확인으로 만들지 않습니다.
- token 정수·범위·중복·S/V 배타성, parent 존재·순환·depth·부모 범위를 검사합니다.
- 원문/token 정렬, V/carrier 역할, Skill/Error/Context의 자료형을 검사합니다.
- 모든 절의 주어·동사구, Skill, Level, 교사 원문 확인, 필요한 be+p.p. 확인, ACTIVE 상태가 Gold의 조건입니다.
- Gold 조건이 남아 있으면 승인 버튼을 비활성화하고 고정형 진행 패널에 남은 교사 작업 수와 사람이 읽을 수 있는 항목을 표시합니다. 각 항목은 해당 영역으로 이동하며, 내부 검증 오류의 clause/predicate ID나 `token alignment` 표현은 기본 교사 화면에 직접 노출하지 않습니다.
- 난이도 영역은 S1 핵심 골격, S2 수식·동사구 확장, S3 기본 종속절, S4 다중·중첩절, S5 통합 고난도 안내와 annotation 기반 추천 이유를 표시합니다. S1~S5 선택은 별도 확인 버튼 없이 `teacher_level`과 `level_verified`를 한 이력 작업으로 기록합니다.
- 역할·Error Type·Context는 자료형과 provenance 검증을 계속하지만 별도의 확인 버튼 클릭은 Gold 필수 조건이 아닙니다. 학생 정답이 아닌 분석 metadata이기 때문입니다.
- Interpretation Feature는 문장구조와 별도 축이며 확인·추가·제거 여부가 Gold나 S1~S5에 영향을 주지 않습니다. `QUANTITY_EXPRESSION`은 수량과 `more` 및 명사를 하나의 의미 단위로 읽어야 하는 경우이며, 자동 후보는 parser가 숫자/수량과 뒤 명사를 명확히 확인한 제한 패턴만 허용합니다.
- `feature_error`가 있으면 Gold를 보류합니다. 읽기 전용 complexity는 교사 token/range/role로 계산하며, 기존 parser 수치와 구분합니다.

V1은 구조 제약을 검증합니다. 영어 문법 정답을 판정하지는 않습니다. 누락된 절, 분사/형용사, there, 절 주어 등은 교사가 확인해야 합니다. parent 변경 시 depth를 보조 갱신하지만, 범위나 예외의 의미를 자동 수정하지 않습니다.

## Tests

```powershell
node --test tools/sentence-structure-review/core.test.cjs
node tools/sentence-structure-review/browser.test.cjs
node tools/sentence-structure-review/localhost-pdf.test.cjs
node tools/sentence-structure-review/gold-pilot.test.cjs
node tools/sentence-structure-review/sticky-sentence.test.cjs
git diff --check
```

브라우저 테스트는 기존 Node Playwright와 로컬 `.pw-browsers`를 사용하고, 격리된 headless context에서 `file://`를 엽니다. IndexedDB 문장별 저장/read-back, 기존 localStorage 자동 이관과 원문 보존, 강제 IndexedDB 실패 rollback, localStorage를 실제 quota까지 채운 뒤 Gold 저장, F5·탭 재개방·JSON roundtrip을 포함합니다. Python Playwright가 이 환경에 없어 기존 프로젝트의 Node 환경을 사용했습니다. HTTP를 차단하며, 테스트용 승인을 실제 교사 결과에 합산하지 않습니다. `output/sentence-structure-review/tests/SYNTHETIC_TEST_ONLY_reviewed.json`은 테스트 증거이며 실제 Gold가 아닙니다.

DB adapter, 운영 import, 학생 화면, Google Sheets, Apps Script, commit/push/deploy는 이번 작업 범위에 포함하지 않습니다.
