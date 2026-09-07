# -*- coding: utf-8 -*-
"""ELAB 문법학습 웹 화면과 로컬 spaCy/SQLite 파이프라인을 연결한다."""
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import argparse
import sqlite3
import time
import uuid
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
GRAMMAR_DIR = SCRIPT_DIR.parent
APP_ROOT = GRAMMAR_DIR.parent
DB_PATH = GRAMMAR_DIR / "exams.db"
CONFIG_PATH = SCRIPT_DIR / "gui_config.json"
PORT = 8766
PENDING_DIR = Path(tempfile.gettempdir()) / "elab-grammar-preview"
PENDING = {}
PENDING_LOCK = threading.Lock()

sys.path.insert(0, str(GRAMMAR_DIR))


def read_config():
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_ROOT), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/grammar/status":
            cfg = read_config()
            return write_json(self, 200, {
                "ok": True,
                "python": sys.version.split()[0],
                "database": str(DB_PATH),
                "has_api_key": bool(cfg.get("anthropic_api_key")),
            })
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path == "/api/grammar/analyze":
                return self.analyze(parsed)
            if parsed.path == "/api/grammar/save-preview":
                return self.save_preview()
            if parsed.path == "/api/grammar/verify":
                return self.verify()
            write_json(self, 404, {"ok": False, "error": "지원하지 않는 요청입니다."})
        except Exception as exc:
            write_json(self, 500, {"ok": False, "error": str(exc)})

    def analyze(self, parsed):
        from mockexam_db.ingest import ingest
        from mockexam_db.export_json import export_exam
        query = urllib.parse.parse_qs(parsed.query)
        filename = os.path.basename(query.get("filename", ["exam.pdf"])[0])
        year = int(query.get("year", [""])[0])
        month = int(query.get("month", [""])[0])
        grade = query.get("grade", [""])[0].strip()
        if not filename.lower().endswith(".pdf") or not grade or not (1 <= month <= 12 or month == 99):
            return write_json(self, 400, {"ok": False, "error": "PDF와 연도·월·학년을 확인하세요."})
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 80 * 1024 * 1024:
            return write_json(self, 400, {"ok": False, "error": "PDF 크기를 확인하세요."})
        PENDING_DIR.mkdir(parents=True, exist_ok=True)
        for old in PENDING_DIR.glob("*.db"):
            try:
                if time.time() - old.stat().st_mtime > 7200:
                    old.unlink()
            except OSError:
                pass
        token = uuid.uuid4().hex
        staging_db = PENDING_DIR / (token + ".db")
        with tempfile.TemporaryDirectory(prefix="elab-grammar-") as temp_dir:
            pdf_path = Path(temp_dir) / filename
            pdf_path.write_bytes(self.rfile.read(length))
            result = ingest(str(pdf_path), year, month, grade, str(staging_db))
            data = export_exam(str(staging_db), year, month, grade, source_file=filename)
        with PENDING_LOCK:
            PENDING[token] = {"db": str(staging_db), "created": time.time()}
        write_json(self, 200, {"ok": True, "result": result, "exam": data, "preview_token": token})

    def save_preview(self):
        from mockexam_db import db
        from mockexam_db.export_json import export_exam
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        token = str(payload.get("preview_token") or "")
        with PENDING_LOCK:
            pending = PENDING.pop(token, None)
        if not pending or not Path(pending["db"]).exists():
            return write_json(self, 400, {"ok": False, "error": "미리보기 시간이 만료되었습니다. 다시 분석하세요."})
        staging_path = Path(pending["db"])
        source = sqlite3.connect(str(staging_path))
        target = db.connect(str(DB_PATH))
        try:
            exam = source.execute("SELECT id,year,month,grade,source_file FROM exams LIMIT 1").fetchone()
            if not exam:
                raise ValueError("저장할 분석 결과가 없습니다.")
            source_exam_id, year, month, grade, source_file = exam
            target_exam_id = db.get_or_create_exam(target, year, month, grade, source_file)
            db.clear_exam_data(target, target_exam_id)
            sentence_map = {}
            rows = source.execute("SELECT id,question_no,question_type,sentence_index,text FROM sentences WHERE exam_id=? ORDER BY id", (source_exam_id,)).fetchall()
            for old_id, question_no, question_type, sentence_index, text in rows:
                cur = target.execute("INSERT INTO sentences(exam_id,question_no,question_type,sentence_index,text) VALUES(?,?,?,?,?)", (target_exam_id, question_no, question_type, sentence_index, text))
                sentence_map[old_id] = cur.lastrowid
            for old_id, new_id in sentence_map.items():
                for tag_type, tag_subtype, matched_text in source.execute("SELECT tag_type,tag_subtype,matched_text FROM tags WHERE sentence_id=?", (old_id,)):
                    target.execute("INSERT INTO tags(sentence_id,tag_type,tag_subtype,matched_text) VALUES(?,?,?,?)", (new_id, tag_type, tag_subtype, matched_text))
                for (tag_type,) in source.execute("SELECT tag_type FROM tag_disagreements WHERE sentence_id=?", (old_id,)):
                    target.execute("INSERT INTO tag_disagreements(sentence_id,tag_type) VALUES(?,?)", (new_id, tag_type))
            target.commit()
            data = export_exam(str(DB_PATH), year, month, grade, source_file=source_file)
        finally:
            source.close()
            target.close()
            try:
                staging_path.unlink()
            except OSError:
                pass
        write_json(self, 200, {"ok": True, "exam": data})

    def verify(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        cfg = read_config()
        api_key = str(payload.get("api_key") or cfg.get("anthropic_api_key") or "").strip()
        if payload.get("api_key"):
            cfg["anthropic_api_key"] = api_key
            CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        if not payload.get("dry_run") and not api_key:
            return write_json(self, 400, {"ok": False, "error": "Claude API 키를 입력하세요."})
        args = [sys.executable, str(SCRIPT_DIR / "verify_claude.py"),
                "--year", str(int(payload["year"])), "--month", str(int(payload["month"])),
                "--grade", str(payload["grade"]), "--source-file", str(payload["source_file"]),
                "--db", str(DB_PATH)]
        if payload.get("tag"):
            args += ["--tag", str(payload["tag"])]
        if payload.get("all"):
            args.append("--all")
        if payload.get("recheck"):
            args.append("--recheck")
        if payload.get("dry_run"):
            args.append("--dry-run")
        env = os.environ.copy()
        if api_key:
            env["ANTHROPIC_API_KEY"] = api_key
        run = subprocess.run(args, cwd=str(GRAMMAR_DIR), env=env, capture_output=True, text=True, timeout=900)
        output = (run.stdout + "\n" + run.stderr).strip()
        if run.returncode:
            return write_json(self, 400, {"ok": False, "error": output or "검증하지 못했습니다."})
        exam = None
        if not payload.get("dry_run"):
            from mockexam_db.export_json import export_exam
            exam = export_exam(str(DB_PATH), int(payload["year"]), int(payload["month"]),
                               str(payload["grade"]), source_file=str(payload["source_file"]))
        write_json(self, 200, {"ok": True, "output": output, "exam": exam})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{PORT}/grammar/index.html"
    if not args.no_browser:
        import threading
        import webbrowser
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    if sys.stdout:
        print(f"ELAB 문법학습: {url}")
        print("이 창을 닫으면 PDF 분석 기능도 종료됩니다.")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
