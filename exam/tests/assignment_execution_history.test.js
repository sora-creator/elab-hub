const assert=require('assert'),fs=require('fs'),vm=require('vm');
const backend=fs.readFileSync('exam/sheet_backend.gs','utf8');
const student=fs.readFileSync('student/index.html','utf8');
const teacher=fs.readFileSync('teacher/assignments.html','utf8');

assert(backend.includes('function findVocabSetByIdOrSessionV2_'));
assert(backend.includes("contentRef=String(vocabSet[0])"));
assert(backend.includes("contentLink=String(vocabSet[5]||contentLink||'')"));
assert(backend.includes("reason:'VOCAB_SET_NOT_FOUND'"));
assert(backend.includes("reason:'MISSING_SESSION_KEY'"));
assert(backend.includes("reason:'MISSING_CONTENT_LINK'"));
assert(backend.includes("reason:'INVALID_CONTENT_REF'"));
assert(backend.includes('unavailable_reason:availability.reason'));
assert(backend.includes("findVocabSetByIdOrSessionV2_(a[3])"));
assert(student.includes("console.warn('[ELAB assignment unavailable]'"));
assert(student.includes("item.unavailable_reason||'INVALID_CONTENT_REF'"));
assert(teacher.includes('· 직전 수업'));
assert(teacher.includes("state.historyOpen=true"));
assert(teacher.includes("state.historyTargetKey!==targetKey"));

[student,teacher].forEach((html,fileIndex)=>{
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(x=>x[1]).filter(x=>x.trim())
    .forEach((script,i)=>new vm.Script(script,{filename:'assignment-ui-'+fileIndex+'-'+i+'.js'}));
});
console.log('assignment_execution_history.test.js: all assertions passed');
