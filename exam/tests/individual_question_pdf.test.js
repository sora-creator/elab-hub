const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('exam/js/passageBank.js','utf8');
const start=source.indexOf('  printSelection(){'),end=source.indexOf('\n  },\n\n  // 선택한 문항을 과제자료로',start);
assert(start>=0&&end>start);
const method=source.slice(start,end+4).replace(/^  printSelection\(\)\{/,'function printSelection(){').replace(/\n  },$/,'\n}');

function invoke(selectedIds){
  const writes=[],toasts=[],popup={document:{write:value=>writes.push(value),close(){}}};
  const context={Date,Map,Array,String,window:{open:()=>popup},toast:message=>toasts.push(message),esc:value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),renderFormattedPassage_:html=>html,printQuestionSourceLabel:p=>p.printLabel||'',printQuestionAnswerLabel:p=>p.answer?['①','②','③','④','⑤'][p.answer-1]:'정답 미등록'};
  vm.createContext(context);vm.runInContext(method+'\nthis.printSelection=printSelection;',context);
  const state={assignmentDraft:'unchanged',db:{passages:[
    {question_id:'q1',num:1,text:'First passage',promptKo:'첫 문제',choices:['A','B'],answer:2,difficulty:'L3',printLabel:'2026년 6월 고1 모의고사 25번'},
    {question_id:'q2',num:2,text:'Second passage',promptKo:'둘째 문제',choices:['가','나'],answer:1,difficulty:'L1',printLabel:'2025년 9월 고2 모의고사 34번'},
    {question_id:'q3',num:3,text:'Not selected',promptKo:'제외 문제',choices:['X','Y']}
  ]},selectedIds:new Set(selectedIds),selectionId:p=>p.question_id};
  context.printSelection.call(state);
  return{html:writes[0]||'',writes,toasts,state};
}

let result=invoke([]);
assert.strictEqual(result.writes.length,0);
assert(result.toasts.includes('먼저 문항을 골라주세요'));

result=invoke(['q2','q1']);
assert.strictEqual(result.writes.length,1);
assert(result.html.includes('ELAB 영어 문제지'));
assert(result.html.includes('2문항'));
  assert(result.html.indexOf('Second passage')<result.html.indexOf('First passage'));
  assert(result.html.includes('2025년 9월 고2 모의고사 34번')&&result.html.includes('2026년 6월 고1 모의고사 25번'));
assert(!result.html.includes('Not selected'));
assert(result.html.includes('①')&&result.html.includes('가')&&result.html.includes('A'));
const answerStart=result.html.indexOf('<section class="answer-page">'),questionHtml=result.html.slice(0,answerStart),answerHtml=result.html.slice(answerStart);
assert(answerStart>0);
assert(!questionHtml.includes('정답'));
assert(answerHtml.includes('<h1>정답</h1>'));
assert(answerHtml.includes('<th>1.</th><td class="answer-value">①</td>'));
assert(answerHtml.includes('<th>2.</th><td class="answer-value">②</td>'));
assert(answerHtml.includes('(2025년 9월 고2 모의고사 34번)')&&answerHtml.includes('(2026년 6월 고1 모의고사 25번)'));
assert(!result.html.includes('difficulty')&&!result.html.includes('question_id'));
assert(/^ELAB_개별문제_\d{8}_\d{4}$/.test((result.html.match(/<title>([^<]+)<\/title>/)||[])[1]||''));
  assert.strictEqual(result.state.assignmentDraft,'unchanged');
  assert(result.html.includes('page-break-after:always')&&result.html.includes('page-break-inside:avoid'));
  assert(result.html.includes('page-break-before:always')&&result.html.includes('display:table-header-group'));

result=invoke(['q3']);
assert(result.html.includes('<td class="answer-value">정답 미등록</td>'));

assert(source.includes('id="fb-select-build"'));
assert(source.includes('id="fb-select-pdf"'));
assert(source.includes("fb-select-build')?.addEventListener('click', ()=>this.buildExamFromSelection())"));
assert(source.includes("fb-select-pdf')?.addEventListener('click', ()=>this.printSelection())"));
assert(source.includes('pdfButton.disabled=this.selectedIds.size===0'));
console.log('individual_question_pdf.test.js: all assertions passed');
