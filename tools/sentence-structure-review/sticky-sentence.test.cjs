// Isolated sticky current-sentence UI E2E.
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const {pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.pw-browsers');
const {chromium}=require('playwright');
const out=path.join(root,'output/sentence-structure-review/tests');
fs.mkdirSync(out,{recursive:true});
const normalized=text=>text.replace(/\s+/g,' ').trim();
(async()=>{
  const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route(/^https?:\/\//,route=>route.abort());
  try{
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.waitForLoadState('networkidle');await page.locator('.queue-item').first().waitFor();
    const expected2449=await page.evaluate(()=>{const row=ReviewAdapter.getDocument().records.find(x=>x.sentence_id==='corpus:2449');return row.teacher.teacher_corrected_text??row.auto.text;});
    assert.equal(normalized(await page.locator('.current-sentence-copy').innerText()),normalized(expected2449),'top shows current corpus:2449 sentence');
    assert((await page.locator('.current-sentence-meta').innerText()).includes('2025 · 고2 · 9월 · 18번 · S2 후보'),'teacher metadata');
    assert(!(await page.locator('.review-progress-panel').innerText()).includes('corpus:2449'),'developer sentence id hidden from sticky panel');
    assert.equal(await page.locator('.current-sentence-copy').evaluate(el=>getComputedStyle(el).webkitLineClamp),'3','desktop clamp');
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight*.55));await page.waitForTimeout(100);
    assert(await page.locator('.review-progress-panel').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=9&&b.top<=12&&b.bottom>0;}),'sentence remains visible at page middle');
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
    assert(await page.locator('.review-progress-panel').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=9&&b.top<innerHeight&&b.bottom>0;}),'sentence remains visible at page bottom');
    await page.click('[data-current-sentence-target]');await page.waitForTimeout(500);
    assert(await page.locator('.sentence-sheet').evaluate(el=>{const b=el.getBoundingClientRect();return b.top<innerHeight&&b.bottom>0&&document.activeElement===el;}),'current sentence click moves to SOURCE area');

    const before=await page.locator('.current-sentence-copy').innerText();await page.click('[data-nav="1"]');
    const next=await page.evaluate(()=>{const id=document.querySelector('.queue-item.active')?.dataset.open,row=ReviewAdapter.getDocument().records.find(x=>x.sentence_id===id);return {id,text:row.teacher.teacher_corrected_text??row.auto.text};});
    assert.notEqual(normalized(next.text),normalized(before),'next sentence differs');
    assert.equal(normalized(await page.locator('.current-sentence-copy').innerText()),normalized(next.text),'next sentence updates immediately without stale text');

    const longest=await page.evaluate(()=>ReviewAdapter.getDocument().records.map(row=>({id:row.sentence_id,text:row.teacher.teacher_corrected_text??row.auto.text})).sort((a,b)=>b.text.length-a.text.length)[0]);
    await page.click(`[data-open="${longest.id}"]`);
    const collapsed=await page.locator('.current-sentence-copy').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,clamp:getComputedStyle(el).webkitLineClamp}));
    assert.equal(collapsed.clamp,'3');assert(collapsed.scrollHeight>collapsed.height,'long sentence is clamped');
    await page.click('[data-current-sentence-toggle]');
    const expanded=await page.locator('.current-sentence-copy').evaluate(el=>({expanded:el.classList.contains('expanded'),height:el.clientHeight,scrollHeight:el.scrollHeight}));
    assert(expanded.expanded&&expanded.height>collapsed.height,'full view expands');assert.equal(await page.locator('[data-current-sentence-toggle]').innerText(),'접기');
    await page.click('[data-current-sentence-toggle]');assert.equal(await page.locator('.current-sentence-copy').evaluate(el=>el.classList.contains('expanded')),false,'collapse works');

    await page.click('[data-open="corpus:2449"]');await page.locator('.advanced').evaluate(el=>el.open=true);await page.click('[data-skill-evidence="MAIN_VERB"]');
    assert.equal(await page.locator('.current-sentence-copy mark.evidence-active').count(),4,'Skill evidence is mirrored in sticky sentence');
    await page.locator('[data-pdf-open]').evaluate(link=>{link.addEventListener('click',event=>event.preventDefault(),{once:true});link.click();});await page.click('[data-source-one-click]');await page.evaluate(()=>ReviewAdapter.whenIdle());await page.waitForTimeout(100);
    const autoLeft=await page.evaluate(()=>{const panel=document.querySelector('.review-progress-panel').getBoundingClientRect(),pdf=document.querySelector('.pdf-panel').getBoundingClientRect(),answer=document.querySelector('.answer-review').getBoundingClientRect();return {left:panel.left,top:panel.top,right:panel.right,pdfLeft:pdf.left,pdfRight:pdf.right,answerLeft:answer.left,auto:document.querySelector('.review-progress-panel').classList.contains('auto-left')};});
    assert(autoLeft.auto&&Math.abs(autoLeft.left-autoLeft.pdfLeft)<2,'step 2 automatically moves panel to PDF column');assert(autoLeft.right<=autoLeft.answerLeft,'auto position does not cover subject/verb column');
    const handle=await page.locator('[data-progress-drag-handle]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-90,handle.y+handle.height/2+70,{steps:8});await page.mouse.up();
    const dragged=await page.locator('.review-progress-panel').evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,top:b.top,manual:el.classList.contains('manually-positioned')};});
    assert(dragged.manual&&dragged.left<autoLeft.left-40&&dragged.top>autoLeft.top+40,'mouse drag moves panel in both axes');
    await page.click('[data-level="S2"]');await page.evaluate(()=>ReviewAdapter.whenIdle());const preserved=await page.locator('.review-progress-panel').evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,top:b.top};});assert(Math.abs(preserved.left-dragged.left)<2&&Math.abs(preserved.top-dragged.top)<2,'manual position survives current-sentence rerender');
    await page.click('[data-nav="1"]');assert.equal(await page.locator('.review-progress-panel.floating-progress').count(),0,'new source-pending sentence resets manual position');
    await page.click('[data-nav="-1"]');await page.waitForTimeout(100);assert.equal(await page.locator('.review-progress-panel.auto-left').count(),1,'returning to source-verified sentence restores automatic PDF-side placement');
    await page.screenshot({path:path.join(out,'sticky-current-sentence-desktop.png'),fullPage:false});
    assert.equal(errors.length,0,'desktop browser errors: '+errors.join(' | '));
    await context.close();

    const mobileContext=await browser.newContext({viewport:{width:390,height:844}}),mobile=await mobileContext.newPage();
    mobile.on('pageerror',error=>errors.push(error.message));await mobileContext.route(/^https?:\/\//,route=>route.abort());
    await mobile.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await mobile.waitForLoadState('networkidle');await mobile.locator('.queue-item').first().waitFor();
    const mobileState=await mobile.evaluate(()=>{const panel=document.querySelector('.review-progress-panel'),copy=document.querySelector('.current-sentence-copy');return {overflow:document.documentElement.scrollWidth-innerWidth,panelHeight:panel.getBoundingClientRect().height,clamp:getComputedStyle(copy).webkitLineClamp,text:copy.textContent};});
    assert(mobileState.overflow<=0,'390px has no horizontal overflow');assert.equal(mobileState.clamp,'2','mobile clamp');assert(mobileState.panelHeight<844/2,'mobile sticky panel stays under half the viewport');assert(normalized(mobileState.text).startsWith('We are organizing'),'mobile sentence visible');
    await mobile.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await mobile.waitForTimeout(100);assert(await mobile.locator('.review-progress-panel').evaluate(el=>el.getBoundingClientRect().top===0),'mobile sentence remains sticky at bottom');
    await mobile.screenshot({path:path.join(out,'sticky-current-sentence-mobile.png'),fullPage:false});await mobileContext.close();
    const result={test_only:true,top_visible:true,middle_visible:true,bottom_visible:true,next_sentence_updated:true,source_scroll:true,desktop_clamp:3,expand_collapse:true,evidence_highlight:true,step_2_auto_pdf_side:true,subject_verb_not_covered:true,mouse_drag:true,manual_position_rerender:true,next_sentence_position_reset:true,mobile_clamp:2,mobile_under_half:true,mobile_overflow:0,browser_errors:errors};
    fs.writeFileSync(path.join(out,'sticky-sentence-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
