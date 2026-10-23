# -*- coding: utf-8 -*-
"""
Rule-based (regex + word-list) grammar tagger.

This mirrors core.js's GRAMMAR_RULES exactly (same patterns, same
tradeoffs) so the Python CLI and the mockexam_tool.html browser app find
the same sentences. See verbs.py for why this is regex-based rather than
a real parser inside this sandbox.

Detects, per sentence, any of:
  present_participle_clause, past_participle_clause, to_infinitive,
  relative_clause, passive_voice, gerund, comparative, inversion,
  subjunctive, emphatic, noun_clause, modal_perfect

This is a heuristic tagger, not a full parser. It's meant to get you
~most of the way there fast; always spot-check results on sentences
that matter. (spacy_tagger.py is more accurate where available.)
"""
import re
from .verbs import BASE_VERBS, IRREGULAR_PAST_PARTICIPLES, ING_STOPWORDS


def _is_base_verb(word: str) -> bool:
    return word.lower() in BASE_VERBS


def _is_participle_word(word: str) -> bool:
    lw = word.lower()
    if lw in ING_STOPWORDS:
        return False
    if lw.endswith('ing') and len(lw) > 4:
        return True
    if lw in IRREGULAR_PAST_PARTICIPLES:
        return True
    if lw.endswith('ed') and len(lw) > 3:
        return True
    return False


def _is_past_participle_word(word: str) -> bool:
    lw = word.lower()
    if lw in IRREGULAR_PAST_PARTICIPLES:
        return True
    if lw.endswith('ed') and len(lw) > 3:
        return True
    return False


def _is_gerund_word(word: str) -> bool:
    lw = word.lower()
    if lw in ING_STOPWORDS:
        return False
    return lw.endswith('ing') and len(lw) > 4


def _clip(sentence, start, end, pad=0):
    return sentence[start:min(end + pad, len(sentence))].strip()


# ---- to부정사 --------------------------------------------------------------
TO_RE = re.compile(r"\bto\s+(?:not\s+|never\s+|fully\s+|really\s+)?([A-Za-z]+)\b")
TO_NOUN_HEAD_RE = re.compile(r"\b(?:want|hope|decide|plan|need|try|learn|begin|start|like|love|prefer|intend|expect|promise|agree|refuse|choose|afford|manage|attempt|wish|ask|tell|encourage|allow|enable|require|force)\s+$", re.IGNORECASE)
TO_ADJECTIVE_HEAD_RE = re.compile(r"\b(?:opportunity|chance|ability|way|time|reason|need|effort|decision|plan|right|thing|place|method|means|desire|request|proposal)\s+$", re.IGNORECASE)


def rule_to_infinitive(sentence):
    hits = []
    for m in TO_RE.finditer(sentence):
        if _is_base_verb(m.group(1)):
            before = sentence[max(0, m.start() - 45):m.start()]
            if TO_ADJECTIVE_HEAD_RE.search(before):
                usage = '형용사적 용법'
            elif TO_NOUN_HEAD_RE.search(before):
                usage = '명사적 용법'
            else:
                usage = '부사적 용법'
            hits.append({'text': sentence[m.start():m.end()], 'note': usage})
    return hits


# ---- 분사구문 (participial clause) -----------------------------------------
SENT_INITIAL_RE = re.compile(r"^([A-Z][a-zA-Z]+),?\s")
MID_COMMA_RE = re.compile(r",\s+([A-Za-z]+)\b")
WITH_RE = re.compile(
    r"\bwith\s+(?:his|her|their|its|my|your|our|the|a|an)?\s*"
    r"[A-Za-z]+(?:\s+[A-Za-z]+){0,2}\s+([A-Za-z]+)\b"
)
# after/before/since/while/when 은 전치사로도, 분사구문에서 접속사를 생략하지 않은 형태로도
# 쓰인다("After serving in the Navy, ~"). 전치사+동명사(by/of/for/... + -ing)와 겉보기엔
# 똑같아서 GERUND_PREP_RE에서는 이 단어들을 일부러 빼고 여기서 분사구문으로 잡는다.
CONJ_PARTICIPLE_RE = re.compile(r"\b(after|before|since|while|when)\s+([a-zA-Z]+)\b", re.IGNORECASE)


def _participle_tense(word: str) -> str:
    return 'past' if _is_past_participle_word(word) else 'present'


