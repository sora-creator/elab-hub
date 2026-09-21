// Isolated 14 -> 15 Gold pilot E2E. Synthetic approvals are test-only.
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const {pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');
const out=path.join(root,'output/sentence-structure-review/tests');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1100,height:800},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await context.route(/^https?:\/\//,route=>route.abort());
  try{
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
    await page.waitForLoadState('networkidle');
    await page.locator('.queue-item').first().waitFor();
    const prepared=await page.evaluate(()=>{
      const doc=ReviewAdapter.getBaseline(),ready=[];
      for(const row of doc.records){
        try{
          ReviewCore.verifySourceFromPdf(row,{pdf_opened:true,pdf_reference:'TEST_ONLY_LOCAL_PDF.pdf',local_reference:'TEST_ONLY_LOCAL_PDF.pdf',page:null,no_page_metadata:true});
          ReviewCore.verify(row,'token');
          for(const clause of row.teacher.teacher_clauses)for(const predicate of clause.teacher_predicates)if(predicate.auto_be_pp_classification)ReviewCore.confirmBePp(row,clause.clause_id,predicate.predicate_id,predicate.auto_be_pp_classification);
          for(const clause of row.teacher.teacher_clauses)ReviewCore.verify(row,'clause',clause.clause_id);
          ReviewCore.verify(row,'skills');
          ReviewCore.confirmLevel(row,row.auto.teacher_level_candidate);
          ready.push(row.sentence_id);
          if(ready.length<=14)ReviewCore.verify(row,'gold');
          if(ready.length===15)break;
        }catch(error){row.teacher=ReviewAdapter.getBaseline().records.find(x=>x.sentence_id===row.sentence_id).teacher;row.history=[];}
      }
      return {json:JSON.stringify(ReviewCore.exportDoc(doc)),readyId:ready[14],readyCount:ready.length,gold:ReviewCore.progress(doc).gold};
    });
    assert.equal(prepared.readyCount,15,'fixture must contain 15 valid reviewable sentences');
    assert.equal(prepared.gold,14,'fixture must start at Gold 14');
    await page.setInputFiles('#import-file',{name:'SYNTHETIC_14_GOLD.json',mimeType:'application/json',buffer:Buffer.from(prepared.json)});
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('가져왔습니다'));
    await page.click(`[data-open="${prepared.readyId}"]`);
    assert.equal(await page.locator('#approve-gold').isDisabled(),false,'15th Gold must be approvable');

    await page.evaluate(()=>{window.__pilotOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('PILOT_TEST_IDB_FAILURE','UnknownError');};window.scrollTo(0,600);document.querySelector('#approve-gold').click();});
    await page.evaluate(()=>ReviewAdapter.whenIdle());
    const failed=await page.evaluate(id=>({active:document.querySelector('.queue-item.active b')?.textContent,gold:ReviewCore.progress(ReviewAdapter.getDocument()).gold,scrollY,notice:document.querySelector('#notice').textContent,persisted:null}),prepared.readyId);
    assert.equal(failed.active,prepared.readyId,'save failure must not navigate');
    assert.equal(failed.gold,14,'save failure must roll Gold back to 14');
    assert(failed.scrollY>0,'save failure must not scroll to top');
    assert(failed.notice.includes('IndexedDB 저장에 실패하여 변경을 적용하지 않았습니다.'),'save failure reason');
    await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__pilotOriginalPut;});

    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.evaluate(()=>document.querySelector('#approve-gold').click());
    await page.evaluate(()=>ReviewAdapter.whenIdle());
    const completed=await page.evaluate(async id=>{const saved=await ReviewAdapter.getPersistedSnapshot();return {active:document.querySelector('.queue-item.active b')?.textContent,gold:ReviewCore.progress(ReviewAdapter.getDocument()).gold,persistedGold:saved.records.filter(row=>row.teacher.gold_approved).length,scrollY,notice:document.querySelector('#notice').textContent,banner:document.querySelector('.pilot-goal-complete')?.textContent||'',pdfVisible:document.querySelector('.pdf-panel').getBoundingClientRect().top<innerHeight,trace:ReviewAdapter.getLastGoldTrace()};},prepared.readyId);
    assert.equal(completed.gold,15,'15th Gold saved');
    assert.equal(completed.persistedGold,15,'15th Gold persisted');
    assert.equal(completed.active,prepared.readyId,'must not auto-navigate to the 16th sentence');
    assert.equal(completed.scrollY,0,'15th completion scrolls to top summary');
    assert(completed.pdfVisible,'PDF/source area is visible from the top');
    assert(completed.notice.includes('1차 Gold 15문장 검수가 완료되었습니다.')&&completed.notice.includes('자동분석 오류패턴 검증을 진행하세요.'),'15 Gold notice');
    assert(completed.banner.includes('1차 Gold 15문장 검수가 완료되었습니다.')&&completed.banner.includes('검수 JSON 내보내기'),'15 Gold completion banner');
    assert.deepEqual(completed.trace,{gold_click_received:true,gold_state_updated:true,persist_success:true,current_gold_count:15,auto_next_condition:false,next_sentence_found:false,next_sentence_id:null,next_sentence_selected:false,rerendered:false,scroll_top_executed:true},'15th Gold trace stops auto-next only at target');
    await page.screenshot({path:path.join(out,'gold-15-complete.png'),fullPage:false});

    const downloadPromise=page.waitForEvent('download');
    await page.click('[data-pilot-export]');
    const download=await downloadPromise,exportPath=path.join(out,'SYNTHETIC_TEST_ONLY_15_GOLD.json');
    await download.saveAs(exportPath);
    const exported=JSON.parse(fs.readFileSync(exportPath,'utf8'));
    assert.equal(exported.records.filter(row=>row.review_status==='GOLD_READY').length,15,'completion export retains 15 Gold');

    await page.reload();await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();
    assert.equal(await page.evaluate(()=>ReviewCore.progress(ReviewAdapter.getDocument()).gold),15,'F5 retains 15 Gold');
    assert.equal(await page.locator('.pilot-goal-complete').count(),1,'F5 restores completion guidance');
    assert.equal(errors.length,0,'browser errors: '+errors.join(' | '));
    const result={test_only:true,prepared_gold:14,saved_gold:15,persisted_gold:completed.persistedGold,save_failure_no_navigation:true,save_failure_no_scroll:true,automatic_16th_navigation:false,scroll_top:completed.scrollY,export_gold:15,f5_gold:15,browser_errors:errors};
    fs.writeFileSync(path.join(out,'gold-pilot-results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
