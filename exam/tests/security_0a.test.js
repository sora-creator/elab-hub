const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const properties = { TOKEN: 'teacher-secret', STUDENT_CAPABILITY_SECRET: 'student-signing-secret' };
const cache = new Map();

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

const sheets = {};
function sheet(name, rows) {
  const created = sheets[name] = {
    rows,
    getDataRange() { return { getValues: () => this.rows }; },
    getRange(row, col, rowCount, colCount) {
      const target = this;
      return {
        getValues: () => target.rows.slice(row - 1, row - 1 + (rowCount || 1)).map(r => r.slice(col - 1, col - 1 + (colCount || 1))),
        setValue(value) {
          while (target.rows.length < row) target.rows.push([]);
          while (target.rows[row - 1].length < col) target.rows[row - 1].push('');
          target.rows[row - 1][col - 1] = value;
        },
        setValues(values) {
          values.forEach((sourceRow, ri) => sourceRow.forEach((value, ci) => {
            while (target.rows.length < row + ri) target.rows.push([]);
            while (target.rows[row - 1 + ri].length < col + ci) target.rows[row - 1 + ri].push('');
            target.rows[row - 1 + ri][col - 1 + ci] = value;
          }));
        }
      };
    },
    appendRow(row) { this.rows.push(row); },
    deleteRow(row) { this.rows.splice(row - 1, 1); },
    getLastRow() { return this.rows.length; },
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); },
    getName() { return name; },
    copyTo() { return sheet('copy-' + crypto.randomUUID(), this.rows.map(r => r.slice())); },
    setName(nextName) { delete sheets[name]; name = nextName; sheets[name] = this; return this; }
  };
  return created;
}

sheet('Exams', [[], ['exam-1', '시험', '18~19', 2, '[1,2]', '["a","b"]', new Date(), 0, '[18,19]', 'image', '[]']]);
sheet('ExamResults', [[]]);
sheet('GrammarSets', [[], ['grammar-1', 'relative_clause', '관계사절', '[]', new Date(), '']]);
sheet('GrammarFinals', [[], ['final-1', '문법', '[]', new Date(), '']]);
sheet('PracticeExams', [[], ['practice-1', '실전', '18~19', '[]', '[1,2]', '[18,19]', new Date(), 0]]);
sheet('PracticeResults', [[]]);
sheet('SentenceSets', [[], ['sentence-1', '문장', '[]', new Date()]]);
sheet('Students', [[], ['학생A', '1234', new Date()]]);

const context = {
  console,
  Date,
  JSON,
  Math,
  Array,
  Object,
  String,
  Number,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => properties[key] || '',
      setProperty: (key, value) => { properties[key] = value; }
    })
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: {
    getScriptCache: () => ({
      put: (key, value) => cache.set(key, value),
      get: key => cache.get(key) || null
    })
  },
  Utilities: {
    Charset: { UTF_8: 'utf8' },
    DigestAlgorithm: { SHA_256: 'sha256' },
    getUuid: () => crypto.randomUUID(),
    formatDate: () => '20260816-120000',
    base64EncodeWebSafe: value => b64url(Buffer.isBuffer(value) ? value : Buffer.from(value)),
    base64DecodeWebSafe: value => Buffer.from(value, 'base64url'),
    computeHmacSha256Signature: (value, secret) => crypto.createHmac('sha256', secret).update(value).digest(),
    computeDigest: (_algorithm, value) => crypto.createHash('sha256').update(value).digest(),
    newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') })
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getId: () => 'sheet-id', getName: () => 'test-sheet',
      getSheets: () => Object.values(sheets),
      getSheetByName: name => sheets[name] || null,
      insertSheet: name => sheet(name, [])
    })
  },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'teacher@example.test' }), getScriptTimeZone: () => 'Asia/Seoul' },
  ContentService: {
    MimeType: { JAVASCRIPT: 'js' },
    createTextOutput: body => ({ body, setMimeType() { return this; } })
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('exam/sheet_backend.gs', 'utf8'), context);

function assertNoTeacherSecret(response) {
  const json = JSON.stringify(response);
  assert(!json.includes(properties.TOKEN), 'teacher TOKEN leaked');
  assert(!Object.prototype.hasOwnProperty.call(response, 'submitToken'), 'legacy submitToken field leaked');
  assert(response.studentCapability, 'student capability missing');
}

// TEST 1: public content responses contain capability, never the teacher TOKEN.
assertNoTeacherSecret(context.handleFetchExam_({ parameter: { key: 'exam-1', nums: '' } }));
assertNoTeacherSecret(context.handleFetchGrammarSet_({ parameter: { key: 'grammar-1' } }));
assertNoTeacherSecret(context.handleFetchGrammarFinal_({ parameter: { key: 'final-1', nums: '' } }));
assertNoTeacherSecret(context.handleFetchPractice_({ parameter: { key: 'practice-1' } }));
assertNoTeacherSecret(context.handleFetchSentenceSet_({ parameter: { key: 'sentence-1' } }));
assertNoTeacherSecret(context.handleIssueVocabCapability_({ parameter: { key: 'vocab-session-1' } }));

