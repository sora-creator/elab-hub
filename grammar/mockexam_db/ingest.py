# -*- coding: utf-8 -*-
"""
Ingest one mock-exam PDF into the shared SQLite DB (exams.db).

Usage:
    python3 -m mockexam_db.ingest <pdf_path> --year 2025 --month 9 --grade 고2
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mockexam_db import db
from mockexam_db.extract import extract_exam_sentences
from mockexam_db import tagger
from mockexam_db import regex_tagger

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exams.db')


def ingest(pdf_path: str, year: int, month: int, grade: str, db_path: str = DEFAULT_DB_PATH):
    conn = db.connect(db_path)
    source_file = os.path.basename(pdf_path)
    exam_id = db.get_or_create_exam(conn, year, month, grade, source_file)
    db.clear_exam_data(conn, exam_id)  # safe to re-run on the same file

    n_sentences = 0
    tag_counts = {}

    for item in extract_exam_sentences(pdf_path):
        cur = conn.execute(
            "INSERT INTO sentences (exam_id, question_no, question_type, sentence_index, text) "
            "VALUES (?, ?, ?, ?, ?)",
            (exam_id, item['question_no'], item['question_type'], item['sentence_index'], item['text']),
        )
        sentence_id = cur.lastrowid
        n_sentences += 1

        tags = tagger.tag_sentence(item['text'])
        # tags is {tag_type: [{'text':..., 'note':...}, ...], ...} -- loop
        # generically so new grammar rules need no changes here
        for tag_type, hits in tags.items():
            for hit in hits:
                conn.execute(
                    "INSERT INTO tags (sentence_id, tag_type, tag_subtype, matched_text) VALUES (?, ?, ?, ?)",
                    (sentence_id, tag_type, hit.get('note'), hit.get('text')),
                )
                tag_counts[tag_type] = tag_counts.get(tag_type, 0) + 1

        # spaCy가 primary일 때만 regex와 비교해서 판정이 갈리는 태그를 기록
        # (regex가 primary면 비교 대상 자체가 없음)
        if tagger.backend_name() == 'spacy':
            regex_tags = regex_tagger.tag_sentence(item['text'])
            for tag_type, spacy_hits in tags.items():
                regex_hits = regex_tags.get(tag_type, [])
                if bool(spacy_hits) != bool(regex_hits):
                    conn.execute(
                        "INSERT INTO tag_disagreements (sentence_id, tag_type) VALUES (?, ?)",
                        (sentence_id, tag_type),
                    )

    conn.commit()
    conn.close()
    return {
        'exam_id': exam_id,
        'sentences': n_sentences,
        'tag_counts': tag_counts,
        'db_path': db_path,
    }


def main():
    ap = argparse.ArgumentParser(description="Ingest a mock-exam PDF into exams.db")
    ap.add_argument('pdf_path')
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--month', type=int, required=True)
    ap.add_argument('--grade', required=True, help="e.g. 고1, 고2, 고3")
    ap.add_argument('--db', default=DEFAULT_DB_PATH)
    ap.add_argument('--export-json', metavar='PATH',
                     help="ingest 직후 ELAB 문법학습으로 가져올 JSON도 같이 내보냄")
    args = ap.parse_args()

    print(f"grammar tagger backend: {tagger.backend_name()}"
          + ("  (spaCy - accurate)" if tagger.backend_name() == 'spacy'
             else "  (regex fallback - spaCy model not found, see README.md)"))
    result = ingest(args.pdf_path, args.year, args.month, args.grade, args.db)
    print(f"exam_id={result['exam_id']}  sentences={result['sentences']}")
    for tag_type, count in sorted(result['tag_counts'].items()):
        print(f"  {tag_type}: {count}")
    print(f"DB: {result['db_path']}")

    if args.export_json:
        from mockexam_db.export_json import export_exam
        import json
        # source_file을 명시해서, 같은 연/월/학년의 다른 파일이 이미 있어도
        # 방금 ingest한 이 파일이 확실히 내보내지게 함(어느 파일인지 안 밝히면 export_exam이
        # 여러 개일 때 에러를 낸다).
        data = export_exam(args.db, args.year, args.month, args.grade,
                            source_file=os.path.basename(args.pdf_path))
        with open(args.export_json, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"내보냄: {args.export_json}")


if __name__ == '__main__':
    main()
