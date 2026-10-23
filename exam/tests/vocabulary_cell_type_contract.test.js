'use strict';
// Local only. Inject storage coercion deliberately; this mock does not prove Google formatting behavior.
const assert = require('node:assert/strict');
const { loadFirstImport, hash } = require('../../tools/vocabulary-first-import.cjs');
const { createFirstImportMock } = require('./helpers/vocabulary-first-import-mock.cjs');
const input = loadFirstImport(), targetId = 'SEN_A587053E40B9';
let tests = 0;
function test(name, fn) { fn(); tests++; console.log(`PASS ${name}`); }
const env = createFirstImportMock();
input.chunks.slice(0, 3).forEach(c => assert.equal(env.call(c).code, 'ACCEPTED'));
const firstThree = env.snapshot();

test('SCHEMA_E_IS_WORD_IN_STAGING_AND_LEVEL_IN_DB', () => {
  assert.equal(env.ctx.VOCABULARY_IMPORT_STAGING_V2_HEADERS.length, 22);
  assert.equal(env.ctx.VOCABULARY_IMPORT_STAGING_V2_HEADERS[4], 'word');
  assert.equal(env.ctx.VOCABULARY_DB_HEADERS.length, 21);
  assert.equal(env.ctx.VOCABULARY_DB_HEADERS[4], 'level');
  const row = input.rows.find(r => r[0] === targetId);
  assert.equal(row[2], 'false'); assert.equal(typeof row[2], 'string');
  assert.equal(input.rows.indexOf(row) + 2, 1560);
});

test('TYPED_HASH_DISTINGUISHES_VALID_TEXT_FLAGS_AND_OPTIONAL_BLANK', () => {
  // Text belongs in word; booleans belong in flags; blank belongs in optional text.
  for (const word of ['false', 'true']) {
    const values = [word, true, false, ''];
    assert.equal(env.ctx.vocabularyFirstImportHashV1_(values), hash(values));
    assert.notEqual(hash(values), hash([word === 'true', true, false, '']));
    assert.notEqual(hash(values), hash([word, 'true', 'false', '']));
  }
  const raw = Object.fromEntries(input.manifest.canonical_headers.map((h,i) => [h,input.rows[1558][i]]));
  assert(env.ctx.normalizeVocabularyImportRowV1_({...raw,word:''},1560).errors.includes('MISSING_WORD'));
});

test('STRING_FALSE_PRESERVATION_AT_LITERAL_TEXT_BOUNDARY', () => {
  const e = createFirstImportMock(firstThree), sheet = e.sheets.VocabularyImportStagingV2;
  const getRange = sheet.getRange.bind(sheet); let observed = 0;
  sheet.getRange = (...args) => {
    const range = getRange(...args), setRich = range.setRichTextValues;
    range.setRichTextValues = values => {
      for (const row of values) if (args[1] === 4 && row[4].getText() === targetId) {
        observed++; assert.equal(row[1].getText(), 'false'); assert.equal(typeof row[1].getText(), 'string');
      }
      return setRich(values);
    };
    return range;
  };
  assert.equal(e.call(input.chunks[3]).code, 'ACCEPTED');
  assert.equal(observed, 1);
  assert.equal(sheet.rows.find(r => r[7] === targetId)[4], 'false');
  assert.equal(e.audit().chunks[3], input.chunks[3].payload_hash);
});

let corrupt;
test('INJECTED_STORAGE_COERCION_FAILS_BEFORE_CHUNK_AUDIT_ACCEPTANCE', () => {
  const e = createFirstImportMock(firstThree);
  e.hooks.afterRichWrite = (name, row, column) => {
    if (name === 'VocabularyImportStagingV2' && column === 4) {
      const r = e.sheets[name].rows.find(r => r[7] === targetId);
      assert.equal(r[4], 'false'); r[4] = false;
    }
  };
  assert.equal(e.call(input.chunks[3]).code, 'TYPE_COERCION_DETECTED');
  assert.equal(e.audit().chunks[3], null); assert.equal(e.audit().actual_rows, 1500);
  assert.equal(e.sheets.VocabularyImportStagingV2.rows.length - 1, 2000);
  assert.equal(e.writes.filter(w => w.sheet === 'VocabularyImportsV2').length, 0);
  assert.equal(e.writes.filter(w => w.sheet === 'VocabularyDB').length, 0);
  corrupt = e.snapshot();
});

test('CORRUPT_REPLAY_CANNOT_APPEND_OR_ACKNOWLEDGE', () => {
  const e = createFirstImportMock(corrupt), before = hash(e.snapshot());
  assert.equal(e.call(input.chunks[3]).code, 'CHUNK_CONFLICT');
  assert.equal(e.writes.length, 0); assert.equal(hash(e.snapshot()), before);
});

