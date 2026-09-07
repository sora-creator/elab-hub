const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const phase = process.argv[2] || 'after';
const out = path.join(__dirname, 'landing_reference', phase);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const widths = phase === 'before' ? [390, 1440] : [360, 390, 430, 768, 1024, 1280, 1440];
  const results = [];
  for (const width of widths) {
    const height = width === 390 ? 844 : (width === 1440 ? 900 : 1000);
    const page = await browser.newPage({ viewport: { width, height } });
    const consoleErrors = [], pageErrors = [], failed = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(String(error)));
    page.on('requestfailed', request => { if (!/cdn\.jsdelivr/.test(request.url())) failed.push(request.url()); });
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      clipped: Array.from(document.querySelectorAll('h1,h2,h3,a,button')).some(element => element.scrollWidth > element.clientWidth + 1),
      navHeight: Math.round(document.querySelector('.public-nav').getBoundingClientRect().height),
      heroTitle: getComputedStyle(document.querySelector('h1')).fontSize,
      heroLines: Math.round(document.querySelector('h1').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('h1')).lineHeight)),
      flowRight: Math.round(document.querySelector('.lp-flow').getBoundingClientRect().right),
      splitFlowWords: Array.from(document.querySelectorAll('.lp-step h3')).flatMap(heading => {
        const textNode = heading.firstChild;
        const text = textNode && textNode.nodeValue || '';
        const failures = [];
        text.replace(/\S+/g, (word, start) => {
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + word.length);
          if (range.getClientRects().length > 1) failures.push(word);
          return word;
        });
        return failures;
      }),
      alignment: (() => {
        const center = element => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        };
        return {
          problemIconMaxDelta: Math.max(...Array.from(document.querySelectorAll('.lp-problem')).map(card => Math.abs(center(card) - center(card.querySelector('.lp-mark'))))),
          flowNumberMaxDelta: Math.max(...Array.from(document.querySelectorAll('.lp-step')).map(card => Math.abs(center(card) - center(card.querySelector('.lp-step-no'))))),
          flowIconMaxDelta: Math.max(...Array.from(document.querySelectorAll('.lp-step')).map(card => Math.abs(center(card) - center(card.querySelector('.lp-step-head::after') || card.querySelector('.lp-step-head')))))
        };
      })(),
      overflowElements: Array.from(document.querySelectorAll('body *')).map(element => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, cls: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
      }).filter(item => item.right > document.documentElement.clientWidth + 1 || item.left < -1).slice(0, 8),
      headerLogo: (() => {
        const logo = document.querySelector('.brand-logo img');
        return { width: Math.round(logo.getBoundingClientRect().width), height: Math.round(logo.getBoundingClientRect().height), naturalRatio: Number((logo.naturalWidth / logo.naturalHeight).toFixed(3)), renderedRatio: Number((logo.getBoundingClientRect().width / logo.getBoundingClientRect().height).toFixed(3)) };
      })(),
      heroAnimated: document.querySelector('.lp-hero h1').classList.contains('is-visible'),
      fabCoversText: (() => {
        const fab = document.querySelector('.support-fab').getBoundingClientRect();
        const beneath = document.elementsFromPoint(fab.left + fab.width / 2, fab.top + fab.height / 2).filter(el => !el.closest('.support-fab'));
        return beneath.some(el => el.matches('h1,h2,h3,p,a,li') || el.closest('h1,h2,h3,p,a,li'));
      })()
    }));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    metrics.hiddenAfterFastScroll = await page.locator('.lp-reveal:not(.is-visible)').count();
    await page.screenshot({ path: path.join(out, `landing-${width}.png`), fullPage: true });
    if (width === 390 || width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(out, `landing-${width}x${height}-viewport.png`), fullPage: false });
      await page.locator('.public-nav').screenshot({ path: path.join(out, `header-${width}.png`) });
      await page.locator('.footer').scrollIntoViewIfNeeded();
      await page.locator('.footer').screenshot({ path: path.join(out, `footer-${width}.png`) });
    }
    results.push({ width, metrics, consoleErrors, pageErrors, failed });
    await page.close();
  }
  if (phase !== 'before') {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '메뉴' }).click();
    results.push({ mobileMenu: await page.locator('[data-public-links]').isVisible() });
    await page.locator('[data-public-links]').getByRole('link', { name: '서비스 소개' }).click();
    results.push({ serviceAnchor: await page.evaluate(() => location.hash === '#service') });
    await page.close();

    const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await reducedPage.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
    results.push({ reducedMotion: await reducedPage.evaluate(() => {
      const item = document.querySelector('.lp-reveal');
      const style = getComputedStyle(item);
      return style.opacity === '1' && style.transform === 'none';
    }) });
    await reducedPage.close();

    const historyPage = await browser.newPage({ viewport: { width: 768, height: 1000 } });
    await historyPage.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
    await historyPage.goto('http://127.0.0.1:8765/pricing/index.html', { waitUntil: 'networkidle' });
    await historyPage.goBack({ waitUntil: 'networkidle' });
    results.push({ backNavigation: await historyPage.locator('.lp-hero h1').isVisible() });
    await historyPage.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(results, null, 2));
  for (const result of results) console.log(JSON.stringify(result));
  if (results.some(result => result.metrics && (result.metrics.scrollWidth > result.metrics.clientWidth || result.metrics.clipped || result.metrics.flowRight > result.metrics.clientWidth || result.metrics.splitFlowWords.length || result.metrics.alignment.problemIconMaxDelta > 1 || result.metrics.alignment.flowNumberMaxDelta > 1 || result.metrics.fabCoversText || result.metrics.hiddenAfterFastScroll || !result.metrics.heroAnimated || Math.abs(result.metrics.headerLogo.naturalRatio - result.metrics.headerLogo.renderedRatio) > .02 || result.consoleErrors.length || result.pageErrors.length || result.failed.length))) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
