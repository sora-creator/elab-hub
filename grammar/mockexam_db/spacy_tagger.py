# -*- coding: utf-8 -*-
"""
spaCy-based grammar tagger (accurate backend).

Uses real dependency parsing instead of regex/word-lists where that
clearly helps (participial clause, to-infinitive, relative clause,
passive voice, gerund, noun-clause conjunctions), so it correctly tells
apart e.g. a gerund subject ("Swimming is fun") from a participial
adverbial clause ("Swimming across the lake, she felt free"), or a
relative "who" from an interrogative "who" in an indirect question.

The remaining grammar points (comparative, inversion, subjunctive,
emphatic it~that, modal perfect) are mostly lexical/structural patterns
that a dependency parse doesn't simplify much, so those reuse the same
regex patterns as regex_tagger.py.

Requires: `pip install spacy` + `python -m spacy download en_core_web_sm`
This import is lazy/optional -- see tagger.py, which falls back to
regex_tagger.py automatically if spaCy or its model isn't installed.
"""
from . import regex_tagger

_NLP = None
_LOAD_ERROR = None

# after/before/since/while/when 은 전치사로도, (분사구문에서) 접속사를 생략하지 않은
# 형태의 접속사로도 쓰인다. "After serving in the Navy, ~"를 spaCy에 태우면 구조적으로는
# After(prep) -> serving(pcomp, VBG)로 파싱되어 진짜 "전치사+동명사"(예: By working hard)와
# 겉보기엔 구별이 안 되지만, 한국 학교문법에서는 이걸 "동명사"가 아니라 "분사구문(접속사를
# 남겨둔 경우)"으로 가르친다. 그래서 이 전치사들 뒤의 pcomp(VBG/VBN)는 동명사 판정에서
# 빼고 분사구문 쪽으로 돌린다.
_CONJ_LIKE_PREPS = {'after', 'before', 'since', 'while', 'when'}


def _get_nlp():
    global _NLP, _LOAD_ERROR
    if _NLP is not None or _LOAD_ERROR is not None:
        return _NLP
    try:
        import spacy
        _NLP = spacy.load('en_core_web_sm')
    except Exception as e:  # model missing, spacy not installed, etc.
        _LOAD_ERROR = e
        _NLP = None
    return _NLP


def is_available() -> bool:
    return _get_nlp() is not None


def _span_text(tokens):
    tokens = sorted(tokens, key=lambda t: t.i)
    if not tokens:
        return ''
    return tokens[0].doc[tokens[0].i:tokens[-1].i + 1].text


def _subtree_span(token):
    return _span_text(list(token.subtree))


# ---- to부정사 ----------------------------------------------------------------
_NOUN_INFINITIVE_HEADS = {
    'agree', 'afford', 'allow', 'ask', 'attempt', 'begin', 'choose', 'decide',
    'encourage', 'expect', 'fail', 'force', 'forget', 'help', 'hope', 'intend',
    'learn', 'like', 'love', 'manage', 'mean', 'need', 'offer', 'permit', 'plan',
    'prefer', 'prepare', 'promise', 'refuse', 'remember', 'start', 'tell', 'try',
    'want', 'wish', 'would', 'enable', 'require',
}


def _to_infinitive_usage(verb):
    """Classify the infinitive using its dependency role for school grammar."""
    # spaCy often attaches a purpose infinitive to the destination noun in
    # "went to the library to study". Trace that noun through its preposition
    # back to a motion verb before treating an acl as adjectival.
    if verb.dep_ in ('acl', 'relcl') and verb.head.dep_ == 'pobj' and verb.head.head.dep_ == 'prep':
        governing = verb.head.head.head
        if governing.lemma_.lower() in {'go', 'come', 'leave', 'return', 'travel', 'visit', 'move', 'run', 'walk', 'drive', 'fly'}:
            return '부사적 용법'
    if verb.dep_ in ('acl', 'relcl') or verb.head.pos_ in ('NOUN', 'PROPN'):
        return '형용사적 용법'
    if verb.dep_ in ('nsubj', 'nsubjpass', 'csubj', 'csubjpass', 'attr', 'oprd'):
        return '명사적 용법'
    if verb.dep_ == 'xcomp' and verb.head.lemma_.lower() in _NOUN_INFINITIVE_HEADS:
        return '명사적 용법'
    if verb.dep_ == 'advcl' or verb.head.pos_ == 'ADJ':
        return '부사적 용법'
    # Purpose/result infinitives attached to an ordinary verb are adverbial.
    return '부사적 용법'


def _find_to_infinitives(doc):
    hits = []
    for tok in doc:
        if tok.lower_ == 'to' and tok.pos_ == 'PART' and tok.dep_ in ('aux', 'mark'):
            verb = tok.head
            if verb.pos_ == 'VERB':
                span_tokens = [t for t in verb.subtree if t.i >= tok.i]
                span_tokens.append(tok)
                text = _span_text(span_tokens)
                if text:
                    hits.append({'text': text, 'note': _to_infinitive_usage(verb)})
    return hits


