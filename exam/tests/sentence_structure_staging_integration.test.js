const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const props = { TOKEN: 'teacher', STUDENT_CAPABILITY_SECRET: 'student-secret' };
const sheets = {};
function sheet(name, rows = []) {
  return sheets[name] = {
    rows,
    getDataRange() { return { getValues: () => this.rows }; },
    getRange(r, c, rc = 1, cc = 1) {
      const target = this;
      return {
        getValues: () => target.rows.slice(r - 1, r - 1 + rc).map(row => row.slice(c - 1, c - 1 + cc)),
        getValue: () => target.rows[r - 1] && target.rows[r - 1][c - 1],
        setValue(value) { while (target.rows.length < r) target.rows.push([]); target.rows[r - 1][c - 1] = value; },
        setValues(values) { values.forEach((row, ri) => row.forEach((value, ci) => { while (target.rows.length < r + ri) target.rows.push([]); target.rows[r - 1 + ri][c - 1 + ci] = value; })); }
      };
    },
    appendRow(row) { this.rows.push(row); },
    getLastRow() { return this.rows.length; },
    getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); },
    deleteRow(r) { this.rows.splice(r - 1, 1); },
    copyTo() { return this; },
    setName() { return this; }
  };
}
const spreadsheet = { getId: () => '', getName: () => '', getSheets: () => Object.values(sheets), getSheetByName: name => sheets[name] || null, insertSheet: name => sheet(name) };
const context = {
  console, Date, JSON, Math, Array, Object, String, Number,
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] || '', setProperty: (key, value) => props[key] = value }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush() {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => '' },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ put() {}, get: () => null, remove() {} }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(), formatDate: () => '', Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'), base64DecodeWebSafe: value => Buffer.from(value, 'base64url'),
    computeHmacSha256Signature: (value, secret) => crypto.createHmac('sha256', secret).update(value).digest(),
    computeDigest: (_algorithm, value) => crypto.createHash('sha256').update(value).digest(), newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') })
  },
  ContentService: { MimeType: { JAVASCRIPT: 'js' }, createTextOutput: body => ({ body, setMimeType() { return this; } }) }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('exam/sheet_backend.gs', 'utf8'), context);
context.setup();

const now = new Date();
const teacher = props.DEFAULT_TEACHER_ID;
const student = crypto.randomUUID();
sheets.StudentsV2.appendRow([student, teacher, 'STAGING Sentence Student', 'STAGING', true, now, now]);

const setKey = 'STAGING-SENTENCE-V1';
const records = [
  ['simple', 'We learn.', ['We', 'learn', '.'], [[0]], [[1]]],
  ['wrong-subject', 'They study.', ['They', 'study', '.'], [[0]], [[1]]],
  ['wrong-verb', 'Birds fly.', ['Birds', 'fly', '.'], [[0]], [[1]]],
  ['both-wrong', 'Children play.', ['Children', 'play', '.'], [[0]], [[1]]],
  ['accepted-surface', 'We can probably expect surprises.', ['We', 'can', 'probably', 'expect', 'surprises', '.'], [[0]], [[1, 3]]]
].map(([id, text, tokens, subjects, verbs]) => ({
  sentence_id: `staging:${id}`, text, tokens, structure_level: 'S1',
  subjects: subjects.map(primary => ({ primary, acceptable: [] })),
  verbs: verbs.map(indexes => ({ indexes })),
  chunking: { boundaries: [] }, expressions: id === 'accepted-surface' ? [{ expression_id: 'expr-staging-1' }] : []
}));
context.handleSaveSentenceSet_({ setKey, label: '[STAGING] Sentence Structure V1', passages: records });
const stored = JSON.parse(sheets.SentenceSets.rows[1][2]);
assert.strictEqual(stored.length, 5);
assert(stored.every(record => context.validUuid_(record.question_id)));

const assignment = crypto.randomUUID();
const target = crypto.randomUUID();
sheets.AssignmentsV2.appendRow([assignment, teacher, 'SENTENCE_STRUCTURE', setKey, '[STAGING] Sentence Structure V1', '../sentence-structure/index.html?set_key=' + setKey + '&hint_level=BASIC&reading_support=beginner', now, '', true, now, now, '']);
sheets.AssignmentTargetsV2.appendRow([target, assignment, student, 'NOT_STARTED', '', '', true, now, now]);
const attempt = context.getOrCreateAttemptV2_(target, student, 'launch:' + target, false);
const reused = context.getOrCreateAttemptV2_(target, student, 'another-request', false);
assert.strictEqual(reused[0], attempt[0]);
assert.strictEqual(sheets.AttemptsV2.rows.length, 2);
const attemptCapability = context.createStudentCapability_('assignmentTarget', target, ['submitAttemptQuestionV2'], { student_id: student }, 0);
const base = { setKey, assignment_id: assignment, assignment_target_id: target, student_id: student, attempt_id: attempt[0], attemptCapability };

