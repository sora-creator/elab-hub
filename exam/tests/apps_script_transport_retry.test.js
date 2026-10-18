const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('shared/appsScriptTransport.js','utf8');

function response(status,body){return{status,ok:status>=200&&status<300,redirected:true,type:'cors',url:'https://script.googleusercontent.com/macros/echo',text:async()=>body}}
function harness(fetchImpl,traceImpl){
  const calls=[],traces=[],timers=new Set();
  function trackedSetTimeout(fn,ms){let handle=setTimeout(()=>{timers.delete(handle);fn()},ms);timers.add(handle);return handle}
  function trackedClearTimeout(handle){timers.delete(handle);clearTimeout(handle)}
  const context={window:{location:{href:'http://localhost/'}},URL,AbortController,Promise,Map,setTimeout:trackedSetTimeout,clearTimeout:trackedClearTimeout,fetch:(url,options)=>{calls.push({url,options});return fetchImpl(calls.length,url,options)}};
  vm.createContext(context);vm.runInContext(source,context);
  function read(url,options){return context.window.ELABAppsScript.read(url,Object.assign({onTrace:(event,detail)=>{traces.push({event,detail});if(traceImpl)traceImpl(event,detail)}},options))}
  return{calls,traces,timers,read,api:context.window.ELABAppsScript};
}
const url=action=>'https://example.invalid/apps-script-endpoint?action='+action;
function decision(h,rawErrorClass){
  const failed=h.traces.find(x=>x.event==='FETCH_FAILED'),retry=h.traces.find(x=>x.event==='FETCH_RETRY');
  return{rawErrorClass,timeoutTriggered:!!(failed&&failed.detail.timed_out),abortSignalState:!!(h.calls[0]&&h.calls[0].options.signal&&h.calls[0].options.signal.aborted),normalizedErrorType:failed&&failed.detail.code,retryEligible:!!retry,retryDecision:retry?'RETRY':'FINAL',retryDecisionReason:retry?'RETRYABLE_ERROR':'NON_RETRYABLE_OR_LIMIT'};
}