# ---- 분사구문 (현재분사 VBG / 과거분사 VBN 을 따로 찾음) ------------------------------
def _find_participial_clauses(doc, wanted_tag):
    hits = []
    for tok in doc:
        if tok.dep_ == 'advcl' and tok.tag_ == wanted_tag:
            has_own_subject = any(c.dep_ in ('nsubj', 'nsubjpass') for c in tok.children)
            if not has_own_subject:
                hits.append({'text': _subtree_span(tok), 'note': 'advcl'})
    for tok in doc:
        if tok.lower_ == 'with' and tok.dep_ == 'prep':
            for child in tok.children:
                if child.tag_ == wanted_tag and child.dep_ in ('pcomp', 'acomp', 'advcl'):
                    hits.append({'text': _subtree_span(tok), 'note': 'with 구문'})
                # "with this idea, or at least swimming ~"처럼 등위접속된 항목이 with의
                # 목적어(pobj)가 아니라 with 자신에 곧바로 conj로 붙는 경우도 있다.
                elif child.tag_ == wanted_tag and child.dep_ == 'conj':
                    hits.append({'text': _subtree_span(tok), 'note': 'with 구문(등위접속)'})
        elif tok.lower_ in _CONJ_LIKE_PREPS and tok.dep_ == 'prep':
            for child in tok.children:
                if child.tag_ == wanted_tag and child.dep_ == 'pcomp':
                    hits.append({'text': _subtree_span(tok), 'note': '접속사(' + tok.lower_ + ') 생략 안 함'})
                elif child.tag_ == wanted_tag and child.dep_ == 'conj':
                    hits.append({'text': _subtree_span(tok), 'note': '접속사(' + tok.lower_ + ') 생략 안 함(등위접속)'})
    # "it's on board with this idea, or at least swimming alongside the boat"처럼
    # be동사에 or/and로 등위접속된 -ing는 명사(동명사)가 아니라 진행형이 반복되는 주절의
    # 일부(elided "it's ~ing")다 -- 동명사가 아니라 분사로 분류한다. VBN 쪽(과거분사)은
    # 일부러 안 건드림: "was written, or edited"처럼 be+등위접속 VBN은 수동태 반복이라
    # 분사구문이 아니라 수동태 쪽 문제라서, 여기서 같이 섞으면 새로운 오분류가 생김.
    if wanted_tag == 'VBG':
        for tok in doc:
            if tok.dep_ == 'conj' and tok.tag_ == wanted_tag and tok.head.lemma_ == 'be':
                hits.append({'text': _subtree_span(tok), 'note': 'be동사에 등위접속(진행형 반복)'})
    return hits


def _find_present_participle_clauses(doc):
    return _find_participial_clauses(doc, 'VBG')


def _find_past_participle_clauses(doc):
    return _find_participial_clauses(doc, 'VBN')


def _find_participial_clauses_combined(doc):
    hits = []
    for hit in _find_present_participle_clauses(doc):
        hits.append({'text': hit['text'], 'note': '현재분사형'})
    for hit in _find_past_participle_clauses(doc):
        hits.append({'text': hit['text'], 'note': '과거분사형'})
    return hits


def _find_present_participle(doc):
    return [
        {'text': _subtree_span(tok), 'note': '명사 수식'}
        for tok in doc if tok.tag_ == 'VBG' and tok.dep_ in ('acl', 'amod', 'relcl')
    ]


def _find_past_participle(doc):
    return [
        {'text': _subtree_span(tok), 'note': '명사 수식'}
        for tok in doc if tok.tag_ == 'VBN' and tok.dep_ in ('acl', 'amod')
    ]


# ---- 관계사절 -------------------------------------------------------------------
def _is_to_infinitive_clause(tok):
    """spaCy mislabels noun-modifying to-infinitives (e.g. 'reasons to do them')
    with dep_ == 'relcl' even though there's no relative pronoun. Detect the
    'to' aux child to filter those out."""
    return any(c.lower_ == 'to' and c.dep_ == 'aux' for c in tok.children)


