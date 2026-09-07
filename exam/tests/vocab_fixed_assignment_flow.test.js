const assert=require('assert'),fs=require('fs'),vm=require('vm');
const vocab=fs.readFileSync('vocab/index.html','utf8');
const assignments=fs.readFileSync('teacher/assignments.html','utf8');
const progress=require('../../teacher/vocab-fixed-progress.js');

assert(vocab.includes('const chunks=splitFixedVocabSets(ordered,makeCfg.fixedSetSize)'));
assert(!vocab.includes('assignmentPick?[ordered.slice(0'));
assert(vocab.includes('returnSavedVocabToAssignment(saved,false,{catalog_id:catalogId'));
assert(vocab.includes('draft.vocabSelection='));
assert(vocab.includes('selectedSourceFolders='));
assert(vocab.includes('if(addToCart&&!cart.some'));
assert(vocab.includes("extra:Object.assign({session_key:ref},item.extra||{})"));
assert(vocab.includes("set_kind:'FIXED',set_size:setWords.length"));
assert(vocab.includes('catalog_id:catalogId,set_number:setNumber,source_folders_json:JSON.stringify(sourceFolders)'));
assert(vocab.includes("key='fixed_'+stableWordHash(catalogId+'|'+setNumber)"));
assert(assignments.includes('data-fixed-index='));
assert(assignments.includes("toggleFixedSetCart(set,statuses[set.number]||'')"));
assert(assignments.includes("if(status&&!confirm("));
assert(assignments.includes("action=inCart?'과제목록에 추가됨':status?'재배정':'선택'"));
assert(assignments.includes('선택한 단어 범위'));
assert(assignments.includes('생성된 Fixed Set'));
assert(assignments.includes('직전 수업 숙제'));
assert(assignments.includes('학생별 배정 이력 다름'));
assert(assignments.includes('snapshot.vocab_set_id'));
assert(assignments.includes('renderCart();updateSummary();renderVocabFixedProgress()'));
assert.strictEqual((assignments.match(/id="vocabFixedPanel"/g)||[]).length,1);
assert(assignments.indexOf('id="sourceMenus"')<assignments.indexOf('id="vocabFixedPanel"'));
assert(assignments.indexOf('id="vocabFixedPanel"')<assignments.indexOf('id="summary"'));
assert(assignments.includes("panel.scrollIntoView({block:'start'})"));
assert(!assignments.includes("panel.scrollIntoView({behavior:'smooth'"));

const scripts=[...assignments.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
scripts.forEach((script,i)=>new vm.Script(script,{filename:'assignments-inline-'+i+'.js'}));

function split(count,size){return Array.from({length:count},(_,i)=>i+1).reduce((sets,word,i)=>{const index=Math.floor(i/size);(sets[index]||(sets[index]=[])).push(word);return sets},[])}
assert.strictEqual(split(1000,50).length,20);
assert.strictEqual(split(1327,50).length,27);
assert.strictEqual(split(1327,50)[26].length,27);

const content=Array.from({length:20},(_,i)=>({content_type:'VOCAB',content_ref_id:'set-'+(i+1),title:'Set '+String(i+1).padStart(2,'0'),extra:{catalog_id:'catalog-v3',set_number:i+1,source_folders_json:'[]',book_source:'V3',source_ref:'V3',set_kind:'FIXED',set_size:50,range_start:i*50+1,range_end:(i+1)*50}}));
const catalog=progress.fixedCatalogs(content)[0];
assert.deepStrictEqual(catalog.sets.map(set=>set.number),Array.from({length:20},(_,i)=>i+1));
const cart=new Set();cart.add(String(catalog.sets[2].index));
assert.deepStrictEqual(Array.from(cart),['2']);
cart.add(String(catalog.sets[4].index));assert.deepStrictEqual(Array.from(cart),['2','4']);
cart.delete(String(catalog.sets[2].index));assert.deepStrictEqual(Array.from(cart),['4']);

const pending=content.map(item=>({content_type:item.content_type,content_ref_id:item.content_ref_id,title:item.title,content_link:'vocab-link',extra:Object.assign({session_key:item.content_ref_id},item.extra)}));
assert.strictEqual(progress.fixedCatalogs(pending)[0].sets.length,20);
const legacy=[{content_type:'VOCAB',content_ref_id:'legacy',title:'Legacy 1~12',extra:{set_kind:'FIXED',range_start:1,range_end:12}}];
assert.strictEqual(progress.fixedCatalogs(legacy).length,0);
const multiSource=JSON.parse(JSON.stringify(content[0]));multiSource.extra.source_folders_json=JSON.stringify([{folder_id:'a',name:'18번',path:['모의고사','18번']},{folder_id:'b',name:'19번',path:['모의고사','19번']}]);
assert.strictEqual(progress.fixedCatalogs([multiSource])[0].sets[0].sourceSummary,'18번 외 1개');

function assignment(set,students){return{active:true,content_type:'VOCAB',content_ref_id:'set-'+set,targets:students.map(id=>({student_id:id,status:'NOT_STARTED',active:true}))}}
let rows=[];for(let i=1;i<=5;i++)rows.push(assignment(i,['A']));
let report=progress.summary(catalog,progress.studentStatuses(catalog,rows,'A'));
assert.strictEqual(report.next,6);
rows.push(assignment(7,['A']));
report=progress.summary(catalog,progress.studentStatuses(catalog,rows,'A'));
assert.strictEqual(report.next,6);assert.deepStrictEqual(report.extra,[7]);

rows=[];for(let i=1;i<=5;i++)rows.push(assignment(i,['A','B']));rows.push(assignment(7,['A']));
const group=progress.groupSummary(catalog,rows,['A','B']);
assert.strictEqual(group.common.next,6);assert.strictEqual(group.hasDifferences,true);

console.log('vocab_fixed_assignment_flow.test.js: all assertions passed');
