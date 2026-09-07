const { chromium } = require('playwright');

const base = 'http://127.0.0.1:8765/';
const activeLabels = { vocab: '단어암기', grammar: '문법학습', exam: '개별문제', practice: '실전연습', wrongnote: '오답노트', dashboard: '결과확인', students: '학생관리' };
const pages = [
  ['vocab', 'vocab/index.html'], ['grammar', 'grammar/index.html'],
  ['exam', 'exam/index.html'], ['practice', 'practice/index.html'],
  ['wrongnote', 'wrongnote/index.html'], ['dashboard', 'teacher/dashboard.html'],
  ['students', 'teacher/students.html']
];
const roster = { students: [
  { student_id: 's-active', name: '테스트학생', grade: '고1', pin: '1234', active: true, unfinished_assignment_count: 2 },
  { student_id: 's-ended', name: '종료학생', grade: '고2', pin: '5678', active: false, unfinished_assignment_count: 0 }
] };
const review = { items: [{
  review_item_id: 'r1', item_type: 'QUESTION', content_type: 'GRAMMAR', display: 'The book that I borrowed was useful.',
  wrong_count: 2, repeated: true, first_wrong_at: '2026-08-01', last_wrong_at: '2026-08-17', review_count: 1,
  categories: [{ label: '관계사절' }], attempt_detail: { student_answer: 2, correct_answer: 3, elapsed_ms: 12000 }
}] };