def _find_relative_clause(doc):
    hits = []
    for tok in doc:
        # relcl = relative clause head; relpron dep on who/which/that etc.
        if tok.dep_ == 'relcl' and not _is_to_infinitive_clause(tok):
            relative_adverbs = [t for t in tok.subtree if t.lower_ in ('where', 'when', 'why') and t.dep_ == 'advmod']
            relatives = [t for t in tok.subtree if t.lower_ in ('who', 'whom', 'whose', 'which', 'that')]
            if relative_adverbs:
                rel = relative_adverbs[0]
                meaning = {'where': '장소', 'when': '시간', 'why': '이유'}[rel.lower_]
                note = rel.lower_ + ' · ' + meaning + ' 관계부사'
            elif relatives:
                rel = relatives[0]
                if rel.lower_ == 'whose':
                    case = '소유격'
                elif rel.dep_ in ('nsubj', 'nsubjpass'):
                    case = '주격'
                else:
                    case = '목적격'
                note = rel.lower_ + ' · ' + case
            else:
                note = '관계대명사 생략 · 목적격'
            hits.append({'text': _subtree_span(tok), 'note': note})
        elif tok.dep_ == 'poss' and tok.lower_ == 'whose':
            hits.append({'text': _subtree_span(tok.head), 'note': 'whose · 소유격'})
    return hits


# ---- 수동태 ---------------------------------------------------------------------
def _find_passive_voice(doc):
    hits = []
    for tok in doc:
        if tok.dep_ in ('nsubjpass', 'auxpass'):
            verb = tok.head
            hits.append({'text': _subtree_span(verb), 'note': None})
    # dedupe by text (nsubjpass and auxpass of the same verb both fire)
    seen = set()
    deduped = []
    for h in hits:
        if h['text'] not in seen:
            seen.add(h['text'])
            deduped.append(h)
    return deduped


# ---- 동명사 ----------------------------------------------------------------------
_GERUND_DEPS = (
    'nsubj', 'dobj', 'obj', 'pobj', 'attr', 'nsubjpass',
    'xcomp', 'pcomp', 'csubj', 'csubjpass', 'conj',
)


def _find_gerund(doc):
    hits = []
    for tok in doc:
        if tok.tag_ == 'VBG' and tok.dep_ in _GERUND_DEPS:
            # "After/Before/Since/While/When + V-ing"는 구조적으로 pcomp라 동명사 패턴과
            # 똑같이 잡히지만, 위 _find_participial_clauses가 분사구문으로 이미 처리하므로
            # 여기서는 제외해서 같은 구절이 동명사+분사구문 둘 다로 중복 판정되지 않게 한다.
            if tok.dep_ == 'pcomp' and tok.head.dep_ == 'prep' and tok.head.lower_ in _CONJ_LIKE_PREPS:
                continue
            # be동사에 등위접속된 -ing(elided "it's ~ing" 반복)도 위와 같은 이유로 제외 --
            # _find_participial_clauses가 분사로 이미 잡는다.
            if tok.dep_ == 'conj' and tok.head.lemma_ == 'be':
                continue
            # "with this idea, or at least swimming ~"처럼 with/after/before/... 에
            # 곧바로 conj로 붙은 -ing도 마찬가지 -- 위 _find_participial_clauses가 이미 잡음.
            if tok.dep_ == 'conj' and tok.head.dep_ == 'prep' and (tok.head.lower_ == 'with' or tok.head.lower_ in _CONJ_LIKE_PREPS):
                continue
            hits.append({'text': _subtree_span(tok), 'note': tok.dep_})
    return hits


# ---- 명사절 접속사 ------------------------------------------------------------------
def _find_noun_clause(doc):
    hits = []
    for tok in doc:
        if tok.dep_ == 'ccomp':
            marks = [c for c in tok.children if c.dep_ == 'mark' and c.lower_ in ('that', 'whether', 'if')]
            for mark in marks:
                hits.append({'text': _subtree_span(tok.head) if tok.head != tok else _subtree_span(tok),
                              'note': mark.lower_})
    return hits


# ---- rules that stay regex-based even with spaCy loaded (mostly lexical) ---------
def _regex_based(rule_fn):
    def wrapper(doc):
        return rule_fn(doc.text)
    return wrapper


_HANDLERS = {
    'participial_clause': _find_participial_clauses_combined,
    'present_participle': _find_present_participle,
    'past_participle': _find_past_participle,
    'to_infinitive': _find_to_infinitives,
    'relative_clause': _find_relative_clause,
    'passive_voice': _find_passive_voice,
    'gerund': _find_gerund,
    'comparative': _regex_based(regex_tagger.rule_comparative),
    'inversion': _regex_based(regex_tagger.rule_inversion),
    'subjunctive': _regex_based(regex_tagger.rule_subjunctive),
    'emphatic': _regex_based(regex_tagger.rule_emphatic),
    'noun_clause': _find_noun_clause,
    'modal_perfect': _regex_based(regex_tagger.rule_modal_perfect),
}


def tag_sentence(sentence: str):
    nlp = _get_nlp()
    if nlp is None:
        raise RuntimeError(f"spaCy model not available: {_LOAD_ERROR}")
    doc = nlp(sentence)
    return {tag_type: handler(doc) for tag_type, handler in _HANDLERS.items()}
