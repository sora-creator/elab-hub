# -*- coding: utf-8 -*-
"""
Claude API로 태깅 결과를 재검증하는 **수동 전용** 도구.

기본 동작은 tag_disagreements(정규식·spaCy 판정이 갈린 문장)만 검증해서 비용을
아낀다. 이미 검증한 (문장, 태그) 조합은 tag_claude_verification에 저장돼 있으면
다음 실행 때 자동으로 건너뛴다(검토 축적) -- --recheck를 주면 강제로 다시 검증한다.

이 스크립트는 ingest.py/drop_ingest.py 등 어떤 자동 흐름에서도 호출되지 않는다.
오직 사용자가 아래처럼 직접 명령을 칠 때만 동작한다:

    export ANTHROPIC_API_KEY="sk-ant-..."
    python -m mockexam_db.verify_claude --year 2025 --month 9 --grade 고2
    python -m mockexam_db.verify_claude --year 2025 --month 9 --grade 고2 --tag relative_clause --all
    python -m mockexam_db.verify_claude --year 2025 --month 9 --grade 고2 --recheck
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mockexam_db import db
from mockexam_db.regex_tagger import GRAMMAR_RULES

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exams.db')
DEFAULT_MODEL = 'claude-sonnet-5'

LABEL_BY_TAG = {rule_id: label for rule_id, label, _detect in GRAMMAR_RULES}
DETECT_BY_TAG = {rule_id: detect for rule_id, _label, detect in GRAMMAR_RULES}  # --dry-run 미리보기에서 regex 판정을 즉석에서 다시 계산할 때 씀

SYSTEM_PROMPT = """당신은 한국 고등학교 영어 모의고사 문장의 문법 태깅을 검증하는 보조
도구입니다. 주어진 영어 문장에 특정 문법 포인트가 실제로 쓰였는지만 판단하세요.

각 항목에 대해 다음 JSON 스키마의 리스트로만 답하세요. 다른 설명, 마크다운,
코드펜스 없이 순수 JSON 배열만 출력하세요.

[
  {"id": 1, "verdict": "yes", "note": "판단 이유를 한 문장으로"}
]

