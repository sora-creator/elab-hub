const assert=require('assert');
const fs=require('fs');

const html=fs.readFileSync('teacher/assignments.html','utf8');
const sentenceUi=fs.readFileSync('teacher/sentence-structure-assignment-v1.js','utf8');

assert.match(html,/var loadInFlight=null;async function load\(\)\{if\(loadInFlight\)return loadInFlight/,'bootstrap must be single-flight');
assert.match(html,/state\.historyLoadedKey!==targetKey&&state\.historyLoadingKey!==targetKey/,'rerender must not restart loaded or in-flight history');
assert.match(html,/data-ss-view=/,'sentence history actions must render without per-row detail reads');
assert.doesNotMatch(sentenceUi,/MutationObserver\(decorateHistory\)/,'history mutation must not fan out detail reads');
assert.doesNotMatch(sentenceUi,/function decorateHistory/,'automatic per-row detail reads must be removed');
assert.match(html,/var attempt=await fetchWorkspace\(c,/,'configured staging endpoint must be used directly');
assert.doesNotMatch(html,/urls=\[c\.url,DEFAULT_DELIVERY_URL\]/,'a staging timeout must not fall back to production');
assert.match(html,/await fetch\(c\.url,\{method:'POST'/,'writes use one direct POST');
assert.doesNotMatch(html,/async function post\([^\n]+for\s*\(/,'writes must not have an automatic retry loop');
assert.match(html,/과제 정보를 불러오지 못했습니다\. 다시 시도해주세요\./,'final read failure must show the retry guidance');
assert.match(html,/retry\.textContent='다시 시도'/,'final read failure must provide a retry control');

console.log('assignment_transport_fanout.test.js: all assertions passed');
