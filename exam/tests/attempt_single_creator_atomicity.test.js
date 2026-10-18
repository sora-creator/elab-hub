const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

function createHarness(options = {}) {
  const props = {TOKEN: 'teacher', STUDENT_CAPABILITY_SECRET: 'student-secret'};
  const sheets = {};
  const events = [];
  let attemptsSnapshot = null;
  let lockHeld = false;
  let lockReleased = 0;

  function sheet(name, rows = []) {
    return sheets[name] = {
      rows,
      getDataRange() {
        events.push(`read:${name}:${lockHeld ? 'locked' : 'unlocked'}`);
        return {getValues: () => {
          if (name !== 'AttemptsV2' || !options.freezeAttemptsAtFirstRead) return this.rows;
          if (!attemptsSnapshot) attemptsSnapshot = this.rows.map(row => row.slice());
          return attemptsSnapshot.map(row => row.slice());
        }};
      },
      getRange(r, c, rc = 1, cc = 1) {
        events.push(`range:${name}:${lockHeld ? 'locked' : 'unlocked'}`);
        const target = this;
        return {
          getValues: () => target.rows.slice(r - 1, r - 1 + rc).map(row => row.slice(c - 1, c - 1 + cc)),
          getValue: () => target.rows[r - 1] && target.rows[r - 1][c - 1],
          setValue(value) { while (target.rows.length < r) target.rows.push([]); target.rows[r - 1][c - 1] = value; },
          setValues(values) { values.forEach((row, ri) => row.forEach((value, ci) => { while (target.rows.length < r + ri) target.rows.push([]); target.rows[r - 1 + ri][c - 1 + ci] = value; })); }
        };
      },
      appendRow(row) { events.push(`append:${name}:${lockHeld ? 'locked' : 'unlocked'}`); this.rows.push(row); },
      getLastRow() { return this.rows.length; },
      getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); },
      deleteRow(r) { this.rows.splice(r - 1, 1); },
      copyTo() { return this; },
      setName() { return this; }
    };
  }

  const spreadsheet = {
    getId: () => '', getName: () => '', getSheets: () => Object.values(sheets),
    getSheetByName(name) { events.push(`sheet:${name}:${lockHeld ? 'locked' : 'unlocked'}`); return sheets[name] || null; },
    insertSheet: name => sheet(name)
  };
  const context = {
    console, Date, JSON, Math, Array, Object, String, Number,
    PropertiesService: {getScriptProperties: () => ({getProperty: key => props[key] || '', setProperty: (key, value) => props[key] = value})},
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet, flush() { events.push(`flush:${lockHeld ? 'locked' : 'unlocked'}`); }},
    Session: {getEffectiveUser: () => ({getEmail: () => ''}), getScriptTimeZone: () => ''},
    LockService: {getScriptLock: () => ({
      waitLock() {
        events.push('lock:wait');
        lockHeld = true;
        if (options.onLockAcquired) options.onLockAcquired({sheets, context, events});
        events.push('lock:acquired');
      },
      releaseLock() { events.push('lock:released'); lockHeld = false; lockReleased++; }
    })},
    CacheService: {getScriptCache: () => ({put() {}, get: () => null, remove() {}})},
    Utilities: {
      getUuid: () => crypto.randomUUID(), formatDate: () => '', Charset: {UTF_8: 'utf8'}, DigestAlgorithm: {SHA_256: 'sha256'},
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'), base64DecodeWebSafe: value => Buffer.from(value, 'base64url'),
      computeHmacSha256Signature: (value, secret) => crypto.createHmac('sha256', secret).update(value).digest(),
      computeDigest: (_algorithm, value) => crypto.createHash('sha256').update(value).digest(), newBlob: value => ({getDataAsString: () => Buffer.from(value).toString('utf8')})
    },
    ContentService: {MimeType: {JAVASCRIPT: 'js'}, createTextOutput: body => ({body, setMimeType() { return this; }})}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('exam/sheet_backend.gs', 'utf8'), context);
  context.setup();
  events.length = 0;
  return {context, sheets, props, events, get lockReleased() { return lockReleased; }};
}

