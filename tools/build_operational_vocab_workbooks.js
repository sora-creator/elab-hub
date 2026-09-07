const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const source = process.argv[2];
const outputDir = process.argv[3];
if (!source || !outputDir) throw new Error('usage: node build_operational_vocab_workbooks.js <source.xlsx> <output-dir>');

const truthy = value => value === true || ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase());
const wb = XLSX.readFile(source, { cellDates: true });
const sourceRows = XLSX.utils.sheet_to_json(wb.Sheets.ELAB_Import, { defval: '', raw: true });
const selected = sourceRows.filter(row =>
  truthy(row.active) &&
  truthy(row.curriculum_active) &&
  !truthy(row.archive_only) &&
  /^V[1-5]$/.test(String(row.confirmed_level).trim().toUpperCase()) &&
  String(row.sense_id ?? '').trim() &&
  String(row.word ?? '').trim() &&
  String(row.meaning ?? '').trim()
);

fs.mkdirSync(outputDir, { recursive: true });
const masterOut = path.join(outputDir, 'ELAB_전체기출_어휘마스터DB.xlsx');
const operationalOut = path.join(outputDir, 'ELAB_운영용_정규어휘DB_3400.xlsx');
fs.copyFileSync(source, masterOut);

const out = XLSX.utils.book_new();
const importHeaders = Object.keys(sourceRows[0] || {});
const importSheet = XLSX.utils.json_to_sheet(selected, { header: importHeaders });
importSheet['!cols'] = importHeaders.map(header => ({ wch: Math.min(42, Math.max(12, header.length + 2)) }));
XLSX.utils.book_append_sheet(out, importSheet, 'ELAB_Import');

const selectedIds = new Set(selected.map(row => String(row.sense_id)));
if (wb.Sheets.CurriculumUncertain) {
  const uncertain = XLSX.utils.sheet_to_json(wb.Sheets.CurriculumUncertain, { defval: '', raw: true })
    .filter(row => selectedIds.has(String(row.sense_id_a)) || selectedIds.has(String(row.sense_id_b)));
  const uncertainSheet = XLSX.utils.json_to_sheet(uncertain);
  uncertainSheet['!cols'] = Object.keys(uncertain[0] || {}).map(header => ({ wch: Math.min(42, Math.max(12, header.length + 2)) }));
  XLSX.utils.book_append_sheet(out, uncertainSheet, 'CurriculumUncertain');
}

const levels = { V1: 0, V2: 0, V3: 0, V4: 0, V5: 0 };
const ids = new Set();
let duplicate = 0;
let missing = 0;
let conflict = 0;
selected.forEach(row => {
  const level = String(row.confirmed_level).trim().toUpperCase();
  levels[level] += 1;
  const id = String(row.sense_id).trim();
  if (ids.has(id)) duplicate += 1;
  ids.add(id);
  if (!id || !String(row.word).trim() || !String(row.meaning).trim()) missing += 1;
  if (truthy(row.curriculum_active) && truthy(row.archive_only)) conflict += 1;
});
const audit = [
  ['검증 항목', '결과', '기대값', '상태'],
  ['전체', selected.length, 3400, selected.length === 3400 ? 'PASS' : 'FAIL'],
  ...Object.keys(levels).map(level => [level, levels[level], { V1: 800, V2: 800, V3: 800, V4: 600, V5: 400 }[level], levels[level] === { V1: 800, V2: 800, V3: 800, V4: 600, V5: 400 }[level] ? 'PASS' : 'FAIL']),
  ['curriculum_active', selected.filter(row => truthy(row.curriculum_active)).length, 3400, selected.every(row => truthy(row.curriculum_active)) ? 'PASS' : 'FAIL'],
  ['archive_only', selected.filter(row => truthy(row.archive_only)).length, 0, selected.every(row => !truthy(row.archive_only)) ? 'PASS' : 'FAIL'],
  ['sense_id 중복', duplicate, 0, duplicate === 0 ? 'PASS' : 'FAIL'],
  ['필수값 누락', missing, 0, missing === 0 ? 'PASS' : 'FAIL'],
  ['학생용/보관용 충돌', conflict, 0, conflict === 0 ? 'PASS' : 'FAIL'],
  ['원본 마스터 파일', path.basename(masterOut), '', 'REFERENCE']
];
const auditSheet = XLSX.utils.aoa_to_sheet(audit);
auditSheet['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 14 }];
XLSX.utils.book_append_sheet(out, auditSheet, 'ImportValidation');
XLSX.writeFile(out, operationalOut, { compression: true });

console.log(JSON.stringify({ masterOut, operationalOut, total: selected.length, levels, duplicate, missing, conflict }, null, 2));
