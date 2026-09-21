# EBSi PDF/FOLDER NAMING CONTRACT

이 계약은 ELAB Sentence Structure Source Mapping에서 사용하는 EBSi 영어 기출 원본의 폴더·파일 이름 표준과 안전한 정리 절차를 정의한다.

## 1. 표준 폴더 구조

```text
EBSi_영어기출_2021-2026/
└─ 고1 / 고2 / 고3/
   └─ YYYY/
      └─ 시험폴더/
```

## 2. 표준 시험폴더 이름

- 교육청 학력평가: `MM월_고N_학평_기관`
- 평가원 모의평가: `MM월_고3_모평_평가원`
- 수능: `11월_고3_수능`

예: `03월_고1_학평_서울`, `09월_고2_학평_인천`, `06월_고3_모평_평가원`.

## 3. 표준 PDF 이름

- 교육청 문제: `YYYY_고N_MM월_학평_기관_영어_문제.pdf`
- 교육청 해설: `YYYY_고N_MM월_학평_기관_영어_해설.pdf`
- 평가원 문제: `YYYY_고3_MM월_모평_평가원_영어_문제.pdf`
- 수능 문제: `YYYY학년도_수능_영어_문제.pdf`

문제와 해설은 파일명에서 반드시 구분한다. 자료 성격이 불명확하면 이름만 보고 자동 결정하지 않는다.

## 4. 기관명 표준

표준 display는 `서울`, `부산`, `인천`, `경기`, `평가원`을 사용한다. `서울시`, `서울교육청`, `전국연합학력평가`처럼 같은 기관이나 시험을 나타내는 표현은 실제 시험 metadata가 확인된 경우에만 표준 display로 바꾼다.

## 5. 월 표기

월은 반드시 두 자리로 쓴다: `03월`, `04월`, `05월`, `06월`, `07월`, `08월`, `09월`, `10월`, `11월`.

폴더 앞 월, 파일명 월, 내부 시험월이 충돌하면 PDF text layer의 시험 표제와 시행 정보를 Source of Truth로 사용한다. OCR이나 filename 추측으로 결정하지 않는다.

## 6. Source of Truth와 충돌 정책

이름보다 실제 PDF 내부 시험 표제, 연도, 학년, 시행월, 기관, 문제/해설 구분을 우선한다. text layer로 확인할 수 없거나 동일 시험 후보가 둘 이상이면 `REVIEW_REQUIRED`로 남긴다. `(1)`, `copy`, `old`, `new` 같은 suffix를 자동 생성하거나 중복 파일을 자동 삭제·병합하지 않는다.

## 7. Rename 정책

- `SAFE_RENAME`: metadata와 대상이 유일하고 새 경로 충돌이 없으며, text layer 근거가 필요한 충돌은 내용 확인까지 완료된 경우에만 적용한다.
- `REVIEW_REQUIRED`: metadata가 불완전하거나 충돌·중복·학년도 해석이 남은 경우 적용하지 않는다.
- 기본 작업은 dry-run rename plan이다. 명시적인 apply 단계에서 `SAFE_RENAME`만 같은 parent 안에서 이름을 바꾼다.
- PDF 내용 수정, 삭제, 이동, 중복 자동 삭제, corpus/DB 수정은 하지 않는다.
- rename 전후 PDF 수, 전체 byte, 개별 size와 SHA-256, OLD path 부재와 NEW path 존재를 검증한다.

## 8. Sentence Structure Source Mapping

매핑 우선순위는 다음과 같다.

1. `EXACT_BASENAME`
2. `NORMALIZED_BASENAME_EXACT`
3. Naming Contract metadata: year + grade + actual exam month + exam type + institution
4. question number 확인
5. sentence exact 또는 whitespace-normalized exact 확인

metadata만으로 `MATCHED`를 확정하지 않는다. metadata 모순이 없고, question heading과 문장이 같은 PDF에서 exact하게 확인되며, 동급 후보 중 유일할 때만 `CONTENT_VERIFIED`를 허용한다. fuzzy/semantic matching은 금지한다.

동일 시험의 AINKA 자료와 원본 문제지가 모두 content 검증되면 새 미검수 문장은 `ORIGINAL_EXAM`을 우선한다. 이미 교사가 확정한 `teacher_source_pdf` provenance와 Gold 결과는 자동 매핑으로 덮어쓰지 않는다.

앞으로 PDF나 폴더를 추가하거나 이름을 정리할 때도 이 계약을 재사용한다.
