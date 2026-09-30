(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ELABSentenceStructureStudentCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUPPORT_LEVELS = ['foundation', 'beginner', 'intermediate', 'advanced'];
  const ERROR_TYPES = ['SUBJECT_SPAN', 'VERB_SPAN', 'REQUIRED_CHUNK_MISSED', 'FORBIDDEN_CHUNK_USED'];

  function uniqueIndexes(values, max) {
    return [...new Set((values || []).map(Number))]
      .filter(value => Number.isInteger(value) && value >= 0 && value < max)
      .sort((a, b) => a - b);
  }

  function normalizeSpan(span, tokenCount) {
    return uniqueIndexes(span, tokenCount);
  }

  function key(span) {
    return [...span].sort((a, b) => a - b).join(',');
  }

  function sameSpan(a, b) {
    return key(a) === key(b);
  }

  function verbSurfaceSpan(indexes, tokenCount) {
    const canonical = normalizeSpan(indexes, tokenCount);
    if (canonical.length < 2) return canonical;
    return Array.from({ length: canonical.at(-1) - canonical[0] + 1 }, (_, offset) => canonical[0] + offset);
  }

  function acceptedVerbSpans(record, target) {
    const canonical = normalizeSpan(target.indexes, record.tokens.length);
    const surface = verbSurfaceSpan(canonical, record.tokens.length);
    const expressionSpans = (record.expressions || [])
      .map(item => normalizeSpan(item.token_indexes, record.tokens.length))
      .filter(span => span.length > canonical.length && canonical.every((index, position) => span[position] === index));
    const spans = [canonical, ...(!sameSpan(canonical, surface) ? [surface] : []), ...expressionSpans];
    return [...new Map(spans.map(span => [key(span), span])).values()];
  }

  function validateRecord(record) {
    if (!record || !record.sentence_id || !Array.isArray(record.tokens) || !record.tokens.length) throw new Error('Invalid sentence record');
    if (!/^S[1-5]$/.test(record.structure_level)) throw new Error(`Invalid structure level: ${record.sentence_id}`);
    if (!record.subjects?.length || !record.verbs?.length) throw new Error(`Missing S/V answers: ${record.sentence_id}`);
    if (record.boundaries?.length !== record.tokens.length - 1) throw new Error(`Incomplete boundary policy: ${record.sentence_id}`);
    for (const item of record.boundaries) if (!['MUST_SPLIT', 'OPTIONAL_SPLIT', 'NO_SPLIT'].includes(item.policy)) throw new Error(`Invalid boundary policy: ${record.sentence_id}`);
    return true;
  }

  function matchTargets(answers, targets, acceptedSpans, tokenCount) {
    const remaining = targets.map((target, index) => ({ index, accepted: acceptedSpans(target).map(span => normalizeSpan(span, tokenCount)) }));
    const extra = [];
    for (const raw of answers || []) {
      const answer = normalizeSpan(raw, tokenCount);
      const match = remaining.findIndex(target => target.accepted.some(span => sameSpan(span, answer)));
      if (match === -1) extra.push(answer);
      else remaining.splice(match, 1);
    }
    return { correct: remaining.length === 0 && extra.length === 0, missing: remaining.map(item => item.index), extra };
  }

  function matchVerbTargets(record, answers, targets, tokenCount) {
    const remainingAnswers = (answers || []).map(answer => normalizeSpan(answer, tokenCount));
    const missing = [];
    targets.forEach((target, targetIndex) => {
      const canonical = normalizeSpan(target.indexes, tokenCount);
      const surface = verbSurfaceSpan(canonical, tokenCount);
      const accepted = acceptedVerbSpans(record, target);
      const direct = remainingAnswers.findIndex(answer => accepted.some(span => sameSpan(answer, span)));
      if (direct >= 0) {
        remainingAnswers.splice(direct, 1);
        return;
      }
      if (!sameSpan(canonical, surface)) {
        const canonicalSet = new Set(canonical);
        const fragments = remainingAnswers.map((answer, index) => ({ answer, index })).filter(item => item.answer.length && item.answer.every(index => canonicalSet.has(index)));
        const merged = uniqueIndexes(fragments.flatMap(item => item.answer), tokenCount);
        if (fragments.length > 1 && sameSpan(merged, canonical)) {
          fragments.map(item => item.index).sort((a, b) => b - a).forEach(index => remainingAnswers.splice(index, 1));
          return;
        }
      }
      missing.push(targetIndex);
    });
    return { correct: missing.length === 0 && remainingAnswers.length === 0, missing, extra: remainingAnswers };
  }

  function evaluateStructure(record, subjectAnswers, verbAnswers) {
    validateRecord(record);
    const subject = matchTargets(subjectAnswers, record.subjects, target => [target.primary, ...(target.acceptable || [])], record.tokens.length);
    const verb = matchVerbTargets(record, verbAnswers, record.verbs, record.tokens.length);
    return {
      correct: subject.correct && verb.correct,
      subject_correct: subject.correct,
      verb_correct: verb.correct,
      subject,
      verb,
      error_types: [!subject.correct && 'SUBJECT_SPAN', !verb.correct && 'VERB_SPAN'].filter(Boolean)
    };
  }

  function evaluateChunks(record, selectedJunctions) {
    validateRecord(record);
    const selected = new Set(uniqueIndexes(selectedJunctions, record.tokens.length - 1));
    const requiredMissed = [];
    const forbiddenUsed = [];
    const optionalUsed = [];
    for (const boundary of record.boundaries) {
      if (boundary.policy === 'MUST_SPLIT' && !selected.has(boundary.junction)) requiredMissed.push(boundary.junction);
      if (boundary.policy === 'NO_SPLIT' && selected.has(boundary.junction)) forbiddenUsed.push(boundary.junction);
      if (boundary.policy === 'OPTIONAL_SPLIT' && selected.has(boundary.junction)) optionalUsed.push(boundary.junction);
    }
    return {
      correct: requiredMissed.length === 0 && forbiddenUsed.length === 0,
      required_missed: requiredMissed,
      forbidden_used: forbiddenUsed,
      optional_used: optionalUsed,
      error_types: [requiredMissed.length && 'REQUIRED_CHUNK_MISSED', forbiddenUsed.length && 'FORBIDDEN_CHUNK_USED'].filter(Boolean)
    };
  }

  function hintJunctions(record, level) {
    validateRecord(record);
    const support = SUPPORT_LEVELS.includes(level) ? level : 'beginner';
    const must = record.boundaries.filter(item => item.policy === 'MUST_SPLIT').map(item => item.junction);
    const optional = record.boundaries.filter(item => item.policy === 'OPTIONAL_SPLIT').map(item => item.junction);
    if (support === 'advanced') return [...new Set(must)].sort((a, b) => a - b);
    if (support === 'intermediate') return [...new Set([...must, ...optional])].sort((a, b) => a - b);
    if (support === 'beginner') return [...new Set([...must, ...optional, ...(record.support?.beginner || [])])].sort((a, b) => a - b);
    return [...new Set([...must, ...optional, ...(record.support?.beginner || []), ...(record.support?.foundation || [])])].sort((a, b) => a - b);
  }

  function correctSubjectSpans(record) {
    return record.subjects.map(target => [...target.primary]);
  }

  function correctVerbSpans(record) {
    return record.verbs.map(target => [...target.indexes]);
  }

  function buildResult(record, state, completedAt) {
    const structure = evaluateStructure(record, state.subject_answers, state.verb_answers);
    const chunks = evaluateChunks(record, state.chunk_boundaries);
    const assignedHintLevel = ['NONE', 'BASIC', 'DETAILED'].includes(state.assigned_hint_level) ? state.assigned_hint_level : 'DETAILED';
    const smartHintShown = assignedHintLevel !== 'NONE' && Boolean(state.smart_hint_visible || record.sv_hint);
    return {
      sentence_id: record.sentence_id,
      structure_level: record.structure_level,
      subject_attempts: state.subject_attempts,
      subject_correct: structure.subject_correct,
      verb_attempts: state.verb_attempts,
      verb_correct: structure.verb_correct,
      chunk_required_missed: chunks.required_missed.length,
      chunk_forbidden_used: chunks.forbidden_used.length,
      chunk_optional_used: chunks.optional_used.length,
      sv_hint_type: state.sv_hint_used ? (state.sv_hint_type || record.sv_hint?.type || null) : null,
      sv_hint_level: state.sv_hint_used ? Number(state.sv_hint_level || 0) : 0,
      sv_hint_used: Boolean(state.sv_hint_used),
      assigned_hint_level: assignedHintLevel,
      hint_used: smartHintShown,
      second_hint_used: assignedHintLevel === 'DETAILED' && Boolean(state.second_hint_used || state.sv_hint_used),
      chunk_hint_used: Boolean(state.hint_used),
      reading_support_level: state.reading_support_level,
      expression_ids_shown: (record.expressions || []).map(item => item.expression_id),
      error_types: [...new Set([...structure.error_types, ...chunks.error_types])].filter(type => ERROR_TYPES.includes(type)),
      completed_at: completedAt || new Date().toISOString()
    };
  }

  return {
    SUPPORT_LEVELS,
    ERROR_TYPES,
    validateRecord,
    normalizeSpan,
    sameSpan,
    acceptedVerbSpans,
    evaluateStructure,
    evaluateChunks,
    hintJunctions,
    correctSubjectSpans,
    correctVerbSpans,
    buildResult
  };
});
