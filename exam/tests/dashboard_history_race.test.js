const assert=require('assert'),fs=require('fs'),vm=require('vm');

const source=fs.readFileSync('teacher/dashboard.html','utf8');
const start=source.indexOf('function loadHistory(reset)'),end=source.indexOf('\nhistorySelect.addEventListener',start);
assert(start>=0&&end>start,'loadHistory source exists');
const loadHistorySource=source.slice(start,end);

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function flush(){return new Promise(resolve=>setImmediate(resolve))}
function harness(){
  const requests=[],renders=[];
  const context={
    historyGroups:[],unlinkedAttempts:[],historyCursor:null,historyStudent:'student-a',historyTrack:'',openDates:{},historyGeneration:0,
    historyContent:{innerHTML:''},historyStatus:{className:'',textContent:'',hidden:false},
    historyUrl(cursor){return `student=${this.historyStudent}&track=${this.historyTrack}&cursor=${cursor}`},
    fetchJsonpObject(url){const request=deferred();requests.push({url,...request});return request.promise},
    renderHistory(student){renders.push({student})},
    Error
  };
  vm.createContext(context);vm.runInContext(loadHistorySource+'\nthis.loadHistory=loadHistory;',context);
  return{context,requests,renders};
}
const group=(id,attempts=[])=>({lesson_date:id,attempts});
const attempt=id=>({attempt_id:id});

(async()=>{
  {
    const h=harness();h.context.loadHistory(true);
    h.context.historyTrack='PRACTICE_EXAM';h.context.loadHistory(true);
    h.requests[1].resolve({groups:[group('practice',[attempt('practice-1')])],unlinked_attempts:[],next_cursor:null,student:{name:'A'}});await flush();
    h.requests[0].resolve({groups:[group('all',[attempt('practice-1')])],unlinked_attempts:[attempt('stale-unlinked')],next_cursor:'stale-cursor',student:{name:'A'}});await flush();
    assert.strictEqual(h.context.historyGroups.length,1);
    assert.strictEqual(h.context.historyGroups[0].lesson_date,'practice');
    assert.strictEqual(h.context.unlinkedAttempts.length,0,'late stale response does not append unlinked attempts');
    assert.strictEqual(h.context.historyCursor,null,'late stale response does not replace cursor');
    assert.strictEqual(h.context.historyStatus.hidden,true,'late stale response does not replace loading state');
    assert.strictEqual(h.renders.length,1,'late stale response does not render');
  }
  {
    const h=harness();h.context.loadHistory(true);
    h.context.historyTrack='PRACTICE_EXAM';h.context.loadHistory(true);
    h.requests[0].resolve({groups:[group('all')],unlinked_attempts:[attempt('stale-unlinked')],next_cursor:'stale-cursor',student:{name:'A'}});await flush();
    assert.strictEqual(h.context.historyGroups.length,0,'early stale response is discarded');
    assert.strictEqual(h.context.unlinkedAttempts.length,0,'early stale response does not append unlinked attempts');
    assert.strictEqual(h.context.historyCursor,null,'early stale response does not replace cursor');
    assert.strictEqual(h.renders.length,0,'early stale response does not render');
    h.requests[1].resolve({groups:[group('practice')],unlinked_attempts:[],next_cursor:null,student:{name:'A'}});await flush();
    assert.strictEqual(h.context.historyGroups.length,1);
    assert.strictEqual(h.context.historyGroups[0].lesson_date,'practice');
    assert.strictEqual(h.renders.length,1,'only current filter response renders');
  }
  {
    const h=harness();h.context.loadHistory(true);
    h.context.historyStudent='student-b';h.context.loadHistory(true);
    h.requests[0].resolve({groups:[group('student-a')],unlinked_attempts:[],next_cursor:null,student:{name:'A'}});await flush();
    h.requests[1].resolve({groups:[group('student-b')],unlinked_attempts:[],next_cursor:null,student:{name:'B'}});await flush();
    assert.strictEqual(h.context.historyGroups.length,1);
    assert.strictEqual(h.context.historyGroups[0].lesson_date,'student-b');
    assert.strictEqual(h.renders.length,1,'only current student response renders');
    assert.strictEqual(h.renders[0].student.name,'B');
  }
  {
    const h=harness();h.context.loadHistory(true);
    h.requests[0].resolve({groups:[group('page-1')],unlinked_attempts:[attempt('unlinked-1')],next_cursor:'10',student:{name:'A'}});await flush();
    h.context.loadHistory(false);
    assert(h.requests[1].url.includes('cursor=10'));
    h.requests[1].resolve({groups:[group('page-2')],unlinked_attempts:[attempt('unlinked-2')],next_cursor:null,student:{name:'A'}});await flush();
    assert.strictEqual(h.context.historyGroups.length,2);
    assert.strictEqual(h.context.historyGroups[0].lesson_date,'page-1');
    assert.strictEqual(h.context.historyGroups[1].lesson_date,'page-2');
    assert.strictEqual(h.context.unlinkedAttempts.length,2);
    assert.strictEqual(h.context.unlinkedAttempts[0].attempt_id,'unlinked-1');
    assert.strictEqual(h.context.unlinkedAttempts[1].attempt_id,'unlinked-2');
    assert.strictEqual(h.renders.length,2,'each page in the current generation renders');
  }
  {
    const h=harness(),sameDate=group('2026-09-04',[attempt('attempt-1'),attempt('attempt-2')]);h.context.loadHistory(true);
    h.requests[0].resolve({groups:[sameDate],unlinked_attempts:[],next_cursor:null,student:{name:'A'}});await flush();
    assert.strictEqual(h.context.historyGroups[0].attempts.length,2);
    assert.strictEqual(h.context.historyGroups[0].attempts[0].attempt_id,'attempt-1');
    assert.strictEqual(h.context.historyGroups[0].attempts[1].attempt_id,'attempt-2');
  }
  console.log('dashboard_history_race.test.js: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1});
