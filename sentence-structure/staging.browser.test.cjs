const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(__dirname, '../.pw-browsers');
const { chromium } = require('playwright');

const base = 'http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/sentence-structure/index.html';
const bundle = fs.readFileSync(path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-data.js'), 'utf8');
const dataset = JSON.parse(bundle.slice(bundle.indexOf('=') + 1).replace(/;\s*$/, ''));
const records = dataset.records.slice(0, 2);
const capability = `${Buffer.from(JSON.stringify({ metadata: { hint_level: 'BASIC', reading_support_level: 'foundation' } })).toString('base64url')}.staging`;
const query = new URLSearchParams({
  set_key: 'STAGING-SENTENCE-V1', assignment_id: 'assignment-staging', assignment_target_id: 'target-staging',
  student_id: 'student-staging', assignmentCapability: capability, hint_level: 'NONE', reading_support: 'advanced', hook: 'https://staging.example/exec'
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const posted = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://staging.example/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      posted.push(body);
      (body.passages || []).forEach(result => {
        const index = serverResults.findIndex(item => item.sentence_id === result.sentence_id);
        if (index === -1) serverResults.push(result); else serverResults[index] = result;
      });
      return route.fulfill({ status: 200, body: 'ok' });
    }
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    const payload = action === 'fetchSentenceSet'
      ? { found: true, passages: records, attempt_id: 'attempt-staging', attemptCapability: 'attempt-capability', studentCapability: 'sentence-set-capability', sentence_progress: progress() }
      : action === 'getSentenceStructureProgressV1' ? progress() : { error: 'unexpected action' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const serverResults = [];
  const progress = () => ({ attempt_id: 'attempt-staging', attempt_status: serverResults.length === records.length ? 'COMPLETED' : 'IN_PROGRESS', results: serverResults, summary: { sentences_completed: serverResults.length } });
  try {
    await page.goto(`${base}?${query}`, { waitUntil: 'networkidle' });
    if (await page.locator('[data-start-practice]').count()) await page.click('[data-start-practice]');
    assert.equal((await page.evaluate(() => ELABSentenceStructurePractice.getRecord().sentence_id)), records[0].sentence_id);
    assert.equal(await page.evaluate(() => ELABSentenceStructurePractice.getAssignedHintLevel()), 'BASIC');
    assert.equal(await page.evaluate(() => ELABSentenceStructurePractice.getState().draft.reading_support_level), 'foundation');
    await page.click('[data-token="0"]');
    await page.click('[data-token="2"]');
    await page.click('[data-check-structure]');
    await page.click('[data-go-chunk]');
    await page.click('[data-check-chunk]');
    await page.click('[data-next]');
    await page.waitForFunction(id => window.ELABSentenceStructurePractice.getRecord().sentence_id === id, records[1].sentence_id);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].contract_version, 'sentence-structure-student-v1');
    assert.deepEqual(posted[0].passages[0].subject_answers, [[0]]);
    assert.deepEqual(posted[0].passages[0].verb_answers, [[2]]);
    assert.equal(posted[0].passages[0].chunk_completed, true);
    assert.equal(serverResults.length, 1);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => ELABSentenceStructurePractice.getRecord().sentence_id), records[1].sentence_id);
    assert.equal(await page.evaluate(() => ELABSentenceStructurePractice.getResults().length), 1);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('sentence-structure staging browser: 12/12 checks passed; errors=0');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