(async()=>{
  const nativeAbort=()=>new DOMException('The operation was aborted.','AbortError');
  assert.strictEqual(nativeAbort().code,20,'regression requires the native legacy AbortError code');

  // A. First attempt success: no retry, and a caller's longer timeout is capped.
  let h=harness(()=>Promise.resolve(response(200,'{"found":true}')));
  assert.strictEqual((await h.read(url('listStudents'),{timeoutMs:45000})).found,true);
  assert.strictEqual(h.calls.length,1);
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_RETRY').length,0);
  assert.strictEqual(h.traces.find(x=>x.event==='FETCH_START').detail.timeout_ms,18000);
  assert.strictEqual(h.timers.size,0);

  // Native DOMException code=20 must not outrank the transport timeout flag.
  h=harness((attempt,_url,options)=>attempt===1?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(nativeAbort()))):Promise.resolve(response(200,'{"found":true}')));
  assert.strictEqual((await h.read(url('nativeAbort20Timeout'),{timeoutMs:5})).found,true);
  assert.strictEqual(h.calls.length,2);
  assert.strictEqual(h.traces.find(x=>x.event==='FETCH_FAILED').detail.code,'TIMEOUT');
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_RETRY').length,1);

  // B. A delivery hang times out, gets one fresh sequential attempt, then succeeds.
  h=harness((attempt,_url,options)=>attempt===1?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error)})):Promise.resolve(response(200,'{"found":true}')));
  assert.strictEqual((await h.read(url('listStudents'),{timeoutMs:5})).found,true);
  assert.strictEqual(h.calls.length,2);
  assert.notStrictEqual(h.calls[0].options.signal,h.calls[1].options.signal,'retry needs a fresh AbortController');
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_RETRY').length,1);
  assert.strictEqual(h.traces.find(x=>x.event==='FETCH_FAILED').detail.timed_out,true);
  assert.deepStrictEqual(decision(h,'AbortError'),{rawErrorClass:'AbortError',timeoutTriggered:true,abortSignalState:true,normalizedErrorType:'TIMEOUT',retryEligible:true,retryDecision:'RETRY',retryDecisionReason:'RETRYABLE_ERROR'});
  assert.strictEqual(h.timers.size,0);

  // C. A transient fetch/network failure retries once and recovers.
  h=harness(attempt=>attempt===1?Promise.reject(new TypeError('offline')):Promise.resolve(response(200,'{"found":true}')));
  assert.strictEqual((await h.read(url('listGroupsV2'))).found,true);
  assert.strictEqual(h.calls.length,2);
  assert.deepStrictEqual(decision(h,'TypeError'),{rawErrorClass:'TypeError',timeoutTriggered:false,abortSignalState:false,normalizedErrorType:'NETWORK_ERROR',retryEligible:true,retryDecision:'RETRY',retryDecisionReason:'RETRYABLE_ERROR'});

  // D. Two timed-out attempts are bounded and end as TIMEOUT.
  h=harness((_attempt,_url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error)})));
  await assert.rejects(h.read(url('listGroupsV2'),{timeoutMs:5}),error=>error.code==='TIMEOUT');
  assert.strictEqual(h.calls.length,2);
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_RETRY').length,1);
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_FAILED'&&x.detail.code==='TIMEOUT').length,2);
  assert.strictEqual(h.timers.size,0);

  // A real external/client abort is distinct and is not retried.
  h=harness(()=>{const error=new Error('aborted');error.name='AbortError';return Promise.reject(error)});
  await assert.rejects(h.read(url('listGroupsV2')),error=>error.code==='ABORT_ERROR');
  assert.strictEqual(h.calls.length,1);
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_RETRY').length,0);

  // The same native code=20 without a transport timeout is a final external abort.
  h=harness(()=>Promise.reject(nativeAbort()));
  await assert.rejects(h.read(url('nativeAbort20External')),error=>error.code==='ABORT_ERROR');
  assert.strictEqual(h.calls.length,1);
  assert.strictEqual(h.traces.find(x=>x.event==='FETCH_FAILED').detail.code,'ABORT_ERROR');
  assert.strictEqual(h.traces.filter(x=>x.event==='FETCH_RETRY').length,0);

  // E-G. Application/auth/parse failures are final and never retried.
  for(const item of [
    {body:'{"error":"forbidden"}',code:'AUTH_ERROR'},
    {body:'{"error":"business rule failed"}',code:'SERVER_ERROR'},
    {body:'not json',code:'PARSE_ERROR'}
  ]){
    h=harness(()=>Promise.resolve(response(200,item.body)));
    await assert.rejects(h.read(url('listAssignmentsV2')),error=>error.code===item.code);
    assert.strictEqual(h.calls.length,1,item.code+' must not retry');
    assert.strictEqual(h.timers.size,0);
  }

  // Diagnostic callbacks cannot interrupt the retry decision or cleanup path.
  h=harness(attempt=>attempt===1?Promise.reject(new TypeError('offline')):Promise.resolve(response(200,'{"found":true}')),(event)=>{if(event==='FETCH_FAILED')throw new Error('diagnostic failed')});
  assert.strictEqual((await h.read(url('listGroupsV2'))).found,true);
  assert.strictEqual(h.calls.length,2);
  assert.strictEqual(h.timers.size,0);

  // G. Concurrent callers share one logical transport chain.
  let release;
  h=harness(()=>new Promise(resolve=>{release=()=>resolve(response(200,'{"found":true}'))}));
  const shared=Array.from({length:2},()=>h.read(url('listDueVocabReviewsV1')));
  await new Promise(resolve=>setTimeout(resolve,10));release();
  assert.deepStrictEqual((await Promise.all(shared)).map(x=>x.found),[true,true]);
  assert.strictEqual(h.calls.length,1);
  assert.strictEqual(h.traces.filter(x=>x.event==='DEDUPE_HIT').length,1);

  // H. A caller arriving during backoff reuses the same retrying promise.
  h=harness(attempt=>attempt===1?Promise.reject(new TypeError('offline')):Promise.resolve(response(200,'{"found":true}')));
  const retrying=h.read(url('listAssignmentContentV2'));
  await new Promise(resolve=>setTimeout(resolve,20));
  const third=h.read(url('listAssignmentContentV2'));
  assert.strictEqual((await Promise.all([retrying,third])).length,2);
  assert.strictEqual(h.calls.length,2);
  assert.strictEqual(h.traces.filter(x=>x.event==='DEDUPE_HIT').length,1);

  // I. Final failure clears timers and in-flight state, allowing a fresh call.
  h=harness(attempt=>attempt<=2?Promise.reject(new TypeError('offline')):Promise.resolve(response(200,'{"found":true}')));
  await assert.rejects(h.read(url('listHomeworkBatchesV2')),error=>error.code==='NETWORK_ERROR');
  assert.strictEqual(h.calls.length,2);
  assert.strictEqual(h.timers.size,0);
  assert.strictEqual((await h.read(url('listHomeworkBatchesV2'))).found,true);
  assert.strictEqual(h.calls.length,3,'failed logical request must leave no stale in-flight entry');
  assert.strictEqual(h.timers.size,0);

  // Existing transient HTTP behavior remains bounded to two attempts.
  h=harness(attempt=>Promise.resolve(attempt===1?response(404,''):response(200,'{"found":true}')));
  assert.strictEqual((await h.read(url('listStudents'))).found,true);
  assert.strictEqual(h.calls.length,2);

  // H/J. This shared API remains GET/read-only; a write network retry surface is absent.
  h=harness(()=>Promise.reject(new Error('unused')));
  assert.strictEqual(typeof h.api.write,'undefined');
  assert.match(source,/method:'GET'/);
  assert.doesNotMatch(source,/method:'POST'/);

  console.log('apps_script_transport_retry.test.js: A-J resilience assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1});
