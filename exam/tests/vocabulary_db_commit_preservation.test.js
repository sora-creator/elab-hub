'use strict';
// Offline only. The legacy writer below is a regression fixture, never a transport.
const assert = require('assert');
const { loadFirstImport, hash } = require('../../tools/vocabulary-first-import.cjs');
const { createFirstImportMock } = require('./helpers/vocabulary-first-import-mock.cjs');
const input = loadFirstImport();
const req = (operation, extra = {}) => ({ ...input.metadata, action: `${operation}VocabularyFirstImportV1`, ...extra });
const commit = req('commit', { approval: 'COMMIT_FIRST_IMPORT', dry_run: false });
const targets = ['SEN_543D1DA76B91', 'SEN_10DD210DC5B5'];
const text = [0,1,2,3,4,5,12,13,15,18,19,20];
const normalize = rows => rows.map(row => row.map((v,i) => i === 10 || i === 11 ? '' : v));
const staged = createFirstImportMock();
for (const chunk of input.chunks) assert.strictEqual(staged.call(chunk).code, 'ACCEPTED');
assert.strictEqual(staged.call(req('validate')).code, 'VALIDATED');
const snapshot = staged.snapshot();
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

const old = createFirstImportMock(snapshot);
// Restore only the removed raw writer to demonstrate failure through the real
// commit handler, unchanged post-readback/fingerprint check and failure ledger.
old.ctx.vocabularyFirstImportDbWriteV1_ = (sheet, rows) => sheet.getRange(2,1,3244,21).setValues(rows);
test('legacy raw DB commit reproduces PARTIAL_IMPORT_DETECTED', () => {
  assert.strictEqual(old.call(commit).code, 'PARTIAL_IMPORT_DETECTED');
  assert.strictEqual(old.audit().status, 'FAILED');
  assert.notStrictEqual(hash(normalize(old.sheets.VocabularyDB.rows.slice(1))), input.manifest.canonical_rows_sha256);
});
for (const id of targets) test(`legacy DB writer loses canonical U+0027: ${id}`, () => {
  const expected = input.rows.find(row => row[0] === id);
  assert(expected[18].startsWith("'"));
  assert.strictEqual(old.sheets.VocabularyDB.rows.find(row => row[0] === id)[18], expected[18].slice(1));
});
test('failed legacy commit cannot rewrite or append on retry', () => {
  old.writes.length = 0;
  assert.strictEqual(old.call(commit).code, 'PARTIAL_IMPORT_DETECTED');
  assert.strictEqual(old.writes.length, 0);
});

const env = createFirstImportMock(snapshot);
const before = hash(env.snapshot());
test('commit dry-run remains write-free', () => {
  assert.strictEqual(env.call({ ...commit, dry_run: true }).code, 'COMMIT_ELIGIBLE');
  assert.strictEqual(env.writes.length, 0);
  assert.strictEqual(hash(env.snapshot()), before);
});
test('full pinned 3244 validated staging commits successfully', () => {
  assert.strictEqual(env.call(commit).code, 'COMPLETED');
  assert.strictEqual(env.audit().status, 'COMPLETED');
  assert.strictEqual(env.audit().actual_rows, 3244);
});
const actual = env.sheets.VocabularyDB.rows.slice(1);
test('full 21-column values/types and every row fingerprint exact', () => {
  assert.strictEqual(actual.length, 3244);
  actual.forEach((row,r) => {
    assert.strictEqual(row.length, 21);
    row.forEach((v,c) => {
      if (c === 10 || c === 11) {
        assert(v instanceof Date);
        assert.strictEqual(v.toISOString(), env.audit().batch_timestamp);
      } else {
        assert.strictEqual(typeof v, typeof input.rows[r][c], `type ${r}:${c}`);
        assert.strictEqual(v, input.rows[r][c], `field ${r}:${c}`);
      }
    });
    assert.strictEqual(hash(normalize([row])[0]), hash(input.rows[r]));
  });
  assert.strictEqual(hash(normalize(actual)), input.manifest.canonical_rows_sha256);
});
test('3244 unique senses, no missing/extra, exact level distribution', () => {
  const ids = new Set(actual.map(r => r[0]));
  assert.strictEqual(ids.size, 3244);
  assert(input.manifest.allowlist.every(id => ids.has(id)));
  const levels = { V1:0, V2:0, V3:0, V4:0, V5:0 };
  actual.forEach(r => levels[r[19]]++);
  assert.deepStrictEqual(levels, input.metadata.expected_levels);
});
for (const id of targets) test(`new DB writer preserves canonical U+0027: ${id}`, () => {
  assert.strictEqual(actual.find(r => r[0] === id)[18], input.rows.find(r => r[0] === id)[18]);
});
test('E1560 sense word remains string false in DB', () => {
  assert.strictEqual(actual.find(r => r[0] === 'SEN_A587053E40B9')[2], 'false');
});
test('all value/format writes bounded; text format never touches scalar columns', () => {
  const writes = env.writes.filter(w => w.sheet === 'VocabularyDB');
  assert(writes.length > 0);
  for (const w of writes) {
    assert(w.row >= 2 && w.row + w.rows - 1 <= 3245);
    assert(w.column >= 1 && w.column + w.columns - 1 <= 21);
    assert.notStrictEqual(w.method, 'clearContent');
    if (w.method === 'setNumberFormat') {
      assert.strictEqual(w.format, '@');
      for (let c=w.column-1; c<w.column-1+w.columns; c++) assert(text.includes(c));
    }
  }
  assert.deepStrictEqual(env.sheets.VocabularyDB.rows[0], snapshot.VocabularyDB[0]);
  assert.strictEqual(env.sheets.VocabularyDB.getLastRow(), 3245);
  assert.strictEqual(Object.keys(env.sheets.VocabularyDB.formulas).length, 0);
  assert.strictEqual(hash(env.sheets.VocabularyImportStagingV2.rows), hash(snapshot.VocabularyImportStagingV2));
  assert(env.writes.every(w => ['VocabularyDB','VocabularyImportsV2'].includes(w.sheet)));
  assert.strictEqual(hash(env.audit().chunks), hash(staged.audit().chunks));
});
test('second commit acknowledges exact completion with zero writes', () => {
  env.writes.length = 0;
  assert.strictEqual(env.call(commit).code, 'ALREADY_COMMITTED');
  assert.strictEqual(env.writes.length, 0);
});

