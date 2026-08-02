# -*- coding: utf-8 -*-
"""
Search the mock-exam sentence DB.

Examples:
    # 25년 고2 9월 모의고사에서 분사구문 문장만
    python3 -m mockexam_db.query --year 2025 --month 9 --grade 고2 --tag participial_clause

    # 여러 문법을 동시에 (관계사절 또는 수동태가 있는 문장)
    python3 -m mockexam_db.query --year 2025 --month 9 --grade 고2 --tag relative_clause passive_voice

    # 어떤 회차든 상관없이 전체에서 검색
    python3 -m mockexam_db.query --tag to_infinitive

    # 사용 가능한 문법(태그) 목록 보기
    python3 -m mockexam_db.query --list-tags

    # 목록에 있는 시험들 확인
    python3 -m mockexam_db.query --list-exams
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mockexam_db import db
from mockexam_db.regex_tagger import GRAMMAR_RULES

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exams.db')
TAG_CHOICES = [rule_id for rule_id, _label, _fn in GRAMMAR_RULES]
TAG_LABELS = {rule_id: label for rule_id, label, _fn in GRAMMAR_RULES}


def list_tags():
    for rule_id, label, _fn in GRAMMAR_RULES:
        print(f"  {rule_id:<20} {label}")


def list_exams(conn):
    rows = conn.execute(
        "SELECT id, year, month, grade, source_file, "
        "(SELECT COUNT(*) FROM sentences WHERE exam_id = exams.id) AS n_sentences "
        "FROM exams ORDER BY year, month, grade"
    ).fetchall()
    for r in rows:
        print(f"[exam_id={r[0]}] {r[1]}년 {r[2]}월 {r[3]}  ({r[5]} sentences)  {r[4]}")


def search(conn, year=None, month=None, grade=None, tag_types=None):
    """tag_types: list of tag ids: sentences matching ANY of them are returned."""
    query = """
        SELECT DISTINCT s.id, s.question_no, s.question_type, s.sentence_index, s.text
        FROM sentences s
        JOIN exams e ON e.id = s.exam_id
    """
    conditions = []
    params = []
    if tag_types:
        placeholders = ",".join(["?"] * len(tag_types))
        query += f" JOIN tags t ON t.sentence_id = s.id "
        conditions.append(f"t.tag_type IN ({placeholders})")
        params.extend(tag_types)
    if year:
        conditions.append("e.year = ?")
        params.append(year)
    if month:
        conditions.append("e.month = ?")
        params.append(month)
    if grade:
        conditions.append("e.grade = ?")
        params.append(grade)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY s.question_no, s.sentence_index"

    return conn.execute(query, params).fetchall()


def main():
    ap = argparse.ArgumentParser(description="Search the mock-exam sentence DB")
    ap.add_argument('--year', type=int)
    ap.add_argument('--month', type=int)
    ap.add_argument('--grade')
    ap.add_argument('--tag', nargs='+', choices=TAG_CHOICES,
                     help="하나 이상 지정 가능. 여러 개면 그중 하나라도 있으면 검색됨")
    ap.add_argument('--db', default=DEFAULT_DB_PATH)
    ap.add_argument('--list-exams', action='store_true')
    ap.add_argument('--list-tags', action='store_true')
    args = ap.parse_args()

    if args.list_tags:
        list_tags()
        return

    conn = db.connect(args.db)

    if args.list_exams:
        list_exams(conn)
        return

    rows = search(conn, args.year, args.month, args.grade, args.tag)
    label = ', '.join(TAG_LABELS[t] for t in args.tag) if args.tag else '(문법 필터 없음)'
    print(f"{len(rows)} sentence(s) found -- {label}\n")
    for r in rows:
        q_no = r[1] or '?'
        idx = r[3]
        print(f"[{q_no}-{idx}] {r[4]}")


if __name__ == '__main__':
    main()
