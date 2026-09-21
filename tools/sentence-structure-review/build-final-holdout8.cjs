const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');

const root=path.resolve(__dirname,'../..');
const outDir=path.join(root,'output','sentence-structure-final-holdout');
const selectedSnapshot=path.join(outDir,'CURRENT_PIPELINE_SELECTED_8.json');
const source=process.argv[2]||(fs.existsSync(selectedSnapshot)?selectedSnapshot:path.join(os.tmpdir(),'elab-final-holdout-mining','shadow-annotations.json'));
const pdfLibraryRoot=path.resolve(process.env.ELAB_EBSI_PDF_ROOT||path.join(root,'..','..','..','EBSi_영어기출_2021-2026'));
const ids=['corpus:58378','corpus:60837','corpus:23009','corpus:2590','corpus:24339','corpus:23568','corpus:24238','corpus:26675'];
const pageById={'corpus:58378':3,'corpus:60837':3,'corpus:23009':8,'corpus:2590':7,'corpus:24339':2,'corpus:23568':7,'corpus:24238':3,'corpus:26675':2};
const pdfById={
  'corpus:58378':path.join(pdfLibraryRoot,'고1','2023','09월_고1_학평_인천','2023_고1_09월_학평_인천_영어_문제.pdf'),
  'corpus:60837':path.join(pdfLibraryRoot,'고1','2024','10월_고1_학평_경기','2024_고1_10월_학평_경기_영어_문제.pdf'),
  'corpus:23009':path.join(pdfLibraryRoot,'고2','2021','11월_고2_학평_경기','2021_고2_11월_학평_경기_영어_문제.pdf'),
  'corpus:2590':path.join(pdfLibraryRoot,'고2','2025','09월_고2_학평_인천','2025_고2_09월_학평_인천_영어_문제.pdf'),
  'corpus:24339':path.join(pdfLibraryRoot,'고2','2025','10월_고2_학평_경기','2025_고2_10월_학평_경기_영어_문제.pdf'),
  'corpus:23568':path.join(pdfLibraryRoot,'고2','2022','09월_고2_학평_인천','2022_고2_09월_학평_인천_영어_문제.pdf'),
  'corpus:24238':path.join(pdfLibraryRoot,'고2','2024','09월_고2_학평_인천','2024_고2_09월_학평_인천_영어_문제.pdf'),
  'corpus:26675':path.join(pdfLibraryRoot,'고3','2024','10월_고3_학평_서울','2024_고3_10월_학평_서울_영어_문제.pdf')
};
const raw=JSON.parse(fs.readFileSync(source,'utf8'));
const rows=raw.sentences||raw;
const byId=new Map(rows.map(row=>[row.sentence_id,row]));
const levels={'corpus:58378':'S3','corpus:60837':'S3','corpus:23009':'S2','corpus:2590':'S2','corpus:24339':'S3','corpus:23568':'S4','corpus:24238':'S2','corpus:26675':'S3'};
const sourceMarkerMigration={
  version:1,
  dataset_id:'final-holdout8',
  old_fingerprint:'PUBLIC_IDENTIFIER_REMOVED',
  sentence_id:'corpus:2590',
  old_text:'They wanted to get rich quick and blow their money on fast cars and expensive champagne. ( ② )',
  new_text:'They wanted to get rich quick and blow their money on fast cars and expensive champagne.',
  removed_ui_token_indexes:[16,17,18],
  removed_parser_token_indexes:[17,18,19],
  pdf_page:7,
  question_no:'38번',
  reason:'PDF_SENTENCE_INSERTION_POSITION_MARKER'
};
const contextKeys=['MULTIPLE_NONFINITE','LONG_SUBJECT_VERB_DISTANCE','NESTED_CLAUSE','MULTIPLE_CLAUSES','PARTICIPLE_MODIFIER','RELATIVE_INSIDE_CLAUSE','THAT_CLAUSE','COORDINATION','PASSIVE','LONG_NP','PARENTHETICAL'];
const uiForParser=(row,index)=>row.parser_to_ui_mapping.find(x=>x.parser_token_index===index)?.ui_token_index;
function removeApprovedSourceMarker(row){
  if(row.sentence_id!==sourceMarkerMigration.sentence_id)return row;
  if(row.text!==sourceMarkerMigration.old_text)throw Error('Approved corpus:2590 source-marker text no longer matches the exact migration contract.');
  const cleanLength=sourceMarkerMigration.new_text.length,oldUiCount=row.tokens.length,oldParserCount=row.parser_tokens.length;
  const tokens=row.tokens.filter(t=>t.char_end<=cleanLength),parser_tokens=row.parser_tokens.filter(t=>t.end<=cleanLength);
  if(JSON.stringify(row.tokens.slice(tokens.length).map(t=>t.index))!==JSON.stringify(sourceMarkerMigration.removed_ui_token_indexes)||JSON.stringify(row.parser_tokens.slice(parser_tokens.length).map(t=>t.i))!==JSON.stringify(sourceMarkerMigration.removed_parser_token_indexes))throw Error('corpus:2590 marker token suffix differs from the approved migration contract.');
  if(tokens.some((t,i)=>t.index!==i)||parser_tokens.some((t,i)=>t.i!==i))throw Error('corpus:2590 meaningful token indexes are not stable before the source marker.');
  const parserSet=new Set(parser_tokens.map(t=>t.i)),uiSet=new Set(tokens.map(t=>t.index));
  const parser_to_ui_mapping=row.parser_to_ui_mapping.filter(x=>parserSet.has(x.parser_token_index)&&uiSet.has(x.ui_token_index));
  const clauses=row.clauses.map(c=>{
    if(c.start_token>=tokens.length)throw Error('corpus:2590 clause begins inside the removed source marker.');
    if(c.end_token>tokens.length&&c.end_token!==oldUiCount)throw Error('corpus:2590 clause boundary overlaps the source marker unexpectedly.');
    const referenced=[...(c.subject_core_token_indexes||[]),...(c.student_verb_token_indexes||[]),...(c.finite_carrier_token_indexes||[]),...(c.marker_token_indexes||[])];
    for(const p of c.predicate_groups||[])for(const value of Object.values(p))if(Number.isInteger(value))referenced.push(value);
    if(referenced.some(i=>i>=tokens.length))throw Error('corpus:2590 canonical clause/predicate span references the source marker.');
    return {...c,end_token:Math.min(c.end_token,tokens.length)};
  });
  if(oldUiCount!==19||oldParserCount!==20||tokens.length!==16||parser_tokens.length!==17)throw Error('corpus:2590 token counts differ from the approved suffix-only migration.');
  return {...row,text:sourceMarkerMigration.new_text,tokens,parser_tokens,parser_to_ui_mapping,clauses,source_artifact_correction:{...sourceMarkerMigration,old_fingerprint:undefined}};
}
function enrich(row){
  const tokens=row.tokens.map(token=>({...token,parser_token_indexes:row.parser_to_ui_mapping.filter(x=>x.ui_token_index===token.index).map(x=>x.parser_token_index),is_finite_carrier:row.clauses.some(c=>c.finite_carrier_token_indexes.includes(token.index)),student_verb_for_clauses:row.clauses.filter(c=>c.student_verb_token_indexes.includes(token.index)).map(c=>c.clause_id),teacher_verified:false}));
  const clauseById=new Map(row.clauses.map(c=>[c.clause_id,c]));
  const depth=c=>c.parent_clause_id&&clauseById.has(c.parent_clause_id)?1+depth(clauseById.get(c.parent_clause_id)):0;
  const clauses=row.clauses.map(c=>{
    const local=[...Array(c.end_token-c.start_token)].map((_,i)=>i+c.start_token);
    const marker=c.marker_token_indexes||[];
    return {...c,depth:depth(c),char_start:tokens[c.start_token]?.char_start??0,char_end:tokens[c.end_token-1]?.char_end??row.text.length,span_convention:'INCLUSIVE_CHILDREN_HALF_OPEN',parser_subject_candidate:(c.parser_clause_evidence||[]).map(x=>x.subject_ui_indexes||[]),parser_verb_candidate:(c.parser_clause_evidence||[]).map(x=>x.verb_chain_ui_indexes||[]),parser_alignment_status:(c.parser_clause_evidence||[]).length?'MATCHED_HEAD_OR_CARRIER':'NO_MATCH_MANUAL_REVIEW',marker_form:c.clause_type==='MAIN'?null:marker.length?'OVERT':'ZERO',teacher_verified:false,annotation_origin:'CURRENT_PIPELINE_HOLDOUT_CANDIDATE',local_token_indexes:local,possible_wrong_token_selections:[],host_nonfinite_head_ui_index:null,host_relation_review_required:false};
  });
  const nonfinite=tokens.filter(t=>['TO_INFINITIVE','BARE_INFINITIVE','PRESENT_PARTICIPLE','PAST_PARTICIPLE','GERUND'].includes(t.verb_role)&&!t.student_verb_for_clauses.length).map(t=>t.index);
  const context=Object.fromEntries(contextKeys.map(k=>[k,false]));
  context.MULTIPLE_NONFINITE=nonfinite.length>=2;context.MULTIPLE_CLAUSES=clauses.length>1;context.NESTED_CLAUSE=Math.max(0,...clauses.map(c=>c.depth))>=2;context.PARTICIPLE_MODIFIER=tokens.some(t=>['PRESENT_PARTICIPLE','PAST_PARTICIPLE'].includes(t.verb_role)&&!t.student_verb_for_clauses.length);context.RELATIVE_INSIDE_CLAUSE=clauses.some(c=>c.clause_type==='RELATIVE');context.THAT_CLAUSE=clauses.some(c=>c.clause_type==='NOUN_THAT');context.COORDINATION=row.parser_tokens.some(t=>t.dep==='cc');context.PASSIVE=row.parser_tokens.some(t=>t.dep==='auxpass');
  const skills=['MAIN_SUBJECT','MAIN_VERB'];if(clauses.length>1)skills.push('CLAUSE_BOUNDARY','SUBCLAUSE_SUBJECT','SUBCLAUSE_VERB');if(nonfinite.length||tokens.some(t=>['AUXILIARY','PRESENT_PARTICIPLE','PAST_PARTICIPLE'].includes(t.verb_role)))skills.push('MODIFIER_BOUNDARY','FINITE_VS_NONFINITE');if(clauses.some(c=>c.clause_type.startsWith('NOUN_')))skills.push('NOUN_CLAUSE');if(clauses.some(c=>c.clause_type==='NOUN_THAT'))skills.push('THAT_CLAUSE');if(clauses.some(c=>c.clause_type==='RELATIVE'))skills.push('RELATIVE_CLAUSE');if(clauses.some(c=>c.clause_type==='ADVERBIAL'))skills.push('ADVERB_CLAUSE');if(levels[row.sentence_id]==='S4'||levels[row.sentence_id]==='S5')skills.push('INTEGRATED');
  const source={exam_id:row.exam_id,year:row.year,month:row.month,grade:row.grade,question_no:row.question_no,question_type:row.question_type,sentence_index:row.sentence_index,source_file:row.source_file,institution_from_filename:row.month===99?'CSAT':row.source_file.includes('평가원')?'EVALUATION_INSTITUTE':'EDUCATION_OFFICE',metadata_verified_against_pdf:true};
  const complexity={token_count:tokens.length,finite_verb_count:clauses.reduce((n,c)=>n+c.predicate_groups.length,0),clause_count:clauses.length,max_clause_depth:Math.max(0,...clauses.map(c=>c.depth)),subject_mainverb_distance:0,nonfinite_count:nonfinite.length,participle_count:tokens.filter(t=>['PRESENT_PARTICIPLE','PAST_PARTICIPLE'].includes(t.verb_role)).length,relative_clause_count:clauses.filter(c=>c.clause_type==='RELATIVE').length,noun_clause_count:clauses.filter(c=>c.clause_type.startsWith('NOUN_')||c.clause_type==='APPOSITIVE_CONTENT').length,adverb_clause_count:clauses.filter(c=>c.clause_type==='ADVERBIAL').length,that_clause_count:clauses.filter(c=>c.clause_type==='NOUN_THAT').length,coordination_count:row.parser_tokens.filter(t=>t.dep==='cc').length};
  const markerCorrected=!!row.source_artifact_correction;
  return {sentence_id:row.sentence_id,legacy_db_id:row.id,text:row.text,text_sha256:crypto.createHash('sha256').update(row.text).digest('hex'),source,source_evidence:[{pdf_path:pdfById[row.sentence_id],page:pageById[row.sentence_id],PUBLIC_IDENTIFIER_REMOVED:true,question_heading_same_page:true,match_method:markerCorrected?'PUBLIC_IDENTIFIER_REMOVED':'WHITESPACE_NORMALIZED_EXACT',method:'FULL_CORPUS_MINING_VERIFIED_PDF_PAGE',pdf_visual_reviewed:false,source_artifact_correction:row.source_artifact_correction||null}],tokenization_version:'legacy-whitespace-v1',annotation_revision:'final-holdout8-current-pipeline-v1',answer_policy_version:'core-head-predicate-head-proposal-v1',tokens,parser_tokens:row.parser_tokens,parser_to_ui_mapping:row.parser_to_ui_mapping.map(x=>({...x,char_start:row.parser_tokens.find(t=>t.i===x.parser_token_index)?.start,char_end:row.parser_tokens.find(t=>t.i===x.parser_token_index)?.end,match:'EXACT_SUBSPAN'})),parser_model:'en_core_web_sm 3.8.0 / spaCy 3.8.16',clauses,skills:[...new Set(skills)],context_features:context,complexity,nonfinite_head_ui_indexes:nonfinite,auto_level_candidate:levels[row.sentence_id],auto_level_input:'current full-corpus pipeline holdout output',raw_parser_level_candidate:levels[row.sentence_id],teacher_level_candidate:levels[row.sentence_id],teacher_level_candidate_origin:'CURRENT_PIPELINE_CANDIDATE',level_confidence:'UNCALIBRATED',level_reason:'Current pipeline candidate; teacher holdout review required.',complexity_score:0,s5_burden_families:{multiple_nonfinite:context.MULTIPLE_NONFINITE,long_main_sv_gap:false,multiple_coordination:complexity.coordination_count>=2,parenthetical_parataxis:false,surface_structure_disruption:false,three_subordinate_type_families:false},review_flags:[],possible_error_types:[],review:{source_text:'SOURCE_TEXT_OK',corpus_text_exact:true,source_text_scope:markerCorrected?'verified original PDF page; insertion-position marker excluded; clean sentence exact':'verified original PDF page + whitespace-normalized exact sentence',token_alignment:'PASS',clause_annotation:'REVIEW_REQUIRED',teacher_level:null,confirmed_level:null,teacher_verified:false,teacher_review_required:true,pilot_status:'HOLDOUT_READY',publish_allowed:false},engine:{main_sv_representable:true,subclause_sv_representable:clauses.length>1?true:null,new_engine_required:false,scope:'index set representation only; teacher holdout review required'},student_observations:[]};
}
const oldRecordTexts=ids.map(id=>{const row=byId.get(id);if(!row)throw Error('Missing current-pipeline row: '+id);return row.text;});
const records=ids.map(id=>enrich(removeApprovedSourceMarker(byId.get(id))));
const payload={dataset_id:'final-holdout8',dataset_version:'1',expected_record_count:8,record_ids:ids,record_texts:records.map(x=>x.text),records};
const canonical=JSON.stringify(payload);
const fingerprint=crypto.createHash('sha256').update(canonical).digest('hex');
const bundle={...payload,fingerprint,fingerprint_method:'CANONICAL_DATASET_PAYLOAD_SHA256',canonical_payload:canonical,input_path:'output/sentence-structure-final-holdout/FINAL_HOLDOUT_8_ANNOTATIONS.json',source_marker_migration:{...sourceMarkerMigration,record_ids:ids,old_record_texts:oldRecordTexts,new_record_texts:records.map(x=>x.text),new_fingerprint:fingerprint}};
fs.mkdirSync(outDir,{recursive:true});
if(path.resolve(source)!==path.resolve(selectedSnapshot))fs.writeFileSync(selectedSnapshot,JSON.stringify(ids.map(id=>byId.get(id)),null,2)+'\n');
fs.writeFileSync(path.join(outDir,'FINAL_HOLDOUT_8_ANNOTATIONS.json'),JSON.stringify({...payload,fingerprint,fingerprint_method:bundle.fingerprint_method},null,2)+'\n');
fs.mkdirSync(path.join(root,'output','sentence-structure-review'),{recursive:true});
fs.writeFileSync(path.join(root,'output','sentence-structure-review','final-holdout8-data.js'),'window.ELAB_FINAL_HOLDOUT8_INPUT = '+JSON.stringify(bundle)+';\n');
console.log(JSON.stringify({records:records.length,ids,fingerprint},null,2));
