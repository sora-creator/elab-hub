const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const ids=['corpus:2970','corpus:25018','corpus:2449','corpus:2590','corpus:2479','corpus:58378','corpus:26237','corpus:2501','corpus:23568','corpus:2581','corpus:2480','corpus:59087'];
function arg(name){const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];}
const pilotPath=arg('--pilot'),holdoutPath=arg('--holdout');
if(!pilotPath||!holdoutPath)throw Error('Usage: node build-pilot12.cjs --pilot <Gold34 export> --holdout <Final8 export>');
const pilot=JSON.parse(fs.readFileSync(path.resolve(pilotPath),'utf8'));
const holdout=JSON.parse(fs.readFileSync(path.resolve(holdoutPath),'utf8'));
const all=[...pilot.records,...holdout.records];
function pick(id){
  const row=all.find(x=>x.sentence_id===id);if(!row)throw Error(`${id}: missing`);
  if(!row.teacher?.gold_approved||!row.teacher?.teacher_source_confirmed)throw Error(`${id}: Gold/source not confirmed`);
  const tokens=row.teacher.teacher_tokens.map(({index,text,char_start,char_end})=>({index,text,char_start,char_end}));
  return {sentence_id:id,text:row.teacher.teacher_corrected_text||row.auto.text,level:row.teacher.teacher_level,source:row.auto.source,source_provenance:row.teacher.teacher_source_pdf,tokens,parser_tokens:row.auto.parser_tokens,parser_to_ui_mapping:row.auto.parser_to_ui_mapping,auto_clauses:row.auto.clauses,scaffold:{teacher_subject_spans:row.teacher.teacher_clauses.map(c=>({clause_id:c.clause_id,token_indexes:c.teacher_primary_subject_span})),teacher_verb_spans:row.teacher.teacher_clauses.flatMap(c=>c.teacher_predicates.map(p=>({clause_id:c.clause_id,predicate_id:p.predicate_id,token_indexes:p.teacher_student_verb_span_indexes})))}};
}
const records=ids.map(pick);
if(records.find(x=>x.sentence_id==='corpus:2590').text.includes('②'))throw Error('corpus:2590 source marker remains');
const canonical={dataset_id:'chunking-pilot12',dataset_version:'1',expected_record_count:12,record_ids:ids,records};
const canonical_payload=JSON.stringify(canonical),fingerprint=crypto.createHash('sha256').update(canonical_payload).digest('hex');
const bundle={...canonical,fingerprint,fingerprint_method:'CANONICAL_DATASET_PAYLOAD_SHA256',canonical_payload,created_at:new Date().toISOString(),input_provenance:{pilot_fingerprint:pilot.dataset_fingerprint||pilot.input_fingerprint,holdout_fingerprint:holdout.dataset_fingerprint||holdout.input_fingerprint}};
const out=path.join(root,'output','sentence-chunking-v1-review');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'CHUNKING_PILOT12_DATA.json'),JSON.stringify(bundle,null,2)+'\n');
fs.writeFileSync(path.join(out,'CHUNKING_PILOT12_DATA.js'),'window.ELAB_CHUNKING_PILOT12='+JSON.stringify(bundle)+';\n');
console.log(JSON.stringify({records:records.length,ids:records.map(x=>x.sentence_id),levels:Object.fromEntries(['S1','S2','S3','S4','S5'].map(l=>[l,records.filter(x=>x.level===l).length])),fingerprint},null,2));