function submit(index, subjectCorrect, verbCorrect, extra = {}) {
  const record = stored[index];
  const result = Object.assign({
    sentence_id: record.sentence_id, structure_level: record.structure_level,
    subject_answers: subjectCorrect ? record.subjects.map(item => item.primary) : [[1]],
    verb_answers: verbCorrect ? record.verbs.map(item => item.indexes) : [[0]],
    subject_attempts: 1, subject_correct: subjectCorrect, verb_attempts: 1, verb_correct: verbCorrect,
    student_chunk_boundaries: [1], chunk_completed: true, assigned_hint_level: 'BASIC', hint_used: false,
    second_hint_used: false, reading_support_level: 'beginner', expression_ids_shown: [], completed_at: new Date().toISOString(), sequence: index + 1
  }, extra);
  return context.handleSubmitSentenceStructureStudentV1_(Object.assign({}, base, { passages: [result] }));
}

assert(submit(0, true, true).body.startsWith('ok:'));
assert.strictEqual(sheets.ReviewItemsV2.rows.length, 1);
assert(submit(1, false, true).body.startsWith('ok:'));
assert.strictEqual(sheets.ReviewItemsV2.rows.length, 2);
assert.strictEqual(sheets.ReviewItemsV2.rows[1][5], 'SUBJECT');
assert.strictEqual(context.publicReviewItemV2_(sheets.ReviewItemsV2.rows[1], true).error_type, 'SUBJECT_SPAN');
const eventCount = sheets.ReviewEventsV2.rows.length;
assert(submit(1, false, true).body.startsWith('ok:'));
assert.strictEqual(sheets.ReviewEventsV2.rows.length, eventCount, 'duplicate sentence submission must be idempotent');
assert(submit(2, true, false).body.startsWith('ok:'));
assert.strictEqual(sheets.ReviewItemsV2.rows.length, 3);
assert.strictEqual(sheets.ReviewItemsV2.rows[2][5], 'MAIN_VERB');
assert.strictEqual(context.publicReviewItemV2_(sheets.ReviewItemsV2.rows[2], true).error_type, 'VERB_SPAN');
assert(submit(3, false, false).body.startsWith('ok:'));
assert.strictEqual(sheets.ReviewItemsV2.rows.length, 5);
assert(submit(4, true, true, { verb_answers: [[1, 2, 3]], expression_ids_shown: ['expr-staging-1'] }).body.startsWith('ok:'));

const progress = context.sentenceStructureProgressV1_(context.attemptByIdV2_(attempt[0]));
assert.strictEqual(progress.results.length, 5);
assert.deepStrictEqual(JSON.parse(JSON.stringify(progress.summary)), { sentences_completed: 5, subject_correct_count: 3, verb_correct_count: 3, hint_used_count: 0, expressions_seen: 1 });
assert.strictEqual(sheets.AttemptsV2.rows[1][9], 'COMPLETED');
assert.strictEqual(sheets.AssignmentTargetsV2.rows[1][3], 'COMPLETED');
assert.strictEqual(sheets.ReviewItemsV2.rows.length, 5, 'header plus exactly four S/V ReviewItems');
assert.strictEqual(sheets.ReviewItemsV2.rows.slice(1).some(row => !['SUBJECT', 'MAIN_VERB'].includes(row[5])), false);
assert.strictEqual(sheets.WordsV2.rows.length, 1, 'V5 exposure must not write VocabularyDB');
assert.strictEqual(sheets.WordAttemptItemsV2.rows.length, 1, 'V5 exposure must not write vocab attempt items');
const acceptedDetail = sheets.SentenceStructureDetailsV2.rows.slice(1).map(row => row[14]).filter(Boolean).map(value => JSON.parse(value)).find(meta => meta.sentence_id === 'staging:accepted-surface');
assert.deepStrictEqual(JSON.parse(JSON.stringify(acceptedDetail.student_v1_result.verb_answers)), [[1, 2, 3]]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(acceptedDetail.student_v1_result.student_chunk_boundaries)), [1]);
console.log('sentence_structure_staging_integration.test.js: all assertions passed');