# 분사구문을 찾는 로직 자체는 그대로 두고 tense(present/past)만 같이 반환 -- core.js와
# 동일하게 두 규칙(현재분사/과거분사)이 이 결과를 나눠 가진다.
def _participial_clause_hits(sentence):
    hits = []
    m = SENT_INITIAL_RE.match(sentence)
    if m and _is_participle_word(m.group(1)) and ',' in sentence[:sentence.find(m.group(1)) + 60]:
        comma_idx = sentence.find(',')
        if comma_idx != -1 and comma_idx < 80:
            hits.append({'text': sentence[:comma_idx + 1].strip(), 'note': '문두', 'tense': _participle_tense(m.group(1))})
    for m in MID_COMMA_RE.finditer(sentence):
        word = m.group(1)
        if _is_participle_word(word) and word.lower() not in ('and', 'but', 'or', 'so', 'which', 'who', 'that'):
            hits.append({'text': _clip(sentence, m.start(), m.end(), 40), 'note': '문중', 'tense': _participle_tense(word)})
    for m in WITH_RE.finditer(sentence):
        if _is_participle_word(m.group(1)):
            hits.append({'text': sentence[m.start():m.end()].strip(), 'note': 'with 구문', 'tense': _participle_tense(m.group(1))})
    for m in CONJ_PARTICIPLE_RE.finditer(sentence):
        word = m.group(2)
        if not _is_participle_word(word):
            continue
        conj = m.group(1).lower()
        if m.start() == 0:
            comma_idx = sentence.find(',')
            end = comma_idx + 1 if (comma_idx != -1 and comma_idx < 100) else m.end()
            hits.append({'text': sentence[:end].strip(), 'note': f'접속사({conj}) 생략 안 함', 'tense': _participle_tense(word)})
        else:
            hits.append({'text': _clip(sentence, m.start(), m.end(), 40), 'note': f'접속사({conj}) 생략 안 함', 'tense': _participle_tense(word)})
    return hits


def _strip_tense(hits):
    return [{'text': h['text'], 'note': h['note']} for h in hits]


def rule_present_participle_clause(sentence):
    return _strip_tense([h for h in _participial_clause_hits(sentence) if h['tense'] == 'present'])


def rule_past_participle_clause(sentence):
    return _strip_tense([h for h in _participial_clause_hits(sentence) if h['tense'] == 'past'])


def rule_participial_clause(sentence):
    return [
        {'text': h['text'], 'note': '현재분사형' if h['tense'] == 'present' else '과거분사형'}
        for h in _participial_clause_hits(sentence)
    ]


def rule_present_participle(sentence):
    # Accurate modifier-vs-gerund classification requires the spaCy backend.
    return []


def rule_past_participle(sentence):
    return []


# ---- 관계사절 (relative clause) --------------------------------------------
REL_PRONOUN_RE = re.compile(r"\b(who|whom|whose|which|that)\b", re.IGNORECASE)
REL_ADVERB_RE = re.compile(r"\b(the|a|an)\s+\w+\s+(where|when|why)\b")


def rule_relative_clause(sentence):
    hits = []
    for m in REL_PRONOUN_RE.finditer(sentence):
        pronoun = m.group(1).lower()
        after = sentence[m.end():m.end() + 24].lstrip()
        if pronoun == 'whose':
            case = '소유격'
        elif pronoun == 'whom' or re.match(r'(?:I|you|he|she|it|we|they|[A-Z][a-z]+)\b', after):
            case = '목적격'
        else:
            case = '주격'
        hits.append({'text': _clip(sentence, m.start(), m.end(), 40), 'note': pronoun + ' · ' + case})
    for m in REL_ADVERB_RE.finditer(sentence):
        adverb = m.group(2).lower()
        meaning = {'where': '장소', 'when': '시간', 'why': '이유'}[adverb]
        hits.append({'text': _clip(sentence, m.start(), m.end(), 40), 'note': adverb + ' · ' + meaning + ' 관계부사'})
    return hits


# ---- 수동태 (passive voice) -------------------------------------------------
PASSIVE_RE = re.compile(r"\b(is|are|was|were|am|be|been|being)\s+(?:not\s+|never\s+|also\s+)?([A-Za-z]+)\b")


def rule_passive_voice(sentence):
    hits = []
    for m in PASSIVE_RE.finditer(sentence):
        if _is_past_participle_word(m.group(2)):
            hits.append({'text': sentence[m.start():m.end()].strip(), 'note': None})
    return hits


