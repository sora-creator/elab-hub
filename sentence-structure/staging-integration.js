(function (global) {
  'use strict';
  const params = new URLSearchParams(global.location.search);
  const context = {
    hook: params.get('hook') || '',
    set_key: params.get('set_key') || params.get('study') || '',
    assignment_id: params.get('assignment_id') || '',
    assignment_target_id: params.get('assignment_target_id') || '',
    student_id: params.get('student_id') || '',
    assignmentCapability: params.get('assignmentCapability') || '',
    attempt_id: '',
    attemptCapability: '',
    studentCapability: '',
    progress: null
  };
  const active = Boolean(context.hook && context.set_key && context.assignment_target_id && context.student_id && context.assignmentCapability);

  function fingerprint(records) {
    let hash = 2166136261;
    JSON.stringify(records.map(record => [record.sentence_id, record.text || '', record.tokens])).split('').forEach(char => {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return `assignment-${context.set_key}-${(hash >>> 0).toString(16)}`;
  }
  function readUrl(action, extra) {
    const url = new URL(context.hook);
    url.searchParams.set('action', action);
    Object.entries(extra || {}).forEach(([key, value]) => { if (value !== '') url.searchParams.set(key, value); });
    return url.href;
  }
  async function load() {
    if (!active) return null;
    const response = await global.ELABAppsScript.read(readUrl('fetchSentenceSet', {
      key: context.set_key,
      assignment_id: context.assignment_id,
      assignment_target_id: context.assignment_target_id,
      student_id: context.student_id,
      assignmentCapability: context.assignmentCapability
    }));
    if (!response?.found || !Array.isArray(response.passages) || !response.passages.length) {
      throw new Error('배정된 문장 세트를 불러오지 못했습니다.');
    }
    context.attempt_id = response.attempt_id || '';
    context.attemptCapability = response.attemptCapability || '';
    context.studentCapability = response.studentCapability || '';
    context.progress = response.sentence_progress || null;
    global.ELAB_SENTENCE_STRUCTURE_STUDENT_V1 = {
      dataset_id: context.set_key,
      fingerprint: fingerprint(response.passages),
      records: response.passages
    };
    return context;
  }
  function postResult(result, sequence) {
    if (!active) return Promise.resolve({ local_only: true });
    const payload = {
      action: 'submitSentenceHomework',
      contract_version: 'sentence-structure-student-v1',
      setKey: context.set_key,
      assignment_id: context.assignment_id,
      assignment_target_id: context.assignment_target_id,
      student_id: context.student_id,
      assignmentCapability: context.assignmentCapability,
      attempt_id: context.attempt_id,
      attemptCapability: context.attemptCapability,
      studentCapability: context.studentCapability,
      passages: [{ ...result, sequence }]
    };
    return fetch(context.hook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(() => verify(result.sentence_id));
  }
  async function verify(sentenceId) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const progress = await global.ELABAppsScript.read(readUrl('getSentenceStructureProgressV1', {
        attempt_id: context.attempt_id,
        assignment_target_id: context.assignment_target_id,
        student_id: context.student_id,
        attemptCapability: context.attemptCapability
      }));
      if ((progress.results || []).some(result => result.sentence_id === sentenceId)) {
        context.progress = progress;
        return progress;
      }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    throw new Error('학습 결과 저장을 확인하지 못했습니다.');
  }
  global.ELABSentenceStructureStaging = { active, context, ready: load(), postResult };
})(window);
