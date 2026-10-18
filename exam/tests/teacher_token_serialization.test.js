const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('teacher/assignments.html', 'utf8');
assert.match(source, /base=c\.url\+'\?token='\+encodeURIComponent\(c\.token\)/, 'normal bootstrap reads must encode the token');
assert.match(source, /\?action=listDueVocabReviewsV1&token='\+encodeURIComponent\(c\.token\)/, 'listDueVocabReviewsV1 must encode the token');

const endpoint = 'https://staging.invalid/exec';
const actions = ['listStudents', 'listGroupsV2', 'listAssignmentsV2'];
const tokens = [
  'safePart',
  'safePart+plus',
  'safePart&and',
  'safePart=equal',
  'safePart%percent',
  'safePart?query',
  'safePart#fragment',
  'safe Part',
  '안전한토큰',
  'safePart+plus&and=equal%percent?query#fragment 공간 한글'
];

function normalUrl(action, token) {
  const base = endpoint + '?token=' + encodeURIComponent(token);
  return base + '&action=' + action;
}

function listDueUrl(token) {
  return endpoint + '?action=listDueVocabReviewsV1&token=' + encodeURIComponent(token) + '&limit=100';
}

function transportAndServerParse(url) {
  const request = new URL(url);
  request.searchParams.set('callback', '__elab_fetch_jsonp__');
  return new URL(request.href).searchParams.get('token');
}

for (const token of tokens) {
  for (const action of actions) assert.strictEqual(transportAndServerParse(normalUrl(action, token)), token, action);
  assert.strictEqual(transportAndServerParse(listDueUrl(token)), token, 'listDueVocabReviewsV1');
}

console.log('teacher_token_serialization.test.js: actions=4 token-cases=10 exact-round-trip=40');
