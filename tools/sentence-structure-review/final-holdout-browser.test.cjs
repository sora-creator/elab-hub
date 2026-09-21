const fs=require('fs'),path=require('path');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');
const base='http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/tools/sentence-structure-review/index.html';
const ids=['corpus:58378','corpus:60837','corpus:23009','corpus:2590','corpus:24339','corpus:23568','corpus:24238','corpus:26675'];
const pages=[3,3,8,7,2,7,3,2];
(async()=>{
  const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],checks=[],pdf=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});page.on('dialog',d=>d.accept());
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  await page.goto(base);await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();
  check('default URL loads Pilot50',await page.locator('.queue-item').count()===50&&await page.evaluate(()=>ReviewAdapter.getDataset().id==='pilot50'));
  const pilotExport=await page.evaluate(()=>ReviewCore.exportDoc(ReviewAdapter.getDocument()));
  const pilotDb=await page.evaluate(()=>ReviewAdapter.getIndexedDbName());
  check('Pilot uses legacy IndexedDB namespace',pilotDb==='elab.teacher-review.indexeddb.v1.PUBLIC_IDENTIFIER_REMOVED');
  await page.goto(base+'?dataset=final-holdout8');await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();
  check('Holdout loads exactly 8 in exact order',await page.locator('.queue-item').count()===8&&JSON.stringify(await page.locator('.queue-item').evaluateAll(xs=>xs.map(x=>x.dataset.open)))===JSON.stringify(ids));
  check('Holdout starts Gold 0/8',await page.evaluate(()=>ReviewCore.progress(ReviewAdapter.getDocument()).gold===0&&ReviewAdapter.getDocument().records.every(r=>ReviewCore.status(r)!=='GOLD_READY')));
  check('dataset label and progress visible',await page.locator('.dataset-label').innerText().then(x=>x.includes('Final Holdout 8')&&x.includes('검수 완료 0 / 8')));
  check('first sentence corpus:58378 is open',await page.locator('.queue-item.active').getAttribute('data-open')==='corpus:58378');
  const holdoutDb=await page.evaluate(()=>ReviewAdapter.getIndexedDbName());
  check('IndexedDB namespace is dataset-isolated',holdoutDb!==pilotDb&&holdoutDb.includes('final-holdout8'));
  check('candidate recommendations remain collapsed and secondary',await page.locator('.auto-reference').count()>0&&await page.locator('.auto-reference[open]').count()===0&&await page.evaluate(()=>getComputedStyle(document.querySelector('.auto-reference')).opacity==='0.78'));
  for(let i=0;i<ids.length;i++){
    await page.click(`[data-open="${ids[i]}"]`);
    const href=await page.locator('[data-pdf-open]').getAttribute('href');
    const url=href.split('#')[0],response=await context.request.get(url);
    let highlighted=false;
    try{await page.locator('.pdf-custom-status.matched').waitFor({timeout:20000});highlighted=true;}catch{}
    pdf.push({id:ids[i],status:response.status(),page_fragment:href.endsWith('#page='+pages[i]),highlighted});
    check(`${ids[i]} PDF HTTP/page/highlight`,response.status()===200&&href.endsWith('#page='+pages[i])&&highlighted);
  }
  await page.click('[data-open="corpus:58378"]');
  const zoomBefore=await page.locator('[data-pdf-zoom-label]').innerText();await page.locator('[data-pdf-zoom-in]').click();await page.waitForFunction(before=>document.querySelector('[data-pdf-zoom-label]')?.textContent!==before,zoomBefore);check('PDF zoom works',(await page.locator('[data-pdf-zoom-label]').innerText())!==zoomBefore);
  await page.locator('[data-pdf-sentence]').click();check('PDF sentence-location control works',await page.locator('.pdf-custom-status').innerText().then(x=>x.includes('문장')));
  const scroller=page.locator('.pdf-custom-scroll');await scroller.evaluate(x=>{x.scrollLeft=30;x.scrollTop=30;});check('PDF pan container scrolls',await scroller.evaluate(x=>x.scrollTop>=0&&getComputedStyle(x).overflow==='auto'));
  const note='HOLDOUT_DATASET_PERSISTENCE_TEST';await page.locator('[data-field="source_note"]').evaluate((x,value)=>{x.value=value;x.dispatchEvent(new Event('change',{bubbles:true}));},note);await page.evaluate(()=>ReviewAdapter.whenIdle());
  await page.reload();await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();check('F5 persistence',await page.locator('[data-field="source_note"]').inputValue()===note);
  await page.close();const reopened=await context.newPage();reopened.on('pageerror',error=>errors.push(error.message));reopened.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});await reopened.goto(base+'?dataset=final-holdout8');await reopened.waitForLoadState('networkidle');await reopened.locator('.queue-item').first().waitFor();check('tab close/reopen persistence',await reopened.locator('[data-field="source_note"]').inputValue()===note);
  check('reopen remains first Holdout sentence',await reopened.locator('.queue-item.active').getAttribute('data-open')==='corpus:58378');
  const downloadPromise=reopened.waitForEvent('download');await reopened.click('#export-json');const download=await downloadPromise,downloaded=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  check('Holdout export filename and dataset contract',/^sentence-structure-final-holdout8-\d{8}-\d{4}\.json$/.test(download.suggestedFilename())&&downloaded.dataset_id==='final-holdout8'&&downloaded.dataset_version==='1'&&downloaded.dataset_fingerprint&&downloaded.records.length===8);
  await reopened.setInputFiles('#import-file',{name:'pilot50-cross-dataset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pilotExport))});await reopened.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('fingerprint'));check('cross-dataset UI import is blocked',await reopened.locator('#notice').innerText().then(x=>x.includes('dataset')&&x.includes('fingerprint'))&&await reopened.evaluate(()=>ReviewAdapter.getDataset().id==='final-holdout8'&&ReviewCore.progress(ReviewAdapter.getDocument()).gold===0));
  check('browser console errors 0',errors.length===0);
  console.log(JSON.stringify({passed:checks.length,checks,pilot_db:pilotDb,holdout_db:holdoutDb,pdf,browser_errors:errors},null,2));
  await context.close();await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
