const assert=require('assert');
require('./helpers/local-only-browser.cjs');
const {chromium}=require('playwright');

const theoryContent={
  version:1,grammar_id:'modalPerfect',title:'Modal perfect',short_summary:'Read the explanation.',
  blocks:[{type:'concept',text:'A past deduction.'}],examples:[],exam_sentences:[]
};
const practiceLaunch={
  available:true,content_ref_id:'practice-set',content_subtype:'BASIC_PRACTICE',
  assignment_target_id:'practice-target',student_id:'student-1',launch_capability:'practice-target-cap'
};
let completed=false,completionResult={complete:true,attempt_status:'COMPLETED',linked_practice_launch:practiceLaunch},posts=[];

function fetchPayload(linkedPractice){
  return {found:true,tag:'modalPerfect',tagLabel:'Modal perfect',content_subtype:'THEORY',sentences:[],theory_content:theoryContent,
    attempt_id:'theory-attempt',attemptCapability:'theory-attempt-cap',grammar_progress:{attempt_id:'theory-attempt',attempt_status:completed?'COMPLETED':'IN_PROGRESS',attempt_no:1,completed,question_items:[]},
    linked_practice_launch:completed?linkedPractice:null};
}
async function jsonp(route,value){const cb=new URL(route.request().url()).searchParams.get('callback');await route.fulfill({status:200,contentType:'application/javascript',body:`${cb}(${JSON.stringify(value)});`})}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:900}});
    let reentryLaunch=practiceLaunch;
    await page.route('https://staging.example/**',async route=>{
      const url=new URL(route.request().url()),action=url.searchParams.get('action')||'';
      if(route.request().method()==='POST'){
        const body=JSON.parse(route.request().postData()||'{}');posts.push(body);
        if(body.action==='completeGrammarActivityV1')completed=true;
        return route.fulfill({status:200,body:'ok'});
      }
      if(action==='verifyAttemptCompletionV2')return jsonp(route,completionResult);
      return jsonp(route,fetchPayload(reentryLaunch));
    });
    const start='http://localhost/grammar/index.html?study=theory-set&hook=https%3A%2F%2Fstaging.example%2Fexec&assignment_target_id=theory-target&student_id=student-1&assignmentCapability=theory-launch-cap';
    await page.goto(start,{waitUntil:'domcontentloaded'});await page.waitForSelector('#btnTheoryComplete');
    assert.strictEqual(await page.locator('[data-linked-practice]').count(),0,'01 CTA absent before Theory completion');

    await page.click('#btnTheoryComplete');await page.waitForSelector('[data-linked-practice="available"]');
    assert.strictEqual(posts.filter(x=>x.action==='completeGrammarActivityV1').length,1,'02 one Theory completion write');
    assert.strictEqual(posts.filter(x=>/Assignment|Target|GrammarSet/.test(x.action||'')).length,0,'03 CTA creates no assignment, target, or GrammarSet');
    const href=await page.locator('[data-linked-practice="available"]').getAttribute('href'),launchUrl=new URL(href);
    assert.strictEqual(await page.locator('[data-linked-practice="available"]').textContent(),'연습문제 풀기','04 fixed CTA label');
    assert.strictEqual(launchUrl.pathname,'/grammar/index.html','05 existing Grammar route');
    assert.deepStrictEqual([...launchUrl.searchParams.keys()].sort(),['assignmentCapability','assignment_target_id','hook','student_id','study'].sort(),'06 launch has exactly five parameters');
    assert.strictEqual(launchUrl.searchParams.get('hook'),'https://staging.example/exec','07 current hook preserved');
    assert.strictEqual(launchUrl.searchParams.get('study'),'practice-set','08 linked Practice content used');
    assert.strictEqual(launchUrl.searchParams.get('assignment_target_id'),'practice-target','09 Practice target used');
    assert.strictEqual(launchUrl.searchParams.get('student_id'),'student-1','10 student scope preserved');
    assert.strictEqual(launchUrl.searchParams.get('assignmentCapability'),'practice-target-cap','11 newly returned Practice capability used');
    assert.notStrictEqual(launchUrl.searchParams.get('assignmentCapability'),'theory-launch-cap','12 Theory launch capability not reused');
    assert.notStrictEqual(launchUrl.searchParams.get('assignmentCapability'),'theory-attempt-cap','13 Theory attempt capability not reused');
    assert.strictEqual(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'14 390px overflow');

    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-linked-practice="available"]');
    assert.strictEqual(await page.locator('#btnTheoryComplete').count(),0,'15 completed Theory remains read-only');
    assert.strictEqual(posts.filter(x=>x.action==='startAttemptV2').length,0,'16 reentry creates no client-side attempt');
    assert.strictEqual(await page.locator('[data-linked-practice="available"]').count(),1,'17 CTA restored from server response');

    reentryLaunch=null;await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#theoryCompletionCard');
    assert.strictEqual(await page.locator('[data-linked-practice]').count(),0,'18 no-link Theory has no CTA');

    reentryLaunch={available:false,reason:'PRACTICE_TARGET_UNAVAILABLE'};await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-linked-practice="unavailable"]');
    assert.strictEqual(await page.locator('[data-linked-practice="unavailable"]').textContent(),'연습문제가 아직 배정되지 않았어요.','19 missing target has safe guidance');
    assert.strictEqual(await page.locator('[data-linked-practice="available"]').count(),0,'20 missing target has no launch link');

    completed=false;reentryLaunch=null;completionResult={complete:false,attempt_status:'IN_PROGRESS'};
    page.on('dialog',dialog=>dialog.accept());await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#btnTheoryComplete');await page.click('#btnTheoryComplete');
    await page.waitForFunction(()=>!document.getElementById('btnTheoryComplete').disabled);
    assert.strictEqual(await page.locator('[data-linked-practice]').count(),0,'21 failed completion verification exposes no CTA');
    assert.strictEqual(posts.filter(x=>x.action==='completeGrammarActivityV1').length,2,'22 no automatic completion retry');
    console.log('grammar_theory_practice_cta_student_ui.test.js: 22/22 cases passed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