# ---- 동명사 (gerund) ---------------------------------------------------------
GERUND_SUBJECT_RE = re.compile(r"^([A-Z][a-z]+ing)\s+(is|was|has|makes|means|helps|leads|takes|requires)\b")
GERUND_PREP_RE = re.compile(r"\b(by|of|for|in|on|about|without|instead of|besides|from)\s+([a-z]+ing)\b")
GERUND_VERB_RE = re.compile(
    r"\b(enjoy|enjoys|enjoyed|consider|considers|considered|avoid|avoids|avoided|finish|finishes|finished|"
    r"mind|minds|minded|suggest|suggests|suggested|recommend|recommends|recommended|keep|keeps|kept|"
    r"practice|practices|practiced|imagine|imagines|imagined|deny|denies|denied|quit|quits|resist|resists|"
    r"resisted|risk|risks|risked|give up|gave up|stop|stops|stopped|involve|involves|involved)\s+([a-z]+ing)\b"
)


def rule_gerund(sentence):
    hits = []
    m = GERUND_SUBJECT_RE.match(sentence)
    if m and _is_gerund_word(m.group(1)):
        hits.append({'text': m.group(0).strip(), 'note': '주어 역할'})
    for m in GERUND_PREP_RE.finditer(sentence):
        if _is_gerund_word(m.group(2)):
            hits.append({'text': sentence[m.start():m.end()].strip(), 'note': '전치사 + 동명사'})
    for m in GERUND_VERB_RE.finditer(sentence):
        if _is_gerund_word(m.group(2)):
            hits.append({'text': sentence[m.start():m.end()].strip(), 'note': '동사의 목적어'})
    return hits


# ---- 비교구문 (comparative / superlative) ------------------------------------
COMPARATIVE_ER_RE = re.compile(r"\b[a-z]{3,}er\s+than\b", re.IGNORECASE)
COMPARATIVE_MORE_RE = re.compile(r"\bmore\s+[a-z]+\s+than\b", re.IGNORECASE)
SUPERLATIVE_RE = re.compile(r"\b(the\s+)?most\s+[a-z]+\b|\bthe\s+[a-z]{3,}est\b", re.IGNORECASE)
AS_AS_RE = re.compile(r"\bas\s+[a-z]+\s+as\b", re.IGNORECASE)
THE_ER_THE_ER_RE = re.compile(r"\bthe\s+[a-z]+er\b[^.!?]*\bthe\s+[a-z]+er\b", re.IGNORECASE)

_COMPARATIVE_PATTERNS = [
    (COMPARATIVE_ER_RE, '비교급 (-er than)'),
    (COMPARATIVE_MORE_RE, '비교급 (more ~ than)'),
    (SUPERLATIVE_RE, '최상급'),
    (AS_AS_RE, '원급 비교 (as~as)'),
    (THE_ER_THE_ER_RE, 'the 비교급 the 비교급'),
]


def rule_comparative(sentence):
    hits = []
    for pattern, note in _COMPARATIVE_PATTERNS:
        for m in pattern.finditer(sentence):
            hits.append({'text': m.group(0).strip(), 'note': note})
    return hits


# ---- 도치구문 (inversion) -----------------------------------------------------
INVERSION_START_RE = re.compile(
    r"^(Never|Rarely|Seldom|Little|Hardly|Scarcely|Not only|No sooner|Nowhere|Not until|"
    r"Only (?:then|after|when|by|in|through|later|recently)[^,]*)\b[^.!?]*\b"
    r"(do|does|did|is|are|was|were|has|have|had|will|would|can|could|should|might)\b"
)
SO_SUCH_INVERSION_RE = re.compile(
    r"^(So|Such)\s+(?!it\b|he\b|she\b|they\b|we\b|I\b|you\b|there\b)[a-zA-Z]+\b[^.!?]*\b"
    r"(is|are|was|were|did|does|do)\b"
)


def rule_inversion(sentence):
    hits = []
    m = INVERSION_START_RE.match(sentence)
    if m:
        hits.append({'text': _clip(sentence, 0, m.end(), 20), 'note': None})
    m = SO_SUCH_INVERSION_RE.match(sentence)
    if m:
        hits.append({'text': _clip(sentence, 0, m.end(), 20), 'note': None})
    return hits


# ---- 가정법 (subjunctive / conditional) ---------------------------------------
IF_SUBJUNCTIVE_RE = re.compile(r"\bif\s+[^,.!?]*\b(were|had\s+[a-z]+ed|had\s+[a-z]+)\b", re.IGNORECASE)
MODAL_HAVE_PP_RE = re.compile(r"\b(would|could|might|should)\s+(?:not\s+)?have\s+([a-z]+)\b", re.IGNORECASE)
WISH_RE = re.compile(r"\bwish(?:ed)?\s+[^.!?]*\b(were|had|could)\b", re.IGNORECASE)
AS_IF_RE = re.compile(r"\b(as if|as though)\s+[^.!?]*\b(were|had)\b", re.IGNORECASE)

