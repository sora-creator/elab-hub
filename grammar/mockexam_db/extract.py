# -*- coding: utf-8 -*-
"""
Extract English sentences from a Korean HS mock-exam PDF.

These exam PDFs mark every English sentence in a passage with a small
circled number (❶❷❸ ... up to ⓴). We use those markers as sentence
boundaries instead of naive period-splitting, which is much more
reliable given quotes, abbreviations ("Mr.", "U.S."), decimals, etc.
"""
import re
import pdfplumber

MARKER_RE = re.compile(r'[❶-❿⓫-⓴]')
KOREAN_RE = re.compile(r'[가-힣]')
QUESTION_HEADER_RE = re.compile(r'^(\d+(?:~\d+)?번)\s*\[(.+?)\]')
TRAILING_LABEL_RE = re.compile(r'\(\s*[A-E]\s*\)\s*$')
TERMINAL_PUNCT_RE = re.compile(r'[.!?][\'"”’]?')
# question-number markers like " 43. " that show up right after a real
# sentence ends, introducing the next Korean question -- treated as a cut point
QUESTION_NUM_RE = re.compile(r'(?<=[.!?])\s+\d{1,3}[.\)]\s')
# private-use-area glyphs pdfplumber sometimes emits for layout artifacts
PUA_RE = re.compile(r'[\uE000-\uF8FF]+')

# \uC2DC\uD5D8 PDF\uC5D0 \uD754\uD55C \uD0C0\uC774\uD3EC\uADF8\uB798\uD53C \uBB38\uC7A5\uBD80\uD638\uB97C spaCy\uAC00 \uC548\uC815\uC801\uC73C\uB85C \uB2E4\uB8E8\uB294 \uD45C\uC900 \uD615\uD0DC\uB85C \uC815\uADDC\uD654.
# \uD2B9\uD788 U+2019(curly apostrophe)\uB294 spaCy \uD1A0\uD06C\uB098\uC774\uC800\uAC00 "it's" \uAC19\uC740 \uCD95\uC57D\uD615\uC744 "it"+"'s"\uB85C
# \uBABB \uCABC\uAC1C\uACE0 \uD1B5\uC9F8\uB85C \uC798\uBABB \uD1A0\uD070\uD654\uD558\uB294 \uBB38\uC81C\uAC00 \uC788\uC5C8\uACE0(\uB530\uB77C\uC11C lemma_\uB3C4 \uAE68\uC9D0), U+2015(HORIZONTAL
# BAR, \uC774 \uC2DC\uD5D8\uC9C0\uC5D0\uC11C \uAD6C\uBD84 \uAE30\uD638\uB85C \uC4F0\uC784)\uB294 \uC544\uC608 \uB3D9\uC0AC(VB)\uB85C \uC798\uBABB \uD488\uC0AC \uD0DC\uAE45\uB418\uC5B4 \uC758\uC874\uAD6C\uBB38
# \uD2B8\uB9AC\uB97C \uB04A\uC5B4\uBC84\uB9AC\uB294 \uBB38\uC81C\uAC00 \uC788\uC5C8\uB2E4(\uB458 \uB2E4 \uC2E4\uC81C spaCy 3.8 + en_core_web_sm\uC73C\uB85C \uD655\uC778\uD568).
# \uD45C\uC900 em dash(U+2014)/straight quote\uB85C \uBC14\uAFB8\uBA74 \uC2A4\uD398\uC774\uC2DC\uAC00 \uC815\uC0C1\uC801\uC73C\uB85C \uCC98\uB9AC\uD55C\uB2E4.
_PUNCT_NORMALIZE_MAP = {
    '\u2018': "'", '\u2019': "'",  # \u2018 \u2019 -> '
    '\u201C': '"', '\u201D': '"',  # \u201C \u201D -> "
    '\u2015': '\u2014',            # \u2015 -> \u2014
}
_PUNCT_NORMALIZE_RE = re.compile('|'.join(re.escape(k) for k in _PUNCT_NORMALIZE_MAP))


