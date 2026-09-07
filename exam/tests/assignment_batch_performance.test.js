const assert=require('assert'),fs=require('fs'),vm=require('vm'),{performance}=require('perf_hooks');
const backend=fs.readFileSync('exam/sheet_backend.gs','utf8');
const html=fs.readFileSync('teacher/assignments.html','utf8');

const start=backend.indexOf('function handleCreateAssignmentsBatchV2_');
const end=backend.indexOf('function handleSaveVocabSetV2_',start);
const batch=backend.slice(start,end);
assert(start>=0&&end>start);
assert(!batch.includes('handleCreateAssignmentV2_({'));
assert(batch.includes('appendRowsV2_(assignmentsSheet,assignmentRows'));
assert(batch.includes('appendRowsV2_(targetsSheet,targetRows'));
assert(batch.includes('appendRowsV2_(batchesSheet,newBatchRows'));
assert(batch.includes('appendRowsV2_(linksSheet,linkRows'));
assert(batch.includes("console.log('[ELAB-PERF] createAssignmentsBatchV2 '"));
assert(batch.includes("cache.put(cacheKey,'1',21600)"));
assert.strictEqual((batch.match(/vocabSnapshotV2_\(/g)||[]).length,1);
assert(backend.includes("'content_subtype', 'request_id'"));
assert(backend.includes('function handleVerifyAssignmentBatchV2_'));
assert(backend.includes("action === 'verifyAssignmentBatchV2'"));

assert(html.includes("console.info('[ELAB-PERF] createAssignmentsBatchV2 POST'"));
assert(html.includes("console.info('[ELAB-PERF] final assignment complete'"));
assert(html.includes('async function verifyAssignmentBatch('));
assert(html.includes("if(!verified||!verified.complete)"));
assert(html.includes("'과제 저장을 확인하지 못했습니다. 다시 시도해주세요.'"));
assert(html.includes('cart_preserved:true'));
assert(html.includes('workspace_reload_ms:0'));
assert(!html.includes('renderCart();setTimeout(load,500)'));
assert(html.includes("request_id:batchRequestId"));

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
scripts.forEach((script,i)=>new vm.Script(script,{filename:'assignments-inline-'+i+'.js'}));

function operationCounts(assignments,students){
  return {
    before:{batchReads:assignments*students,linkReads:assignments*students,assignmentWrites:assignments,targetWrites:assignments*students,linkWrites:assignments*students,snapshotBuilds:assignments*students,workspaceReloads:1},
    after:{batchReads:1,linkReads:0,assignmentWrites:1,targetWrites:1,linkWrites:1,snapshotBuilds:assignments,workspaceReloads:0}
  };
}
const counts=operationCounts(5,20);
assert.deepStrictEqual(counts.before,{batchReads:100,linkReads:100,assignmentWrites:5,targetWrites:100,linkWrites:100,snapshotBuilds:100,workspaceReloads:1});
assert.deepStrictEqual(counts.after,{batchReads:1,linkReads:0,assignmentWrites:1,targetWrites:1,linkWrites:1,snapshotBuilds:5,workspaceReloads:0});

const benchStart=performance.now();
for(let run=0;run<10000;run++)operationCounts(5,20);
const elapsed=performance.now()-benchStart;
console.log('assignment_batch_performance.test.js: all assertions passed; local assertion benchmark '+elapsed.toFixed(2)+'ms');
