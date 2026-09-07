const { chromium } = require('playwright');

const data = {
  summary:{active_students:1,incomplete_students:1,overdue_students:1,pending_items:2},
  groups:[{group_id:'g1',name:'테스트반'}],
  students:[{student_id:'student-test',name:'반응형 테스트학생',grade:'고1',assignments:3,completed:1,overdue:1,pending:2,completion_rate:33,status:'CHECK',last_study_at:'2026-08-17T00:00:00Z',areas:{VOCAB:{assigned:1},SENTENCE_STRUCTURE:{assigned:1},GRAMMAR:{assigned:0},READING:{assigned:1}},subject_accuracy:80,main_verb_accuracy:50,accuracy_by_category:[{key:'gist',label:'요지',domain:'READING',correct:1,total:2,accuracy:50,average_elapsed_ms:12000,elapsed_sample_size:2}],frequently_missed_words:[{term:'consistent',meaning:'꾸준한',wrong_count:2}],repeated:{VOCAB:1,SENTENCE_STRUCTURE:1,GRAMMAR:0,READING:1},repeated_wrong_count:3,recent_vocab:{assignment_title:'단어 1회',status:'COMPLETED',duration_ms:61000,repetition_count:2,first_wrong_count:3},attempts:[{attempt_id:'attempt-test',assignment_title:'독해 1회',content_type:'READING',attempt_no:1,started_at:'2026-08-17T00:00:00Z',completed_at:'2026-08-17T00:01:00Z',duration_ms:60000,status:'COMPLETED'}]}]
};
const batch={homework_batch_id:'batch-new',lesson_date:'2026-08-15',title:'8월 15일 수업 후 숙제',assignments:3,completed:1,completion_rate:33,overdue:1,areas:{VOCAB:{assigned:1,completed:1,display_range:'수능기본 Day 12 · 101~150'},SENTENCE_STRUCTURE:{assigned:1,completed:0},GRAMMAR:{assigned:0,completed:0},READING:{assigned:1,completed:0}},items:[{content_type:'VOCAB',title:'단어 1회',status:'COMPLETED',snapshot:{display_range:'수능기본 Day 12 · 101~150'}},{content_type:'SENTENCE_STRUCTURE',title:'문장구조',status:'NOT_STARTED',snapshot:{}},{content_type:'READING',title:'독해 1회',status:'NOT_STARTED',snapshot:{}}]};
data.students[0].current_batch=batch;data.students[0].homework_batches=[batch,Object.assign({},batch,{homework_batch_id:'batch-old',lesson_date:'2026-08-08',title:'8월 8일 수업 후 숙제'})];data.students[0].areas=batch.areas;data.students[0].attempts[0].homework_batch_id='batch-new';
const detail={attempt:{assignment_title:'독해 1회',content_type:'READING',attempt_no:1,started_at:'2026-08-17T00:00:00Z',completed_at:'2026-08-17T00:01:00Z',duration_ms:60000},question_items:[{sequence:1,display:'글의 요지는?',student_answer:2,correct_answer:3,is_correct:false,grading_status:'GRADED',elapsed_ms:12000,categories:[{label:'요지'}]}],word_items:[]};

(async()=>{
  const results=[],consoleErrors=[],pageErrors=[],failedRequests=[];
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('requestfailed',r=>failedRequests.push(r.url()));
  await page.route('https://example.test/**',async route=>{
    const u=new URL(route.request().url()),cb=u.searchParams.get('callback'),action=u.searchParams.get('action');
    await route.fulfill({status:200,contentType:'application/javascript',body:`${cb}(${JSON.stringify(action==='getAttemptDetailV2'?detail:data)});`});
  });
  await page.addInitScript(()=>localStorage.setItem('hub.delivery',JSON.stringify({url:'https://example.test/exec',token:'TEST'})));
  await page.goto('http://127.0.0.1:8765/teacher/dashboard.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  if(!await page.getByText('반응형 테스트학생').count())console.log('UI_DIAGNOSTIC',await page.locator('#status').innerText(),consoleErrors,pageErrors);
  await page.waitForSelector('text=반응형 테스트학생');
  results.push(['summary_three',await page.locator('.metric').count()===3]);
  results.push(['unassigned',await page.getByText('미배정').count()>=1]);
  await page.locator(".metric[data-filter='INCOMPLETE']").click();
  results.push(['summary_filter',(await page.locator('#filterState').innerText()).includes('1명')]);
  await page.locator('.student-row').click();
  await page.waitForSelector('#teacherInsights');
  const detailText=await page.locator('#detailBody').innerText();
  results.push(['detail_order',detailText.indexOf('1. 단어')<detailText.indexOf('6. 채점 대기')]);
  const batchOptions=await page.locator('#batchSelect option').evaluateAll(options=>options.map(option=>option.value));
  results.push(['batch_history',batchOptions.length===2&&batchOptions.includes('batch-new')&&batchOptions.includes('batch-old')]);
  results.push(['vocab_range',detailText.includes('101~150')]);
  results.push(['teacher_insight',await page.locator('#teacherInsights .insight-item').count()>=1]);
  await page.locator('#teacherInsights summary').first().click();
  results.push(['insight_evidence',(await page.locator('#teacherInsights').innerText()).includes('완료율')]);
  await page.locator('button.attempt').first().click();
  await page.waitForSelector('text=문항별 결과');
  results.push(['attempt_detail',(await page.locator('#detailBody').innerText()).includes('글의 요지는?')]);
  for(const width of [360,390,430,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    const mobile=width<=768,cards=await page.locator('#cards').isVisible(),table=await page.locator('.desktop').isVisible();
    results.push([`viewport_${width}`,sizes.scroll<=sizes.client&&cards===mobile&&table!==mobile]);
  }
  await page.setViewportSize({width:390,height:900});
  await page.screenshot({path:'exam/tests/dashboard_0g_390.png',fullPage:true});
  await browser.close();
  results.push(['console_errors',consoleErrors.length===0],['page_errors',pageErrors.length===0],['network_errors',failedRequests.length===0]);
  for(const [name,ok] of results)console.log(`${ok?'PASS':'FAIL'} ${name}`);
  if(consoleErrors.length)console.log('CONSOLE',consoleErrors);
  if(pageErrors.length)console.log('PAGE',pageErrors);
  if(failedRequests.length)console.log('NETWORK',failedRequests);
  if(results.some(([,ok])=>!ok))process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
