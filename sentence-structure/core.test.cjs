const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core.js');
const H = require('./smart-hints.js');
const G = require('./chunk-guide.js');
const N = require('./sv-continuation.js');
global.window = global;
require(path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-data.js'));
require('./smart-hint-data.js');
const data = global.ELAB_SENTENCE_STRUCTURE_STUDENT_V1;
const row = id => data.records.find(record => record.sentence_id === id);
const hintFrom = (clauses, subjects = [], verbs = [], tokens = []) => H.chooseSmartHint({ clauses }, subjects, verbs, tokens);
const grammarRecord = (clauses, verbCounts = clauses.map(() => 1)) => ({
  sentence_id: 'synthetic',
  subjects: clauses.map(clause => ({ clause_id: clause.clause_id, primary: [0], acceptable: [] })),
  verbs: clauses.flatMap((clause, clauseIndex) => Array.from({ length: verbCounts[clauseIndex] || 0 }, (_, predicateIndex) => ({ clause_id: clause.clause_id, predicate_id: `p${predicateIndex + 1}`, indexes: [1] }))),
  clause_meta: clauses
});
const nextGrammarTarget = (record, subjectCount, verbCount) => N.nextExpectedTarget(record, {
  subject_answers: Array.from({ length: subjectCount }, () => [0]),
  verb_answers: Array.from({ length: verbCount }, () => [1])
});
test('grammar-aware A: simple finite pair completes', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }]);
  assert.deepEqual(nextGrammarTarget(record, 1, 1), { role: 'COMPLETE', reason: 'COMPLETE' });
});

test('grammar-aware B: explicit that-content continues with a new subject', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'OVERT' }]);
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'EXPLICIT_THAT');
  assert.equal(nextGrammarTarget(record, 1, 1).role, 'SUBJECT');
});

test('grammar-aware C: omitted that continues only from verified clause metadata', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'ZERO' }]);
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'OMITTED_THAT');
});

test('grammar-aware D: subject relative targets the relative pronoun subject', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }]);
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'RELATIVE_SUBJECT');
});

test('grammar-aware E: object relative targets its separate subject', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: false }]);
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'RELATIVE_OBJECT');
});

test('grammar-aware F: omitted object relative targets its verified subject', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'RELATIVE', marker_form: 'ZERO' }]);
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'OMITTED_RELATIVE');
});

test('grammar-aware G: coordinated predicate keeps VERB as the next role', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }], [2]);
  const target = nextGrammarTarget(record, 1, 1);
  assert.equal(target.role, 'VERB');
  assert.equal(target.reason, 'COORDINATED_PREDICATE');
});

test('grammar-aware H: coordinated finite clauses request the new SUBJECT', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'MAIN' }]);
  const target = nextGrammarTarget(record, 1, 1);
  assert.equal(target.role, 'SUBJECT');
  assert.equal(target.reason, 'COORDINATED_CLAUSE');
});

test('grammar-aware I: adverbial finite clause requests a new SUBJECT', () => {
  const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'ADVERBIAL', marker_form: 'OVERT' }]);
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'ADVERBIAL');
});

test('grammar-aware content clause covers wh, whether and if without exposing codes', () => {
  for (const type of ['NOUN_WH', 'NOUN_IF_WHETHER', 'CONTENT']) {
    const record = grammarRecord([{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type, marker_form: 'OVERT' }]);
    const target = nextGrammarTarget(record, 1, 1);
    assert.equal(target.reason, 'CONTENT_CLAUSE');
    assert.equal(N.copyFor(target).title.includes('CONTENT'), false);
  }
});

test('grammar-aware J: nonfinite complement does not invent another S/V pair', () => {
  const record = row('corpus:2590');
  assert.equal(nextGrammarTarget(record, 1, 1).role, 'COMPLETE');
});

