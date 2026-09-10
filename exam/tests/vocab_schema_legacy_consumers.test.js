'use strict';
// Reuse the real local result fixture, then replace vocabulary inputs with
// operating vocabulary-only snapshots. All students/capabilities stay synthetic.
const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('exam/tests/vocab_result_persistence.test.js','utf8');
const marker="console.log('vocab_result_persistence.test.js: all assertions passed');";
if(!source.includes(marker))throw Error('result fixture contract changed');
source=source.replace(marker,`
const e7dir='outputs/vocabulary-reclassification/vocab-7e/';
const e7items=JSON.parse(fs.readFileSync(e7dir+'VocabSetItemsV2.values.json','utf8')).slice(1).filter(r=>r[0]);
const e7words=JSON.parse(fs.readFileSync(e7dir+'WordsV2.values.json','utf8')).slice(1).filter(r=>r[0]);
const e7payload=JSON.parse(fs.readFileSync(e7dir+'LegacyEmbeddedVocabulary.words.json','utf8'));
const e7id=e7items[0][2],e7word=e7words.find(w=>w[0]===e7id);
const e7linkWord=e7payload.find(p=>p.set_id===e7items[0][1]).words.find(w=>w.id===e7id);
assert.strictEqual(e7linkWord.e,e7word[2]);assert.strictEqual(e7linkWord.k,e7word[3]);
for(const setWidth of [19,23])for(const mode of ['legacy5','header9','snapshot','mixed']){
  sheets.VocabSetsV2.rows[0]=Array.from(ctx.VOCAB_SETS_V2_HEADERS).slice(0,setWidth);
  const set=crypto.randomUUID(),session='schema-'+mode+'-session',a=crypto.randomUUID(),t=crypto.randomUUID();
  const headers=Array.from(ctx.VOCAB_SET_ITEMS_V2_HEADERS).slice(0,mode==='legacy5'?5:9);
  const row=e7items[0].slice(0,mode==='legacy5'?5:9);row[0]=crypto.randomUUID();row[1]=set;
  sheets.VocabSetItemsV2.rows=mode==='snapshot'?[headers]:[headers,row];
  ctx.upsertWordV2_({word_id:e7id,term:e7word[2],meaning:e7word[3]},set);
  let submitted=[{word_id:e7id,term:e7linkWord.e,meaning:e7linkWord.k,first_correct:false,wrong_count:1,final_correct:true}];
  if(mode==='snapshot')submitted=[];
  if(mode==='mixed'||mode==='snapshot'){
    sheets.VocabSetItemsV2.rows.push([crypto.randomUUID(),set,'SEN_F569181B855E',2,now,'SEN_F569181B855E','encompass','포함하다, 둘러싸다','V3']);
    ctx.upsertWordV2_({word_id:'SEN_F569181B855E',term:'encompass',meaning:'포함하다, 둘러싸다'},set);
    submitted.push({word_id:'SEN_F569181B855E',term:'encompass',meaning:'포함하다, 둘러싸다',first_correct:false,wrong_count:1,final_correct:true});
  }
  const beforeItems=JSON.stringify(sheets.VocabSetItemsV2.rows);
  sheets.VocabSetsV2.appendRow([set,teacher,session,'schema audit','fixture','https://example.test/vocab?session='+session,true,now,now,'V3','',1,submitted.length,'audit','FIXED',submitted.length,'',0,'[]']);
  ctx.vocabSetLookupV2Cache_=null;
  assert.strictEqual(ctx.findVocabSetByIdOrSessionV2_(set)[0],set);
  assert.strictEqual(ctx.findVocabSetByIdOrSessionV2_(session)[0],set);
  assert(ctx.vocabAssignmentAvailabilityV2_(set,'').available);
  const catalog=ctx.handleListAssignmentContentV2_({parameter:{token:'teacher'}});
  assert(catalog.items.some(x=>x.content_type==='VOCAB'&&x.content_ref_id===set));
  assert.strictEqual(sheets.VocabSetsV2.rows.at(-1).slice(19).filter(Boolean).length,0);
  sheets.AssignmentsV2.appendRow([a,teacher,'VOCAB',set,'schema audit','',now,'',true,now,now,'FIXED','audit-'+mode]);
  sheets.AssignmentTargetsV2.appendRow([t,a,student,'NOT_STARTED','','',true,now,now]);
  const launch=ctx.createStudentCapability_('assignmentTarget',t,['launchAssignment'],{student_id:student},0);
  const protectedNames=['WordsV2','VocabSetItemsV2','VocabularyDB'];
  const protectedBefore=JSON.stringify(protectedNames.map(n=>sheets[n]&&sheets[n].rows));
  const headersBefore=JSON.stringify(Object.entries(sheets).map(([n,s])=>[n,s.rows[0]]));
  const setupBefore=ctx.setupAttemptsV2_;ctx.setupAttemptsV2_=()=>{throw Error('fetch must not run schema setup');};
  const issued=ctx.handleFetchVocabularySetV1_({parameter:{key:session,assignment_target_id:t,student_id:student,assignmentCapability:launch}});
  ctx.setupAttemptsV2_=setupBefore;
  assert.strictEqual(JSON.stringify(protectedNames.map(n=>sheets[n]&&sheets[n].rows)),protectedBefore);
  assert.strictEqual(JSON.stringify(Object.entries(sheets).map(([n,s])=>[n,s.rows[0]])),headersBefore);
  assert(issued.found&&issued.attempt_id);
  assert.deepStrictEqual(Array.from(issued.payload.w,w=>[w.id,w.e,w.k]),submitted.map(w=>[w.word_id,w.term,w.meaning]));
  submitted=Array.from(issued.payload.w,w=>({word_id:w.id,term:w.e,meaning:w.k,first_correct:false,wrong_count:1,final_correct:true}));
  const auth={assignment_target_id:t,student_id:student,attempt_id:issued.attempt_id,attemptCapability:issued.attemptCapability};
  const response=ctx.handleSubmitVocabResult_(Object.assign({},auth,{vocab_set_id:set,name:'fixture',score:'0/'+submitted.length,wordItems:submitted,repetition_count:1}));
  assert.strictEqual(response.body,'ok');
  assert(ctx.handleVerifyVocabResultV2_({parameter:Object.assign({},auth,{expected_word_count:String(submitted.length)})}).complete);
  const detail=ctx.handleGetAttemptDetailV2Enhanced_({parameter:{token:'teacher',attempt_id:issued.attempt_id}});
  assert.strictEqual(detail.word_items.length,submitted.length);
  for(const w of submitted){
    // Public detail intentionally omits word_id; validate its exposed metadata.
    const item=detail.word_items.find(x=>x.term===w.term&&x.meaning===w.meaning);assert(item);assert.strictEqual(item.term,w.term);assert.strictEqual(item.meaning,w.meaning);
    const review=ctx.reviewItemRowV2_(student,'WORD',w.word_id,'');assert(review);
    const history=ctx.handleGetReviewItemHistoryV2_({parameter:{token:'teacher',student_id:student,review_item_id:review[0]}});
    assert.strictEqual(history.item.meaning,w.meaning);
    const access=ctx.wrongnoteAccessV2_({parameter:{token:'teacher',student_id:student}}),context=ctx.wrongnoteContextV2_(access,{itemsOnly:true,track:'VOCAB'});
    assert.strictEqual(ctx.wrongnotePublicReviewV2_(context,review).meaning,w.meaning);
  }
  const dashboard=ctx.handleGetTeacherDashboardV2_({parameter:{token:'teacher',student_id:student}});
  assert(JSON.stringify(dashboard).includes(submitted[0].meaning));
  assert.strictEqual(JSON.stringify(sheets.VocabSetItemsV2.rows),beforeItems);
  console.log('PASS sets'+setWidth+' '+mode+': actual local fetch, attempt, submit, verify, result, review, wrongnote, teacher detail; item rows unchanged');
}
console.log(JSON.stringify({modes:8,passed:8,VOCABSETS_HEADER_ONLY_SAFE:true,operating_requests:0,legacy_input:'dual fetch payload exact compared to existing embedded payload'}));
`);
vm.runInThisContext('(function(require){'+source+'\n})',{filename:__filename})(require);
