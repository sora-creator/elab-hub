const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const source=fs.readFileSync(path.join(__dirname,'..','sheet_backend.gs'),'utf8');
assert(!source.includes('handleListHomeworkBatchesCachedV2_'),'history read must not depend on a stale cross-request cache');
assert(source.includes("sheet.getRange(2,1,lastRow-1,columnCount).getValues()"),'history reads must be row/column bounded');
assert(source.includes("[ELAB-PERF][HOMEWORK_BATCHES]"),'history read must emit safe stage metrics');
assert(source.includes("handleListHomeworkBatchesV2_(e));"),'dispatcher must use the optimized handler directly');

const rows={
  StudentsV2:[['s1','teacher-1','STAGING Student','TEST',true]],
  HomeworkBatchesV2:[['batch-1','teacher-1','s1','2026-10-02','2026-10-02T00:00:00Z','Lesson',true,'','']],
  HomeworkBatchAssignmentsV2:[['link-1','batch-1','assignment-1','s1','{}','']],
  AssignmentsV2:[['assignment-1','teacher-1','SENTENCE_STRUCTURE','set-1','Three sentences','../sentence-structure/index.html?set_key=set-1','','2026-10-09T00:00:00Z',true,'','', '', '']],
  AssignmentTargetsV2:[['target-1','assignment-1','s1','NOT_STARTED','','',true,'','']]
};
const calls={getDataRange:0,getRange:0,getValues:0,getLastRow:0,getSheetByName:0};
function sheet(name){return{
  getLastRow(){calls.getLastRow++;return (rows[name]||[]).length+1},
  getRange(row,column,count,width){calls.getRange++;assert.strictEqual(row,2);assert.strictEqual(column,1);assert.strictEqual(count,(rows[name]||[]).length);return{getValues(){calls.getValues++;return (rows[name]||[]).map(r=>r.slice(0,width))}}},
  getDataRange(){calls.getDataRange++;throw new Error('getDataRange must not be used by homework history')}
}}
const context={
  console:{log(){}},
  Date,JSON,Math,String,Number,Array,Object,
  PropertiesService:{getScriptProperties(){return{getProperty(key){return key==='TOKEN'?'secret':key==='DEFAULT_TEACHER_ID'?'teacher-1':''}}}},
  SpreadsheetApp:{getActiveSpreadsheet(){return{getSheetByName(name){calls.getSheetByName++;return sheet(name)}}}},
  CacheService:{getScriptCache(){throw new Error('cache must not be used')}},
  LockService:{getScriptLock(){throw new Error('read endpoint must not use a lock')}},
  Utilities:{getUuid(){return'uuid'}},
  Session:{getEffectiveUser(){return{getEmail(){return''}}}},
  ContentService:{MimeType:{JAVASCRIPT:'js'},createTextOutput(){return{setMimeType(){return this}}}}
};
vm.createContext(context);
vm.runInContext(source,context);

const invalid=context.handleListHomeworkBatchesV2_({parameter:{token:'wrong',student_id:'s1'}});
assert.strictEqual(invalid.error,'no token');
assert.strictEqual(calls.getSheetByName,0,'invalid token must not reach spreadsheet reads');

const result=context.handleListHomeworkBatchesV2_({parameter:{token:'secret',student_id:'s1'},__elab_dispatch_started:Date.now()});
assert.strictEqual(result.batches.length,1);
assert.strictEqual(result.batches[0].items.length,1);
assert.strictEqual(result.batches[0].items[0].assignment_id,'assignment-1');
assert.strictEqual(result.perf.sheet_read_count,5);
assert.strictEqual(Array.from(result.perf.reads,x=>x.sheet).join(','),'StudentsV2,HomeworkBatchesV2,HomeworkBatchAssignmentsV2,AssignmentsV2,AssignmentTargetsV2');
assert.strictEqual(calls.getDataRange,0);
assert.strictEqual(calls.getRange,5);
assert.strictEqual(calls.getValues,5);
assert.strictEqual(calls.getLastRow,5);
assert(Number.isFinite(result.perf.total_ms));
console.log('homework batch latency test passed');
