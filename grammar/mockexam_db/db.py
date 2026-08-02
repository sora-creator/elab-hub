# -*- coding: utf-8 -*-
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    grade TEXT NOT NULL,
    source_file TEXT NOT NULL,
    UNIQUE(year, month, grade, source_file)
);

CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    question_no TEXT,
    question_type TEXT,
    sentence_index INTEGER,
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sentence_id INTEGER NOT NULL REFERENCES sentences(id),
    tag_type TEXT NOT NULL,      -- 'to_infinitive' | 'participial_clause'
    tag_subtype TEXT,            -- e.g. 'sentence-initial', 'with-phrase'
    matched_text TEXT
);

CREATE TABLE IF NOT EXISTS tag_disagreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sentence_id INTEGER NOT NULL REFERENCES sentences(id),
    tag_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tag_claude_verification (
    sentence_id INTEGER NOT NULL REFERENCES sentences(id),
    tag_type TEXT NOT NULL,
    verdict TEXT NOT NULL,
    note TEXT,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (sentence_id, tag_type)
);

CREATE INDEX IF NOT EXISTS idx_sentences_exam ON sentences(exam_id);
CREATE INDEX IF NOT EXISTS idx_tags_sentence ON tags(sentence_id);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(tag_type);
CREATE INDEX IF NOT EXISTS idx_disagreements_sentence ON tag_disagreements(sentence_id);
"""


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.executescript(SCHEMA)
    return conn


def get_or_create_exam(conn, year: int, month: int, grade: str, source_file: str) -> int:
    cur = conn.execute(
        "SELECT id FROM exams WHERE year=? AND month=? AND grade=? AND source_file=?",
        (year, month, grade, source_file),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        "INSERT INTO exams (year, month, grade, source_file) VALUES (?, ?, ?, ?)",
        (year, month, grade, source_file),
    )
    conn.commit()
    return cur.lastrowid


def clear_exam_data(conn, exam_id: int):
    """Wipe existing sentences/tags for an exam before re-ingesting it."""
    conn.execute(
        "DELETE FROM tag_claude_verification WHERE sentence_id IN (SELECT id FROM sentences WHERE exam_id=?)",
        (exam_id,),
    )
    conn.execute(
        "DELETE FROM tag_disagreements WHERE sentence_id IN (SELECT id FROM sentences WHERE exam_id=?)",
        (exam_id,),
    )
    conn.execute(
        "DELETE FROM tags WHERE sentence_id IN (SELECT id FROM sentences WHERE exam_id=?)",
        (exam_id,),
    )
    conn.execute("DELETE FROM sentences WHERE exam_id=?", (exam_id,))
    conn.commit()
