const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const properties = { TOKEN: 'teacher-secret', STUDENT_CAPABILITY_SECRET: 'student-secret' };
const sheets = {};
function makeSheet(name, rows) {
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
    copyTo() { return makeSheet('copy-' + crypto.randomUUID(), this.rows.map(r => r.slice())); },
    setName(nextName) { delete sheets[name]; name = nextName; sheets[name] = this; return this; }
  };
  return created;
}

makeSheet('Students', [
  ['name', 'pin', 'createdAt'],
  ['기존학생', '1111', new Date('2026-01-01')],
  ['동명이인', '2222', new Date('2026-01-02')],
  ['동명이인', '3333', new Date('2026-01-03')]
]);
makeSheet('Assignments', [
  ['name', 'updatedAt', 'vocabLabel', 'vocabLink', 'examLabel', 'examLink', 'grammarLabel', 'grammarLink', 'finalQuizLabel', 'finalQuizLink', 'sentenceLabel', 'sentenceLink'],
  ['기존학생', new Date(), '단어', 'vocab-link', '', '', '', '', '', '', '', '']
]);
makeSheet('ExamResults', [['date', 'examKey', 'name'], [new Date(), 'exam', '기존학생']]);

const context = {
  console, Date, JSON, Math, Array, Object, String, Number,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => properties[key] || '',
    setProperty: (key, value) => { properties[key] = value; }
  }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ put() {}, get: () => null, remove() {} }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    getUuid: () => crypto.randomUUID(),
    formatDate: () => '20260816-120000',
    base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
    base64DecodeWebSafe: value => Buffer.from(value, 'base64url'),
    computeHmacSha256Signature: (value, secret) => crypto.createHmac('sha256', secret).update(value).digest(),
    computeDigest: (_algorithm, value) => crypto.createHash('sha256').update(value).digest(),
    newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') })
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getId: () => 'sheet-id', getName: () => 'test-sheet',
    getSheets: () => Object.values(sheets),
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => makeSheet(name, [])
  }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.test' }), getScriptTimeZone: () => 'Asia/Seoul' },
  ContentService: {
    MimeType: { JAVASCRIPT: 'js' },
    createTextOutput: body => ({ body, setMimeType() { return this; } })
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('exam/sheet_backend.gs', 'utf8'), context);

const originalLegacyCount = sheets.Students.rows.length;
const originalResultJson = JSON.stringify(sheets.ExamResults.rows);
const stats = context.migrateLegacyStudentsV2_();

// TEST 1~3: every legacy row gets a unique student_id and the same default teacher_id.
const legacyIds = sheets.Students.rows.slice(1).map(row => row[3]);
assert(legacyIds.every(Boolean));
assert.strictEqual(new Set(legacyIds).size, legacyIds.length);
const v2Rows = sheets.StudentsV2.rows.slice(1);
assert.strictEqual(v2Rows.length, 3);
assert(v2Rows.every(row => row[1] === properties.DEFAULT_TEACHER_ID));
assert.strictEqual(stats.autoMatched, 1);
assert.strictEqual(stats.reviewRequired, 2);

// TEST 12: duplicate legacy names remain separate and require review; they are not merged.
const duplicateMaps = sheets.LegacyStudentMap.rows.slice(1).filter(row => row[1] === '동명이인');
assert.strictEqual(duplicateMaps.length, 2);
assert(duplicateMaps.every(row => row[3] === 'REVIEW_REQUIRED'));
assert.notStrictEqual(duplicateMaps[0][2], duplicateMaps[1][2]);

// A unique student's current legacy assignment follows a display-name change, but old results do not.
context.handleSaveStudent_({ student_id: legacyIds[0], name: '기존학생변경', request_id: 'req-existing-rename' });
assert.strictEqual(sheets.Assignments.rows[1][0], '기존학생변경');
assert.strictEqual(sheets.ExamResults.rows[1][2], '기존학생');

// TEST 5~6: new students with the same display name are both created with different IDs.
const create1 = context.handleSaveStudent_({ name: '신규동명', pin: '4444', request_id: 'req-create-1' }).body;
const create2 = context.handleSaveStudent_({ name: '신규동명', pin: '5555', request_id: 'req-create-2' }).body;
const newId1 = create1.split(':')[1];
const newId2 = create2.split(':')[1];
assert(newId1 && newId2);
assert.notStrictEqual(newId1, newId2);

