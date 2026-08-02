# mockexam_db — 문법학습(spaCy) 파이썬 파이프라인

ELAB의 **문법학습** 모듈이 "정확한 방법(spaCy)"으로 쓰는 백엔드 파이프라인. 원래
`모의고사 문법분석 프로그램` 폴더에 있던 것을 그 폴더가 나중에 삭제될 걸 대비해서
통합 웹앱 안(`grammar/mockexam_db/`)으로 통째로 옮겨왔다 — 이제 이 폴더 밖에는
아무것도 의존하지 않는다(예전에 쓰던 Windows 정션도 제거함).

## 파일
- `db.py`, `extract.py`, `verbs.py`, `regex_tagger.py`, `spacy_tagger.py`, `tagger.py` — 추출/태깅 로직
- `ingest.py` — PDF → `../exams.db`에 태깅해서 저장 (`--export-json`으로 바로 JSON까지 뽑기 가능)
- `export_json.py` — 이미 저장된 회차를 ELAB가 가져올 JSON으로 내보내기
- `query.py` — 터미널에서 직접 검색해보는 보조 도구(ELAB 자체 동작에는 필요 없음)
- `drop_ingest.py` — `../여기에 PDF 끌어놓기.bat`가 호출하는 실제 처리 스크립트
  (파일명에서 연/월/학년 자동 인식)
- `verify_claude.py` — Claude API로 애매한 태깅을 재검증하는 **수동 전용** 도구
  (아래 "정확도 개선" 참고, ingest.py/drop_ingest.py 등 자동 흐름에서는 절대 호출 안 함)
- `grammar_gui.pyw` — 터미널 명령어 없이 마우스로 PDF 분석 + Claude 검증을 하는 화면(GUI)

## GUI로 쓰기 (터미널 명령어 안 치고 싶을 때)
`mockexam_db/grammar_gui.pyw`를 더블클릭하면 창이 뜹니다(콘솔 창 없이 pythonw로 실행).
- **① PDF 분석 (spaCy) 탭** — PDF를 선택하면 파일명에서 연/월/학년을 자동 인식하고,
  "분석해서 저장하기"를 누르면 `여기에 PDF 끌어놓기.bat`/`drop_ingest.py`와 똑같이
  `exams.db`에 저장 + ELAB용 JSON을 만들어줌. 드래그앤드롭 bat는 그대로 남아있으니
  편한 쪽을 쓰면 됨.
- **② Claude 검증 탭** — 저장된 회차를 드롭다운에서 고르고 버튼만 누르면
  `verify_claude.py`가 실행됨. API 키는 "설정"에서 한 번만 입력하면
  `mockexam_db/gui_config.json`에 저장돼서 다음부턴 안 물어봄(이 컴퓨터에만 저장,
  공유 컴퓨터라면 주의).

## 정확도 개선: 판정 불일치 표시 + Claude 검증(수동)
- `ingest.py`가 spaCy로 태깅할 때, 같은 문장을 regex로도 한 번 더 돌려서 **두 방식의
  판정이 갈리는 태그**를 `tag_disagreements` 테이블에 기록한다(둘 다 있다/둘 다 없다는
  일치이므로 기록 안 함). `export_json.py`가 이걸 각 문장의 `disagreements` 필드로
  내보내면, ELAB 문법학습 화면에 "⚠️ 판정 불일치" 배지로 뜬다 — 교사가 그 문장만
  골라서 눈으로 확인하면 된다.
- 더 확실하게 확인하고 싶으면 `verify_claude.py`를 **직접 실행**해서 Claude에게
  물어볼 수 있다(자동으로는 절대 안 돎):
  ```bash
  export ANTHROPIC_API_KEY="sk-ant-..."
  python -m mockexam_db.verify_claude --year 2025 --month 9 --grade 고2
  # 특정 태그만: --tag relative_clause
  # 판정 불일치가 아닌 것까지 전체 검증(비용 큼): --all
  # 이미 검증된 것도 다시: --recheck
  ```
  기본은 `tag_disagreements`에 있는(즉 애매한) 문장만 검증해서 비용을 아낀다. 검증
  결과는 `tag_claude_verification`에 저장되고, 같은 (문장, 태그) 조합은 다음 실행 때
  자동으로 건너뛴다(`--recheck` 없이는 API를 다시 안 부름). `export_json.py`가
  검증 결과를 `claudeVerified` 필드로 내보내면 ELAB에 "✅ Claude 확인" 배지로 뜬다.

## 데이터베이스 위치
`exams.db`는 이 폴더가 아니라 **한 단계 위**(`grammar/exams.db`)에 있다 — 각
스크립트가 자기 위치 기준으로 경로를 계산하기 때문(`os.path.dirname(os.path.dirname(...))`).
폴더째로 옮기면 이 상대 위치 관계만 유지하면 된다.

## spaCy 설치 (한 번만, 이미 되어 있으면 생략)
```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# 확인 -- "spacy"라고 나오면 성공
python -c "from mockexam_db import tagger; print(tagger.backend_name())"
```
위 확인 명령은 **이 폴더의 부모 폴더**(`grammar/`)에서 실행해야 `mockexam_db` 패키지를
찾는다(`drop_ingest.py`/`ingest.py`는 스스로 그 경로를 sys.path에 추가하므로 신경 안 써도 됨).

spaCy가 없으면 자동으로 regex 방식으로 대체 동작한다(멈추지 않음).
