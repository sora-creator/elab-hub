# -*- coding: utf-8 -*-
"""
Grammar tagger dispatcher.

Picks the best available backend automatically:
  1. spaCy (accurate, real dependency parsing) -- used if `spacy` and the
     `en_core_web_sm` model are installed.
  2. regex/word-list fallback -- used otherwise (e.g. inside network-
     restricted sandboxes where the spaCy model can't be downloaded).

Call `tag_sentence(text)` same as before; call `backend_name()` to see
which one is actually active. See README.md for how to install spaCy so
this upgrades itself automatically next run.
"""
from . import spacy_tagger
from . import regex_tagger

_BACKEND = None


def backend_name() -> str:
    global _BACKEND
    if _BACKEND is None:
        _BACKEND = 'spacy' if spacy_tagger.is_available() else 'regex'
    return _BACKEND


def tag_sentence(sentence: str):
    if backend_name() == 'spacy':
        return spacy_tagger.tag_sentence(sentence)
    return regex_tagger.tag_sentence(sentence)