test('grammar-aware K: corpus:23568 follows reviewed omitted-that then adverbial clauses', () => {
  const record = row('corpus:23568');
  assert.equal(nextGrammarTarget(record, 1, 1).reason, 'OMITTED_THAT');
  assert.equal(nextGrammarTarget(record, 2, 2).reason, 'ADVERBIAL');
  assert.equal(nextGrammarTarget(record, 3, 3).role, 'COMPLETE');
});

test('simple sentence has no smart S/V hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN', marker_form: null, predicate_groups: [{}] }], [{ clause_id: 'c1', primary: [0] }], [{ clause_id: 'c1', indexes: [1] }], ['Identity', 'became']), null);
});

test('explicit that-content clause gets only the that hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN' }, { clause_id: 'c2', clause_type: 'NOUN_THAT', marker_form: 'OVERT', marker_token_indexes: [2], subject_core_token_indexes: [3] }]).type, 'EXPLICIT_THAT');
});

test('omitted that-content clause has highest specific hint', () => {
  const hint = hintFrom([{ clause_id: 'c1', clause_type: 'MAIN' }, { clause_id: 'c2', clause_type: 'NOUN_THAT', marker_form: 'ZERO' }], [{ clause_id: 'c1', primary: [0] }, { clause_id: 'c2', primary: [2] }], [], ['I', 'think', 'he', 'is']);
  assert.equal(hint.type, 'OMITTED_THAT');
  assert.equal(hint.anchor, 'think');
});

test('relative clause with a separate subject gets matching hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN' }, { clause_id: 'c2', clause_type: 'RELATIVE', marker_form: 'OVERT', marker_token_indexes: [2], subject_core_token_indexes: [3] }]).type, 'RELATIVE_WITH_SUBJECT');
});

test('subject relative pronoun gets matching hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN' }, { clause_id: 'c2', clause_type: 'RELATIVE', marker_form: 'OVERT', marker_token_indexes: [2], subject_core_token_indexes: [2] }]).type, 'RELATIVE_PRONOUN_SUBJECT');
});

test('omitted relative gets priority over generic multiple clause hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN' }, { clause_id: 'c2', clause_type: 'RELATIVE', marker_form: 'ZERO', subject_core_token_indexes: [2] }]).type, 'OMITTED_RELATIVE');
});

test('same-subject coordinated predicates get matching hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN', predicate_groups: [{}, {}] }]).type, 'COORDINATED_PREDICATES');
});

test('multiple clauses use generic fallback only without a specific hint', () => {
  assert.equal(hintFrom([{ clause_id: 'c1', clause_type: 'MAIN' }, { clause_id: 'c2', clause_type: 'ADVERBIAL', marker_form: 'OVERT' }], [{ clause_id: 'c1', primary: [0] }, { clause_id: 'c2', primary: [4] }]).type, 'MULTI_CLAUSE');
});

test('Pilot12 hint bundle exactly matches deterministic frozen annotations', () => {
  const pilot = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../output/sentence-structure-pilot/PILOT_50_ANNOTATIONS.json'), 'utf8')).sentences;
  const holdout = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../output/sentence-structure-final-holdout/FINAL_HOLDOUT_8_ANNOTATIONS.json'), 'utf8')).records;
  const hints = global.ELAB_SENTENCE_STRUCTURE_SV_HINTS.records;
  for (const record of data.records) {
    const source = pilot.find(item => item.sentence_id === record.sentence_id) || holdout.find(item => item.sentence_id === record.sentence_id);
    assert.deepEqual(H.chooseSmartHint(source, record.subjects, record.verbs, record.tokens), hints[record.sentence_id] || null, record.sentence_id);
  }
});

test('reviewed Pilot12 runtime is minimal and valid', () => {
  assert.equal(data.record_count, 12);
  assert.equal(data.records.every(C.validateRecord), true);
  assert.equal(data.records.some(record => 'parser_tokens' in record || 'source_provenance' in record), false);
});

