const assert = require('assert'), fs = require('fs'), vm = require('vm');
const { readFinalVocabulary } = require('./helpers/final-vocabulary');
const actual = readFinalVocabulary().rows;
let rows, reads = 0;
const ctx = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-only' }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName(name) {
    assert.strictEqual(name, 'VocabularyDB', 'listing may only read VocabularyDB');
    return { getDataRange: () => ({ getValues() { reads++; return rows; } }) };
  } }) }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('exam/sheet_backend.gs', 'utf8'), ctx);
function seed(items) {
  rows = [Array.from(ctx.VOCABULARY_DB_HEADERS), ...items.map(r => Array.from(ctx.VOCABULARY_DB_HEADERS, k => r[k] ?? ''))];
}
function list(params = {}) {
  reads = 0;
  const value = JSON.parse(JSON.stringify(ctx.handleListVocabularyDbV1_({ parameter: { token: 'test-only', ...params } })));
  assert.strictEqual(reads, 1, 'one bulk read per page');
  return value;
}
function walk(params, expected) {
  const ids = [];
  for (let page = 1; ; page++) {
    const r = list({ ...params, page, limit: 200 });
    assert.strictEqual(r.total_count, expected.length);
    assert.strictEqual(r.total, r.total_count, 'legacy total');
    assert.strictEqual(r.page, page);
    assert.strictEqual(r.offset, (page - 1) * 200);
    assert(r.items.length <= 200);
    ids.push(...r.items.map(x => x.sense_id));
    if (!r.has_more) { assert.strictEqual(r.next_cursor, null); break; }
    assert.strictEqual(r.next_cursor, page * 200);
  }
  assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate IDs between pages');
  assert.deepStrictEqual([...ids].sort(), expected.map(x => x.sense_id).sort(), 'no missing IDs');
  return ids;
}
seed(actual);
for (const sort of ['importance', 'occurrence', 'alphabetical']) walk({ sort }, actual);
for (const level of ['V1','V2','V3','V4','V5']) {
  walk({ level, scope: 'curriculum', sort: 'alphabetical' }, actual.filter(x => x.level === level));
  const q = 'a';
  walk({ level, q, sort: 'occurrence' }, actual.filter(x => x.level === level && (String(x.word).toLowerCase().includes(q) || x.meaning.includes(q))));
}
walk({ q: '세포' }, actual.filter(x => String(x.word).includes('세포') || x.meaning.includes('세포')));
walk({ scope: 'archive' }, []);
assert.strictEqual(list({ offset: 200 }).items[0].sense_id, list({ page: 2 }).items[0].sense_id);
assert.strictEqual(list({ cursor: 200 }).items[0].sense_id, list({ page: 2 }).items[0].sense_id);
assert.strictEqual(list({ page: -1, limit: 'bad' }).page, 1);
assert.strictEqual(list({ limit: 999 }).limit, 500);
assert.strictEqual(list({ offset: 4000 }).items.length, 0);
reads = 0;
assert.strictEqual(ctx.handleListVocabularyDbV1_({parameter:{token:'bad'}}).error, 'no token');
assert.strictEqual(reads, 0, 'authentication before sheet read');
// Independent fixtures exercise ties and filters absent from the final all-active workbook.
const tied = Array.from({length: 450}, (_, i) => ({...actual[0],
  sense_id: 'tie-' + String(449-i).padStart(4, '0'), word: 'same', meaning: '같은 뜻',
  sense_order: 1, selection_score: 10, occurrence_count: 10, importance_score: 10,
  active: i % 3 !== 0, curriculum_active: i % 2 === 0, archive_only: i % 2 !== 0,
  semantic_review_status: i % 5 === 0 ? 'UNCERTAIN' : ''
}));
seed(tied);
for (const sort of ['importance','occurrence','alphabetical']) {
  const ids = walk({sort, active_only:'0', include_archive:'1'}, tied);
  assert.deepStrictEqual(ids, [...ids].sort(), 'sense_id resolves every sort tie');
}
walk({scope:'archive',active_only:'0'}, tied.filter(x => x.archive_only));
walk({scope:'curriculum',q:'같은',level:tied[0].level,sort:'occurrence'}, tied.filter(x => x.curriculum_active && x.active));
walk({include_archive:'1',uncertain_only:'1'}, tied.filter(x => x.active && x.semantic_review_status === 'UNCERTAIN'));
seed([]);
assert.strictEqual(list().total_pages, 0);
assert.strictEqual(list().has_more, false);
console.log('vocabulary_pagination.test.js: final 3200 traversal, filters, stable ties and read-only API passed');
