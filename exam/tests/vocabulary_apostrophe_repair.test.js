'use strict';
// LOCAL ONLY: pinned workbook and previously collected evidence; no HTTP/Google calls.
// The mock proves bounded behavior under a stated one-prefix parser hypothesis.
// It cannot certify Google Sheets' live interpretation of doubled apostrophes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadFirstImport,hash}=require('../../tools/vocabulary-first-import.cjs');
const {createFirstImportMock}=require('./helpers/vocabulary-first-import-mock.cjs');
const input=loadFirstImport(),dir=path.resolve(__dirname,'../../outputs/vocabulary-reclassification/vocab-5c2-forensic');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const evidence=read('OPERATING_FULL_STAGING_SNAPSHOT.json').rows,history=read('OPERATING_AUDIT_METADATA.json');
const currentHash='01cd69c0b9103519fe2aac86abf01cab423ffc4a6bdc15ae89d783d8bb9c3f46';
const canonical=r=>[r[7],r[6],r[4],r[5],r[3],r[8],r[9],r[10],r[11],r[12],'','',r[19],'',r[14],r[15],r[16],r[17],r[18],r[20],r[21]];
const targets=[3204,3228];
const payload={...input.metadata,action:'repairApostropheVocabularyFirstImportV1',approval:'REPAIR_FIRST_IMPORT_LEADING_APOSTROPHE',dry_run:false};
// Only Date serials are adapted to Apps Script service types; text remains exact.
const base=createFirstImportMock();
base.sheets.VocabularyImportStagingV2.rows.push(...evidence.map(r=>{const c=r.slice();assert.equal(typeof c[13],'number');c[13]=new Date(Math.round((c[13]-25569)*86400000));return c;}));
// Metadata-only snapshot is explicit: do not invent uncollected history fields/PII.
const audit={...input.metadata,status:history.status,actual_rows:history.recorded_rows,chunks:history.chunk_hashes,created_at:'fixture-only-history-time'};
const hist=Array(26).fill('');hist[0]=input.metadata.batch_id;hist[3]=audit.status;hist[5]=audit.actual_rows;hist[12]='VOCAB_FIRST_IMPORT_V1:'+JSON.stringify(audit);
base.sheets.VocabularyImportsV2.rows.push(hist);
const snapshot=base.snapshot(),make=()=>createFirstImportMock(snapshot);
const rows=e=>e.sheets.VocabularyImportStagingV2.rows.slice(1).map(canonical);
const state=e=>hash({sheets:e.snapshot(),formats:Object.values(e.sheets).map(s=>s.formats),formulas:Object.values(e.sheets).map(s=>s.formulas)});
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS '+name);}
function zero(e,p,code){const before=state(e),r=e.call(p);assert.equal(r.ok,false);if(code)assert.equal(r.code,code);assert.equal(e.writes.length,0);assert.equal(state(e),before);assert.equal(e.locked(),false);return r;}
function changeAudit(e,fn){const a=e.audit();fn(a);e.sheets.VocabularyImportsV2.rows[1][3]=a.status;e.sheets.VocabularyImportsV2.rows[1][12]='VOCAB_FIRST_IMPORT_V1:'+JSON.stringify(a);}
function oldWrite(e,range,values){range.setNumberFormat('@');range.setValues(values.map(r=>r.map(v=>/^[=+\-@]/.test(v)?'':v)));range.setRichTextValues(values.map(r=>r.map(v=>e.ctx.SpreadsheetApp.newRichTextValue().setText(v).build())));}

