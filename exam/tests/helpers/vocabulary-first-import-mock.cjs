'use strict';
// Isolated in-memory Apps Script surface. No browser, HTTP, or Google services.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const backend = fs.readFileSync(path.resolve(__dirname, '../../sheet_backend.gs'), 'utf8');
function createFirstImportMock(snapshot) {
  const sheets = {}, writes = [], logs = [], operations = [], hooks = {};
  const track = (method, sheet, extra = {}) => operations.push({ method, sheet, ...extra });
  let locked = false;
  class Sheet {
    constructor(name, headers) { this.name = name; this.rows = [Array.from(headers)]; this.formulas = {}; this.maxRows = 50000; this.maxColumns = headers.length; this.gid = PUBLIC_SHEET_ID_REMOVED; this.merged = []; }
    getSheetId() { track('getSheetId', this.name); return this.gid; }
    getMaxRows() { track('getMaxRows', this.name); return this.maxRows; }
    getMaxColumns() { track('getMaxColumns', this.name); return this.maxColumns; }
    getLastRow() {
      track('getLastRow', this.name);
      let last = 1;
      this.rows.forEach((row, i) => { if (row.some(v => v !== '' && v !== undefined)) last = i + 1; });
      Object.keys(this.formulas).forEach(key => { last = Math.max(last, Number(key.split(',')[0])); });
      return last;
    }
    getDataRange() {
      track('getDataRange', this.name);
      const width = Math.max(this.rows[0].length, ...this.rows.map(r => r.length), ...Object.keys(this.formulas).map(key => Number(key.split(',')[1])));
      return this.getRange(1, 1, this.getLastRow(), width, true);
    }
    getRange(r, c, nr = 1, nc = 1, internal = false) {
      if (!internal) track('getRange', this.name, { row: r, column: c, rows: nr, columns: nc });
      const sheet = this;
      if (r < 1 || c < 1 || r + nr - 1 > this.maxRows || c + nc - 1 > this.maxColumns) throw new Error('mock range exceeds capacity');
      function read(formulas) { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => formulas ? (sheet.formulas[`${r + i},${c + j}`] || '') : (sheet.rows[r + i - 1]?.[c + j - 1] ?? ''))); }
      return {
        getValues: () => { track('getValues', sheet.name, { cells: nr * nc }); return read(false); },
        getFormulas: () => { track('getFormulas', sheet.name, { cells: nr * nc }); return read(true); },
        getMergedRanges: () => { track('getMergedRanges', sheet.name); return sheet.merged; },
        setValues(values) {
          if (values.length !== nr || values.some(row => row.length !== nc)) throw new Error('mock setValues dimensions');
          writes.push({ sheet: sheet.name, method: 'setValues', row: r, column: c, rows: nr, columns: nc });
          track('setValues', sheet.name, { row: r, column: c, rows: nr, columns: nc });
          const failAfter = sheet.failAfter;
          delete sheet.failAfter;
          values.forEach((row, i) => {
            if (failAfter !== undefined && i >= failAfter) return;
            while (sheet.rows.length < r + i) sheet.rows.push([]);
            row.forEach((value, j) => { sheet.rows[r + i - 1][c + j - 1] = value instanceof Date ? new Date(value) : value; });
          });
          if (failAfter !== undefined) throw new Error('mock interrupted setValues');
          if (hooks.afterWrite) hooks.afterWrite(sheet.name);
        },
        clearContent() {
          writes.push({ sheet: sheet.name, method: 'clearContent', row: r, column: c, rows: nr, columns: nc });
          track('clearContent', sheet.name);
          const failAfter = sheet.failClearAfter; delete sheet.failClearAfter;
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
            if (failAfter !== undefined && i >= failAfter) continue;
            if (sheet.rows[r + i - 1]) sheet.rows[r + i - 1][c + j - 1] = '';
            delete sheet.formulas[`${r + i},${c + j}`];
          }
          if (failAfter !== undefined) throw new Error('mock interrupted clearContent');
        }
      };
    }
  }
  const ss = { getId: () => 'PUBLIC_IDENTIFIER_REMOVED', getSheetByName: name => sheets[name] || null };
  const ctx = {
    Date, console: { log: (...args) => logs.push(args) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'TOKEN' ? 'local-test-token' : '' }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() { track('flush'); if (hooks.flush) hooks.flush(); } },
    LockService: { getScriptLock: () => {
      let owns = false;
      return { tryLock() { track('tryLock'); if (locked) return false; owns = true; locked = true; return true; }, hasLock: () => owns,
        releaseLock() { if (owns) { track('releaseLock'); owns = false; locked = false; } } };
    } },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, data) => Array.from(crypto.createHash('sha256').update(data).digest(), x => x > 127 ? x - 256 : x) },
    ContentService: { MimeType: { TEXT: 'text', JAVASCRIPT: 'js' }, createTextOutput: body => ({ body, setMimeType() { return this; } }) }
  };
  vm.createContext(ctx); vm.runInContext(backend, ctx);
  sheets.VocabularyDB = new Sheet('VocabularyDB', ctx.VOCABULARY_DB_HEADERS);
  sheets.VocabularyImportsV2 = new Sheet('VocabularyImportsV2', ctx.VOCABULARY_IMPORTS_V2_HEADERS);
  sheets.VocabularyImportStagingV2 = new Sheet('VocabularyImportStagingV2', ctx.VOCABULARY_IMPORT_STAGING_V2_HEADERS);
  if (snapshot) for (const [name, rows] of Object.entries(snapshot)) sheets[name].rows = structuredClone(rows);
  return {
    ctx, ss, sheets, writes, logs, operations, hooks,
    call: payload => ctx.handleVocabularyFirstImportV1_({ token: 'local-test-token', ...payload }),
    snapshot: () => Object.fromEntries(Object.entries(sheets).map(([name, sheet]) => [name, structuredClone(sheet.rows)])),
    audit: () => JSON.parse(sheets.VocabularyImportsV2.rows.find(row => String(row[12]).startsWith('VOCAB_FIRST_IMPORT_V1:'))[12].slice('VOCAB_FIRST_IMPORT_V1:'.length)),
    locked: () => locked
  };
}
module.exports = { createFirstImportMock };
