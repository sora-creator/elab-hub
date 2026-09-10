'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const {loadFirstImport,hash} = require('../../tools/vocabulary-first-import.cjs');
const {createFirstImportMock} = require('./helpers/vocabulary-first-import-mock.cjs');
const input = loadFirstImport();
const evidence = JSON.parse(fs.readFileSync('outputs/vocabulary-reclassification/vocab-5d3/DB_READBACK.json','utf8'));
const audit = JSON.parse(fs.readFileSync('outputs/vocabulary-reclassification/vocab-5d3/FINAL_HISTORY.json','utf8')).audit;
const baseline = evidence.rows.map(row=>row.map((v,c)=>c===10||c===11?new Date(audit.batch_timestamp):v));
assert.strictEqual(hash(baseline.map(r=>r.map((v,c)=>c===10||c===11?'':v))),input.manifest.canonical_rows_sha256);
assert.strictEqual(hash(baseline),audit.post_hash);
const make = () => createFirstImportMock({VocabularyDB:[evidence.headers,...baseline]});
const item = {sense_id:'SEN_LOCAL_NEW',vocab_id:baseline[0][1],word:baseline[0][2],meaning:'new distinct sense',confirmed_level:'V2'};
const add = (extra={}) => ({action:'createVocabularyDbItemV1',token:'local-test-token',request_id:'local-add-1',item:{...item},...extra});
const update = (env,changes,extra={}) => ({action:'updateVocabularyDbItemV1',token:'local-test-token',request_id:'local-update-1',sense_id:item.sense_id,
  expected_current_fingerprint:hash(env.sheets.VocabularyDB.rows.find(r=>r[0]===(extra.sense_id||item.sense_id)) || []),changes,...extra});
