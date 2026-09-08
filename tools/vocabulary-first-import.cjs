'use strict';
// Offline only: no credentials, transport, uploads, or automatic file discovery.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const directory = path.resolve(__dirname, '../outputs/vocabulary-reclassification/vocab-3-first-import');
const PREIMPORT_SHA = 'PUBLIC_IDENTIFIER_REMOVED';
const MANIFEST_SHA = 'PUBLIC_IDENTIFIER_REMOVED';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hash = value => sha(JSON.stringify(value));
function check(condition, code) { if (!condition) throw new Error(code); }
function loadFirstImport() {
  const file = path.join(directory, 'PUBLIC_IDENTIFIER_REMOVED.xlsx');
  const manifestFile = path.join(directory, 'VOCABULARY_FIRST_IMPORT_3244_MANIFEST.json');
  const bytes = fs.readFileSync(file), manifestBytes = fs.readFileSync(manifestFile);
  check(sha(bytes) === PREIMPORT_SHA, 'PREIMPORT_HASH_MISMATCH');
  check(sha(manifestBytes) === MANIFEST_SHA, 'MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const workbook = XLSX.read(bytes, { type: 'buffer', cellFormula: true });
  const sheet = workbook.Sheets[manifest.preimport_sheet];
  check(!!sheet, 'PREIMPORT_SHEET_MISSING');
  check(!Object.entries(sheet).some(([key, cell]) => !key.startsWith('!') && cell.f), 'FORMULA_NOT_ALLOWED');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  check(hash(matrix[0]) === manifest.canonical_headers_sha256, 'HEADER_MISMATCH');
  const rows = matrix.slice(1);
  check(rows.length === 3244 && rows.every(row => row.length === 21), 'ROW_COUNT_OR_WIDTH_MISMATCH');
  check(hash(rows) === manifest.canonical_rows_sha256, 'ROW_FINGERPRINT_MISMATCH');
  check(hash(rows.map(row => row[0])) === hash(manifest.allowlist), 'ALLOWLIST_MISMATCH');
  check(new Set(rows.map(row => row[0])).size === 3244, 'DUPLICATE_SENSE_ID');
  const levels = { V1: 0, V2: 0, V3: 0, V4: 0, V5: 0 };
  for (const row of rows) {
    check(row[19] in levels && row[4] === row[19] && row[15] === row[19], 'LEVEL_MISMATCH');
    levels[row[19]]++;
    check(row[9] === true && row[14] === true && row[16] === false, 'FLAG_MISMATCH');
    check(row[10] === '' && row[11] === '', 'TIMESTAMP_MISMATCH');
    check([0, 1, 2, 3, 5].every(i => String(row[i]).trim()), 'REQUIRED_VALUE_MISSING');
  }
  check(hash(levels) === hash(manifest.expected_levels), 'LEVEL_COUNTS_MISMATCH');
  const metadata = {
    batch_id: manifest.chunks[0].batch_id, request_id: manifest.chunks[0].batch_id,
    manifest_sha256: MANIFEST_SHA, preimport_sha256: PREIMPORT_SHA, schema_version: manifest.schema_version,
    expected_total: 3244, expected_levels: levels, expected_unique_sense_ids: 3244, chunk_count: 7
  };
  const chunks = manifest.chunks.map(chunk => {
    const payload = rows.slice(chunk.first_source_row - 2, chunk.last_source_row - 1);
    check(payload.length === chunk.row_count && hash(payload) === chunk.payload_hash, 'CHUNK_HASH_MISMATCH');
    return { ...metadata, ...chunk, action: 'stageVocabularyFirstImportV1', rows: payload };
  });
  return { metadata, rows, chunks, manifest, file, manifestFile };
}
if (require.main === module) {
  const input = loadFirstImport();
  console.log(JSON.stringify({
    mode: 'DRY_RUN', network_calls: 0, google_sheet_writes: 0,
    manifest_validation: 'PASS', batch_id: input.metadata.batch_id,
    staging_rows: input.rows.length, chunk_status: input.chunks.map(c => ({ chunk_index: c.chunk_index, row_count: c.row_count, hash: 'PASS' })),
    precondition: 'NOT_CHECKED_OFFLINE', would_write_range: 'VocabularyDB!A2:U3245',
    expected_post_state: { total: 3244, levels: input.metadata.expected_levels, unique_sense_ids: 3244 },
    rollback_candidate: 'A2:U3245 only; requires COMPLETED audit and exact current fingerprints, no other batch'
  }, null, 2));
}
module.exports = { loadFirstImport, sha, hash };
