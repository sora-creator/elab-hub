const assert = require('assert');
const fs = require('fs');

const backend = fs.readFileSync('exam/sheet_backend.gs', 'utf8');
const auth = fs.readFileSync('shared/auth.js', 'utf8');
const login = fs.readFileSync('login/index.html', 'utf8');
const signup = fs.readFileSync('signup/index.html', 'utf8');

new Function(auth);
assert.deepStrictEqual(
  [...backend.matchAll(/var TEACHER_INVITES_V2_HEADERS = \[(.*?)\];/g)][0][1].match(/'([^']+)'/g).map(v => v.slice(1, -1)),
  ['invite_id','invite_code','status','max_uses','used_count','teacher_id','created_at','expires_at','last_used_at','active','note']
);
assert(backend.includes('LockService.getScriptLock()'));
assert(backend.includes("if (String(invite[2]) === 'USED' || usedCount >= maxUses)"));
assert(backend.includes("errorCode: 'INVITE_EXPIRED'"));
assert(backend.includes("errorCode: 'INVITE_REVOKED'"));
assert(backend.includes("code, 'ACTIVE', 1, 0"));
assert(backend.includes("errorCode: 'TEACHER_SCOPE_MISMATCH'"));
assert(backend.includes('hashTeacherCredential_(raw)'));
assert(!backend.includes('credential_hash\', raw'));
assert(auth.includes("localStorage.setItem(credentialKey, result.credential)"));
assert(auth.includes("localStorage.removeItem(credentialKey)"));
assert(auth.includes("action: 'validateTeacherCredential'"));
assert(!auth.includes('sessionStorage'));
for (const html of [login, signup]) {
  assert(html.includes('교사로 시작하기'));
  assert(html.includes('현재 ELAB은 Closed Beta로 운영 중입니다.'));
  assert(html.includes('../privacy/index.html'));
  assert(!/type="(?:email|password|tel)"/.test(html));
  assert(!/name="(?:name|email|password|phone|academy)"/.test(html));
}
console.log('teacher auth v2 structural tests passed');
