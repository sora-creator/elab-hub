#!/usr/bin/env pythonw
# -*- coding: utf-8 -*-
"""
grammar_gui.pyw
================
문법학습(grammar) 파이썬 파이프라인을 터미널 명령어 없이 마우스로 쓰는 화면(GUI).

- ① PDF 분석 (spaCy): 기존 "여기에 PDF 끌어놓기.bat"/drop_ingest.py와 똑같은 처리를
  화면에서 파일 선택 + 클릭만으로 할 수 있게 함 (bat 드래그앤드롭은 그대로 남겨둠 --
  둘 중 편한 쪽을 쓰면 됨).
- ② Claude 검증: verify_claude.py를 매번 터미널에 명령어 치는 대신, 저장된 회차를
  드롭다운에서 고르고 버튼만 누르면 되게 함. API 키는 한 번만 입력하면
  gui_config.json에 저장됨(이 컴퓨터에만 저장, 다른 사람과 공유하는 컴퓨터라면 주의).

사용법: 이 파일을 더블클릭하면 창이 뜹니다 (콘솔 창 없이 pythonw로 실행됨).
"""

import json
import os
import queue
import sqlite3
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))            # grammar/mockexam_db
GRAMMAR_DIR = os.path.dirname(SCRIPT_DIR)                            # grammar/
CONFIG_PATH = os.path.join(SCRIPT_DIR, "gui_config.json")
DB_PATH = os.path.join(GRAMMAR_DIR, "exams.db")
INGEST_PY = os.path.join(SCRIPT_DIR, "ingest.py")
VERIFY_PY = os.path.join(SCRIPT_DIR, "verify_claude.py")

sys.path.insert(0, GRAMMAR_DIR)
from mockexam_db.drop_ingest import guess_from_filename, safe_stem  # noqa: E402
from mockexam_db.regex_tagger import GRAMMAR_RULES  # noqa: E402

LABEL_BY_TAG = {rid: label for rid, label, _detect in GRAMMAR_RULES}
DETECT_BY_TAG = {rid: detect for rid, _label, detect in GRAMMAR_RULES}  # 판정 불일치 미리보기에서 regex 판정을 즉석에서 다시 계산할 때 씀


def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def list_exams():
    """exams.db에서 (year, month, grade, source_file) 목록을 최신순으로 읽어온다."""
    if not os.path.exists(DB_PATH):
        return []
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT year, month, grade, source_file FROM exams ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return rows


