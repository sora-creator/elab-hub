'use strict';
const assert=require('assert'),fs=require('fs');
const {createSubmitMock}=require('./helpers/vocab-submit-mock.cjs');
const ids={student:'e0bbe9e5-1778-49c3-8301-287f2527a4bf',assignment:'f01a4005-ed32-4f0b-9ba1-243892fee8ac',target:'ed862fce-4ba2-465b-bdac-320a313b2ce9',attempt:'915d5852-0388-4c14-8e0f-38e0bc804df5',set:'3e275abc-0185-4628-befe-a8b5a6eda038',word:'SEN_F569181B855E'};
const date=new Date('2026-09-10T01:00:00Z'),term='encompass',meaning='포함하다, 둘러싸다';
function fixture(){
  const e=createSubmitMock(),{ctx,sheets}=e,t=e.properties.DEFAULT_TEACHER_ID;
  sheets.StudentsV2.rows.push([ids.student,t,'0E 테스트학생','',true,date,date]);
  sheets.AssignmentsV2.rows.push([ids.assignment,t,'VOCAB',ids.set,'[0E] VOCAB-7N encompass assignment','',date,'',true,date,date,'INITIAL','fixture']);
  sheets.AssignmentTargetsV2.rows.push([ids.target,ids.assignment,ids.student,'IN_PROGRESS',date,'',true,date,date]);
  sheets.AttemptsV2.rows.push([ids.attempt,ids.target,ids.student,t,'VOCAB','INITIAL',date,'','','IN_PROGRESS',1,'fixture',date,date,'','']);
  sheets.VocabSetsV2.rows.push([ids.set,t,'fixture-session','encompass','fixture','',true,date,date,'V3','','','','encompass','DB',1,'',0,'','V3','manual',1,t]);
  sheets.VocabSetItemsV2.rows.push(['snapshot',ids.set,ids.word,1,date,ids.word,term,meaning,'V3']);
  // Preserved 7E export has 293 rows, before encompass. Reconstruct runtime Dates
  // from Sheets serials, then add a synthetic encompass row: NOT a 294-row live export.
  const exportRows=JSON.parse(fs.readFileSync('outputs/vocabulary-reclassification/vocab-7e/WordsV2.values.json','utf8')).slice(1).filter(r=>r[0]);
  assert.equal(exportRows.length,293);
  sheets.WordsV2.rows.push(...exportRows.map(r=>r.slice(0,7).map((v,i)=>i>=5?new Date(Math.round((v-25569)*86400000)):v)));
  sheets.WordsV2.rows.push([ids.word,'earlier-set',term,meaning,true,date,date]);
  sheets.WordAttemptItemsV2.rows.push(['unrelated-item','unrelated-attempt','unrelated-word',false,2,true,date,date,date,date]);
  sheets.AssignmentTargetsV2.rows.push(['unrelated-target','unrelated-assignment','unrelated-student','IN_PROGRESS',date,'',true,date,date]);
  sheets.AttemptsV2.rows.push(['unrelated-attempt','unrelated-target','unrelated-student',t,'VOCAB','INITIAL',date,'','','IN_PROGRESS',1,'unrelated',date,date,'','']);
  const cap=ctx.createStudentCapability_('assignmentTarget',ids.target,['submitAttemptQuestionV2','verifyVocabResultV2'],{student_id:ids.student},Date.now()+3600000);
  e.payload={assignment_id:ids.assignment,assignment_target_id:ids.target,student_id:ids.student,attempt_id:ids.attempt,attemptCapability:cap,vocab_set_id:ids.set,sessionKey:'fixture-session',name:'0E 테스트학생',score:'1/1 (100%)',count:'1개',repetition_count:0,wordItems:[{word_id:ids.word,term,meaning,first_correct:true,wrong_count:0,final_correct:true,first_answered_at:date.getTime(),final_answered_at:date.getTime()}]};
  e.submit=()=>ctx.handleSubmitVocabResult_(e.payload).body;
  e.verify=()=>ctx.handleVerifyVocabResultV2_({parameter:{...e.payload,expected_word_count:'1'}});
  e.writes.length=0;e.propertyWrites.length=0;
  return e;
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function untouched(e,before,names){for(const n of names)assert.deepStrictEqual(e.sheets[n].rows,before[n],n+' changed');}
function noWrite(e,mutate,pattern){mutate(e);const before=e.snapshot();assert.match(e.submit(),pattern);assert.deepStrictEqual(e.snapshot(),before);assert.equal(e.writes.length,0);assert.equal(e.propertyWrites.length,0);}
test('current one-item submit: exact source, bounded item, canonical read and all unrelated rows preserved',()=>{
  const e=fixture(),before=e.snapshot();assert.equal(e.submit(),'ok');
  untouched(e,before,['WordsV2','VocabularyDB','VocabSetsV2','VocabSetItemsV2','AssignmentsV2','StudentsV2','ReviewItemsV2','ReviewEventsV2','VocabReviewSchedulesV2']);
  assert.equal(e.sheets.WordsV2.rows.length,295);assert.equal(e.writes.filter(w=>w.sheet==='WordsV2').length,0);
  assert.deepStrictEqual(e.sheets.WordAttemptItemsV2.rows.slice(0,2),before.WordAttemptItemsV2);
  assert.equal(e.sheets.WordAttemptItemsV2.rows.length,3);
  assert.deepStrictEqual(e.sheets.AttemptsV2.rows[2],before.AttemptsV2[2]);assert.deepStrictEqual(e.sheets.AssignmentTargetsV2.rows[2],before.AssignmentTargetsV2[2]);
  assert.equal(e.sheets.AttemptsV2.rows[1][9],'COMPLETED');assert.equal(e.sheets.AssignmentTargetsV2.rows[1][3],'COMPLETED');
  assert.equal(e.sheets.VocabResults.rows.length,2);assert.equal(e.sheets.VocabResults.rows[1][3],'1/1 (100%)');assert.equal(e.sheets.VocabResults.rows[1][5],'');
  const item=e.sheets.WordAttemptItemsV2.rows[2];assert.equal(item[1],ids.attempt);assert.equal(item[2],ids.word);assert.equal(item[3],true);assert.equal(item[4],0);assert.equal(item[5],true);
  assert.equal(e.sheets.AttemptsV2.rows[1][2],ids.student);assert.equal(e.sheets.AssignmentTargetsV2.rows[1][1],ids.assignment);
  const verified=e.verify();assert(verified.complete);assert.equal(verified.word_item_count,1);assert.equal(verified.score,'1/1 (100%)');
  const detail=e.ctx.handleGetAttemptDetailV2Enhanced_({parameter:e.payload});assert.equal(detail.attempt.attempt_id,ids.attempt);assert.equal(detail.attempt.score,'1/1 (100%)');assert.equal(detail.word_items.length,1);assert.equal(detail.word_items[0].term,term);assert.equal(detail.word_items[0].meaning,meaning);assert.equal(detail.word_items[0].first_correct,true);assert.equal(detail.word_items[0].wrong_count,0);
  assert.equal(e.ctx.handleGetWrongnoteSummaryV2_({parameter:{token:'teacher',student_id:ids.student}}).tracks.find(r=>r.track==='VOCAB').item_count,0);
  assert(e.writes.every(w=>w.row>1));assert(e.writes.filter(w=>w.sheet==='WordAttemptItemsV2').every(w=>w.row===3&&w.rows===1));
  const beforeReplay=e.snapshot(),writes=e.writes.length;assert.equal(e.submit(),'ATTEMPT_ALREADY_COMPLETED');assert.equal(e.writes.length,writes);assert.deepStrictEqual(e.snapshot(),beforeReplay);
});
test('missing trusted snapshot compatibility appends one bounded row',()=>{const e=fixture();e.sheets.WordsV2.rows.pop();const before=structuredClone(e.sheets.WordsV2.rows);assert.equal(e.submit(),'ok');assert.deepStrictEqual(e.sheets.WordsV2.rows.slice(0,-1),before);assert(e.writes.filter(w=>w.sheet==='WordsV2').every(w=>w.row===295&&w.rows===1));assert.equal(e.sheets.WordsV2.rows.at(-1)[0],ids.word);});
for(const [name,change] of [['term',r=>r[2]='different'],['meaning',r=>r[3]='different'],['active',r=>r[4]=false],['set type',r=>r[1]=123],['created type',r=>r[5]=date.toISOString()],['updated type',r=>r[6]='bad']])test('compatibility conflict '+name+' fails before all writes',()=>noWrite(fixture(),e=>change(e.sheets.WordsV2.rows.at(-1)),/WORD_COMPAT_CONFLICT/));
test('duplicate compatibility identity fails closed',()=>noWrite(fixture(),e=>e.sheets.WordsV2.rows.push([...e.sheets.WordsV2.rows.at(-1)]),/WORD_COMPAT_CONFLICT/));
test('existing canonical item exact reuse has zero item writes and timestamps unchanged',()=>{const e=fixture();e.sheets.WordAttemptItemsV2.rows.push(['existing',ids.attempt,ids.word,true,0,true,date,date,date,date]);const before=structuredClone(e.sheets.WordAttemptItemsV2.rows);assert.equal(e.submit(),'ok');assert.deepStrictEqual(e.sheets.WordAttemptItemsV2.rows,before);assert.equal(e.writes.filter(w=>w.sheet==='WordAttemptItemsV2').length,0);});
for(const name of ['conflicting','duplicate','unexpected'])test(name+' current attempt item fails pre-write',()=>noWrite(fixture(),e=>{const r=['existing',ids.attempt,name==='unexpected'?'other':ids.word,name==='conflicting'?false:true,0,true,date,date,date,date];e.sheets.WordAttemptItemsV2.rows.push(r);if(name==='duplicate')e.sheets.WordAttemptItemsV2.rows.push([...r]);},/WORD_ATTEMPT_ITEM_CONFLICT/));
for(const name of ['AttemptsV2','AssignmentTargetsV2','AssignmentsV2','StudentsV2','VocabSetsV2','VocabSetItemsV2','WordsV2','WordAttemptItemsV2','VocabResults','VocabReviewSchedulesV2','HomeworkBatchAssignmentsV2'])for(const mode of ['missing','header','formula'])test(name+' '+mode+' fails without schema repair',()=>noWrite(fixture(),e=>{if(mode==='missing')delete e.sheets[name];else if(mode==='header')e.sheets[name].rows[0][0]='bad';else e.sheets[name].formulas['2,1']='="bad"';},/SCHEMA_NOT_READY|DATA_NOT_READY/));
for(const [name,change] of [
  ['student',e=>e.payload.student_id='other'],['assignment',e=>e.payload.assignment_id='other'],['set',e=>e.payload.vocab_set_id='other'],['target status',e=>e.sheets.AssignmentTargetsV2.rows[1][3]='NOT_STARTED'],['attempt status',e=>e.sheets.AttemptsV2.rows[1][9]='SUBMITTED'],
  ['inactive student',e=>e.sheets.StudentsV2.rows[1][4]=false],['payload meaning',e=>e.payload.wordItems[0].meaning='forged'],['unfinished answer',e=>e.payload.wordItems[0].final_correct=false],['missing item',e=>e.payload.wordItems=[]],['duplicate item',e=>e.payload.wordItems.push({...e.payload.wordItems[0]})],['invalid time',e=>e.payload.wordItems[0].first_answered_at='invalid'],['score',e=>e.payload.score='0/1'],['repetitions',e=>e.payload.repetition_count=-1],['secret missing',e=>delete e.properties.STUDENT_CAPABILITY_SECRET]
])test(name+' fails before writes',()=>noWrite(fixture(),change,/forbidden|VOCAB_SUBMIT/));
function wrong(e){e.payload.wordItems[0].first_correct=false;e.payload.wordItems[0].wrong_count=1;e.payload.score='0/1 (0%)';e.payload.repetition_count=1;}
test('first wrong then mastered preserves existing review and wrongnote policy, no duplicate replay',()=>{
  const e=fixture();wrong(e);assert.equal(e.submit(),'ok');
  assert.equal(e.sheets.WordAttemptItemsV2.rows.at(-1)[3],false);assert.equal(e.sheets.WordAttemptItemsV2.rows.at(-1)[5],true);
  assert.equal(e.sheets.ReviewItemsV2.rows.length,2);assert.equal(e.sheets.ReviewEventsV2.rows.length,2);
  const review=e.sheets.ReviewItemsV2.rows[1],event=e.sheets.ReviewEventsV2.rows[1];assert.equal(review[8],1);assert.equal(review[14],'REVIEWED');assert.equal(event[4],'CORRECT');assert.equal(event[5],1);
  const access=e.ctx.wrongnoteAccessV2_({parameter:{token:'teacher',student_id:ids.student}}),context=e.ctx.wrongnoteContextV2_(access,{itemsOnly:true,track:'VOCAB'});
  assert.equal(e.ctx.wrongnotePublicReviewV2_(context,review).meaning,meaning);
  const before=e.snapshot(),writes=e.writes.length;assert.equal(e.submit(),'ATTEMPT_ALREADY_COMPLETED');assert.deepStrictEqual(e.snapshot(),before);assert.equal(e.writes.length,writes);
});
for(const name of ['ReviewItemsV2','ReviewEventsV2'])test('wrong path missing '+name+' fails pre-write',()=>noWrite(fixture(),e=>{wrong(e);delete e.sheets[name];},/SCHEMA_NOT_READY/));
for(const [name,stage] of [['WordAttemptItemsV2','WORD_ATTEMPT_ITEMS'],['VocabResults','RESULT'],['AssignmentTargetsV2','TARGET_COMPLETION'],['AttemptsV2','ATTEMPT_COMPLETION'],['ReviewItemsV2','REVIEW'],['ReviewEventsV2','REVIEW']])for(const timing of ['before','after'])test(name+' '+timing+' write failure returns partial, verify false, retry blocked',()=>{
  const e=fixture();if(stage==='REVIEW')wrong(e);
  if(timing==='before')e.hooks.beforeScalarWrite=(sheet,r,c,rows)=>{if(sheet===name&&(name!=='AttemptsV2'||rows[0][9]==='COMPLETED'))throw Error('injected');};
  else e.hooks.afterWrite=sheet=>{if(sheet===name&&(name!=='AttemptsV2'||e.sheets.AttemptsV2.rows[1][9]==='COMPLETED'))throw Error('injected after commit');};
  assert.equal(e.submit(),'PARTIAL_VOCAB_SUBMIT:'+stage+':READ_ONLY_DIAGNOSIS_REQUIRED');
  // An acknowledged-loss on the very last completion can be durably complete;
  // read-only verification is authoritative. No mutation retry is permitted.
  assert.equal(e.verify().complete,name==='AttemptsV2'&&timing==='after');
  if(stage==='WORD_ATTEMPT_ITEMS'){assert.notEqual(e.sheets.AttemptsV2.rows[1][9],'COMPLETED');assert.notEqual(e.sheets.AssignmentTargetsV2.rows[1][3],'COMPLETED');}
  const before=e.snapshot(),writes=e.writes.length;assert.match(e.submit(),/PARTIAL_VOCAB_SUBMIT|ATTEMPT_ALREADY_COMPLETED/);assert.deepStrictEqual(e.snapshot(),before);assert.equal(e.writes.length,writes);
});
test('retention INITIAL existing homework policy still adds D7 and D30, no review for correct',()=>{
  const e=fixture();e.sheets.HomeworkBatchAssignmentsV2.rows.push(['link','batch',ids.assignment,ids.student,JSON.stringify({word_ids:[ids.word],vocab_set_id:ids.set}),date]);
  assert.equal(e.submit(),'ok');assert.equal(e.sheets.VocabReviewSchedulesV2.rows.length,3);assert.deepStrictEqual(e.sheets.VocabReviewSchedulesV2.rows.slice(1).map(r=>r[5]),['D7','D30']);assert.equal(e.sheets.ReviewItemsV2.rows.length,1);
});
test('retention write failure leaves Attempt unsealed',()=>{const e=fixture();e.sheets.HomeworkBatchAssignmentsV2.rows.push(['link','batch',ids.assignment,ids.student,JSON.stringify({word_ids:[ids.word],vocab_set_id:ids.set}),date]);e.hooks.beforeScalarWrite=name=>{if(name==='VocabReviewSchedulesV2')throw Error('injected');};assert.match(e.submit(),/^PARTIAL_VOCAB_SUBMIT:RETENTION/);assert(!e.verify().complete);});
test('text that resembles a formula is persisted as text in results',()=>{const e=fixture();e.payload.name='=1+1';assert.equal(e.submit(),'ok');assert.equal(e.sheets.VocabResults.rows[1][1],'=1+1');assert.deepStrictEqual(e.sheets.VocabResults.formulas,{});});
test('existing legacy result row and header remain unchanged',()=>{const e=fixture();e.sheets.VocabResults.rows.push([date,'other','other','0/1 (0%)','1s','other','1개','mc','1','']);const before=structuredClone(e.sheets.VocabResults.rows);assert.equal(e.submit(),'ok');assert.deepStrictEqual(e.sheets.VocabResults.rows.slice(0,-1),before);assert(e.writes.filter(w=>w.sheet==='VocabResults').every(w=>w.row===3&&w.rows===1));});
test('real doPost authorization and verification route, no admin/setup/upsert or credential logging',()=>{
  const e=fixture();e.payload.action='submitVocabResult';e.payload.studentCapability=e.ctx.createStudentCapability_('vocab','fixture-session',['submitVocabResult'],{},Date.now()+3600000);
  for(const name of ['setupAttemptsV2_','setupReviewItemsV2_','upsertWordV2_'])e.ctx[name]=()=>{throw Error('forbidden '+name);};
  assert.equal(e.ctx.doPost({postData:{contents:JSON.stringify(e.payload)}}).body,'ok');assert(e.verify().complete);
  assert.equal(e.propertyWrites.length,0);assert(!JSON.stringify(e.logs).includes(e.payload.studentCapability));assert(!JSON.stringify(e.logs).includes(e.payload.attemptCapability));
});
test('correct case with an existing wrongnote does not update that review',()=>{
  const e=fixture();e.sheets.ReviewItemsV2.rows.push(['old-review',ids.student,'local-teacher','WORD',ids.word,'',date,date,1,'',0,0,'','','NEEDS_REVIEW',true,date,date]);const before=e.snapshot();assert.equal(e.submit(),'ok');untouched(e,before,['ReviewItemsV2','ReviewEventsV2']);
});
for(const name of ['AttemptsV2','AssignmentTargetsV2','WordAttemptItemsV2','VocabResults'])test(name+' merged destination fails before writes',()=>noWrite(fixture(),e=>e.sheets[name].merged=[{}],/CAPACITY_NOT_READY/));
test('verify after schema loss fails read-only without recreation',()=>{const e=fixture();delete e.sheets.WordAttemptItemsV2;assert.match(e.verify().error,/WORD_ATTEMPT_SCHEMA_NOT_READY/);assert.equal(e.writes.length,0);assert(!e.sheets.WordAttemptItemsV2);});
test('reused canonical item id colliding with another attempt fails pre-write',()=>noWrite(fixture(),e=>e.sheets.WordAttemptItemsV2.rows.push(['unrelated-item',ids.attempt,ids.word,true,0,true,date,date,date,date]),/WORD_ATTEMPT_ITEM_CONFLICT/));
test('orphan review event fails pre-write',()=>noWrite(fixture(),e=>{wrong(e);e.sheets.WordAttemptItemsV2.rows.push(['existing',ids.attempt,ids.word,false,1,true,date,date,date,date]);e.sheets.ReviewEventsV2.rows.push(['existing:1:GENERAL','missing-review',ids.attempt,'existing','CORRECT',1,date]);},/VOCAB_SUBMIT_REVIEW_CONFLICT/));
test('duplicate review identity fails pre-write',()=>noWrite(fixture(),e=>{wrong(e);const row=['review',ids.student,'local-teacher','WORD',ids.word,'',date,date,1,'',0,0,'','','NEEDS_REVIEW',true,date,date];e.sheets.ReviewItemsV2.rows.push(row,[...row]);},/VOCAB_SUBMIT_REVIEW_CONFLICT/));
for(const subtype of ['D7','D30'])test(subtype+' completion preserves existing retention update contract',()=>{
  const e=fixture();e.sheets.AttemptsV2.rows[1][5]=subtype;e.sheets.AssignmentsV2.rows[1][11]=subtype;
  e.sheets.VocabReviewSchedulesV2.rows.push(['schedule','local-teacher',ids.student,ids.set,'initial-attempt',subtype,date,'ASSIGNED','',ids.assignment,'',date,date]);
  assert.equal(e.submit(),'ok');assert.equal(e.sheets.VocabReviewSchedulesV2.rows.length,2);assert.equal(e.sheets.VocabReviewSchedulesV2.rows[1][7],'COMPLETED');assert.equal(e.sheets.VocabReviewSchedulesV2.rows[1][10],ids.attempt);
});
console.log(JSON.stringify({tests:count,passed:count,words_fixture:'293 preserved 7E rows + synthetic encompass; not current live export',attempt_item_baseline:'synthetic unrelated item',operating_requests:0}));
