const assert=require('assert'),fs=require('fs');
require('./helpers/local-only-browser.cjs');
const {chromium}=require('playwright');

const content={
  version:1,grammar_id:'modalPerfect',title:'<img src=x onerror=window.__theoryXss=1> 조동사 + have + p.p.',short_summary:'과거의 일을 추측하는 표현입니다.',
  blocks:[{type:'concept',text:'과거 사실에 대한 추측을 나타냅니다.'},{type:'form',text:'modal + have + past participle'},{type:'meaning',text:'~했음이 틀림없다'},{type:'caution',text:'have 뒤에는 과거분사를 씁니다.'}],
  examples:[
    {english:'She must have forgotten the meeting.',korean:'그녀는 회의를 잊었음이 틀림없다.',highlight:[{text:'must have forgotten',start:4,end:23}],note:'강한 추측'},
    {english:'They may have left early.',korean:'그들은 일찍 떠났을 수도 있다.',highlight:[{text:'may have left'}],note:''},
    {english:'We could have arrived sooner.',korean:'우리는 더 일찍 도착할 수도 있었다.',highlight:[{text:'does not match'}],note:''}
  ],
  exam_sentences:[
    {source:{year:'2025',month:'6',grade:'고1',exam_name:'교육청'},question_no:'18',english:'She must have completed the difficult task.',detected_hit:{grammar_id:'modalPerfect',text:'must have completed'},explanation:''},
    {source:{year:'',month:'',grade:'고2',exam_name:''},question_no:'',english:'They might have chosen another route.',detected_hit:{grammar_id:'modalPerfect',text:'might have chosen'},explanation:''}
  ],
  linked_practice_ref:'must-not-render',cta_text:'연습문제 시작'
};
let mode='new',completed=false,fetches=0,posts=[];
function payload(){
  if(mode==='legacy')return{found:true,tag:'modalPerfect',tagLabel:'Legacy Theory',content_subtype:'THEORY',sentences:[{text:'She must have left.',matches:['must have left'],tags:{}}],videoUrl:'',attempt_id:'attempt-1',attemptCapability:'attempt-cap',grammar_progress:{attempt_id:'attempt-1',attempt_status:'IN_PROGRESS',completed:false,question_items:[]}};
  const theory=JSON.parse(JSON.stringify(content));if(mode==='no-exam'){theory.blocks=theory.blocks.filter(x=>x.type==='concept'||x.type==='form');theory.exam_sentences=[];}
  return{found:true,tag:'modalPerfect',tagLabel:'Legacy label',content_subtype:'THEORY',sentences:[],theory_content:theory,videoUrl:'https://youtu.be/abcdefghi',attempt_id:'attempt-1',attemptCapability:'attempt-cap',grammar_progress:{attempt_id:'attempt-1',attempt_status:completed?'COMPLETED':'IN_PROGRESS',attempt_no:1,completed,question_items:[]}};
}
async function jsonp(route,value){const callback=new URL(route.request().url()).searchParams.get('callback');await route.fulfill({status:200,contentType:'application/javascript',body:`${callback}(${JSON.stringify(value)});`})}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:900}});
    await page.route('https://staging.example/**',async route=>{
      const url=new URL(route.request().url()),action=url.searchParams.get('action')||'';
      if(route.request().method()==='POST'){posts.push(JSON.parse(route.request().postData()||'{}'));completed=true;return route.fulfill({status:200,body:'ok'})}
      if(action==='verifyAttemptCompletionV2')return jsonp(route,{complete:true,attempt_status:'COMPLETED'});
      fetches++;return jsonp(route,payload());
    });
    const url='http://localhost/grammar/index.html?study=theory-set&hook=https%3A%2F%2Fstaging.example%2Fexec&assignment_target_id=target-1&student_id=student-1&assignmentCapability=launch-cap';
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-theory-renderer="c-type"]');
    assert.strictEqual(await page.locator('[data-theory-renderer="c-type"]').count(),1,'A: C-Type renderer selected');
    assert((await page.locator('[data-theory-renderer="c-type"] h3').textContent()).includes('<img'),'C/U: title rendered as text');
    assert((await page.locator('[data-theory-renderer="c-type"]').textContent()).includes('과거의 일을 추측하는 표현입니다.'),'C: summary');
    assert.deepStrictEqual(await page.locator('[data-theory-renderer="c-type"] h4').allTextContents(),['① 핵심 개념','② 핵심 형태','③ 의미','④ 주의할 점','⑤ 대표 예문','⑥ 실제 시험에서는 이렇게 나와요'],'D: content order and labels');
    assert((await page.locator('.theory-example').nth(0).textContent()).includes('그녀는 회의를 잊었음이 틀림없다.'),'F: English/Korean example');
    assert.strictEqual(await page.locator('.theory-example').nth(0).locator('mark').textContent(),'must have forgotten','G: offset highlight');
    assert.strictEqual(await page.locator('.theory-example').nth(1).locator('mark').textContent(),'may have left','H: text fallback highlight');
    assert.strictEqual(await page.locator('.theory-example').nth(2).locator('mark').count(),0,'I: mismatch renders plain sentence');
    assert((await page.locator('.theory-example').nth(2).textContent()).includes('We could have arrived sooner.'),'I: mismatch sentence retained');
    assert((await page.locator('[data-theory-renderer="c-type"]').textContent()).includes('2025년 6월 고1 · 18번 · 교육청'),'J: exam source metadata');
    assert((await page.locator('[data-theory-renderer="c-type"]').textContent()).includes('고2'),'K: partial source metadata');
    assert.strictEqual(await page.locator('.theory-example').nth(3).locator('mark').textContent(),'must have completed','L: exam detected hit highlight');
    assert.strictEqual(await page.locator('.video-embed iframe[title="문법 설명 영상"]').count(),1,'N: video compatibility');
    assert.strictEqual(await page.getByText('연습문제 시작',{exact:true}).count(),0,'T: Practice CTA absent');
    assert.strictEqual(await page.evaluate(()=>window.__theoryXss),undefined,'U: XSS-like content did not execute');
    assert.strictEqual(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'V: 390px overflow');

    await page.click('#btnTheoryComplete');await page.waitForSelector('#theoryCompleteStatus:visible');
    assert.strictEqual(posts.length,1,'O: one completion write');assert.strictEqual(posts[0].action,'completeGrammarActivityV1');
    assert.strictEqual(posts.filter(x=>x.action==='submitAttemptQuestionV2').length,0,'P: Theory QAI writes are zero');
    assert.strictEqual(await page.locator('#theoryCompleteStatus').textContent(),'✓ 이론 학습 완료');
    const beforeReloadFetches=fetches;await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-theory-renderer="c-type"]');
    assert.strictEqual(fetches,beforeReloadFetches+1,'Q: F5 performs one normal fetch');
    assert.strictEqual(await page.locator('#btnTheoryComplete').count(),0,'R: completed Theory is read-only');
    assert.strictEqual(await page.locator('#theoryCompleteStatus').textContent(),'✓ 이론 학습 완료');
    assert.strictEqual(posts.filter(x=>x.action==='startAttemptV2').length,0,'S: reentry creates no client-side new attempt');

    mode='no-exam';completed=false;await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-theory-renderer="c-type"]');
    const noExamHeadings=await page.locator('[data-theory-renderer="c-type"] h4').allTextContents();
    assert(!noExamHeadings.includes('③ 의미')&&!noExamHeadings.includes('④ 주의할 점'),'E: omitted blocks have no empty sections');
    assert(!noExamHeadings.includes('⑥ 실제 시험에서는 이렇게 나와요'),'M: empty exam section hidden');

    mode='legacy';await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.theory-card');
    assert.strictEqual(await page.locator('[data-theory-renderer="c-type"]').count(),0,'B: legacy Theory uses P0 fallback');
    assert((await page.locator('.theory-card').textContent()).includes('She must have left.'),'B: legacy sentence remains visible');

    const html=fs.readFileSync('grammar/index.html','utf8');
    assert.strictEqual((html.match(/function renderTheoryPreview_\(/g)||[]).length,1,'W: one formatter definition');
    assert(html.includes('renderTheoryPreview_(r.theory_content,lesson)')&&html.includes("renderTheoryPreview_(content,document.getElementById('theoryPreview'))"),'W: Teacher preview and Student renderer share formatter');
    console.log('grammar_theory_student_ui.test.js: A-W assertions passed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