test('NORMALIZING_PINNED_WORD_TO_BOOLEAN_CANNOT_BYPASS_HASH', () => {
  for (const changeHash of [false, true]) {
    const e = createFirstImportMock(corrupt), c = structuredClone(input.chunks[3]);
    c.rows.find(r => r[0] === targetId)[2] = false;
    if (changeHash) c.payload_hash = hash(c.rows);
    assert.equal(e.call(c).code, 'CHUNK_CONFLICT'); assert.equal(e.writes.length, 0);
  }
});

test('EXACT_DATA_HYPOTHESIS_RECOVERS_AUDIT_THEN_REPLAYS_WITH_ZERO_WRITES', () => {
  const e = createFirstImportMock(corrupt);
  // Fixture-only hypothesis. No operational repair function is implemented here.
  e.sheets.VocabularyImportStagingV2.rows.find(r => r[7] === targetId)[4] = 'false';
  const beforeStaging = hash(e.sheets.VocabularyImportStagingV2.rows);
  assert.equal(e.call(input.chunks[3]).code, 'ACCEPTED');
  assert.equal(e.audit().actual_rows, 2000);
  assert.equal(e.writes.length, 1); assert.equal(e.writes[0].sheet, 'VocabularyImportsV2');
  assert.equal(hash(e.sheets.VocabularyImportStagingV2.rows), beforeStaging);
  e.writes.length = 0;
  assert.equal(e.call(input.chunks[3]).code, 'ALREADY_ACCEPTED'); assert.equal(e.writes.length, 0);
});

test('TEXT_FIXTURES_REMAIN_LITERAL_WITH_HOSTILE_SCALAR_PARSER', () => {
  const words = ['false','true','False','FALSE','123','001','=test','+test','-test','@test'];
  const e = createFirstImportMock(), now = new Date('2026-09-08T00:00:00Z');
  e.hooks.scalarCoercion = value => {
    if (/^[=+\-@]/.test(value)) throw new Error('text reached scalar formula parser');
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
    if (/^\d+$/.test(value)) return Number(value);
    return value;
  };
  const values = words.map((word,i) => [input.metadata.batch_id+':'+(i+2),input.metadata.batch_id,i+2,'V1',word,
    '=literal meaning','VOC_TEST','SEN_TEST_'+i,'WORD',1,12.5,3,true,now,true,'V1',false,8.5,'@literal reason','','V1','']);
  e.ctx.vocabularyFirstImportStagingWriteV1_(e.sheets.VocabularyImportStagingV2,2,values);
  const actual=e.sheets.VocabularyImportStagingV2.getRange(2,1,words.length,22).getValues();
  assert.equal(hash(actual),hash(values));
  assert(actual.every(r => typeof r[4]==='string' && r[13] instanceof Date && typeof r[12]==='boolean' && typeof r[9]==='number'));
  assert(e.sheets.VocabularyImportStagingV2.getRange(2,1,words.length,22).getFormulas().every(r=>r.every(v=>v==='')));
  assert(e.writes.every(w=>w.sheet==='VocabularyImportStagingV2'&&w.row===2&&w.rows===words.length));
  assert.equal(e.writes.length,13);
});

test('INVALID_STAGING_COLUMN_TYPE_HAS_ZERO_VALUE_AND_FORMAT_WRITES', () => {
  const e=createFirstImportMock();
  assert.throws(()=>e.ctx.vocabularyFirstImportStagingWriteV1_(e.sheets.VocabularyImportStagingV2,2,[Array(22).fill(false)]));
  assert.equal(e.writes.length,0);
});

test('PARTIAL_LITERAL_WRITE_CANNOT_BE_ACKNOWLEDGED_OR_APPENDED_AGAIN', () => {
  const e=createFirstImportMock(firstThree);
  e.hooks.beforeRichWrite=()=>{throw new Error('interrupted literal write');};
  assert.equal(e.call(input.chunks[3]).ok,false);
  assert.equal(e.audit().chunks[3],null); assert.equal(e.audit().actual_rows,1500);
  e.hooks.beforeRichWrite=null;e.writes.length=0;
  assert.equal(e.call(input.chunks[3]).code,'CHUNK_CONFLICT');assert.equal(e.writes.length,0);
  assert.equal(e.sheets.VocabularyImportStagingV2.rows.length-1,2000);
});

