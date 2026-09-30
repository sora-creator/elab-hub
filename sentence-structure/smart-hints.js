(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ELABSentenceStructureSmartHints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = [
    'OMITTED_RELATIVE',
    'OMITTED_THAT',
    'RELATIVE_PRONOUN_SUBJECT',
    'RELATIVE_WITH_SUBJECT',
    'EXPLICIT_THAT',
    'COORDINATED_PREDICATES',
    'MULTI_CLAUSE'
  ];

  function indexes(value) {
    return (Array.isArray(value) ? value : []).map(Number).filter(Number.isInteger);
  }

  function chooseSmartHint(annotation, subjects = [], verbs = [], tokens = []) {
    const source = annotation?.auto || annotation || {};
    const autoClauses = source.clauses || [];
    const autoById = new Map(autoClauses.map(clause => [clause.clause_id, clause]));
    const teacherClauses = annotation?.teacher?.teacher_clauses;
    const clauses = (Array.isArray(teacherClauses) && teacherClauses.length ? teacherClauses : autoClauses).map(clause => {
      const auto = autoById.get(clause.clause_id) || {};
      const subject = indexes(clause.teacher_primary_subject_span || clause.teacher_subject_indexes || clause.subject_core_token_indexes || auto.subject_core_token_indexes);
      const markerIndexes = indexes(clause.marker_token_indexes || auto.marker_token_indexes);
      return {
        id: clause.clause_id,
        type: clause.teacher_type || clause.clause_type || clause.type || auto.clause_type || '',
        markerForm: clause.marker_form || auto.marker_form || '',
        markerIndexes,
        subject,
        predicateCount: (clause.teacher_predicates || clause.predicate_groups || auto.predicate_groups || []).length
      };
    });

    const zeroRelative = clauses.find(clause => clause.type === 'RELATIVE' && clause.markerForm === 'ZERO');
    if (zeroRelative) return { type: 'OMITTED_RELATIVE' };

    const zeroThat = clauses.find(clause => clause.type === 'NOUN_THAT' && clause.markerForm === 'ZERO');
    if (zeroThat) {
      const laterSubject = subjects.map(item => indexes(item.primary)).filter(span => span.length).sort((a, b) => a[0] - b[0]).find(span => span[0] > 0);
      const anchorIndex = laterSubject ? laterSubject[0] - 1 : -1;
      const anchor = anchorIndex >= 0 && /[A-Za-z]/.test(tokens[anchorIndex] || '') ? String(tokens[anchorIndex]).replace(/[.,;:!?]+$/, '') : '';
      return { type: 'OMITTED_THAT', ...(anchor ? { anchor } : {}) };
    }

    const relatives = clauses.filter(clause => clause.type === 'RELATIVE' && clause.markerForm !== 'ZERO');
    const pronounSubject = relatives.find(clause => clause.markerIndexes.some(index => clause.subject.includes(index)));
    if (pronounSubject) return { type: 'RELATIVE_PRONOUN_SUBJECT' };

    const separateSubject = relatives.find(clause => clause.markerIndexes.length && clause.subject.some(index => index > Math.max(...clause.markerIndexes)));
    if (separateSubject) return { type: 'RELATIVE_WITH_SUBJECT' };

    if (clauses.some(clause => clause.type === 'NOUN_THAT' && clause.markerForm !== 'ZERO')) return { type: 'EXPLICIT_THAT' };

    const verbCounts = new Map();
    for (const verb of verbs) verbCounts.set(verb.clause_id, (verbCounts.get(verb.clause_id) || 0) + 1);
    if (clauses.some(clause => clause.predicateCount > 1) || [...verbCounts.values()].some(count => count > 1)) return { type: 'COORDINATED_PREDICATES' };

    const clauseIds = new Set(subjects.map(item => item.clause_id).filter(Boolean));
    if (clauseIds.size > 1 || clauses.length > 1) return { type: 'MULTI_CLAUSE' };
    return null;
  }

  function hintText(hint, level = 1) {
    if (!hint || !TYPES.includes(hint.type)) return null;
    const second = Number(level) >= 2;
    const copy = {
      OMITTED_RELATIVE: second ? '관계사가 생략된 관계절일 수 있어요.' : '명사 뒤에 바로 새로운 주어와 동사가 이어지는 부분이 있는지 확인해보세요.',
      OMITTED_THAT: second ? '접속사 that이 생략된 내용절일 수 있어요.' : `${hint.anchor ? `${hint.anchor} 뒤에서` : '동사 뒤에'} 새로운 주어와 동사가 바로 이어지는 부분이 있는지 살펴보세요.`,
      RELATIVE_PRONOUN_SUBJECT: second ? '관계사 뒤에 별도 주어가 없다면 관계사 자체의 역할을 생각해보세요.' : '관계사가 그 절의 주어 역할을 할 수도 있어요.',
      RELATIVE_WITH_SUBJECT: second ? '관계사 다음의 명사나 대명사가 새 절의 주어인지 살펴보세요.' : '관계사 뒤에서 또 다른 주어와 동사가 나오는지 확인해보세요.',
      EXPLICIT_THAT: second ? 'that으로 시작하는 절의 주어와 동사를 따로 살펴보세요.' : 'that 뒤에서 새로운 주어와 동사가 시작되는지 확인해보세요.',
      COORDINATED_PREDICATES: second ? '앞의 주어를 다시 쓰지 않고 동사만 이어졌을 수도 있어요.' : 'and / but / or 뒤에 같은 주어와 연결되는 동사가 더 있는지 확인해보세요.',
      MULTI_CLAUSE: second ? '접속사나 관계사 주변에서 새 구조가 시작되는지 살펴보세요.' : '문장 안에 주어·동사 구조가 한 번 더 나오는 부분이 있는지 살펴보세요.'
    };
    return copy[hint.type];
  }

  return { TYPES, chooseSmartHint, hintText };
});