class SettingsDialog(tk.Toplevel):
    def __init__(self, master, config):
        super().__init__(master)
        self.title("설정 (Claude API 키)")
        self.resizable(False, False)
        self.config_data = config
        pad = {"padx": 10, "pady": 6}

        tk.Label(self, text="아래 값은 \"② Claude 검증\" 탭에서만 쓰여요. 이 컴퓨터의\n"
                             "mockexam_db/gui_config.json 파일에 저장됩니다 (다른 사람과\n"
                             "공유하는 컴퓨터라면 주의하세요).",
                 justify="left", fg="#7a3b00").grid(row=0, column=0, columnspan=2, sticky="w", **pad)

        tk.Label(self, text="Anthropic API 키").grid(row=1, column=0, sticky="e", **pad)
        self.api_var = tk.StringVar(value=config.get("anthropic_api_key", ""))
        self.api_entry = tk.Entry(self, textvariable=self.api_var, width=45, show="*")
        self.api_entry.grid(row=1, column=1, **pad)

        self.show_var = tk.BooleanVar(value=False)
        tk.Checkbutton(self, text="값 보이기", variable=self.show_var,
                        command=self.toggle_show).grid(row=2, column=0, columnspan=2, sticky="w", **pad)

        btns = tk.Frame(self)
        btns.grid(row=3, column=0, columnspan=2, pady=10)
        tk.Button(btns, text="저장", width=12, command=self.on_save).pack(side="left", padx=5)
        tk.Button(btns, text="취소", width=12, command=self.destroy).pack(side="left", padx=5)

        self.transient(master)
        self.grab_set()

    def toggle_show(self):
        self.api_entry.config(show="" if self.show_var.get() else "*")

    def on_save(self):
        self.config_data["anthropic_api_key"] = self.api_var.get().strip()
        save_config(self.config_data)
        messagebox.showinfo("저장 완료", "저장했습니다.", parent=self)
        self.destroy()


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("ELAB 문법학습 · 파이썬 도구")
        self.geometry("900x760")
        self.minsize(780, 620)
        self.config_data = load_config()
        self.log_queue = queue.Queue()
        self.busy = False
        self.pdf_queue = []  # [{'path','filename','year','month','grade' -> tk.StringVar}, ...]
        self._last_job_kind = None

        self._build_ui()
        self.after(100, self._poll_queue)

    # ---------------------------------------------------------------- UI
    def _build_ui(self):
        self.action_buttons = []

        top = tk.Frame(self)
        top.pack(fill="x", padx=10, pady=(10, 0))
        tk.Button(top, text="설정 (Claude API 키)", command=self.open_settings).pack(side="right")
        tk.Label(top, text="ELAB 문법학습 · 파이썬 도구", font=("맑은 고딕", 14, "bold")).pack(side="left")

        status_row = tk.Frame(self)
        status_row.pack(side="bottom", fill="x", padx=12, pady=(0, 8))
        self.status_var = tk.StringVar(value="● 대기 중")
        tk.Label(status_row, textvariable=self.status_var, anchor="w", fg="#555").pack(side="left")
        self.progress = ttk.Progressbar(status_row, mode="indeterminate", length=160)
        self.progress.pack(side="right")

        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=10, pady=10)
        self.tab_ingest = tk.Frame(nb)
        self.tab_verify = tk.Frame(nb)
        nb.add(self.tab_ingest, text="① PDF 분석 (spaCy)")
        nb.add(self.tab_verify, text="② Claude 검증")
        self._build_ingest_tab()
        self._build_verify_tab()

        log_frame = tk.LabelFrame(self, text="실행 로그")
        log_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.log_text = scrolledtext.ScrolledText(log_frame, height=12, state="disabled", font=("Consolas", 9))
        self.log_text.pack(fill="both", expand=True, padx=6, pady=6)
        tk.Button(log_frame, text="로그 지우기", command=self.clear_log).pack(anchor="e", padx=6, pady=(0, 6))

    # ---------------------------------------------------- 탭 ①: PDF 분석
    def _build_ingest_tab(self):
        f = self.tab_ingest
        top = tk.Frame(f)
        top.pack(fill="x", padx=8, pady=8)
        tk.Button(top, text="PDF 파일 선택 (여러 개 가능)", command=self.pick_pdfs).pack(side="left")
        tk.Label(top, text="파일명에서 연/월/학년을 자동으로 읽어요. 못 읽은 항목만 아래에서 고치세요.",
                 fg="#555").pack(side="left", padx=10)

        self.ingest_list_frame = tk.Frame(f)
        self.ingest_list_frame.pack(fill="both", expand=True, padx=8, pady=4)
        self._render_ingest_rows()

        btn = tk.Button(f, text="선택한 PDF 전부 분석해서 저장하기", width=32, bg="#2a4d7a", fg="white",
                         command=self.run_ingest_all)
        btn.pack(pady=10)
        self.action_buttons.append(btn)

        tk.Label(f, text="완료되면 PDF 옆에 JSON 파일이 생겨요 -- ELAB 문법학습 화면의\n"
                         "\"① 정확한 태깅 결과 가져오기\"에서 그 파일을 선택하면 됩니다.",
                 fg="#555", justify="left").pack(anchor="w", padx=8)

    def pick_pdfs(self):
        paths = filedialog.askopenfilenames(filetypes=[("PDF 파일", "*.pdf")])
        if not paths:
            return
        for path in paths:
            filename = os.path.basename(path)
            year, month, grade = guess_from_filename(filename)
            self.pdf_queue.append({
                "path": path, "filename": filename,
                "year": tk.StringVar(value=str(year) if year else ""),
                "month": tk.StringVar(value=str(month) if month else ""),
                "grade": tk.StringVar(value=grade or ""),
            })
        self._render_ingest_rows()

    def _render_ingest_rows(self):
        for w in self.ingest_list_frame.winfo_children():
            w.destroy()
        if not self.pdf_queue:
            tk.Label(self.ingest_list_frame, text="아직 선택한 PDF가 없어요.", fg="#888").pack(anchor="w")
            return
        header = tk.Frame(self.ingest_list_frame)
        header.pack(fill="x")
        for text, w in [("파일명", 42), ("연도", 8), ("월", 6), ("학년", 8)]:
            tk.Label(header, text=text, width=w, anchor="w", font=("맑은 고딕", 9, "bold")).pack(side="left")
        for i, item in enumerate(self.pdf_queue):
            row = tk.Frame(self.ingest_list_frame)
            row.pack(fill="x", pady=2)
            tk.Label(row, text=item["filename"], width=42, anchor="w").pack(side="left")
            tk.Entry(row, textvariable=item["year"], width=8).pack(side="left")
            tk.Entry(row, textvariable=item["month"], width=6).pack(side="left")
            tk.Entry(row, textvariable=item["grade"], width=8).pack(side="left")
            tk.Button(row, text="제거", command=lambda i=i: self._remove_pdf(i)).pack(side="left", padx=4)

    def _remove_pdf(self, idx):
        del self.pdf_queue[idx]
        self._render_ingest_rows()

    def run_ingest_all(self):
        if not self.pdf_queue:
            messagebox.showwarning("선택 필요", "PDF를 먼저 선택해주세요.")
            return
        jobs = []
        for item in self.pdf_queue:
            year = item["year"].get().strip()
            month = item["month"].get().strip()
            grade = item["grade"].get().strip()
            if not (year and month and grade):
                messagebox.showwarning("입력 필요", f"'{item['filename']}'의 연도/월/학년을 모두 채워주세요.")
                return
            try:
                month_int = int(month)
            except ValueError:
                messagebox.showwarning("값 확인", f"'{item['filename']}'의 월이 숫자가 아니에요: {month}")
                return
            out_path = os.path.join(
                os.path.dirname(item["path"]),
                f"{year}-{month_int:02d}-{grade}-{safe_stem(item['filename'])}.json")
            jobs.append([sys.executable, INGEST_PY, item["path"],
                         "--year", year, "--month", month, "--grade", grade,
                         "--export-json", out_path])
        self._last_job_kind = "ingest"
        self._run_sequence(jobs, need_api=False)

    # ---------------------------------------------------- 탭 ②: Claude 검증
    def _build_verify_tab(self):
        f = self.tab_verify

        row = tk.Frame(f)
        row.pack(fill="x", padx=8, pady=8)
        tk.Label(row, text="검증할 회차:").pack(side="left")
        self.exam_var = tk.StringVar()
        self.exam_cb = ttk.Combobox(row, textvariable=self.exam_var, width=48, state="readonly")
        self.exam_cb.pack(side="left", padx=6)
        self.exam_cb.bind("<<ComboboxSelected>>", self._refresh_live_preview)
        tk.Button(row, text="목록 새로고침", command=self.refresh_exam_list).pack(side="left", padx=6)

        row2 = tk.Frame(f)
        row2.pack(fill="x", padx=8, pady=8)
        tk.Label(row2, text="문법 (비우면 판정 불일치가 난 모든 태그):").pack(side="left")
        self.tag_var = tk.StringVar()
        tag_values = [""] + [f"{rid} ({label})" for rid, label, _ in GRAMMAR_RULES]
        self.tag_cb = ttk.Combobox(row2, textvariable=self.tag_var, width=32, state="readonly", values=tag_values)
        self.tag_cb.pack(side="left", padx=6)
        self.tag_cb.bind("<<ComboboxSelected>>", self._refresh_live_preview)

        row3 = tk.Frame(f)
        row3.pack(fill="x", padx=8, pady=8)
        self.all_var = tk.BooleanVar(value=False)
        self.recheck_var = tk.BooleanVar(value=False)
        self.all_var.trace_add("write", self._refresh_live_preview)
        self.recheck_var.trace_add("write", self._refresh_live_preview)
        tk.Checkbutton(row3, text="전체 검증 (--all, 비용 큼, 문법 지정 필수)", variable=self.all_var).pack(side="left")
        tk.Checkbutton(row3, text="이미 검증된 것도 재검증 (--recheck)", variable=self.recheck_var).pack(
            side="left", padx=12)

        preview_frame = tk.LabelFrame(f, text="검증 대상 미리보기 (선택을 바꾸면 바로 갱신됨, API 호출 없음)")
        preview_frame.pack(fill="both", expand=True, padx=8, pady=8)
        self.preview_count_var = tk.StringVar(value="")
        tk.Label(preview_frame, textvariable=self.preview_count_var, fg="#2a4d7a",
                 font=("맑은 고딕", 9, "bold")).pack(anchor="w", padx=6, pady=(4, 0))
        list_row = tk.Frame(preview_frame)
        list_row.pack(fill="both", expand=True, padx=6, pady=6)
        scrollbar = tk.Scrollbar(list_row)
        scrollbar.pack(side="right", fill="y")
        self.preview_list = tk.Listbox(list_row, height=8, yscrollcommand=scrollbar.set, font=("맑은 고딕", 9))
        self.preview_list.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.preview_list.yview)

        tk.Label(f, text="기본은 판정 불일치가 난 문장만 검증하고, 이미 검증된 (문장,태그)는\n"
                         "자동으로 건너뛰어요(비용 절감). 검증 결과는 exams.db에 저장되고,\n"
                         "ELAB에서 다시 가져오면 \"✅ Claude 확인\" 배지로 보여요.",
                 fg="#555", justify="left").pack(anchor="w", padx=8)

        btns = tk.Frame(f)
        btns.pack(pady=14)
        b1 = tk.Button(btns, text="로그로 자세히 보기 (무료, API 호출 안 함)", width=32, command=self.run_verify_preview)
        b1.pack(side="left", padx=6)
        b2 = tk.Button(btns, text="실제 검증 실행 (API 비용 발생)", width=28, bg="#2a4d7a", fg="white",
                        command=self.run_verify_real)
        b2.pack(side="left", padx=6)
        self.action_buttons += [b1, b2]

        self.refresh_exam_list()

    def refresh_exam_list(self):
        prev_idx = self.exam_cb.current() if getattr(self, "_exam_rows", None) else -1
        prev_key = self._exam_rows[prev_idx] if prev_idx >= 0 else None

        exams = list_exams()
        self._exam_rows = exams
        values = [f"{y}년 {m}월 {g} — {sf}" for y, m, g, sf in exams]
        self.exam_cb["values"] = values
        if values:
            new_idx = exams.index(prev_key) if prev_key in exams else 0
            self.exam_cb.current(new_idx)
        else:
            self.exam_var.set("")
        self._refresh_live_preview()

    def _refresh_live_preview(self, *_args):
        """exams.db를 직접 읽어서 검증 대상을 즉시 보여줌 -- 서브프로세스/API 호출 없음."""
        if not hasattr(self, "preview_list"):
            return
        self.preview_list.delete(0, "end")

        if not getattr(self, "_exam_rows", None):
            self.preview_count_var.set("저장된 회차가 없어요 -- 먼저 '① PDF 분석'으로 회차를 저장해주세요.")
            return
        idx = self.exam_cb.current()
        if idx < 0:
            self.preview_count_var.set("검증할 회차를 선택해주세요.")
            return
        year, month, grade, source_file = self._exam_rows[idx]

        tag_raw = self.tag_var.get().strip()
        tag_id = tag_raw.split(" ", 1)[0] if tag_raw else None

        if not os.path.exists(DB_PATH):
            self.preview_count_var.set("exams.db가 없어요.")
            return

        conn = sqlite3.connect(DB_PATH)
        try:
            exam_row = conn.execute(
                "SELECT id FROM exams WHERE year=? AND month=? AND grade=? AND source_file=?",
                (year, month, grade, source_file)).fetchone()
            if not exam_row:
                self.preview_count_var.set("이 회차를 exams.db에서 찾을 수 없어요.")
                return
            exam_id = exam_row[0]

            if self.all_var.get():
                if not tag_id:
                    self.preview_count_var.set("전체 검증(--all)은 문법을 먼저 선택해야 해요.")
                    return
                rows = conn.execute(
                    "SELECT DISTINCT s.id, t.tag_type, s.text FROM tags t "
                    "JOIN sentences s ON s.id = t.sentence_id "
                    "WHERE s.exam_id=? AND t.tag_type=?", (exam_id, tag_id)).fetchall()
            else:
                query = ("SELECT DISTINCT d.sentence_id, d.tag_type, s.text FROM tag_disagreements d "
                          "JOIN sentences s ON s.id = d.sentence_id WHERE s.exam_id=?")
                params = [exam_id]
                if tag_id:
                    query += " AND d.tag_type=?"
                    params.append(tag_id)
                rows = conn.execute(query, params).fetchall()

            if not rows:
                self.preview_count_var.set("판정 불일치(또는 조건에 맞는 문장)가 없어요 -- 검증할 게 없습니다.")
                return

            is_disagreement_mode = not self.all_var.get()

            todo_n, skip_n = 0, 0
            for sid, tag_type, text in rows:
                already = conn.execute(
                    "SELECT 1 FROM tag_claude_verification WHERE sentence_id=? AND tag_type=?",
                    (sid, tag_type)).fetchone()
                label = LABEL_BY_TAG.get(tag_type, tag_type)
                prefix = "(건너뜀·이미 검증됨) " if (already and not self.recheck_var.get()) else ""
                if already and not self.recheck_var.get():
                    skip_n += 1
                else:
                    todo_n += 1
                self.preview_list.insert("end", f"{prefix}[{label}] {text}")

                # 판정 불일치(disagreement) 모드일 때만 spaCy/regex가 각각 뭘로 판정했는지 한 줄 더 보여줌 --
                # tags 테이블엔 spaCy(primary backend) 결과만 저장돼 있어서 그걸 조회하고,
                # regex는 저장돼 있지 않아 여기서 즉석에 다시 계산한다(순수 함수라 비용 없음).
                if is_disagreement_mode:
                    spacy_hits = conn.execute(
                        "SELECT matched_text FROM tags WHERE sentence_id=? AND tag_type=?",
                        (sid, tag_type)).fetchall()
                    spacy_texts = [t for (t,) in spacy_hits if t]
                    detect_fn = DETECT_BY_TAG.get(tag_type)
                    regex_hits = detect_fn(text) if detect_fn else []
                    regex_texts = [h.get('text', '') for h in regex_hits]

                    spacy_desc = ("O (" + " / ".join(spacy_texts) + ")") if spacy_texts else "X (판정 안 함)"
                    regex_desc = ("O (" + " / ".join(regex_texts) + ")") if regex_texts else "X (판정 안 함)"
                    self.preview_list.insert("end", f"    ㄴ spaCy는 {spacy_desc}로 판정, regex는 {regex_desc}로 판정")
            self.preview_count_var.set(f"실제 실행하면 검증할 문장: {todo_n}개  /  건너뜀(이미 검증됨): {skip_n}개")
        finally:
            conn.close()

    def _build_verify_args(self):
        """None을 반환하면 이미 경고창을 띄운 상태 -- 호출한 쪽에서 그냥 return하면 됨."""
        if not getattr(self, "_exam_rows", None):
            messagebox.showwarning("선택 필요", "검증할 회차가 없어요. 먼저 '① PDF 분석'으로 회차를 저장해주세요.")
            return None
        idx = self.exam_cb.current()
        if idx < 0:
            messagebox.showwarning("선택 필요", "검증할 회차를 선택해주세요.")
            return None
        year, month, grade, source_file = self._exam_rows[idx]
        args = [sys.executable, VERIFY_PY,
                "--year", str(year), "--month", str(month), "--grade", grade,
                "--source-file", source_file]

        tag_raw = self.tag_var.get().strip()
        tag_id = tag_raw.split(" ", 1)[0] if tag_raw else ""
        if tag_id:
            args += ["--tag", tag_id]
        if self.all_var.get():
            if not tag_id:
                messagebox.showwarning("문법 지정 필요", "전체 검증(--all)은 문법을 하나 지정해야 해요.")
                return None
            args += ["--all"]
        if self.recheck_var.get():
            args += ["--recheck"]
        return args

    def run_verify_preview(self):
        args = self._build_verify_args()
        if args is None:
            return
        self._last_job_kind = "verify"
        self._run_sequence([args + ["--dry-run"]], need_api=False)

    def run_verify_real(self):
        args = self._build_verify_args()
        if args is None:
            return
        if not messagebox.askyesno("확인", "실제로 Claude AI를 호출합니다 (API 사용 요금이 발생합니다). "
                                            "위 미리보기 목록을 확인해보셨나요?\n계속할까요?"):
            return
        self._last_job_kind = "verify"
        self._run_sequence([args], need_api=True)

    # -------------------------------------------------------------- 공통 실행
    def open_settings(self):
        dlg = SettingsDialog(self, self.config_data)
        self.wait_window(dlg)

    def clear_log(self):
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

    def _append_log(self, text):
        self.log_text.config(state="normal")
        self.log_text.insert("end", text)
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    def _env(self):
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        if self.config_data.get("anthropic_api_key"):
            env["ANTHROPIC_API_KEY"] = self.config_data["anthropic_api_key"]
        return env

    def _run_sequence(self, jobs, need_api=False):
        if self.busy:
            messagebox.showinfo("실행 중", "다른 작업이 끝난 뒤에 다시 시도해주세요.")
            return
        if need_api and not self._env().get("ANTHROPIC_API_KEY"):
            messagebox.showwarning("설정 필요", "오른쪽 위 '설정'에서 Anthropic API 키를 먼저 입력해주세요.")
            return

        self.busy = True
        self.run_start_time = time.time()
        for b in self.action_buttons:
            b.config(state="disabled")
        self.progress.start(40)
        self._tick_status()

        def worker():
            code = 0
            for cmd in jobs:
                shown = " ".join('"' + a + '"' if " " in a else a for a in cmd)
                self.log_queue.put("\n$ " + shown + "\n")
                try:
                    proc = subprocess.Popen(
                        cmd, cwd=SCRIPT_DIR, env=self._env(),
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, encoding="utf-8", errors="replace",
                    )
                    for line in proc.stdout:
                        self.log_queue.put(line)
                    proc.wait()
                    if proc.returncode != 0:
                        code = proc.returncode
                        break
                except Exception as e:
                    self.log_queue.put(f"[오류] {e}\n")
                    code = -1
                    break
            self.log_queue.put(("__DONE__", code))

        threading.Thread(target=worker, daemon=True).start()

    def _tick_status(self):
        if not self.busy:
            return
        elapsed = int(time.time() - self.run_start_time)
        self.status_var.set(f"● 실행 중... ({elapsed}초 경과)")
        self.after(500, self._tick_status)

    def _poll_queue(self):
        try:
            while True:
                item = self.log_queue.get_nowait()
                if isinstance(item, tuple) and item[0] == "__DONE__":
                    self.busy = False
                    code = item[1]
                    elapsed = int(time.time() - self.run_start_time)
                    self.status_var.set(
                        f"✔ 완료 ({elapsed}초 걸림)" if code == 0 else f"⚠ 오류로 종료됨 (코드 {code}, {elapsed}초)"
                    )
                    self.progress.stop()
                    for b in self.action_buttons:
                        b.config(state="normal")
                    if code == 0 and self._last_job_kind == "ingest":
                        self.pdf_queue = []
                        self._render_ingest_rows()
                    if code == 0:
                        self.refresh_exam_list()
                else:
                    self._append_log(item)
        except queue.Empty:
            pass
        self.after(100, self._poll_queue)


if __name__ == "__main__":
    app = App()
    app.mainloop()
