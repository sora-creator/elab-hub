const assert=require('assert'),fs=require('fs');
require('./helpers/local-only-browser.cjs');
const {chromium}=require('playwright');
const assignmentHtml=fs.readFileSync('teacher/assignments.html','utf8');
const grammarHtml=fs.readFileSync('grammar/index.html','utf8');

const students=[{student_id:'s1',name:'학생 1',active:true},{student_id:'s2',name:'학생 2',active:true}];
const target=(studentId)=>({student_id:studentId,status:'NOT_STARTED',active:true});
const practiceAssignments=[
  {assignment_id:'practice-basic',content_type:'GRAMMAR',content_subtype:'BASIC_PRACTICE',title:'기초 Practice',assigned_at:'2026-10-20T00:00:00Z',active:true,targets:[target('s1'),target('s2')]},
  {assignment_id:'practice-partial',content_type:'GRAMMAR',content_subtype:'MIXED_PRACTICE',title:'일부 대상 Practice',assigned_at:'2026-10-21T00:00:00Z',active:true,targets:[target('s1')]},
  {assignment_id:'practice-mixed',content_type:'GRAMMAR',content_subtype:'MIXED_PRACTICE',title:'혼합 Practice',assigned_at:'2026-10-22T00:00:00Z',active:true,targets:[target('s1'),target('s2')]},
  {assignment_id:'practice-lesson',content_type:'GRAMMAR',content_subtype:'LESSON_PRACTICE',title:'<img src=x onerror=window.__practiceXss=1> 긴 Practice 제목',assigned_at:'2026-10-23T00:00:00Z',active:true,targets:[target('s1'),target('s2')]},
  {assignment_id:'theory-old',content_type:'GRAMMAR',content_subtype:'THEORY',title:'기존 Theory',active:true,targets:[target('s1'),target('s2')]},
  {assignment_id:'final-old',content_type:'GRAMMAR',content_subtype:'FINAL_QUIZ',title:'기존 Final',active:true,targets:[target('s1'),target('s2')]},
  {assignment_id:'reading-old',content_type:'READING',content_subtype:'INDIVIDUAL',title:'기존 Reading',active:true,targets:[target('s1'),target('s2')]}
];
async function fulfillJsonp(route,payload){const callback=new URL(route.request().url()).searchParams.get('callback');await route.fulfill({status:200,contentType:'application/javascript',body:`${callback}(${JSON.stringify(payload)});`})}
async function makePage(browser,assignmentPayload,options={}){
  const posts=[],page=await browser.newPage({viewport:{width:390,height:1000}});
  await page.addInitScript(()=>{localStorage.setItem('hub.delivery',JSON.stringify({url:'https://staging.example/exec',token:'teacher-test'}))});
  if(options.cachedWorkspace)await page.addInitScript(workspace=>{sessionStorage.setItem('elab.assignment.workspace.v1',JSON.stringify(workspace))},options.cachedWorkspace);
  await page.route('https://staging.example/**',async route=>{
    if(route.request().method()==='POST'){posts.push(JSON.parse(route.request().postData()||'{}'));return route.fulfill({status:200,body:'ok'})}
    const url=new URL(route.request().url()),action=url.searchParams.get('action');
    if(action==='listStudents')return fulfillJsonp(route,{students});
    if(action==='listGroupsV2')return fulfillJsonp(route,{groups:[]});
    if(action==='listAssignmentsV2'){if(options.assignmentGate)await options.assignmentGate;return fulfillJsonp(route,assignmentPayload)}
    if(action==='listAssignmentContentV2')return fulfillJsonp(route,{items:[{content_type:'GRAMMAR',content_ref_id:'theory-set',title:'조동사 + have + p.p.',content_link:'',extra:{content_subtype:'THEORY',route:'study'}}]});
    if(action==='listDueVocabReviewsV1')return fulfillJsonp(route,{items:[]});
    if(action==='fetchGrammarSet')return fulfillJsonp(route,{found:true,tagLabel:'조동사 + have + p.p.',theory_content:{version:1,linked_practice_ref:null},sentences:[]});
    if(action==='verifyAssignmentBatchV2')return fulfillJsonp(route,{found:true,complete:true,assignments:[{assignment_id:'new-theory',content_type:'GRAMMAR',content_subtype:'THEORY',content_ref_id:'theory-set',title:'조동사 + have + p.p.',active:true}]});
    if(action==='listHomeworkBatchesV2')return fulfillJsonp(route,{batches:[]});
    return fulfillJsonp(route,{});
  });
  await page.goto('http://localhost/teacher/assignments.html?content_type=GRAMMAR&content_ref_id=theory-set&content_subtype=THEORY',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#grammarPracticeLinkSettings:not(.hidden)');
  return{page,posts};
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const main=await makePage(browser,{assignments:practiceAssignments}),page=main.page;
    assert(await page.locator('#grammarPracticeLinkSettings').isVisible(),'01 Theory assignment shows Practice link section');
    assert.strictEqual(await page.locator('input[name="linkedPracticeAssignment"]:checked').getAttribute('value'),'','02 default is no link');
    const optionText=await page.locator('#grammarPracticeLinkOptions').textContent();
    assert(optionText.includes('기초 Practice')&&optionText.includes('혼합 Practice')&&optionText.includes('긴 Practice 제목'),'03 allowed Practice subtypes shown');
    assert(!optionText.includes('기존 Theory'),'04 Theory excluded');
    assert(!optionText.includes('기존 Final'),'05 Final excluded');
    assert(!optionText.includes('기존 Reading'),'06 non-Grammar excluded');

    await page.check('input[name="student"][value="s1"]');
    const partial=page.locator('input[name="linkedPracticeAssignment"][value="practice-partial"]');
    assert.strictEqual(await partial.isDisabled(),false,'07 full target coverage selectable');
    await partial.check();
    await page.check('input[name="student"][value="s2"]');
    assert.strictEqual(await partial.isDisabled(),true,'08 partial coverage disabled');
    assert.strictEqual(await page.locator('input[name="linkedPracticeAssignment"]:checked').getAttribute('value'),'','09 student selection change invalidates selected Practice');
    assert((await page.locator('#grammarPracticeLinkNotice').textContent()).includes('해제'),'10 invalid selection cleared from UI and payload state');

    await page.locator('input[name="linkedPracticeAssignment"][value="practice-basic"]').check();
    await page.click('#finalAssign');
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('최종 배정했습니다'));
    assert.strictEqual(main.posts.length,1,'15 Practice assignment is not duplicated');
    const linkedRequest=main.posts[0],linkedTheory=linkedRequest.assignments[0];
    assert.strictEqual(linkedTheory.linked_practice_assignment_id,'practice-basic','11 valid linked ID included in Theory payload');
    assert.strictEqual(linkedRequest.assignments.length,1,'16 Practice targets are not created');
    assert.strictEqual(linkedTheory.content_subtype,'THEORY');
    assert(!main.posts.some(post=>post.action==='saveGrammarSet'),'14 saveGrammarSet payload/call unchanged');
    assert.strictEqual(await page.evaluate(()=>window.__practiceXss),undefined,'23 Practice title cannot execute HTML');
    assert.strictEqual(await page.locator('#grammarPracticeLinkOptions img').count(),0,'23 Practice title rendered as plain text');
    assert.strictEqual(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'24 390px horizontal overflow is zero');

    const noLink=await makePage(browser,{assignments:practiceAssignments});
    await noLink.page.check('input[name="student"][value="s1"]');
    await noLink.page.click('#finalAssign');
    await noLink.page.waitForFunction(()=>document.getElementById('status').textContent.includes('최종 배정했습니다'));
    assert.strictEqual(noLink.posts[0].assignments[0].linked_practice_assignment_id,null,'12 no-link sends null');

    assert(grammarHtml.includes('linked_practice_ref:null, cta_text:null'),'13 TheoryContentV1 payload unchanged');
    const builderHref=grammarHtml.match(/function assignmentUrlForTheory_\(setKey\) \{ return '([^']+)/)[1];
    assert(builderHref.startsWith('../teacher/assignments.html'),'17 Builder assign path uses shared selector');
    assert(grammarHtml.includes("assign.href=assignmentUrlForTheory_(set.setKey)"),'18 Library assign path uses shared selector');

    const empty=await makePage(browser,{assignments:[]});
    assert((await empty.page.locator('#grammarPracticeLinkOptions').textContent()).includes('기존 Practice 과제가 없습니다'),'19 empty list still permits Theory assignment');
    assert.strictEqual(await empty.page.locator('input[name="linkedPracticeAssignment"]:checked').getAttribute('value'),'');

    const failed=await makePage(browser,{error:'temporary'});
    assert((await failed.page.locator('#grammarPracticeLinkOptions').textContent()).includes('Practice 목록을 불러오지 못했어요'),'20 list failure allows unlinked Theory assignment');
    assert.strictEqual(await failed.page.locator('input[name="linkedPracticeAssignment"]:checked').getAttribute('value'),'');

    assert(assignmentHtml.includes("LINKED_PRACTICE_TARGET_COVERAGE_MISSING')return'선택한 학생 모두에게 해당 Practice가 배정되어 있어야 합니다."),'21 coverage error is human-readable');
    assert(assignmentHtml.includes("LINKED_PRACTICE_LOCKED_AFTER_START')return'학생이 Theory 학습을 시작한 뒤에는 연결 Practice를 변경할 수 없습니다."),'22 locked error is human-readable');
    assert(assignmentHtml.includes("requests=items.map(assignmentRequestV1_)"),'10 invalid stale IDs cannot bypass request builder');

    let releaseRemoteAssignments;
    const assignmentGate=new Promise(resolve=>{releaseRemoteAssignments=resolve}),cachedTheory={content_type:'GRAMMAR',content_ref_id:'theory-set',title:'cached Theory',content_link:'',extra:{content_subtype:'THEORY',route:'study'}};
    const cached=await makePage(browser,{assignments:practiceAssignments},{assignmentGate,cachedWorkspace:{students,groups:[],items:[cachedTheory],assignments:[]}});
    await cached.page.check('input[name="student"][value="s1"]');
    assert.strictEqual(await cached.page.locator('input[name="linkedPracticeAssignment"][value="practice-basic"]').count(),0,'25 cached pre-render is not final selectability evidence');
    releaseRemoteAssignments();
    await cached.page.waitForSelector('input[name="linkedPracticeAssignment"][value="practice-basic"]:not(:disabled)');
    assert.strictEqual(await cached.page.locator('input[name="linkedPracticeAssignment"][value="practice-basic"]').isDisabled(),false,'25 remote workspace rebuilds selector from current assignment targets');
    console.log('grammar_theory_practice_link_teacher_ui.test.js: 25/25 cases passed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
