(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ELABSentenceStructureSVContinuation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const plans = {
    'corpus:2970': [{ clause_id: 'c1', type: 'MAIN' }],
    'corpus:25018': [{ clause_id: 'c1', type: 'MAIN' }],
    'corpus:2449': [{ clause_id: 'c1', type: 'MAIN' }],
    'corpus:2590': [{ clause_id: 'c1', type: 'MAIN' }],
    'corpus:2479': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'OVERT' }],
    'corpus:58378': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'ADVERBIAL', marker_form: 'OVERT' }],
    'corpus:26237': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }],
    'corpus:2501': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }, { clause_id: 'c3', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }],
    'corpus:23568': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'ZERO' }, { clause_id: 'c3', type: 'ADVERBIAL', marker_form: 'OVERT' }],
    'corpus:2581': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'ADVERBIAL', marker_form: 'OVERT' }, { clause_id: 'c3', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }],
    'corpus:2480': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'OVERT' }, { clause_id: 'c3', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }, { clause_id: 'c4', type: 'ADVERBIAL', marker_form: 'OVERT' }, { clause_id: 'c5', type: 'ADVERBIAL', marker_form: 'OVERT' }, { clause_id: 'c6', type: 'NOUN_WH', marker_form: 'OVERT' }],
    'corpus:59087': [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'ADVERBIAL', marker_form: 'OVERT' }, { clause_id: 'c3', type: 'RELATIVE', marker_form: 'ZERO' }, { clause_id: 'c4', type: 'NOUN_THAT', marker_form: 'OVERT' }]
  };

  function planFor(record) {
    return record?.clause_meta || plans[record?.sentence_id] || [];
  }

  function reasonForClause(meta, clauseIndex) {
    const type = meta?.type || meta?.clause_type || '';
    const marker = meta?.marker_form || '';
    if (type === 'NOUN_THAT') return marker === 'ZERO' ? 'OMITTED_THAT' : 'EXPLICIT_THAT';
    if (type === 'RELATIVE') {
      if (marker === 'ZERO') return 'OMITTED_RELATIVE';
      return meta?.subject_is_marker ? 'RELATIVE_SUBJECT' : 'RELATIVE_OBJECT';
    }
    if (type === 'ADVERBIAL') return 'ADVERBIAL';
    if (['NOUN_WH', 'NOUN_IF_WHETHER', 'CONTENT'].includes(type)) return 'CONTENT_CLAUSE';
    if (type === 'MAIN' && clauseIndex > 0) return 'COORDINATED_CLAUSE';
    return clauseIndex > 0 ? 'NEW_FINITE_CLAUSE' : 'MAIN_PAIR';
  }

  function targets(record, plan = planFor(record)) {
    const metaByClause = new Map((plan || []).map(item => [item.clause_id, item]));
    const output = [];
    (record?.subjects || []).forEach((subject, clauseIndex) => {
      const meta = metaByClause.get(subject.clause_id) || { clause_id: subject.clause_id, type: clauseIndex ? 'UNKNOWN' : 'MAIN' };
      output.push({ role: 'SUBJECT', clause_id: subject.clause_id, reason: reasonForClause(meta, clauseIndex), clause_index: clauseIndex });
      (record?.verbs || []).filter(verb => verb.clause_id === subject.clause_id).forEach((verb, predicateIndex) => {
        output.push({ role: 'VERB', clause_id: subject.clause_id, predicate_id: verb.predicate_id, reason: predicateIndex ? 'COORDINATED_PREDICATE' : 'LINKED_VERB', predicate_index: predicateIndex });
      });
    });
    return output;
  }

  function nextExpectedTarget(record, draft, plan = planFor(record)) {
    let subjectSeen = 0;
    let verbSeen = 0;
    const subjectCount = draft?.subject_answers?.length || 0;
    const verbCount = draft?.verb_answers?.length || 0;
    for (const target of targets(record, plan)) {
      if (target.role === 'SUBJECT') {
        if (subjectSeen >= subjectCount) return target;
        subjectSeen += 1;
      } else {
        if (verbSeen >= verbCount) return target;
        verbSeen += 1;
      }
    }
    return { role: 'COMPLETE', reason: 'COMPLETE' };
  }

  function copyFor(target) {
    const copies = {
      MAIN_PAIR: { title: '주어를 찾아보세요.', detail: '문장에서 주어를 누르거나 드래그하세요.', tip: '' },
      LINKED_VERB: { title: '이 주어와 연결되는 동사를 찾아보세요.', detail: '동사 또는 하나의 뜻으로 이어지는 동사 덩어리를 선택하세요.', tip: '' },
      EXPLICIT_THAT: { title: 'that절 안의 주어를 찾아보세요.', detail: 'that이 이끄는 절 안에도 주어와 동사가 있어요.', tip: 'that절 안에 주어·동사가 한 번 더 나와요.' },
      OMITTED_THAT: { title: '뒤에 이어지는 새 절의 주어를 찾아보세요.', detail: '동사 뒤에 접속사 that이 생략된 절이 이어져요.', tip: '동사 뒤에 that이 생략된 주어·동사 구조가 있어요.' },
      RELATIVE_SUBJECT: { title: '관계절의 주어를 찾아보세요.', detail: '관계대명사가 관계절의 주어 역할을 할 수 있어요.', tip: '관계대명사 자체가 주어인 관계절이 있어요.' },
      RELATIVE_OBJECT: { title: '관계절 안의 주어를 찾아보세요.', detail: '관계사 뒤에 별도의 주어가 나와요.', tip: '관계사 뒤에 따로 주어·동사가 이어져요.' },
      OMITTED_RELATIVE: { title: '명사 뒤 새 절의 주어를 찾아보세요.', detail: '명사 뒤에 목적격 관계사가 생략된 관계절이 이어져요.', tip: '명사 뒤에 관계사가 생략된 주어·동사 구조가 있어요.' },
      ADVERBIAL: { title: '접속사가 이끄는 절의 주어를 찾아보세요.', detail: '그 절 안에도 주어와 동사가 있어요.', tip: '접속사가 이끄는 절 안에 주어·동사가 한 번 더 나와요.' },
      COORDINATED_PREDICATE: { title: '같은 주어에 이어지는 동사를 찾아보세요.', detail: '주어를 다시 찾지 말고, 연결된 동사를 찾으세요.', tip: '같은 주어에 동사가 두 개 이상 연결되어 있어요.' },
      COORDINATED_CLAUSE: { title: '접속사 뒤 새로운 주어를 찾아보세요.', detail: '새로운 주어·동사 구조가 이어져요.', tip: '접속사 뒤에 새로운 주어·동사 구조가 있어요.' },
      CONTENT_CLAUSE: { title: '뒤에 이어지는 절의 주어를 찾아보세요.', detail: '뒤에 또 하나의 절이 이어져요.', tip: '문장 안에 질문이나 내용을 담은 절이 하나 더 있어요.' },
      NEW_FINITE_CLAUSE: { title: '다음 절의 주어를 찾아보세요.', detail: '뒤에 새로운 주어·동사 구조가 이어져요.', tip: '문장 안에 주어·동사 구조가 한 번 더 나와요.' },
      COMPLETE: { title: '✓ 주어·동사 찾기 완료', detail: '선택한 답을 확인하고 정답 확인을 눌러보세요.', tip: '' }
    };
    return copies[target?.reason] || copies.NEW_FINITE_CLAUSE;
  }

  return { plans, planFor, targets, nextExpectedTarget, copyFor, reasonForClause };
});