function addTarget(harness, studentId, suffix) {
  const {context, sheets, props} = harness;
  const now = new Date();
  const assignmentId = `assignment-${suffix}`;
  const targetId = `target-${suffix}`;
  sheets.AssignmentsV2.appendRow([assignmentId, props.DEFAULT_TEACHER_ID, 'SENTENCE_STRUCTURE', `set-${suffix}`, `Assignment ${suffix}`, '', now, '', true, now, now, '', '']);
  sheets.AssignmentTargetsV2.appendRow([targetId, assignmentId, studentId, 'NOT_STARTED', '', '', true, now, now]);
  return {assignmentId, targetId};
}

const h = createHarness();
const studentId = 'student-atomicity';
const primary = addTarget(h, studentId, 'primary');

const first = h.context.getOrCreateAttemptV2_(primary.targetId, studentId, 'launch:primary', false);
assert(first, 'TEST A: first launch must create an attempt');
assert.strictEqual(h.sheets.AttemptsV2.rows.length - 1, 1, 'TEST A: exactly one attempt');

const resumed = h.context.getOrCreateAttemptV2_(primary.targetId, studentId, 'launch:primary', false);
assert.strictEqual(resumed[0], first[0], 'TEST B: F5/resume returns same attempt');
assert.strictEqual(h.sheets.AttemptsV2.rows.length - 1, 1, 'TEST B: F5 does not append');

const newSession = h.context.getOrCreateAttemptV2_(primary.targetId, studentId, 'launch:new-session', false);
assert.strictEqual(newSession[0], first[0], 'TEST C: new session returns active attempt');

const sameRequest = h.context.getOrCreateAttemptV2_(primary.targetId, studentId, 'launch:primary', false);
assert.strictEqual(sameRequest[0], first[0], 'TEST D: same request id is idempotent');
assert.strictEqual(h.sheets.AttemptsV2.rows.length - 1, 1, 'TEST D: same request id does not append');

const differentRequest = h.context.getOrCreateAttemptV2_(primary.targetId, studentId, 'launch:different', false);
assert.strictEqual(differentRequest[0], first[0], 'TEST E: active target wins over a different request id');
assert.strictEqual(h.sheets.AttemptsV2.rows.length - 1, 1, 'TEST E: different request id does not append');

const other = addTarget(h, studentId, 'other');
const otherAttempt = h.context.getOrCreateAttemptV2_(other.targetId, studentId, 'launch:other', false);
assert.notStrictEqual(otherAttempt[0], first[0], 'TEST F: different target creates a new attempt');
assert.strictEqual(h.sheets.AttemptsV2.rows.length - 1, 2, 'TEST F: second target adds one row');

const attemptItemId = 'attempt-item-progress';
h.sheets.QuestionAttemptItemsV2.appendRow([attemptItemId, first[0], 'question-progress', 1, '{}', true, 'GRADED', 10, 1, false, new Date(), new Date(), new Date()]);
h.sheets.SentenceStructureDetailsV2.appendRow([attemptItemId, '[]', '[]', '[]', '[]', true, true, new Date(), new Date(), 'question-progress', '[]', '[]', '[]', '[]', JSON.stringify({student_v1_result: {sentence_id: 'sentence-progress', sequence: 1, subject_correct: true, verb_correct: true, hint_used: false, expression_ids_shown: []}}), 10, new Date()]);
const progressBefore = h.context.sentenceStructureProgressV1_(first);
const progressResume = h.context.getOrCreateAttemptV2_(primary.targetId, studentId, 'launch:progress-resume', false);
const progressAfter = h.context.sentenceStructureProgressV1_(progressResume);
assert.strictEqual(progressResume[0], first[0], 'TEST G: progress resumes the same attempt');
assert.deepStrictEqual(JSON.parse(JSON.stringify(progressAfter)), JSON.parse(JSON.stringify(progressBefore)), 'TEST G: progress is preserved');

