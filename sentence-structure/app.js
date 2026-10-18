(async function () {
  'use strict';
  const assignmentIntegration = window.ELABSentenceStructureStaging;
  if (assignmentIntegration?.active) {
    try { await assignmentIntegration.ready; }
    catch (error) {
      document.getElementById('app').innerHTML = `<div class="load-error">${String(error?.message || '배정 정보를 불러오지 못했습니다.')}</div>`;
      return;
    }
  }
  const C = window.ELABSentenceStructureStudentCore;
  const H = window.ELABSentenceStructureSmartHints;
  const G = window.ELABSentenceStructureChunkGuide;
  const N = window.ELABSentenceStructureSVContinuation;
  const dataset = window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1;
  const hintDataset = window.ELAB_SENTENCE_STRUCTURE_SV_HINTS;
  const app = document.getElementById('app');
  const supportSelect = document.getElementById('supportLevel');
  const SCORING_VERSION = 'student-v1-23';
  if (!C || !N || !dataset?.records?.length) {
    app.innerHTML = '<div class="load-error">학습 데이터를 불러오지 못했습니다. 로컬 fixture를 먼저 생성해주세요.</div>';
    return;
  }
  dataset.records.forEach(C.validateRecord);
  const params = new URLSearchParams(location.search);
  const HINT_LEVELS = ['NONE', 'BASIC', 'DETAILED'];
  function capabilityMetadata(capability, key) {
    try {
      let encoded = String(capability || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (encoded.length % 4) encoded += '=';
      const payload = JSON.parse(atob(encoded));
      return String(payload?.metadata?.[key] || '');
    } catch (_) { return ''; }
  }
  const signedHintCandidate = params.get('assignment_target_id') ? capabilityMetadata(params.get('assignmentCapability'), 'hint_level').toUpperCase() : '';
  const signedHintLevel = HINT_LEVELS.includes(signedHintCandidate) ? signedHintCandidate : '';
  const requestedHintLevel = String(params.get('hint_level') || '').toUpperCase();
  // Legacy/local links had the fully expanded hint flow. Preserve that behavior.
  const assignedHintLevel = signedHintLevel || (HINT_LEVELS.includes(requestedHintLevel) ? requestedHintLevel : 'DETAILED');
  const signedSupport = params.get('assignment_target_id') ? capabilityMetadata(params.get('assignmentCapability'), 'reading_support_level').toLowerCase() : '';
  const requestedSupport = params.get('reading_support');
  const initialSupport = C.SUPPORT_LEVELS.includes(signedSupport) ? signedSupport : C.SUPPORT_LEVELS.includes(requestedSupport) ? requestedSupport : 'beginner';
  const assignmentScope = params.get('assignment_target_id') || params.get('assignment_id') || '';
  const storageKey = `elab.student.sentence-structure.v1.${dataset.fingerprint}${assignmentScope ? `.${assignmentScope}` : ''}`;

  function blankDraft(level) {
    return { stage: 'structure', mode: 'subject', manual_mode: false, selected: [], subject_answers: [], verb_answers: [], editing: null, answer_menu: null, undo_stack: [], subject_attempts: 0, verb_attempts: 0, assigned_hint_level: assignedHintLevel, smart_hint_visible: false, sv_hint_type: null, sv_hint_level: 0, sv_hint_used: false, second_hint_used: false, sv_hint_open: true, chunk_boundaries: [], chunk_guide_expanded: false, hint_used: false, hints_visible: false, reading_support_level: level, structure_result: null, chunk_result: null, message: '', message_kind: 'neutral' };
  }
  function normalizeSaved(saved) {
    const level = C.SUPPORT_LEVELS.includes(saved?.draft?.reading_support_level) ? saved.draft.reading_support_level : initialSupport;
    if (typeof saved.intro_complete !== 'boolean') saved.intro_complete = true;
    saved.draft = { ...blankDraft(level), ...(saved.draft || {}) };
    saved.draft.assigned_hint_level = assignedHintLevel;
    if (assignedHintLevel !== 'DETAILED') {
      saved.draft.sv_hint_level = 0;
      saved.draft.sv_hint_used = false;
      saved.draft.second_hint_used = false;
    }
    if (!Array.isArray(saved.draft.undo_stack)) saved.draft.undo_stack = [];
    if (!Array.isArray(saved.attempt_history)) saved.attempt_history = [];
    saved.draft.selected = [];
    const savedRecord = dataset.records[Number(saved.current_index)];
    const submitted = Boolean(saved.draft.structure_result) || saved.draft.stage === 'structure-review';
    const hasRawAnswers = Array.isArray(saved.draft.subject_answers) && Array.isArray(saved.draft.verb_answers) && saved.draft.subject_answers.length && saved.draft.verb_answers.length;
    if (submitted && savedRecord && hasRawAnswers) {
      saved.draft.structure_result = C.evaluateStructure(savedRecord, saved.draft.subject_answers, saved.draft.verb_answers);
      if (saved.draft.structure_result.correct) {
        saved.draft.message = '';
        saved.draft.message_kind = 'neutral';
      }
    } else if (submitted) {
      saved.draft.structure_result = null;
      saved.draft.stage = 'structure';
      saved.draft.message = '';
      saved.draft.message_kind = 'neutral';
    }
    saved.scoring_version = SCORING_VERSION;
    return saved;
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved?.dataset_fingerprint === dataset.fingerprint && Array.isArray(saved.results)) return normalizeSaved(saved);
    } catch (_) {}
    return { dataset_fingerprint: dataset.fingerprint, scoring_version: SCORING_VERSION, intro_complete: false, current_index: 0, results: [], attempt_history: [], draft: blankDraft(initialSupport) };
  }
  let state = load();
  const remoteProgress = assignmentIntegration?.context?.progress;
  if (assignmentIntegration?.active && Array.isArray(remoteProgress?.results) && remoteProgress.results.length) {
    const byId = new Map(remoteProgress.results.map(result => [result.sentence_id, result]));
    state.results = dataset.records.map(item => byId.get(item.sentence_id)).filter(Boolean);
    const nextIndex = dataset.records.findIndex(item => !byId.has(item.sentence_id));
    state.current_index = nextIndex === -1 ? dataset.records.length : nextIndex;
    if (state.current_index >= dataset.records.length || state.results.length !== Number(state.current_index)) state.draft = blankDraft(initialSupport);
  }
  let ruleGuideOpen = false;
  let pointerSelection = null;
  let suppressTokenClickUntil = 0;
  if (assignmentIntegration?.active) {
    state.draft.reading_support_level = initialSupport;
    supportSelect.disabled = true;
    supportSelect.title = '과제에서 지정된 읽기 도움 단계입니다.';
  } else if (C.SUPPORT_LEVELS.includes(requestedSupport)) state.draft.reading_support_level = requestedSupport;
  const requestedId = params.get('sentence_id');
  if (requestedId) {
    const index = dataset.records.findIndex(record => record.sentence_id === requestedId);
    if (index >= 0 && state.results.every(result => result.sentence_id !== requestedId)) state.current_index = index;
  }
  if (state.draft.stage === 'feedback') state.draft.stage = record().expressions.length ? 'expression' : 'next';
  supportSelect.value = state.draft.reading_support_level;

  function persist() {
    state.scoring_version = SCORING_VERSION;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }
  function record() { return dataset.records[state.current_index]; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function spanText(span) { return span.map(index => record().tokens[index]).join(' '); }
  function isContiguous(span) { const sorted = [...span].sort((a, b) => a - b); return sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1); }
  function progressCount() { return state.results.length; }
  function learningSteps() {
    const hasExpressions = record().expressions.length > 0;
    const steps = [
      { id: 1, label: '주어·동사 찾기', short: '주어·동사', guidance: '주어와 동사를 찾아보세요.' },
      { id: 2, label: '의미 단위로 끊기', short: '의미 단위', guidance: '문장을 읽기 좋은 의미 단위로 나눠보세요.' },
      { id: 3, label: '핵심 표현 확인', short: '핵심 표현', guidance: '이 문장을 읽을 때 알아두면 좋은 표현이에요.' },
      { id: 4, label: '문장 완료', short: '완료', guidance: '오늘 문장 학습을 마쳤어요.' }
    ];
    const stage = state.draft.stage;
    const current = stage === 'structure' ? 1
      : stage === 'structure-review' || stage === 'chunk' ? 2
      : stage === 'feedback' ? (hasExpressions ? 3 : 4)
      : stage === 'expression' ? 3
      : 4;
    const completed = new Set(
      current === 1 ? []
        : current === 2 ? [1]
        : current === 3 ? [1, 2]
        : [1, 2, 3]
    );
    return { steps, current, completed };
  }
  function stepProgress() {
    const { steps, current, completed } = learningSteps();
    return `<nav class="step-progress-shell" aria-label="문장 학습 단계"><ol class="step-progress">${steps.map(step => {
      const status = completed.has(step.id) ? 'completed' : step.id === current ? 'current' : 'upcoming';
      const reviewComplete = state.draft.stage === 'structure-review' && step.id === 1;
      return `<li class="step-progress-item ${status}" data-learning-step="${step.id}" ${status === 'current' ? 'aria-current="step"' : ''}><span class="step-dot">${status === 'completed' ? '✓' : step.id}</span><span class="step-label"><span class="step-label-full">${esc(step.label)}</span><span class="step-label-short">${esc(step.short)}</span>${reviewComplete ? '<span class="step-complete-state">완료</span>' : ''}</span></li>`;
    }).join('')}</ol></nav>`;
  }
  function header() {
    const r = record();
    return `<div class="lesson-head"><div><p class="eyebrow">SENTENCE STRUCTURE</p><h1>문장구조 연습</h1></div><div class="lesson-meta"><span class="level-badge">문장 난이도 ${esc(r.structure_level)}</span><span class="count-badge">${state.current_index + 1} / ${dataset.records.length}</span></div></div><div class="progress" aria-label="문장 학습 진행률"><i style="width:${(progressCount() / dataset.records.length) * 100}%"></i></div>${stepProgress()}`;
  }
  function expectedTarget() { return N.nextExpectedTarget(record(), state.draft); }
  function displayedMode() {
    if (state.draft.editing || state.draft.manual_mode) return state.draft.mode;
    const role = expectedTarget().role;
    return role === 'SUBJECT' ? 'subject' : role === 'VERB' ? 'verb' : '';
  }
  function isContinuationTarget(target) { return target && !['MAIN_PAIR', 'LINKED_VERB', 'COMPLETE'].includes(target.reason); }
  function grammarStructureTip() {
    const target = expectedTarget();
    if (state.draft.stage !== 'structure' || state.draft.editing || state.draft.manual_mode || !isContinuationTarget(target) || !state.draft.subject_answers.length || !state.draft.verb_answers.length) return '';
    const copy = N.copyFor(target);
    return `<aside class="sv-continuation-tip" aria-label="이 문장의 구조"><span aria-hidden="true">💡</span><div><strong>이 문장의 구조</strong><p>${esc(copy.tip)}</p></div></aside>`;
  }
  function currentTask() {
    const stage = state.draft.stage;
    if (stage === 'structure-review') {
      return `<section class="current-task review-complete-banner" aria-labelledby="current-task-title"><span class="review-complete-icon" aria-hidden="true">✓</span><div><div class="current-task-top"><span class="current-task-kicker">1단계 완료</span><span class="current-task-badge">정답 확인</span></div><h2 id="current-task-title">정답 확인 완료</h2><p>현재는 정답 확인 화면입니다. 이 단계의 답은 더 이상 수정되지 않습니다.</p></div></section>`;
    }
    let number = '', title = '', detail = '', badge = '';
    if (stage === 'structure') {
      const editing = state.draft.editing;
      const target = expectedTarget();
      const kind = editing?.kind || (state.draft.manual_mode ? state.draft.mode : target.role === 'SUBJECT' ? 'subject' : target.role === 'VERB' ? 'verb' : 'complete');
      if (editing) {
        number = kind === 'subject' ? '①' : '②';
        title = `${kind === 'subject' ? '주어' : '동사'} ${editing.index + 1}을 다시 선택하세요.`;
        detail = `문장에서 새 ${kind === 'subject' ? '주어' : '동사 또는 동사 덩어리'}를 선택하세요.`;
        badge = `${kind === 'subject' ? '주어' : '동사'} 수정 중`;
      } else if (state.draft.manual_mode) {
        number = kind === 'subject' ? '①' : '②';
        title = kind === 'subject' ? '주어를 추가로 찾아보세요.' : '동사를 추가로 찾아보세요.';
        detail = `문장에서 ${kind === 'subject' ? '주어' : '동사 또는 동사 덩어리'}를 선택하세요.`;
        badge = `${kind === 'subject' ? '주어' : '동사'} 직접 선택`;
      } else if (target.role === 'COMPLETE') {
        const copy = N.copyFor(target);
        number = '✓'; title = copy.title; detail = copy.detail; badge = '찾기 완료';
      } else {
        const copy = N.copyFor(target);
        number = kind === 'subject' ? '①' : '②'; title = copy.title; detail = copy.detail; badge = `${kind === 'subject' ? '주어' : '동사'} 찾는 중`;
      }
    } else if (stage === 'chunk') {
      title = '문장을 의미 단위로 나눠보세요.';
      detail = '끊고 싶은 위치를 눌러보세요.';
      badge = '의미 단위 찾는 중';
    } else if (stage === 'feedback') {
      title = record().expressions.length ? '결과를 확인하고 핵심 표현으로 가세요.' : '결과를 확인하고 문장 학습을 마치세요.';
      detail = '표시된 의미 단위를 한 번 더 읽어보세요.';
      badge = '의미 단위 확인';
    } else if (stage === 'expression') {
      title = '이 문장을 읽을 때 중요한 표현을 확인하세요.';
      detail = '표현과 뜻을 함께 읽어보세요.';
      badge = '핵심 표현 확인 중';
    } else {
      title = '다음 문장으로 넘어가세요.';
      detail = '이 문장의 학습을 모두 마쳤어요.';
      badge = '문장 완료';
    }
    return `<section class="current-task" aria-labelledby="current-task-title"><div class="current-task-top"><span class="current-task-kicker">지금 할 일</span><span class="current-task-badge">${esc(badge)}</span></div><h2 id="current-task-title">${number ? `<span>${number}</span> ` : ''}${esc(title)}</h2><p>${esc(detail)}</p></section>`;
  }
  function selectionGuide() {
    if (state.draft.stage !== 'structure') return '';
    const firstUse = !state.draft.subject_answers.length && !state.draft.verb_answers.length && !state.draft.subject_attempts && !state.draft.verb_attempts;
    return `<aside class="selection-instruction ${firstUse ? 'first-use' : ''}" aria-label="단어 선택 방법"><div class="selection-method desktop-method"><span><b>클릭</b> 한 단어</span><i aria-hidden="true">·</i><span><b>드래그</b> 여러 단어</span></div><div class="selection-method mobile-method"><span><b>탭</b> 한 단어</span><i aria-hidden="true">·</i><span><b>드래그</b> 여러 단어를 처음부터 끝까지</span></div></aside>`;
  }
  function tokenClass(index, reveal) {
    const classes = ['token'];
    if (state.draft.selected.includes(index)) classes.push('selected');
    if (reveal?.subjects.some(span => span.includes(index))) classes.push('subject-answer');
    if (reveal?.verbs.some(span => span.includes(index))) classes.push('verb-answer');
    if (reveal?.missing?.includes(index)) classes.push('answer-missing');
    if (reveal?.extra?.includes(index)) classes.push('answer-extra');
    return classes.join(' ');
  }
  function sentenceCard(reveal) {
    const active = state.draft.stage === 'structure' || state.draft.stage === 'chunk';
    const reviewing = state.draft.stage === 'structure-review';
    return `<section class="sentence-card ${active ? 'active-workspace' : ''} ${reviewing ? 'review-mode' : ''}" id="sentence"><div class="sentence-card-head"><span class="sentence-label">${reviewing ? '주어·동사 정답' : active ? '여기에서 직접 선택하세요' : '오늘의 문장'}</span>${reviewing ? '<span class="workspace-status review-status">확인 전용</span>' : active ? '<span class="workspace-status">선택 영역</span>' : ''}</div><div class="sentence">${record().tokens.map((token, index) => `<button type="button" class="${tokenClass(index, reveal)}" data-token="${index}" aria-pressed="${state.draft.selected.includes(index)}" ${reviewing ? 'disabled aria-disabled="true"' : ''}>${esc(token)}</button>`).join('')}</div></section>`;
  }
  function answerList(kind, label) {
    const answers = kind === 'subject' ? state.draft.subject_answers : state.draft.verb_answers;
    if (!answers.length) return '';
    return answers.map((span, index) => {
      const id = `${kind}:${index}`, menuOpen = state.draft.answer_menu === id, editing = state.draft.editing?.kind === kind && state.draft.editing?.index === index;
      const move = answers.length > 1 ? `<button type="button" data-move-answer="${id}:-1" ${index === 0 ? 'disabled' : ''}>앞으로</button><button type="button" data-move-answer="${id}:1" ${index === answers.length - 1 ? 'disabled' : ''}>뒤로</button>` : '';
      return `<div class="answer-row ${kind} ${editing ? 'editing' : ''}"><button type="button" class="answer-value" data-answer-menu="${id}" aria-expanded="${menuOpen}"><span class="answer-check">✓</span><span class="answer-index">${label} ${index + 1}</span><strong>${esc(spanText(span))}</strong></button>${menuOpen ? `<div class="answer-menu"><button type="button" data-edit-answer="${id}">다시 선택</button>${move}<button type="button" data-remove-answer="${id}">삭제</button></div>` : ''}</div>`;
    }).join('');
  }
  function registeredAnswers() {
    const total = state.draft.subject_answers.length + state.draft.verb_answers.length;
    return `<section class="registered-answers" aria-label="현재 답안"><div class="registered-head"><strong>현재 답안</strong><span>${total ? '답을 누르면 수정할 수 있어요.' : '문장에서 답을 선택해보세요.'}</span></div>${total ? `<div class="answer-groups"><div class="answer-group">${answerList('subject', '주어')}</div><div class="answer-group">${answerList('verb', '동사')}</div></div>` : '<div class="answer-empty">아직 선택한 답이 없어요.</div>'}</section>`;
  }
  function currentSmartHint() {
    return record().sv_hint || hintDataset?.records?.[record().sentence_id] || null;
  }
  function smartHintCard() {
    const hint = currentSmartHint();
    if (!hint || !H || state.draft.stage !== 'structure' || assignedHintLevel === 'NONE') return '';
    if (!state.draft.manual_mode && isContinuationTarget(expectedTarget()) && state.draft.subject_answers.length && state.draft.verb_answers.length) return '';
    const level = Number(state.draft.sv_hint_level) || 0;
    if (!state.draft.sv_hint_open) return '<aside class="sv-hint-card compact"><button type="button" class="sv-hint-restore" data-sv-hint-toggle>💡 힌트 다시 보기</button></aside>';
    const detail = assignedHintLevel === 'DETAILED' ? (level >= 2 ? `<div class="sv-hint-more"><span>한 단계 더</span><p>${esc(H.hintText(hint, 2))}</p></div>` : '<button type="button" class="sv-hint-more-button" data-sv-hint-more>조금 더 힌트</button>') : '';
    return `<aside class="sv-hint-card" aria-label="이 문장의 힌트"><div class="sv-hint-head"><strong><span aria-hidden="true">💡</span> 이 문장의 힌트</strong><button type="button" data-sv-hint-toggle>힌트 숨기기</button></div><p>${esc(H.hintText(hint, 1))}</p>${detail}</aside>`;
  }
  function comparisonEntries(answers, extras, kind) {
    const extraCounts = new Map();
    (extras || []).forEach(span => {
      const value = C.normalizeSpan(span, record().tokens.length).join(',');
      extraCounts.set(value, (extraCounts.get(value) || 0) + 1);
    });
    return (answers || []).map(span => {
      const normalized = C.normalizeSpan(span, record().tokens.length);
      const value = normalized.join(','), remaining = extraCounts.get(value) || 0;
      if (remaining) extraCounts.set(value, remaining - 1);
      const acceptable = kind === 'subject' && record().subjects.some(target => (target.acceptable || []).some(candidate => C.sameSpan(candidate, normalized)));
      return { span: normalized, correct: !remaining, acceptable };
    });
  }
  function answerComparison() {
    const result = state.draft.structure_result;
    const subjectEntries = comparisonEntries(state.draft.subject_answers, result.subject.extra, 'subject');
    const verbEntries = comparisonEntries(state.draft.verb_answers, result.verb.extra, 'verb');
    return {
      student: { subjects: subjectEntries, verbs: verbEntries },
      teacher: {
        subjects: record().subjects.map((target, index) => ({ span: target.primary, acceptable: target.acceptable || [], missing: result.subject.missing.includes(index) })),
        verbs: record().verbs.map((target, index) => ({ span: target.indexes, missing: result.verb.missing.includes(index) }))
      },
      missing: result.subject.missing.length + result.verb.missing.length,
      extra: subjectEntries.filter(item => !item.correct).length + verbEntries.filter(item => !item.correct).length
    };
  }
  function studentComparisonGroup(label, entries) {
    const content = entries.length ? entries.map(item => `<span class="comparison-answer ${item.correct ? 'matched' : 'mismatch'}"><b>${item.correct ? '✓' : '!'}</b>${esc(spanText(item.span))}${item.acceptable ? '<small>이 답도 맞아요</small>' : item.correct ? '' : '<small>다시 볼 답</small>'}</span>`).join('') : '<span class="comparison-empty">선택하지 않음</span>';
    return `<div class="comparison-group"><strong>${label}</strong><div>${content}</div></div>`;
  }
  function teacherComparisonGroup(label, entries, subject = false) {
    const content = entries.map(item => `<span class="comparison-answer canonical ${item.missing ? 'missing' : ''}"><b>${item.missing ? '+' : '✓'}</b>${esc(spanText(item.span))}${item.missing ? '<small>빠뜨린 답</small>' : ''}${subject && item.acceptable.length ? `<small>또는 ${item.acceptable.map(spanText).map(esc).join(' / ')}</small>` : ''}</span>`).join('');
    return `<div class="comparison-group"><strong>${label}</strong><div>${content}</div></div>`;
  }
  function answerComparisonCard() {
    const comparison = answerComparison();
    const notes = [comparison.missing ? '<span class="missing-note">빠뜨린 답이 있어요.</span>' : '', comparison.extra ? '<span class="extra-note">주황색 답을 다시 살펴보세요.</span>' : ''].filter(Boolean).join('');
    return `<section class="answer-comparison" aria-label="내 답과 정답 비교"><div class="comparison-title"><strong>내 답과 정답 비교</strong><span>다른 부분만 천천히 확인해보세요.</span></div><div class="comparison-columns"><article class="comparison-panel student"><h3>내 답</h3>${studentComparisonGroup('주어', comparison.student.subjects)}${studentComparisonGroup('동사', comparison.student.verbs)}</article><article class="comparison-panel teacher"><h3>정답</h3>${teacherComparisonGroup('주어', comparison.teacher.subjects, true)}${teacherComparisonGroup('동사', comparison.teacher.verbs)}</article></div>${notes ? `<div class="comparison-notes">${notes}</div>` : ''}</section>`;
  }
  function structureReveal() {
    if (!state.draft.structure_result) return null;
    const result = state.draft.structure_result;
    const canonicalSubjects = C.correctSubjectSpans(record()), canonicalVerbs = C.correctVerbSpans(record());
    const studentIndexes = new Set([...state.draft.subject_answers, ...state.draft.verb_answers].flat());
    const acceptedSubjectIndexes = record().subjects.flatMap(target => [target.primary, ...(target.acceptable || [])]).flat();
    const acceptedVerbIndexes = record().verbs.flatMap(target => C.acceptedVerbSpans(record(), target)).flat();
    const acceptedIndexes = new Set([...acceptedSubjectIndexes, ...acceptedVerbIndexes]);
    const missingIndexes = new Set([
      ...result.subject.missing.flatMap(index => record().subjects[index]?.primary || []),
      ...result.verb.missing.flatMap(index => record().verbs[index]?.indexes || [])
    ]);
    return {
      subjects: result.subject_correct ? state.draft.subject_answers : C.correctSubjectSpans(record()),
      verbs: canonicalVerbs,
      extra: [...studentIndexes].filter(index => !acceptedIndexes.has(index)),
      missing: [...missingIndexes].filter(index => !studentIndexes.has(index))
    };
  }
  function structureStep() {
    const revealed = state.draft.stage === 'structure-review';
    const reveal = revealed ? structureReveal() : null;
    const visibleMode = displayedMode();
    return `${sentenceCard(reveal)}<section class="step-card ${revealed ? 'review-mode' : ''}" id="structure-step"><div class="step-head"><span class="step-number">${revealed ? '✓' : '1'}</span><div><h2>${revealed ? '주어·동사 정답 확인' : '주어·동사 찾기'}</h2><p>${revealed ? '표시된 답을 확인한 뒤 2단계를 시작하세요.' : '선택하면 답안에 바로 등록돼요.'}</p></div>${revealed ? '<span class="step-review-badge">수정 불가</span>' : ''}</div>${revealed ? structureReview(reveal) : `<div class="role-fallback" aria-label="찾을 대상 바꾸기"><span>찾을 대상 바꾸기</span><button type="button" class="role-toggle ${visibleMode === 'subject' ? 'active' : ''}" data-mode="subject">주어</button><button type="button" class="role-toggle ${visibleMode === 'verb' ? 'active' : ''}" data-mode="verb">동사</button></div>${registeredAnswers()}${state.draft.editing ? '<button type="button" class="text-action cancel-edit" data-cancel-edit>다시 선택 취소</button>' : ''}${state.draft.message ? `<div class="feedback ${state.draft.message_kind === 'error' ? 'error' : ''}">${esc(state.draft.message)}</div>` : ''}<div class="draft-tools"><button type="button" class="text-action" data-undo ${state.draft.undo_stack.length ? '' : 'disabled'}>↶ 되돌리기</button><span>Ctrl+Z</span></div><div class="action-row"><button type="button" class="button primary" data-check-structure>정답 확인</button></div>`}</section>`;
  }
  function structureReview(reveal) {
    const result = state.draft.structure_result;
    const good = result.correct;
    const subjectText = reveal.subjects.map(spanText).join(' · ');
    const verbText = reveal.verbs.map(spanText).join(' · ');
    const expressionChoice = good ? acceptedExpressionChoice() : null;
    const distinction = expressionChoice ? `<div class="verb-expression-note"><strong>둘 다 맞아요</strong><p>문법적 핵심 동사는 <b>${esc(expressionChoice.verb)}</b>예요. 해석할 때는 <b>${esc(expressionLabel(expressionChoice.expression))}</b>를 한 표현으로 알아두세요.</p></div>` : '';
    const review = good ? `<div class="answer-key"><div class="key-box"><span>주어</span><b>${esc(subjectText)}</b></div><div class="key-box"><span>동사</span><b>${esc(verbText)}</b></div></div>${distinction}` : answerComparisonCard();
    return `<div class="feedback ${good ? 'success' : 'error'}">${good ? '✓ 잘했어요. 주어와 동사를 모두 찾았어요.' : '내 답과 정답을 비교해보세요.'}</div>${review}<div class="action-row"><button type="button" class="button secondary" data-retry-structure>다시 풀기</button><button type="button" class="button primary" data-go-chunk>2단계 시작: 의미 단위로 끊기</button></div>`;
  }
  function expressionLabel(item) {
    const value = String(item.expression || '').trim();
    return value.includes('~') || !/\b(?:of|on|at|for|with|by|into|from)$/i.test(value) ? value : `${value} ~`;
  }
  function expressionVerbTarget(item) {
    return record().verbs.find(target => !C.sameSpan(target.indexes, item.token_indexes) && C.acceptedVerbSpans(record(), target).some(span => C.sameSpan(span, item.token_indexes)));
  }
  function acceptedExpressionChoice() {
    for (const answer of state.draft.verb_answers) {
      const expression = (record().expressions || []).find(item => C.sameSpan(answer, item.token_indexes));
      const target = expression && expressionVerbTarget(expression);
      if (target) return { expression, verb: spanText(target.indexes) };
    }
    return null;
  }
  function chunkSentence() {
    const hints = state.draft.hints_visible ? new Set(C.hintJunctions(record(), state.draft.reading_support_level)) : new Set();
    let html = '';
    record().tokens.forEach((token, index) => {
      html += `<span class="chunk-token">${esc(token)}</span>`;
      if (index < record().tokens.length - 1) {
        const selected = state.draft.chunk_boundaries.includes(index);
        html += `<button type="button" class="junction ${selected ? 'selected' : ''} ${hints.has(index) ? 'hint' : ''}" data-junction="${index}" aria-pressed="${selected}" aria-label="${esc(token)} 뒤에서 끊기">${selected ? '/' : '·'}</button>`;
      }
    });
    return `<div class="chunk-sentence">${html}</div>`;
  }
  function chunkRuleCards() {
    if (!G?.rules?.length) return '';
    return `<div class="chunk-rule-details">${G.rules.map(rule => `<article class="chunk-rule-detail"><strong>${esc(rule.number)} ${esc(rule.title)}</strong><p>${esc(rule.detail)}</p></article>`).join('')}</div>`;
  }
  function introView() {
    return `<section class="chunk-intro" id="chunk-intro"><p class="chunk-intro-kicker">연습 전 1분 안내</p><h1><span aria-hidden="true">💡</span> 끊어읽기, 이렇게 해보세요</h1><p class="chunk-intro-lead">긴 문장을 쉽게 읽도록 나누는 9가지 기준이에요.</p>${chunkRuleCards()}<p class="chunk-intro-caution"><strong>모든 곳을 꼭 끊을 필요는 없어요.</strong><span>문장이 길거나 해석이 어려울 때<br>내가 읽기 편한 의미 단위로 나눠보세요.</span></p><button type="button" class="button primary chunk-intro-start" data-start-practice>연습 시작하기 →</button></section>`;
  }
  function ruleGuideOverlay() {
    if (!ruleGuideOpen) return '';
    return `<div class="chunk-guide-backdrop" data-rule-guide-backdrop><section class="chunk-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="chunk-guide-dialog-title"><div class="chunk-guide-dialog-head"><div><p>다시 보기</p><h2 id="chunk-guide-dialog-title"><span aria-hidden="true">💡</span> 끊어읽기 9가지 법칙</h2></div><button type="button" data-rule-guide-close aria-label="끊어읽기 법칙 닫기">닫기</button></div>${chunkRuleCards()}<p class="chunk-rule-caution">모든 곳을 꼭 끊을 필요는 없어요. 내가 읽기 편한 의미 단위로 나눠보세요.</p></section></div>`;
  }
  function chunkStep() {
    return `<div class="chunk-stage" id="chunk-step"><button type="button" class="chunk-rule-reopen" data-rule-guide-open>끊어읽기 법칙 다시 보기</button><section class="step-card chunk-workspace"><div class="chunk-workspace-head"><span>여기에서 끊어읽기</span><h2>끊고 싶은 단어 사이를 눌러보세요.</h2></div>${chunkSentence()}<div class="action-row">${restartSentenceButton()}<button type="button" class="button primary" data-check-chunk>의미 단위 나누기 완료</button></div></section></div>`;
  }
  function expressionStep() {
    return `<section class="step-card" id="expression-step"><div class="step-head"><span class="step-number">3</span><div><h2>핵심 표현 확인</h2><p>이 문장을 읽을 때 알아두면 좋은 표현이에요.</p></div></div><div class="expression-list">${record().expressions.map(item => { const target = expressionVerbTarget(item); const note = target ? `<div class="expression-grammar-note"><span>동사와 표현은 달라요</span><p>문장에서 찾는 동사는 <b>${esc(spanText(target.indexes))}</b>예요. 해석할 때는 <b>${esc(expressionLabel(item))}</b>를 한 표현으로 알아두세요.</p></div>` : ''; return `<article class="expression"><strong>${esc(expressionLabel(item))}</strong><p>${esc(item.meaning)}</p><div class="expression-source">${esc(spanText(item.token_indexes))}</div>${note}</article>`; }).join('')}</div><div class="action-row">${restartSentenceButton()}<button type="button" class="button primary" data-complete-expression>문장 학습 완료 →</button></div></section>`;
  }
  function restartSentenceButton() {
    return '<button type="button" class="button secondary restart-sentence" data-restart-sentence>↺ 이 문장 처음부터 다시 풀기</button>';
  }
  function nextStep() {
    return `<section class="step-card next-step-card" id="next-step"><div class="step-head"><span class="step-number">✓</span><div><h2>오늘 문장 학습 완료!</h2><p>이 문장의 학습 단계를 모두 마쳤어요.</p></div></div><div class="action-row">${restartSentenceButton()}<button type="button" class="button primary" data-next>다음 문장 →</button></div></section>`;
  }
  function completeView() {
    const restarted = new Set(state.attempt_history.map(item => item.sentence_id)).size;
    const hints = state.results.filter(result => result.hint_used).length;
    const expressions = state.results.reduce((count, result) => count + (result.expression_ids_shown || []).length, 0);
    return `<section class="complete"><div class="complete-mark">✓</div><h1>문장구조 연습을 완료했어요!</h1><p>오늘 ${dataset.records.length}문장을 모두 학습했어요.</p><div class="summary-grid"><div class="summary-item"><b>${state.results.length}</b><span>완료 문장</span></div><div class="summary-item"><b>${restarted}</b><span>처음부터 다시 푼 문장</span></div><div class="summary-item"><b>${hints}</b><span>힌트 제공 문장</span></div><div class="summary-item"><b>${expressions}</b><span>핵심 표현</span></div></div><div class="complete-actions"><a class="button primary" href="../student/index.html">학습 목록으로 돌아가기</a><button type="button" class="button secondary" data-reset>새로 연습하기</button></div></section>`;
  }
  function render() {
    supportSelect.value = state.draft.reading_support_level;
    if (!state.intro_complete) { app.innerHTML = introView(); return; }
    if (state.current_index >= dataset.records.length) { app.innerHTML = completeView(); return; }
    const body = state.draft.stage === 'structure' || state.draft.stage === 'structure-review' ? structureStep() : state.draft.stage === 'chunk' ? chunkStep() : state.draft.stage === 'expression' ? expressionStep() : nextStep();
    app.innerHTML = `<section class="lesson">${header()}${currentTask()}${grammarStructureTip()}${smartHintCard()}${selectionGuide()}${body}</section>${ruleGuideOverlay()}`;
  }
  function focusStage(selector) {
    requestAnimationFrame(() => {
      const target = document.querySelector(selector);
      if (!target) return;
      target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    });
  }
  function setMessage(text, kind = 'neutral') { state.draft.message = text; state.draft.message_kind = kind; persist(); render(); }
  function answerSnapshot() {
    return { subject_answers: structuredClone(state.draft.subject_answers), verb_answers: structuredClone(state.draft.verb_answers), mode: state.draft.mode, manual_mode: state.draft.manual_mode, selected: [...state.draft.selected], editing: state.draft.editing ? { ...state.draft.editing } : null };
  }
  function pushUndo() { state.draft.undo_stack = [...state.draft.undo_stack.slice(-19), answerSnapshot()]; }
  function undoAnswer() {
    const snapshot = state.draft.undo_stack.pop();
    if (!snapshot || state.draft.stage !== 'structure') return;
    Object.assign(state.draft, snapshot, { answer_menu: null, message: '', message_kind: 'neutral', structure_result: null });
    persist(); render();
  }
  function autoNextMode(kind) {
    const target = expectedTarget();
    if (target.role === 'SUBJECT') return 'subject';
    if (target.role === 'VERB') return 'verb';
    return kind;
  }
  function commitAnswer(span) {
    if (state.draft.stage !== 'structure') return;
    if (!span.length) return setMessage('먼저 문장에서 답이 되는 단어를 눌러주세요.');
    if (!isContiguous(span)) return setMessage('한 덩어리로 이어진 단어를 선택해주세요.');
    const kind = state.draft.editing?.kind || state.draft.mode, field = kind === 'subject' ? 'subject_answers' : 'verb_answers', editingIndex = state.draft.editing?.kind === kind ? state.draft.editing.index : -1;
    if (state.draft[field].some((answer, index) => index !== editingIndex && C.sameSpan(answer, span))) return setMessage('이미 추가한 답이에요.');
    pushUndo();
    if (editingIndex >= 0) state.draft[field][editingIndex] = [...span]; else state.draft[field].push([...span]);
    state.draft.selected = [];
    state.draft.editing = null;
    state.draft.answer_menu = null;
    state.draft.mode = autoNextMode(kind);
    state.draft.manual_mode = false;
    state.draft.message = '';
    state.draft.message_kind = 'neutral';
    persist(); render();
  }
  function spanBetween(start, end) {
    const low = Math.min(start, end), high = Math.max(start, end);
    return Array.from({ length: high - low + 1 }, (_, offset) => low + offset);
  }
  function previewPointerSelection(span) {
    app.querySelectorAll('[data-token]').forEach(token => {
      const selected = span.includes(Number(token.dataset.token));
      token.classList.toggle('selected', selected);
      token.setAttribute('aria-pressed', String(selected));
    });
  }
  function startPointerSelection(event, token) {
    if (state.draft.stage !== 'structure' || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const index = Number(token.dataset.token);
    pointerSelection = { pointerId: event.pointerId, start: index, end: index };
    previewPointerSelection([index]);
  }
  function extendPointerSelection(event, token) {
    if (!pointerSelection || event.pointerId !== pointerSelection.pointerId) return;
    pointerSelection.end = Number(token.dataset.token);
    previewPointerSelection(spanBetween(pointerSelection.start, pointerSelection.end));
  }
  function finishPointerSelection(event) {
    if (!pointerSelection || event.pointerId !== pointerSelection.pointerId) return;
    const span = spanBetween(pointerSelection.start, pointerSelection.end);
    pointerSelection = null;
    suppressTokenClickUntil = Date.now() + 500;
    commitAnswer(span);
  }
  function cancelPointerSelection(event) {
    if (!pointerSelection || event.pointerId !== pointerSelection.pointerId) return;
    pointerSelection = null;
    state.draft.selected = [];
    render();
  }
  function removeAnswer(kind, index) {
    const field = kind === 'subject' ? 'subject_answers' : 'verb_answers';
    if (!state.draft[field][index]) return;
    pushUndo(); state.draft[field].splice(index, 1);
    state.draft.mode = kind; state.draft.manual_mode = false; state.draft.selected = []; state.draft.editing = null; state.draft.answer_menu = null; state.draft.message = ''; state.draft.message_kind = 'neutral'; state.draft.structure_result = null;
    persist(); render();
  }
  function editAnswer(kind, index) {
    const field = kind === 'subject' ? 'subject_answers' : 'verb_answers', span = state.draft[field][index];
    if (!span) return;
    state.draft.mode = kind; state.draft.manual_mode = true; state.draft.selected = []; state.draft.editing = { kind, index }; state.draft.answer_menu = null; state.draft.message = `${kind === 'subject' ? '주어' : '동사'} ${index + 1}의 새 범위를 선택하세요.`; state.draft.message_kind = 'neutral';
    persist(); render();
  }
  function moveAnswer(kind, index, direction) {
    const field = kind === 'subject' ? 'subject_answers' : 'verb_answers', target = index + direction;
    if (target < 0 || target >= state.draft[field].length) return;
    pushUndo(); [state.draft[field][index], state.draft[field][target]] = [state.draft[field][target], state.draft[field][index]];
    state.draft.answer_menu = null; state.draft.message = ''; persist(); render();
  }
  function checkStructure() {
    if (!state.draft.subject_answers.length || !state.draft.verb_answers.length) return setMessage('주어와 동사를 각각 하나 이상 추가해주세요.');
    state.draft.subject_attempts += 1;
    state.draft.verb_attempts += 1;
    const result = C.evaluateStructure(record(), state.draft.subject_answers, state.draft.verb_answers);
    if (!result.correct && state.draft.subject_attempts < 2) {
      state.draft.message = '한 번 더 찾아보세요. 선택한 범위를 문장과 다시 비교해보세요.';
      state.draft.message_kind = 'error';
      persist(); render(); return;
    }
    state.draft.structure_result = result;
    state.draft.selected = [];
    state.draft.stage = 'structure-review';
    persist(); render(); focusStage('#structure-step');
  }
  function goChunk() { state.draft.stage = 'chunk'; state.draft.message = ''; persist(); render(); focusStage('#chunk-step'); }
  function checkChunk() {
    state.draft.chunk_result = C.evaluateChunks(record(), state.draft.chunk_boundaries);
    state.draft.stage = record().expressions.length ? 'expression' : 'next';
    persist(); render(); focusStage(record().expressions.length ? '#expression-step' : '#next-step');
  }
  function restartSentence() {
    const previous = state.draft;
    const priorAttempts = state.attempt_history.filter(item => item.sentence_id === record().sentence_id).length;
    state.attempt_history.push({
      sentence_id: record().sentence_id,
      attempt_number: priorAttempts + 1,
      subject_answers: structuredClone(previous.subject_answers),
      verb_answers: structuredClone(previous.verb_answers),
      structure_result: previous.structure_result ? structuredClone(previous.structure_result) : null,
      chunk_boundaries: [...previous.chunk_boundaries],
      chunk_result: previous.chunk_result ? structuredClone(previous.chunk_result) : null,
      expression_completed: previous.stage === 'next',
      restarted_at: new Date().toISOString()
    });
    const level = previous.reading_support_level;
    state.draft = blankDraft(level);
    ruleGuideOpen = false;
    persist(); render(); focusStage('#structure-step');
  }
  async function finishSentence() {
    const completedAt = new Date().toISOString();
    state.draft.smart_hint_visible = assignedHintLevel !== 'NONE' && Boolean(currentSmartHint());
    const result = C.buildResult(record(), state.draft, completedAt);
    if (assignmentIntegration?.active) {
      try { await assignmentIntegration.postResult(result, state.current_index + 1); }
      catch (error) { return setMessage(error?.message || '학습 결과를 저장하지 못했습니다. 다시 시도해주세요.', 'error'); }
    }
    state.results = state.results.filter(item => item.sentence_id !== result.sentence_id).concat(result);
    state.current_index += 1;
    state.draft = blankDraft(supportSelect.value);
    persist(); render(); focusStage('#structure-step');
  }
  app.addEventListener('pointerdown', event => { const token = event.target.closest('[data-token]'); if (token) startPointerSelection(event, token); });
  app.addEventListener('pointerover', event => { const token = event.target.closest('[data-token]'); if (token) extendPointerSelection(event, token); });
  document.addEventListener('pointerup', finishPointerSelection);
  document.addEventListener('pointercancel', cancelPointerSelection);
  app.addEventListener('click', event => {
    if (event.target.closest('[data-start-practice]')) { state.intro_complete = true; persist(); render(); focusStage('#structure-step'); return; }
    if (event.target.closest('[data-rule-guide-open]')) { ruleGuideOpen = true; render(); requestAnimationFrame(() => document.querySelector('[data-rule-guide-close]')?.focus()); return; }
    if (event.target.closest('[data-rule-guide-close]') || event.target.hasAttribute('data-rule-guide-backdrop')) { ruleGuideOpen = false; render(); focusStage('#chunk-step'); return; }
    const token = event.target.closest('[data-token]'); if (token) { if (Date.now() < suppressTokenClickUntil) return; return commitAnswer([Number(token.dataset.token)]); }
    const mode = event.target.closest('[data-mode]'); if (mode) { state.draft.mode = mode.dataset.mode; state.draft.manual_mode = true; state.draft.selected = []; state.draft.editing = null; state.draft.answer_menu = null; state.draft.message = ''; state.draft.message_kind = 'neutral'; persist(); render(); return; }
    const menu = event.target.closest('[data-answer-menu]'); if (menu) { state.draft.answer_menu = state.draft.answer_menu === menu.dataset.answerMenu ? null : menu.dataset.answerMenu; persist(); render(); return; }
    const edit = event.target.closest('[data-edit-answer]'); if (edit) { const [kind, index] = edit.dataset.editAnswer.split(':'); return editAnswer(kind, Number(index)); }
    const remove = event.target.closest('[data-remove-answer]'); if (remove) { const [kind, index] = remove.dataset.removeAnswer.split(':'); return removeAnswer(kind, Number(index)); }
    const move = event.target.closest('[data-move-answer]'); if (move) { const [kind, index, direction] = move.dataset.moveAnswer.split(':'); return moveAnswer(kind, Number(index), Number(direction)); }
    if (event.target.closest('[data-cancel-edit]')) { state.draft.editing = null; state.draft.manual_mode = false; state.draft.mode = autoNextMode(state.draft.mode); state.draft.selected = []; state.draft.answer_menu = null; state.draft.message = ''; persist(); render(); return; }
    if (event.target.closest('[data-undo]')) return undoAnswer();
    if (event.target.closest('[data-sv-hint-toggle]')) {
      if (!currentSmartHint()) return;
      state.draft.sv_hint_open = !state.draft.sv_hint_open;
      persist(); render(); return;
    }
    if (event.target.closest('[data-sv-hint-more]')) {
      const hint = currentSmartHint();
      if (!hint || assignedHintLevel !== 'DETAILED') return;
      state.draft.sv_hint_level = 2;
      state.draft.sv_hint_type = hint.type;
      state.draft.sv_hint_used = true;
      state.draft.second_hint_used = true;
      persist(); render(); return;
    }
    if (event.target.closest('[data-check-structure]')) return checkStructure();
    if (event.target.closest('[data-retry-structure]')) { state.draft.stage = 'structure'; state.draft.structure_result = null; state.draft.selected = []; state.draft.message = ''; state.draft.message_kind = 'neutral'; persist(); render(); return; }
    if (event.target.closest('[data-go-chunk]')) return goChunk();
    const junction = event.target.closest('[data-junction]'); if (junction && state.draft.stage === 'chunk') { const index = Number(junction.dataset.junction), set = new Set(state.draft.chunk_boundaries); set.has(index) ? set.delete(index) : set.add(index); state.draft.chunk_boundaries = [...set].sort((a, b) => a - b); persist(); render(); return; }
    if (event.target.closest('[data-hint]')) { state.draft.hints_visible = !state.draft.hints_visible; state.draft.hint_used = true; persist(); render(); return; }
    if (event.target.closest('[data-check-chunk]')) return checkChunk();
    if (event.target.closest('[data-complete-expression]')) { state.draft.stage = 'next'; persist(); render(); focusStage('#next-step'); return; }
    if (event.target.closest('[data-restart-sentence]')) return restartSentence();
    if (event.target.closest('[data-next]')) return finishSentence();
    if (event.target.closest('[data-reset]')) { localStorage.removeItem(storageKey); state = { dataset_fingerprint: dataset.fingerprint, scoring_version: SCORING_VERSION, intro_complete: false, current_index: 0, results: [], attempt_history: [], draft: blankDraft(supportSelect.value) }; persist(); render(); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && ruleGuideOpen) { ruleGuideOpen = false; render(); focusStage('#chunk-step'); return; } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && state.draft.stage === 'structure' && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) { event.preventDefault(); undoAnswer(); } });
  supportSelect.addEventListener('change', () => { if (assignmentIntegration?.active) return; state.draft.reading_support_level = supportSelect.value; persist(); render(); });
  window.ELABSentenceStructurePractice = { getState: () => structuredClone(state), getRecord: () => structuredClone(record()), getResults: () => structuredClone(state.results), getStorageKey: () => storageKey, getAssignedHintLevel: () => assignedHintLevel, reset: () => { localStorage.removeItem(storageKey); location.reload(); } };
  persist(); render();
})();
