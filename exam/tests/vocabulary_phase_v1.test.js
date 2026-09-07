const assert=require('assert'),fs=require('fs'),vm=require('vm');

const vocab=fs.readFileSync('vocab/index.html','utf8');
function frontendFunction(name){
  const match=vocab.match(new RegExp('function '+name+'\\([^]*?\\n\\}'));
  if(!match)throw new Error('missing frontend function: '+name);
  return match[0];
}
const front={JSON,String,Math,parseInt};
vm.createContext(front);
['normalizeWordTerm','normalizeWordMeaning','canonicalWordKey','stableWordHash','stableWordId','splitFixedVocabSets']
  .forEach(name=>vm.runInContext(frontendFunction(name),front));

assert.strictEqual(front.stableWordId('maintain','유지하다'),front.stableWordId('maintain','유지하다'));
assert.strictEqual(front.stableWordId('Maintain','유지하다'),front.stableWordId(' maintain ',' 유지하다 '));
assert.notStrictEqual(front.stableWordId('maintain','유지하다'),front.stableWordId('maintain','주장하다'));
assert.notStrictEqual(front.stableWordId('maintain','유지하다'),front.stableWordId('maintain','유지하다, 지속하다'));
const split=front.splitFixedVocabSets(Array.from({length:1327},(_,i)=>i+1),50);
assert.strictEqual(split.length,27);assert.strictEqual(split[0].length,50);assert.strictEqual(split[26].length,27);
assert(vocab.includes('snapshot: picked.map(w=>({id:w.id,e:w.en,k:w.ko}))'));
assert(vocab.includes('if(w.id) item.id=w.id;'),'rebuildLink preserves ids while legacy snapshots remain id-less');
assert(vocab.includes('picked = shuffle(valid).slice(0, sampleN)'),'legacy random sampling remains available');
assert(vocab.includes('payload.s}:${i}'),'legacy id-less payload fallback remains available');

let review=fs.readFileSync('exam/tests/review_0f.test.js','utf8');
review=review.replace("console.log('review_0f.test.js: all assertions passed');",`
const words=Array.from({length:50},(_,i)=>({word_id:'fixed-word-'+i,term:'Word '+i,meaning:'뜻 '+i,item_order:i+1}));
let saved=ctx.handleSaveVocabSetV2_({session_key:'FIXEDSET0001',content_link:'https://example.test/vocab',title:'V3 Set 07',fixed_set:true,book_source:'V3',day_set:'Day 7',range_start:301,range_end:350,display_range:'V3 · Set 07 · 301~350',catalog_id:'catalog-v3',set_number:7,source_folders_json:JSON.stringify([{folder_id:'day7',name:'Day 7',path:['V3','Day 7']}]),word_items:words});
assert(saved.body.startsWith('ok:'));
const fixedId=sheets.VocabSetsV2.rows.find(r=>r[2]==='FIXEDSET0001')[0];
const fixedRow=sheets.VocabSetsV2.rows.find(r=>r[0]===fixedId);assert.strictEqual(fixedRow[16],'catalog-v3');assert.strictEqual(fixedRow[17],7);assert.strictEqual(JSON.parse(fixedRow[18])[0].folder_id,'day7');
assert.strictEqual(sheets.VocabSetItemsV2.rows.filter(r=>r[1]===fixedId).length,50);
ctx.handleSaveVocabSetV2_({session_key:'FIXEDSET0001',content_link:'https://example.test/vocab',title:'V3 Set 07',fixed_set:true,word_items:words});
assert.strictEqual(sheets.VocabSetItemsV2.rows.filter(r=>r[1]===fixedId).length,50,'retry is idempotent');
ctx.handleSaveVocabSetV2_({session_key:'FIXEDSET0002',content_link:'https://example.test/vocab2',title:'Other set',fixed_set:true,word_items:[words[0]]});
const secondId=sheets.VocabSetsV2.rows.find(r=>r[2]==='FIXEDSET0002')[0];
assert.strictEqual(sheets.VocabSetItemsV2.rows.filter(r=>r[1]===secondId&&r[2]===words[0].word_id).length,1,'same word can belong to another set');
assert.deepStrictEqual(Array.from(ctx.vocabSetWordIdsV2_(fixedId)),words.map(w=>w.word_id),'membership order is stable');
assert.strictEqual(ctx.stableWordIdV2_('Maintain',' 유지하다 '),ctx.stableWordIdV2_('maintain','유지하다'));
assert.notStrictEqual(ctx.stableWordIdV2_('maintain','주장하다'),ctx.stableWordIdV2_('maintain','유지하다'));
const duplicateAudit=ctx.auditVocabWordIdentityV2();assert.strictEqual(typeof duplicateAudit.duplicate_canonical_count,'number');
console.log('vocabulary_phase_v1.test.js: all assertions passed');`);
vm.runInThisContext('(function(require){'+review+'\n})',{filename:'vocabulary_phase_v1.test.js'})(require);
