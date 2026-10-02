const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('sentence-structure/staging-integration.js', 'utf8');

function boot(search, response) {
  const reads = [];
  const window = {
    location: { search },
    ELAB_SENTENCE_STRUCTURE_STUDENT_V1: {
      dataset_id: 'local-fixture',
      records: [{ sentence_id: 'local-1', text: 'Local fixture.', tokens: ['Local', 'fixture', '.'] }]
    },
    ELABAppsScript: {
      read: async url => {
        reads.push(new URL(url));
        return response;
      }
    }
  };
  const context = { window, URL, URLSearchParams, console, setTimeout, clearTimeout, Promise, JSON, Math };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'staging-integration.js' });
  return { window, reads };
}

(async () => {
  const hook = 'https://staging.example.test/macros/s/environment endpoint';
  const valid = new URLSearchParams({
    hook,
    set_key: 'set key/한글',
    assignment_target_id: 'target 1',
    student_id: 'student+1',
    assignmentCapability: 'signed.capability'
  });
  const remote = boot(`?${valid}`, {
    found: true,
    passages: [{ sentence_id: 'remote-1', text: 'Remote sentence.', tokens: ['Remote', 'sentence', '.'] }],
    attempt_id: 'attempt-1',
    attemptCapability: 'attempt.capability',
    studentCapability: 'student.capability'
  });
  assert.strictEqual(remote.window.ELABSentenceStructureStaging.active, true);
  await remote.window.ELABSentenceStructureStaging.ready;
  assert.strictEqual(remote.reads.length, 1);
  assert.strictEqual(remote.reads[0].origin + remote.reads[0].pathname, new URL(hook).href);
  assert.strictEqual(remote.reads[0].searchParams.get('key'), 'set key/한글');
  assert.strictEqual(remote.reads[0].searchParams.get('assignment_target_id'), 'target 1');
  assert.strictEqual(remote.reads[0].searchParams.get('student_id'), 'student+1');
  assert.strictEqual(remote.reads[0].searchParams.get('assignmentCapability'), 'signed.capability');
  assert.strictEqual(remote.window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1.records.length, 1);
  assert.strictEqual(remote.window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1.records[0].sentence_id, 'remote-1');

  const broken = boot('?set_key=set-1&assignment_target_id=target-1&student_id=student-1&assignmentCapability=signed.capability');
  assert.strictEqual(broken.window.ELABSentenceStructureStaging.active, true);
  await assert.rejects(broken.window.ELABSentenceStructureStaging.ready, /과제 연결 정보를 불러오지 못했습니다/);
  assert.strictEqual(broken.reads.length, 0);
  assert.strictEqual(broken.window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1.dataset_id, 'local-fixture');

  const local = boot('?sentence_id=corpus%3A2479');
  assert.strictEqual(local.window.ELABSentenceStructureStaging.active, false);
  assert.strictEqual(await local.window.ELABSentenceStructureStaging.ready, null);
  assert.strictEqual(local.reads.length, 0);
  assert.strictEqual(local.window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1.records.length, 1);

  console.log('sentence_structure_launch_link.test.js: all assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