test('FULL_PINNED_DATASET_AND_OPERATING_SNAPSHOT_APOSTROPHE_AUDIT',()=>{
  const found=[];input.rows.forEach((r,i)=>r.forEach((v,j)=>{if(typeof v==='string'&&v.startsWith("'"))found.push([i+2,j,Math.floor(i/500)+1]);}));
  assert.deepEqual(found,[[3204,18,7],[3228,18,7]]);assert.equal(evidence.length,3244);
  assert.equal(hash(evidence.slice(3000).map(canonical)),currentHash);
  let diffs=0;evidence.forEach((r,i)=>canonical(r).forEach((v,j)=>{if(v!==input.rows[i][j]){diffs++;assert(targets.includes(i+2));assert.equal(j,18);assert.equal(v,input.rows[i][j].slice(1));}}));assert.equal(diffs,2);
  assert.equal(new Set(evidence.map(r=>r[7])).size,3244);
  assert(evidence.every((r,i)=>r[1]===input.metadata.request_id&&r[2]===i+2));
});
test('SERVER_TARGETS_EQUAL_COMPLETE_PREIMPORT_STRINGS_NOT_EXCERPTS',()=>{
  const t=base.ctx.vocabularyFirstImportApostropheTargetsV1_();assert.equal(t.length,2);
  t.forEach((v,i)=>{assert.equal(v.source_row,targets[i]);assert.equal(v.sense_id,input.rows[v.source_row-2][0]);assert.equal(v.after,input.rows[v.source_row-2][18]);assert.equal(v.before,evidence[v.source_row-2][18]);assert.equal(v.after.charCodeAt(0),39);assert.notEqual(hash(v.before),hash(v.after));});
});
test('OLD_WRITE_PATH_REPRODUCES_TWO_CELL_LOSS_AND_HASH_MISMATCH',()=>{
  const e=make();targets.forEach(n=>oldWrite(e,e.sheets.VocabularyImportStagingV2.getRange(n,19),[[input.rows[n-2][18]]]));
  assert.equal(hash(rows(e).slice(3000)),currentHash);
});
test('NEW_WRITE_PATH_TWO_EXACT_CANONICAL_STRINGS',()=>{
  const e=make();targets.forEach(n=>e.ctx.vocabularyFirstImportTextWriteV1_(e.sheets.VocabularyImportStagingV2.getRange(n,19),[[input.rows[n-2][18]]]));
  assert.equal(hash(rows(e).slice(3000)),input.chunks[6].payload_hash);
});
test('NORMAL_FALSE_FORMULA_LIKE_AND_MULTIPLE_APOSTROPHES',()=>{
  const values=['normal','false','true','','001','=SUM(A1:A2)','+cmd','-12','@text',"'ABC","''ABC","'=formula"];
  const e=make(),s=e.sheets.VocabularyImportStagingV2;
  e.ctx.vocabularyFirstImportTextWriteV1_(s.getRange(2,19,values.length,1),values.map(v=>[v]));
  assert.deepEqual(s.getRange(2,19,values.length,1).getValues(),values.map(v=>[v]));
  assert(s.getRange(2,19,values.length,1).getFormulas().flat().every(v=>v===''));
  assert(e.writes.filter(w=>w.method==='setValues'&&w.rows===1).every(w=>w.row>=11));
});
test('DIFFERENT_STORAGE_SEMANTICS_FAILS_CLOSED_NOT_FALSE_PASS',()=>{
  const e=make();e.hooks.apostropheSemantics='literal';const r=e.call(payload);
  assert.equal(r.ok,false);assert.equal(r.code,'REPAIR_POSTCHECK_FAILED');assert.equal(e.audit().chunks[6],null);
});
test('DRY_RUN_EXACT_PLAN_ZERO_VALUE_FORMAT_HISTORY_AUDIT_WRITES',()=>{
  const e=make(),before=state(e),r=e.call({...payload,dry_run:true});assert.equal(r.code,'WOULD_REPAIR');assert.equal(r.target_count,2);
  assert.equal(r.current_chunk_hash,currentHash);assert.equal(r.expected_repaired_chunk_hash,input.chunks[6].payload_hash);
  r.targets.forEach((t,i)=>{assert.equal(t.cell,'S'+targets[i]);assert.equal(t.before.value,evidence[targets[i]-2][18]);assert.equal(t.after.value,input.rows[targets[i]-2][18]);assert.equal(t.before.type,'string');});
  assert.equal(state(e),before);assert.equal(e.writes.length,0);
});
for(const [name,overrides,code] of [
  ['WRONG_TOKEN',{token:'wrong'},'UNAUTHORIZED'],['WRONG_BATCH',{batch_id:'wrong'},'METADATA_MISMATCH_BATCH_ID'],
  ['WRONG_REQUEST',{request_id:'wrong'},'METADATA_MISMATCH_REQUEST_ID'],['WRONG_MANIFEST',{manifest_sha256:'wrong'},'METADATA_MISMATCH_MANIFEST_SHA256'],
  ['NO_APPROVAL',{approval:undefined},'EXPLICIT_REPAIR_APPROVAL_REQUIRED'],['COMMIT_APPROVAL',{approval:'COMMIT_FIRST_IMPORT'},'EXPLICIT_REPAIR_APPROVAL_REQUIRED'],
  ['NO_DRY_RUN',{dry_run:undefined},'INVALID_DRY_RUN'],['STRING_DRY_RUN',{dry_run:'false'},'INVALID_DRY_RUN']
])test(name,()=>zero(make(),{...payload,...overrides},code));
test('ALL_CLIENT_TARGET_OR_VALUE_OVERRIDES_REJECTED',()=>{
  for(const key of ['cell','sheet','range','source_row','sense_id','field','before','after','new_value','targets','chunk_index'])zero(make(),{...payload,[key]:'override'},'REPAIR_TARGET_MISMATCH');
});
for(const [name,mutate] of [
  ['WRONG_SENSE',e=>e.sheets.VocabularyImportStagingV2.rows[3203][7]='OTHER'],
  ['WRONG_CURRENT_HASH',e=>e.sheets.VocabularyImportStagingV2.rows[3001][5]='changed'],
  ['WRONG_BEFORE_S3204',e=>e.sheets.VocabularyImportStagingV2.rows[3203][18]='wrong'],
  ['WRONG_BEFORE_S3228',e=>e.sheets.VocabularyImportStagingV2.rows[3227][18]='wrong'],
  ['UNEXPECTED_BOOLEAN',e=>e.sheets.VocabularyImportStagingV2.rows[3203][18]=false],
  ['WRONG_CHUNK1',e=>e.sheets.VocabularyImportStagingV2.rows[1][5]='wrong'],
  ['DUPLICATE_SENSE',e=>e.sheets.VocabularyImportStagingV2.rows[3203][7]=e.sheets.VocabularyImportStagingV2.rows[3202][7]],
  ['MISSING_ROW',e=>e.sheets.VocabularyImportStagingV2.rows.pop()],
  ['WRONG_SOURCE',e=>e.sheets.VocabularyImportStagingV2.rows[3203][2]=999],
  ['OTHER_REQUEST',e=>e.sheets.VocabularyImportStagingV2.rows.push(['x','other',1])],
  ['WRONG_GID',e=>e.sheets.VocabularyImportStagingV2.gid=1],
  ['MERGED_TARGET',e=>e.sheets.VocabularyImportStagingV2.merged=[{}]],
  ['TARGET_FORMULA',e=>e.sheets.VocabularyImportStagingV2.formulas['3204,19']='="x"'],
  ['HIDDEN_BLANK_ROW_FORMULA',e=>e.sheets.VocabularyImportStagingV2.formulas['4000,1']='=""'],
  ['NONEMPTY_DB',e=>e.sheets.VocabularyDB.rows.push(['data'])],
  ['DB_BLANK_FORMULA',e=>e.sheets.VocabularyDB.formulas['2,1']='=""'],
  ['HISTORY_COUNT',e=>e.sheets.VocabularyImportsV2.rows[1][5]=3244],
  ['HISTORY_STATUS',e=>changeAudit(e,a=>a.status='STAGED')],
  ['AUDIT_COUNT',e=>changeAudit(e,a=>a.actual_rows=3244)],
  ['AUDIT_CHUNK1',e=>changeAudit(e,a=>a.chunks[0]='wrong')],
  ['AUDIT_CHUNK7',e=>changeAudit(e,a=>a.chunks[6]=input.chunks[6].payload_hash)],
  ['AUDIT_FAILURE',e=>changeAudit(e,a=>a.error_code='FAILED')]
])test(name+'_ZERO_WRITE',()=>{const e=make();mutate(e);zero(e,payload);});
for(const n of targets)test('ONE_ALREADY_CANONICAL_'+n+'_ZERO_WRITE',()=>{
  const e=make();e.sheets.VocabularyImportStagingV2.rows[n-1][18]=input.rows[n-2][18];zero(e,payload,'PARTIAL_REPAIR_STATE');
});
const repaired=make();
test('SUCCESS_EXACTLY_TWO_DISTINCT_CELLS_ALL_OTHER_VALUES_FORMATS_HISTORY_UNCHANGED',()=>{
  const before=repaired.snapshot(),sh=repaired.sheets.VocabularyImportStagingV2;sh.formats['3204,18']='neighbor';
  const r=repaired.call(payload);assert.equal(r.code,'REPAIRED');assert.equal(r.full_rows_exact,true);
  assert.equal(hash(rows(repaired)),hash(input.rows));assert.equal(r.repaired_chunk_hash,input.chunks[6].payload_hash);
  const changed=[];before.VocabularyImportStagingV2.forEach((row,i)=>row.forEach((v,j)=>{if(hash(v)!==hash(sh.rows[i][j]))changed.push([i+1,j+1]);}));
  assert.deepEqual(changed,[[3204,19],[3228,19]]);
  assert(repaired.writes.every(w=>w.sheet==='VocabularyImportStagingV2'&&targets.includes(w.row)&&w.column===19&&w.rows===1&&w.columns===1));
  assert.deepEqual(sh.formats,{'3204,18':'neighbor','3204,19':'@','3228,19':'@'});
  assert.deepEqual(repaired.sheets.VocabularyImportsV2.rows,before.VocabularyImportsV2);assert.deepEqual(repaired.sheets.VocabularyDB.rows,before.VocabularyDB);
  assert.equal(repaired.audit().actual_rows,3000);assert.equal(repaired.audit().chunks[6],null);
});
test('IDEMPOTENT_SECOND_CALL_AND_DRY_RUN_ZERO_WRITES',()=>{
  repaired.writes.length=0;const before=state(repaired);assert.equal(repaired.call(payload).code,'ALREADY_REPAIRED');
  assert.equal(repaired.call({...payload,dry_run:true}).code,'ALREADY_REPAIRED');assert.equal(state(repaired),before);assert.equal(repaired.writes.length,0);
});
test('SECOND_CELL_FAILURE_DETECTED_AND_RETRY_BLOCKED',()=>{
  const e=make();e.hooks.beforeFormat=(name,r)=>{if(r===3228)throw Error('fixture partial failure');};
  assert.equal(e.call(payload).code,'PARTIAL_REPAIR_DETECTED');assert.equal(e.audit().chunks[6],null);assert.equal(e.audit().actual_rows,3000);
  assert.equal(e.sheets.VocabularyImportStagingV2.rows[3203][18],input.rows[3202][18]);
  assert.equal(e.sheets.VocabularyImportStagingV2.rows[3227][18],evidence[3226][18]);
  e.writes.length=0;zero(e,payload,'PARTIAL_REPAIR_STATE');
});
test('FIRST_CELL_FAILURE_NO_SECOND_CELL_WRITE',()=>{
  const e=make();e.hooks.beforeFormat=()=>{throw Error('fixture failure');};assert.equal(e.call(payload).code,'REPAIR_POSTCHECK_FAILED');
  assert(e.writes.every(w=>w.row===3204));assert.equal(e.audit().chunks[6],null);
});
test('POSTWRITE_FORMULA_FAILS_WITHOUT_AUDIT_RECOVERY',()=>{
  const e=make();e.hooks.afterWrite=name=>{if(name==='VocabularyImportStagingV2')e.sheets[name].formulas['3228,19']='="x"';};
  const r=e.call(payload);assert.equal(r.ok,false);assert.equal(e.audit().chunks[6],null);
});
test('UNEXPECTED_NEIGHBOR_CHANGE_DETECTED_IN_PHYSICAL_SNAPSHOT',()=>{
  const e=make();e.hooks.afterWrite=()=>{e.sheets.VocabularyImportStagingV2.rows[1][13]=new Date(0);};
  assert.equal(e.call(payload).code,'REPAIR_POSTCHECK_FAILED');assert.equal(e.audit().chunks[6],null);
});
test('UNEXPECTED_HISTORY_CHANGE_DETECTED_WITHOUT_RECOVERY_WRITE',()=>{
  const e=make();e.hooks.afterWrite=()=>{e.sheets.VocabularyImportsV2.rows[1][5]=3244;};
  assert.equal(e.call(payload).code,'REPAIR_POSTCHECK_FAILED');assert(e.writes.every(w=>w.sheet==='VocabularyImportStagingV2'));
});
test('CONCURRENT_REPAIR_LOCK_BUSY',()=>{
  const e=make();e.hooks.beforeFormat=()=>{const n=e.writes.length;assert.equal(e.call(payload).code,'LOCK_BUSY');assert.equal(e.writes.length,n);};assert.equal(e.call(payload).code,'REPAIRED');
});
test('POST_AUTH_ROUTING_GET_CANNOT_REPAIR_NO_SECRET_LOG',()=>{
  const e=make(),post=p=>e.ctx.doPost({postData:{contents:JSON.stringify(p)}});
  assert.equal(post({...payload,token:'wrong'}).body,'no');
  assert.equal(JSON.parse(post({...payload,token:'local-test-token',dry_run:true}).body).code,'WOULD_REPAIR');
  e.ctx.doGet({parameter:{...payload,token:'local-test-token'}});assert.equal(e.writes.length,0);assert(!JSON.stringify(e.logs).includes('local-test-token'));
});
test('UNREPAIRED_REPLAY_STILL_BLOCKED',()=>zero(make(),input.chunks[6],'CHUNK_CONFLICT'));
test('REPAIRED_CHUNK7_REPLAY_APPEND_ZERO_AUDIT_RECOVERY',()=>{
  const before=hash(repaired.sheets.VocabularyImportStagingV2.rows);const r=repaired.call(input.chunks[6]);assert.equal(r.code,'ACCEPTED');
  assert.equal(hash(repaired.sheets.VocabularyImportStagingV2.rows),before);assert(repaired.writes.every(w=>w.sheet==='VocabularyImportsV2'));
  assert.equal(repaired.audit().actual_rows,3244);assert.equal(repaired.audit().status,'STAGED');assert.equal(repaired.audit().chunks[6],input.chunks[6].payload_hash);
  repaired.writes.length=0;assert.equal(repaired.call(input.chunks[6]).code,'ALREADY_ACCEPTED');assert.equal(repaired.writes.length,0);
});
test('FULL_VALIDATION_SIMULATION_PASS_DB_ZERO',()=>{
  const r=repaired.call({...input.metadata,action:'validateVocabularyFirstImportV1'});assert.equal(r.code,'VALIDATED');
  assert.equal(r.summary.total,3244);assert.equal(r.summary.unique_sense_ids,3244);assert.equal(hash(r.summary.levels),hash(input.metadata.expected_levels));
  assert.equal(r.summary.row_fingerprints,'PASS');assert.equal(repaired.sheets.VocabularyDB.rows.length,1);
});
console.log(JSON.stringify({tests,passed:tests,leading_apostrophe_cells:2,field_counts:{selection_reason:2},chunk_counts:{7:2},full_rows:3244,repaired_chunk7_hash:input.chunks[6].payload_hash,operating_requests:0,operating_writes:0,live_round_trip:'NOT_VERIFIED'}));