// Synthetic literals test the same DB writer without changing the pinned source
// or relaxing the real commit's manifest gate.
const literals = ["'ABC", "''ABC", 'false', 'true', '001', '=1+1', '+1', '-1', '@SUM(A1)', 'ordinary word'];
const typed = input.rows.map(r => { const copy = r.slice(); copy[10] = new Date('2026-09-09T00:00:00Z'); copy[11] = new Date(copy[10]); return copy; });
literals.forEach((v,r) => text.forEach(c => typed[r][c] = v));
const fixtureHash = hash(typed), literalEnv = createFirstImportMock();
literalEnv.hooks.scalarCoercion = v => /^\d+$/.test(v) ? Number(v) : v;
let primitiveCalls = 0;
const primitive = literalEnv.ctx.vocabularyFirstImportTextWriteV1_;
literalEnv.ctx.vocabularyFirstImportTextWriteV1_ = (...args) => { primitiveCalls++; return primitive(...args); };
literalEnv.ctx.vocabularyFirstImportDbWriteV1_(literalEnv.sheets.VocabularyDB, typed);
for (const [r,v] of literals.entries()) test(`STRING_REQUIRED exact and formula-free: ${JSON.stringify(v)}`, () => {
  text.forEach(c => {
    assert.strictEqual(literalEnv.sheets.VocabularyDB.rows[r+1][c], v);
    assert.strictEqual(literalEnv.sheets.VocabularyDB.getRange(r+2,c+1).getFormulas()[0][0], '');
  });
});
test('shared Strategy3 helper actually called; canonical matrix unchanged', () => {
  assert.strictEqual(primitiveCalls, 4);
  assert.strictEqual(hash(typed), fixtureHash);
});
test('number/boolean/Date columns retain runtime types and values', () => {
  typed.forEach((row,r) => row.forEach((v,c) => {
    if (text.includes(c)) return;
    const stored = literalEnv.sheets.VocabularyDB.rows[r+1][c];
    if (v instanceof Date) { assert(stored instanceof Date); assert.strictEqual(stored.getTime(),v.getTime()); }
    else assert.strictEqual(stored,v);
  }));
});
for (const method of ['format','rich','apostrophe','corrupt']) test(`interrupted/corrupt DB ${method} write never succeeds or retries`, () => {
  const broken = createFirstImportMock(snapshot);
  if (method === 'format') broken.hooks.beforeFormat = name => { if (name === 'VocabularyDB') throw new Error('fixture'); };
  if (method === 'rich') broken.hooks.beforeRichWrite = name => { if (name === 'VocabularyDB') throw new Error('fixture'); };
  if (method === 'apostrophe') broken.hooks.beforeScalarWrite = (name,r,c) => { if (name === 'VocabularyDB' && r === 3204 && c === 19) throw new Error('fixture'); };
  if (method === 'corrupt') broken.hooks.afterRichWrite = name => { if (name === 'VocabularyDB') broken.sheets.VocabularyDB.rows[1][2] = 'tampered'; };
  assert.strictEqual(broken.call(commit).code, 'PARTIAL_IMPORT_DETECTED');
  assert.strictEqual(broken.audit().status, 'FAILED');
  broken.writes.length = 0;
  assert.strictEqual(broken.call(commit).ok, false);
  assert.strictEqual(broken.writes.length, 0);
});
console.log(JSON.stringify({ tests:count, passed:count, input_rows:3244, output_rows:actual.length,
  unique:3244, duplicate:0, missing:0, extra:0, field_mismatch:0, type_mismatch:0, fingerprint_mismatch:0,
  levels:input.metadata.expected_levels, operating_writes:0 }));
