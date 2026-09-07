const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('teacher/assignments.html','utf8');
assert(!html.includes("finalAssign.addEventListener('click',function(){setTimeout"));
assert(html.includes("sessionStorage.removeItem('elab.assignment.draft.v2')"));
assert(html.includes('pendingItems.forEach(function(item){byKey.set(contentKey(item),item)});serverItems.forEach'));
assert(html.includes('indexByKey.get(contentKey(ref))'));
assert(html.includes('assignmentDraft.pendingItems=unresolved'));
assert(html.includes('applyWorkspace({students:cachedRoster(),groups:[],items:[],assignments:[]});load()'));

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
scripts.forEach((script,i)=>new vm.Script(script,{filename:'assignments-inline-'+i+'.js'}));

function restore(items,pending,cart){const byKey=new Map(),indexByKey=new Map(),key=x=>x.content_type+'|'+x.content_ref_id;pending.forEach(x=>byKey.set(key(x),x));items.forEach(x=>byKey.set(key(x),x));const serverKeys=new Set(items.map(key)),unresolved=pending.filter(x=>!serverKeys.has(key(x))),content=Array.from(byKey.values());content.forEach((x,i)=>indexByKey.set(key(x),i));return{content,unresolved,selected:cart.map(x=>indexByKey.get(key(x))).filter(x=>x!==undefined)}}
for(const count of [2,20,27,1000]){const items=Array.from({length:count},(_,i)=>({content_type:'VOCAB',content_ref_id:'set-'+i,source:'server'})),pending=items.concat([{content_type:'SENTENCE_STRUCTURE',content_ref_id:'new',source:'pending'}]),start=Date.now(),local=restore([],pending,[pending[pending.length-1]]),out=restore(items,pending,[items[0],pending[pending.length-1]]);assert.strictEqual(local.content.length,count+1);assert.deepStrictEqual(local.selected,[count]);assert.strictEqual(out.content.length,count+1);assert.strictEqual(out.unresolved.length,1);assert.strictEqual(out.content[0].source,'server');assert.deepStrictEqual(out.selected,[0,count]);assert(Date.now()-start<100);}
console.log('assignment_roundtrip_hang.test.js: all assertions passed');
