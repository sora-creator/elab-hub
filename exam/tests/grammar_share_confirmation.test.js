const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('grammar/index.html', 'utf8');

function functionSource(name) {
  const start = html.indexOf('async function ' + name + '(');
  assert(start >= 0, name + ' must exist');
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('unterminated function: ' + name);
}

const confirmSource = functionSource('confirmGrammarSetSaved');
const shareSource = functionSource('handleShare');

async function runConfirmation(sequence) {
  const waits = [], reads = [];
  const context = {
    sleep: async ms => { waits.push(ms); },
    jsonpFetch: async url => { reads.push(url); return sequence.shift(); },
    encodeURIComponent
  };
  vm.createContext(context);
  vm.runInContext(confirmSource, context);
  return { result: await context.confirmGrammarSetSaved('https://staging.invalid/exec', 'set-key'), waits, reads };
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function shareHarness(confirmationResult, deferWrite) {
  const status = { className:'', textContent:'', innerHTML:'' };
  const button = { disabled:false };
  const elements = {
    shareStatus:status,
    btnShare:button,
    inShareVideo:{ value:'' },
    inShareSubtype:{ value:'THEORY' },
    inShareArea:{ value:'GRAMMAR_VERB' },
    inShareDetail:{ value:'' },
    inShareDifficulty:{ value:'L2' }
  };
  let writes = 0;
  const write = deferWrite || { promise:Promise.resolve(true) };
  const context = {
    grammarSharePending:false,
    ghDeliveryCfg:() => ({ url:'https://staging.invalid/exec', token:'redacted' }),
    document:{ getElementById:id => elements[id] },
    lastResults:[{ text:'She must have left already.', hits:[], tagsForShare:{}, questionNo:18 }],
    getSelectedRuleIds:() => ['modalPerfect'],
    ruleById:{ modalPerfect:{ label:'조동사 + have + p.p.' } },
    uid:() => 'set-key',
    crypto:{ randomUUID:() => 'question-id' },
    hookPost:async () => { writes++; return write.promise; },
    confirmGrammarSetSaved:async () => confirmationResult,
    location:{ origin:'http://localhost', pathname:'/grammar/index.html', search:'', href:'' },
    escapeHtml:value => value,
    URLSearchParams,
    encodeURIComponent
  };
  vm.createContext(context);
  vm.runInContext(shareSource, context);
  return { context, status, button, writes:() => writes };
}

(async () => {
  // A. 1/3/6 seconds miss, 10 seconds hit: one write and normal success.
  let confirmation = await runConfirmation([{found:false},{found:false},{found:false},{found:true}]);
  assert.strictEqual(confirmation.result.status, 'FOUND');
  assert.deepStrictEqual(confirmation.waits, [1000,2000,3000,4000]);
  assert.strictEqual(confirmation.reads.length, 4);
  let harness = shareHarness(confirmation.result);
  await harness.context.handleShare();
  assert.strictEqual(harness.writes(), 1);
  assert.strictEqual(harness.status.className, 'status show success');

  // B. All bounded checks miss: delayed guidance, no automatic write retry.
  confirmation = await runConfirmation(Array(6).fill({found:false}));
  assert.strictEqual(confirmation.result.status, 'DELAYED');
  assert.deepStrictEqual(confirmation.waits, [1000,2000,3000,4000,5000,5000]);
  harness = shareHarness(confirmation.result);
  await harness.context.handleShare();
  assert.strictEqual(harness.writes(), 1);
  assert.match(harness.status.textContent, /공유 저장 확인이 지연/);
  assert.doesNotMatch(harness.status.textContent, /다시 시도/);

  // C. First confirmation succeeds and keeps the existing success flow.
  confirmation = await runConfirmation([{found:true}]);
  assert.strictEqual(confirmation.result.status, 'FOUND');
  assert.deepStrictEqual(confirmation.waits, [1000]);

  // D. Auth/server/transport error is final and cannot poll forever.
  confirmation = await runConfirmation([{found:false,error:'forbidden'}]);
  assert.strictEqual(confirmation.result.status, 'ERROR');
  assert.strictEqual(confirmation.reads.length, 1);
  confirmation = await runConfirmation([null]);
  assert.strictEqual(confirmation.result.status, 'ERROR');
  assert.strictEqual(confirmation.reads.length, 1);

  // E. A second click while the first write is pending cannot emit a write.
  const pendingWrite = deferred();
  harness = shareHarness({status:'FOUND',result:{found:true}}, pendingWrite);
  const first = harness.context.handleShare();
  assert.strictEqual(harness.button.disabled, true);
  await harness.context.handleShare();
  assert.strictEqual(harness.writes(), 1);
  pendingWrite.resolve(true);
  await first;
  assert.strictEqual(harness.writes(), 1);
  assert.strictEqual(harness.button.disabled, false);

  assert.strictEqual((shareSource.match(/hookPost\(/g) || []).length, 1, 'share flow has exactly one write site');
  console.log('grammar_share_confirmation.test.js: delayed confirmation assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
