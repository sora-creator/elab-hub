const assert=require('assert');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try{
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      const errors=[];page.on('pageerror',error=>errors.push(String(error)));
      await page.goto('http://localhost/teacher/assignments.html',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('#sentenceStructureBuilder',{state:'attached'});
      await page.evaluate(()=>{const input=document.createElement('input');input.type='checkbox';input.name='student';input.value='student-fixture';input.checked=true;document.getElementById('students').appendChild(input)});
      await page.click('[data-source="SENTENCE_STRUCTURE"]');
      assert.strictEqual(await page.locator('#sentenceStructureBuilder').isVisible(),true);
      await page.click('#ssRecommend');
      assert.strictEqual(await page.locator('.ss-sentence-card').count(),5);
      assert.match(await page.locator('#ssSummaryCount').textContent(),/5문장/);
      const before=await page.locator('.ss-sentence-text').first().textContent();
      await page.locator('[data-ss-replace="0"]').click();
      const after=await page.locator('.ss-sentence-text').first().textContent();
      assert.notStrictEqual(before,after);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
      assert.strictEqual(overflow,false,viewport.width+'px overflow');
      assert.deepStrictEqual(errors,[]);
      await page.close();
    }
    console.log('sentence_structure_teacher_assignment_ui.test.js: all assertions passed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
