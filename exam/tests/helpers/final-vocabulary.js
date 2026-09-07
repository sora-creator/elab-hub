const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const file = path.resolve(__dirname, '../../../outputs/vocab-final-3200/ELAB_운영용_정규어휘DB_3200_v2.xlsx');
const required = ['level','word','meaning','vocab_id','sense_id','item_type','sense_order','importance_score','occurrence_count','active','curriculum_active','curriculum_level','archive_only','selection_score','selection_reason','recommended_level','confirmed_level'];
function readFinalVocabulary() {
  if (process.env.ELAB_VOCAB_XLSX) {
    assert.strictEqual(fs.realpathSync(process.env.ELAB_VOCAB_XLSX), fs.realpathSync(file), 'Only the final 3200 workbook is allowed');
  }
  const bytes = fs.readFileSync(file);
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  assert(workbook.Sheets.ELAB_Import, 'ELAB_Import sheet');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.ELAB_Import, { defval: '', raw: true });
  // sense_order is the original sense number, NOT the curriculum's primary flag.
  // Read primary metadata from the matching FINAL master, never an old 3400 file.
  const masterFile = path.join(path.dirname(file), 'ELAB_전체기출_어휘마스터DB_최종_v2.xlsx');
  const master = XLSX.readFile(masterFile, { sheets: ['StudentCurriculum3200'] });
  const metadata = XLSX.utils.sheet_to_json(master.Sheets.StudentCurriculum3200, { defval: '', raw: true });
  assert.strictEqual(metadata.length, 3200);
  const byId = new Map(metadata.map(r => [r.sense_id, r]));
  assert.strictEqual(byId.size, 3200);
  const isPrimary = r => byId.get(r.sense_id).is_primary === true || String(byId.get(r.sense_id).is_primary).toUpperCase() === 'TRUE';
  const levels = { V1: 0, V2: 0, V3: 0, V4: 0, V5: 0 };
  const ids = new Set(), words = new Set(), primary = new Map();
  let missing = 0, duplicates = 0, primaryAfterAdditional = 0, missingPrimary = 0;
  rows.forEach((r, i) => {
    required.forEach(k => { if (r[k] == null || String(r[k]).trim() === '') missing++; });
    assert(/^V[1-5]$/.test(r.confirmed_level), 'confirmed_level range');
    assert(/^V[1-5]$/.test(r.curriculum_level), 'curriculum_level range');
    assert.strictEqual(r.confirmed_level, r.curriculum_level);
    assert.strictEqual(r.level, r.confirmed_level);
    levels[r.confirmed_level]++;
    if (ids.has(String(r.sense_id).trim())) duplicates++;
    ids.add(String(r.sense_id).trim());
    const word = String(r.word).trim().toLowerCase();
    assert(byId.has(r.sense_id), 'final master metadata for every imported sense');
    assert(['TRUE','FALSE'].includes(String(byId.get(r.sense_id).is_primary).toUpperCase()), 'explicit primary flag in final master');
    assert.strictEqual(String(byId.get(r.sense_id).headword).trim().toLowerCase(), word);
    words.add(word);
    if (isPrimary(r) && !primary.has(word)) primary.set(word, i);
  });
  rows.forEach((r, i) => {
    if (isPrimary(r)) return;
    const p = primary.get(String(r.word).trim().toLowerCase());
    if (p == null) missingPrimary++;
    else if (p > i) primaryAfterAdditional++;
  });
  const stats = {
    file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    total: rows.length, levels, unique_sense_ids: ids.size,
    duplicate_sense_ids: duplicates, missing_required_values: missing,
    active_true: rows.filter(r => r.active === true).length,
    curriculum_active_true: rows.filter(r => r.curriculum_active === true).length,
    archive_only_false: rows.filter(r => r.archive_only === false).length,
    primary_after_additional: primaryAfterAdditional, missing_primary: missingPrimary,
    includes_molecule: words.has('molecule'), includes_cell: words.has('cell'),
    includes_decorative_art: words.has('decorative art'), includes_deep_down: words.has('deep down')
  };
  assert.strictEqual(rows.length, 3200);
  assert.deepStrictEqual(levels, { V1: 800, V2: 800, V3: 800, V4: 600, V5: 200 });
  assert.strictEqual(ids.size, 3200);
  for (const k of ['duplicate_sense_ids','missing_required_values','primary_after_additional']) assert.strictEqual(stats[k], 0, k);
  for (const k of ['active_true','curriculum_active_true','archive_only_false']) assert.strictEqual(stats[k], 3200, k);
  assert(stats.includes_molecule && stats.includes_cell);
  assert(!stats.includes_decorative_art && !stats.includes_deep_down);
  const rowById = new Map(rows.map(r => [r.sense_id, r]));
  assert.strictEqual(rowById.get('SEN_D61C71B6E0EB').meaning, '근본적으로, 철저하게');
  assert(!rowById.has('SEN_A11A9CE9572E'));
  assert(rowById.has('SEN_255CB719A908') && rowById.has('SEN_1E29309D5982') && rowById.has('SEN_45E0E9FE6A8F'));
  assert(!rowById.has('SEN_12817DE70147') && !rowById.has('SEN_7D6ED6B83CB1') && !rowById.has('SEN_6D938E62C919'));
  return { rows, stats, file };
}
module.exports = { readFinalVocabulary, file, required };
