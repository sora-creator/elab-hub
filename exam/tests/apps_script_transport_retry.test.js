const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('shared/appsScriptTransport.js','utf8');

function response(status,body){return{status,ok:status>=200&&status<300,redirected:true,type:'cors',url:'https://script.googleusercontent.com/macros/echo',text:async()=>body}}
async function run(sequence){
  const calls=[];
  const context={window:{location:{href:'http://localhost/'}},URL,AbortController,setTimeout,clearTimeout,Promise,fetch:async(url,options)=>{calls.push({url,options});return sequence.shift()}};
  vm.createContext(context);vm.runInContext(source,context);
  return{calls,read:context.window.ELABAppsScript.read};
}

(async()=>{
  let h=await run([response(404,''),response(200,'{"found":true}')]);
  const result=await h.read('https://example.invalid/apps-script-endpoint');
  assert.strictEqual(result.found,true);
  assert.strictEqual(h.calls.length,2);assert(h.calls.every(x=>x.options.method==='GET'));

  h=await run([response(404,''),response(404,'')]);
  await assert.rejects(h.read('https://example.invalid/apps-script-endpoint'),e=>e.code==='HTTP_ERROR'&&e.status===404);
  assert.strictEqual(h.calls.length,2);

  h=await run([response(403,'')]);
  await assert.rejects(h.read('https://example.invalid/apps-script-endpoint'),e=>e.code==='HTTP_ERROR'&&e.status===403);
  assert.strictEqual(h.calls.length,1);

  h=await run([response(200,'not json')]);
  await assert.rejects(h.read('https://example.invalid/apps-script-endpoint'),e=>e.code==='PARSE_ERROR');
  assert.strictEqual(h.calls.length,1);

  h=await run([response(200,'{"error":"forbidden"}')]);
  await assert.rejects(h.read('https://example.invalid/apps-script-endpoint'),e=>e.code==='AUTH_ERROR');
  assert.strictEqual(h.calls.length,1);

  assert.strictEqual(/method:'POST'/.test(source),false);
  console.log('apps_script_transport_retry.test.js: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1});