function result(name, ok, note = '') { return { name, ok: !!ok, note }; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const globalErrors = [];

  for (const width of [360, 390, 430, 768, 1024, 1280, 1440]) {
    for (const [name, relative] of pages) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(base + relative, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const layout = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        active: document.querySelector('.eb-top-menu [aria-current="page"]')?.textContent.trim() || '',
        activeCount: document.querySelectorAll('.eb-top-menu [aria-current="page"]').length,
        activeVisible: (() => { const e = document.querySelector('.eb-top-menu [aria-current="page"]'); if (!e) return false; const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()
      }));
      // The shared menu scrolls horizontally at desktop widths too.
      // Verify every link can be brought into view, rather than requiring all at once.
      let navReachable = true;
      for (const link of await page.locator('.eb-top-menu a').all()) {
        await link.scrollIntoViewIfNeeded();
        navReachable = navReachable && await link.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
      }
      results.push(result(`responsive_${name}_${width}`, layout.scroll <= layout.client && layout.active === activeLabels[name] && layout.activeCount === 1 && layout.activeVisible && navReachable && !errors.length, JSON.stringify({ ...layout, navReachable, errors })));
      await page.close();
    }
  }

  async function workspace(relative, init) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => globalErrors.push(`${relative}: ${error}`));
    if (init) await init(page);
    await page.goto(base + relative, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    return page;
  }

  let page = await workspace('vocab/index.html');
  // TeacherApp deliberately exposes words/make; assignment/results/settings
  // are separate destinations in the shared navigation.
  for (const [tab, panel] of [['make', '#t-mode'], ['words', '#w-entry']]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    results.push(result(`vocab_tab_${tab}`, await page.locator(panel).isVisible()));
  }
  for (const [label, path] of [['과제배정', '/teacher/assignments.html'], ['결과확인', '/teacher/dashboard.html'], ['환경설정', '/teacher/settings.html']]) {
    await page.locator('.eb-top-menu').getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(url => url.pathname === path);
    results.push(result(`vocab_navigation_${label}`, await page.locator('.eb-top-menu [aria-current="page"]').innerText() === label));
  }
  await page.close();

  page = await workspace('grammar/index.html');
  for (const tab of ['finals', 'manage', 'settings', 'accurate']) {
    await page.locator(`[data-gtab="${tab}"]`).click();
    results.push(result(`grammar_tab_${tab}`, await page.locator(`#gtabPanel-${tab}`).isVisible()));
  }
  await page.close();

  page = await workspace('exam/index.html');
  results.push(result('exam_question_workspace', await page.locator('#teacher-pdf-auto-status').isVisible() && await page.locator('#tab-root a[href="../pdf/index.html"]').isVisible() && await page.locator('h1').innerText() === '개별문제'));
  await page.locator('#tab-root a[href="../pdf/index.html"]').click();
  await page.waitForURL('**/pdf/index.html');
  results.push(result('exam_pdf_navigation', await page.locator('.eb-top-menu [aria-current="page"]').innerText() === 'PDF 자료관리'));
  await page.close();

  page = await workspace('practice/index.html');
  results.push(result('practice_pdf_workspace', await page.locator('#practice-pdf-library').isVisible()));
  await page.locator('#tab-root a[href="../pdf/index.html"]').click();
  await page.waitForURL('**/pdf/index.html');
  results.push(result('practice_pdf_navigation', await page.locator('.eb-top-menu [aria-current="page"]').innerText() === 'PDF 자료관리'));
  await page.close();

  const mockInit = async page => {
    await page.route('https://example.test/**', async route => {
      const url = new URL(route.request().url());
      const callback = url.searchParams.get('callback');
      const action = url.searchParams.get('action');
      const payloads = {
        listStudents: roster,
        getWrongnoteSummaryV2: { tracks: [{ track: 'GRAMMAR', item_count: 1, repeated_count: 1 }] },
        listWrongnoteGroupsV2: { groups: [{ group_key: 'g1', title: '문법 테스트', item_count: 1, repeated_count: 1 }], next_cursor: null },
        listWrongnoteGroupItemsV2: { ...review, next_cursor: null },
        getReviewItemHistoryV2: { item: review.items[0], history_complete: true, events: [{ created_at: '2026-08-17', outcome: 'WRONG', content_type: 'GRAMMAR', attempt_id: 'a1' }] },
        getAttemptDetailV2: { attempt: { content_type: 'GRAMMAR', assignment_title: '문법 테스트' }, question_items: [{ display: review.items[0].display, student_answer: 2, correct_answer: 3, is_correct: false }] }
      };
      const payload = payloads[action] || { ok: true };
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: `${callback}(${JSON.stringify(payload)});` });
    });
    await page.addInitScript(() => localStorage.setItem('hub.delivery', JSON.stringify({ url: 'https://example.test/exec', token: 'TEST' })));
  };

  page = await workspace('wrongnote/index.html', mockInit);
  await page.locator('#student').selectOption('s-active');
  await page.locator('[data-track="GRAMMAR"]').click();
  await page.locator('[data-group="g1"]').click();
  await page.locator('[data-item="r1"]').click();
  await page.locator('[data-attempt="a1"]').click();
  await page.locator('#drawerBody .detail').waitFor();
  results.push(result('wrongnote_filter_detail', await page.locator('#overlay').isVisible() && (await page.locator('#drawerBody').innerText()).includes('학생답 2 · 정답 3')));
  await page.locator('#close').click();
  results.push(result('wrongnote_detail_close', !(await page.locator('#overlay').isVisible())));
  await page.close();

  page = await workspace('teacher/students.html', mockInit);
  await page.waitForSelector('[data-student-id="s-active"]');
  await page.locator('#rosterFilter').selectOption('inactive');
  await page.waitForSelector('[data-student-id="s-ended"]');
  results.push(result('students_status_filter', (await page.locator('[data-student-id="s-ended"]').count()) === 1 && (await page.locator('[data-student-id="s-active"]').count()) === 0));
  await page.locator('#rosterFilter').selectOption('active');
  await page.waitForSelector('[data-student-id="s-active"]');
  results.push(result('students_active_filter', (await page.locator('[data-student-id="s-active"]').count()) === 1));
  await page.close();

  await browser.close();
  results.push(result('page_errors', globalErrors.length === 0, globalErrors.join('; ')));
  for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.note ? ` ${item.note}` : ''}`);
  if (results.some(item => !item.ok)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