test('student chunk guide exposes nine lesson categories without answer junctions', () => {
  assert.equal(G.rules.length, 9);
  assert.equal(JSON.stringify(G.rules).includes('junction'), false);
  assert.equal(new Set(G.rules.map(rule => rule.id)).size, 9);
});

test('simple S1 sentence uses reviewed answers', () => {
  const record = row('corpus:2970');
  assert.equal(record.structure_level, 'S1');
  assert.equal(C.evaluateStructure(record, [[0]], [[2]]).correct, true);
});

test('multiple S/V sentence requires every reviewed pair span', () => {
  const record = row('corpus:23568');
  assert.equal(record.subjects.length, 3);
  assert.equal(record.verbs.length, 3);
  assert.equal(C.evaluateStructure(record, [[0], [7, 8, 9, 10], [16]], [[1], [11], [18]]).correct, true);
  assert.equal(C.evaluateStructure(record, [[0]], [[1]]).correct, false);
});

test('corpus:2479 accepts the selectable surface span around its non-contiguous canonical verb group', () => {
  const record = row('corpus:2479');
  assert.deepEqual(record.subjects.map(item => item.primary), [[0], [5]]);
  assert.deepEqual(record.verbs.map(item => item.indexes), [[3], [6, 8]]);
  const result = C.evaluateStructure(record, [[0], [5]], [[3], [6, 7, 8]]);
  assert.equal(result.subject_correct, true);
  assert.equal(result.verb_correct, true);
  assert.equal(result.correct, true);
  assert.deepEqual(result.error_types, []);
  assert.equal(C.evaluateStructure(record, [[0], [5]], [[3], [6], [8]]).verb_correct, true);
  assert.equal(C.evaluateStructure(record, [[0], [5]], [[3], [5, 6, 7, 8]]).verb_correct, false);
  assert.equal(C.evaluateStructure(record, [[0], [5]], [[3], [6], [7], [8]]).verb_correct, false);
});

test('auxiliary chains tolerate only teacher-canonical internal modifier gaps', () => {
  const cases = [
    { tokens: ['can', 'solve', 'They'], canonical: [0, 1], submitted: [0, 1] },
    { tokens: ['can', 'probably', 'solve', 'They'], canonical: [0, 2], submitted: [0, 1, 2] },
    { tokens: ['will', 'definitely', 'help', 'They'], canonical: [0, 2], submitted: [0, 1, 2] },
    { tokens: ['has', 'already', 'finished', 'They'], canonical: [0, 2], submitted: [0, 1, 2] },
    { tokens: ['could', 'not', 'be', 'performed', 'It'], canonical: [0, 1, 2, 3], submitted: [0, 1, 2, 3] }
  ];
  for (const item of cases) {
    const record = {
      sentence_id: item.tokens.join('-'), tokens: item.tokens, structure_level: 'S1',
      subjects: [{ clause_id: 'c1', primary: [item.tokens.length - 1], acceptable: [] }],
      verbs: [{ clause_id: 'c1', predicate_id: 'p1', indexes: item.canonical }],
      boundaries: item.tokens.slice(1).map((_, junction) => ({ junction, policy: 'NO_SPLIT' }))
    };
    assert.equal(C.evaluateStructure(record, [[item.tokens.length - 1]], [item.submitted]).verb_correct, true, item.tokens.join(' '));
    assert.equal(C.evaluateStructure(record, [[item.tokens.length - 1]], [[...item.submitted, item.tokens.length - 1]]).verb_correct, false, `${item.tokens.join(' ')} trailing token`);
  }
});

test('acceptable subject is exact OR, not a broad expansion', () => {
  const record = row('corpus:25018');
  assert.equal(C.evaluateStructure(record, [[0]], [[2]]).subject_correct, true);
  assert.equal(C.evaluateStructure(record, [[0, 1]], [[2]]).subject_correct, true);
  assert.equal(C.evaluateStructure(record, [[1]], [[2]]).subject_correct, false);
  assert.equal(C.evaluateStructure(record, [[0, 1, 2]], [[2]]).subject_correct, false);
});

