const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ui = fs.readFileSync('wrongnote/index.html', 'utf8');
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name + ' function exists');
  const body = source.indexOf('{', start);
  let depth = 0;
  for (let i = body; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(name + ' function is incomplete');
}
const openItemHistorySource = extractFunction(ui, 'openItemHistory');
const iifeEnd = ui.lastIndexOf('})();');
assert(iifeEnd >= 0, 'wrongnote IIFE closes');
assert(ui.indexOf('function renderHistoryPreview(') < iifeEnd, 'renderHistoryPreview stays inside the wrongnote IIFE');
assert(ui.indexOf('function openItemHistory(') < iifeEnd, 'openItemHistory stays inside the wrongnote IIFE');
assert(!ui.slice(iifeEnd + 5).includes('function openItemHistory('), 'preview helper is not leaked outside the IIFE');

let opened = 0;
let rendered = 0;
let fetched = 0;
let renderedPreview = null;
const context = {
  open() { opened++; },
  renderHistoryPreview(item, preview) {
    rendered++;
    renderedPreview = { item, preview };
  },
  loadHistory() { fetched++; }
};
vm.createContext(context);
vm.runInContext(openItemHistorySource, context);

const complete = {
  review_item_id: 'review-complete',
  history_preview: { events: [{ outcome: 'WRONG' }], total_events: 1, has_more: false }
};
context.openItemHistory(complete);
assert.strictEqual(opened, 1);
assert.strictEqual(rendered, 1);
assert.strictEqual(fetched, 0, 'complete preview does not fetch history');
assert.strictEqual(renderedPreview.preview.has_more, false);

const partial = {
  review_item_id: 'review-partial',
  history_preview: { events: [{ outcome: 'WRONG' }, { outcome: 'CORRECT' }], total_events: 4, has_more: true }
};
context.openItemHistory(partial);
assert.strictEqual(opened, 2);
assert.strictEqual(rendered, 2);
assert.strictEqual(fetched, 0, 'partial preview does not auto-fetch history');
assert.strictEqual(renderedPreview.preview.has_more, true);

context.openItemHistory({ review_item_id: 'legacy-review' });
assert.strictEqual(fetched, 1, 'legacy response uses full-history fallback once');

assert(ui.includes('최근 이력 3개'));
assert(ui.includes('전체 이력 보기'));
assert(ui.includes("more.onclick=function(){loadHistory(item.review_item_id)}"));
assert(ui.includes("loadAttempt(b.dataset.attempt)"));
assert(ui.includes("req('getReviewItemHistoryV2'"));
assert(ui.includes("req('getAttemptDetailV2'"));
console.log('wrongnote_bounded_preview.test.js: all assertions passed');