test('DATE_TYPE_COERCION_CANNOT_BE_ACKNOWLEDGED', () => {
  const e=createFirstImportMock(firstThree);
  e.hooks.afterRichWrite=(name,row,column)=>{if(name==='VocabularyImportStagingV2'&&column===19)e.sheets[name].rows[1501][13]='not a Date';};
  assert.equal(e.call(input.chunks[3]).code,'TYPE_COERCION_DETECTED');assert.equal(e.audit().chunks[3],null);
  assert.equal(e.writes.filter(w=>w.method==='setNumberFormat').length,4);
  e.hooks.afterRichWrite=null;e.writes.length=0;
  assert.equal(e.call(input.chunks[3]).code,'TYPE_COERCION_DETECTED');assert.equal(e.writes.length,0);
  assert.equal(e.audit().actual_rows,1500);assert.equal(e.audit().chunks[3],null);
});

test('ALL_TEXT_COLUMNS_PRESERVE_FORMULA_AND_NUMBER_LIKE_LITERALS', () => {
  const patterns=['false','true','001','123','=SUM(1,2)','+cmd','-123','@x',''];
  const columns=[3,4,5,6,7,8,15,18,19,20,21],e=createFirstImportMock(),now=new Date();
  const values=[];
  for(const column of columns)for(const pattern of patterns){
    const source=values.length+2;
    const row=[input.metadata.batch_id+':'+source,input.metadata.batch_id,source,'V1','word','meaning','VOC_X','SEN_X','WORD',1,2,3,true,now,true,'V1',false,4,'reason','','V1',''];
    row[column]=pattern;values.push(row);
  }
  e.hooks.scalarCoercion=value=>{if(/^(?:false|true|\d+|[=+\-@].*)$/i.test(value))throw new Error('unprotected text in scalar write');return value;};
  e.ctx.vocabularyFirstImportStagingWriteV1_(e.sheets.VocabularyImportStagingV2,2,values);
  const range=e.sheets.VocabularyImportStagingV2.getRange(2,1,values.length,22);
  assert.equal(hash(range.getValues()),hash(values));assert(range.getFormulas().every(r=>r.every(v=>v==='')));
  assert.equal(e.writes.length,13);
  for(const column of [0,1]){
    const invalid=structuredClone(values.slice(0,1));invalid[0][column]='=SUM(1,2)';e.writes.length=0;
    assert.throws(()=>e.ctx.vocabularyFirstImportStagingWriteV1_(e.sheets.VocabularyImportStagingV2,2,invalid));assert.equal(e.writes.length,0);
  }
});

test('RICH_OBJECTS_NEVER_BELONG_IN_SCALAR_SETVALUES', () => {
  const e=createFirstImportMock(),r=e.ctx.SpreadsheetApp.newRichTextValue().setText('false').build();
  assert.throws(()=>e.sheets.VocabularyImportStagingV2.getRange(2,5).setValues([[r]]),/unsupported scalar object/);
  assert.equal(e.writes.length,0);
});

test('PLAIN_FORMAT_ONLY_TEXT_COLUMNS_AND_CURRENT_CHUNK', () => {
  const e=createFirstImportMock(),sh=e.sheets.VocabularyImportStagingV2;
  sh.formats['1,5']='header-format';sh.formats['502,5']='other-batch-format';
  assert.equal(e.call(input.chunks[0]).code,'ACCEPTED');
  const text=[0,1,3,4,5,6,7,8,15,18,19,20,21];
  for(let row=2;row<=501;row++)for(let col=0;col<22;col++){
    assert.equal(sh.formats[`${row},${col+1}`],text.includes(col)?'@':undefined);
  }
  assert.equal(sh.formats['1,5'],'header-format');assert.equal(sh.formats['502,5'],'other-batch-format');
  assert.equal(e.writes.filter(w=>w.method==='setNumberFormat').length,4);
  assert(e.writes.every(w=>w.sheet!=='VocabularyDB'));
});

test('FORMAT_FAILURE_STOPS_BEFORE_TEXT_VALUE_WRITE', () => {
  const e=createFirstImportMock(),sh=e.sheets.VocabularyImportStagingV2;
  sh.rows[1]=Array(22).fill('');sh.rows[1][4]=false;
  e.hooks.beforeFormat=()=>{throw Error('format unavailable');};
  assert.throws(()=>e.ctx.vocabularyFirstImportTextWriteV1_(sh.getRange(2,5),[['false']]));
  assert.equal(sh.rows[1][4],false);
  assert.deepEqual(e.writes.map(w=>w.method),['setNumberFormat']);
});

console.log(`${tests}/${tests} cell type contract tests PASS; operating writes = 0`);