const race = createHarness();
addTarget(race, 'student-race', 'race');
const returnedA = race.context.getOrCreateAttemptV2_('target-race', 'student-race', 'launch:race', false, true);
const aReleasedAt = race.events.lastIndexOf('lock:released');
const returnedB = race.context.getOrCreateAttemptV2_('target-race', 'student-race', 'launch:race', false, true);
const bWaitedAt = race.events.indexOf('lock:wait', aReleasedAt + 1);
assert.strictEqual(returnedA[0], returnedB[0], 'TEST H: overlapping requests return the same attempt id');
assert.strictEqual(race.sheets.AttemptsV2.rows.length - 1, 1, 'TEST H: overlapping requests append exactly one row');
const firstAttemptRead = race.events.findIndex(event => event.startsWith('read:AttemptsV2:'));
const lockAcquired = race.events.indexOf('lock:acquired');
assert(firstAttemptRead > lockAcquired, 'TEST H: AttemptsV2 decision read must happen after lock acquisition');
assert(bWaitedAt > aReleasedAt, 'TEST H: request B enters only after request A append, flush, and release');
assert(!race.events.includes('read:AttemptsV2:unlocked'), 'TEST H: no unlocked AttemptsV2 decision read');
assert(!race.events.includes('append:AttemptsV2:unlocked'), 'TEST H: no unlocked append path');
assert.strictEqual(race.lockReleased, 2, 'TEST H: both serialized calls release in finally');

const backendSource = fs.readFileSync('exam/sheet_backend.gs', 'utf8');
const functionStart = backendSource.indexOf('function getOrCreateAttemptV2_');
const functionEnd = backendSource.indexOf('\nfunction attemptContextForFetchV2_', functionStart);
const attemptSource = backendSource.slice(functionStart, functionEnd);
const waitLockAt = attemptSource.indexOf('waitLock(10000)');
const firstAttemptsAccessAt = attemptSource.indexOf('ATTEMPTS_V2_SHEET');
const freshSpreadsheetAt = attemptSource.indexOf('SpreadsheetApp.getActiveSpreadsheet()', waitLockAt);
const appendAt = attemptSource.indexOf('sh.appendRow(row)');
const flushAt = attemptSource.indexOf('SpreadsheetApp.flush()', appendAt);
const releaseAt = attemptSource.indexOf('lock.releaseLock()', flushAt);
assert(waitLockAt !== -1 && firstAttemptsAccessAt > waitLockAt, 'TEST I: first AttemptsV2 access is after waitLock');
assert(!attemptSource.slice(0, waitLockAt).includes('ATTEMPTS_V2_'), 'TEST J: pre-lock AttemptsV2 header/schema reads are zero');
assert(freshSpreadsheetAt > waitLockAt, 'TEST K: spreadsheet/sheets are acquired fresh inside the lock');
assert(appendAt > waitLockAt && flushAt > appendAt && releaseAt > flushAt, 'TEST L: append, flush, and release order is locked and deterministic');
assert(!race.events.some(event => event === 'append:AttemptsV2:unlocked'), 'TEST M: unlocked AttemptsV2 append paths are zero');

const completed = addTarget(h, studentId, 'completed');
const completedAttempt = h.context.getOrCreateAttemptV2_(completed.targetId, studentId, 'launch:completed', false);
h.context.completeAttemptV2_(completedAttempt, 100, null);
assert.strictEqual(h.context.getOrCreateAttemptV2_(completed.targetId, studentId, 'launch:completed', false), null, 'completed target stays closed even for the original request id');
assert.strictEqual(h.context.getOrCreateAttemptV2_(completed.targetId, studentId, 'launch:new', false), null, 'completed target is not silently restarted');
const retryAttempt = h.context.getOrCreateAttemptV2_(completed.targetId, studentId, 'review:explicit', true);
assert.strictEqual(retryAttempt[10], 2, 'explicit retry creates attempt_no 2');

console.log('TEST A PASS');
console.log('TEST B PASS');
console.log('TEST C PASS');
console.log('TEST D PASS');
console.log('TEST E PASS');
console.log('TEST F PASS');
console.log('TEST G PASS');
console.log('TEST H PASS');
console.log('TEST I PASS');
console.log('TEST J PASS');
console.log('TEST K PASS');
console.log('TEST L PASS');
console.log('TEST M PASS');
console.log(JSON.stringify({
  concurrent_return_id_same: returnedA[0] === returnedB[0],
  concurrent_append_count: race.sheets.AttemptsV2.rows.length - 1,
  read_before_lock_used_for_decision: false,
  fresh_read_after_lock: true,
  check_append_same_lock: true,
  lock_release_finally: race.lockReleased === 2,
  unlocked_append_path: false,
  mock_limitation: 'Deterministic serialized mock; does not reproduce Apps Script execution-level sheet visibility.'
}));
