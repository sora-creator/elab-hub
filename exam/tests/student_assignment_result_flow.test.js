const assert=require('assert'),fs=require('fs'),vm=require('vm');
const backend=fs.readFileSync('exam/sheet_backend.gs','utf8');
const vocab=fs.readFileSync('vocab/index.html','utf8');
const student=fs.readFileSync('student/index.html','utf8');
const teacher=fs.readFileSync('teacher/assignments.html','utf8');

assert(backend.includes("action === 'verifyVocabResultV2'"));
assert(backend.includes('function handleVerifyVocabResultV2_'));
const attemptCapabilityActions=(backend.match(/attemptCapability:createStudentCapability_\('assignmentTarget',targetId,\[([^\]]+)\]/)||[])[1]||'';
['submitAttemptQuestionV2','verifyVocabResultV2','verifyAttemptCompletionV2','completeGrammarActivityV1'].forEach(action=>{
  assert(attemptCapabilityActions.includes("'"+action+"'"),'attempt capability includes '+action);
});
assert(backend.includes('word_item_count:wordCount'));
assert(backend.includes('student_name:student[2]'));
assert(backend.includes('function handleListHomeworkBatchesCachedV2_'));
assert(backend.includes("remove('homework-history-v2-'"));
assert(vocab.includes("action=verifyVocabResultV2"));
assert(vocab.includes('if(saved&&saved.found&&saved.complete){'));
assert(vocab.includes('expected_word_count'));
assert(vocab.includes('elab.vocab.pending-result.'));
assert(vocab.includes('결과 다시 전송'));
assert(backend.includes('itemsComplete=wordCount>0'));
assert(backend.includes('complete:completed&&itemsComplete'));
assert(backend.includes('SpreadsheetApp.flush()'));
assert(vocab.includes('if(state.answerLocked)return'));
assert(vocab.includes('state.answerLocked=true'));
assert(vocab.includes("el.style.pointerEvents='none'"));
assert(vocab.includes("assignmentParams.get('student_name')"));
assert(!vocab.includes('결과 복사해서 선생님께 보내기'));
assert(vocab.includes('결과가 선생님께 전송되었습니다.'));
assert(vocab.includes('결과 저장을 확인하지 못했습니다.'));
assert(student.includes("url.searchParams.set('student_name',item.student_name)"));
assert(teacher.includes('function normalizedLessonHistory'));
assert(teacher.includes('return bt-at'));
assert(teacher.includes('· 직전 수업'));

[vocab,student,teacher].forEach((html,fileIndex)=>{
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim()).forEach((script,i)=>new vm.Script(script,{filename:'student-result-flow-'+fileIndex+'-'+i+'.js'}));
});
console.log('student_assignment_result_flow.test.js: all assertions passed');
