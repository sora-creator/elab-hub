'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const {planHeaderExtension}=require('../../tools/vocab-set-items-schema-plan.cjs');
// Reuse the real safe-create fixture and request contract without running its suite.
const source=fs.readFileSync('exam/tests/vocabulary_set_creation.test.js','utf8');
const marker='let count=0;';assert(source.includes(marker));
const base=vm.runInThisContext('(function(require){'+source.slice(0,source.indexOf(marker))+'return {make,request,canonical};})',{filename:__filename})(require);
const dir='outputs/vocabulary-reclassification/vocab-7e/';
const read=n=>JSON.parse(fs.readFileSync(dir+n,'utf8'));
const legacyItems=read('VocabSetItemsV2.values.json').slice(1).filter(r=>r[0]).map(r=>r.slice(0,5));
const legacyWords=read('WordsV2.values.json').slice(1).filter(r=>r[0]).map(r=>r.slice(0,7));
const sets=read('VocabSetsV2.metadata.json');
const itemsName='VocabSetItemsV2',setsName='VocabSetsV2';
function make(){
  const e=base.make(),c=e.ctx;
  e.sheets[itemsName].rows=[Array.from(c.VOCAB_SET_ITEMS_V2_HEADERS).slice(0,5),...structuredClone(legacyItems)];
  e.sheets[setsName].rows=[sets.header.slice(0,19),...sets.sets.map((s,i)=>[s.set_id,'fixture-teacher','legacy-session-'+i,'legacy','fixture','https://example.test/vocab?session=legacy-session-'+i,true,new Date(0),new Date(0),'V3','',1,s.item_count,'legacy',s.kind,s.item_count,'',0,'[]'])];
  e.sheets.WordsV2.rows=[Array.from(c.WORDS_V2_HEADERS),...structuredClone(legacyWords)];
  return e;
}
const request=(extra={})=>({action:'upgradeVocabularySetSchemasV1',token:'local-test-token',dry_run:true,...extra});
const run=(e,extra={})=>e.ctx.handleUpgradeVocabularySetSchemasV1_(request(extra));
const apply=e=>run(e,{dry_run:false,approval:'UPGRADE_VOCAB_SET_HEADERS_ONLY_V1'});
const json=x=>JSON.stringify(x);
function state(e){return Object.fromEntries(Object.entries(e.sheets).map(([n,s])=>[n,{rows:structuredClone(s.rows),formulas:{...s.formulas},formats:{...s.formats},maxRows:s.maxRows,maxColumns:s.maxColumns}]));}
function noWrites(e,before){assert.deepStrictEqual(state(e),before);assert.equal(e.writes.length,0);assert.equal(e.propertyWrites.length,0);}
function reject(edit,code='SCHEMA_CONFLICT'){
  const e=make();edit(e);const before=state(e);const out=apply(e);assert.equal(out.error,code);assert.equal(out.write_attempted,false);noWrites(e,before);
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('canonical legacy prefix and exact appended positions',()=>{const e=make();assert.equal(e.ctx.VOCAB_SET_ITEMS_V2_HEADERS.length,9);assert.equal(e.ctx.VOCAB_SETS_V2_HEADERS.length,23);assert.equal(json(sets.header.slice(0,19)),json(e.ctx.VOCAB_SETS_V2_HEADERS.slice(0,19)));assert.equal(json(e.ctx.VOCAB_SETS_V2_HEADERS.slice(19)),json(['level','selection_type','item_count','created_by']));});
test('both legacy dry-run: F1:I1 + T1:W1 = 8 cells, no writes',()=>{const e=make(),before=state(e),out=run(e);assert(out.ok);assert.equal(out.status,'DRY_RUN');assert.equal(out.planned_header_cells,8);assert.equal(out.header_cells_written,0);assert.equal(out.sheets[0].data_rows,972);assert.equal(out.sheets[1].data_rows,32);assert.equal(json(out.sheets.map(p=>p.writes[0].range)),json(['F1:I1','T1:W1']));noWrites(e,before);});
test('actual simulation writes only eight header cells; both datasets/types/formulas unchanged',()=>{
  const e=make();e.sheets[itemsName].rows[1][4]=new Date(0);e.sheets[itemsName].rows[2][3]=17;e.sheets[itemsName].rows[3][2]='0007';e.sheets[itemsName].formulas['2,4']='=1';e.sheets[setsName].formulas['2,12']='=1';
  const before=state(e),out=apply(e);assert(out.ok);assert.equal(out.status,'UPGRADED');assert.equal(out.header_cells_written,8);assert.equal(out.data_row_writes,0);
  assert.equal(json(e.writes.map(w=>[w.sheet,w.method,w.row,w.column,w.rows,w.columns])),json([[itemsName,'setValues',1,6,1,4],[setsName,'setValues',1,20,1,4]]));
  for(const [name,s] of Object.entries(e.sheets)){
    if(![itemsName,setsName].includes(name))assert.deepStrictEqual(state(e)[name],before[name]);
    else{assert.deepStrictEqual(s.rows.slice(1),before[name].rows.slice(1));assert.deepStrictEqual(s.formulas,before[name].formulas);assert.deepStrictEqual(s.formats,before[name].formats);assert.equal(s.maxRows,before[name].maxRows);assert.equal(s.maxColumns,before[name].maxColumns);assert(s.rows.slice(1).every(r=>r.slice(name===itemsName?5:19).every(v=>v==='')));}
  }
  assert(e.sheets[itemsName].rows[1][4] instanceof Date);assert(!e.operations.some(o=>/insert|delete|clear|format/i.test(o.method)));assert(e.operations.some(o=>o.method==='flush'));assert(out.verification.every(v=>v.data_unchanged&&v.formulas_unchanged));
});
for(const name of [itemsName,setsName]){
  const start=name===itemsName?5:19;
  for(const [label,edit] of [
    ['missing sheet',e=>delete e.sheets[name]],['wrong prefix',e=>e.sheets[name].rows[0][0]='wrong'],
    ['partial suffix',e=>e.sheets[name].rows[0][start]='partial'],['wrong complete suffix',e=>{for(let i=0;i<4;i++)e.sheets[name].rows[0][start+i]='wrong';}],
    ['extension data',e=>e.sheets[name].rows[1][start]='unexpected'],['blank-looking extension formula',e=>e.sheets[name].formulas['2,'+(start+1)]='=""'],
    ['header formula',e=>e.sheets[name].formulas['1,1']='="header"'],['capacity',e=>e.sheets[name].maxColumns=start],
    ['merged header',e=>e.sheets[name].merged=[{}]],['unexpected extra column',e=>{e.sheets[name].maxColumns=26;e.sheets[name].rows[0][start+4]='unexpected';}]
  ])test(name+' '+label+' rejects BOTH before writes',()=>reject(edit));
  test(name+' already upgraded: remaining sheet only; repeat writes zero',()=>{const e=make(),headers=name===itemsName?e.ctx.VOCAB_SET_ITEMS_V2_HEADERS:e.ctx.VOCAB_SETS_V2_HEADERS;e.sheets[name].rows[0]=Array.from(headers);const out=apply(e);assert(out.ok);assert.equal(out.header_cells_written,4);assert.equal(e.writes.length,1);assert.notEqual(e.writes[0].sheet,name);e.writes.length=0;const before=state(e),repeat=apply(e);assert.equal(repeat.status,'ALREADY_UPGRADED');assert.equal(repeat.header_cells_written,0);noWrites(e,before);});
}
test('missing expected old Sets header cannot be shifted into place',()=>reject(e=>e.sheets[setsName].rows[0].splice(10,1)));
test('already canonical but populated extension is outside this maintenance contract',()=>reject(e=>{e.sheets[itemsName].rows[0]=Array.from(e.ctx.VOCAB_SET_ITEMS_V2_HEADERS);e.sheets[itemsName].rows[1][5]='sense';}));
for(const [label,extra,error] of [['auth',{token:'bad'},'UNAUTHORIZED'],['boolean required',{dry_run:'true'},'SCHEMA_REQUEST_INVALID'],['approval required',{dry_run:false},'SCHEMA_APPROVAL_REQUIRED'],['custom target forbidden',{range:'A1'},'SCHEMA_REQUEST_INVALID']])test(label,()=>{const e=make(),before=state(e);assert.equal(run(e,extra).error,error);noWrites(e,before);});
test('script lock contention refuses writes',()=>{const e=make(),lock=e.ctx.LockService.getScriptLock();lock.tryLock();const before=state(e);assert.equal(apply(e).error,'LOCK_BUSY');noWrites(e,before);lock.releaseLock();});
test('both snapshots rechecked before any writes',()=>{const e=make(),original=e.ctx.vocabularySetSchemaReadV1_;let reads=0;e.ctx.vocabularySetSchemaReadV1_=name=>{reads++;if(reads===3)e.sheets[itemsName].rows[1][2]='changed externally';return original(name);};assert.equal(apply(e).error,'SCHEMA_STATE_CHANGED');assert.equal(e.writes.length,0);});
test('failure on second header write reports incomplete; retry only remaining sheet',()=>{const e=make();e.sheets[setsName].failAfter=0;const out=apply(e);assert.equal(out.error,'SCHEMA_UPGRADE_INCOMPLETE');assert.equal(out.write_attempted,true);assert.equal(out.automatic_rollback,false);e.writes.length=0;assert(apply(e).ok);assert.equal(e.writes.length,1);assert.equal(e.writes[0].sheet,setsName);});
test('post-flush external data drift fails verification without rollback',()=>{const e=make();e.hooks.flush=()=>{e.sheets[itemsName].rows[1][2]='external';};assert.equal(apply(e).error,'SCHEMA_UPGRADE_INCOMPLETE');assert.equal(e.writes.length,2);});
test('offline tool uses same pure planner for both schemas',()=>{const e=make();for(const name of [itemsName,setsName]){const table=e.ctx.vocabularySetSchemaReadV1_(name),result=planHeaderExtension(table.snapshot);assert.equal(result.pre_fingerprint,table.plan.pre_fingerprint);assert.equal(json(result.writes),json(table.plan.writes));}});
for(const exact of [false,true])test('header upgrade -> safe encompass create; Words '+(exact?'EXACT +0':'MISSING +1')+'; old/new coexist',()=>{
  const e=make(),c=e.ctx;if(exact)e.sheets.WordsV2.rows.push([base.canonical[0],'old',base.canonical[2],base.canonical[3],true,new Date(0),new Date(0)]);
  assert(apply(e).ok);const before=state(e),wordCount=e.sheets.WordsV2.rows.length;e.writes.length=0;
  const out=c.handleCreateVocabularySetV1_(base.request()).body;assert(out.startsWith('ok:'),out);
  const setId=out.split(':')[1],item=e.sheets[itemsName].rows.at(-1),set=e.sheets[setsName].rows.at(-1);
  assert.equal(item.length,9);assert.equal(json(item.slice(5)),json([base.canonical[0],base.canonical[2],base.canonical[3],'V3']));assert.equal(item[2],base.canonical[0]);assert.equal(set.length,23);assert.equal(json(set.slice(19)),json(['V3','manual',1,'fixture-teacher']));
  assert.equal(e.sheets[itemsName].rows.length,before[itemsName].rows.length+1);assert.equal(e.sheets[setsName].rows.length,before[setsName].rows.length+1);assert.equal(e.sheets.WordsV2.rows.length,wordCount+(exact?0:1));
  assert.deepStrictEqual(e.sheets[itemsName].rows.slice(0,-1),before[itemsName].rows);assert.deepStrictEqual(e.sheets[setsName].rows.slice(0,-1),before[setsName].rows);
  for(const name of Object.keys(before))if(![itemsName,setsName,'WordsV2'].includes(name))assert.deepStrictEqual(state(e)[name],before[name]);
  c.validateAssignmentLaunchV2_=()=>true;c.attemptContextForFetchV2_=()=>({});let resolved=0;
  for(const id of new Set(legacyItems.map(r=>r[1]))){const out=c.handleFetchVocabularySetV1_({parameter:{key:id,assignment_target_id:'local'}});assert(out.found);assert(out.payload.w.every(w=>w.e&&w.k));resolved+=out.payload.w.length;}
  assert.equal(resolved,972);const fetched=c.handleFetchVocabularySetV1_({parameter:{key:setId,assignment_target_id:'local'}});assert.equal(fetched.payload.w[0].e,'encompass');assert.equal(fetched.payload.w[0].k,base.canonical[3]);
});
test('POST router exposes authenticated explicit dry-run; normal create never migrates',()=>{const e=make();assert.equal(e.ctx.handleCreateVocabularySetV1_(base.request()).body,'SET_SCHEMA_NOT_READY');assert.equal(e.writes.length,0);const response=e.ctx.doPost({postData:{contents:JSON.stringify(request())}});assert.equal(JSON.parse(response.body).status,'DRY_RUN');assert.equal(e.writes.length,0);});
console.log(JSON.stringify({tests:count,passed:count,operating_requests:0,planned_header_cells:8,data_row_writes:0}));