verdict는 "yes"(그 문법 포인트가 실제로 쓰임) 또는 "no"(쓰이지 않음) 중 하나만 쓰세요.
"""


def _find_exam(conn, year, month, grade, source_file):
    if source_file:
        row = conn.execute(
            "SELECT id, source_file FROM exams WHERE year=? AND month=? AND grade=? AND source_file=?",
            (year, month, grade, source_file),
        ).fetchone()
        if not row:
            raise SystemExit(f"해당 회차를 exams.db에서 찾을 수 없습니다: {year}년 {month}월 {grade} / {source_file}")
        return row
    rows = conn.execute(
        "SELECT id, source_file FROM exams WHERE year=? AND month=? AND grade=?",
        (year, month, grade),
    ).fetchall()
    if not rows:
        raise SystemExit(f"해당 회차를 exams.db에서 찾을 수 없습니다: {year}년 {month}월 {grade}")
    if len(rows) > 1:
        files = "\n".join(f"  - {r[1]}" for r in rows)
        raise SystemExit(
            f"{year}년 {month}월 {grade}에 파일이 {len(rows)}개 있어서 어느 걸 검증할지 정할 수 없어요:\n"
            f"{files}\n--source-file 로 정확한 파일명을 지정해주세요."
        )
    return rows[0]


def _candidates(conn, exam_id, tag, all_matches):
    """검증 대상 (sentence_id, tag_type, text) 목록을 고른다."""
    if all_matches:
        if not tag:
            raise SystemExit("--all 은 --tag 와 함께 써야 합니다 (전체 검증은 비용이 크니 태그를 좁혀주세요).")
        rows = conn.execute(
            "SELECT DISTINCT s.id, t.tag_type, s.text FROM tags t "
            "JOIN sentences s ON s.id = t.sentence_id "
            "WHERE s.exam_id=? AND t.tag_type=?",
            (exam_id, tag),
        ).fetchall()
        return rows

    query = (
        "SELECT DISTINCT d.sentence_id, d.tag_type, s.text FROM tag_disagreements d "
        "JOIN sentences s ON s.id = d.sentence_id "
        "WHERE s.exam_id=?"
    )
    params = [exam_id]
    if tag:
        query += " AND d.tag_type=?"
        params.append(tag)
    return conn.execute(query, params).fetchall()


def _already_verified(conn, pairs):
    if not pairs:
        return set()
    done = set()
    for sentence_id, tag_type, _text in pairs:
        row = conn.execute(
            "SELECT 1 FROM tag_claude_verification WHERE sentence_id=? AND tag_type=?",
            (sentence_id, tag_type),
        ).fetchone()
        if row:
            done.add((sentence_id, tag_type))
    return done


def _call_claude(client, model, batch):
    """batch: [(idx, sentence_id, tag_type, text)] -- 같은 요청 안에 여러 문장 섞어서 호출 수 절약."""
    parts = []
    for idx, _sentence_id, tag_type, text in batch:
        label = LABEL_BY_TAG.get(tag_type, tag_type)
        parts.append(f'{idx}. 문법포인트: "{label}"\n   문장: "{text}"')
    user_prompt = "다음 각 문장에 표시된 문법 포인트가 실제로 쓰였는지 판단하세요.\n\n" + "\n\n".join(parts)

    resp = client.messages.create(
        model=model,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text_out = "".join(b.text for b in resp.content if b.type == "text").strip()
    text_out = re.sub(r"^```(json)?", "", text_out).strip()
    text_out = re.sub(r"```$", "", text_out).strip()
    try:
        return json.loads(text_out)
    except json.JSONDecodeError:
        print(f"  [경고] JSON 파싱 실패, 원본 출력:\n{text_out[:800]}", file=sys.stderr)
        return []


def chunk(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def main():
    ap = argparse.ArgumentParser(
        description="Claude API로 판정 불일치(또는 지정한) 문장의 태깅을 검증 (수동 전용, 자동 흐름에서 호출 안 함)")
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--month', type=int, required=True)
    ap.add_argument('--grade', required=True)
    ap.add_argument('--source-file', help="같은 연/월/학년에 파일이 여러 개 있을 때 어느 걸 검증할지 지정")
    ap.add_argument('--db', default=DEFAULT_DB_PATH)
    ap.add_argument('--tag', help="이 태그만 검증 (예: relative_clause). 생략하면 불일치가 난 모든 태그")
    ap.add_argument('--all', action='store_true',
                     help="tag_disagreements가 아니라 --tag로 지정한 태그의 전체 매치를 검증 (비용 큼)")
    ap.add_argument('--recheck', action='store_true', help="이미 검증된 (문장,태그)도 다시 검증")
    ap.add_argument('--dry-run', action='store_true',
                     help="API를 호출하지 않고, 실제로 검증하면 어떤 문장/문법이 보내질지만 미리 보여줌 (무료)")
    ap.add_argument('--model', default=DEFAULT_MODEL)
    ap.add_argument('--batch-size', type=int, default=10)
    args = ap.parse_args()

    conn = db.connect(args.db)
    exam_id, source_file = _find_exam(conn, args.year, args.month, args.grade, args.source_file)

    candidates = _candidates(conn, exam_id, args.tag, args.all)
    if not candidates:
        print("검증할 대상이 없습니다 (판정 불일치가 없거나, --tag/--all 조건에 맞는 게 없어요).")
        return

    if args.recheck:
        todo = candidates
        skipped = []
    else:
        done = _already_verified(conn, candidates)
        todo = [c for c in candidates if (c[0], c[1]) not in done]
        skipped = [c for c in candidates if (c[0], c[1]) in done]

    print(f"대상: {len(candidates)}개  검증할 것: {len(todo)}개  이미 검증돼서 건너뜀: {len(skipped)}개")
    if not todo:
        return

    if args.dry_run:
        # --all이 아니면 tag_disagreements(spaCy·regex 판정이 갈린 문장)를 보는 것이므로,
        # 어느 쪽이 뭘로 판정했는지 한 줄 더 보여준다 -- tags 테이블엔 spaCy(primary backend)
        # 결과만 저장돼 있어서 그걸 조회하고, regex는 저장돼 있지 않아 여기서 즉석에 다시
        # 계산한다(순수 함수라 비용 없음, API 호출과 무관).
        show_disagreement_detail = not args.all
        print("\n[미리보기] 아래 문장들을 실제로 실행하면 Claude에게 보내서 검증합니다 (API 호출 없음):")
        for i, (sid, tag_type, text) in enumerate(todo, start=1):
            label = LABEL_BY_TAG.get(tag_type, tag_type)
            print(f"  {i}. [{label}] {text}")
            if show_disagreement_detail:
                spacy_rows = conn.execute(
                    "SELECT matched_text FROM tags WHERE sentence_id=? AND tag_type=?",
                    (sid, tag_type),
                ).fetchall()
                spacy_texts = [t for (t,) in spacy_rows if t]
                detect_fn = DETECT_BY_TAG.get(tag_type)
                regex_hits = detect_fn(text) if detect_fn else []
                regex_texts = [h.get('text', '') for h in regex_hits]

                spacy_desc = ("O (" + " / ".join(spacy_texts) + ")") if spacy_texts else "X (판정 안 함)"
                regex_desc = ("O (" + " / ".join(regex_texts) + ")") if regex_texts else "X (판정 안 함)"
                print(f"       ㄴ spaCy는 {spacy_desc}로 판정, regex는 {regex_desc}로 판정")
        print(f"\n총 {len(todo)}개 문장을 검증하게 됩니다. 실제로 실행하려면 --dry-run 없이 다시 실행하세요.")
        return

    # API 호출이 실제로 필요할 때만 키를 요구한다 -- 스킵 대상 판별 자체는 키 없이도 위에서 이미 끝남.
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("환경변수 ANTHROPIC_API_KEY가 설정되어 있지 않습니다. "
              "이 스크립트는 명시적으로 실행할 때만 동작하며, 키 없이는 아무것도 호출하지 않습니다.",
              file=sys.stderr)
        sys.exit(1)

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    indexed = list(enumerate(todo, start=1))
    verified_count = 0
    for batch in chunk(indexed, args.batch_size):
        items = [(idx, sid, tag_type, text) for idx, (sid, tag_type, text) in batch]
        results = _call_claude(client, args.model, items)
        results_by_idx = {r.get('id'): r for r in results if isinstance(r, dict)}
        now = time.strftime('%Y-%m-%dT%H:%M:%S')
        for idx, sid, tag_type, _text in items:
            r = results_by_idx.get(idx)
            if not r:
                print(f"  [경고] {idx}번 결과 없음 (sentence_id={sid}, tag={tag_type})", file=sys.stderr)
                continue
            verdict = r.get('verdict', '')
            note = r.get('note', '')
            conn.execute(
                "INSERT INTO tag_claude_verification (sentence_id, tag_type, verdict, note, checked_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(sentence_id, tag_type) DO UPDATE SET verdict=excluded.verdict, "
                "note=excluded.note, checked_at=excluded.checked_at",
                (sid, tag_type, verdict, note, now),
            )
            verified_count += 1
        conn.commit()

    print(f"완료: 새로 검증 {verified_count}개, 건너뜀 {len(skipped)}개")
    print(f"결과는 exams.db의 tag_claude_verification 테이블에 저장됨 -- "
          f"export_json.py로 다시 내보내면 ELAB에 '✅ Claude 확인' 배지로 표시됩니다.")


if __name__ == '__main__':
    main()
