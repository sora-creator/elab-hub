// Isolated test browsers only. No existing profiles, tabs, or live network access.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../..');
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
const installed = new WeakSet();
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.pdf':'application/pdf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
async function protect(context) {
  if (installed.has(context)) return;
  installed.add(context);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    let file;
    if (['127.0.0.1','localhost'].includes(url.hostname)) {
      if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
      file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep)) return route.abort('blockedbyclient');
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    } else if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/xlsx@0.18.5/dist/xlsx.full.min.js')) {
      file = require.resolve('xlsx/dist/xlsx.full.min.js');
    } else if (url.hostname === 'cdn.tailwindcss.com') {
      file = path.join(root,'output/local-test-assets/tailwind.js');
    } else if (url.hostname === 'cdnjs.cloudflare.com' && /^\/ajax\/libs\/pdf.js\/3.11.174\/pdf(\.worker)?\.min\.js$/.test(url.pathname)) {
      file = path.join(root,'output/local-test-assets',path.basename(url.pathname));
    } else if (url.hostname === 'cdn.jsdelivr.net' && url.pathname === '/npm/tesseract.js@5/dist/tesseract.min.js') {
      file = path.join(root,'output/local-test-assets/tesseract.min.js');
    } else if (url.hostname === 'cdn.jsdelivr.net' && /\/pretendard(\.min)?\.css$/.test(url.pathname)) {
      // Explicit offline font fixture: use the app's system-font fallback.
      return route.fulfill({status:200,contentType:'text/css',body:'/* Offline test: system font fallback. */'});
    } else {
      return route.abort('blockedbyclient');
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status:404, body:'Local test file not found' });
    await route.fulfill({ status:200, contentType:mime[path.extname(file)]||'application/octet-stream', body:fs.readFileSync(file) });
  });
}
chromium.launch = async options => {
  const localExecutable = path.join(root,'.pw-browsers/chromium-1243/chrome-win64/chrome.exe');
  const browser = await launch({ ...(fs.existsSync(localExecutable)?{executablePath:localExecutable}:{}), ...options, headless:true });
  const newContext = browser.newContext.bind(browser), newPage = browser.newPage.bind(browser);
  browser.newContext = async options => { const context = await newContext({...options,serviceWorkers:'block'}); await protect(context); return context; };
  browser.newPage = async options => { const page = await newPage({...options,serviceWorkers:'block'}); await protect(page.context()); return page; };
  return browser;
};
chromium.launchPersistentContext = async () => { throw new Error('Persistent browser profiles are prohibited in local tests'); };
// Unit tests inject their own network fakes. Real Node HTTP is not allowed.
global.fetch = async () => { throw new Error('Real network disabled in local-only tests'); };
for (const protocol of ['http','https']) {
  const module = require(protocol);
  module.request = module.get = () => { throw new Error('Real network disabled in local-only tests'); };
}