def _normalize_punctuation(text: str) -> str:
    return _PUNCT_NORMALIZE_RE.sub(lambda m: _PUNCT_NORMALIZE_MAP[m.group(0)], text)


def _clean_marker_text(raw: str) -> str:
    """Normalize whitespace inside one extracted sentence chunk."""
    text = PUA_RE.sub(' ', raw)
    text = text.replace('\n', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    text = _normalize_punctuation(text)
    return text


def _strip_trailing_label(text: str) -> str:
    return TRAILING_LABEL_RE.sub('', text).strip()


SENT_SPLIT_RE = re.compile(r'(?<=[.!?])[\'"”’]?\s+(?=[A-Z"“‘(])')


def _trim_last_chunk(text: str):
    """
    The chunk after the *last* sentence marker on a page also contains
    footnotes / answer choices / footer junk (nothing bounds it on the
    right), and sometimes a few trailing sentences that the exam itself
    left unmarked. Cut the junk off and return a LIST of sentences
    (usually just one, occasionally a few for those trailing unmarked
    ones).
    """
    text = PUA_RE.sub(' ', text)

    cut_candidates = []
    m = KOREAN_RE.search(text)
    if m:
        cut_candidates.append(m.start())
    for marker in ('★', '*'):
        idx = text.find(marker)
        if idx != -1:
            cut_candidates.append(idx)
    m = QUESTION_NUM_RE.search(text)
    if m:
        cut_candidates.append(m.start())
    if cut_candidates:
        text = text[:min(cut_candidates)]

    text = re.sub(r'\s+', ' ', text).strip()
    # trim back to the last terminal punctuation so we don't keep a
    # dangling fragment like a stray question number
    matches = list(TERMINAL_PUNCT_RE.finditer(text))
    if matches:
        text = text[:matches[-1].end()]
    text = re.sub(r'[\u2460-\u2473\s]+$', '', text).strip()
    if not text:
        return []
    # split any trailing unmarked sentences off from the actually-marked one
    pieces = [p.strip() for p in SENT_SPLIT_RE.split(text) if p.strip()]
    return pieces if pieces else [text]


def extract_sentences_from_page(page_text: str):
    """
    Returns (question_no, question_type, [sentence, sentence, ...])
    for one page of the PDF. question_type is the bracketed label,
    e.g. '목적 추론'.
    """
    lines = page_text.split('\n')
    question_no, question_type = None, None
    for line in lines[:4]:
        m = QUESTION_HEADER_RE.match(line.strip())
        if m:
            question_no, question_type = m.group(1), m.group(2)
            break

    parts = MARKER_RE.split(page_text)
    markers = MARKER_RE.findall(page_text)
    # parts[0] is header/instruction text before the first marker (discarded)
    sentences = []
    n = len(markers)
    for i in range(n):
        chunk = parts[i + 1] if i + 1 < len(parts) else ''
        is_last = (i == n - 1)
        if is_last:
            for piece in _trim_last_chunk(_clean_marker_text_raw(chunk)):
                if piece:
                    sentences.append(piece)
        else:
            chunk = _clean_marker_text(chunk)
            chunk = _strip_trailing_label(chunk)
            chunk = chunk.strip()
            if chunk:
                sentences.append(chunk)
    return question_no, question_type, sentences


def _clean_marker_text_raw(raw: str) -> str:
    # keep newlines for the last-chunk trimmer (Korean/footer detection
    # works fine either way), just collapse repeated spaces per line
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in raw.split('\n')]
    return '\n'.join(lines)


def extract_exam_sentences(pdf_path: str):
    """
    Yields dicts: {question_no, question_type, sentence_index, text}
    for every English sentence found in the PDF.
    """
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            if not text.strip():
                continue
            q_no, q_type, sentences = extract_sentences_from_page(text)
            for idx, sent in enumerate(sentences, start=1):
                yield {
                    'question_no': q_no,
                    'question_type': q_type,
                    'sentence_index': idx,
                    'text': sent,
                }
