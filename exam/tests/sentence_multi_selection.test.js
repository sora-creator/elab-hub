const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('exam/js/passageBank.js','utf8');
assert(source.includes('selectionId(p){ return String(ensureQuestionId(p)); }'));
assert(source.includes('this.db.passages.filter(p=>this.selectedIds.has(this.selectionId(p)))'));
assert(source.includes('renderSentenceSelectionPreview(wrap,list)'));
assert(source.includes('data-sentence-card='));
assert(source.includes('sentenceQuestionSourceLabel(p,this.db)'));
assert(!source.includes('id="fb-toggle-numbering"'));
assert(!source.includes('setNumberingEnabled('));
assert(!source.includes('NUMBERING_KEY'));

const start=source.indexOf('function sentenceQuestionSourceLabel');
const end=source.indexOf('\n\nconst FolderBank',start);
const context={};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.label=sentenceQuestionSourceLabel;',context);
const db={folders:[{id:'march',name:'2026년 3월 고1 모의고사'},{id:'june',name:'2026년 6월 고1 모의고사'}]};
assert.strictEqual(context.label({folderId:'march',num:29,source:{year:2026,month:3,grade:'고1',exam_type:'MOCK'}},db),'2026년 3월 고1 모의고사 29번');
assert.strictEqual(context.label({folderId:'june',num:29,source:{year:2026,month:6,grade:'1',exam_type:'MOCK'}},db),'2026년 6월 고1 모의고사 29번');
assert.strictEqual(context.label({num:31,source:{year:2025,exam_type:'SUNEUNG'}},db),'2025년 수능 31번');

const passages=[
  {question_id:'march-29',num:29},
  {question_id:'june-29',num:29},
  {question_id:'march-30',num:30}
];
let selected=new Set(['march-29','june-29']);
assert.deepStrictEqual(passages.filter(p=>selected.has(p.question_id)).map(p=>p.question_id),['march-29','june-29']);
selected.add('march-30');assert.strictEqual(passages.filter(p=>selected.has(p.question_id)).length,3);
selected.delete('june-29');assert.deepStrictEqual(passages.filter(p=>selected.has(p.question_id)).map(p=>p.question_id),['march-29','march-30']);

console.log('sentence_multi_selection.test.js: all assertions passed');
