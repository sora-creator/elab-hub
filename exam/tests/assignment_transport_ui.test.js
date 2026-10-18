const assert=require('assert');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({
    headless:true,
    executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const counts={};
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await page.route('https://cdn.tailwindcss.com/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:''}));
    await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
    await page.addInitScript(()=>localStorage.setItem('hub.delivery',JSON.stringify({url:'https://staging.example/exec',token:'teacher-fixture'})));
    await page.route('https://staging.example/**',async route=>{
      const url=new URL(route.request().url());
      const action=url.searchParams.get('action')||'';
      counts[action]=(counts[action]||0)+1;
      const payload={
        listStudents:{students:[{student_id:'student-1',name:'STAGING Student',grade:'TEST'}]},
        listGroupsV2:{groups:[]},
        listAssignmentsV2:{assignments:[{assignment_id:'assignment-1',content_type:'SENTENCE_STRUCTURE',content_ref_id:'set-1',title:'Sentence task',content_link:'../sentence-structure/index.html?set_key=set-1',targets:[{student_id:'student-1',status:'NOT_STARTED',active:true}]}]},
        listAssignmentContentV2:{items:[]},
        listDueVocabReviewsV1:{items:[]},
        listHomeworkBatchesV2:{batches:[{lesson_date:'2026-10-02',items:[{assignment_id:'assignment-1',content_type:'SENTENCE_STRUCTURE',content_subtype:'',title:'Sentence task',due_at:'2026-10-09T14:59:59.000Z',status:'NOT_STARTED',snapshot:{}}]}]},
        getSentenceStructureAssignmentEditV1:{assignment_id:'assignment-1',content_type:'SENTENCE_STRUCTURE',content_ref_id:'set-1',content_link:'../sentence-structure/index.html?set_key=set-1',title:'Sentence task',due_at:'2026-10-09T14:59:59.000Z',progress_label:'미시작',sentence_count:1,can_edit_content:true,hint_level:'BASIC',reading_support:'beginner',passages:[{sentence_id:'sentence-1',text:'We learn.',structure_level:'S1'}]}
      }[action]||{};
      const callback=url.searchParams.get('callback');
      const body=callback?`${callback}(${JSON.stringify(payload)})`:JSON.stringify(payload);
      await route.fulfill({status:200,contentType:'application/javascript',body});
    });
    await page.goto('http://localhost/teacher/assignments.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('cfgStatus').textContent==='');
    assert.deepStrictEqual({
      listStudents:counts.listStudents,
      listGroupsV2:counts.listGroupsV2,
      listAssignmentsV2:counts.listAssignmentsV2,
      listAssignmentContentV2:counts.listAssignmentContentV2,
      listDueVocabReviewsV1:counts.listDueVocabReviewsV1
    },{listStudents:1,listGroupsV2:1,listAssignmentsV2:1,listAssignmentContentV2:1,listDueVocabReviewsV1:1});
    assert.strictEqual(counts.getSentenceStructureAssignmentEditV1||0,0,'history render must not fetch every sentence assignment detail');

    await page.check('input[name="student"][value="student-1"]');
    await page.waitForSelector('[data-ss-edit="assignment-1"]');
    await page.waitForTimeout(50);
    assert.strictEqual(counts.listHomeworkBatchesV2,1,'lesson and vocabulary history must share one in-flight read');
    const schedulerSnapshot=await page.evaluate(()=>window.__ELAB_TEACHER_BOOTSTRAP_SCHEDULER__.snapshot());
    assert.strictEqual(schedulerSnapshot.maxConcurrent,2,'actual product scheduler cap is two');
    assert.strictEqual(schedulerSnapshot.peak,2,'actual product bootstrap reaches but never exceeds two');
    assert.strictEqual(schedulerSnapshot.claimed,6,'all six bootstrap actions use the product scheduler');
    assert.strictEqual(schedulerSnapshot.active+schedulerSnapshot.queued+schedulerSnapshot.inflight,0,'product scheduler fully settles');

    for(const value of ['14','30','7'])await page.click(`[data-due="${value}"]`);
    await page.click('[data-source="SENTENCE_STRUCTURE"]');
    await page.click('#ssRecommend');
    await page.check('input[name="ssHint"][value="DETAILED"]',{force:true});
    assert.strictEqual(counts.listStudents,1,'client rerenders must not restart bootstrap');
    assert.strictEqual(counts.listHomeworkBatchesV2,1,'client-only changes must not reload history');

    await page.click('[data-ss-edit="assignment-1"]');
    await page.waitForSelector('#ssEditTitle');
    assert.strictEqual(counts.getSentenceStructureAssignmentEditV1,1,'detail is loaded only when edit opens');
    assert.deepStrictEqual(errors,[]);
    console.log('assignment_transport_ui.test.js: initial=5 history=1 detail-on-click=1 errors=0');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
