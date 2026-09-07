const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = 'http://127.0.0.1:8765/';
const phase = process.argv[2] || 'before';
const pages = [
  ['vocab', 'vocab/index.html'],
  ['grammar', 'grammar/index.html'],
  ['exam', 'exam/index.html'],
  ['practice', 'practice/index.html'],
  ['wrongnote', 'wrongnote/index.html'],
  ['dashboard', 'teacher/dashboard.html'],
  ['students', 'teacher/students.html']
];
const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }]
];

(async () => {
  const outDir = path.join(__dirname, 'ui_0h1', phase);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];

  for (const [name, relativeUrl] of pages) {
    for (const [viewportName, viewport] of viewports) {
      const page = await browser.newPage({ viewport });
      const consoleErrors = [];
      const pageErrors = [];
      const requestFailures = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', error => pageErrors.push(String(error)));
      page.on('requestfailed', request => {
        const url = request.url();
        if (!/fonts\.googleapis|fonts\.gstatic|cdn\.tailwindcss|cdnjs\.cloudflare/.test(url)) {
          requestFailures.push(url);
        }
      });
      await page.goto(base + relativeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      const metrics = await page.evaluate(() => {
        const nav = document.querySelector('.eb-nav');
        const active = document.querySelector('.eb-nav [aria-current="page"]');
        const bodyStyle = getComputedStyle(document.body);
        const firstCard = document.querySelector('.eb-card, .panel, .card, section');
        const cardStyle = firstCard ? getComputedStyle(firstCard) : null;
        const h1 = document.querySelector('h1');
        return {
          title: document.title,
          h1: h1 ? h1.textContent.trim() : '',
          h1Size: h1 ? getComputedStyle(h1).fontSize : '',
          bodyBackground: bodyStyle.backgroundColor,
          bodyFont: bodyStyle.fontFamily,
          navVisible: !!nav && nav.getBoundingClientRect().height > 0,
          navLeft: nav ? Math.round(nav.getBoundingClientRect().left) : null,
          navRight: nav ? Math.round(nav.getBoundingClientRect().right) : null,
          navScrollLeft: nav ? nav.scrollLeft : null,
          navScrollWidth: nav ? nav.scrollWidth : null,
          navClientWidth: nav ? nav.clientWidth : null,
          activeNav: active ? active.textContent.trim() : '',
          navRadius: nav ? getComputedStyle(nav).borderRadius : '',
          cardRadius: cardStyle ? cardStyle.borderRadius : '',
          cardShadow: cardStyle ? cardStyle.boxShadow : '',
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          buttons: document.querySelectorAll('button').length,
          links: document.querySelectorAll('a').length
        };
      });
      await page.screenshot({
        path: path.join(outDir, `${name}-${viewportName}.png`),
        fullPage: true
      });
      report.push({
        page: name,
        viewport: viewportName,
        url: base + relativeUrl,
        metrics,
        consoleErrors,
        pageErrors,
        requestFailures
      });
      await page.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  for (const item of report) {
    console.log(`${item.page}/${item.viewport}: h1=${item.metrics.h1Size || '-'} navRadius=${item.metrics.navRadius || '-'} cardRadius=${item.metrics.cardRadius || '-'} overflow=${item.metrics.documentWidth > item.metrics.viewportWidth} console=${item.consoleErrors.length} page=${item.pageErrors.length} network=${item.requestFailures.length}`);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
