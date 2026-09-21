// Isolated candidate-only browser test; no real teacher state is opened or changed.
const path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await context.route(/^https?:\/\//,route=>route.abort());
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);},settle=()=>page.evaluate(()=>ReviewAdapter.whenIdle());
  try{
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();
    await page.click('[data-open="corpus:25018"]');
    await page.locator('.advanced').evaluate(el=>el.open=true);
    check('subject candidate is secondary and collapsed',await page.locator('.subject-candidates').count()===1&&!await page.locator('.subject-candidates').getAttribute('open'));
    check('candidate generation does not change teacher acceptable answers',await page.evaluate(()=>ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:25018').teacher.teacher_clauses[0].teacher_acceptable_subject_spans.length===0));
    await page.click('.subject-candidates > summary');
    check('We all candidate is shown with explicit controls',await page.locator('.subject-candidates').innerText().then(x=>x.includes('We all')&&x.includes('허용')&&x.includes('무시')));
    await page.click('[data-subject-candidate][data-candidate-decision="ACCEPT"]');await settle();
    check('teacher click stores We all and hides resolved suggestion',await page.evaluate(()=>JSON.stringify(ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:25018').teacher.teacher_clauses[0].teacher_acceptable_subject_spans)==='[[0,1]]')&&await page.locator('.subject-candidates').count()===0);
    check('subject candidate persists to IndexedDB',await page.evaluate(async()=>JSON.stringify((await ReviewAdapter.getPersistedSnapshot()).records.find(r=>r.sentence_id==='corpus:25018').teacher.teacher_clauses[0].teacher_acceptable_subject_spans)==='[[0,1]]'));

    await page.click('[data-open="corpus:59087"]');
    await page.locator('.advanced').evaluate(el=>el.open=true);
    const passive=page.locator('.verb-candidates').filter({hasText:'수동형 준동사 포함 후보'});
    check('passive nonfinite candidate is secondary and collapsed',await passive.count()===1&&!await passive.getAttribute('open'));
    await passive.locator('summary').click();
    check('passive candidate contrasts current and proposed spans',await passive.innerText().then(x=>x.includes('현재: needs')&&x.includes('후보: needs to be done.')));
    await passive.locator('[data-candidate-decision="USE_CANDIDATE"]').click();await settle();
    check('explicit candidate use updates only teacher span and requires reconfirmation',await page.evaluate(()=>{const r=ReviewAdapter.getDocument().records.find(r=>r.sentence_id==='corpus:59087'),c=r.teacher.teacher_clauses.find(c=>c.clause_id==='c4'),p=c.teacher_predicates[0];return JSON.stringify(p.teacher_student_verb_span_indexes)==='[24,25,26,27]'&&!c.teacher_verified&&!r.teacher.gold_approved;}));
    check('verb candidate persists to IndexedDB',await page.evaluate(async()=>JSON.stringify((await ReviewAdapter.getPersistedSnapshot()).records.find(r=>r.sentence_id==='corpus:59087').teacher.teacher_clauses.find(c=>c.clause_id==='c4').teacher_predicates[0].teacher_student_verb_span_indexes)==='[24,25,26,27]'));

    await page.reload();await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();
    check('F5 restores acceptable and verb candidate decisions',await page.evaluate(()=>{const d=ReviewAdapter.getDocument(),s=d.records.find(r=>r.sentence_id==='corpus:25018').teacher.teacher_clauses[0],v=d.records.find(r=>r.sentence_id==='corpus:59087').teacher.teacher_clauses.find(c=>c.clause_id==='c4').teacher_predicates[0];return JSON.stringify(s.teacher_acceptable_subject_spans)==='[[0,1]]'&&JSON.stringify(v.teacher_student_verb_span_indexes)==='[24,25,26,27]';}));
    await page.setViewportSize({width:390,height:844});await page.click('[data-open="corpus:21897"]');await page.locator('.advanced').evaluate(el=>el.open=true);await page.locator('.verb-candidates').first().locator('summary').click();
    check('390px candidate UI has no document overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('no browser errors',errors.length===0);
    console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
