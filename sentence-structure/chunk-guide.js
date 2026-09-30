(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ELABSentenceStructureChunkGuide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const rules = [
    { id: 'R1_CONJUNCTION', number: '①', short: '접속사', title: '접속사 앞', detail: 'and · but · because · if · when 등' },
    { id: 'R2_RELATIVE', number: '②', short: '관계사', title: '관계사 앞', detail: 'who · which · that · whose 등' },
    { id: 'R3_PREPOSITIONAL_PHRASE', number: '③', short: '전치사', title: '전치사 앞', detail: 'in · on · at · for · with · by 등' },
    { id: 'R4_VED', number: '④', short: 'V-ed', title: '과거분사(V-ed) 앞', detail: '명사를 꾸미거나 상태를 보충하는 V-ed 덩어리를 살펴보세요.' },
    { id: 'R5_VING', number: '⑤', short: 'V-ing', title: '현재분사(V-ing) 앞', detail: '명사를 꾸미거나 동작을 덧붙이는 V-ing 덩어리를 살펴보세요.' },
    { id: 'R6_TO_INFINITIVE', number: '⑥', short: 'to-V', title: 'to부정사 앞', detail: 'to + 동사원형' },
    { id: 'R7_OMITTED_RELATIVE', number: '⑦', short: '명사 + S+V', title: '명사 뒤에 바로 S + V', detail: '새로운 주어(S) 앞에서 끊어보세요. 관계사가 생략된 구조일 수 있어요.' },
    { id: 'R8_OMITTED_CONJUNCTION', number: '⑧', short: '동사 + S+V', title: '동사 뒤에 S + V', detail: '새로운 주어(S) 앞에서 끊어보세요. 접속사 that이 생략된 구조일 수 있어요.' },
    { id: 'R9_LONG_SUBJECT_VERB_DISTANCE', number: '⑨', short: '긴 주어', title: '주어가 아주 길 때', detail: '핵심 동사 앞에서 끊어보세요.' }
  ];

  return { rules };
});
