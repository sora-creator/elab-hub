'use strict';
const assert = require('assert');
const { loadFirstImport, hash } = require('../../tools/vocabulary-first-import.cjs');
const { createFirstImportMock } = require('./helpers/vocabulary-first-import-mock.cjs');
const input = loadFirstImport();
const request = (operation, extra = {}) => ({ ...input.metadata, action: `${operation}VocabularyFirstImportV1`, ...extra });
const commit = extra => request('commit', { approval: 'COMMIT_FIRST_IMPORT', ...extra });
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
function expectCode(result, code) { assert.strictEqual(result.code, code, JSON.stringify(result)); }
function zeroWriteFailure(env, payload, code) {
  env.writes.length = 0;
  const result = env.call(payload);
  assert.strictEqual(result.ok, false, JSON.stringify(result));
  if (code) expectCode(result, code);
  assert.strictEqual(env.writes.length, 0, 'failure must precede audit and data writes');
  assert.strictEqual(env.locked(), false);
}
const staged = createFirstImportMock();
test('real pinned PREIMPORT + seven chunk uploads', () => {
  assert.strictEqual(input.rows.length, 3244);
  for (const chunk of input.chunks) expectCode(staged.call(chunk), 'ACCEPTED');
  assert.strictEqual(staged.sheets.VocabularyImportStagingV2.rows.length - 1, 3244);
  assert.strictEqual(staged.audit().status, 'STAGED');
});
const stagedSnapshot = staged.snapshot();
test('normal 3244 validation PASS; no VocabularyDB write', () => {
  staged.writes.length = 0;
  const result = staged.call(request('validate'));
  expectCode(result, 'VALIDATED');
  assert.strictEqual(result.summary.unique_sense_ids, 3244);
  assert.strictEqual(hash(result.summary.levels), hash(input.metadata.expected_levels));
  assert(!staged.writes.some(w => w.sheet === 'VocabularyDB'));
});
const validSnapshot = staged.snapshot();
test('3243 rows rejected', () => {
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyImportStagingV2.rows.pop();
  zeroWriteFailure(env, request('validate'), 'STAGING_TOTAL_MISMATCH');
});
test('3245 rows rejected', () => {
  const env = createFirstImportMock(validSnapshot), rows = env.sheets.VocabularyImportStagingV2.rows;
  rows.push(rows[1].slice()); zeroWriteFailure(env, request('validate'), 'STAGING_ROW_CONFLICT');
});
test('duplicate sense_id rejected', () => {
  const env = createFirstImportMock(validSnapshot), rows = env.sheets.VocabularyImportStagingV2.rows;
  rows[2][7] = rows[1][7]; zeroWriteFailure(env, request('validate'), 'DUPLICATE_SENSE_ID');
});
test('level distribution mismatch rejected', () => {
  const env = createFirstImportMock(validSnapshot), row = env.sheets.VocabularyImportStagingV2.rows[1];
  [3,15,20].forEach(i => row[i] = 'V5'); zeroWriteFailure(env, request('validate'), 'LEVEL_COUNTS_MISMATCH');
});
test('missing chunk rejected', () => {
  const env = createFirstImportMock();
  input.chunks.slice(0, 6).forEach(chunk => expectCode(env.call(chunk), 'ACCEPTED'));
  zeroWriteFailure(env, request('validate'), 'CHUNKS_INCOMPLETE');
});
test('identical chunk retry does not write or increase count', () => {
  const env = createFirstImportMock(stagedSnapshot), before = hash(env.snapshot());
  expectCode(env.call(input.chunks[2]), 'ALREADY_ACCEPTED');
  assert.strictEqual(env.writes.length, 0); assert.strictEqual(hash(env.snapshot()), before);
});
test('same chunk_index different hash conflicts', () => {
  zeroWriteFailure(createFirstImportMock(stagedSnapshot), { ...input.chunks[2], payload_hash: 'changed' }, 'CHUNK_CONFLICT');
});
test('manifest hash mismatch fails before all writes', () => {
  zeroWriteFailure(createFirstImportMock(validSnapshot), commit({ manifest_sha256: 'changed' }), 'METADATA_MISMATCH_MANIFEST_SHA256');
});
test('preimport hash mismatch fails before all writes', () => {
  zeroWriteFailure(createFirstImportMock(validSnapshot), commit({ preimport_sha256: 'changed' }), 'METADATA_MISMATCH_PREIMPORT_SHA256');
});
test('header mismatch commit write 0', () => {
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyDB.rows[0][0] = 'sense_ID';
  zeroWriteFailure(env, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED');
});
test('existing ID data commit write 0', () => {
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyDB.rows.push(['other-sense']);
  zeroWriteFailure(env, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED');
});
test('blank ID but other nonblank cell commit write 0', () => {
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyDB.rows.push(['', '', 'hidden-data']);
  zeroWriteFailure(env, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED');
});
test('blank-looking formula far below data commit write 0', () => {
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyDB.formulas['10000,3'] = '=""';
  zeroWriteFailure(env, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED');
});
test('empty exact DB dry-run is eligible with zero writes', () => {
  const env = createFirstImportMock(validSnapshot), result = env.call(commit({ dry_run: true }));
  expectCode(result, 'COMMIT_ELIGIBLE'); assert.strictEqual(result.would_write_range, 'VocabularyDB!A2:U3245');
  assert.strictEqual(result.expected_post_state.total, 3244); assert.strictEqual(env.writes.length, 0);
});
const completed = createFirstImportMock(validSnapshot);
test('bounded commit exactly A2:U3245; header intact; student sheets untouched', () => {
  const result = completed.call(commit()); expectCode(result, 'COMPLETED');
  assert.strictEqual(completed.audit().status, 'COMPLETED');
  assert.deepStrictEqual(completed.writes.filter(w => w.sheet === 'VocabularyDB'), [
    { sheet: 'VocabularyDB', method: 'setValues', row: 2, column: 1, rows: 3244, columns: 21 }
  ]);
  assert.deepStrictEqual(completed.sheets.VocabularyDB.rows[0], validSnapshot.VocabularyDB[0]);
  const rows = completed.sheets.VocabularyDB.rows.slice(1).map(row => { const copy = row.slice(); copy[10] = ''; copy[11] = ''; return copy; });
  assert.strictEqual(hash(rows), input.manifest.canonical_rows_sha256);
  assert.deepStrictEqual(Object.keys(completed.sheets).sort(), ['VocabularyDB','VocabularyImportStagingV2','VocabularyImportsV2'].sort());
});
const completedSnapshot = completed.snapshot();
test('completed commit retry ALREADY_COMMITTED with zero writes', () => {
  const env = createFirstImportMock(completedSnapshot);
  expectCode(env.call(commit()), 'ALREADY_COMMITTED'); assert.strictEqual(env.writes.length, 0);
});
test('partial write reported and audited; no automatic second append', () => {
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyDB.failAfter = 123;
  const result = env.call(commit()); expectCode(result, 'PARTIAL_IMPORT_DETECTED');
  assert.strictEqual(result.actual_rows, 123); assert.strictEqual(result.ok, false);
  assert.strictEqual(env.audit().status, 'FAILED'); assert.strictEqual(env.audit().error_code, 'PARTIAL_IMPORT_DETECTED');
  assert(env.audit().started_at && env.audit().finished_at);
  zeroWriteFailure(env, commit(), 'PARTIAL_IMPORT_DETECTED');
});
test('rollback blocked by another batch data', () => {
  const env = createFirstImportMock(completedSnapshot); env.sheets.VocabularyDB.rows.push(['other-batch-id']);
  zeroWriteFailure(env, request('rollback', { dry_run: true }), 'ROLLBACK_BLOCKED');
});
test('rollback exact batch dry-run plan PASS', () => {
  const env = createFirstImportMock(completedSnapshot), result = env.call(request('rollback', { dry_run: true }));
  expectCode(result, 'ROLLBACK_PLAN_PASS'); assert.strictEqual(result.row_count, 3244);
  assert.strictEqual(result.range, 'VocabularyDB!A2:U3245'); assert.strictEqual(env.writes.length, 0);
});
test('rollback mock execution clears only exact batch cells, keeps header and allocated rows', () => {
  const env = createFirstImportMock(completedSnapshot), maxRows = env.sheets.VocabularyDB.getMaxRows();
  expectCode(env.call(request('rollback', { approval: 'ROLLBACK_FIRST_IMPORT' })), 'ROLLED_BACK');
  assert.strictEqual(env.audit().status, 'ROLLED_BACK');
  assert.strictEqual(env.sheets.VocabularyDB.getLastRow(), 1); assert.strictEqual(env.sheets.VocabularyDB.getMaxRows(), maxRows);
  assert.deepStrictEqual(env.writes.filter(w => w.sheet === 'VocabularyDB'), [
    { sheet: 'VocabularyDB', method: 'clearContent', row: 2, column: 1, rows: 3244, columns: 21 }
  ]);
  assert.deepStrictEqual(env.sheets.VocabularyDB.rows[0], completedSnapshot.VocabularyDB[0]);
  zeroWriteFailure(env, commit(), 'BATCH_NOT_READY');
});
test('staging and validation dry-run write 0', () => {
  const empty = createFirstImportMock(); expectCode(empty.call({ ...input.chunks[0], dry_run: true }), 'WOULD_STAGE'); assert.strictEqual(empty.writes.length, 0);
  const env = createFirstImportMock(stagedSnapshot); expectCode(env.call(request('validate', { dry_run: true })), 'VALIDATED'); assert.strictEqual(env.writes.length, 0);
});
test('batch-isolated discard leaves interleaved other batch and history intact', () => {
  const env = createFirstImportMock(stagedSnapshot), foreign = Array(22).fill('');
  foreign[0] = 'foreign:2'; foreign[1] = 'foreign'; foreign[2] = 2; foreign[4] = 'keep';
  env.sheets.VocabularyImportStagingV2.rows.splice(100, 0, foreign);
  const foreignAudit = Array(26).fill(''); foreignAudit[0] = 'foreign'; foreignAudit[3] = 'PREVIEWED';
  env.sheets.VocabularyImportsV2.rows.push(foreignAudit);
  expectCode(env.call(request('validate')), 'VALIDATED');
  env.writes.length = 0;
  const plan = env.call(request('discard', { dry_run: true })); expectCode(plan, 'DISCARD_PLAN_PASS'); assert.strictEqual(env.writes.length, 0);
  expectCode(env.call(request('discard', { approval: 'DISCARD_FIRST_IMPORT_STAGING' })), 'DISCARDED');
  assert.deepStrictEqual(env.sheets.VocabularyImportStagingV2.rows[100], foreign);
  assert.deepStrictEqual(env.sheets.VocabularyImportsV2.rows[2], foreignAudit);
  assert.strictEqual(env.sheets.VocabularyImportStagingV2.rows.filter(row => row[1] === input.metadata.batch_id).length, 0);
  assert(!env.writes.some(w => w.sheet === 'VocabularyDB'));
});
test('explicit approval mandatory; no automatic commit after validation', () => {
  zeroWriteFailure(createFirstImportMock(validSnapshot), commit({ approval: '' }), 'EXPLICIT_APPROVAL_REQUIRED');
  zeroWriteFailure(createFirstImportMock(stagedSnapshot), commit(), 'VALIDATION_REQUIRED');
});
test('wrong batch and target rejected before writes', () => {
  zeroWriteFailure(createFirstImportMock(validSnapshot), commit({ batch_id: 'foreign' }), 'METADATA_MISMATCH_BATCH_ID');
  const env = createFirstImportMock(validSnapshot); env.ss.getId = () => 'wrong-target'; zeroWriteFailure(env, commit(), 'TARGET_MISMATCH');
});
test('missing sheet, extra header/data/formula and insufficient capacity fail closed', () => {
  for (const mutate of [
    env => delete env.sheets.VocabularyDB,
    env => { env.sheets.VocabularyDB.gid = 1; },
    env => { env.sheets.VocabularyDB.maxRows = 1000; },
    env => { env.sheets.VocabularyDB.merged = [{}]; },
    env => { const db = env.sheets.VocabularyDB; db.maxColumns = 22; db.rows[0].push('extra'); },
    env => { const db = env.sheets.VocabularyDB; db.maxColumns = 22; db.rows.push([...Array(21).fill(''), 'extra']); },
    env => { const db = env.sheets.VocabularyDB; db.maxColumns = 22; db.formulas['30,22'] = '=""'; }
  ]) { const env = createFirstImportMock(validSnapshot); mutate(env); zeroWriteFailure(env, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED'); }
});
test('completion marker from other batch prevents first commit and rollback', () => {
  for (const [snapshot, operation, code] of [[validSnapshot, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED'], [completedSnapshot, request('rollback', { dry_run: true }), 'ROLLBACK_BLOCKED']]) {
    const env = createFirstImportMock(snapshot), marker = Array(26).fill(''); marker[0] = 'other'; marker[3] = 'COMMITTED';
    env.sheets.VocabularyImportsV2.rows.push(marker); zeroWriteFailure(env, operation, code);
  }
});
test('retained audit recovers full write after lost completion acknowledgement', () => {
  const env = createFirstImportMock(completedSnapshot), row = env.sheets.VocabularyImportsV2.rows[1], audit = env.audit();
  audit.status = 'COMMITTING'; delete audit.post_hash; row[3] = audit.status; row[12] = 'VOCAB_FIRST_IMPORT_V1:' + JSON.stringify(audit);
  expectCode(env.call(commit()), 'ALREADY_COMMITTED'); assert.strictEqual(env.audit().status, 'COMPLETED');
  assert(!env.writes.some(w => w.sheet === 'VocabularyDB'));
});
test('fingerprint tampering prevents idempotent success and rollback', () => {
  const env = createFirstImportMock(completedSnapshot); env.sheets.VocabularyDB.rows[1][3] += 'changed';
  zeroWriteFailure(env, commit(), 'STATE_MISMATCH');
  zeroWriteFailure(env, request('rollback', { dry_run: true }), 'ROLLBACK_BLOCKED');
});
test('chunk payload tampering and missing required staging field rejected', () => {
  const chunk = structuredClone(input.chunks[0]); chunk.rows[0][3] += 'changed';
  zeroWriteFailure(createFirstImportMock(), chunk, 'CHUNK_CONFLICT');
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyImportStagingV2.rows[1][5] = '';
  zeroWriteFailure(env, request('validate'), 'ROW_VALIDATION_FAILED');
});
test('existing teacher-token auth enforced; existing trace contains no tokens or rows', () => {
  const env = createFirstImportMock(validSnapshot);
  zeroWriteFailure(env, commit({ token: 'invalid' }), 'UNAUTHORIZED');
  const denied = env.ctx.doPost({ postData: { contents: JSON.stringify(commit({ token: 'invalid' })) } }); assert.strictEqual(denied.body, 'no');
  const allowed = env.ctx.doPost({ postData: { contents: JSON.stringify(commit({ token: 'local-test-token', dry_run: true })) } });
  expectCode(JSON.parse(allowed.body), 'COMMIT_ELIGIBLE'); assert.strictEqual(env.writes.length, 0);
  const logText = JSON.stringify(env.logs);
  assert(!logText.includes('local-test-token') && !logText.includes('invalid') && !logText.includes(input.rows[0][0]));
});
test('chunk retry after validation or completion remains idempotent', () => {
  for (const snapshot of [validSnapshot, completedSnapshot]) {
    const env = createFirstImportMock(snapshot); expectCode(env.call(input.chunks[0]), 'ALREADY_ACCEPTED'); assert.strictEqual(env.writes.length, 0);
  }
});
test('string dry_run cannot accidentally enable writes', () => {
  zeroWriteFailure(createFirstImportMock(validSnapshot), commit({ dry_run: 'true' }), 'INVALID_DRY_RUN');
  zeroWriteFailure(createFirstImportMock(), { ...input.chunks[0], dry_run: 'false' }, 'INVALID_DRY_RUN');
});
test('chunk interrupted before ledger save can acknowledge exact persisted rows without append', () => {
  const env = createFirstImportMock(stagedSnapshot), audit = env.audit(), row = env.sheets.VocabularyImportsV2.rows[1];
  audit.status = 'STAGING'; audit.chunks[0] = null; row[3] = audit.status; row[12] = 'VOCAB_FIRST_IMPORT_V1:' + JSON.stringify(audit);
  expectCode(env.call(input.chunks[0]), 'ACCEPTED');
  assert(!env.writes.some(w => w.sheet === 'VocabularyImportStagingV2'));
  assert.strictEqual(env.sheets.VocabularyImportStagingV2.rows.length - 1, 3244);
});
test('partial staging append is never acknowledged or appended twice', () => {
  const env = createFirstImportMock(); env.sheets.VocabularyImportStagingV2.failAfter = 100;
  assert.strictEqual(env.call(input.chunks[0]).ok, false);
  assert.strictEqual(env.audit().chunks[0], null);
  zeroWriteFailure(env, input.chunks[0], 'CHUNK_CONFLICT');
  assert.strictEqual(env.sheets.VocabularyImportStagingV2.rows.length - 1, 100);
});
test('local loader rejects changed input bytes before XLSX parsing without modifying files', () => {
  const fs = require('fs'), vm = require('vm'), path = require('path');
  const file = path.resolve(__dirname, '../../tools/vocabulary-first-import.cjs');
  for (const [extension, code] of [['.xlsx', 'PREIMPORT_HASH_MISMATCH'], ['.json', 'MANIFEST_HASH_MISMATCH']]) {
    let parsed = false;
    const context = { module: { exports: {} }, __dirname: path.dirname(file), require(name) {
      if (name === 'fs') return { readFileSync(target) { const bytes = fs.readFileSync(target); return target.endsWith(extension) ? Buffer.concat([bytes, Buffer.from('changed')]) : bytes; } };
      if (name === 'xlsx') return { read() { parsed = true; throw new Error('unexpected parse'); } };
      return require(name);
    } };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    assert.throws(() => context.module.exports.loadFirstImport(), new RegExp(code)); assert.strictEqual(parsed, false);
  }
});
test('all five actions reject six negative auth forms at POST and handler with write 0', () => {
  const cases = [
    { token: undefined }, { token: '' }, { token: 'wrong-fixture-token' },
    { token: undefined, studentCapability: 'fixture-student-capability', capability: 'fixture-student-capability' },
    { token: undefined, assignmentCapability: 'fixture-assignment-capability' },
    { token: undefined, credential: 'fixture-teacher-credential', teacher_id: 'fixture-teacher' }
  ];
  for (const operation of ['stage','validate','commit','rollback','discard']) for (const auth of cases) {
    const env = createFirstImportMock(operation === 'rollback' ? completedSnapshot : validSnapshot);
    env.ctx.authorizeStudentPost_ = () => { throw new Error('must not enter student authentication'); };
    const payload = { ...input.chunks[0], ...request(operation), ...auth };
    zeroWriteFailure(env, payload, 'UNAUTHORIZED');
    assert.strictEqual(env.ctx.doPost({ postData: { contents: JSON.stringify(payload) } }).body, 'no');
    assert.strictEqual(env.writes.length, 0);
    assert(!Array.from(env.ctx.STUDENT_POST_ACTIONS_).includes(payload.action));
  }
});
test('all actions reject malformed/foreign batch, request and hash with write 0', () => {
  for (const operation of ['stage','validate','commit','rollback','discard']) for (const wrong of [
    { batch_id: {} }, { batch_id: '../foreign' }, { batch_id: 'other-batch' }, { request_id: 'other-request' }, { manifest_sha256: 'wrong' }
  ]) zeroWriteFailure(createFirstImportMock(operation === 'rollback' ? completedSnapshot : validSnapshot), { ...input.chunks[0], ...request(operation), ...wrong });
});
test('explicit approvals for commit/rollback/discard cannot be omitted or interchanged', () => {
  for (const operation of ['commit','rollback','discard']) for (const approval of [undefined, '', 'WRONG_APPROVAL']) {
    const env = createFirstImportMock(operation === 'rollback' ? completedSnapshot : validSnapshot);
    zeroWriteFailure(env, request(operation, { approval }), 'EXPLICIT_APPROVAL_REQUIRED');
  }
});
test('public or authenticated GET cannot reach any first-import action', () => {
  for (const operation of ['stage','validate','commit','rollback','discard']) for (const token of [undefined, 'local-test-token']) {
    const env = createFirstImportMock(completedSnapshot);
    const result = env.ctx.doGet({ parameter: { ...request(operation), token } });
    assert(result.body.includes('unknown action')); assert.strictEqual(env.writes.length, 0);
    assert.strictEqual(env.operations.length, 0);
  }
});
test('all five POST actions reachable through teacher router in dry-run only', () => {
  const codes = { stage:'ALREADY_ACCEPTED', validate:'VALIDATED', commit:'COMMIT_ELIGIBLE', rollback:'ROLLBACK_PLAN_PASS', discard:'DISCARD_PLAN_PASS' };
  for (const [operation, code] of Object.entries(codes)) {
    const env = createFirstImportMock(operation === 'rollback' ? completedSnapshot : validSnapshot);
    const payload = { ...input.chunks[0], ...request(operation), approval:'COMMIT_FIRST_IMPORT', token:'local-test-token', dry_run:true };
    expectCode(JSON.parse(env.ctx.doPost({ postData:{contents:JSON.stringify(payload)} }).body), code);
    assert.strictEqual(env.writes.length, 0);
  }
});
test('caller trace_id cannot leak token or credential through first-import logs', () => {
  const env = createFirstImportMock(validSnapshot);
  const payload = commit({ token:'local-test-token', trace_id:'local-test-token fixture-credential', dry_run:true });
  expectCode(JSON.parse(env.ctx.doPost({ postData:{contents:JSON.stringify(payload)} }).body), 'COMMIT_ELIGIBLE');
  assert.strictEqual(env.logs.length, 0);
});
test('capacity below 3245 rows OR 21 columns returns explicit reason and write 0', () => {
  for (const dimension of ['rows','columns']) {
    const env = createFirstImportMock(validSnapshot), db = env.sheets.VocabularyDB;
    if (dimension === 'rows') db.maxRows = 3244;
    else { db.maxColumns = 20; db.rows[0] = db.rows[0].slice(0,20); }
    const result = env.call(commit()); expectCode(result, 'FIRST_IMPORT_PRECONDITION_FAILED');
    assert.strictEqual(result.reason, 'INSUFFICIENT_SHEET_CAPACITY'); assert.strictEqual(env.writes.length, 0);
  }
});
test('minimal physical capacity is sufficient and boundary cells remain untouched', () => {
  const env = createFirstImportMock(validSnapshot), db = env.sheets.VocabularyDB;
  db.maxRows = 3245; db.maxColumns = 21;
  expectCode(env.call(commit()), 'COMPLETED');
  for (const w of env.writes.filter(w => w.sheet === 'VocabularyDB')) {
    assert.strictEqual(w.row, 2); assert.strictEqual(w.row+w.rows-1, 3245); assert.strictEqual(w.column+w.columns-1, 21);
  }
  assert.strictEqual(db.rows.length, 3245); assert(db.rows.every(row => row.length === 21));
});
test('header whitespace/case mismatch and blank sense_id fail closed', () => {
  for (const name of ['sense_id ', ' sense_id', 'Sense_id']) {
    const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyDB.rows[0][0] = name;
    zeroWriteFailure(env, commit(), 'FIRST_IMPORT_PRECONDITION_FAILED');
  }
  const env = createFirstImportMock(validSnapshot); env.sheets.VocabularyImportStagingV2.rows[1][7] = '';
  zeroWriteFailure(env, commit(), 'ROW_VALIDATION_FAILED');
});
test('corrupt status, malformed audit JSON, duplicate audit and wrong chunk ledger block writes', () => {
  for (const mutate of [
    env => env.sheets.VocabularyImportsV2.rows[1][3] = 'COMPLETED',
    env => env.sheets.VocabularyImportsV2.rows[1][12] = 'VOCAB_FIRST_IMPORT_V1:{broken',
    env => env.sheets.VocabularyImportsV2.rows.push(env.sheets.VocabularyImportsV2.rows[1].slice()),
    env => { const a = env.audit(); a.chunks[0] = a.chunks[1]; env.sheets.VocabularyImportsV2.rows[1][12] = 'VOCAB_FIRST_IMPORT_V1:' + JSON.stringify(a); }
  ]) { const env = createFirstImportMock(validSnapshot); mutate(env); zeroWriteFailure(env, commit()); }
});
test('post-write reorder prevents COMPLETED and records partial failure', () => {
  const env = createFirstImportMock(validSnapshot);
  env.hooks.afterWrite = name => {
    if (name === 'VocabularyDB') { const rows = env.sheets.VocabularyDB.rows; [rows[1], rows[2]] = [rows[2], rows[1]]; }
  };
  expectCode(env.call(commit()), 'PARTIAL_IMPORT_DETECTED'); assert.strictEqual(env.audit().status, 'FAILED');
});
test('completed row reorder gives STATE_MISMATCH and rollback blocked with write 0', () => {
  const env = createFirstImportMock(completedSnapshot), rows = env.sheets.VocabularyDB.rows;
  [rows[1], rows[2]] = [rows[2], rows[1]];
  zeroWriteFailure(env, commit(), 'STATE_MISMATCH'); zeroWriteFailure(env, request('rollback',{dry_run:true}), 'ROLLBACK_BLOCKED');
});
test('concurrent duplicate stage cannot acquire or release the owner lock', () => {
  const env = createFirstImportMock(); let nested;
  env.hooks.afterWrite = name => {
    if (name !== 'VocabularyImportStagingV2') return;
    const before = env.writes.length; nested = env.call(input.chunks[0]);
    expectCode(nested, 'LOCK_BUSY'); assert.strictEqual(env.writes.length,before); assert.strictEqual(env.locked(),true);
  };
  expectCode(env.call(input.chunks[0]), 'ACCEPTED'); assert(nested); assert.strictEqual(env.locked(),false);
  env.writes.length = 0; expectCode(env.call(input.chunks[0]), 'ALREADY_ACCEPTED'); assert.strictEqual(env.writes.length,0);
});
test('concurrent commit and rollback are blocked while commit owns ScriptLock', () => {
  const env = createFirstImportMock(validSnapshot); let attempted = 0;
  env.hooks.afterWrite = name => {
    if (name !== 'VocabularyDB') return;
    for (const payload of [commit(), request('rollback',{approval:'ROLLBACK_FIRST_IMPORT'})]) {
      const before = env.writes.length; expectCode(env.call(payload),'LOCK_BUSY');
      assert.strictEqual(env.writes.length,before); assert.strictEqual(env.locked(),true); attempted++;
    }
  };
  expectCode(env.call(commit()), 'COMPLETED'); assert.strictEqual(attempted,2); assert.strictEqual(env.locked(),false);
});
test('final audit mutation is flushed before lock release on every write path', () => {
  for (const [snapshot,payload] of [
    [undefined,input.chunks[0]], [stagedSnapshot,request('validate')], [validSnapshot,commit()],
    [completedSnapshot,request('rollback',{approval:'ROLLBACK_FIRST_IMPORT'})],
    [stagedSnapshot,request('discard',{approval:'DISCARD_FIRST_IMPORT_STAGING'})]
  ]) {
    const env = createFirstImportMock(snapshot); assert.strictEqual(env.call(payload).ok,true);
    const ops = env.operations.map(op=>op.method), release = ops.lastIndexOf('releaseLock');
    const write = Math.max(ops.lastIndexOf('setValues'),ops.lastIndexOf('clearContent'));
    assert(write < ops.lastIndexOf('flush') && ops.lastIndexOf('flush') < release);
  }
});
test('final flush exception never returns success and releases lock', () => {
  const env = createFirstImportMock(stagedSnapshot); env.hooks.flush = () => { throw new Error('fixture flush failure'); };
  expectCode(env.call(request('validate')),'FIRST_IMPORT_FLUSH_FAILED'); assert.strictEqual(env.locked(),false);
});
test('partial rollback cannot leave COMPLETED or be recovered as successful commit', () => {
  const env = createFirstImportMock(completedSnapshot); env.sheets.VocabularyDB.failClearAfter = 100;
  expectCode(env.call(request('rollback',{approval:'ROLLBACK_FIRST_IMPORT'})),'ROLLBACK_INCOMPLETE');
  assert.strictEqual(env.audit().status,'FAILED'); assert.strictEqual(env.audit().actual_rows,3144);
  assert.strictEqual(env.audit().operation,'ROLLBACK');
  zeroWriteFailure(env,commit(),'STATE_MISMATCH'); zeroWriteFailure(env,request('rollback',{dry_run:true}),'ROLLBACK_BLOCKED');
});
const measuredOperations = {};
test('bulk operation counts: no per-row writes and 14 staging scans across 7 chunks', () => {
  function measure(env,key) {
    const methods = ['getDataRange','getRange','getValues','getFormulas','setValues','clearContent','flush'];
    measuredOperations[key] = Object.fromEntries(methods.map(m=>[m,env.operations.filter(op=>op.method===m).length]));
  }
  const env = createFirstImportMock(); input.chunks.forEach(chunk=>expectCode(env.call(chunk),'ACCEPTED')); measure(env,'stage_7_chunks');
  assert.strictEqual(env.operations.filter(op=>op.sheet==='VocabularyImportStagingV2'&&op.method==='getValues').length,14);
  assert.strictEqual(env.writes.filter(w=>w.sheet==='VocabularyImportStagingV2').length,7);
  env.operations.length=0; expectCode(env.call(request('validate')),'VALIDATED'); measure(env,'validate');
  env.operations.length=0; expectCode(env.call(commit()),'COMPLETED'); measure(env,'commit');
  assert.strictEqual(measuredOperations.commit.setValues,3); assert.strictEqual(measuredOperations.commit.getValues,4);
  env.operations.length=0; expectCode(env.call(commit()),'ALREADY_COMMITTED'); measure(env,'commit_retry');
  const rollback = createFirstImportMock(env.snapshot());
  expectCode(rollback.call(request('rollback',{approval:'ROLLBACK_FIRST_IMPORT'})),'ROLLED_BACK'); measure(rollback,'rollback');
});
console.log(JSON.stringify({ tests: count, passed: count, real_source_rows: input.rows.length, levels: input.metadata.expected_levels, operations:measuredOperations, google_sheet_writes: 0, deploys: 0 }));
