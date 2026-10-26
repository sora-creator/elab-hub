const assert=require('assert');
require('./helpers/local-only-browser.cjs');
const {chromium}=require('playwright');

const theoryDetail={version:1,grammar_id:'modalPerfect',title:'Library Theory',short_summary:'Library summary',blocks:[{type:'concept',text:'Library concept'}],examples:[{english:'She must have left.',korean:'그녀는 떠났음이 틀림없다.',highlight:[{text:'must have left',start:4,end:18}],note:''}],exam_sentences:[],linked_practice_ref:null,cta_text:null};
async function fulfillJsonp(route,payload){const callback=new URL(route.request().url()).searchParams.get('callback');await route.fulfill({status:200,contentType:'application/javascript',body:`${callback}(${JSON.stringify(payload)});`})}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:900}}),posts=[],checks={};
    await page.addInitScript(()=>{
      localStorage.setItem('grammarhub.delivery',JSON.stringify({url:'https://staging.example/exec',token:'teacher-test'}));
      localStorage.setItem('mockexam_gui_db_v2',JSON.stringify({nextId:2,exams:[{id:1,year:2026,month:3,grade:'고1',name:'Builder fixture',backend:'spacy',sentences:[
        {questionNo:'18',text:'She must have forgotten the meeting.',tags:{modalPerfect:[{text:'must have forgotten'}]}},
        {questionNo:'19',text:'They may have completed the difficult project.',tags:{modalPerfect:[{text:'may have completed'}]}}
      ]}]}));
      const nativeSetTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>nativeSetTimeout(fn,Math.min(Number(ms)||0,8),...args);
    });
    await page.route('https://staging.example/**',async route=>{
      if(route.request().method()==='POST'){posts.push(JSON.parse(route.request().postData()||'{}'));return route.fulfill({status:200,body:'ok'})}
      const url=new URL(route.request().url()),action=url.searchParams.get('action'),key=url.searchParams.get('key');
      if(action==='listGrammarSets')return fulfillJsonp(route,{sets:[
        {setKey:'legacy-set',tag:'modalPerfect',tagLabel:'Legacy',createdAt:'2026-01-01T00:00:00Z',has_theory_content:false,theory_title:'',theory_example_count:0,theory_exam_sentence_count:0},
        {setKey:'library-theory',tag:'modalPerfect',tagLabel:'조동사 + have + p.p.',createdAt:'2026-02-01T00:00:00Z',has_theory_content:true,theory_title:'Library Theory',theory_example_count:1,theory_exam_sentence_count:0}
      ]});
      if(key==='library-theory')return fulfillJsonp(route,{found:true,theory_content:theoryDetail,sentences:[]});
      checks[key]=(checks[key]||0)+1;return fulfillJsonp(route,checks[key]>=4?{found:true,theory_content:posts.find(x=>x.setKey===key)?.theoryContent||null}:{found:false});
    });
    await page.goto('http://localhost/grammar/index.html',{waitUntil:'domcontentloaded'});

    await page.click('[data-gtab="theory"]');
    assert(await page.locator('#gtabPanel-theory').isVisible(),'A: Theory Builder entry');
    assert((await page.locator('#theoryGrammarId option').allTextContents()).includes('조동사 + have + p.p.'),'B: existing tag catalog');
    await page.click('#btnSaveTheory');
    assert.strictEqual(await page.locator('#theoryStatus').textContent(),'문법 개념을 선택해주세요.','C: required validation');

    await page.selectOption('#theoryGrammarId','modalPerfect');
    await page.fill('#theoryTitle','<img src=x onerror=window.__xss=1> Modal Theory');
    await page.fill('#theorySummary','과거 사실을 추측하는 표현');
    await page.fill('#theoryConcept','과거의 가능성이나 확신을 나타냅니다.');
    await page.fill('[data-theory-example="english"]','She must have forgotten the meeting.');
    await page.fill('[data-theory-example="korean"]','그녀는 회의를 잊었음이 틀림없다.');
    await page.fill('[data-theory-example="highlight"]','must have forgotten');
    await page.click('#btnAddTheoryExample');
    const examples=page.locator('.theory-example-card');
    await examples.nth(1).locator('[data-theory-example="english"]').fill('They may have left early.');
    await examples.nth(1).locator('[data-theory-example="highlight"]').fill('not an exact phrase');
    await examples.nth(1).locator('[data-theory-move="up"]').click();
    assert.strictEqual(await examples.nth(0).locator('[data-theory-example="english"]').inputValue(),'They may have left early.','D: example reorder');
    await examples.nth(0).locator('[data-theory-remove]').click();
    assert.strictEqual(await examples.count(),1,'D: example delete');

    await page.click('#btnTheoryPreview');
    const previewText=await page.locator('#theoryPreview').textContent();
    assert(previewText.indexOf('핵심 개념')<previewText.indexOf('대표 예문'),'H: preview information order');
    assert.strictEqual(await page.locator('#theoryPreview mark').textContent(),'must have forgotten','E: highlight text mapping');
    assert.strictEqual(await page.evaluate(()=>window.__xss),undefined,'P: XSS-like title did not execute');
    assert((await page.locator('#theoryPreview h3').textContent()).includes('<img'),'P: XSS-like title rendered as text');
    assert.strictEqual(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'I: 390px horizontal overflow');
    await page.fill('#theoryTitle','Modal Perfect Theory');

    const beforeDirect=posts.length;await page.click('#btnSaveTheory');await page.waitForSelector('#theoryStatus.success');
    assert.strictEqual(posts.length-beforeDirect,1,'J: saveGrammarSet write count');
    const direct=posts[posts.length-1];assert.deepStrictEqual(direct.sentences,[],'F: direct Theory without exam sentences');
    assert.deepStrictEqual(direct.theoryContent.exam_sentences,[],'F: direct Theory content has zero exam sentences');
    assert.strictEqual(direct.theoryContent.examples[0].highlight[0].start,4,'E: highlight start calculated');
    assert.strictEqual(checks[direct.setKey],4,'K: bounded confirmation reused until delayed success');
    const assignment=page.locator('#theoryStatus a');assert((await assignment.getAttribute('href')).includes('content_type=GRAMMAR'));assert((await assignment.getAttribute('href')).includes('content_subtype=THEORY'));assert((await assignment.getAttribute('href')).includes('content_ref_id='+direct.setKey),'L: assignment prefill');

    await page.click('[data-gtab="accurate"]');
    await page.selectOption('#inSearchExam','1');
    await page.locator('.tagCheck').evaluateAll(nodes=>nodes.forEach(node=>node.checked=node.value==='modalPerfect'));
    await page.click('#btnSearch');
    assert.strictEqual(await page.locator('[data-theory-result-index]').count(),2);
    await page.check('[data-theory-result-index="1"]');
    await page.click('#btnAddSelectedToTheory');
    assert(await page.locator('#gtabPanel-theory').isVisible(),'G: returns selected sentence to builder');
    assert.strictEqual(await page.locator('.theory-selected-card').count(),1,'G: selected sentence only');
    const beforeSelected=posts.length;await page.click('#btnSaveTheory');await page.waitForTimeout(150);
    assert.strictEqual(posts.length-beforeSelected,1,'J: selected Theory still writes once');
    const selected=posts[posts.length-1];assert.strictEqual(selected.sentences.length,1,'G: only one selected compatibility sentence');assert.strictEqual(selected.sentences[0].source_question_no,'19');assert.strictEqual(selected.theoryContent.exam_sentences.length,1);assert.strictEqual(selected.theoryContent.exam_sentences[0].question_no,'19');

    await page.click('#btnLoadTheoryLibrary');await page.waitForSelector('.theory-library-card');
    assert.strictEqual(await page.locator('.theory-library-card').count(),1,'M: legacy set filtered from Theory library');
    assert((await page.locator('.theory-library-card').textContent()).includes('예문 1개'),'M: library counts');
    const libraryAssign=page.locator('.theory-library-card a');assert((await libraryAssign.getAttribute('href')).includes('content_subtype=THEORY'),'O: library assignment');
    await page.locator('.theory-library-card button').click();await page.waitForSelector('.theory-library-card .theory-preview:not([hidden])');
    assert((await page.locator('.theory-library-card .theory-preview').textContent()).includes('Library concept'),'N: library preview');

    await page.fill('#theorySummary','dirty navigation check');page.once('dialog',dialog=>dialog.dismiss());await page.click('[data-gtab="settings"]');assert(await page.locator('#gtabPanel-theory').isVisible(),'dirty Builder navigation is protected');
    console.log('grammar_theory_builder_ui.test.js: A-P assertions passed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
