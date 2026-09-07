const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('exam/tests/review_0f.test.js','utf8');
src=src.replace("console.log('review_0f.test.js: all assertions passed');",`
const assignmentId=crypto.randomUUID(),targetId=crypto.randomUUID();
sheets.AssignmentsV2.appendRow([assignmentId,teacher,'READING','exam','독해 숙제','',now,'',true,now,now,'']);
sheets.AssignmentTargetsV2.appendRow([targetId,assignmentId,student,'IN_PROGRESS',now,'',true,now,now]);
sheets.AttemptsV2.appendRow(attempt);
sheets.QuestionAttemptItemsV2.appendRow(['dashboard-item',attempt[0],q.question_id,1,'2',false,'AUTO_GRADED',120000,1,true,now,now,now]);
sheets.SentenceStructureDetailsV2.appendRow([sItem[0],'[0]','[1]','[0]','[1]',true,false,now,now,sentenceQ,'[]','[]','[]','[]','[]',1500,now]);
const dash=ctx.handleGetTeacherDashboardV2_({parameter:{token:'teacher',days:'7',group_id:'',student_id:''}});
assert.strictEqual(dash.summary.active_students,1);assert.strictEqual(dash.summary.incomplete_students,1);assert.strictEqual(dash.students[0].areas.READING.assigned,1);assert.strictEqual(dash.students[0].areas.GRAMMAR.assigned,0);assert.strictEqual(dash.students[0].accuracy_by_category[0].total,1);assert.strictEqual(dash.students[0].accuracy_by_category[0].average_elapsed_ms,120000);assert.strictEqual(dash.students[0].status,'CHECK');
assert.strictEqual(dash.students[0].subject_accuracy,100);assert.strictEqual(dash.students[0].main_verb_accuracy,0);assert.strictEqual(dash.students[0].recent10_subject_accuracy,100);assert.strictEqual(dash.students[0].recent10_main_verb_accuracy,0);assert(dash.students[0].sentence_structure_observation.includes('본동사 식별'));
assert.strictEqual(ctx.handleGetTeacherDashboardV2_({parameter:{token:'student-cap',days:'7'}}).error,'no token');
const dashboardUi=fs.readFileSync('teacher/dashboard.html','utf8'),studentsUi=fs.readFileSync('teacher/students.html','utf8');
assert(dashboardUi.includes('활성 학생'));assert(!dashboardUi.includes('반복 오답 학생'));assert(dashboardUi.includes('<th>학생</th><th>단어</th><th>문장구조</th><th>문법</th><th>독해</th>'));assert(dashboardUi.includes('미배정'));assert(dashboardUi.includes("cardFilter==='INCOMPLETE'"));assert(studentsUi.includes('수강종료'));assert(studentsUi.includes('data-copy-id'));
console.log('dashboard_0g.test.js: all assertions passed');`);
vm.runInThisContext('(function(require){'+src+'\n})',{filename:'dashboard_0g.test.js'})(require);
