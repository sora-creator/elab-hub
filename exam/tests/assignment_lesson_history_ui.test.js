const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('teacher/assignments.html','utf8');
const backend=fs.readFileSync('exam/sheet_backend.gs','utf8');

assert(html.includes('2. 이전 수업 과제'));
assert(html.includes('id="toggleLessonHistory"'));
assert(html.includes("action=listHomeworkBatchesV2"));
assert(html.includes('lessonHistoryDate(batch.lesson_date)'));
assert(html.includes('HomeworkBatch의 수업일을 기준으로 확인합니다.'));
assert(html.includes('학생별 과제 이력이 다릅니다.'));
assert(html.includes('lessonHistorySignature'));
assert(html.includes('최근 수업 Vocabulary:'));
assert(html.includes("toggleFixedSetCart(set,report.statuses[set.number]||'')"));
assert(html.includes("action=inCart?'과제목록에 추가됨':status?'재배정':'선택'"));
assert(html.includes('data-fixed-index='));
assert(html.includes('data-cart-remove='));
assert(html.indexOf('1. 학생 또는 그룹 선택')<html.indexOf('2. 이전 수업 과제'));
assert(html.indexOf('2. 이전 수업 과제')<html.indexOf('3. 이번 수업 과제자료 선택'));
assert(html.indexOf('3. 이번 수업 과제자료 선택')<html.indexOf('4. 이번 수업 과제목록'));
assert(html.indexOf('4. 이번 수업 과제목록')<html.indexOf('5. 수업일·마감일'));
assert(backend.includes("HOMEWORK_BATCHES_V2_HEADERS = ['homework_batch_id', 'teacher_id', 'student_id', 'lesson_date'"));
assert(backend.includes("if (action === 'listHomeworkBatchesV2')"));

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
scripts.forEach((script,i)=>new vm.Script(script,{filename:'assignments-inline-'+i+'.js'}));
console.log('assignment_lesson_history_ui.test.js: all assertions passed');