test('student meaning verb span keeps needs to be done whole', () => {
  const record = row('corpus:59087');
  assert(record.verbs.some(item => C.sameSpan(item.indexes, [24, 25, 26, 27])));
  const subjects = record.subjects.map(item => item.primary);
  const verbs = record.verbs.map(item => item.indexes);
  assert.equal(C.evaluateStructure(record, subjects, verbs).verb_correct, true);
  assert.equal(C.evaluateStructure(record, subjects, verbs.map(span => C.sameSpan(span, [24, 25, 26, 27]) ? [24] : span)).verb_correct, false);
});

test('wanted remains the exact student verb answer', () => {
  const record = row('corpus:2590');
  assert.deepEqual(record.verbs[0].indexes, [1]);
  assert.equal(C.evaluateStructure(record, [[0]], [[1]]).verb_correct, true);
  assert.equal(C.evaluateStructure(record, [[0]], [[1, 2, 3]]).verb_correct, false);
});

test('verified consist of expression is an acceptable student verb span without changing canonical', () => {
  const record = row('corpus:26237');
  const subjects = record.subjects.map(item => item.primary);
  const canonical = record.verbs.map(item => item.indexes);
  assert.deepEqual(canonical[0], [2]);
  assert.equal(C.evaluateStructure(record, subjects, canonical).verb_correct, true);
  assert.equal(C.evaluateStructure(record, subjects, [[2, 3], canonical[1]]).verb_correct, true);
  const withoutVerifiedExpression = { ...record, expressions: [] };
  assert.equal(C.evaluateStructure(withoutVerifiedExpression, subjects, [[2, 3], canonical[1]]).verb_correct, false);
});

test('an unrelated verified expression does not expand another verb target', () => {
  const record = row('corpus:2590');
  assert.equal(C.evaluateStructure(record, [[0]], [[1, 2, 3]]).verb_correct, false);
  assert.deepEqual(C.acceptedVerbSpans(record, record.verbs[0]), [[1]]);
});

test('OPTIONAL split is correct both selected and omitted', () => {
  const record = row('corpus:2590');
  const optional = record.boundaries.find(item => item.policy === 'OPTIONAL_SPLIT').junction;
  assert.equal(C.evaluateChunks(record, []).correct, true);
  assert.equal(C.evaluateChunks(record, [optional]).correct, true);
  assert.deepEqual(C.evaluateChunks(record, [optional]).optional_used, [optional]);
});

test('MUST missing and NO_SPLIT use distinct future wrongnote types', () => {
  const record = row('corpus:23568');
  const must = record.boundaries.find(item => item.policy === 'MUST_SPLIT').junction;
  const no = record.boundaries.find(item => item.policy === 'NO_SPLIT').junction;
  assert(C.evaluateChunks(record, []).required_missed.includes(must));
  assert(C.evaluateChunks(record, [must, no]).forbidden_used.includes(no));
  assert(C.evaluateChunks(record, []).error_types.includes('REQUIRED_CHUNK_MISSED'));
  assert(C.evaluateChunks(record, [must, no]).error_types.includes('FORBIDDEN_CHUNK_USED'));
});

test('support levels change hints without changing correctness', () => {
  const record = row('corpus:59087');
  const counts = C.SUPPORT_LEVELS.map(level => C.hintJunctions(record, level).length);
  assert(counts[0] >= counts[1] && counts[1] >= counts[2] && counts[2] >= counts[3]);
  const before = C.evaluateChunks(record, []);
  for (const level of C.SUPPORT_LEVELS) C.hintJunctions(record, level);
  assert.deepEqual(C.evaluateChunks(record, []), before);
});