_SUBJUNCTIVE_PATTERNS = [
    (IF_SUBJUNCTIVE_RE, 'if + 과거/과거완료'),
    (WISH_RE, 'wish + 가정법'),
    (AS_IF_RE, 'as if/as though'),
]


def rule_subjunctive(sentence):
    hits = []
    for pattern, note in _SUBJUNCTIVE_PATTERNS:
        for m in pattern.finditer(sentence):
            hits.append({'text': m.group(0).strip(), 'note': note})
    for m in MODAL_HAVE_PP_RE.finditer(sentence):
        if _is_past_participle_word(m.group(2)):
            hits.append({'text': m.group(0).strip(), 'note': '조동사 + have p.p.'})
    return hits


# ---- 강조구문 (it ~ that emphasis) --------------------------------------------
EMPHATIC_RE = re.compile(r"\bIt\s+(is|was)\s+.{2,40}?\s+that\b")


def rule_emphatic(sentence):
    return [{'text': m.group(0).strip(), 'note': None} for m in EMPHATIC_RE.finditer(sentence)]


# ---- 명사절 접속사 (that / whether / if) ---------------------------------------
NOUN_CLAUSE_THAT_RE = re.compile(
    r"\b(know|knows|knew|think|thinks|thought|believe|believes|believed|say|says|said|hope|hopes|hoped|"
    r"feel|feels|felt|realize|realizes|realized|notice|notices|noticed|find|finds|found|show|shows|showed|"
    r"mean|means|meant|suggest|suggests|suggested|argue|argues|argued|claim|claims|claimed|admit|admits|"
    r"admitted|deny|denies|denied|announce|announces|announced|report|reports|reported|assume|assumes|"
    r"assumed|prove|proves|proved|discover|discovers|discovered)\s+that\b"
)
NOUN_CLAUSE_WHETHER_RE = re.compile(
    r"\b(wonder|wonders|wondered|ask|asks|asked|know|knows|knew|decide|decides|decided|doubt|doubts|doubted)"
    r"\s+(whether|if)\b"
)


def rule_noun_clause(sentence):
    hits = [{'text': m.group(0).strip(), 'note': 'that'} for m in NOUN_CLAUSE_THAT_RE.finditer(sentence)]
    hits += [{'text': m.group(0).strip(), 'note': m.group(2)} for m in NOUN_CLAUSE_WHETHER_RE.finditer(sentence)]
    return hits


# ---- 조동사 + have + p.p. (modal perfect) --------------------------------------
MODAL_PERFECT_RE = re.compile(
    r"\b(must|should|shouldn't|couldn't|wouldn't|can't|cannot|may|might)\s+(?:not\s+)?have\s+([a-z]+)\b",
    re.IGNORECASE,
)


def rule_modal_perfect(sentence):
    hits = []
    for m in MODAL_PERFECT_RE.finditer(sentence):
        if _is_past_participle_word(m.group(2)):
            hits.append({'text': m.group(0).strip(), 'note': None})
    return hits


# ---------------------------------------------------------------- rules registry
# Add a new grammar point by appending here -- ingest.py/query.py iterate
# this list generically, so no other code needs to change.
GRAMMAR_RULES = [
    ('participial_clause', '분사구문', rule_participial_clause),
    ('present_participle', '현재분사', rule_present_participle),
    ('past_participle', '과거분사', rule_past_participle),
    ('to_infinitive', 'to부정사', rule_to_infinitive),
    ('relative_clause', '관계사절', rule_relative_clause),
    ('passive_voice', '수동태', rule_passive_voice),
    ('gerund', '동명사', rule_gerund),
    ('comparative', '비교구문', rule_comparative),
    ('inversion', '도치구문', rule_inversion),
    ('subjunctive', '가정법', rule_subjunctive),
    ('emphatic', '강조구문 (it~that)', rule_emphatic),
    ('noun_clause', '명사절 접속사 (that/whether/if)', rule_noun_clause),
    ('modal_perfect', '조동사 + have + p.p.', rule_modal_perfect),
]


def tag_sentence(sentence: str):
    """Returns dict: {rule_id: [{'text':..., 'note':...}, ...], ...} for all rules."""
    return {rule_id: detect(sentence) for rule_id, _label, detect in GRAMMAR_RULES}
