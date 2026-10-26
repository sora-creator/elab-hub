const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),vm=require('vm');
const props={TOKEN:'teacher',STUDENT_CAPABILITY_SECRET:'student-secret'},sheets={};
function sheet(name,rows=[]){return sheets[name]={rows,writeCount:0,getDataRange(){return{getValues:()=>this.rows}},getRange(r,c,rc=1,cc=1){let t=this;return{getValues:()=>t.rows.slice(r-1,r-1+rc).map(x=>x.slice(c-1,c-1+cc)),getValue:()=>t.rows[r-1]&&t.rows[r-1][c-1],setValue(v){while(t.rows.length<r)t.rows.push([]);t.rows[r-1][c-1]=v;t.writeCount++},setValues(vs){vs.forEach((x,ri)=>x.forEach((v,ci)=>{while(t.rows.length<r+ri)t.rows.push([]);t.rows[r-1+ri][c-1+ci]=v}));t.writeCount++}}},appendRow(x){this.rows.push(x);this.writeCount++},getLastRow(){return this.rows.length},getLastColumn(){return Math.max(0,...this.rows.map(x=>x.length))},deleteRow(r){this.rows.splice(r-1,1)},copyTo(){return this},setName(){return this}}}
const ss={getSheets:()=>Object.values(sheets),getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheet(n)};
const ctx={console,Date,JSON,Math,Array,Object,String,Number,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>props[k]=v})},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},Session:{getEffectiveUser:()=>({getEmail:()=>''}),getScriptTimeZone:()=>''},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},CacheService:{getScriptCache:()=>({put(){},get:()=>null,remove(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=>'',Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),base64DecodeWebSafe:v=>Buffer.from(v,'base64url'),computeHmacSha256Signature:(v,s)=>crypto.createHmac('sha256',s).update(v).digest(),computeDigest:(_a,v)=>crypto.createHash('sha256').update(v).digest(),newBlob:v=>({getDataAsString:()=>Buffer.from(v).toString('utf8')})},ContentService:{MimeType:{JAVASCRIPT:'js'},createTextOutput:body=>({body,setMimeType(){return this}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('exam/sheet_backend.gs','utf8'),ctx);ctx.setup();

assert.strictEqual(sheets.GrammarSets.rows[0][6],'theoryContentJson');

const legacyKey='legacy-theory';
assert.strictEqual(ctx.handleSaveGrammarSet_({setKey:legacyKey,tag:'modalPerfect',tagLabel:'Modal perfect',sentences:[{text:'She must have left.',tags:{}}]}).body,'ok');
let fetched=ctx.handleFetchGrammarSet_({parameter:{key:legacyKey}});
assert.strictEqual(fetched.found,true);
assert.strictEqual(fetched.theory_content,null);
assert.strictEqual(fetched.sentences.length,1);

const validTheory={
  version:1,
  grammar_id:'modalPerfect',
  title:'Modal + have + past participle',
  short_summary:'A compact explanation for past deduction.',
  blocks:[{type:'concept',text:'Use this structure to discuss a past possibility.'},{type:'form',text:'modal + have + past participle'}],
  examples:[{english:'She must have left already.',korean:'She probably left already.',highlight:[{text:'must have left',start:4,end:18}],note:''}],
  exam_sentences:[],
  linked_practice_ref:null,
  cta_text:null
};
const directKey='direct-theory',grammarWrites=sheets.GrammarSets.writeCount,questionRows=sheets.QuestionsV2.rows.length;
assert.strictEqual(ctx.handleSaveGrammarSet_({setKey:directKey,tag:'modalPerfect',tagLabel:'Modal perfect',sentences:[],theoryContent:validTheory}).body,'ok');
assert.strictEqual(sheets.GrammarSets.writeCount-grammarWrites,1,'TheoryContent must use the existing single GrammarSets row write');
assert.strictEqual(sheets.QuestionsV2.rows.length,questionRows,'direct Theory must not require QuestionsV2 rows');
fetched=ctx.handleFetchGrammarSet_({parameter:{key:directKey}});
assert.strictEqual(fetched.found,true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(fetched.theory_content)),validTheory);
assert.deepStrictEqual(Array.from(fetched.sentences),[]);

const list=ctx.handleListGrammarSets_({parameter:{token:'teacher'}}).sets.find(x=>x.setKey===directKey);
assert.strictEqual(list.has_theory_content,true);
assert.strictEqual(list.theory_title,validTheory.title);
assert.strictEqual(list.theory_example_count,1);
assert.strictEqual(list.theory_exam_sentence_count,0);
assert.strictEqual(Object.prototype.hasOwnProperty.call(list,'theory_content'),false);

const textOnlyHighlight=JSON.parse(JSON.stringify(validTheory));
textOnlyHighlight.examples[0].highlight=[{text:'teacher-entered emphasis'}];
assert.strictEqual(ctx.validateTheoryContentV1_(textOnlyHighlight).valid,true,'text-only highlight must remain valid when exact offsets cannot be calculated');

const savedJson=sheets.GrammarSets.rows.find(r=>r[0]===directKey)[6];
assert.strictEqual(ctx.handleSaveGrammarSet_({setKey:directKey,tag:'modalPerfect',tagLabel:'Renamed',sentences:[]}).body,'ok');
assert.strictEqual(sheets.GrammarSets.rows.find(r=>r[0]===directKey)[6],savedJson,'legacy save must preserve TheoryContent');

function rejected(key,theory){const before=sheets.GrammarSets.writeCount,result=ctx.handleSaveGrammarSet_({setKey:key,tag:'x',tagLabel:'x',sentences:[],theoryContent:theory});assert.strictEqual(result.body,'invalid theory content');assert.strictEqual(sheets.GrammarSets.writeCount,before);assert(!sheets.GrammarSets.rows.some(r=>r[0]===key));}
rejected('bad-version',Object.assign({},validTheory,{version:2}));
rejected('bad-block',Object.assign({},validTheory,{blocks:[{type:'unknown',text:'No'}]}));
rejected('bad-highlight',Object.assign({},validTheory,{examples:[{english:'A valid English sentence.',korean:'',highlight:[{text:'valid',start:2}],note:''}]}));
rejected('html-content',Object.assign({},validTheory,{title:'<script>alert(1)</script>'}));
const polluted=JSON.parse(JSON.stringify(validTheory));polluted.examples[0].highlight[0].constructor='unexpected';rejected('unexpected-key',polluted);

const large=JSON.parse(JSON.stringify(validTheory));
large.exam_sentences=Array.from({length:30},(_,i)=>({source:{year:'2026',month:'3',grade:'1',exam_name:'Mock exam'},question_no:String(i+1),english:'A'.repeat(1500),detected_hit:{grammar_id:'modalPerfect',text:'A'},explanation:'B'.repeat(500)}));
rejected('oversize',large);

sheets.GrammarSets.appendRow(['corrupt-theory','modalPerfect','Corrupt','[]',new Date(),'', '{bad json']);
fetched=ctx.handleFetchGrammarSet_({parameter:{key:'corrupt-theory'}});
assert.strictEqual(fetched.found,true);
assert.strictEqual(fetched.theory_content,null);

console.log('grammar_theory_content_v1.test.js: all assertions passed');
