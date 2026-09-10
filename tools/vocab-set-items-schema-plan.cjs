'use strict';
// Offline plan only. No Apps Script action, network, Sheet setter, or backfill.
const crypto = require('crypto');
const HEADERS = ['vocab_set_item_id', 'vocab_set_id', 'word_id', 'item_order', 'created_at', 'sense_id', 'word_snapshot', 'meaning_snapshot', 'level_snapshot'];
function fingerprint(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify({
    values: snapshot.values.map(row => row.map(v => [v instanceof Date ? 'date' : typeof v, v])),
    formulas: snapshot.formulas
  })).digest('hex');
}
// Load the backend's pure schema planner; no Apps Script service is executed.
const vm=require('vm'),path=require('path'),fs=require('fs');
const backend={Date,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,text)=>Array.from(crypto.createHash('sha256').update(text).digest())}};
vm.createContext(backend);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../exam/sheet_backend.gs'),'utf8'),backend);
function planHeaderExtension(snapshot){
  try{
    const result=JSON.parse(JSON.stringify(backend.vocabularySetSchemaPlanV1_(snapshot)));
    if(result.status==='PLAN_ONLY')result.runtime_safety='NOT_PROVEN';
    result.other_sheet_writes=0;
    return result;
  }catch(err){return {status:'CONFLICT',reason:err.vocabularyCode||'INVALID_SNAPSHOT',writes:[]};}
}
module.exports = { HEADERS, fingerprint, planHeaderExtension };
