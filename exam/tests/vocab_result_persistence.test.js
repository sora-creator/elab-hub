const assert=require('assert'),crypto=require('crypto'),fs=require('fs');
const {createSubmitMock}=require('./helpers/vocab-submit-mock.cjs');
const env=createSubmitMock(),{ctx,sheets,properties:props}=env;
const now=new Date(),teacher=props.DEFAULT_TEACHER_ID,student=crypto.randomUUID(),assignment=crypto.randomUUID(),target=crypto.randomUUID();
sheets.StudentsV2.appendRow([student,teacher,'테스트학생','고1',true,now,now]);
sheets.AssignmentsV2.appendRow([assignment,teacher,'VOCAB','vocab-set-1','V3 Set 01','',now,'',true,now,now,'FIXED','request-assignment']);
sheets.AssignmentTargetsV2.appendRow([target,assignment,student,'NOT_STARTED','','',true,now,now]);
sheets.VocabSetsV2.appendRow(['vocab-set-1',teacher,'fixed-session-1','V3 Set 01','V3','https://example.test/vocab',true,now,now,'V3','',1,2,'1~2','FIXED',2,'catalog-v3',1,'[]']);
for(const [id,term,meaning] of [['word-a','apple','사과'],['word-b','book','책']]){
 sheets.WordsV2.rows.push([id,'vocab-set-1',term,meaning,true,now,now]);
 sheets.VocabSetItemsV2.rows.push([crypto.randomUUID(),'vocab-set-1',id,sheets.VocabSetItemsV2.rows.length,now,'','','','']);
}
const expiredLaunch=ctx.createStudentCapability_('assignmentTarget',target,['launchAssignment'],{student_id:student},Date.now()-1000);
assert.strictEqual(ctx.verifyStudentCapability_(expiredLaunch,'launchAssignment','assignmentTarget',target,{student_id:student}),false);
assert.strictEqual(ctx.verifyStudentCapabilityGrace_(expiredLaunch,'launchAssignment','assignmentTarget',target,{student_id:student},30*24*60*60*1000),true);
const issued=ctx.handleIssueVocabCapability_({parameter:{key:'fixed-session-1',assignment_target_id:target,student_id:student,assignmentCapability:expiredLaunch}});
assert.strictEqual(issued.found,true);
const attempt=ctx.attemptByIdV2_(issued.attempt_id),submitCap=issued.attemptCapability;
const verifyCap=issued.attemptCapability;
const words=[{word_id:'word-a',term:'apple',meaning:'사과',first_correct:true,wrong_count:0,final_correct:true},{word_id:'word-b',term:'book',meaning:'책',first_correct:false,wrong_count:1,final_correct:true}];
const response=ctx.handleSubmitVocabResult_({assignment_target_id:target,student_id:student,attempt_id:attempt[0],attemptCapability:submitCap,vocab_set_id:'vocab-set-1',name:'테스트학생',score:'1/2 (50%)',wordItems:words,repetition_count:1,wrong:['book']});
assert.strictEqual(response.body,'ok');
assert.strictEqual(sheets.AttemptsV2.rows[1][9],'COMPLETED');
assert.strictEqual(sheets.AssignmentTargetsV2.rows[1][3],'COMPLETED');
assert.strictEqual(sheets.WordAttemptItemsV2.rows.filter(r=>r[1]===attempt[0]).length,2);
const verified=ctx.handleVerifyVocabResultV2_({parameter:{attempt_id:attempt[0],assignment_target_id:target,student_id:student,attemptCapability:verifyCap,expected_word_count:'2'}});
assert.strictEqual(verified.complete,true);assert.strictEqual(verified.word_item_count,2);assert.strictEqual(verified.attempt_complete,true);assert.strictEqual(verified.items_complete,true);
assert.strictEqual(sheets.VocabResults.rows.length,2);
console.log('vocab_result_persistence.test.js: all assertions passed');
