const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require.resolve('../js/studentApp.js'), 'utf8');
assert(source.includes("console.info('SENTENCE_SUBMIT_START'"));
assert(source.includes("console.info('SENTENCE_SUBMIT_RETURNED'"));
assert(source.includes("console.info('SENTENCE_VERIFY_START'"));
assert(source.includes("console.info('SENTENCE_VERIFY_RESPONSE'"));
assert(source.includes("console.info('SENTENCE_COMPLETE_CONFIRMED'"));
assert(source.includes("console.error('SENTENCE_COMPLETE_NOT_CONFIRMED'"));
assert(source.includes("completion.attempt_found===true&&completion.target_found===true&&completion.attempt_status==='COMPLETED'&&completion.target_status==='COMPLETED'&&completion.complete===true"));
assert(source.includes("next.disabled=false;next.textContent='결과 저장 다시 시도'"));
const context = { console, URLSearchParams, performance: { now: () => 0 } };
vm.createContext(context);
vm.runInContext(source + `
  globalThis.__gradeSentenceTokenSelection = gradeSentenceTokenSelection;
  globalThis.__normalizeSentenceTokenIndexes = normalizeSentenceTokenIndexes;
`, context);

const grade = context.__gradeSentenceTokenSelection;
const normalize = context.__normalizeSentenceTokenIndexes;

const plain = value => JSON.parse(JSON.stringify(value));
assert.deepStrictEqual(plain(normalize([2, '1', 2, null, 'x'])), [1, 2]);
assert.deepStrictEqual(plain(grade([0], [1], [0], [1])), { subjectCorrect: true, verbCorrect: true });
assert.deepStrictEqual(plain(grade([0, 1, 2], [3], [2, 1, 0], [3])), { subjectCorrect: true, verbCorrect: true });
assert.deepStrictEqual(plain(grade([0], [2, 3], [0], [3, 2])), { subjectCorrect: true, verbCorrect: true });
assert.deepStrictEqual(plain(grade([0], [2], [0], [1])), { subjectCorrect: true, verbCorrect: false });
assert.deepStrictEqual(plain(grade([2], [1], [0], [1])), { subjectCorrect: false, verbCorrect: true });
assert.deepStrictEqual(plain(grade([2], [3], [0], [1])), { subjectCorrect: false, verbCorrect: false });
assert.deepStrictEqual(plain(grade([0], [1], [2], [1])), { subjectCorrect: false, verbCorrect: true });
assert.deepStrictEqual(plain(grade([0, 0], [1, 1], [0], [1])), { subjectCorrect: true, verbCorrect: true });
assert.deepStrictEqual(plain(grade(['0'], ['1'], [0], [1])), { subjectCorrect: true, verbCorrect: true });
assert.deepStrictEqual(plain(grade([2], [5], [2], [5])), { subjectCorrect: true, verbCorrect: true }); // 명사구 핵심어
assert.deepStrictEqual(plain(grade([0, 2], [3], [2, 0], [3])), { subjectCorrect: true, verbCorrect: true }); // 병렬 주어
assert.deepStrictEqual(plain(grade([0], [3], [0], [3])), { subjectCorrect: true, verbCorrect: true }); // 완료형 어휘동사
assert.deepStrictEqual(plain(grade([0], [2], [0], [2])), { subjectCorrect: true, verbCorrect: true }); // 수동태 어휘동사
assert.deepStrictEqual(plain(grade([0], [1], [0], [1])), { subjectCorrect: true, verbCorrect: true }); // be+형용사

console.log('sentence_structure_token.test.js: 15 assertions passed');
