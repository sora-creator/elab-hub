# -*- coding: utf-8 -*-
"""
PDF 파일을 배치파일("여기에 PDF 끌어놓기.bat") 위에 끌어다 놓으면 이 스크립트가 실행됨.

파일명에서 학년/연도/월을 자동으로 읽어서(예: "모의고사_2학년_2025년_09월_...") 별도
입력 없이 바로 spaCy 태깅 + ELAB용 JSON 내보내기까지 끝낸다. 파일명에서 못 읽은 항목만
콘솔에서 직접 물어본다.

직접 실행할 일은 거의 없고, 보통 배치파일이 드래그된 파일 경로들을 그대로 넘겨서 호출한다:
    python drop_ingest.py "파일1.pdf" "파일2.pdf" ...
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mockexam_db.ingest import ingest
from mockexam_db.export_json import export_exam
from mockexam_db import tagger

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exams.db')

GRADE_DIGIT_RE = re.compile(r'([123])\s*학년')
GRADE_DIRECT_RE = re.compile(r'(고[123])')
YEAR_RE = re.compile(r'(20\d{2})\s*년')
MONTH_RE = re.compile(r'(?<!\d)(\d{1,2})\s*월')


def guess_from_filename(filename):
    """파일명에서 (year, month, grade)를 최대한 읽어보고, 못 읽은 건 None으로 채워 반환."""
    grade = None
    m = GRADE_DIGIT_RE.search(filename)
    if m:
        grade = '고' + m.group(1)
    else:
        m = GRADE_DIRECT_RE.search(filename)
        if m:
            grade = m.group(1)

    year = None
    m = YEAR_RE.search(filename)
    if m:
        year = int(m.group(1))

    month = None
    m = MONTH_RE.search(filename)
    if m:
        month = int(m.group(1))

    return year, month, grade


INVALID_FILENAME_CHARS_RE = re.compile(r'[\\/:*?"<>|]')


def safe_stem(filename, max_len=40):
    """파일명을 출력 JSON 이름에 안전하게 섞어 넣기 위해 다듬음(윈도우 금지문자 제거 등)."""
    stem = os.path.splitext(filename)[0]
    stem = INVALID_FILENAME_CHARS_RE.sub('', stem).strip()
    return stem[:max_len] if stem else 'exam'


def ask(prompt, cast=str):
    while True:
        raw = input(prompt).strip()
        if not raw:
            continue
        try:
            return cast(raw)
        except ValueError:
            print("  값이 이상해요, 다시 입력해주세요.")


def process_one(pdf_path):
    filename = os.path.basename(pdf_path)
    print(f"\n=== {filename} ===")

    year, month, grade = guess_from_filename(filename)
    guessed = []
    if year: guessed.append(f"{year}년")
    if month: guessed.append(f"{month}월")
    if grade: guessed.append(grade)
    if guessed:
        print("파일명에서 자동으로 읽음: " + " ".join(guessed))

    if not year:
        year = ask("연도를 입력하세요 (예: 2025): ", int)
    if not month:
        month = ask("월을 입력하세요 (예: 9): ", int)
    if not grade:
        grade = ask("학년을 입력하세요 (고1/고2/고3): ")

    print(f"grammar tagger backend: {tagger.backend_name()}"
          + ("  (spaCy - 정확)" if tagger.backend_name() == 'spacy' else "  (regex 대체 - spaCy 모델 없음)"))

    result = ingest(pdf_path, year, month, grade, DEFAULT_DB_PATH)
    print(f"문장 {result['sentences']}개 태깅 완료")

    # 같은 연/월/학년이라도 파일이 다르면(예: "수업용자료"판과 "상세분석"판) 별개 회차라서,
    # 어느 파일에서 나온 건지 export_exam에 정확히 지정해줘야 한다(안 그러면 같은
    # 연/월/학년의 다른 파일을 나중에 내보낼 때 이전 결과를 덮어써버리는 문제가 있었음).
    # 출력 JSON 파일명에도 원본 파일명을 같이 넣어서 서로 안 겹치게 함.
    out_path = os.path.join(os.path.dirname(pdf_path), f"{year}-{month:02d}-{grade}-{safe_stem(filename)}.json")
    data = export_exam(DEFAULT_DB_PATH, year, month, grade, source_file=filename)
    import json
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ JSON 생성 완료: {out_path}")
    return out_path


def main():
    pdf_paths = [p for p in sys.argv[1:] if p.lower().endswith('.pdf')]
    if not pdf_paths:
        print("PDF 파일을 이 배치파일 위에 끌어다 놓아주세요.")
        return

    outputs = []
    for pdf_path in pdf_paths:
        try:
            outputs.append(process_one(pdf_path))
        except Exception as e:
            print(f"⚠️ {os.path.basename(pdf_path)} 처리 중 오류: {e}")

    if outputs:
        print("\n=== 완료 ===")
        print("아래 JSON 파일을 ELAB 문법학습 화면의 '가져오기'에서 선택하세요:")
        for p in outputs:
            print(f"  {p}")


if __name__ == '__main__':
    main()
