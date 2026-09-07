const {chromium}=require('playwright'),assert=require('assert'),fs=require('fs');

(async()=>{
  const systemChrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser=await chromium.launch({headless:true,...(fs.existsSync(systemChrome)?{executablePath:systemChrome}:{})}),page=await browser.newPage({viewport:{width:390,height:900}});
  await page.addInitScript(()=>{
    const db={folders:[{id:'folder-1',name:'E2E PDF 폴더',createdAt:1}],passages:[
      {id:'p1',question_id:'q1',folderId:'folder-1',num:1,source_question_no:25,source:{year:2026,month:6,grade:'1',exam_type:'MOCK'},text:'The list of items is on the desk.',promptKo:'알맞은 동사를 고르세요.',choices:['is','are','has','have','being'],answer:1,type:'READING_GIST'},
      {id:'p2',question_id:'q2',folderId:'folder-1',num:2,source_question_no:34,source:{year:2025,month:9,grade:'고2',exam_type:'MOCK'},text:'긴 영어 지문과 한글 선택지가 함께 표시됩니다.',promptKo:'가장 적절한 답을 고르세요.',choices:['첫 번째 선택지','두 번째 선택지','세 번째 선택지','네 번째 선택지','다섯 번째 선택지'],answer:2,type:'READING_TOPIC'},
      {id:'p3',question_id:'q3',folderId:'folder-1',num:3,text:'Third passage.',promptKo:'세 번째 문제',choices:['A','B','C','D','E'],answer:1,type:'READING_TOPIC'},
      {id:'p4',question_id:'q4',folderId:'folder-1',num:4,text:'Fourth passage.',promptKo:'네 번째 문제',choices:['A','B','C','D','E'],answer:1,type:'READING_TOPIC'},
      {id:'p5',question_id:'q5',folderId:'folder-1',num:5,text:'Fifth passage.',promptKo:'다섯 번째 문제',choices:['A','B','C','D','E'],answer:1,type:'READING_TOPIC'}
    ]};
    localStorage.setItem('elab_exam.db',JSON.stringify(db));
    sessionStorage.setItem('elab.assignment.draft.v2','UNCHANGED');
    window.print=()=>{window.__printCalled=true};
  });
  await page.goto('http://127.0.0.1:8765/exam/index.html?v=individual-pdf-ui-test');
  await page.waitForSelector('#fb-select-pdf');
  assert.strictEqual(await page.locator('#fb-select-pdf').isDisabled(),true);
  await page.locator('[data-question-id="q2"]').click();
  await page.locator('[data-question-id="q1"]').click();
  assert.strictEqual(await page.locator('#fb-select-count').innerText(),'2개 선택됨');
  assert.strictEqual(await page.locator('#fb-select-pdf').isDisabled(),false);
  const popupPromise=page.waitForEvent('popup');
  await page.locator('#fb-select-pdf').click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');await popup.waitForTimeout(400);
  const text=await popup.locator('body').innerText(),title=await popup.title();
  const questionTexts=await popup.locator('.question-page').allInnerTexts(),answerText=await popup.locator('.answer-page').innerText();
  assert(text.includes('ELAB 영어 문제지')&&text.includes('2문항'));
  assert(text.indexOf('긴 영어 지문')<text.indexOf('The list of items'));
  assert(!text.includes('Third passage'));
  assert(text.includes('2025년 9월 고2 모의고사 34번')&&text.includes('2026년 6월 고1 모의고사 25번'));
  assert(text.includes('①')&&text.includes('⑤')&&text.includes('다섯 번째 선택지')&&text.includes('is'));
  assert.strictEqual(questionTexts.length,2);
  assert(questionTexts.every(questionText=>!questionText.includes('정답')));
  assert(answerText.includes('정답')&&answerText.includes('1.\t②')&&answerText.includes('2.\t①'));
  assert(answerText.includes('2025년 9월 고2 모의고사 34번')&&answerText.includes('2026년 6월 고1 모의고사 25번'));
  assert(!answerText.includes('Third passage'));
  assert(/^ELAB_개별문제_\d{8}_\d{4}$/.test(title));
  assert.strictEqual(await page.evaluate(()=>sessionStorage.getItem('elab.assignment.draft.v2')),'UNCHANGED');
  fs.mkdirSync('output/pdf',{recursive:true});fs.mkdirSync('tmp/pdfs',{recursive:true});
  await popup.setViewportSize({width:794,height:1123});
  await popup.screenshot({path:'output/pdf/ELAB_개별문제_TEST_preview.png',fullPage:true});
  await popup.pdf({path:'tmp/pdfs/ELAB_개별문제_2PAGE_TEST.pdf',format:'A4',printBackground:true});
  const pageCount=path=>(fs.readFileSync(path).toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  assert.strictEqual(pageCount('tmp/pdfs/ELAB_개별문제_2PAGE_TEST.pdf'),3);
  await popup.close();
  for(const id of ['q3','q4','q5'])await page.locator(`[data-question-id="${id}"]`).click();
  const popupFivePromise=page.waitForEvent('popup');await page.locator('#fb-select-pdf').click();const popupFive=await popupFivePromise;await popupFive.waitForLoadState('domcontentloaded');
  const fiveQuestionTexts=await popupFive.locator('.question-page').allInnerTexts(),fiveAnswerText=await popupFive.locator('.answer-page').innerText();
  assert.strictEqual(fiveQuestionTexts.length,5);
  assert(fiveQuestionTexts.every(questionText=>!questionText.includes('정답')));
  assert(fiveAnswerText.includes('1.\t②')&&fiveAnswerText.includes('2.\t①')&&fiveAnswerText.includes('5.\t①'));
  await popupFive.pdf({path:'output/pdf/ELAB_개별문제_TEST.pdf',format:'A4',printBackground:true});
  assert.strictEqual(pageCount('output/pdf/ELAB_개별문제_TEST.pdf'),6);
  fs.unlinkSync('tmp/pdfs/ELAB_개별문제_2PAGE_TEST.pdf');
  await browser.close();console.log('individual_question_pdf_ui.test.js: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1});
