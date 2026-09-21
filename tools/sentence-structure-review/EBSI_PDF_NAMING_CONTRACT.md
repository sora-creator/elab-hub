# EBSi 영어 기출 PDF 명명 계약

Canonical 문서는 프로젝트의 `docs/EBSI_PDF_NAMING_CONTRACT.md`이다. 이 파일은 기존 도구 경로 호환을 위한 안내 사본이며, 새 작업은 canonical 문서를 기준으로 한다.

적용 대상은 `ELAB_EBSI_PDF_ROOT`로 지정한 로컬 원본 영어 문제 PDF 라이브러리입니다. 파일 내용은 바꾸지 않으며, 확인 가능한 이름만 안전하게 정규화합니다.

## 표준 이름

- 학력평가 폴더: `MM월_고N_학평_기관`
- 평가원 모의평가 폴더: `MM월_고3_모평_평가원`
- 수능 폴더: `11월_고3_수능`
- 학력평가 문제: `YYYY_고N_MM월_학평_기관_영어_문제.pdf`
- 평가원 모의평가 문제: `YYYY_고3_MM월_모평_평가원_영어_문제.pdf`
- 수능 문제: `YYYY_고3_11월_수능_영어_문제.pdf`

월은 두 자리로 쓰고, 기관 표기는 교육청 소재지의 표준 명칭으로 통일합니다. 연도·학년·월·시험 유형·기관 중 하나라도 확정할 수 없으면 이름을 추측하지 않습니다.

## 안전 절차

1. 전체 폴더와 PDF를 읽기 전용으로 조사하고 크기와 SHA-256을 기록한다.
2. 기존 이름과 폴더 metadata가 충돌하면 PDF text layer에서 문항 heading과 corpus 문장의 exact 또는 whitespace-normalized exact 일치를 확인한다.
3. `OLD_PATH`, `PROPOSED_NEW_PATH`, 근거, 신뢰도, action이 포함된 계획을 먼저 만든다.
4. 대상 경로 중복과 기존 파일 충돌을 검사한다.
5. `SAFE_RENAME`만 적용하고 `REVIEW_REQUIRED`는 그대로 둔다.
6. 파일 rename 후 폴더를 rename한다. 실패하면 이미 처리한 rename을 역순으로 복구한다.
7. 작업 전후 PDF 수, 총 byte, 각 파일 크기와 SHA-256이 같은지 확인한다.
8. source manifest를 다시 만들고 sentence/question/page 매핑을 재검증한다.

## 매핑 계약

매핑 우선순위는 exact basename, normalized basename exact, 그리고 검증된 metadata + question heading + sentence exact 순입니다. 원본 시험지 후보가 이 마지막 검증을 통과한 경우에만 AINKA 자료보다 우선합니다. 교사가 이미 확정한 `teacher_source_pdf` provenance는 항상 최우선이며 자동 매핑으로 덮어쓰지 않습니다.

`YYYY학년도` 수능 표기, `_2` 중복 파일처럼 해석이 하나로 확정되지 않는 항목은 `REVIEW_REQUIRED`로 남깁니다. suffix를 임의로 붙이거나 가장 비슷한 파일을 선택하지 않습니다.
