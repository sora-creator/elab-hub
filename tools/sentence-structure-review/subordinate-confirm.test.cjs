const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');
const base='http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/tools/sentence-structure-review/index.html';
const finalIds=['corpus:58378','corpus:60837','corpus:23009','corpus:2590','corpus:24339','corpus:23568','corpus:24238','corpus:26675'];
const gold34Path=process.env.ELAB_PILOT_REVIEW_EXPORT||path.join(process.env.USERPROFILE||'','Downloads','sentence-structure-pilot50-review.json');
async function ready(page){await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();}
async function idle(page){await page.evaluate(()=>ReviewAdapter.whenIdle());}
async function source(page){await page.locator('.pdf-custom-status.matched').waitFor({timeout:20000});await page.click('[data-source-one-click]');await idle(page);}
async function instrument(page){await page.evaluate(()=>{window.__confirmTrace=[];window.__idbPutCount=0;const confirm=ReviewCore.confirmClause;ReviewCore.confirmClause=function(row,id){window.__confirmTrace.push({sentence_id:row.sentence_id,clause_id:id});return confirm(row,id);};const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){window.__idbPutCount++;return put.apply(this,arguments);};});}
const goldCount=doc=>doc.records.filter(r=>r.teacher.gold_approved).length;
function teacherContract(value){const t=JSON.parse(JSON.stringify(value));for(const c of t.teacher_clauses){delete c.auto_acceptable_subject_candidates;c.PUBLIC_IDENTIFIER_REMOVED||=[];for(const p of c.teacher_predicates){delete p.verb_span_candidates;p.teacher_ignored_verb_span_candidate_ids||=[];}}return t;}
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[],checks=[];
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  const observe=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();observe(page);
    await page.goto(base+'?dataset=final-holdout8');await ready(page);await source(page);await instrument(page);
    const selector='[data-verify="clause"][data-clause="c2"]',button=page.locator(selector);await button.scrollIntoViewIfNeeded();
    const before=await page.evaluate(selector=>{const b=document.querySelector(selector),card=b.closest('[data-answer-clause]'),cards=[...document.querySelectorAll('[data-answer-clause]')],d=ReviewAdapter.getDocument(),active=document.querySelector('.queue-item.active')?.dataset.open,r=d.records.find(x=>x.sentence_id===active),c=r.teacher.teacher_clauses.find(x=>x.clause_id===b.dataset.clause),box=b.getBoundingClientRect(),top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);window.__subClickCount=0;b.addEventListener('click',()=>window.__subClickCount++,true);return {active_sentence_id:active,button_dataset:{...b.dataset},rendered_clause_index:cards.indexOf(card),canonical_clause_index:r.teacher.teacher_clauses.findIndex(x=>x.clause_id===c.clause_id),clause_id:c.clause_id,parent_clause_id:c.teacher_parent,disabled:b.disabled,aria_disabled:b.getAttribute('aria-disabled'),pointer_events:getComputedStyle(b).pointerEvents,top_element:top?{tag:top.tagName,className:top.className}:null,blocked_by_overlay:!!top&&top!==b&&!b.contains(top),teacher_verified:c.teacher_verified,revision:r.teacher.revision,idb_put_count:window.__idbPutCount,annotation_errors:ReviewCore.annotationErrors(r)};},selector);
    await button.click();await idle(page);
    const after=await page.evaluate(async()=>{const d=ReviewAdapter.getDocument(),r=d.records.find(x=>x.sentence_id==='corpus:58378'),saved=(await ReviewAdapter.getPersistedSnapshot()).records.find(x=>x.sentence_id==='corpus:58378');return {click_event_count:window.__subClickCount,handler_trace:window.__confirmTrace,main_verified:r.teacher.teacher_clauses.find(x=>x.clause_id==='c1').teacher_verified,subordinate_verified:r.teacher.teacher_clauses.find(x=>x.clause_id==='c2').teacher_verified,revision:r.teacher.revision,idb_put_count:window.__idbPutCount,saved_revision:saved.teacher.revision,saved_clause_ids:saved.teacher.teacher_clauses.filter(x=>x.teacher_verified).map(x=>x.clause_id),notice:document.querySelector('#notice').textContent,gold:ReviewCore.progress(d).gold,gold_errors:ReviewCore.goldErrors(r),next_focus:document.querySelector('.answer-review.review-auto-focus')?.className||null};});
    check('subordinate button is enabled and pointer-active',!before.disabled&&before.aria_disabled===null&&before.pointer_events==='auto');
    check('subordinate button is not blocked by an overlay',!before.blocked_by_overlay);
    check('button click event reaches delegated handler',after.click_event_count===1);
    check('canonical sentence_id + clause_id reaches confirmClause',after.handler_trace.length===1&&after.handler_trace[0].sentence_id==='corpus:58378'&&after.handler_trace[0].clause_id==='c2');
    check('only the target subordinate clause is confirmed',after.subordinate_verified&&!after.main_verified&&JSON.stringify(after.saved_clause_ids)==='["c2"]');
    check('target clause confirmation is persisted to IndexedDB',after.idb_put_count>before.idb_put_count&&after.saved_revision===after.revision);
    check('next required answer action receives focus',!!after.next_focus);
    check('clause confirmation does not approve Gold',after.gold===0);
    check('full Gold gate no longer includes separate parent metadata errors',!after.gold_errors.includes('c2: 종속절 parent가 필요합니다.'));
    await page.reload();await ready(page);
    check('F5 retains only c2 confirmation',await page.evaluate(()=>{const r=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:58378'),flags=Object.fromEntries(r.teacher.teacher_clauses.map(c=>[c.clause_id,c.teacher_verified]));return !flags.c1&&flags.c2&&ReviewCore.progress(ReviewAdapter.getDocument()).gold===0;}));
    await context.close();

    const smokeContext=await browser.newContext({viewport:{width:1280,height:900}}),smoke=await smokeContext.newPage();observe(smoke);await smoke.goto(base+'?dataset=final-holdout8');await ready(smoke);
    const smokeResults=[];
    for(const sentenceId of finalIds){
      await smoke.click(`[data-open="${sentenceId}"]`);await source(smoke);
      const subordinateIds=await smoke.evaluate(id=>ReviewAdapter.getDocument().records.find(r=>r.sentence_id===id).teacher.teacher_clauses.filter(c=>c.teacher_type!=='MAIN').map(c=>c.clause_id),sentenceId);
      for(const clauseId of subordinateIds){
        const target=smoke.locator(`[data-verify="clause"][data-clause="${clauseId}"]`),enabled=!await target.isDisabled()&&await target.evaluate(x=>getComputedStyle(x).pointerEvents==='auto');
        const beforeFlags=await smoke.evaluate(id=>Object.fromEntries(ReviewAdapter.getDocument().records.find(r=>r.sentence_id===id).teacher.teacher_clauses.map(c=>[c.clause_id,c.teacher_verified])),sentenceId);
        await target.click();await idle(smoke);
        const state=await smoke.evaluate(async({sentenceId,clauseId,beforeFlags})=>{const d=ReviewAdapter.getDocument(),r=d.records.find(x=>x.sentence_id===sentenceId),flags=Object.fromEntries(r.teacher.teacher_clauses.map(c=>[c.clause_id,c.teacher_verified])),saved=(await ReviewAdapter.getPersistedSnapshot()).records.find(x=>x.sentence_id===sentenceId),unchanged=Object.keys(flags).filter(id=>id!==clauseId).every(id=>flags[id]===beforeFlags[id]);return {flags,unchanged,persisted:saved.teacher.teacher_clauses.find(c=>c.clause_id===clauseId).teacher_verified,gold:ReviewCore.progress(d).gold};},{sentenceId,clauseId,beforeFlags});
        smokeResults.push({sentenceId,clauseId,enabled,...state});
      }
    }
    check('every Final8 subordinate button confirms its own canonical clause',smokeResults.length===6&&smokeResults.every(x=>x.enabled&&x.flags[x.clauseId]&&x.persisted&&x.unchanged&&x.gold===0));
    await smokeContext.close();

    const nestedContext=await browser.newContext({viewport:{width:1280,height:900}}),nested=await nestedContext.newPage();observe(nested);await nested.goto(base);await ready(nested);await nested.click('[data-open="corpus:2480"]');await source(nested);
    const nestedHierarchy=await nested.evaluate(()=>ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:2480').teacher.teacher_clauses.map(c=>({id:c.clause_id,parent:c.teacher_parent,depth:c.teacher_depth,type:c.teacher_type})));
    const nestedIds=nestedHierarchy.map(x=>x.id),nestedResults=[];
    for(const clauseId of nestedIds){const beforeFlags=await nested.evaluate(()=>Object.fromEntries(ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:2480').teacher.teacher_clauses.map(c=>[c.clause_id,c.teacher_verified])));await nested.click(`[data-verify="clause"][data-clause="${clauseId}"]`);await idle(nested);nestedResults.push(await nested.evaluate(({clauseId,beforeFlags})=>{const r=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:2480'),flags=Object.fromEntries(r.teacher.teacher_clauses.map(c=>[c.clause_id,c.teacher_verified]));return {clauseId,target:flags[clauseId],othersUnchanged:Object.keys(flags).filter(id=>id!==clauseId).every(id=>flags[id]===beforeFlags[id])};},{clauseId,beforeFlags}));}
    check('Pilot main, subordinate, and depth-4 nested clauses confirm independently',nestedHierarchy.some(x=>x.type==='MAIN')&&nestedHierarchy.some(x=>x.type!=='MAIN'&&x.depth===1)&&nestedHierarchy.some(x=>x.depth===4)&&nestedResults.every(x=>x.target&&x.othersUnchanged));
    await nested.reload();await ready(nested);
    check('nested clause confirmations persist across F5',await nested.evaluate(ids=>{const r=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:2480');return ids.every(id=>r.teacher.teacher_clauses.find(c=>c.clause_id===id).teacher_verified)&&ReviewCore.progress(ReviewAdapter.getDocument()).gold===0;},nestedIds));
    await nestedContext.close();

    const gold34=JSON.parse(fs.readFileSync(gold34Path,'utf8')),goldContext=await browser.newContext({viewport:{width:1280,height:900}}),goldPage=await goldContext.newPage();observe(goldPage);await goldPage.goto(base);await ready(goldPage);await goldPage.setInputFiles('#import-file',gold34Path);await goldPage.waitForFunction(()=>document.querySelector('#notice').textContent.includes('가져왔습니다')||document.querySelector('#notice').classList.contains('error'),null,{timeout:15000});await idle(goldPage);
    const imported=await goldPage.evaluate(()=>ReviewAdapter.getDocument());
    const mismatches=gold34.records.filter((r,i)=>JSON.stringify(teacherContract(r.teacher))!==JSON.stringify(teacherContract(imported.records[i].teacher))).map(r=>r.sentence_id);
    check('existing Gold34 teacher fields import without mutation',goldCount(imported)===34&&mismatches.length===0);
    await goldPage.reload();await ready(goldPage);
    const restoredGold=await goldPage.evaluate(()=>ReviewAdapter.getDocument());
    const restoredMismatches=gold34.records.filter((r,i)=>JSON.stringify(teacherContract(r.teacher))!==JSON.stringify(teacherContract(restoredGold.records[i].teacher))).map(r=>r.sentence_id);
    check('existing Gold34 teacher fields remain unchanged after F5',goldCount(restoredGold)===34&&restoredMismatches.length===0);
    await goldContext.close();
    check('browser errors zero',errors.length===0);
    console.log(JSON.stringify({passed:checks.length,checks,before,after,final8_smoke:smokeResults,nested_hierarchy:nestedHierarchy,nested_results:nestedResults,gold34_mismatches:mismatches,gold34_f5_mismatches:restoredMismatches,browser_errors:errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
