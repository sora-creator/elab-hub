const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'test';
const base = 'http://127.0.0.1:8765/';
const shotDir = path.join(__dirname, 'public_pages', mode);
fs.mkdirSync(shotDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  if (mode === 'before') {
    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport });
      await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(shotDir, `root-${name}.png`), fullPage: true });
      await page.close();
    }
    await browser.close();
    console.log('PASS before_root_desktop_mobile');
    return;
  }
  const publicPages = ['index.html', 'login/index.html', 'signup/index.html', 'pricing/index.html', 'support/index.html'];
  for (const width of [360, 390, 430, 768, 1024, 1280, 1440]) {
    for (const relative of publicPages) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], failed = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('requestfailed', request => { if (!/cdn\.jsdelivr/.test(request.url())) failed.push(request.url()); });
      await page.goto(base + relative, { waitUntil: 'networkidle' });
      const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      results.push([`responsive_${relative}_${width}`, layout.scroll <= layout.client && !errors.length && !failed.length]);
      await page.close();
    }
  }

  let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  const heroTop = await page.locator('#service').evaluate(element => element.getBoundingClientRect().top);
  await page.getByRole('link', { name: '서비스 알아보기' }).click();
  await page.waitForTimeout(350);
  results.push(['service_anchor', await page.evaluate(() => location.hash === '#service') && heroTop > 0]);
  await page.getByRole('button', { name: '문의하기' }).click();
  results.push(['support_panel', await page.locator('[data-support-panel]').isVisible()]);
  await page.locator('[data-support-close]').click();
  results.push(['support_panel_close', !(await page.locator('[data-support-panel]').isVisible())]);
  await page.screenshot({ path: path.join(shotDir, 'root-desktop.png'), fullPage: true });
  await page.close();

  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(shotDir, 'root-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '메뉴' }).click();
  results.push(['mobile_menu_open', await page.locator('[data-public-links]').isVisible()]);
  await page.screenshot({ path: path.join(shotDir, 'root-mobile-menu.png') });
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base + 'login/index.html', { waitUntil: 'networkidle' });
  const inviteForm = page.locator('[data-auth-form="invite"]');
  results.push(['closed_beta_teacher_heading', await page.getByRole('heading', { name: '교사로 시작하기' }).count() === 1]);
  results.push(['closed_beta_invite_form', await inviteForm.count() === 1]);
  results.push(['closed_beta_invite_input', await inviteForm.locator('#inviteCode').count() === 1]);
  results.push(['closed_beta_teacher_action', await inviteForm.getByRole('button', { name: 'ELAB 시작하기' }).count() === 1]);
  results.push(['closed_beta_student_parent_pending', (await page.locator('.role-notice').textContent()).includes('학생·학부모 서비스는 준비 중')]);
  results.push(['closed_beta_home_link', await page.getByRole('link', { name: '홈으로' }).getAttribute('href') === '../index.html']);
  await page.close();

  for (const relative of ['login/index.html', 'signup/index.html', 'pricing/index.html', 'support/index.html', 'teacher/index.html', 'student/index.html']) {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base + relative, { waitUntil: 'domcontentloaded' });
    results.push([`route_${relative}`, (await page.locator('h1,h2,#loginCard').count()) > 0]);
    await page.close();
  }
  results.push(['console_errors', consoleErrors.length === 0]);
  await browser.close();
  for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (results.some(([, ok]) => !ok)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