const call = (env,payload) => env.ctx.handleVocabularyDbMutationV1_(payload);
let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name);}
function denied(env,payload,code){const before=hash(env.snapshot()),props=hash(env.properties);env.writes.length=0;env.propertyWrites.length=0;const out=call(env,payload);assert.strictEqual(out.code,code,JSON.stringify(out));assert.strictEqual(out.ok,false);assert.strictEqual(env.writes.length,0);assert.strictEqual(env.propertyWrites.length,0);assert.strictEqual(hash(env.snapshot()),before);assert.strictEqual(hash(env.properties),props);}
const env=make();
test('3244 baseline ADD one distinct sense sharing existing vocab_id/headword',()=>{
  assert.strictEqual(call(env,add()).code,'CREATED');
  assert.strictEqual(env.sheets.VocabularyDB.rows.length,3246);
  assert.strictEqual(new Set(env.sheets.VocabularyDB.rows.slice(1).map(r=>r[0])).size,3245);
  assert.strictEqual(hash(env.sheets.VocabularyDB.rows.slice(1,3245)),hash(baseline));
});
test('ADD exact receipt replay write zero, order-independent payload keys',()=>{
  env.writes.length=0;env.propertyWrites.length=0;
  const replay=add({item:Object.fromEntries(Object.entries(item).reverse())});
  assert.strictEqual(call(env,replay).code,'ALREADY_CREATED');assert.strictEqual(env.writes.length,0);assert.strictEqual(env.propertyWrites.length,0);
});
test('same request different payload is conflict',()=>denied(env,add({item:{...item,meaning:'changed'}}),'REQUEST_CONFLICT'));
test('new request existing identity is duplicate',()=>denied(env,add({request_id:'different'}),'DUPLICATE_SENSE_ID'));
for(const level of ['', 'V6','v2','CONTEXT_ONLY','NOT_SELECTED'])test('invalid level '+level,()=>denied(make(),add({item:{...item,confirmed_level:level}}),'VALIDATION_ERROR'));
for(const field of ['sense_id','vocab_id','word','meaning','confirmed_level'])test('required '+field,()=>{const fields={...item};delete fields[field];denied(make(),add({item:fields}),'VALIDATION_ERROR');});
for(const fields of [{archive_only:true},{curriculum_active:false},{created_at:'spoof'},{sense_order:0},{occurrence_count:-1},{selection_score:'1'}])test('reject unsupported/source-pool or malformed metadata '+Object.keys(fields)[0],()=>denied(make(),add({item:{...item,...fields}}),'VALIDATION_ERROR'));
test('meaning/word/level UPDATE only target, derived levels aligned',()=>{
  const previous=structuredClone(env.sheets.VocabularyDB.rows.at(-1));
  const result=call(env,update(env,{word:'new word',meaning:'new meaning',confirmed_level:'V3'}));assert.strictEqual(result.code,'UPDATED');
  const row=env.sheets.VocabularyDB.rows.at(-1);assert.strictEqual(row[2],'new word');assert.strictEqual(row[3],'new meaning');[4,15,19].forEach(c=>assert.strictEqual(row[c],'V3'));
  row.forEach((v,c)=>{if(![2,3,4,11,15,19].includes(c))assert.deepStrictEqual(v,previous[c]);});
  assert.strictEqual(result.fingerprint,hash(row));assert.strictEqual(hash(env.sheets.VocabularyDB.rows.slice(1,3245)),hash(baseline));assert.strictEqual(env.sheets.VocabularyDB.rows.length,3246);
});
test('stale fingerprint rejects before any write',()=>denied(env,update(env,{meaning:'stale'},{request_id:'stale',expected_current_fingerprint:'0'.repeat(64)}),'STALE_UPDATE'));
test('identity cannot be changed in changes',()=>denied(env,update(env,{sense_id:'renamed'},{request_id:'rename'}),'VALIDATION_ERROR'));
test('unknown sense cannot be silently created',()=>denied(env,update(env,{meaning:'x'},{request_id:'missing',sense_id:'MISSING'}),'NOT_FOUND'));
test('invalid UPDATE level',()=>denied(env,update(env,{confirmed_level:'ARCHIVE'},{request_id:'level'}),'VALIDATION_ERROR'));
test('internal/source metadata cannot be overwritten',()=>denied(env,update(env,{vocab_id:'new',occurrence_count:99},{request_id:'internal'}),'VALIDATION_ERROR'));
test('authenticated item READ exposes exact fingerprint, no writes',()=>{
  env.writes.length=0;
  const result=env.ctx.handleGetVocabularyDbItemV1_({parameter:{token:'local-test-token',sense_id:item.sense_id}});
  assert.strictEqual(result.ok,true);assert.strictEqual(result.fingerprint,hash(env.sheets.VocabularyDB.rows.at(-1)));assert.strictEqual(env.writes.length,0);
});
test('UPDATE replay and conflict survive a new execution context',()=>{
  const e=make();call(e,add());const payload=update(e,{meaning:'persisted'});
  const first=call(e,payload);assert.strictEqual(first.code,'UPDATED');
  const fresh=createFirstImportMock(e.snapshot());Object.assign(fresh.properties,e.properties);
  assert.strictEqual(call(fresh,payload).code,'ALREADY_UPDATED');assert.strictEqual(fresh.writes.length,0);assert.strictEqual(fresh.propertyWrites.length,0);
  denied(fresh,{...payload,changes:{meaning:'different'}},'REQUEST_CONFLICT');
  assert.strictEqual(call(fresh,add()).code,'ALREADY_CREATED');assert.strictEqual(fresh.writes.length,0);
});
test('UPDATE partial write blocks subsequent writes without touching other rows',()=>{
  const e=make();call(e,add());const payload=update(e,{meaning:'will fail'});
  e.hooks.beforeFormat=()=>{throw Error('fixture');};
  assert.strictEqual(call(e,payload).code,'PARTIAL_WRITE_DETECTED');
  assert.strictEqual(hash(e.sheets.VocabularyDB.rows.slice(1,3245)),hash(baseline));
  denied(e,payload,'PARTIAL_WRITE_DETECTED');
});
for(const value of ["'ABC","''ABC",'false','true','001','=1+1','+1','-1','@SUM(A1)','ordinary'])test('ADD and UPDATE preserve literal '+value,()=>{
  const e=make();e.hooks.scalarCoercion=v=>/^\d+$/.test(v)?Number(v):v;
  const created=call(e,add({item:{...item,word:value,meaning:value,selection_reason:value}}));assert.strictEqual(created.code,'CREATED');
  let row=e.sheets.VocabularyDB.rows.at(-1);[2,3,18].forEach(c=>assert.strictEqual(row[c],value));assert.strictEqual(created.fingerprint,hash(row));
  const changed=call(e,update(e,{meaning:value+'!',word:value,selection_reason:value}));assert.strictEqual(changed.code,'UPDATED');row=e.sheets.VocabularyDB.rows.at(-1);assert.strictEqual(row[3],value+'!');assert.strictEqual(row[18],value);assert.strictEqual(changed.fingerprint,hash(row));assert.strictEqual(Object.keys(e.sheets.VocabularyDB.formulas).length,0);
  assert(row[10] instanceof Date && row[11] instanceof Date);assert.strictEqual(typeof row[9],'boolean');assert.strictEqual(typeof row[6],'number');
});
test('write scope only DB target and request Properties; no import access',()=>{
  const e=make();call(e,add());assert(e.writes.every(w=>w.sheet==='VocabularyDB'&&w.row===3246&&w.rows===1&&w.column+w.columns-1<=21));
  assert(!e.operations.some(o=>o.sheet==='VocabularyImportsV2'||o.sheet==='VocabularyImportStagingV2'));
  assert.strictEqual(e.operations.filter(o=>o.method==='getDataRange').length,1);
  const text=[0,1,2,3,4,5,12,13,15,18,19,20];for(const w of e.writes.filter(w=>w.method==='setNumberFormat'))for(let c=w.column-1;c<w.column-1+w.columns;c++)assert(text.includes(c));
});
for(const mode of ['partial','corrupt','formula','receipt'])test('uncertain '+mode+' blocks retry/new request with zero further writes',()=>{
  const e=make();
  if(mode==='partial')e.hooks.beforeRichWrite=()=>{throw Error('fixture');};
  if(mode==='corrupt')e.hooks.afterRichWrite=()=>{e.sheets.VocabularyDB.rows.at(-1)[3]='corrupt';};
  if(mode==='formula')e.hooks.afterRichWrite=()=>{e.sheets.VocabularyDB.formulas['3246,3']='=1';};
  if(mode==='receipt')e.hooks.propertyWrite=(key,value)=>{if(value.includes('COMPLETED'))throw Error('fixture quota');};
  assert.strictEqual(call(e,add()).code,'PARTIAL_WRITE_DETECTED');
  assert(e.properties.VOCAB_DB_PENDING_V1);
  denied(e,add(),'PARTIAL_WRITE_DETECTED');
  denied(e,add({request_id:'new-retry',item:{...item,sense_id:'another'}}),'PARTIAL_WRITE_DETECTED');
});
test('existing partial rows, formulas, bad header and insufficient capacity reject',()=>{
  for(const mutate of [e=>e.sheets.VocabularyDB.rows.push(['','', 'partial']),e=>e.sheets.VocabularyDB.formulas['2,3']='=1',e=>e.sheets.VocabularyDB.rows.push(e.sheets.VocabularyDB.rows[1].slice())]){const e=make();mutate(e);denied(e,add(),'DB_INTEGRITY_ERROR');}
  const e=make();e.sheets.VocabularyDB.rows[0][0]='sense_ID';denied(e,add(),'SCHEMA_MISMATCH');
  const full=make();full.sheets.VocabularyDB.maxRows=3245;denied(full,add(),'CAPACITY_OR_RANGE_ERROR');
});
test('concurrent nested ADD loses lock with zero writes',()=>{
  const e=make();let checked=0;e.hooks.beforeScalarWrite=()=>{const n=e.writes.length;assert.strictEqual(call(e,add()).code,'LOCK_BUSY');assert.strictEqual(e.writes.length,n);checked++;};
  assert.strictEqual(call(e,add()).code,'CREATED');assert(checked>0);assert.strictEqual(e.locked(),false);
});
for(const token of [undefined,'','invalid'])test('public/student invalid auth '+String(token),()=>{const e=make();denied(e,add({token}),'UNAUTHORIZED');assert.strictEqual(e.ctx.doPost({postData:{contents:JSON.stringify(add({token}))}}).body,'no');assert.strictEqual(e.writes.length,0);});
test('router authenticated JSON response; no trace/secret logging',()=>{
  const e=make();const result=JSON.parse(e.ctx.doPost({postData:{contents:JSON.stringify(add())}}).body);assert.strictEqual(result.code,'CREATED');assert.strictEqual(e.logs.length,0);
});
test('actual set builder/fetch use snapshots across incremental DB update',()=>{
  const e=make(),ctx=e.ctx;let seq=0;ctx.Utilities.getUuid=()=>`fixture-${++seq}`;
  e.properties.DEFAULT_TEACHER_ID='fixture-teacher';e.addSheet(ctx.TEACHERS_V2_SHEET,ctx.TEACHERS_V2_HEADERS).rows.push(['fixture-teacher','fixture','fixture',true,new Date(),new Date()]);
  for(const [name,headers] of [[ctx.VOCAB_SETS_V2_SHEET,ctx.VOCAB_SETS_V2_HEADERS],[ctx.VOCAB_SET_ITEMS_V2_SHEET,ctx.VOCAB_SET_ITEMS_V2_HEADERS],[ctx.WORDS_V2_SHEET,ctx.WORDS_V2_HEADERS]])e.addSheet(name,headers);
  ctx.getOrCreateSheet_=(name)=>{assert(e.sheets[name]);return e.sheets[name];};
  const original=baseline[0];assert(ctx.handleCreateVocabularySetV1_({token:'local-test-token',request_id:'fixture-set',sense_ids:[original[0]],selection_type:'manual',session_key:'fixture-session',title:'fixture'}).body.startsWith('ok:'));
  const snap=hash(e.sheets.VocabSetItemsV2.rows);ctx.validateAssignmentLaunchV2_=()=>true;ctx.attemptContextForFetchV2_=()=>({});
  const fetch=()=>ctx.handleFetchVocabularySetV1_({parameter:{key:'fixture-session',assignment_target_id:'fixture-target'}});
  const before=hash(fetch());
  assert.strictEqual(call(e,{...update(e,{meaning:'changed after assignment'},{sense_id:original[0],expected_current_fingerprint:hash(original)})}).code,'UPDATED');
  assert.strictEqual(hash(e.sheets.VocabSetItemsV2.rows),snap);assert.strictEqual(hash(fetch()),before);
});
console.log(JSON.stringify({tests:n,passed:n,baseline:3244,after_add:3245,after_update:3245,baseline_changes:0,operating_writes:0}));
