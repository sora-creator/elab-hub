'use strict';
const assert=require('assert'),fs=require('fs'),crypto=require('crypto');
const {createFirstImportMock}=require('./helpers/vocabulary-first-import-mock.cjs');
const {hash}=require('../../tools/vocabulary-first-import.cjs');
// Read-only copy of the completed VOCAB-6D operating snapshot. Never contacts Google.
const raw=JSON.parse(fs.readFileSync('outputs/vocabulary-reclassification/vocab-6d/POST_DB.json','utf8'));
assert.strictEqual(raw.length,3245);
const baseline=raw.map(row=>row.map((v,c)=>[10,11].includes(c)?new Date(Math.round((v-25569)*86400000-9*3600000)):v));
const id='SEN_F569181B855E',canonical=baseline.find(row=>row[0]===id),second=baseline[0][0];
assert.strictEqual(canonical[2],'encompass');assert.strictEqual(canonical[19],'V3');
const names=['VocabularyDB','VocabSetsV2','VocabSetItemsV2','WordsV2','TeachersV2'];
function make(){
  const e=createFirstImportMock(),c=e.ctx;let uuids=0;
  c.Utilities.getUuid=()=>{uuids++;return crypto.randomUUID();};e.uuidCount=()=>uuids;
  e.sheets.VocabularyDB.rows=[Array.from(c.VOCABULARY_DB_HEADERS),...structuredClone(baseline)];
  for(const [name,headers] of [['TeachersV2',c.TEACHERS_V2_HEADERS],['VocabSetsV2',c.VOCAB_SETS_V2_HEADERS],['VocabSetItemsV2',c.VOCAB_SET_ITEMS_V2_HEADERS],['WordsV2',c.WORDS_V2_HEADERS],['AssignmentsV2',c.ASSIGNMENTS_V2_HEADERS],['AssignmentTargetsV2',c.ASSIGNMENT_TARGETS_V2_HEADERS],['HomeworkBatchesV2',c.HOMEWORK_BATCHES_V2_HEADERS],['HomeworkBatchAssignmentsV2',c.HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS]])e.addSheet(name,headers);
  e.properties.DEFAULT_TEACHER_ID='fixture-teacher';
  e.sheets.TeachersV2.rows.push(['fixture-teacher','fixture-account','fixture',true,new Date(),new Date()]);
  e.sheets.WordsV2.rows.push(['unrelated','old-set','unrelated','untouched',true,new Date(0),new Date(0)]);
  return e;
}
const request=(extra={})=>({action:'createVocabularySetV1',token:'local-test-token',request_id:'fixture-set-create',title:'VOCAB-7C encompass simulation',level:'V3',selection_type:'manual',sense_ids:[id],...extra});
const call=(e,p=request())=>e.ctx.handleCreateVocabularySetV1_(p).body;
const compatibility=(row=canonical)=>[row[0],'previous-set',row[2],row[3],true,new Date(0),new Date(0)];
function denied(e,p,code){const before=hash(e.snapshot()),props=hash(e.properties);assert.strictEqual(call(e,p),code);assert.strictEqual(hash(e.snapshot()),before);assert.strictEqual(hash(e.properties),props);assert.strictEqual(e.writes.length,0);assert.strictEqual(e.propertyWrites.length,0);}
function unchanged(e,before){for(const n of Object.keys(before))if(!['VocabSetsV2','VocabSetItemsV2','WordsV2'].includes(n))assert.strictEqual(hash(e.sheets[n].rows),hash(before[n]),n);}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('3245 baseline: missing encompass -> bounded +1/+1/+1, identity/order/types exact',()=>{
  const e=make(),before=e.snapshot(),out=call(e);assert(out.startsWith('ok:'));const setId=out.split(':')[1];
  assert.strictEqual(e.sheets.VocabSetsV2.rows.length,2);assert.strictEqual(e.sheets.VocabSetItemsV2.rows.length,2);assert.strictEqual(e.sheets.WordsV2.rows.length,3);
  const item=e.sheets.VocabSetItemsV2.rows[1];assert.strictEqual(item.length,9);assert.deepStrictEqual(item.slice(5),[id,canonical[2],canonical[3],'V3']);assert.strictEqual(item[2],id);assert.strictEqual(item[3],1);assert(item[4] instanceof Date);assert.strictEqual(item[1],setId);
  assert.strictEqual(e.sheets.VocabSetsV2.rows[1][3],request().title);assert.strictEqual(e.sheets.VocabSetsV2.rows[1][15],1);
  assert.strictEqual(hash(e.sheets.WordsV2.rows.slice(0,2)),hash(before.WordsV2));unchanged(e,before);
  assert(e.writes.every(w=>['WordsV2','VocabSetsV2','VocabSetItemsV2'].includes(w.sheet)&&w.row>1));
  assert(e.writes.filter(w=>w.sheet==='WordsV2').every(w=>w.row===3&&w.rows===1));
  assert(!e.operations.some(x=>/insert|delete/i.test(x.method)));
});
test('exact WordsV2 row reused with original set link/timestamps, zero Words writes',()=>{const e=make();e.sheets.WordsV2.rows.push(compatibility());const before=hash(e.sheets.WordsV2.rows);assert(call(e).startsWith('ok:'));assert.strictEqual(hash(e.sheets.WordsV2.rows),before);assert(!e.writes.some(w=>w.sheet==='WordsV2'));});
for(const [label,change] of [['term',r=>r[2]='other'],['meaning',r=>r[3]='other'],['active',r=>r[4]=false],['timestamp type',r=>r[5]='not-a-date']])test('compatibility conflict '+label+' -> all writes zero',()=>{const e=make(),r=compatibility();change(r);e.sheets.WordsV2.rows.push(r);denied(e,request(),'WORD_COMPAT_CONFLICT');});
test('duplicate compatibility IDs rejected',()=>{const e=make();e.sheets.WordsV2.rows.push(compatibility(),compatibility());denied(e,request(),'WORD_COMPAT_CONFLICT');});
test('two items mixed exact/missing and input dedupe preserve first order',()=>{const e=make();e.sheets.WordsV2.rows.push(compatibility());assert(call(e,request({sense_ids:[id,id,second]})).startsWith('ok:'));assert.strictEqual(e.sheets.WordsV2.rows.length,4);assert.deepStrictEqual(e.sheets.VocabSetItemsV2.rows.slice(1).map(r=>[r[5],r[3]]),[[id,1],[second,2]]);});
test('500-item boundary uses bounded ranges and exact order',()=>{const e=make(),ids=baseline.slice(0,500).map(r=>r[0]);assert(call(e,request({sense_ids:ids})).startsWith('ok:'));assert.deepStrictEqual(e.sheets.VocabSetItemsV2.rows.slice(1).map(r=>r[5]),ids);assert.strictEqual(e.sheets.WordsV2.rows.length,502);assert(e.writes.filter(w=>w.sheet==='WordsV2').every(w=>w.row===3&&w.rows<=500));});
test('10 requested, 7 exact: append only 3 compatibility rows',()=>{const e=make(),rows=baseline.slice(0,10);e.sheets.WordsV2.rows.push(...rows.slice(0,7).map(compatibility));const before=hash(e.sheets.WordsV2.rows);assert(call(e,request({sense_ids:rows.map(r=>r[0])})).startsWith('ok:'));assert.strictEqual(hash(e.sheets.WordsV2.rows.slice(0,9)),before);assert.strictEqual(e.sheets.WordsV2.rows.length,12);assert(e.writes.filter(w=>w.sheet==='WordsV2').every(w=>w.row===10&&w.rows===3));});
for(const [label,p,code] of [
  ['missing sense',request({sense_ids:[id,'missing']}),'VOCAB_SENSE_NOT_FOUND'],['empty',request({sense_ids:[]}),'bad selection'],['over 500',request({sense_ids:baseline.slice(0,501).map(r=>r[0])}),'bad selection'],
  ['bad token',request({token:'wrong'}),'UNAUTHORIZED'],['empty token',request({token:''}),'UNAUTHORIZED'],['missing request',request({request_id:undefined}),'INVALID_REQUEST_ID'],['bad request',request({request_id:'bad/id'}),'INVALID_REQUEST_ID'],['empty title',request({title:' '}),'INVALID_SET_NAME'],['oversize title',request({title:'x'.repeat(201)}),'INVALID_SET_NAME'],['bad level',request({level:'V6'}),'SET_VALIDATION_ERROR'],['invalid id',request({sense_ids:[' bad ']}),'bad selection']
])test(label+' -> all writes zero',()=>denied(make(),p,code));
for(const name of names){
  test('missing schema '+name,()=>{const e=make();delete e.sheets[name];denied(e,request(),'SET_SCHEMA_NOT_READY');});
  test('wrong header '+name,()=>{const e=make();e.sheets[name].rows[0][0]='wrong';denied(e,request(),'SET_SCHEMA_NOT_READY');});
}
test('missing teacher context',()=>{const e=make();delete e.properties.DEFAULT_TEACHER_ID;denied(e,request(),'SET_TEACHER_NOT_READY');});
test('inactive teacher context',()=>{const e=make();e.sheets.TeachersV2.rows[1][3]=false;denied(e,request(),'SET_TEACHER_NOT_READY');});
test('invalid snapshot type rejected before write',()=>{const e=make();e.sheets.VocabularyDB.rows.find(r=>r[0]===id)[2]=false;denied(e,request(),'SET_VALIDATION_ERROR');});
test('inactive sense rejected',()=>{const e=make();e.sheets.VocabularyDB.rows.find(r=>r[0]===id)[9]=false;denied(e,request(),'invalid sense');});
test('capacity preflight before any write',()=>{const e=make();e.sheets.VocabSetItemsV2.maxRows=1;denied(e,request(),'SET_CAPACITY_NOT_READY');});
test('formula in target preflight',()=>{const e=make();e.sheets.WordsV2.formulas['2,3']='=1';denied(e,request(),'SET_DATA_NOT_READY');});
test('same request completed replay: stable result, no UUID, no sheet/property writes',()=>{const e=make(),out=call(e),state=hash(e.snapshot()),props=hash(e.properties),n=e.uuidCount();e.writes.length=e.propertyWrites.length=0;assert.strictEqual(call(e),out);assert.strictEqual(e.uuidCount(),n);assert.strictEqual(hash(e.snapshot()),state);assert.strictEqual(hash(e.properties),props);assert.strictEqual(e.writes.length+e.propertyWrites.length,0);});
test('same request different payload -> conflict, no writes',()=>{const e=make();call(e);e.writes.length=e.propertyWrites.length=0;denied(e,request({title:'different'}),'REQUEST_CONFLICT');});
test('completed receipt survives a fresh runtime',()=>{const e=make(),out=call(e),fresh=make();Object.assign(fresh.properties,e.properties);assert.strictEqual(call(fresh),out);assert.strictEqual(fresh.uuidCount(),0);assert.strictEqual(fresh.writes.length+fresh.propertyWrites.length,0);});
test('concurrent invocation blocked by script lock',()=>{const e=make();let checked=false;e.hooks.beforeScalarWrite=()=>{if(checked)return;checked=true;assert.strictEqual(call(e,request({request_id:'concurrent'})),'LOCK_BUSY');};assert(call(e).startsWith('ok:'));assert(checked);});
for(const target of ['WordsV2','VocabSetsV2','VocabSetItemsV2'])test('partial failure '+target+' blocks same and new request, no duplicate',()=>{
  const e=make();e.hooks.beforeScalarWrite=name=>{if(name===target)throw Error('injected');};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');
  if(target==='WordsV2')assert(!e.writes.some(w=>w.sheet==='VocabSetsV2'||w.sheet==='VocabSetItemsV2'));
  if(target==='VocabSetsV2')assert(!e.writes.some(w=>w.sheet==='VocabSetItemsV2'));
  const before=hash(e.snapshot()),n=e.uuidCount();e.writes.length=e.propertyWrites.length=0;delete e.hooks.beforeScalarWrite;
  assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert.strictEqual(call(e,request({request_id:'new-after-partial'})),'PARTIAL_SET_CREATE');assert.strictEqual(e.uuidCount(),n);assert.strictEqual(e.writes.length+e.propertyWrites.length,0);assert.strictEqual(hash(e.snapshot()),before);
});
test('Words read-back mismatch stops before set writes',()=>{const e=make();e.hooks.afterRichWrite=name=>{if(name==='WordsV2')e.sheets.WordsV2.rows.at(-1)[3]='CORRUPTED';};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert(!e.writes.some(w=>w.sheet==='VocabSetsV2'));});
test('item post-read mismatch never returns success',()=>{const e=make();e.hooks.afterRichWrite=name=>{if(name==='VocabSetItemsV2')e.sheets.VocabSetItemsV2.rows.at(-1)[8]='V5';};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');});
test('partially stored Words scalar row remains blocked without set write',()=>{const e=make();e.sheets.WordsV2.failAfter=1;assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert(e.sheets.WordsV2.rows.length>2);assert.strictEqual(e.sheets.VocabSetsV2.rows.length,1);e.writes.length=0;assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert.strictEqual(e.writes.length,0);});
test('Date replaced with identical ISO string is a type mismatch',()=>{const e=make();e.hooks.afterRichWrite=name=>{if(name==='VocabSetItemsV2'){const r=e.sheets.VocabSetItemsV2.rows.at(-1);r[4]=r[4].toISOString();}};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');});
test('COMPLETED receipt failure forbids success and duplicate retry',()=>{const e=make();e.hooks.propertyWrite=(key,value)=>{if(key.startsWith('VOCAB_SET_REQUEST_')&&JSON.parse(value).state==='COMPLETED')throw Error('property failure');};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert.strictEqual(e.sheets.VocabSetsV2.rows.length,2);e.writes.length=e.propertyWrites.length=0;assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert.strictEqual(e.writes.length+e.propertyWrites.length,0);});
test('unrelated Words row corruption detected',()=>{const e=make();e.hooks.afterRichWrite=name=>{if(name==='WordsV2')e.sheets.WordsV2.rows[1][3]='CORRUPTED';};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');assert(!e.writes.some(w=>w.sheet==='VocabSetsV2'));});
test('DB mutation during write detected',()=>{const e=make();e.hooks.afterRichWrite=name=>{if(name==='VocabSetItemsV2')e.sheets.VocabularyDB.rows[1][3]='CORRUPTED';};assert.strictEqual(call(e),'PARTIAL_SET_CREATE');});
for(const literal of ["'literal",'false','001','=1+1','+SUM(A1)','-1','@test'])test('text preservation '+literal,()=>{const e=make(),r=e.sheets.VocabularyDB.rows.find(r=>r[0]===id);r[2]=r[3]=literal;assert(call(e,request({title:literal})).startsWith('ok:'));assert.strictEqual(e.sheets.WordsV2.rows.at(-1)[2],literal);assert.strictEqual(e.sheets.VocabSetItemsV2.rows.at(-1)[7],literal);assert.strictEqual(e.sheets.VocabSetsV2.rows.at(-1)[3],literal);assert(Object.values(e.sheets).every(s=>!Object.keys(s.formulas).length));});
test('snapshot independence and actual student fetch, review metadata consumer',()=>{
  const e=make(),out=call(e);assert(out.startsWith('ok:'));const snapshot=hash(e.sheets.VocabSetItemsV2.rows);
  e.ctx.validateAssignmentLaunchV2_=()=>true;e.ctx.attemptContextForFetchV2_=()=>({});
  const fetch=()=>e.ctx.handleFetchVocabularySetV1_({parameter:{key:out.split(':')[2],assignment_target_id:'fixture-target'}});
  const before=hash(fetch());assert.strictEqual(fetch().payload.w[0].k,canonical[3]);
  const r=e.sheets.VocabularyDB.rows.find(r=>r[0]===id);r[3]='TEST_CHANGED';r[4]=r[15]=r[19]='V4';
  assert.strictEqual(hash(fetch()),before);assert.strictEqual(hash(e.sheets.VocabSetItemsV2.rows),snapshot);
  assert.strictEqual(e.ctx.reviewWordMetaV2_(id).display,canonical[2]);assert.strictEqual(e.ctx.reviewWordMetaV2_(id).meaning,canonical[3]);
});
test('authenticated router retains ok text envelope',()=>{const e=make();assert(e.ctx.doPost({postData:{contents:JSON.stringify(request())}}).body.startsWith('ok:'));});
console.log(JSON.stringify({tests:count,passed:count,operating_writes:0,baseline:3245}));
