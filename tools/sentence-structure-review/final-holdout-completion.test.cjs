const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright'),C=require('./core.js'),bundle=require('../../output/sentence-structure-final-holdout/FINAL_HOLDOUT_8_ANNOTATIONS.json');
const base='http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/tools/sentence-structure-review/index.html?dataset=final-holdout8';
function makeReady(row,approve){
  const main=row.teacher.teacher_clauses.find(c=>c.teacher_type==='MAIN')||row.teacher.teacher_clauses[0];
  for(const c of row.teacher.teacher_clauses)if(c.teacher_type!=='MAIN'){c.teacher_parent=main.clause_id;c.teacher_depth=1;}
  const e=row.auto.source_evidence[0];C.verifySourceFromPdf(row,{pdf_opened:true,pdf_reference:e.pdf_path,pdf_path:e.pdf_path,page:e.page});C.verify(row,'token');
  for(const c of row.teacher.teacher_clauses)for(const p of c.teacher_predicates)if(p.auto_be_pp_classification)C.confirmBePp(row,c.clause_id,p.predicate_id,p.auto_be_pp_classification);
  for(const c of row.teacher.teacher_clauses)C.confirmClause(row,c.clause_id);C.verify(row,'skills');C.confirmLevel(row,row.auto.teacher_level_candidate);if(approve)C.verify(row,'gold');
}
(async()=>{
  const synthetic=C.fromDataset(bundle);synthetic.records.forEach((row,index)=>makeReady(row,index<7));assert.equal(C.progress(synthetic).gold,7);assert.equal(C.goldErrors(synthetic.records[7]).length,0);
  const fixture=path.join(os.tmpdir(),'elab-final-holdout8-seven-gold.json');fs.writeFileSync(fixture,JSON.stringify(C.exportDoc(synthetic)));
  const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
  try{
    await page.goto(base);await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();await page.setInputFiles('#import-file',fixture);await page.evaluate(()=>ReviewAdapter.whenIdle());await page.click('[data-open="corpus:26675"]');
    assert.equal(await page.locator('#approve-gold').isDisabled(),false);await page.click('#approve-gold');await page.evaluate(()=>ReviewAdapter.whenIdle());
    const result=await page.evaluate(()=>({gold:ReviewCore.progress(ReviewAdapter.getDocument()).gold,current:document.querySelector('.queue-item.active')?.dataset.open,trace:ReviewAdapter.getLastGoldTrace(),notice:document.querySelector('#notice').textContent,complete:document.querySelector('.pilot-goal-complete')?.textContent||''}));
    assert.equal(result.gold,8);assert.equal(result.current,'corpus:26675');assert.equal(result.trace.auto_next_condition,false);assert.equal(result.trace.next_sentence_selected,false);assert.match(result.notice,/Final Holdout 8 검수가 완료/);assert.match(result.complete,/추가 검수를 진행하지 마세요/);assert.equal(errors.length,0);
    console.log(JSON.stringify({passed:7,gold:result.gold,current:result.current,auto_next_condition:result.trace.auto_next_condition,completion_message:true,export_button:!!(await page.$('[data-pilot-export]')),browser_errors:errors},null,2));
  }finally{await context.close();await browser.close();if(fs.existsSync(fixture))fs.unlinkSync(fixture);}
})().catch(error=>{console.error(error);process.exitCode=1;});
