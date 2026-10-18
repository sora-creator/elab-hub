const path = require('node:path');
const assert = require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(__dirname, '../.pw-browsers');
const { chromium } = require('playwright');

const base = 'http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/sentence-structure/index.html?local_test_scope=isolated-completion-e2e';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [], checks = [], sentenceFlow = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
  const dragSpan = async span => {
    const start = Math.min(...span), end = Math.max(...span);
    if (start === end) { await page.click(`[data-token="${start}"]`); return; }
    const first = await page.locator(`[data-token="${start}"]`).boundingBox();
    const last = await page.locator(`[data-token="${end}"]`).boundingBox();
    assert.ok(first && last, `span ${start}-${end} is visible`);
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: Math.max(3, (end - start) * 3) });
    await page.mouse.up();
  };
  const addAnswers = async (kind, targets) => {
    for (const target of targets) {
      await page.click(`[data-mode="${kind}"]`);
      await dragSpan(target);
    }
  };
  try {
    await page.goto(base);
    await page.waitForLoadState('networkidle');
    check('isolated context starts with a valid empty progress record', await page.evaluate(() => {
      const key = ELABSentenceStructurePractice.getStorageKey();
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return key.startsWith('elab.student.sentence-structure.v1.') && saved?.dataset_fingerprint && Array.isArray(saved.results) && saved.results.length === 0 && !Object.prototype.hasOwnProperty.call(saved, 'attempt_id');
    }));
    check('nine-rule intro is the session entry', await page.locator('#chunk-intro .chunk-rule-detail').count() === 9);
    await page.click('[data-start-practice]');

    for (let index = 0; index < 12; index += 1) {
      const record = await page.evaluate(() => ELABSentenceStructurePractice.getRecord());
      check(`sentence ${index + 1} progress`, (await page.locator('.count-badge').innerText()).trim() === `${index + 1} / 12`);
      check(`sentence ${index + 1} starts at step 1`, await page.locator('[data-learning-step="1"][aria-current="step"]').count() === 1);
      await addAnswers('subject', record.subjects.map(item => item.primary));
      await addAnswers('verb', record.verbs.map(item => item.indexes));
      await page.click('[data-check-structure]');
      check(`sentence ${index + 1} fast S/V submission`, await page.locator('.feedback.success').count() === 1);
      await page.click('[data-go-chunk]');
      check(`sentence ${index + 1} advances to step 2`, await page.locator('[data-learning-step="2"][aria-current="step"]').count() === 1);
      await page.click('[data-check-chunk]');
      const hasExpressions = record.expressions.length > 0;
      if (hasExpressions) {
        check(`sentence ${index + 1} opens step 3`, await page.locator('#expression-step').count() === 1 && await page.locator('[data-learning-step="3"][aria-current="step"]').count() === 1);
        await page.click('[data-complete-expression]');
      } else {
        check(`sentence ${index + 1} skips empty step 3`, await page.locator('#expression-step').count() === 0 && await page.locator('[data-learning-step="3"].completed').count() === 1);
      }
      check(`sentence ${index + 1} reaches step 4`, await page.locator('#next-step').count() === 1 && await page.locator('[data-learning-step="4"][aria-current="step"]').count() === 1);
      sentenceFlow.push({ sentence_id: record.sentence_id, expressions: record.expressions.length });
      await page.click('[data-next]');
    }

    check('12th sentence stops at the session completion screen', await page.locator('.complete').count() === 1 && await page.locator('.lesson,.sentence-card,#next-step').count() === 0);
    check('all 12 results are stored exactly once', await page.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); return s.current_index === 12 && s.results.length === 12 && new Set(s.results.map(item => item.sentence_id)).size === 12; }));
    check('completion copy and summary are explicit', await page.locator('.complete').innerText().then(text => text.includes('문장구조 연습을 완료했어요!') && text.includes('오늘 12문장을 모두 학습했어요.') && text.includes('완료 문장') && text.includes('핵심 표현')));
    check('completion has a real student-portal primary CTA', await page.locator('.complete-actions a.primary').getAttribute('href').then(href => href === '../student/index.html'));
    await page.reload(); await page.waitForLoadState('networkidle');
    check('F5 keeps the 12/12 completion screen', await page.locator('.complete').count() === 1 && await page.evaluate(() => ELABSentenceStructurePractice.getState().results.length === 12));
    await page.close();
    const reopened = await context.newPage();
    reopened.on('pageerror', error => errors.push(error.message));
    reopened.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await reopened.goto(base); await reopened.waitForLoadState('networkidle');
    check('tab reopen keeps the 12/12 completion screen', await reopened.locator('.complete').count() === 1 && await reopened.evaluate(() => ELABSentenceStructurePractice.getState().current_index === 12));
    await reopened.setViewportSize({ width: 390, height: 844 });
    check('390px completion screen has no horizontal overflow', await reopened.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    check('browser errors are zero', errors.length === 0);
    console.log(JSON.stringify({ isolated: true, completed: sentenceFlow.length, sentence_flow: sentenceFlow, checks: checks.length, browser_errors: errors }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
