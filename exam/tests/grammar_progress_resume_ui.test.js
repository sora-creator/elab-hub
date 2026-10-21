const { chromium } = require('playwright');

const questionId = '11111111-1111-4111-8111-111111111111';
const practice = {
  found: true,
  tag: 'presentParticiple,pastParticiple',
  tagLabel: '분사',
  content_subtype: 'BASIC_PRACTICE',
  attempt_id: 'attempt-practice',
  attemptCapability: 'attempt-capability',
  sentences: [{
    text: 'The broken window was repaired.',
    tags: { pastParticiple: [{ text: 'broken', question_id: questionId }] }
  }],
  grammar_progress: {
    attempt_id: 'attempt-practice',
    attempt_status: 'IN_PROGRESS',
    completed: false,
    question_items: [{ question_id: questionId, sequence: 1, answer: 'presentParticiple', is_correct: false, elapsed_ms: 500, attempt_count: 1, first_wrong: true }]
  }
};

async function fulfillJsonp(route, payload) {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  await route.fulfill({ status: 200, contentType: 'application/javascript', body: `${callback}(${JSON.stringify(payload)});` });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  let response = practice, posts = 0;
  await page.route('https://example.test/**', async route => {
    if (route.request().method() !== 'GET') { posts++; return route.fulfill({ status: 200, body: 'ok' }); }
    await fulfillJsonp(route, response);
  });
  const practiceUrl = 'http://127.0.0.1:8765/grammar/index.html?study=set-1&hook=https%3A%2F%2Fexample.test%2Fexec&assignment_target_id=target-1&student_id=student-1&assignmentCapability=launch-capability';
  await page.goto(practiceUrl);
  await page.waitForSelector(`[data-question-id="${questionId}"]`);
  async function restored() {
    const selected = page.locator(`[data-question-id="${questionId}"][data-choice="presentParticiple"]`);
    const correct = page.locator(`[data-question-id="${questionId}"][data-choice="pastParticiple"]`);
    return await selected.isDisabled() && await selected.evaluate(el => el.classList.contains('mcq-wrong')) && await correct.evaluate(el => el.classList.contains('mcq-correct'));
  }
  if (!await restored()) throw new Error('practice answer was not restored');
  await page.reload();
  await page.waitForSelector(`[data-question-id="${questionId}"]`);
  if (!await restored()) throw new Error('practice answer was not restored after reload');

  response = Object.assign({}, practice, { attempt_id: undefined, attemptCapability: undefined, grammar_progress: Object.assign({}, practice.grammar_progress, { attempt_status: 'COMPLETED', completed: true, score: 0 }) });
  await page.reload();
  await page.waitForSelector(`[data-question-id="${questionId}"]`);
  if (!await page.locator(`[data-question-id="${questionId}"]`).first().isDisabled()) throw new Error('completed practice remained interactive');

  response = {
    found: true,
    label: '문법 Final',
    questions: [{ question_id: questionId, srcLabel: '1번', text: 'The broken window.', phrase: 'broken', options: ['현재분사', '과거분사'], correctIdx: 1 }],
    grammar_progress: { attempt_id: 'attempt-final', attempt_status: 'COMPLETED', completed: true, score: 100, question_items: [] }
  };
  await page.goto('http://127.0.0.1:8765/grammar/index.html?finalQuiz=final-1&hook=https%3A%2F%2Fexample.test%2Fexec&assignment_target_id=target-2&student_id=student-1&assignmentCapability=launch-capability');
  await page.waitForSelector('text=완료한 문법 테스트입니다');
  if (await page.locator('#fqStart').count()) throw new Error('completed final exposed start control');
  if (posts !== 0) throw new Error('resume rendering sent an unexpected write');
  await browser.close();
  console.log('grammar_progress_resume_ui.test.js: all assertions passed');
})().catch(error => { console.error(error); process.exit(1); });