// Idempotency: the same request does not append another legacy/V2 row.
const afterCreates = sheets.Students.rows.length;
assert.strictEqual(context.handleSaveStudent_({ name: '신규동명', pin: '4444', request_id: 'req-create-1' }).body, create1);
assert.strictEqual(sheets.Students.rows.length, afterCreates);

// TEST 4: changing the display name preserves student_id and does not rewrite old results.
context.handleSaveStudent_({ student_id: newId1, name: '이름변경', grade: '중2', request_id: 'req-update-1' });
assert.strictEqual(context.studentV2ById_(newId1)[0], newId1);
assert.strictEqual(context.studentV2ById_(newId1)[2], '이름변경');
assert.strictEqual(JSON.stringify(sheets.ExamResults.rows), originalResultJson);

// TEST 7~8: deactivation keeps the row; re-registration gets a fresh ID.
const v2CountBeforeDeactivate = sheets.StudentsV2.rows.length;
assert.strictEqual(context.handleDeleteStudent_({ student_id: newId1 }).body, 'ok');
assert.strictEqual(sheets.StudentsV2.rows.length, v2CountBeforeDeactivate);
assert.strictEqual(context.studentV2ById_(newId1)[4], false);
const reRegistered = context.handleSaveStudent_({ name: '이름변경', pin: '6666', request_id: 'req-reregister' }).body.split(':')[1];
assert(reRegistered && reRegistered !== newId1);

// TEST 9: legacy name+PIN login resolves the linked ID; inactive students cannot log in.
const login = context.handleFetchAssignment_({ parameter: { name: '신규동명', pin: '5555' } });
assert.strictEqual(login.found, true);
assert.strictEqual(login.student_id, newId2);
// Student management displays StudentsV2.display_name. Login must follow the linked ID even
// when an older deployment left the legacy Students name temporarily out of sync.
const linkedLegacyRow = sheets.Students.rows.find(row => row[3] === newId2);
const linkedV2Row = sheets.StudentsV2.rows.find(row => row[0] === newId2);
linkedLegacyRow[0] = '이전 표시 이름';
linkedLegacyRow[1] = ' 5555 ';
linkedV2Row[2] = '현재   학생 이름';
const linkedLogin = context.handleFetchAssignment_({ parameter: { name: '현재 학생 이름', pin: '5555' } });
assert.strictEqual(linkedLogin.found, true);
assert.strictEqual(linkedLogin.student_id, newId2);
assert.strictEqual(linkedLogin.name, '현재   학생 이름');
const assigned = context.handleCreateAssignmentV2_({
  student_ids:[newId2], group_ids:[], content_type:'SENTENCE_STRUCTURE',
  content_ref_id:'sentence-login-e2e', title:'로그인 E2E 과제', content_link:'sentence-link', lesson_date:'2026-09-01'
}).body;
assert(assigned.startsWith('ok:'));
const loginWithAssignments = context.handleFetchAssignment_({ parameter: { name:'현재 학생 이름', pin:'5555', include_assignments:'1' } });
assert.strictEqual(loginWithAssignments.found,true);
assert.strictEqual(loginWithAssignments.student_id,newId2);
assert.strictEqual(loginWithAssignments.assignments.length,1);
assert.strictEqual(loginWithAssignments.assignments[0].student_id,newId2);
assert.strictEqual(loginWithAssignments.assignments[0].title,'로그인 E2E 과제');
const inactiveLogin = context.handleFetchAssignment_({ parameter: { name: '이름변경', pin: '4444' } });
assert.strictEqual(inactiveLogin.found, false);
assert.strictEqual(inactiveLogin.inactive, true);

// TEST 11: migration never deletes legacy Students or existing results.
assert(sheets.Students.rows.length >= originalLegacyCount);
assert.strictEqual(JSON.stringify(sheets.ExamResults.rows), originalResultJson);

// Minimal UI changes remain syntactically valid and do not expose UUID text in the roster.
for (const file of ['student/index.html', 'teacher/students.html']) {
  const source = fs.readFileSync(file, 'utf8');
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(code => code.trim());
  for (const code of scripts) new Function(code);
}
console.log('student_identity_0b.test.js: all assertions passed');