test('approved V5 expressions are shown only where present', () => {
  assert(row('corpus:2590').expressions.some(item => item.expression === 'blow money on ~'));
  assert(row('corpus:23568').expressions.some(item => item.expression === 'mislead A into V-ing'));
  assert.deepEqual(row('corpus:25018').expressions, []);
});

test('source marker is absent from student text and tokens', () => {
  const record = row('corpus:2590');
  assert.equal(record.text, 'They wanted to get rich quick and blow their money on fast cars and expensive champagne.');
  assert.equal(record.tokens.some(token => /[①②③④⑤]/.test(token)), false);
});

test('local result object follows the future integration contract', () => {
  const record = row('corpus:25018');
  const result = C.buildResult(record, { subject_answers: [[0, 1]], verb_answers: [[2]], subject_attempts: 1, verb_attempts: 1, chunk_boundaries: [], sv_hint_type: null, sv_hint_level: 0, sv_hint_used: false, hint_used: true, reading_support_level: 'foundation' }, '2026-09-25T00:00:00.000Z');
  assert.deepEqual(Object.keys(result), ['sentence_id', 'structure_level', 'subject_attempts', 'subject_correct', 'verb_attempts', 'verb_correct', 'chunk_required_missed', 'chunk_forbidden_used', 'chunk_optional_used', 'sv_hint_type', 'sv_hint_level', 'sv_hint_used', 'assigned_hint_level', 'hint_used', 'second_hint_used', 'chunk_hint_used', 'reading_support_level', 'expression_ids_shown', 'error_types', 'completed_at']);
  assert.equal(result.assigned_hint_level, 'DETAILED');
  assert.equal(result.subject_correct, true);
  assert.equal(result.sv_hint_used, false);
  assert.equal(result.hint_used, false);
  assert.equal(result.second_hint_used, false);
  assert.equal(result.chunk_hint_used, true);
});

test('smart S/V hint use is recorded without answer spans', () => {
  const record = row('corpus:23568');
  const result = C.buildResult(record, { subject_answers: record.subjects.map(item => item.primary), verb_answers: record.verbs.map(item => item.indexes), subject_attempts: 1, verb_attempts: 1, chunk_boundaries: [], smart_hint_visible: true, sv_hint_type: 'OMITTED_THAT', sv_hint_level: 2, sv_hint_used: true, hint_used: false, reading_support_level: 'beginner' });
  assert.equal(result.sv_hint_type, 'OMITTED_THAT');
  assert.equal(result.sv_hint_level, 2);
  assert.equal(result.sv_hint_used, true);
  assert.equal(result.assigned_hint_level, 'DETAILED');
  assert.equal(result.hint_used, true);
  assert.equal(result.second_hint_used, true);
  assert.equal(JSON.stringify(result).includes('subject_answers'), false);
});

test('assignment hint levels are recorded independently from S1-S5', () => {
  const record = row('corpus:23568');
  const base = { subject_answers: record.subjects.map(item => item.primary), verb_answers: record.verbs.map(item => item.indexes), subject_attempts: 1, verb_attempts: 1, chunk_boundaries: [], smart_hint_visible: true, reading_support_level: 'beginner' };
  const none = C.buildResult(record, { ...base, assigned_hint_level: 'NONE', second_hint_used: false });
  const basic = C.buildResult(record, { ...base, assigned_hint_level: 'BASIC', second_hint_used: false });
  const detailed = C.buildResult(record, { ...base, assigned_hint_level: 'DETAILED', second_hint_used: true, sv_hint_used: true, sv_hint_level: 2 });
  assert.deepEqual([none.assigned_hint_level, none.hint_used, none.second_hint_used], ['NONE', false, false]);
  assert.deepEqual([basic.assigned_hint_level, basic.hint_used, basic.second_hint_used], ['BASIC', true, false]);
  assert.deepEqual([detailed.assigned_hint_level, detailed.hint_used, detailed.second_hint_used], ['DETAILED', true, true]);
  assert.equal(none.structure_level, detailed.structure_level);
});
