'use strict';
// Isolated in-memory Apps Script surface. No browser, HTTP, or Google services.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const backend = fs.readFileSync(path.resolve(__dirname, '../../sheet_backend.gs'), 'utf8');
function createFirstImportMock(snapshot) {
  const sheets = {}, writes = [], logs = [], operations = [], hooks = {};
  const track = (method, sheet, extra = {}) => operations.push({ method, sheet, ...extra });
  let locked = false;
  class Sheet {
    constructor(name, headers) { this.name = name; this.rows = [Array.from(headers)]; this.formulas = {}; this.formats = {}; this.maxRows = 50000; this.maxColumns = headers.length; this.gid = name === 'VocabularyImportStagingV2' ? 1121844961 : 286442264; this.merged = []; }
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
        getCell: (i,j) => {
          if (i<1 || j<1 || i>nr || j>nc) throw new Error('mock cell outside parent range');
          return sheet.getRange(r+i-1,c+j-1,1,1);
        },
        getValues: () => { track('getValues', sheet.name, { cells: nr * nc }); return read(false); },
        getFormulas: () => { track('getFormulas', sheet.name, { cells: nr * nc }); return read(true); },
        getNumberFormats: () => Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>sheet.formats[`${r+i},${c+j}`] || 'General')),
        getMergedRanges: () => { track('getMergedRanges', sheet.name); return sheet.merged; },
        setNumberFormat(format) {
          writes.push({sheet:sheet.name,method:'setNumberFormat',row:r,column:c,rows:nr,columns:nc,format});
          track('setNumberFormat',sheet.name);
          if (hooks.beforeFormat) hooks.beforeFormat(sheet.name,r,c);
          for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)sheet.formats[`${r+i},${c+j}`]=format;
          if (hooks.afterFormat) hooks.afterFormat(sheet.name,r,c);
        },
        setValues(values) {
          if (values.length !== nr || values.some(row => row.length !== nc)) throw new Error('mock setValues dimensions');
          if (values.some(row=>row.some(v=>v !== null && typeof v === 'object' && !(v instanceof Date)))) throw new Error('unsupported scalar object');
          writes.push({ sheet: sheet.name, method: 'setValues', row: r, column: c, rows: nr, columns: nc });
          track('setValues', sheet.name, { row: r, column: c, rows: nr, columns: nc });
          if (hooks.beforeScalarWrite) hooks.beforeScalarWrite(sheet.name,r,c,values);
          const failAfter = sheet.failAfter;
          delete sheet.failAfter;
          values.forEach((row, i) => {
            if (failAfter !== undefined && i >= failAfter) return;
            while (sheet.rows.length < r + i) sheet.rows.push([]);
            row.forEach((value, j) => {
              const key = `${r+i},${c+j}`, plain = sheet.formats[key] === '@';
              delete sheet.formulas[key];
              if (typeof value === 'string' && value.startsWith('=')) sheet.formulas[key] = value;
              // VOCAB-5C2 observation: a leading U+0027 disappeared despite '@'.
              // One-prefix consumption is an explicit simulation hypothesis, not
              // evidence that Apps Script universally parses either setter this way.
              if (['VocabularyImportStagingV2', 'VocabularyDB'].includes(sheet.name) && typeof value === 'string' && value.startsWith("'") && hooks.apostropheSemantics !== 'literal') value = value.slice(1);
              if (!plain && hooks.scalarCoercion && typeof value === 'string') value = hooks.scalarCoercion(value);
              // Adversarial General-format fixture; not a universal Sheets parser simulation.
              if (['VocabularyImportStagingV2', 'VocabularyDB'].includes(sheet.name) && !plain && typeof value === 'string' && /^(true|false)$/i.test(value)) value = value.toLowerCase() === 'true';
              sheet.rows[r + i - 1][c + j - 1] = value instanceof Date ? new Date(value) : value;
            });
          });
          if (failAfter !== undefined) throw new Error('mock interrupted setValues');
          if (hooks.afterWrite) hooks.afterWrite(sheet.name);
        },
        setRichTextValues(values) {
          if (values.length !== nr || values.some(row => row.length !== nc)) throw new Error('mock rich text dimensions');
          const valuesText = values.map(row => row.map(v => {
            if (!v || typeof v.getText !== 'function' || typeof v.getText() !== 'string') throw new Error('mock rich text type');
            return v.getText();
          }));
          writes.push({sheet:sheet.name,method:'setRichTextValues',row:r,column:c,rows:nr,columns:nc});
          track('setRichTextValues',sheet.name,{row:r,column:c,rows:nr,columns:nc});
          if (hooks.beforeRichWrite) hooks.beforeRichWrite(sheet.name,r,c);
          valuesText.forEach((row,i) => row.forEach((value,j) => {
            while (sheet.rows.length < r+i) sheet.rows.push([]);
            // Model the observed General-format false incident unless the text format is set.
            let stored = ['VocabularyImportStagingV2', 'VocabularyDB'].includes(sheet.name) && sheet.formats[`${r+i},${c+j}`] !== '@' && /^(true|false)$/i.test(value) ? value.toLowerCase() === 'true' : value;
            if (['VocabularyImportStagingV2', 'VocabularyDB'].includes(sheet.name) && typeof stored === 'string' && stored.startsWith("'") && hooks.apostropheSemantics !== 'literal') stored = stored.slice(1);
            sheet.rows[r+i-1][c+j-1] = stored;
            delete sheet.formulas[`${r+i},${c+j}`];
          }));
          if (hooks.afterRichWrite) hooks.afterRichWrite(sheet.name,r,c);
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
    SpreadsheetApp: { getActiveSpreadsheet: () => ss,
      newRichTextValue: () => { let text; return {setText(v) { if (typeof v !== 'string') throw new Error('mock text must be string'); text=v; return this; },build() { const value=text; return {getText:()=>value}; }}; },
      flush() { track('flush'); if (hooks.flush) hooks.flush(); } },
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