// TEST 2: student clients do not send/store the teacher TOKEN for student actions.
for (const file of ['exam/js/studentApp.js', 'grammar/index.html', 'practice/index.html', 'vocab/index.html']) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!/action\s*:\s*['"]submit(?:Result|GrammarPractice|GrammarFinalResult|PracticeResult|SentenceHomework|VocabResult)['"][\s\S]{0,120}\btoken\s*:/.test(source), file + ' still sends token in a student submission');
}
const vocabSource = fs.readFileSync('vocab/index.html', 'utf8');
assert(!/const payload = \{[^\n]*\bdt\s*[:,]/.test(vocabSource), 'new vocab links still embed dt');

// Changed browser scripts remain syntactically valid.
new Function(fs.readFileSync('exam/js/studentApp.js', 'utf8'));
for (const file of ['grammar/index.html', 'practice/index.html', 'vocab/index.html']) {
  const source = fs.readFileSync(file, 'utf8');
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(code => code.trim());
  for (const code of scripts) new Function(code);
}

const examCapability = context.createStudentCapability_('exam', 'exam-1', ['submitResult', 'fetchMyResult'], { nums: '' }, 0);

// TEST 3: a student capability cannot list students or reveal PINs.
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.handleListStudents_({ parameter: { token: examCapability } }))),
  { error: 'no token' }
);

// TEST 4/5: student capability cannot dispatch teacher delete/content mutation actions.
for (const action of ['deleteStudent', 'saveExam', 'deleteGrammarFinal']) {
  const result = context.doPost({ postData: { contents: JSON.stringify({ action, token: examCapability, studentCapability: examCapability }) } });
  assert.strictEqual(result.body, 'no');
}

// TEST 6: result access additionally requires the unguessable resultKey and matching name.
context.cacheStudentResult_('exam', 'exam-1', 'result-key-a', { found: true, name: '학생A', score: 2 });
assert.strictEqual(context.handleFetchMyResult_({ parameter: {
  key: 'exam-1', name: '학생B', nums: '', resultKey: 'result-key-a', studentCapability: examCapability
} }).found, false);

// TEST 7: valid scoped capability reaches the real scoring/storage handler.
const validSubmit = context.doPost({ postData: { contents: JSON.stringify({
  action: 'submitResult', examKey: 'exam-1', nums: '', studentCapability: examCapability,
  name: '학생A', answers: [1, 2], times: [1000, 2000], resultKey: 'normal-result-key'
}) } });
assert.strictEqual(validSubmit.body, 'ok');
assert.strictEqual(context.readCachedStudentResult_('exam', 'exam-1', 'normal-result-key').score, 2);

// TEST 10 (backend portion): every existing student submission action accepts only its own scoped capability.
const studentFlows = [
  ['submitGrammarPractice', 'grammarSet', 'grammar-1', { action:'submitGrammarPractice', setKey:'grammar-1' }, 'handleSubmitGrammarPractice_'],
  ['submitGrammarFinalResult', 'grammarFinal', 'final-1', { action:'submitGrammarFinalResult', setKey:'final-1', nums:'' }, 'handleSubmitGrammarFinalResult_'],
  ['submitVocabResult', 'vocab', 'vocab-session-1', { action:'submitVocabResult', sessionKey:'vocab-session-1' }, 'handleSubmitVocabResult_'],
  ['submitPracticeResult', 'practice', 'practice-1', { action:'submitPracticeResult', practiceKey:'practice-1' }, 'handleSubmitPracticeResult_'],
  ['submitSentenceHomework', 'sentenceSet', 'sentence-1', { action:'submitSentenceHomework', setKey:'sentence-1' }, 'handleSubmitSentenceHomework_']
];
for (const [action, type, key, body, handler] of studentFlows) {
  context[handler] = () => context.textOut_('flow ok');
  body.studentCapability = context.createStudentCapability_(type, key, [action], body.nums != null ? { nums: body.nums } : {}, 0);
  const response = context.doPost({ postData: { contents: JSON.stringify(body) } });
  assert.strictEqual(response.body, 'flow ok', action + ' failed');
}

// TEST 8: expired capability is rejected.
const expired = context.createStudentCapability_('exam', 'exam-1', ['submitResult'], { nums: '' }, Date.now() - 1000);
assert.strictEqual(context.authorizeStudentPost_({ action: 'submitResult', examKey: 'exam-1', nums: '', studentCapability: expired }), false);

// TEST 9: tampered capability is rejected.
const tampered = examCapability.slice(0, -1) + (examCapability.endsWith('a') ? 'b' : 'a');
assert.strictEqual(context.authorizeStudentPost_({ action: 'submitResult', examKey: 'exam-1', nums: '', studentCapability: tampered }), false);

// Scope is content-specific and partial-question-specific.
assert.strictEqual(context.authorizeStudentPost_({ action: 'submitResult', examKey: 'other-exam', nums: '', studentCapability: examCapability }), false);
assert.strictEqual(context.authorizeStudentPost_({ action: 'submitResult', examKey: 'exam-1', nums: '18', studentCapability: examCapability }), false);

// Emergency rollback uses a separate student-only token, never the teacher TOKEN.
properties.STUDENT_AUTH_MODE = 'legacy_student_token';
const rollbackAuth = context.studentAuthFields_('exam', 'exam-1', ['submitResult'], { nums: '' }, 0);
assert(rollbackAuth.studentSubmitToken);
assert.notStrictEqual(rollbackAuth.studentSubmitToken, properties.TOKEN);
assert.strictEqual(context.authorizeStudentPost_({
  action: 'submitResult', examKey: 'exam-1', nums: '', studentSubmitToken: rollbackAuth.studentSubmitToken
}), true);
assert.strictEqual(context.doPost({ postData: { contents: JSON.stringify({
  action: 'deleteStudent', token: rollbackAuth.studentSubmitToken, name: '학생A'
}) } }).body, 'no');
properties.STUDENT_AUTH_MODE = 'capability';

console.log('security_0a.test.js: all assertions passed');
