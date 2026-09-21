const path=require('path');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');
const base='http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/tools/sentence-structure-review/index.html';
const ids=['corpus:58378','corpus:60837','corpus:23009','corpus:2590','corpus:24339','corpus:23568','corpus:24238','corpus:26675'];
async function ready(page){await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();}
async function verifySource(page){await page.locator('.pdf-custom-status.matched').waitFor({timeout:20000});await page.click('[data-source-one-click]');await page.evaluate(()=>ReviewAdapter.whenIdle());}
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[],checks=[];
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>addEventListener('unhandledrejection',e=>(window.__rejections||(window.__rejections=[])).push(String(e.reason))));
  try{
    await page.goto(base+'?dataset=final-holdout8');await ready(page);await verifySource(page);
    const button=page.locator('[data-verify="clause"][data-clause="c1"]');
    const before=await page.evaluate(()=>{const d=ReviewAdapter.getDocument(),r=d.records[0],c=r.teacher.teacher_clauses[0];return {dataset:ReviewAdapter.getDataset(),current:document.querySelector('.queue-item.active')?.dataset.open,record_index:0,storage:ReviewAdapter.getIndexedDbName(),status:ReviewCore.status(r),gold:ReviewCore.progress(d).gold,edit_mode:!!document.querySelector('[data-clause-editor]'),clause_verified:c.teacher_verified,revision:r.teacher.revision,errors:ReviewCore.annotationErrors(r)};});
    const dom=await button.evaluate(b=>{const s=getComputedStyle(b),box=b.getBoundingClientRect(),top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);window.__confirmClicks=0;b.addEventListener('click',()=>window.__confirmClicks++,true);return {disabled:b.disabled,aria_disabled:b.getAttribute('aria-disabled'),pointer_events:s.pointerEvents,top_is_button:top===b};});
    check('Final button is enabled and unobstructed',!dom.disabled&&dom.aria_disabled===null&&dom.pointer_events==='auto'&&dom.top_is_button);
    await button.click();await page.evaluate(()=>ReviewAdapter.whenIdle());
    const after=await page.evaluate(async()=>{const d=ReviewAdapter.getDocument(),r=d.records[0],stored=await ReviewAdapter.getPersistedSnapshot();return {clicks:window.__confirmClicks,clause_verified:r.teacher.teacher_clauses[0].teacher_verified,revision:r.teacher.revision,gold:ReviewCore.progress(d).gold,notice:document.querySelector('#notice').textContent,saved_revision:stored.records[0].teacher.revision,next_focus:!!document.querySelector('.answer-review.review-auto-focus'),rejections:window.__rejections||[]};});
    check('click event received',after.clicks===1);check('current clause confirmed',after.clause_verified);check('IndexedDB save called and verified',after.saved_revision===after.revision);check('next required step focused',after.next_focus);check('Gold remains zero',after.gold===0);check('no promise rejection',after.rejections.length===0);
    await page.reload();await ready(page);check('F5 retains clause confirmation',await page.evaluate(()=>ReviewAdapter.getDocument().records[0].teacher.teacher_clauses[0].teacher_verified));
    const smokeContext=await browser.newContext({viewport:{width:1280,height:900}}),smoke=await smokeContext.newPage();smoke.on('pageerror',e=>errors.push(e.message));smoke.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await smoke.goto(base+'?dataset=final-holdout8');await ready(smoke);
    const smokeResults=[];
    for(const id of ids){await smoke.click(`[data-open="${id}"]`);await verifySource(smoke);const mainId=await smoke.evaluate(sentenceId=>{const r=ReviewAdapter.getDocument().records.find(x=>x.sentence_id===sentenceId);return (r.teacher.teacher_clauses.find(c=>c.teacher_type==='MAIN')||r.teacher.teacher_clauses[0]).clause_id;},id),mainButton=smoke.locator(`[data-verify="clause"][data-clause="${mainId}"]`);const enabled=!await mainButton.isDisabled()&&await mainButton.evaluate(x=>getComputedStyle(x).pointerEvents==='auto');await mainButton.click();await smoke.evaluate(()=>ReviewAdapter.whenIdle());const state=await smoke.evaluate(({sentenceId,clauseId})=>{const d=ReviewAdapter.getDocument(),r=d.records.find(x=>x.sentence_id===sentenceId);return {verified:r.teacher.teacher_clauses.find(c=>c.clause_id===clauseId).teacher_verified,gold:ReviewCore.progress(d).gold,notice:document.querySelector('#notice').textContent};},{sentenceId:id,clauseId:mainId});smokeResults.push({id,mainId,enabled,...state});}
    check('all Final8 MAIN confirm actions work',smokeResults.every(x=>x.enabled&&x.verified&&x.gold===0));await smokeContext.close();
    const pilotContext=await browser.newContext({viewport:{width:1280,height:900}}),pilot=await pilotContext.newPage();pilot.on('pageerror',e=>errors.push(e.message));pilot.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await pilot.goto(base);await ready(pilot);await pilot.click('[data-open="corpus:2449"]');await verifySource(pilot);const pilotButton=pilot.locator('[data-verify="clause"][data-clause="c1"]');await pilotButton.click();await pilot.evaluate(()=>ReviewAdapter.whenIdle());check('Pilot50 same button still works',await pilot.evaluate(()=>ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:2449').teacher.teacher_clauses[0].teacher_verified));await pilot.reload();await ready(pilot);check('Pilot50 F5 retains confirmation',await pilot.evaluate(()=>ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:2449').teacher.teacher_clauses[0].teacher_verified));await pilotContext.close();
    check('browser errors zero',errors.length===0);
    console.log(JSON.stringify({passed:checks.length,checks,before,dom,after,smoke_results:smokeResults,browser_errors:errors},null,2));
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
