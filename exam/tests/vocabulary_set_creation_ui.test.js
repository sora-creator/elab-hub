'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const ui=fs.readFileSync('teacher/vocabulary-db.html','utf8');
const source=ui.slice(ui.indexOf('async function createSet(){'),ui.indexOf("$('#createSet').onclick=createSet;"));
function fixture(overrides={},storage={}){
  const state={posts:[],redirects:0,storage,elements:{}};
  for(const [id,value] of Object.entries({setTitle:'encompass snapshot',setLevel:'V3',selection:'importance',createSet:'',setMsg:''}))state.elements['#'+id]={value,disabled:false,textContent:''};
  const ctx={localMode:false,selectionRows:[{sense_id:'SEN_F569181B855E'}],crypto:{randomUUID:()=> 'fixture-uuid'},
    localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]},
    $:id=>state.elements[id],cfg:()=>({url:'https://example.test/exec',token:'fixture-token'}),
    fetch:async(url,options)=>{state.posts.push({url,options,payload:JSON.parse(options.body)});return {ok:true,text:async()=> 'ok:fixture-set:fixture-session'};},
    setTimeout:()=>{state.redirects++;},...overrides};
  vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,state};
}
(async()=>{
  let n=0;const test=async(name,fn)=>{await fn();n++;console.log('PASS '+name);};
  await test('request id and exact sense, response-readable POST before success',async()=>{const e=fixture();await e.ctx.createSet();assert.strictEqual(e.state.posts.length,1);const p=e.state.posts[0];assert.strictEqual(p.payload.request_id,'vocab-set-fixture-uuid');assert.deepStrictEqual(p.payload.sense_ids,['SEN_F569181B855E']);assert.strictEqual(p.payload.selection_type,'manual');assert.notStrictEqual(p.options.mode,'no-cors');assert.strictEqual(e.state.redirects,1);assert.deepStrictEqual(e.state.storage,{});});
  await test('local mode no network or pending receipt',async()=>{const e=fixture({localMode:true});await e.ctx.createSet();assert.strictEqual(e.state.posts.length,0);assert.deepStrictEqual(e.state.storage,{});});
  await test('empty name fails before network/storage',async()=>{const e=fixture();e.state.elements['#setTitle'].value=' ';await e.ctx.createSet();assert.strictEqual(e.state.posts.length,0);assert.deepStrictEqual(e.state.storage,{});});
  await test('network loss persists request; double-click/reload never makes a second POST',async()=>{let calls=0;const storage={},e=fixture({fetch:async()=>{calls++;throw Error('fixture connection loss');}},storage);await e.ctx.createSet();await e.ctx.createSet();const reloaded=fixture({},storage);await reloaded.ctx.createSet();assert.strictEqual(calls,1);assert.strictEqual(reloaded.state.posts.length,0);assert.strictEqual(storage['vocabulary.set-create.pending.v1'],'vocab-set-fixture-uuid');assert.strictEqual(e.state.redirects,0);assert(!JSON.stringify(storage).includes('token'));});
  for(const result of ['PARTIAL_SET_CREATE','WORD_COMPAT_CONFLICT','SET_SCHEMA_NOT_READY',''])await test('no success on '+(result||'opaque/empty')+' response',async()=>{const e=fixture({fetch:async()=>({ok:true,text:async()=>result})});await e.ctx.createSet();assert.strictEqual(e.state.redirects,0);assert(e.state.storage['vocabulary.set-create.pending.v1']);assert(e.state.elements['#setMsg'].textContent.includes('확인 실패'));});
  console.log(JSON.stringify({tests:n,passed:n,operating_requests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
