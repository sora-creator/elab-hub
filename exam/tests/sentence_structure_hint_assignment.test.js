const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const teacher = fs.readFileSync('teacher/assignments.html', 'utf8');
const backend = fs.readFileSync('exam/sheet_backend.gs', 'utf8');

test('teacher assignment UI offers exactly NONE, BASIC and DETAILED', () => {
  const values = [...teacher.matchAll(/name="sentenceHintLevel" value="([A-Z]+)"/g)].map(match => match[1]);
  assert.deepEqual(values, ['NONE', 'BASIC', 'DETAILED']);
  assert.match(teacher, /문장구조 힌트 제공/);
  assert.match(teacher, /문장 난이도와 별개/);
});

test('new assignment default is BASIC and draft preserves the choice', () => {
  assert.match(teacher, /sentenceHintLevel:'BASIC'/);
  assert.match(teacher, /sentenceHintLevel:state\.sentenceHintLevel/);
  assert.match(teacher, /assignmentDraft&&assignmentDraft\.sentenceHintLevel/);
});

test('sentence assignment link persists the teacher-selected level', () => {
  const start = teacher.indexOf('function assignmentLink(item)');
  const end = teacher.indexOf('\nassign.onclick', start);
  assert(start >= 0 && end > start);
  const source = teacher.slice(start, end);
  const context = {
    URL,
    location: { href: 'http://localhost:8010/teacher/assignments.html' },
    state: { sentenceHintLevel: 'NONE' },
    cfg: () => ({ url: 'https://example.test/exec' })
  };
  vm.runInNewContext(`${source};result=assignmentLink({content_type:'SENTENCE_STRUCTURE',content_ref_id:'set-1',content_link:'../sentence-structure/index.html?sentence_id=corpus%3A23568'});`, context);
  assert.equal(new URL(context.result).searchParams.get('hint_level'), 'NONE');
  assert.equal(new URL(context.result).searchParams.get('reading_support'), 'beginner');
  context.state.sentenceHintLevel = 'DETAILED';
  vm.runInNewContext("result=assignmentLink({content_type:'SENTENCE_STRUCTURE',content_ref_id:'set-1',content_link:'../sentence-structure/index.html'});", context);
  assert.equal(new URL(context.result).searchParams.get('hint_level'), 'DETAILED');
  vm.runInNewContext("result=assignmentLink({content_type:'SENTENCE_STRUCTURE',content_ref_id:'set-1',content_link:''});", context);
  assert.match(new URL(context.result).pathname, /\/sentence-structure\/index\.html$/);
  assert.equal(new URL(context.result).searchParams.get('set_key'), 'set-1');
});

test('non-sentence assignment links do not receive hint_level', () => {
  const start = teacher.indexOf('function assignmentLink(item)');
  const end = teacher.indexOf('\nassign.onclick', start);
  const context = { URL, location: { href: 'http://localhost:8010/teacher/assignments.html' }, state: { sentenceHintLevel: 'BASIC' }, cfg: () => ({ url: 'https://example.test/exec' }) };
  vm.runInNewContext(`${teacher.slice(start, end)};result=assignmentLink({content_type:'READING',content_ref_id:'exam-1',content_link:'../exam/index.html?session=exam-1'});`, context);
  assert.equal(new URL(context.result, context.location.href).searchParams.has('hint_level'), false);
});

test('assignment capability carries the stored hint level without a sheet schema change', () => {
  assert.match(backend, /metadata:\s*metadata \|\| \{\}/);
  assert.match(backend, /sentenceHintLevelFromLinkV2_/);
  assert.match(backend, /sentenceReadingSupportFromLinkV2_/);
  assert.match(backend, /reading_support_level:supportLevel/);
  const header = backend.match(/var ASSIGNMENTS_V2_HEADERS = \[([^\]]+)\]/)?.[1] || '';
  assert.equal(header.includes('hint_level'), false);
  assert.equal(header.includes('reading_support_level'), false);
});

for (const [index, script] of [...teacher.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(code => code.trim()).entries()) {
  test(`teacher inline script ${index + 1} compiles`, () => new vm.Script(script, { filename: `teacher-assignments-inline-${index + 1}.js` }));
}
