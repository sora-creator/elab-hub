const assert=require('assert'),fs=require('fs'),vm=require('vm');
const backend=fs.readFileSync('exam/sheet_backend.gs','utf8');
const html=fs.readFileSync('teacher/assignments.html','utf8');

new vm.Script(backend,{filename:'sheet_backend.gs'});
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
scripts.forEach((script,i)=>new vm.Script(script,{filename:'assignments-inline-'+i+'.js'}));

assert(backend.includes('assignmentContentSummaryRows_(EXAMS_SHEET,EXAMS_HEADERS,4,perf)'));
assert(backend.includes('assignmentContentSummaryRows_(GRAMMAR_SHEET,GRAMMAR_HEADERS,3,perf)'));
assert(backend.includes('assignmentContentSummaryRows_(GRAMMAR_FINALS_SHEET,GRAMMAR_FINALS_HEADERS,2,perf)'));
assert(backend.includes('assignmentContentSummaryRows_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS,2,perf)'));
assert(backend.includes('assignmentContentSummaryRows_(PRACTICE_SHEET,PRACTICE_HEADERS,3,perf)'));
assert.strictEqual((backend.match(/\[ELAB-PERF\]\[ASSIGNMENT\]/g)||[]).length,2);
assert(!html.includes('listAssignmentContentV2 fallback'));
assert(html.includes("cfgStatus.textContent='과제 정보를 불러오는 중...'"));
assert.strictEqual((html.match(/base\+'&action=listAssignmentContentV2'/g)||[]).length,1);

console.log('assignment_content_performance.test.js: all assertions passed');
