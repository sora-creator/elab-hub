const assert=require('assert'),fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('exam/tests/review_0f.test.js','utf8');
source=source.replace("console.log('review_0f.test.js: all assertions passed');",`
// Complete the older review fixture with the bounded create Apps Script surface.
ctx.setupVocabularyDbV1_();
Object.entries(sheets).forEach(([name,sh])=>{
  sh.getName=()=>name;sh.getMaxRows=()=>50000;sh.getMaxColumns=()=>sh.rows[0].length;
  const getData=sh.getDataRange.bind(sh),getRange=sh.getRange.bind(sh);
  sh.getDataRange=()=>{const range=getData();return {getValues:()=>range.getValues().map(row=>row.slice()),getFormulas:()=>sh.rows.map(row=>row.map(()=>''))};};
  sh.getRange=(r,c,n=1,m=1)=>{const range=getRange(r,c,n,m);range.getFormulas=()=>Array.from({length:n},()=>Array(m).fill(''));range.getMergedRanges=()=>[];range.setNumberFormat=()=>{};range.setRichTextValues=values=>range.setValues(values.map(row=>row.map(v=>v.getText())));return range;};
});
ctx.SpreadsheetApp.newRichTextValue=()=>{let value;return {setText(v){value=v;return this},build(){return {getText:()=>value}}};};
ctx.LockService.getScriptLock=()=>({waitLock(){},tryLock:()=>true,hasLock:()=>true,releaseLock(){}});
ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]});
const importRows=[
 {source_row:2,level:'V1',word:'bank',meaning:'은행',vocab_id:'v-bank',sense_id:'sense-bank-1',item_type:'word',sense_order:1,importance_score:99,occurrence_count:8,active:1,curriculum_active:true,curriculum_level:'V1',archive_only:false,selection_score:120,selection_reason:'반복 출현',recommended_level:'V1',confirmed_level:'V1'},
 {source_row:3,level:'V2',word:'bank',meaning:'강둑',vocab_id:'v-bank',sense_id:'sense-bank-2',item_type:'word',sense_order:2,importance_score:88,occurrence_count:4,active:1,curriculum_active:false,curriculum_level:'',archive_only:true,selection_score:80,selection_reason:'보관',recommended_level:'V2',confirmed_level:'V2'}
];
const textCases=[
  [false,'false'],[true,'true'],['0','0'],[0,'0'],[null,''],[undefined,''],['',''],['word','word'],['  spaced  ','spaced']
];
textCases.forEach(([input,expected])=>assert.strictEqual(ctx.toImportTextV1_(input),expected,'import text normalization'));
const normalizedFalse=ctx.normalizeVocabularyImportRowV1_({level:'V2',word:false,meaning:'가짜의',vocab_id:'v-false',sense_id:'sense-false',item_type:'WORD',sense_order:1,importance_score:1,occurrence_count:1,active:true,curriculum_active:false,curriculum_level:'',archive_only:true,selection_score:1,selection_reason:'보관',recommended_level:'V2',confirmed_level:'V2'},4085);
assert.strictEqual(normalizedFalse.word,'false');assert.strictEqual(normalizedFalse.errors.length,0,'boolean FALSE from staging remains the word false');
assert(ctx.handleStageVocabularyImportV1_({request_id:'import-1',rows:importRows}).body.startsWith('ok:'));
let stagingState=ctx.handleInspectVocabularyStagingStateV1_({parameter:{token:'teacher',expected_total:'2'}}),stagedRequest=stagingState.requests.find(x=>x.request_id==='import-1');
assert.strictEqual(stagingState.total_staging_rows,2);assert(stagedRequest);assert.strictEqual(stagedRequest.staging_status,'STAGING');assert.strictEqual(stagedRequest.row_count,2);assert.strictEqual(stagedRequest.first_sheet_row,2);assert.strictEqual(stagedRequest.last_sheet_row,3);assert.strictEqual(stagedRequest.level_counts.V1,1);assert.strictEqual(stagedRequest.level_counts.V2,1);assert.strictEqual(stagedRequest.duplicate_sense_ids,0);assert.strictEqual(stagedRequest.curriculum_active_count,1);assert.strictEqual(stagedRequest.archive_only_count,1);assert.strictEqual(stagedRequest.is_complete,true);assert.strictEqual(ctx.handleInspectVocabularyStagingStateV1_({parameter:{token:'wrong'}}).error,'no token');
assert(ctx.handlePreviewVocabularyImportV1_({request_id:'import-1',source_file:'db.xlsx'}).body.endsWith(':PREVIEWED'));
stagingState=ctx.handleInspectVocabularyStagingStateV1_({parameter:{token:'teacher'}});stagedRequest=stagingState.requests.find(x=>x.request_id==='import-1');assert.strictEqual(stagedRequest.file_name,'db.xlsx');assert.strictEqual(stagedRequest.staging_status,'PREVIEWED');assert.strictEqual(stagedRequest.is_complete,true);
let importStatus=ctx.handleGetVocabularyImportStatusV1_({parameter:{token:'teacher',request_id:'import-1'}});
assert.strictEqual(importStatus.new_count,2);assert.strictEqual(importStatus.error_count,0);
assert(ctx.handleCommitVocabularyImportV1_({request_id:'import-1'}).body.startsWith('ok:'));
let dbRows=sheets.VocabularyDB.rows.slice(1);assert.strictEqual(dbRows.length,2);assert.strictEqual(new Set(dbRows.map(r=>r[0])).size,2);
let curriculumList=ctx.handleListVocabularyDbV1_({parameter:{token:'teacher',scope:'curriculum',limit:'20'}});assert.strictEqual(curriculumList.total,1,'default curriculum filter excludes archive');
let archiveList=ctx.handleListVocabularyDbV1_({parameter:{token:'teacher',scope:'archive',include_archive:'1',limit:'20'}});assert.strictEqual(archiveList.total,1,'archive filter returns archive-only senses');
let automatic=ctx.handlePreviewVocabularySetV1_({parameter:{token:'teacher',level:'V1',selection_type:'importance',item_count:'10'}});assert.deepStrictEqual(Array.from(automatic.items,x=>x.sense_id),['sense-bank-1'],'automatic set uses curriculum confirmed level only');
assert.strictEqual(ctx.handleCreateVocabularySetV1_({token:'teacher',request_id:'archive-reject',title:'archive check',sense_ids:['sense-bank-2'],level:'V2',selection_type:'importance'}).body,'invalid sense','automatic archive selection is rejected');
assert.strictEqual(ctx.handleListVocabularySensesV1_({parameter:{token:'teacher',vocab_id:'v-bank'}}).items.length,2,'same spelling keeps distinct senses');
let created=ctx.handleCreateVocabularySetV1_({token:'teacher',request_id:'integration-set',sense_ids:['sense-bank-1','sense-bank-2'],level:'V1',title:'snapshot test',selection_type:'manual',hook:'https://example.test/exec'}).body;
assert(created.startsWith('ok:'));let setId=created.split(':')[1],snapshot=sheets.VocabSetItemsV2.rows.filter(r=>r[1]===setId);assert.strictEqual(snapshot.length,2);assert.strictEqual(snapshot[0][5],'sense-bank-1');assert.strictEqual(snapshot[0][6],'bank');assert.strictEqual(snapshot[0][7],'은행');
let assigned=ctx.handleCreateAssignmentV2_({student_ids:[student],content_type:'VOCAB',content_ref_id:setId,title:'DB vocab assignment'}).body;assert(assigned.startsWith('ok:'));let login=ctx.studentAssignmentLoginFields_(student),myAssignments=ctx.handleListMyAssignmentsV2_({parameter:{student_id:student,assignmentCapability:login.assignmentCapability}}),card=myAssignments.assignments.find(x=>x.content_ref_id===setId);assert(card&&card.content_link.includes('server_set=1'));
let fetched=ctx.handleFetchVocabularySetV1_({parameter:{key:created.split(':')[2],assignment_target_id:card.assignment_target_id,student_id:student,assignmentCapability:card.launch_capability,hook:'https://example.test/exec'}});assert.strictEqual(fetched.found,true);assert.strictEqual(fetched.payload.w.length,2);assert.strictEqual(fetched.payload.w[0].id,'sense-bank-1');assert(fetched.attempt_id,'assignment fetch creates/reuses V2 attempt');
// The bounded creator's compatibility append must feed the real result/review consumers.
const vocabAttempt=ctx.attemptByIdV2_(fetched.attempt_id),wordItemId=crypto.randomUUID();
sheets.WordAttemptItemsV2.appendRow([wordItemId,vocabAttempt[0],'sense-bank-1',false,3,true,now,now,now,now]);
const attemptDetail=ctx.handleGetAttemptDetailV2Enhanced_({parameter:{token:'teacher',attempt_id:vocabAttempt[0]}});
assert.strictEqual(attemptDetail.word_items[0].term,snapshot[0][6]);assert.strictEqual(attemptDetail.word_items[0].meaning,snapshot[0][7]);
ctx.recordReviewOutcomeV2_(vocabAttempt,'WORD','sense-bank-1','',true,wordItemId,1,3);
const createdReview=ctx.reviewItemRowV2_(student,'WORD','sense-bank-1','');
const createdHistory=ctx.handleGetReviewItemHistoryV2_({parameter:{token:'teacher',student_id:student,review_item_id:createdReview[0]}});
assert.strictEqual(createdHistory.item.display,snapshot[0][6]);assert.strictEqual(createdHistory.item.meaning,snapshot[0][7]);
const reviewAccess=ctx.wrongnoteAccessV2_({parameter:{token:'teacher',student_id:student}});
const createdContext=ctx.wrongnoteContextV2_(reviewAccess,{itemsOnly:true,track:'VOCAB'});
assert.strictEqual(ctx.wrongnotePublicReviewV2_(createdContext,createdReview).meaning,snapshot[0][7]);
const teacherDetail=ctx.handleGetTeacherDashboardV2_({parameter:{token:'teacher',student_id:student}});
assert(JSON.stringify(teacherDetail).includes(snapshot[0][7]),'teacher detail resolves bounded compatibility metadata');
ctx.handleUpdateVocabularySenseV1_({sense_id:'sense-bank-1',meaning:'금융기관'});snapshot=sheets.VocabSetItemsV2.rows.filter(r=>r[1]===setId);assert.strictEqual(snapshot[0][7],'은행','confirmed set snapshot is immutable');
assert(ctx.handleStageVocabularyImportV1_({request_id:'import-level',rows:[Object.assign({},importRows[0],{source_row:4,level:'V3',meaning:'금융기관'})]}).body.startsWith('ok:'));
ctx.handlePreviewVocabularyImportV1_({request_id:'import-level',source_file:'db2.xlsx'});ctx.handleCommitVocabularyImportV1_({request_id:'import-level'});
let bank=sheets.VocabularyDB.rows.find(r=>r[0]==='sense-bank-1');assert.strictEqual(bank[4],'V1','confirmed level comes from confirmed_level');assert.strictEqual(bank[19],'V1','explicit confirmed_level is stored');assert.strictEqual(bank[14],true,'curriculum flag is stored');assert.strictEqual(bank[16],false,'curriculum item is not archive-only');
const finalRows=require('./helpers/final-vocabulary').readFinalVocabulary().rows;assert.strictEqual(finalRows.length,3200);assert.strictEqual(finalRows.reduce((n,r,i)=>n+ctx.normalizeVocabularyImportRowV1_(r,i+2).errors.length,0),0);
console.log('vocabulary_db_integration.test.js: all assertions passed');`);
source=source.replace("SpreadsheetApp:{getActiveSpreadsheet:()=>ss", "SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}");
vm.runInThisContext('(function(require){'+source+'\n})',{filename:'vocabulary_db_integration.test.js'})(require);

const backend=fs.readFileSync('exam/sheet_backend.gs','utf8'),ui=fs.readFileSync('teacher/vocabulary-db.html','utf8'),vocab=fs.readFileSync('vocab/index.html','utf8');
['stageVocabularyImportV1','previewVocabularyImportV1','commitVocabularyImportV1','getVocabularyImportStatusV1','inspectVocabularyStagingStateV1','listVocabularyDbV1','previewVocabularySetV1','createVocabularySetV1','fetchVocabularySetV1'].forEach(action=>assert(backend.includes("'"+action+"'"),action+' route exists'));
assert(ui.includes('ELAB_Import'));assert(ui.includes('sense_id'));assert(ui.includes("slice(i,i+300)"));assert(ui.includes('확인 후 실제 반영'));assert(vocab.includes("q.get('server_set')==='1'"));assert(vocab.includes('fetchVocabularySetV1'));
