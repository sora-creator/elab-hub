const assert = require('assert');
const fs = require('fs');
const Scheduler = require('../../teacher/bootstrap-read-scheduler.js');

const ACTIONS = ['listStudents','listGroupsV2','listAssignmentsV2','listDueVocabReviewsV1','listAssignmentContentV2','listHomeworkBatchesV2'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const make = () => Scheduler.create({actions: ACTIONS, maxConcurrent: 2});

(async function () {
  let active = 0, peak = 0;
  const a = make();
  const all = ACTIONS.map((action, index) => a.schedule(action, action, async () => {
    active += 1; peak = Math.max(peak, active); await wait(index < 2 ? 8 : 2); active -= 1; return action;
  }));
  assert.deepStrictEqual(await Promise.all(all), ACTIONS, 'A: all six reads succeed');
  assert.strictEqual(peak, 2, 'A: observed peak is two');
  assert.strictEqual(a.snapshot().peak, 2, 'A: scheduler peak is two');

  const starts = [], releases = [];
  const b = make();
  const slow = ACTIONS.map((action, index) => b.schedule(action, action, async () => {
    starts.push(index); if (index < 2) await new Promise(resolve => releases[index] = resolve); return index;
  }));
  await wait(2);
  assert.deepStrictEqual(starts, [0, 1], 'B: third request waits for a slot');
  releases[0](); await wait(2);
  assert.deepStrictEqual(starts.slice(0, 3), [0, 1, 2], 'B: third starts after a slot settles');
  releases[1](); await Promise.all(slow);

  async function retryCase(failureCode) {
    const scheduler = make(); let attempts = 0, sameLogicalActive = 0, sameLogicalPeak = 0;
    const tasks = ACTIONS.map((action, index) => scheduler.schedule(action, action, async () => {
      if (index !== 0) { await wait(3); return action; }
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        sameLogicalActive += 1; sameLogicalPeak = Math.max(sameLogicalPeak, sameLogicalActive); attempts += 1;
        await wait(2); sameLogicalActive -= 1;
        if (attempt === 1) await wait(2);
      }
      return failureCode;
    }));
    await Promise.all(tasks);
    return {attempts, sameLogicalPeak, peak: scheduler.snapshot().peak};
  }
  const c = await retryCase('TIMEOUT');
  assert.deepStrictEqual(c, {attempts:2,sameLogicalPeak:1,peak:2}, 'C: timeout retry holds one logical slot');
  const d = await retryCase('NETWORK_ERROR');
  assert.deepStrictEqual(d, {attempts:2,sameLogicalPeak:1,peak:2}, 'D: network retry holds one logical slot');

  for (const code of ['AUTH_ERROR','SERVER_ERROR','PARSE_ERROR']) {
    const scheduler = make(); let attempts = 0, launched = 0;
    const requests = ACTIONS.map((action, index) => scheduler.schedule(action, action, async () => {
      launched += 1; attempts += index === 0 ? 1 : 0;
      if (index === 0) { const error = new Error(code); error.code = code; throw error; }
      await wait(5); return action;
    }));
    const settled = await Promise.allSettled(requests);
    assert.strictEqual(attempts, 1, code + ': no retry');
    assert.strictEqual(launched, 2, code + ': queued launch stops while active peer settles');
    assert.strictEqual(settled.filter(item => item.status === 'rejected').length, 5, code + ': queued callers receive existing error path');
  }

  let transports = 0;
  const g = make();
  const first = g.schedule('listStudents','listStudents',async () => { transports += 1; await wait(5); return 'shared'; });
  const duplicate = g.schedule('listStudents','listStudents',async () => { transports += 1; return 'duplicate'; });
  assert.strictEqual(await first, 'shared', 'G: first result');
  assert.strictEqual(await duplicate, 'shared', 'G: duplicate shares promise');
  assert.strictEqual(transports, 1, 'G: duplicate transport is zero');

  const h = make();
  await Promise.all(ACTIONS.map(action => h.schedule(action,action,async()=>action)));
  assert.deepStrictEqual(h.snapshot(),{maxConcurrent:2,active:0,queued:0,peak:2,claimed:6,inflight:0,stopped:false},'H: no queue or inflight leak');

  const product = fs.readFileSync('teacher/assignments.html','utf8');
  assert(product.includes('./bootstrap-read-scheduler.js?v=20261008-1'),'product loads the bounded scheduler');
  assert(product.includes('maxConcurrent:2'),'product cap is exactly two');
  assert(product.includes('teacherBootstrapBaseRead(url,options)'),'product scheduler wraps the existing read without changing its contract');
  assert(!product.includes('ELABAppsScript.read=function(url,options){return fetch'),'product does not replace the verified transport');

  console.log('teacher_bootstrap_read_scheduler.test.js: A-H all assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
