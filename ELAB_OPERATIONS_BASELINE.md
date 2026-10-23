# ELAB public operations baseline

이 문서는 공개 저장소에 둘 수 있는 운영 원칙만 기록한다. 실제 배포 ID, 서비스 URL,
Spreadsheet 식별자, 계정 정보, 인증정보와 개인 연락처는 기록하지 않는다.

## Runtime configuration

- 정적 frontend가 사용하는 공개 Apps Script endpoint는 `shared/auth-config.js` 한 곳에서 관리한다.
- 교사용 token과 학생 capability는 source에 저장하지 않는다.
- 교사용 연결 설정은 각 브라우저의 기존 local storage 설정 계약을 유지한다.
- Apps Script의 비공개 운영 식별자는 Script Properties에서 관리한다.
- `.env`, clasp 인증 파일, service-account 파일과 credential JSON은 Git에 포함하지 않는다.

## Deployment

- frontend는 build 없는 정적 다중 페이지 사이트다.
- GitHub Pages workflow는 `.github/workflows/pages.yml`을 사용한다.
- Apps Script 배포 버전과 배포 식별자는 공개 문서에 기록하지 않는다.
- 배포 전 regression, `git diff --check`, secret·개인정보 검사를 수행한다.

## Data safety

- 학생 실명 대신 별칭 또는 내부 번호 사용을 원칙으로 한다.
- 실제 학생 데이터, 결과 export, Sheet 백업과 로컬 DB는 Git에 포함하지 않는다.
- Spreadsheet ID와 Sheet GID는 source에 하드코딩하지 않는다.
- 테스트 fixture에는 명시적인 테스트 이름과 더미 식별자만 사용한다.

## Recovery

- 운영 백업과 복구 절차는 접근 제한된 별도 운영 문서에서 관리한다.
- 공개 issue, commit message와 로그에 token, PIN, capability 또는 개인 데이터를 남기지 않는다.
- credential 노출이 의심되면 해당 credential을 폐기한 뒤 새 값으로 교체한다.
