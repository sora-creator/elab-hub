'use strict';
const assert=require('assert'),fs=require('fs'),{execFileSync}=require('child_process');
const {createFirstImportMock}=require('./helpers/vocabulary-first-import-mock.cjs');
const ids={student_id:'e0bbe9e5-1778-49c3-8301-287f2527a4bf',assignment_id:'f01a4005-ed32-4f0b-9ba1-243892fee8ac',set_id:'3e275abc-0185-4628-befe-a8b5a6eda038'};
const sense='SEN_F569181B855E',action='PUBLIC_IDENTIFIER_REMOVED';
const tables={StudentsV2:'STUDENTS_V2_HEADERS',AssignmentsV2:'ASSIGNMENTS_V2_HEADERS',AssignmentTargetsV2:'ASSIGNMENT_TARGETS_V2_HEADERS',AttemptsV2:'ATTEMPTS_V2_HEADERS',VocabSetsV2:'VOCAB_SETS_V2_HEADERS',VocabSetItemsV2:'VOCAB_SET_ITEMS_V2_HEADERS',WordsV2:'WORDS_V2_HEADERS',WordAttemptItemsV2:'WORD_ATTEMPT_ITEMS_V2_HEADERS',ReviewItemsV2:'REVIEW_ITEMS_V2_HEADERS',ReviewEventsV2:'REVIEW_EVENTS_V2_HEADERS',HomeworkBatchesV2:'HOMEWORK_BATCHES_V2_HEADERS',HomeworkBatchAssignmentsV2:'HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS'};
function make(){
  const e=createFirstImportMock();
  for(const [name,h] of Object.entries(tables))e.addSheet(name,e.ctx[h]);
  e.addSheet('Homework',['id','value']).rows.push(['unrelated','untouched']);
  e.sheets.StudentsV2.rows.push([ids.student_id,'teacher','0E 테스트학생','',true,new Date(0),new Date(0),'','PRIVATE_CONTACT','PRIVATE_EMAIL','','','','PRIVATE_MEMO']);
  e.sheets.AssignmentsV2.rows.push([ids.assignment_id,'teacher','VOCAB',ids.set_id,'[0E] VOCAB-7N encompass assignment','','','',true]);
  e.sheets.AssignmentTargetsV2.rows.push(['target',ids.assignment_id,ids.student_id,'NOT_STARTED','','',true]);
  e.sheets.VocabSetsV2.rows.push([ids.set_id,'teacher','PRIVATE_SESSION','encompass','','PRIVATE_LINK',true]);
  e.sheets.VocabSetItemsV2.rows.push(['item',ids.set_id,sense,1,new Date(0),sense,'encompass','포함하다, 둘러싸다','V3']);
  e.forbidden=[];
  const deny=name=>()=>{e.forbidden.push(name);throw Error('Forbidden call: '+name);};
  for(const name of Object.keys(e.ctx))if(typeof e.ctx[name]==='function'&&(/^(setup|getOrCreate|create|append|setValue|insert|delete|startAttempt|allowRetry|handleStartAttempt|handleAllowRetry|handleFetchVocabularySet|attemptContextForFetch)/.test(name)))e.ctx[name]=deny(name);
  e.ctx.Utilities.getUuid=deny('UUID');
  e.ctx.UrlFetchApp={fetch:deny('network')};
  return e;
}
function state(e){return structuredClone(Object.fromEntries(Object.entries(e.sheets).map(([name,s])=>[name,{rows:s.rows,formulas:s.formulas,formats:s.formats,maxRows:s.maxRows,maxColumns:s.maxColumns}])));}
function inspect(e,extra={}){
  const before=state(e),properties=structuredClone(e.properties);
  const response=e.ctx.doGet({parameter:{action,token:e.properties.TOKEN,...ids,...extra}});
  const body=response.body,callback=extra.callback||'callback',output=JSON.parse(body.slice(callback.length+1,-1));
  assert.deepStrictEqual(state(e),before);assert.deepStrictEqual(e.properties,properties);
  assert.equal(e.writes.length,0);assert.equal(e.propertyWrites.length,0);assert.deepStrictEqual(e.forbidden,[]);
  for(const secret of [e.properties.TOKEN,'PRIVATE_CONTACT','PRIVATE_EMAIL','PRIVATE_MEMO','PRIVATE_SESSION','PRIVATE_LINK']){
    assert(!body.includes(secret));assert(!JSON.stringify(e.logs).includes(secret));
  }
  return output;
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('GET success matches the 7N fixture, complete snapshot evidence and zero writes',()=>{
  const e=make(),out=inspect(e);assert(out.ok&&out.eligible);assert.equal(out.status,'START_ELIGIBLE');
  assert.deepStrictEqual(out.student,{student_id:ids.student_id,student_found:true,student_active:true});
  assert.equal(out.assignment.type,'VOCAB');assert.equal(out.assignment.set_id,ids.set_id);
  assert.equal(out.target.target_count_for_pair,1);assert.equal(out.target.target_status,'NOT_STARTED');assert.equal(out.attempts.attempt_count,0);
  assert.equal(out.vocab_set.item_count,1);assert.equal(out.valid_item_count,1);
  assert.deepStrictEqual(out.items,[{sense_id:sense,word_id:sense,word:'encompass',meaning:'포함하다, 둘러싸다',level:'V3',mode:'SNAPSHOT',truncated:false}]);
  assert(!e.operations.some(o=>['WordsV2','VocabularyDB','Homework'].includes(o.sheet)));
});
test('JSONP route',()=>assert.equal(inspect(make(),{callback:'preflight'}).status,'START_ELIGIBLE'));
const row=(e,name)=>e.sheets[name].rows[1];
const cases=[
  ['student missing',e=>e.sheets.StudentsV2.rows.pop(),'STUDENT_NOT_FOUND'],
  ['student inactive',e=>row(e,'StudentsV2')[4]=false,'STUDENT_INACTIVE'],
  ['assignment missing',e=>e.sheets.AssignmentsV2.rows.pop(),'ASSIGNMENT_NOT_FOUND'],
  ['wrong type',e=>row(e,'AssignmentsV2')[2]='READING','ASSIGNMENT_TYPE_MISMATCH'],
  ['wrong set reference',e=>row(e,'AssignmentsV2')[3]='other','SET_REFERENCE_MISMATCH'],
  ['target missing',e=>e.sheets.AssignmentTargetsV2.rows.pop(),'TARGET_NOT_FOUND'],
  ['duplicate target',e=>e.sheets.AssignmentTargetsV2.rows.push([...row(e,'AssignmentTargetsV2')]),'TARGET_DUPLICATE'],
  ['target IN_PROGRESS',e=>row(e,'AssignmentTargetsV2')[3]='IN_PROGRESS','TARGET_ALREADY_STARTED'],
  ['target COMPLETED',e=>row(e,'AssignmentTargetsV2')[3]='COMPLETED','TARGET_ALREADY_STARTED'],
  ['existing attempt',e=>e.sheets.AttemptsV2.rows.push(['attempt','target',ids.student_id]),'ATTEMPT_ALREADY_EXISTS'],
  ['set missing',e=>e.sheets.VocabSetsV2.rows.pop(),'VOCAB_SET_NOT_FOUND'],
  ['empty set',e=>e.sheets.VocabSetItemsV2.rows.pop(),'VOCAB_SET_EMPTY'],
  ['partial snapshot',e=>row(e,'VocabSetItemsV2')[7]='','VOCAB_SET_ITEM_INVALID'],
  ['invalid snapshot level',e=>row(e,'VocabSetItemsV2')[8]='V6','VOCAB_SET_ITEM_INVALID'],
  ['legacy missing metadata',e=>e.sheets.VocabSetItemsV2.rows[1]=row(e,'VocabSetItemsV2').slice(0,5),'VOCAB_SET_ITEM_INVALID'],
  ['assignment inactive',e=>row(e,'AssignmentsV2')[8]=false,'ASSIGNMENT_INACTIVE'],
  ['target inactive',e=>row(e,'AssignmentTargetsV2')[6]=false,'TARGET_INACTIVE'],
  ['set inactive',e=>row(e,'VocabSetsV2')[6]=false,'VOCAB_SET_INACTIVE'],
  ['duplicate student',e=>e.sheets.StudentsV2.rows.push([...row(e,'StudentsV2')]),'STUDENT_DUPLICATE'],
  ['duplicate assignment',e=>e.sheets.AssignmentsV2.rows.push([...row(e,'AssignmentsV2')]),'ASSIGNMENT_DUPLICATE'],
  ['duplicate set',e=>e.sheets.VocabSetsV2.rows.push([...row(e,'VocabSetsV2')]),'VOCAB_SET_DUPLICATE']
];
for(const [name,edit,reason] of cases)test(name+' gives explicit NO-GO, zero writes',()=>{const e=make();edit(e);const out=inspect(e);assert(!out.ok&&!out.eligible);assert.equal(out.status,'NO_GO');assert(out.reasons.includes(reason));assert.equal(out.error,reason);});
function legacy(e){e.sheets.VocabSetItemsV2.rows[1]=row(e,'VocabSetItemsV2').slice(0,5);e.sheets.WordsV2.rows.push([sense,'unrelated-set','legacy word','legacy meaning',true]);}
test('legacy exact Words fallback, old 5/19-column schema',()=>{const e=make();legacy(e);e.sheets.VocabSetItemsV2.rows[0]=e.sheets.VocabSetItemsV2.rows[0].slice(0,5);e.sheets.VocabSetsV2.rows[0]=e.sheets.VocabSetsV2.rows[0].slice(0,19);const out=inspect(e);assert(out.eligible);assert.equal(out.items[0].mode,'LEGACY');assert.equal(out.items[0].word,'legacy word');assert.equal(out.items[0].sense_id,'');});
for(const mode of ['missing sheet','duplicate','empty word','empty meaning','wrong header'])test('legacy '+mode+' rejected',()=>{const e=make();legacy(e);if(mode==='missing sheet')delete e.sheets.WordsV2;else if(mode==='duplicate')e.sheets.WordsV2.rows.push([...row(e,'WordsV2')]);else if(mode==='empty word')row(e,'WordsV2')[2]='';else if(mode==='empty meaning')row(e,'WordsV2')[3]='';else e.sheets.WordsV2.rows[0][0]='wrong';assert(inspect(e).reasons.includes('VOCAB_SET_ITEM_INVALID'));});
test('snapshot precedence over incompatible Words and partial snapshot never falls back',()=>{const e=make();e.sheets.WordsV2.rows.push([sense,'other','WRONG','WRONG',true]);assert.equal(inspect(e).items[0].word,'encompass');row(e,'VocabSetItemsV2')[7]='';assert(inspect(e).reasons.includes('VOCAB_SET_ITEM_INVALID'));assert(!e.operations.some(o=>o.sheet==='WordsV2'));});
test('unrelated exact pair rows are excluded from evidence and attempts',()=>{const e=make();e.sheets.AssignmentTargetsV2.rows.push(['other-target','other-assignment',ids.student_id,'NOT_STARTED']);e.sheets.AttemptsV2.rows.push(['other','other-target',ids.student_id],['other2','target','other-student']);e.sheets.VocabSetItemsV2.rows.push(['other','other-set','other']);assert(inspect(e).eligible);});
test('attempts on duplicate/inactive target included once each',()=>{const e=make();e.sheets.AssignmentTargetsV2.rows.push(['target2',ids.assignment_id,ids.student_id,'NOT_STARTED','','',false]);e.sheets.AttemptsV2.rows.push(['a','target',ids.student_id],['b','target2',ids.student_id]);const out=inspect(e);assert.equal(out.attempts.attempt_count,2);assert(out.reasons.includes('TARGET_DUPLICATE')&&out.reasons.includes('ATTEMPT_ALREADY_EXISTS'));});
for(const name of ['StudentsV2','AssignmentsV2','AssignmentTargetsV2','AttemptsV2','VocabSetsV2','VocabSetItemsV2'])for(const failure of ['missing','header','formula'])test(name+' '+failure+' fails closed without repair',()=>{const e=make();if(failure==='missing')delete e.sheets[name];else if(failure==='header')e.sheets[name].rows[0][0]='wrong';else e.sheets[name].formulas['2,1']='=""';assert(!inspect(e).eligible);});
for(const token of ['',undefined,'wrong','student-capability'])test('unauthorized token reads no sheets',()=>{const e=make();assert.equal(inspect(e,{token}).error,'UNAUTHORIZED');assert.equal(e.operations.length,0);});
for(const field of Object.keys(ids))test('invalid '+field+' reads no sheets',()=>{const e=make();assert.equal(inspect(e,{[field]:' '}).error,'INVALID_PREFLIGHT_INPUT');assert.equal(e.operations.length,0);});
test('500 items all validated, bounded output and field lengths',()=>{const e=make(),template=row(e,'VocabSetItemsV2');e.sheets.VocabSetItemsV2.rows=[e.sheets.VocabSetItemsV2.rows[0],...Array.from({length:500},(_,i)=>{const r=[...template];r[0]='item'+i;r[3]=i+1;r[6]='x'.repeat(2000);return r;})];const out=inspect(e);assert(out.eligible&&out.items_truncated);assert.equal(out.valid_item_count,500);assert.equal(out.items.length,20);assert(out.items.every(i=>i.truncated&&i.word.length===512));assert(Buffer.byteLength(JSON.stringify(out))<25000);e.sheets.VocabSetItemsV2.rows[500][8]='V6';assert(!inspect(e).eligible);});
test('diagnostic, fetch and start implementations remain unchanged from committed baseline',()=>{
  const old=execFileSync('git',['show','HEAD:exam/sheet_backend.gs'],{encoding:'utf8'}).replace(/\r\n/g,'\n'),now=fs.readFileSync('exam/sheet_backend.gs','utf8').replace(/\r\n/g,'\n');
  for(const name of ['PUBLIC_IDENTIFIER_REMOVED','handleFetchVocabularySetV1_','handleStartAttemptV2_']){
    const section=s=>{const start=s.indexOf('function '+name+'(');assert(start>=0,name);const end=s.indexOf('\nfunction ',start+1);return s.slice(start,end<0?s.length:end);};
    assert.equal(section(now),section(old),name);
  }
});
console.log(JSON.stringify({tests:count,passed:count,spreadsheet_writes:0,script_properties_writes:0,start_attempt_calls:0,get_or_create_attempt_calls:0,fetch_vocabulary_set_calls:0,setup_calls:0,operating_requests:0}));
