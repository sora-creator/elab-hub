# -*- coding: utf-8 -*-
"""
exams.db에 이미 ingest된 회차의 문장+태그(spaCy 또는 regex, ingest 시점에 계산된 그대로)를
ELAB 문법학습(grammar/index.html)이 "가져오기"로 바로 읽을 수 있는 JSON으로 내보낸다.

사용법:
    python3 -m mockexam_db.export_json --year 2025 --month 9 --grade 고2 --out 2025-09-고2.json

주의: ingest.py가 저장한 태그를 그대로 내보낼 뿐, 여기서 다시 계산하지 않는다. 새 문법
규칙을 반영하려면 ingest.py를 먼저 다시 돌려야 한다.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mockexam_db import db
from mockexam_db import tagger

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exams.db')

# regex_tagger.py(snake_case) -> grammar/index.html의 GRAMMAR_RULES(camelCase) id 매핑.
# 나머지 5개(gerund/comparative/inversion/subjunctive/emphatic)는 이름이 이미 같아서 그대로 씀.
TAG_ID_MAP = {
    'participial_clause': 'participialClause',
    'present_participle': 'presentParticiple',
    'past_participle': 'pastParticiple',
    'present_participle_clause': 'presentParticiple',
    'past_participle_clause': 'pastParticiple',
    'passive_voice': 'passiveVoice',
    'noun_clause': 'nounClause',
    'modal_perfect': 'modalPerfect',
}


def to_js_tag_id(python_tag_id: str, tag_subtype: str = '') -> str:
    subtype = tag_subtype or ''
    if python_tag_id == 'to_infinitive':
        if '명사적' in subtype:
            return 'toInfinitiveNoun'
        if '형용사적' in subtype:
            return 'toInfinitiveAdjective'
        if '부사적' in subtype:
            return 'toInfinitiveAdverb'
        return 'toInfinitiveAdverb'
    if python_tag_id == 'relative_clause':
        return 'relativeAdverb' if '관계부사' in subtype else 'relativePronoun'
    return TAG_ID_MAP.get(python_tag_id, python_tag_id)


def exported_ids_for_base_tag(python_tag_id: str, sentence_tags: dict) -> list:
    if python_tag_id == 'to_infinitive':
        return [tag_id for tag_id in sentence_tags if tag_id.startswith('toInfinitive')]
    if python_tag_id == 'relative_clause':
        return [tag_id for tag_id in sentence_tags if tag_id in ('relativePronoun', 'relativeAdverb')]
    return [to_js_tag_id(python_tag_id)]


def export_exam(db_path: str, year: int, month: int, grade: str, source_file: str = None) -> dict:
    conn = db.connect(db_path)

    # exams 테이블의 진짜 유일키는 (year, month, grade, source_file) 4개다 -- 같은
    # 연/월/학년이라도 파일이 다르면(예: "수업용자료"판과 "상세분석"판) 별개 회차로 취급된다.
    # source_file을 안 받으면 (year, month, grade)만으로 찾는데, 이때 후보가 둘 이상이면
    # 아무거나 하나를 골라버리는 대신 명확하게 에러를 내고 어떤 파일들이 있는지 알려준다
    # (예전엔 여기서 fetchone()으로 조용히 하나만 골라서, 다른 PDF를 내보낼 때마다 같은
    # 이름의 JSON 파일이 서로 다른 회차 데이터로 덮어써지는 버그가 있었음).
    if source_file:
        row = conn.execute(
            "SELECT id, source_file FROM exams WHERE year=? AND month=? AND grade=? AND source_file=?",
            (year, month, grade, source_file),
        ).fetchone()
        if not row:
            raise SystemExit(f"해당 회차를 exams.db에서 찾을 수 없습니다 (먼저 ingest.py로 넣어주세요): "
                              f"{year}년 {month}월 {grade} / {source_file}")
    else:
        rows = conn.execute(
            "SELECT id, source_file FROM exams WHERE year=? AND month=? AND grade=?",
            (year, month, grade),
        ).fetchall()
        if not rows:
            raise SystemExit(f"해당 회차를 exams.db에서 찾을 수 없습니다 (먼저 ingest.py로 넣어주세요): "
                              f"{year}년 {month}월 {grade}")
        if len(rows) > 1:
            files = "\n".join(f"  - {r[1]}" for r in rows)
            raise SystemExit(
                f"{year}년 {month}월 {grade}에 파일이 {len(rows)}개 있어서 어느 걸 내보낼지 정할 수 없어요:\n"
                f"{files}\n--source-file 로 정확한 파일명을 지정해주세요."
            )
        row = rows[0]
    exam_id, source_file = row

    sentence_rows = conn.execute(
        "SELECT id, question_no, question_type, sentence_index, text "
        "FROM sentences WHERE exam_id=? ORDER BY sentence_index",
        (exam_id,),
    ).fetchall()

    tag_rows = conn.execute(
        "SELECT sentence_id, tag_type, tag_subtype, matched_text FROM tags "
        "WHERE sentence_id IN (SELECT id FROM sentences WHERE exam_id=?)",
        (exam_id,),
    ).fetchall()
    tags_by_sentence = {}
    seen_tags = set()
    for sentence_id, tag_type, tag_subtype, matched_text in tag_rows:
        tags_by_sentence.setdefault(sentence_id, {})
        js_id = to_js_tag_id(tag_type, tag_subtype)
        tags_by_sentence[sentence_id].setdefault(js_id, [])
        tag_key = (sentence_id, js_id, tag_subtype or '', matched_text or '')
        if tag_key not in seen_tags:
            seen_tags.add(tag_key)
            tags_by_sentence[sentence_id][js_id].append({'text': matched_text, 'note': tag_subtype})

    disagreement_rows = conn.execute(
        "SELECT sentence_id, tag_type FROM tag_disagreements "
        "WHERE sentence_id IN (SELECT id FROM sentences WHERE exam_id=?)",
        (exam_id,),
    ).fetchall()
    disagreements_by_sentence = {}
    for sentence_id, tag_type in disagreement_rows:
        sentence_tags = tags_by_sentence.get(sentence_id, {})
        for js_id in exported_ids_for_base_tag(tag_type, sentence_tags):
            disagreements_by_sentence.setdefault(sentence_id, []).append(js_id)

    verification_rows = conn.execute(
        "SELECT sentence_id, tag_type, verdict FROM tag_claude_verification "
        "WHERE sentence_id IN (SELECT id FROM sentences WHERE exam_id=?)",
        (exam_id,),
    ).fetchall()
    verification_by_sentence = {}
    for sentence_id, tag_type, verdict in verification_rows:
        sentence_tags = tags_by_sentence.get(sentence_id, {})
        for js_id in exported_ids_for_base_tag(tag_type, sentence_tags):
            verification_by_sentence.setdefault(sentence_id, []).append(
                {'tag': js_id, 'verdict': verdict}
            )

    sentences = []
    for sid, q_no, q_type, s_idx, text in sentence_rows:
        entry = {
            'questionNo': q_no,
            'questionType': q_type,
            'sentenceIndex': s_idx,
            'text': text,
            'tags': tags_by_sentence.get(sid, {}),
        }
        if sid in disagreements_by_sentence:
            entry['disagreements'] = disagreements_by_sentence[sid]
        if sid in verification_by_sentence:
            entry['claudeVerified'] = verification_by_sentence[sid]
        sentences.append(entry)

    return {
        'year': year,
        'month': month,
        'grade': grade,
        'sourceFile': source_file,
        'backend': tagger.backend_name(),
        'exportedAt': int(time.time() * 1000),
        'sentences': sentences,
    }


def main():
    ap = argparse.ArgumentParser(description="ELAB 문법학습으로 가져올 JSON 내보내기")
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--month', type=int, required=True)
    ap.add_argument('--grade', required=True)
    ap.add_argument('--source-file', help="같은 연/월/학년에 파일이 여러 개 있을 때 어느 걸 내보낼지 지정")
    ap.add_argument('--db', default=DEFAULT_DB_PATH)
    ap.add_argument('--out', required=True, help="저장할 JSON 파일 경로")
    args = ap.parse_args()

    data = export_exam(args.db, args.year, args.month, args.grade, args.source_file)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    tag_counts = {}
    for s in data['sentences']:
        for tag_id in s['tags']:
            tag_counts[tag_id] = tag_counts.get(tag_id, 0) + len(s['tags'][tag_id])
    print(f"내보냄: {args.out}")
    print(f"백엔드: {data['backend']}  문장 수: {len(data['sentences'])}")
    for tag_id, count in sorted(tag_counts.items()):
        print(f"  {tag_id}: {count}")


if __name__ == '__main__':
    main()
