const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const excluded = new Set(['.git','node_modules','outputs','output','backups','.pw-browsers','.venv','.venv-grammar','venv','browser-profile','browser-data','.ebsi_browser_profile']);
const textExt = new Set(['.html','.css','.js','.cjs','.mjs','.gs','.json','.md','.py','.ps1','.bat','.txt','.yml','.yaml','.toml','.xml','.svg']);
const rules = [
  ['SECRET', 'PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, true],
  ['SECRET', 'GOOGLE_SERVICE_ACCOUNT', /"type"\s*:\s*"service_account"/i, true],
  ['SECRET_REVIEW', 'CREDENTIAL_ASSIGNMENT', /(?:api[_-]?key|access[_-]?token|teacher[_-]?token|password|secret|private[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i, true],
  ['PERSONAL_DATA_REVIEW', 'PIN_LITERAL', /(?:student[_-]?)?pin\s*[:=]\s*["']\d{4,}["']/i, true],
  ['PUBLIC_RUNTIME_CONFIG', 'APPS_SCRIPT_URL', /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/i, false],
  ['PUBLIC_RUNTIME_CONFIG', 'APPS_SCRIPT_DEPLOYMENT_ID', /AKfycb[A-Za-z0-9_-]{20,}/, false],
  ['INTERNAL_IDENTIFIER', 'GOOGLE_SHEET_URL', /https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/i, false],
  ['PERSONAL_DATA_REVIEW', 'EMAIL_ADDRESS', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, false],
  ['RUNTIME_REFERENCE', 'DELIVERY_STORAGE_KEY', /(?:hub|mockexam|grammarhub|vpang)\.delivery/, false],
  ['RUNTIME_REFERENCE', 'LOCAL_STORAGE_REFERENCE', /localStorage\.(?:getItem|setItem)\s*\(/, false],
];

function git(args) { return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }); }
const tracked = new Set(git(['ls-files']).split(/\r?\n/).filter(Boolean).map(x => x.replace(/\\/g,'/')));
const findings = [];
function scanText(file, rel, source) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => rules.forEach(([classification, type, regex, blocking]) => {
    if (regex.test(line)) findings.push({ source, file: rel, line: index + 1, classification, type, tracked: tracked.has(rel), blocking });
  }));
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name), rel = path.relative(root, full).replace(/\\/g,'/');
    if (entry.isDirectory()) walk(full);
    else if (textExt.has(path.extname(entry.name).toLowerCase()) || ['.gitignore','.gitattributes'].includes(entry.name)) scanText(full, rel, 'WORKTREE');
  }
}
walk(root);

const history = [];
for (const commit of git(['rev-list','--all']).split(/\r?\n/).filter(Boolean)) {
  let names = [];
  try { names = git(['ls-tree','-r','--name-only',commit]).split(/\r?\n/).filter(Boolean); } catch (_) { continue; }
  for (const rel of names) {
    if (!textExt.has(path.extname(rel).toLowerCase()) && !['.gitignore','.gitattributes'].includes(path.basename(rel))) continue;
    let content = '';
    try { content = git(['show',`${commit}:${rel}`]); } catch (_) { continue; }
    content.split(/\r?\n/).forEach((line,index) => rules.forEach(([classification,type,regex,blocking]) => {
      if (regex.test(line)) history.push({ commit:commit.slice(0,12), file:rel, line:index+1, classification, type, blocking });
    }));
  }
}
const unique = list => [...new Map(list.map(x => [JSON.stringify(x),x])).values()];
const result = { worktree: unique(findings), history: unique(history) };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.history.some(x=>x.blocking) ? 2 : 0;
