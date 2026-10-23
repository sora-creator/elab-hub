'use strict';
// Uses existing read-only operating evidence. Never makes an HTTP/Google request.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadFirstImport,hash}=require('../../tools/vocabulary-first-import.cjs');
const {createFirstImportMock}=require('./helpers/vocabulary-first-import-mock.cjs');
const input=loadFirstImport(),base=path.resolve(__dirname,'../../outputs/vocabulary-reclassification/vocab-5a2-forensic');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8').replace(/^\uFEFF/,''));
function decode(name) {
  const p=read(name),v=p['3'],flags=[];assert.equal(p['15']['2'],22);
  for(let i=0;i<p['2'].length;i++){const n=p['2'][i];if(n<0)flags.push(...Array(-n).fill(p['2'][++i]));else flags.push(n);}
  assert.equal(flags.length,p['15']['1']*22);let ni=0,si=0,bi=0,ti=0;
  const cells=flags.map(f=>{assert([194,195].includes(f));if(f===194)return '';const t=v['1'][ti++];if(t===1)return v['3'][ni++];if(t===2)return v['4'][si++];assert.equal(t,3);const b=v['5'][bi++];assert.equal(b['1'],4);assert([0,1].includes(b['4']));return Boolean(b['4']);});
  assert.equal(ti,v['1'].length);assert.equal(ni,v['3'].length);assert.equal(si,v['4'].length);assert.equal(bi,v['5'].length);
  return Array.from({length:p['15']['1']},(_,i)=>cells.slice(i*22,(i+1)*22));
}
const actual=[...decode('chunks123-values-clipboard.json'),...decode('chunk4-values-clipboard.json')],audit=read('OPERATING_CHUNK4_AUDIT_SNAPSHOT.json').audit;
assert.equal(actual.length,2000);
// Native clipboard represents formatted dates as serial numbers; Apps Script getValues returns Date.
// Adapt ONLY the timestamp column for the service mock. No source/word/type evidence is normalized.
// This models the API type, not the uncollected spreadsheet timezone or original timestamp instant.
const serviceRows=actual.map(row=>{const copy=row.slice();assert.equal(typeof copy[13],'number');copy[13]=new Date(Math.round((copy[13]-25569)*86400000));return copy;});
const fixture=createFirstImportMock();fixture.sheets.VocabularyImportStagingV2.rows.push(...serviceRows);
// Actual history snapshot included only D:M. Uncollected fields remain blank, not invented PII.
const history=Array(26).fill('');history[0]=audit.batch_id;history[3]=audit.status;history[4]=audit.expected_total;history[5]=audit.actual_rows;history[9]=audit.created_at;history[12]='VOCAB_FIRST_IMPORT_V1:'+JSON.stringify(audit);
fixture.sheets.VocabularyImportsV2.rows.push(history);const snapshot=fixture.snapshot();
const payload={...input.metadata,action:'repairVocabularyFirstImportV1',approval:'REPAIR_FIRST_IMPORT_WORD_FALSE',
  chunk_index:3,source_row:1560,sense_id:'SEN_A587053E40B9',field:'word',before_type:'boolean',before_value:false,after_type:'string',after_value:'false'};
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
function noWrite(e,p,code){const before=hash(e.snapshot()),r=e.call(p);assert.equal(r.ok,false);if(code)assert.equal(r.code,code);assert.equal(e.writes.length,0);assert.equal(hash(e.snapshot()),before);assert.equal(e.locked(),false);}
function staged(e){const s=e.sheets.VocabularyImportStagingV2;return e.ctx.vocabularyFirstImportStagedV1_({values:s.rows,formulas:s.rows.map(r=>r.map(()=>''))},e.ctx.vocabularyFirstImportSpecV1_()).map(r=>r.values);}
test('ACTUAL_SNAPSHOT_MATCHES_CONFIRMED_CONFLICT',()=>{const r=staged(fixture);assert.equal(hash(r.slice(0,1500)),hash(input.rows.slice(0,1500)));assert.equal(r[1558][2],false);assert.equal(hash(r.slice(1500)),'73ad014b341b06c658557d86b1ec5dc8d463b666b642d6fdcb0f1d96fe8fcb8d');assert.equal(audit.actual_rows,1500);assert.equal(audit.chunks[3],null);});
test('REPAIR_DRY_RUN_ZERO_WRITES',()=>{const e=createFirstImportMock(snapshot),before=hash(e.snapshot()),r=e.call({...payload,dry_run:true});assert.equal(r.code,'WOULD_REPAIR');assert.equal(r.cell,'E1560');assert.equal(r.before.value,false);assert.equal(r.before.type,'boolean');assert.equal(r.after.value,'false');assert.equal(r.after.type,'string');assert.equal(r.current_chunk_hash,'73ad014b341b06c658557d86b1ec5dc8d463b666b642d6fdcb0f1d96fe8fcb8d');assert.equal(e.writes.length,0);assert.equal(hash(e.snapshot()),before);});
for(const [name,change,code] of [
  ['NO_APPROVAL',{approval:undefined},'EXPLICIT_REPAIR_APPROVAL_REQUIRED'],
  ['WRONG_APPROVAL',{approval:'COMMIT_FIRST_IMPORT'},'EXPLICIT_REPAIR_APPROVAL_REQUIRED'],
  ['WRONG_TOKEN',{token:'wrong'},'UNAUTHORIZED'],
  ['WRONG_BATCH',{batch_id:'wrong'},'METADATA_MISMATCH_BATCH_ID'],
  ['WRONG_REQUEST',{request_id:'wrong'},'METADATA_MISMATCH_REQUEST_ID'],
  ['WRONG_MANIFEST',{manifest_sha256:'wrong'},'METADATA_MISMATCH_MANIFEST_SHA256'],
  ['WRONG_CHUNK',{chunk_index:4},'REPAIR_TARGET_MISMATCH'],
  ['WRONG_SOURCE_ROW',{source_row:1561},'REPAIR_TARGET_MISMATCH'],
  ['WRONG_SENSE',{sense_id:'other'},'REPAIR_TARGET_MISMATCH'],
  ['WRONG_FIELD',{field:'meaning'},'REPAIR_TARGET_MISMATCH'],
  ['WRONG_BEFORE_TYPE',{before_type:'string'},'REPAIR_TARGET_MISMATCH'],
  ['WRONG_BEFORE_VALUE',{before_value:'false'},'REPAIR_TARGET_MISMATCH'],
  ['WRONG_AFTER_VALUE',{after_value:true},'REPAIR_TARGET_MISMATCH'],
  ['INVALID_DRY_RUN',{dry_run:'true'},'INVALID_DRY_RUN']
])test(name,()=>noWrite(createFirstImportMock(snapshot),{...payload,...change},code));
test('REPAIR_AUTH_NEGATIVE_MATRIX_DIRECT_AND_POST',()=>{
  for(const token of [undefined,null,'','wrong','local-test-token ','fixture-teacher-credential','fixture-student-capability','fixture-assignment-capability']){
    const e=createFirstImportMock(snapshot),p={...payload,token,credential:'fixture-teacher-credential',student_capability:'fixture-student-capability',assignment_capability:'fixture-assignment-capability'};
    noWrite(e,p,'UNAUTHORIZED');const r=e.ctx.doPost({postData:{contents:JSON.stringify(p)}});assert.equal(r.body,'no');assert.equal(e.writes.length,0);
  }
});
test('GENERIC_DESTINATION_OVERRIDE_FIELDS_REJECTED',()=>{
  for(const key of ['sheet','sheet_name','sheet_id','cell','range','row','column','value','new_value']){
    noWrite(createFirstImportMock(snapshot),{...payload,[key]:'unauthorized-target'},'REPAIR_TARGET_MISMATCH');
  }
});
for(const value of [true,0,'FALSE','other',''])test('UNEXPECTED_ACTUAL_STATE_'+JSON.stringify(value),()=>{const e=createFirstImportMock(snapshot);e.sheets.VocabularyImportStagingV2.rows[1559][4]=value;noWrite(e,payload,'REPAIR_STATE_CONFLICT');});
for(const [name,mutate] of [
  ['OTHER_CHUNK4_CELL',e=>e.sheets.VocabularyImportStagingV2.rows[1600][5]='changed'],
  ['OTHER_CHUNK1_CELL',e=>e.sheets.VocabularyImportStagingV2.rows[1][5]='changed'],
  ['DB_NONEMPTY',e=>e.sheets.VocabularyDB.rows.push(['unexpected'])],
  ['DB_FORMULA',e=>e.sheets.VocabularyDB.formulas['2,1']='=""'],
  ['STAGING_FORMULA',e=>e.sheets.VocabularyImportStagingV2.formulas['1560,5']='=FALSE'],
  ['WRONG_CELL_SENSE',e=>e.sheets.VocabularyImportStagingV2.rows[1559][7]='other'],
  ['WRONG_GID',e=>e.sheets.VocabularyImportStagingV2.gid=999],
  ['MERGED_CELL',e=>e.sheets.VocabularyImportStagingV2.merged=[{}]],
  ['MISSING_ROW',e=>e.sheets.VocabularyImportStagingV2.rows.pop()],
  ['DUPLICATE_ROW',e=>e.sheets.VocabularyImportStagingV2.rows.push(e.sheets.VocabularyImportStagingV2.rows[1].slice())],
  ['WRONG_AUDIT_COUNT',e=>e.sheets.VocabularyImportsV2.rows[1][5]=2000],
  ['HEADER_CHANGED',e=>e.sheets.VocabularyImportStagingV2.rows[0][4]='Word']
])test(name,()=>{const e=createFirstImportMock(snapshot);mutate(e);noWrite(e,payload);});
for(const [name,change] of [
  ['AUDIT_STATUS_NOT_STAGING',a=>a.status='STAGED'],
  ['AUDIT_ROWS_NOT_1500',a=>a.actual_rows=1499],
  ['AUDIT_CHUNK1_WRONG',a=>a.chunks[0]='wrong'],
  ['AUDIT_CHUNK4_ALREADY_ACCEPTED_WHILE_DATA_BAD',a=>a.chunks[3]=input.chunks[3].payload_hash],
  ['AUDIT_LATER_CHUNK_PRESENT',a=>a.chunks[4]=input.chunks[4].payload_hash]
])test(name,()=>{const e=createFirstImportMock(snapshot),a=e.audit();change(a);e.sheets.VocabularyImportsV2.rows[1][3]=a.status;e.sheets.VocabularyImportsV2.rows[1][12]='VOCAB_FIRST_IMPORT_V1:'+JSON.stringify(a);noWrite(e,payload);});
test('OPERATING_GENERAL_FORMAT_INCIDENT_OLD_RICH_ONLY_FAILS_NEW_PATH_PASSES',()=>{
  const e=createFirstImportMock(snapshot),sh=e.sheets.VocabularyImportStagingV2;
  assert.equal(sh.getRange(1560,5).getNumberFormats()[0][0],'General');
  const newWrite=e.ctx.vocabularyFirstImportTextWriteV1_;
  e.ctx.vocabularyFirstImportTextWriteV1_=(range,rows)=>range.setRichTextValues(rows.map(row=>row.map(value=>e.ctx.SpreadsheetApp.newRichTextValue().setText(value).build())));
  assert.equal(e.call(payload).code,'REPAIR_POSTCHECK_FAILED');assert.equal(sh.rows[1559][4],false);
  assert.equal(e.audit().type_repair.after_type,'boolean');
  e.ctx.vocabularyFirstImportTextWriteV1_=newWrite;e.writes.length=0;
  assert.equal(e.call(payload).code,'REPAIRED');assert.equal(sh.rows[1559][4],'false');
  assert.equal(sh.getRange(1560,5).getNumberFormats()[0][0],'@');
  assert.equal(sh.getRange(1560,5).getFormulas()[0][0],'');
  assert.equal(hash(staged(e).slice(1500)),input.chunks[3].payload_hash);
});
test('REPAIR_FORMAT_IS_BOUNDED_AND_DRY_RUN_AND_RETRY_DO_NOT_FORMAT',()=>{
  const e=createFirstImportMock(snapshot),sh=e.sheets.VocabularyImportStagingV2;
  sh.formats['1560,4']='neighbor';sh.formats['1561,5']='other';
  const formats=hash(sh.formats);assert.equal(e.call({...payload,dry_run:true}).code,'WOULD_REPAIR');
  assert.equal(hash(sh.formats),formats);assert.equal(e.writes.length,0);
  assert.equal(e.call(payload).code,'REPAIRED');
  assert.deepEqual(sh.formats,{'1560,4':'neighbor','1561,5':'other','1560,5':'@'});
  e.writes.length=0;const after=hash(sh.formats);assert.equal(e.call(payload).code,'ALREADY_REPAIRED');
  assert.equal(e.writes.length,0);assert.equal(hash(sh.formats),after);
});
test('POSTWRITE_FORMULA_IS_REJECTED_EVEN_WHEN_VALUE_MATCHES',()=>{
  const e=createFirstImportMock(snapshot);e.hooks.afterRichWrite=()=>{e.sheets.VocabularyImportStagingV2.formulas['1560,5']='="false"';};
  assert.equal(e.call(payload).code,'REPAIR_POSTCHECK_FAILED');assert.equal(e.audit().chunks[3],null);
});
const repaired=createFirstImportMock(snapshot);
test('NORMAL_REPAIR_EXACTLY_ONE_STAGING_CELL_AND_HISTORY_ONLY',()=>{
  const before=structuredClone(repaired.sheets.VocabularyImportStagingV2.rows),r=repaired.call(payload);assert.equal(r.code,'REPAIRED');assert.equal(r.history_recorded,true);
  assert.deepEqual(repaired.writes.filter(w=>w.sheet==='VocabularyImportStagingV2'),[{sheet:'VocabularyImportStagingV2',method:'setNumberFormat',row:1560,column:5,rows:1,columns:1,format:'@'},...['setValues','setRichTextValues'].map(method=>({sheet:'VocabularyImportStagingV2',method,row:1560,column:5,rows:1,columns:1}))]);
  const after=repaired.sheets.VocabularyImportStagingV2.rows;let changes=0;before.forEach((row,i)=>row.forEach((v,j)=>{if(hash(v)!==hash(after[i][j])){changes++;assert.equal(i,1559);assert.equal(j,4);}}));assert.equal(changes,1);
  assert.equal(after[1559][4],'false');assert.equal(hash(staged(repaired)),hash(input.rows.slice(0,2000)));
  assert.equal(hash(staged(repaired).slice(1500)),input.chunks[3].payload_hash);
  assert.equal(repaired.audit().actual_rows,1500);assert.equal(repaired.audit().chunks[3],null);assert.equal(repaired.audit().type_repair.status,'REPAIRED');
  assert(repaired.writes.filter(w=>w.sheet==='VocabularyImportsV2').every(w=>w.column===13&&w.columns===1&&w.rows===1));
  assert.equal(repaired.sheets.VocabularyDB.rows.length,1);
});
test('REPAIR_RETRY_ALREADY_REPAIRED_ZERO_WRITE',()=>{repaired.writes.length=0;assert.equal(repaired.call(payload).code,'ALREADY_REPAIRED');assert.equal(repaired.writes.length,0);});
test('EXISTING_STAGE_REPLAY_RECOVERS_AUDIT_WITHOUT_APPEND',()=>{const before=hash(repaired.sheets.VocabularyImportStagingV2.rows);assert.equal(repaired.call(input.chunks[3]).code,'ACCEPTED');assert.equal(repaired.audit().actual_rows,2000);assert.equal(hash(repaired.sheets.VocabularyImportStagingV2.rows),before);assert(repaired.writes.every(w=>w.sheet==='VocabularyImportsV2'));repaired.writes.length=0;assert.equal(repaired.call(input.chunks[3]).code,'ALREADY_ACCEPTED');assert.equal(repaired.writes.length,0);assert.equal(repaired.call(payload).code,'ALREADY_REPAIRED');assert.equal(repaired.writes.length,0);});
test('CHUNKS_5_TO_7_AND_FULL_3244_TYPED_HASH',()=>{input.chunks.slice(4).forEach(c=>assert.equal(repaired.call(c).code,'ACCEPTED'));const rows=staged(repaired);assert.equal(rows.length,3244);assert.equal(hash(rows),hash(input.rows));const levels={V1:0,V2:0,V3:0,V4:0,V5:0};rows.forEach(r=>levels[r[19]]++);assert.deepEqual(levels,input.metadata.expected_levels);assert.equal(repaired.sheets.VocabularyDB.rows.length,1);});
test('INCIDENT_TO_FULL_VALIDATION_WITH_DB_STILL_EMPTY',()=>{
  const r=repaired.call({...input.metadata,action:'validateVocabularyFirstImportV1'});
  assert.equal(r.code,'VALIDATED');assert.equal(r.summary.total,3244);assert.equal(r.summary.unique_sense_ids,3244);
  assert.equal(r.summary.row_fingerprints,'PASS');assert.equal(hash(r.summary.levels),hash(input.metadata.expected_levels));
  assert.equal(repaired.audit().status,'VALIDATED');assert.equal(repaired.sheets.VocabularyDB.rows.length,1);
  assert(repaired.audit().chunks.every((h,i)=>h===input.chunks[i].payload_hash));
});
test('REPAIR_POSTCHECK_FAILURE_IS_NOT_SUCCESS_OR_ACCEPTED',()=>{const e=createFirstImportMock(snapshot);e.hooks.afterRichWrite=()=>{e.sheets.VocabularyImportStagingV2.rows[1559][4]=false;};const r=e.call(payload);assert.equal(r.code,'REPAIR_POSTCHECK_FAILED');assert.equal(r.ok,false);assert.equal(e.audit().type_repair.status,'REPAIR_POSTCHECK_FAILED');assert.equal(e.audit().type_repair.after_type,'boolean');assert.equal(e.audit().chunks[3],null);assert.equal(e.audit().actual_rows,1500);});
test('REPAIR_HISTORY_FAILURE_IS_EXPLICIT_AND_RETRY_DOES_NOT_REWRITE_CELL',()=>{const e=createFirstImportMock(snapshot);e.sheets.VocabularyImportsV2.failAfter=0;assert.equal(e.call(payload).code,'REPAIR_HISTORY_FAILED');e.writes.length=0;const r=e.call(payload);assert.equal(r.code,'ALREADY_REPAIRED');assert.equal(r.history_recorded,false);assert.equal(e.writes.length,0);});
test('POST_AUTH_AND_GET_NONREACHABILITY_NO_SECRET_LOG',()=>{
  const e=createFirstImportMock(snapshot);const post=p=>e.ctx.doPost({postData:{contents:JSON.stringify(p)}});
  assert.equal(post({...payload,token:'wrong',trace_id:'must-not-log'}).body,'no');
  const r=JSON.parse(post({...payload,token:'local-test-token',dry_run:true,trace_id:'must-not-log'}).body);assert.equal(r.code,'WOULD_REPAIR');
  e.ctx.doGet({parameter:{...payload,token:'local-test-token'}});assert.equal(e.writes.length,0);assert(!JSON.stringify(e.logs).includes('must-not-log'));
});
test('CONCURRENT_REPAIR_CANNOT_WRITE',()=>{const e=createFirstImportMock(snapshot);e.hooks.beforeRichWrite=()=>{const n=e.writes.length;assert.equal(e.call(payload).code,'LOCK_BUSY');assert.equal(e.writes.length,n);};assert.equal(e.call(payload).code,'REPAIRED');});
console.log(JSON.stringify({tests:count,passed:count,source:'actual 2000-row forensic snapshot',repaired_hash:input.chunks[3].payload_hash,full_staging_rows:3244,levels:input.metadata.expected_levels,operating_writes:0}));
