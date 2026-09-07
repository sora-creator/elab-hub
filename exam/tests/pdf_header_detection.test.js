const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('exam/js/pdfService.js','utf8');
const start=source.indexOf('const HEADER_PATTERNS');
const end=source.indexOf('\nfunction matchQuestionRange',start);
assert(start>=0&&end>start,'header detector source not found');

const context={};
vm.createContext(context);
vm.runInContext(`${source.slice(start,end)}\nthis.matchHeaderNum=matchHeaderNum;`,context);
const plain=value=>value==null?value:JSON.parse(JSON.stringify(value));

assert.strictEqual(context.matchHeaderNum('18–29 group showed a decrease in the percentage of people'),null);
assert.deepStrictEqual(plain(context.matchHeaderNum('[41~42] 다음 글을 읽고')),{num:41,endNum:42});
assert.deepStrictEqual(plain(context.matchHeaderNum('41~42번 다음 글을 읽고')),{num:41,endNum:42});
assert.deepStrictEqual(plain(context.matchHeaderNum('18. 다음 글의 목적으로 가장 적절한 것은?')),{num:18,endNum:null});
assert.deepStrictEqual(plain(context.matchHeaderNum('26. Bill Evans에 관한 다음 글의 내용과')),{num:26,endNum:null});

console.log('pdf_header_detection.test.js: all assertions passed');
