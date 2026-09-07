const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const properties = { TOKEN:'teacher-secret', DEFAULT_TEACHER_ID:'' };
const sheets = {};
function makeSheet(name, rows=[]) {
  const sheet = { rows,
    getDataRange(){ return { getValues:()=>this.rows }; },
    getRange(row,col,rowCount=1,colCount=1){ const target=this; return {
      getValues:()=>target.rows.slice(row-1,row-1+rowCount).map(r=>r.slice(col-1,col-1+colCount)),
      setValue(v){ while(target.rows.length<row) target.rows.push([]); target.rows[row-1][col-1]=v; },
      setValues(vals){ vals.forEach((r,ri)=>r.forEach((v,ci)=>{ while(target.rows.length<row+ri) target.rows.push([]); target.rows[row-1+ri][col-1+ci]=v; })); }
    }; },
    appendRow(r){ this.rows.push(r); }, getLastRow(){return this.rows.length;}, getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));},
    getName(){return name;}, deleteRow(row){this.rows.splice(row-1,1);}, copyTo(){return this;}, setName(){return this;}
  };
  sheets[name]=sheet; return sheet;
}
const ss={ getId:()=> 'sheet', getName:()=> 'test', getSheets:()=>Object.values(sheets), getSheetByName:n=>sheets[n]||null, insertSheet:n=>makeSheet(n) };
const context={ console,Date,JSON,Math,Array,Object,String,Number,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||'',setProperty:(k,v)=>properties[k]=v})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss}, Session:{getEffectiveUser:()=>({getEmail:()=> 'owner@test'}),getScriptTimeZone:()=> 'Asia/Seoul'},
  Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=>'',Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),base64DecodeWebSafe:v=>Buffer.from(v,'base64url'),computeHmacSha256Signature:(v,s)=>crypto.createHmac('sha256',s).update(v).digest(),computeDigest:(_a,v)=>crypto.createHash('sha256').update(v).digest(),newBlob:v=>({getDataAsString:()=>Buffer.from(v).toString('utf8')})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}, CacheService:{getScriptCache:()=>({put(){},get:()=>null})},
  ContentService:{MimeType:{JAVASCRIPT:'js'},createTextOutput:body=>({body,setMimeType(){return this;}})}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('exam/sheet_backend.gs','utf8'),context);
context.setupQuestionMetadataV2_();

const qid=crypto.randomUUID();
const exam={examKey:'exam-1',title:'독해',contentType:'text',questionCount:1,questionNums:[31],answers:[2],questions:[{
  question_id:qid,legacy_question_id:'short123',content_type:'READING',answer_type:'MULTIPLE_CHOICE',source_question_no:31,
  text:'Passage',choices:['a','b','c','d','e'],answer:2,source:{exam_type:'MOCK',year:2026,grade:2,month:6,exam_name:'6월 모의고사'},
  category_keys:['READING_BLANK','READING_VOCAB']
}]};
context.handleSaveExam_(exam);
assert.strictEqual(exam.questions[0].question_id,qid); // TEST 1
let fetched=context.handleFetchExam_({parameter:{key:'exam-1'}});
assert.strictEqual(fetched.questionIds[0],qid); // TEST 3/5
assert.strictEqual(fetched.questionsContent[0].question_id,qid);
assert.deepStrictEqual(Array.from(fetched.questionsContent[0].category_keys),['READING_BLANK','READING_VOCAB']); // TEST 7/10
assert.strictEqual(fetched.questionsContent[0].source_question_no,31); // TEST 9

const before=sheets.QuestionsV2.rows.find(r=>r[0]===qid);
assert(before[8]); // TEST 8 structured source_id
const beforeVersion=Number(before[11]);
exam.questions[0].text='Edited';
context.handleSaveExam_(exam);
const after=sheets.QuestionsV2.rows.find(r=>r[0]===qid);
assert.strictEqual(after[0],qid); assert(Number(after[11])>beforeVersion); // TEST 4

fetched=context.handleFetchExam_({parameter:{key:'exam-1',nums:'31'}});
assert.strictEqual(fetched.questionIds[0],qid); // TEST 6
assert.strictEqual(new Set(sheets.QuestionsV2.rows.slice(1).map(r=>r[0])).size,sheets.QuestionsV2.rows.length-1); // TEST 2

const grammarId=crypto.randomUUID();
context.handleSaveGrammarFinal_({setKey:'g1',questions:[{question_id:grammarId,text:'Grammar',options:['A','B'],correctIdx:0,category_keys:['GRAMMAR_RELATIVE_CLAUSE']}]});
assert.strictEqual(context.handleFetchGrammarFinal_({parameter:{key:'g1'}}).questions[0].question_id,grammarId); // TEST 12
const sentenceId=crypto.randomUUID();
context.handleSaveSentenceSet_({setKey:'s1',passages:[{question_id:sentenceId,num:1,text:'Sentence'}]});
assert.strictEqual(JSON.parse(sheets.SentenceSets.rows[1][2])[0].question_id,sentenceId); // TEST 13

const labelRow=sheets.CategoriesV2.rows.find(r=>r[2]==='READING_BLANK');
labelRow[3]='변경된 표시명';
assert(sheets.QuestionCategoriesV2.rows.slice(1).some(r=>r[0]===qid&&r[1]===labelRow[0])); // TEST 11
assert.strictEqual(context.verifyQuestionMetadataV2().ok,true);
console.log('question_metadata_0c.test.js: all assertions passed');
