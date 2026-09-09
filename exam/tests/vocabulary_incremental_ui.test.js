'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const ui=fs.readFileSync('teacher/vocabulary-db.html','utf8');
const source=ui.slice(ui.indexOf('async function editSense(id)'),ui.indexOf('async function showRelated'));
function fixture(overrides={}) {
  const state={reads:0,posts:[],reloads:0,message:{textContent:''}},prompts=['false',"'literal meaning",'V3'];
  const ctx={localMode:false,crypto:{randomUUID:()=> 'fixture-id'},cfg:()=>({url:'https://example.test/exec',token:'fixture-token'}),
    $:()=>state.message,prompt:()=>prompts.shift(),confirm:()=>true,
    read:async()=>{state.reads++;return {ok:true,fingerprint:'a'.repeat(64),item:{word:'old',meaning:'old',confirmed_level:'V2'}};},
    fetch:async(url,options)=>{state.posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,code:'UPDATED'})};},
    loadDb:async()=>{state.reloads++;},...overrides};vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,state};
}
(async()=>{
  let count=0;
  async function test(name,fn){await fn();count++;console.log('PASS '+name);}
  await test('edit sends separate UPDATE with original fingerprint and literal values',async()=>{const f=fixture();await f.ctx.editSense('sense-fixture');const p=f.state.posts[0];assert.strictEqual(p.action,'updateVocabularyDbItemV1');assert.strictEqual(p.expected_current_fingerprint,'a'.repeat(64));assert.strictEqual(p.request_id,'vocab-edit-fixture-id');assert.strictEqual(p.changes.word,'false');assert.strictEqual(p.changes.meaning,"'literal meaning");assert.strictEqual(p.changes.confirmed_level,'V3');assert.strictEqual(f.state.posts.length,1);assert.strictEqual(f.state.reloads,1);});
  await test('local XLSX review mode performs no READ or POST',async()=>{const f=fixture({localMode:true});await f.ctx.editSense('x');assert.strictEqual(f.state.reads,0);assert.strictEqual(f.state.posts.length,0);});
  await test('undeployed fingerprint endpoint fails closed before POST',async()=>{const f=fixture({read:async()=>({})});await f.ctx.editSense('x');assert.strictEqual(f.state.posts.length,0);assert(f.state.message.textContent.includes('원본'));});
  await test('cancel prompt does not send',async()=>{const f=fixture({prompt:()=>null});await f.ctx.editSense('x');assert.strictEqual(f.state.posts.length,0);});
  await test('stale update displays conflict, no automatic retry or success reload',async()=>{let calls=0;const f=fixture({fetch:async()=>{calls++;return {ok:true,json:async()=>({ok:false,code:'STALE_UPDATE'})};}});await f.ctx.editSense('x');assert.strictEqual(calls,1);assert.strictEqual(f.state.reloads,0);assert(f.state.message.textContent.includes('다른 수정'));});
  await test('network uncertainty never retries',async()=>{let calls=0;const f=fixture({fetch:async()=>{calls++;throw Error('Network failed');}});await f.ctx.editSense('x');assert.strictEqual(calls,1);assert.strictEqual(f.state.reloads,0);});
  console.log(JSON.stringify({tests:count,passed:count,operating_requests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
