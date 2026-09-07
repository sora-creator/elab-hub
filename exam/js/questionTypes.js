// 문제유형 패턴기반 자동분류 -- 실제 AI(LLM) 호출 대신, 수능/모의고사 한글 지시문(promptKo)이
// 거의 고정된 관용구를 쓴다는 점을 이용한 키워드/정규식 매칭(사용자가 AskUserQuestion에서 이
// 방식을 확정함). 정답을 못 맞히면 null을 반환하고 교사가 드롭다운으로 직접 고르게 함.
const QUESTION_TYPE_GROUPS = [
  { group:'맥락 추론', types:[
    {key:'purpose', label:'글의 목적'},
    {key:'mood', label:'심경·분위기'},
    {key:'claim', label:'필자의 주장'},
    {key:'implicit', label:'함축적 의미 추론'},
    {key:'blank', label:'빈칸 추론'},
  ]},
  { group:'중심내용 추론', types:[
    {key:'gist', label:'요지'},
    {key:'topic', label:'주제'},
    {key:'title', label:'제목'},
  ]},
  { group:'세부 정보', types:[
    {key:'graph', label:'도표 정보 파악'},
    {key:'match', label:'내용 일치·불일치'},
    {key:'practical', label:'실용문 내용 파악'},
  ]},
  { group:'언어형식·어휘', types:[
    {key:'grammar', label:'어법'},
    {key:'vocab', label:'어휘'},
  ]},
  { group:'간접 쓰기', types:[
    {key:'irrelevant', label:'무관한 문장'},
    {key:'order', label:'글의 순서'},
    {key:'insert', label:'문장 삽입'},
    {key:'summary', label:'요약문 완성'},
  ]},
  { group:'장문 독해', types:[
    {key:'long_reference', label:'지칭 추론(장문)'},
  ]},
];
const QUESTION_TYPES = QUESTION_TYPE_GROUPS.flatMap(g=>g.types.map(t=>({...t, group:g.group})));
function questionTypeLabel(key){ const t = QUESTION_TYPES.find(x=>x.key===key); return t ? t.label : null; }
const TYPE_PATTERNS = [
  ['purpose', /목적/],
  ['mood', /심경|분위기/],
  ['claim', /주장/],
  ['implicit', /함축적 의미|함축된 의미|밑줄 친.{0,10}의미/],
  ['blank', /빈칸/],
  ['gist', /요지/],
  ['topic', /주제/],
  ['title', /제목/],
  ['graph', /도표|그래프/],
  ['match', /일치하는|일치하지|불일치/],
  ['practical', /안내문|공고문|실용문/],
  ['grammar', /어법상|어법에|어법/],
  ['vocab', /낱말|어휘/],
  ['irrelevant', /무관한 문장/],
  ['order', /글의 순서/],
  ['insert', /들어가기에 가장 적절한|주어진 문장이 들어가기/],
  ['summary', /요약문/],
  ['long_reference', /가리키는 대상|가리키는 바|밑줄 친.{0,10}가리키는/],
];
function classifyQuestionType(promptKo){
  if(!promptKo) return null;
  for(const [key, re] of TYPE_PATTERNS){ if(re.test(promptKo)) return key; }
  return null;
}
function classifyQuestionTypeByNum(num,promptKo){
  const fromPrompt=classifyQuestionType(promptKo);
  if(fromPrompt)return fromPrompt;
  num=Number(num);
  if(num===18)return'purpose';if(num===19)return'mood';if(num===20)return'claim';if(num===21)return'implicit';
  if(num===22)return'gist';if(num===23)return'topic';if(num===24)return'title';if(num===25)return'graph';
  if(num===26)return'match';if(num===27||num===28)return'practical';if(num===29)return'grammar';if(num===30)return'vocab';
  if(num>=31&&num<=34)return'blank';if(num===35)return'irrelevant';if(num===36||num===37)return'order';
  if(num===38||num===39)return'insert';if(num===40)return'summary';if(num>=41&&num<=45)return'long_reference';
  return null;
}

function newQuestionId(){
  if(globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0;
    return (c==='x' ? r : (r&0x3|0x8)).toString(16);
  });
}
function ensureQuestionId(question){
  if(!question.question_id){
    question.question_id = newQuestionId();
    if(question.id) question.legacy_question_id = question.id;
  }
  return question.question_id;
}
function readingCategoryKey(type){ return type ? 'READING_' + String(type).toUpperCase() : null; }
