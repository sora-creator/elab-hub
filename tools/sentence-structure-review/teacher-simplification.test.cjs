const path=require('path');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');
const base='http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/tools/sentence-structure-review/index.html';
async function ready(page){await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();}
async function idle(page){await page.evaluate(()=>ReviewAdapter.whenIdle());}
async function source(page){await page.locator('.pdf-custom-status.matched').waitFor({timeout:20000});await page.click('[data-source-one-click]');await idle(page);}
const clauseInternals=r=>r.teacher.teacher_clauses.map(c=>({clause_id:c.clause_id,type:c.teacher_type,parent:c.teacher_parent,depth:c.teacher_depth,start:c.teacher_start,end:c.teacher_end,predicates:c.teacher_predicates.map(p=>({predicate_id:p.predicate_id,order:p.predicate_order,source:p.source_auto_predicate_id,auto_span:p.auto_student_verb_span_indexes,auto_finite:p.auto_finite_carrier_indexes,auto_lexical:p.auto_lexical_verb_indexes,auto_aux:p.auto_auxiliary_indexes,auto_nonfinite:p.auto_nonfinite_complement_indexes,auto_be_pp:p.auto_be_pp_classification}))}));
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[],checks=[];
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  const observe=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
  try{
    const finalContext=await browser.newContext({viewport:{width:1440,height:1000}}),page=await finalContext.newPage();observe(page);await page.goto(base+'?dataset=final-holdout8');await ready(page);
    const before=await page.evaluate(()=>{const d=ReviewAdapter.getDocument(),r=d.records.find(x=>x.sentence_id==='corpus:58378');return {auto:JSON.stringify(r.auto),internals:r.teacher.teacher_clauses.map(c=>({clause_id:c.clause_id,type:c.teacher_type,parent:c.teacher_parent,depth:c.teacher_depth,start:c.teacher_start,end:c.teacher_end,predicates:c.teacher_predicates.map(p=>({predicate_id:p.predicate_id,order:p.predicate_order,source:p.source_auto_predicate_id,auto_span:p.auto_student_verb_span_indexes,auto_finite:p.auto_finite_carrier_indexes,auto_lexical:p.auto_lexical_verb_indexes,auto_aux:p.auto_auxiliary_indexes,auto_nonfinite:p.auto_nonfinite_complement_indexes,auto_be_pp:p.auto_be_pp_classification}))})),db:ReviewAdapter.getIndexedDbName(),fingerprint:d.input_fingerprint};});
    const initialSteps=await page.locator('.review-step').allTextContents();
    check('progress panel has exactly four product steps',initialSteps.length===4&&initialSteps.every((x,i)=>x.includes(`${i+1}단계`))&&initialSteps[0].includes('PDF 원문')&&initialSteps[1].includes('주어·동사구')&&initialSteps[2].includes('난이도')&&initialSteps[3].includes('Gold'));
    check('internal analysis is closed by default',!await page.locator('.advanced').getAttribute('open'));
    check('optional Skill, be+p.p., interpretation and candidates live only in advanced analysis',await page.locator('.skills-review').evaluate(x=>!!x.closest('.advanced'))&&await page.locator('.interpretation-review').evaluate(x=>!!x.closest('.advanced'))&&await page.locator('.decision-section').count()===0||await page.locator('.decision-section').evaluate(x=>!!x.closest('.advanced')));
    check('basic answer cards use meaning-unit labels, not parser clause types',await page.locator('.answer-clause-head h3').allTextContents().then(x=>JSON.stringify(x)===JSON.stringify(['의미 단위 1','의미 단위 2'])));
    await source(page);
    for(const id of ['c1','c2']){await page.click(`[data-verify="clause"][data-clause="${id}"]`);await idle(page);}
    const level=await page.evaluate(()=>ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:58378').auto.teacher_level_candidate);await page.click(`[data-level="${level}"]`);await idle(page);
    const readyState=await page.evaluate(()=>{const d=ReviewAdapter.getDocument(),r=d.records.find(x=>x.sentence_id==='corpus:58378');return {gold_errors:ReviewCore.goldErrors(r),annotation_errors:ReviewCore.annotationErrors(r),skills_verified:r.teacher.skills_verified,bepp_verified:r.teacher.teacher_clauses.flatMap(c=>c.teacher_predicates).filter(p=>p.auto_be_pp_classification).every(p=>p.teacher_be_pp_verified),approved:r.teacher.gold_approved};});
    check('internal clause error remains available but no longer blocks Gold',readyState.annotation_errors.includes('c2: 종속절 parent가 필요합니다.')&&readyState.gold_errors.length===0);
    check('Skill and be+p.p. confirmation are not Gold prerequisites',!readyState.skills_verified&&readyState.gold_errors.every(x=>!x.includes('학습 요소')&&!x.includes('be+p.p.')));
    check('Gold button is enabled after source, answers and Level only',!await page.locator('#approve-gold').isDisabled());
    await page.click('#approve-gold');await page.waitForTimeout(900);await idle(page);
    const approved=await page.evaluate(async()=>{const d=ReviewAdapter.getDocument(),r=d.records.find(x=>x.sentence_id==='corpus:58378'),saved=(await ReviewAdapter.getPersistedSnapshot()).records.find(x=>x.sentence_id==='corpus:58378');return {gold:r.teacher.gold_approved,saved:saved.teacher.gold_approved,count:ReviewCore.progress(d).gold,auto:JSON.stringify(r.auto),internals:r.teacher.teacher_clauses.map(c=>({clause_id:c.clause_id,type:c.teacher_type,parent:c.teacher_parent,depth:c.teacher_depth,start:c.teacher_start,end:c.teacher_end,predicates:c.teacher_predicates.map(p=>({predicate_id:p.predicate_id,order:p.predicate_order,source:p.source_auto_predicate_id,auto_span:p.auto_student_verb_span_indexes,auto_finite:p.auto_finite_carrier_indexes,auto_lexical:p.auto_lexical_verb_indexes,auto_aux:p.auto_auxiliary_indexes,auto_nonfinite:p.auto_nonfinite_complement_indexes,auto_be_pp:p.auto_be_pp_classification}))}))};});
    check('simplified workflow can approve and persist Gold',approved.gold&&approved.saved&&approved.count===1);
    check('parser output and clause internals are preserved byte-for-byte',approved.auto===before.auto&&JSON.stringify(approved.internals)===JSON.stringify(before.internals));
    check('Final Holdout8 IndexedDB namespace follows the cleaned fingerprint',before.db.endsWith(before.fingerprint));
    await page.reload();await ready(page);
    check('F5 retains simplified Gold approval',await page.evaluate(()=>ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:58378').teacher.gold_approved));
    await finalContext.close();

    const pilotContext=await browser.newContext({viewport:{width:1280,height:900}}),pilot=await pilotContext.newPage();observe(pilot);await pilot.goto(base);await ready(pilot);await pilot.click('[data-open="corpus:2449"]');await source(pilot);await pilot.click('[data-verify="clause"][data-clause="c1"]');await idle(pilot);
    const parallel=await pilot.evaluate(()=>{const r=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:2449'),c=r.teacher.teacher_clauses[0];return {spans:c.teacher_predicates.map(p=>p.teacher_student_verb_span_indexes),legacy:c.teacher_verb_indexes,verified:c.teacher_verified};});
    check('multiple predicates remain independently canonical',parallel.verified&&JSON.stringify(parallel.spans)==='[[1,2],[11,12]]'&&JSON.stringify(parallel.legacy)==='[1,2,11,12]');
    await pilot.click('[data-level="S2"]');await idle(pilot);
    check('an actual unreviewed be+p.p. candidate does not block Gold',await pilot.evaluate(()=>{const r=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:2449'),p=r.teacher.teacher_clauses[0].teacher_predicates[1];return !p.teacher_be_pp_verified&&!r.teacher.skills_verified&&ReviewCore.goldErrors(r).length===0;})&&!await pilot.locator('#approve-gold').isDisabled());
    await pilot.click('[data-open="corpus:25018"]');await source(pilot);await pilot.click('[data-add-acceptable-subject][data-clause="c1"]');await pilot.click('#token-0');await pilot.click('#token-1');await pilot.click('[data-save-acceptable-subject]');await idle(pilot);
    check('acceptable subject span remains editable in the basic answer task',await pilot.evaluate(()=>{const c=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:25018').teacher.teacher_clauses[0];return c.teacher_acceptable_subject_spans.some(x=>JSON.stringify(x)==='[0,1]');}));
    await pilotContext.close();
    check('browser errors zero',errors.length===0);
    console.log(JSON.stringify({passed:checks.length,checks,initial_steps:initialSteps,ready_state:readyState,browser_errors:errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
