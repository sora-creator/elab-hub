const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'outputs', 'vocab-final-3200');
const SOURCE_MASTER = path.join(DIR, 'ELAB_전체기출_어휘마스터DB_최종.xlsx');
const SOURCE_IMPORT = path.join(DIR, 'ELAB_운영용_정규어휘DB_3200.xlsx');
const OUT_MASTER = path.join(DIR, 'ELAB_전체기출_어휘마스터DB_최종_v2.xlsx');
const OUT_IMPORT = path.join(DIR, 'ELAB_운영용_정규어휘DB_3200_v2.xlsx');
const OUT_JSON = path.join(DIR, 'ELAB_정규어휘_3200_최종검증_v2.json');
const AUDIT_VERSION = 'REPRESENTATIVE_MEANING_AUDIT_V2';
const REVIEWED_AT = '2026-09-07T00:00:00+09:00';
const truth = value => value === true || String(value).toUpperCase() === 'TRUE';
const norm = value => String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true });

const merges = [
  ['extremely','SEN_527F10C4B9EF','SEN_6C416748E351','매우, 극도로'],
  ['pause','SEN_13BE39C71C81','SEN_C7AB4A17AD5A','잠시 멈추다'],
  ['chronic','SEN_51E57FFCC852','SEN_D8EEFEBBF9F8','만성적인'],
  ['coherent','SEN_AED5EC080C36','SEN_D191D68DA575','일관된, 앞뒤가 맞는'],
  ['disadvantage','SEN_BAC4F80FDE39','SEN_FAAFF4159805','단점, 불리한 점, 불이익'],
  ['discomfort','SEN_15CA79748700','SEN_DA1BF76A5CA6','불편함'],
  ['horizontal','SEN_4BE3325D3053','SEN_CDC36E94D9F2','수평의'],
  ['prey','SEN_396EBB49F78E','SEN_7F4DDEEA133F','먹잇감, 사냥감'],
  ['eagerly','SEN_CF83D5AA80BF','SEN_ED4227F033B5','간절히, 열렬히'],
  ['production','SEN_900AA6CF339C','SEN_EDB5F84E558C','생산, 제작'],
  ['debate','SEN_908786A828F6','SEN_970D379502BB','토론, 논쟁; 토론하다, 논쟁하다'],
  ['transport','SEN_4D45C56FFB23','SEN_F48423DCFDE1','운송, 수송; 운송하다, 수송하다'],
  ['visible','SEN_EDAD4640ABE1','SEN_8026EB8D5138','눈에 보이는, 가시적인'],
].map(([headword, canonical, merged, meaning]) => ({ headword, canonical, merged, meaning }));

const primaryOverrides = new Map([
  ...merges.map(x => [norm(x.headword), x.canonical]),
  ['sight','SEN_255CB719A908'],
  ['tie','SEN_1E29309D5982'],
  ['development','SEN_45E0E9FE6A8F'],
  ['radically','SEN_D61C71B6E0EB'],
]);
const representativeMeaningOverrides = new Map([
  ...merges.map(x => [x.canonical, x.meaning]),
  ['SEN_D61C71B6E0EB','근본적으로, 철저하게'],
]);
const retired = new Map([
  ['SEN_12817DE70147','대표 뜻 sight(시력) 복원에 따른 중복 학습 의미 retirement'],
  ['SEN_7D6ED6B83CB1','대표 뜻 tie(묶다) 복원에 따른 중복 학습 의미 retirement'],
  ['SEN_6D938E62C919','대표 뜻 development(개발) 복원에 따른 중복 학습 의미 retirement'],
]);
const restored = new Set(['SEN_255CB719A908','SEN_1E29309D5982','SEN_45E0E9FE6A8F']);

const master = XLSX.readFile(SOURCE_MASTER, { cellStyles: true, cellDates: true });
const originalOccurrenceRows = rows(master, 'VocabularyOccurrences');
const originalOccurrenceDigest = crypto.createHash('sha256').update(JSON.stringify(originalOccurrenceRows)).digest('hex');
let senses = rows(master, 'VocabularySenses_Final');
let bridge = rows(master, 'SenseOccurrenceBridge');
let history = rows(master, 'SenseMergeHistory');
let curriculum = rows(master, 'StudentCurriculum3200');
const oldSenseById = new Map(senses.map(x => [String(x.sense_id), { ...x }]));
const mergeByOld = new Map(merges.map(x => [x.merged, x]));

for (const merge of merges) {
  const canonical = oldSenseById.get(merge.canonical), merged = oldSenseById.get(merge.merged);
  if (!canonical || !merged) throw new Error(`Missing merge pair: ${merge.headword}`);
  if (String(canonical.vocab_id) !== String(merged.vocab_id)) throw new Error(`Cross-vocab merge blocked: ${merge.headword}`);
  if (norm(canonical.headword) !== norm(merge.headword) || norm(merged.headword) !== norm(merge.headword)) throw new Error(`Headword mismatch: ${merge.headword}`);
  history.push({
    merge_id: `MERGE_${AUDIT_VERSION}_${merge.merged}`,
    headword: merge.headword,
    canonical_sense_id: merge.canonical,
    merged_sense_id: merge.merged,
    canonical_meaning: merge.meaning,
    previous_meaning: merged.representative_meaning,
    ai_decision: 'SAME_APPROVED', confidence: 1,
    decision_reason: `교사 승인: 동일 vocab_id의 번역 표현 차이인 동일 의미군. ${merge.canonical}은 기존 primary${Number(canonical.occurrence_count_new) > Number(merged.occurrence_count_new) ? '이며 occurrence가 더 많아' : '이고 빈도 동률에서 핵심·기본 의미를 대표해'} canonical로 유지`,
    model: 'HUMAN_REVIEW', prompt_version: AUDIT_VERSION,
    reviewed_at: REVIEWED_AT, rollback_status: 'AVAILABLE',
    mapping_method: 'HUMAN_APPROVED_CANONICAL_MERGE', occurrence_id: '',
  });
}

bridge = bridge.map(row => {
  const merge = mergeByOld.get(String(row.canonical_sense_id));
  if (!merge) return { ...row };
  return { ...row, canonical_sense_id: merge.canonical, representative_meaning: merge.meaning,
    mapping_method: 'SENSE_MERGE_HISTORY_APPROVED_V2', mapping_confidence: 1, mapping_status: 'MAPPED' };
});
senses = senses.filter(row => !mergeByOld.has(String(row.sense_id))).map(row => ({ ...row }));
const senseById = new Map(senses.map(row => [String(row.sense_id), row]));
for (const [id, meaning] of representativeMeaningOverrides) {
  const row = senseById.get(id); if (!row) throw new Error(`Missing representative sense ${id}`); row.representative_meaning = meaning;
}

const statsBySense = new Map();
for (const row of bridge) {
  const id = String(row.canonical_sense_id), target = senseById.get(id);
  if (!target) throw new Error(`Bridge points to absent canonical sense ${id}`);
  if (String(row.vocab_id) !== String(target.vocab_id)) throw new Error(`Cross-vocab bridge ${row.occurrence_id}`);
  let s = statsBySense.get(id);
  if (!s) statsBySense.set(id, s = { occurrence: 0, sets: new Set(), years: new Set(), grades: new Set(), g1: 0, g2: 0, g3: 0, csat: 0, kice: new Set(), office: new Set(), csatSets: new Set() });
  s.occurrence++; if (row.set_id) s.sets.add(String(row.set_id)); if (row.administered_year) s.years.add(String(row.administered_year)); if (row.grade_scope) s.grades.add(String(row.grade_scope));
  if (row.grade_scope === '고1') s.g1++; else if (row.grade_scope === '고2') s.g2++; else if (row.grade_scope === '고3') s.g3++; else if (row.grade_scope === '수능') s.csat++;
  if (row.exam_provider === '평가원 모의평가' && row.set_id) s.kice.add(String(row.set_id)); else if (row.exam_provider === '교육청 모의고사' && row.set_id) s.office.add(String(row.set_id)); else if (row.exam_provider === '수능' && row.set_id) s.csatSets.add(String(row.set_id));
}
const headTotals = new Map();
for (const row of senses) { const s = statsBySense.get(String(row.sense_id)); if (s) headTotals.set(norm(row.headword), (headTotals.get(norm(row.headword)) || 0) + s.occurrence); }
for (const row of senses) {
  const s = statsBySense.get(String(row.sense_id)) || { occurrence: 0, sets: new Set(), years: new Set(), grades: new Set(), g1: 0, g2: 0, g3: 0, csat: 0, kice: new Set(), office: new Set(), csatSets: new Set() };
  row.occurrence_count = s.occurrence; row.occurrence_count_new = s.occurrence; row.mock_count = s.occurrence - s.csat; row.csat_count = s.csat; row.csat_count_new = s.csat;
  row.source_set_count = s.sets.size; row.year_count = s.years.size; row.grade_bucket_count = s.grades.size; row.g1_count = s.g1; row.g2_count = s.g2; row.g3_count = s.g3;
  row.kice_mock_set_count = s.kice.size; row.office_mock_set_count = s.office.size; row.csat_set_count = s.csatSets.size; row.headword_occurrence_count = headTotals.get(norm(row.headword)) || 0;
  row.sense_share = row.headword_occurrence_count ? s.occurrence / row.headword_occurrence_count : 0;
  if (representativeMeaningOverrides.has(String(row.sense_id))) row.representative_meaning = representativeMeaningOverrides.get(String(row.sense_id));
}

const groups = new Map();
for (const row of senses) { const key = norm(row.headword); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
const oldPrimaryByHead = new Map();
for (const row of oldSenseById.values()) if (truth(row.is_primary)) oldPrimaryByHead.set(norm(row.headword), String(row.sense_id));
for (const [headword, group] of groups) {
  let primaryId = primaryOverrides.get(headword) || oldPrimaryByHead.get(headword);
  if (mergeByOld.has(primaryId)) primaryId = mergeByOld.get(primaryId).canonical;
  if (!group.some(row => String(row.sense_id) === primaryId)) primaryId = [...group].sort((a,b) => Number(b.occurrence_count_new)-Number(a.occurrence_count_new) || Number(b.source_set_count)-Number(a.source_set_count) || String(a.sense_id).localeCompare(String(b.sense_id)))[0].sense_id;
  group.sort((a,b) => (String(a.sense_id)===primaryId?-1:String(b.sense_id)===primaryId?1:0) || Number(b.occurrence_count_new)-Number(a.occurrence_count_new) || Number(b.source_set_count)-Number(a.source_set_count) || String(a.sense_id).localeCompare(String(b.sense_id)));
  group.forEach((row,index) => {
    row.is_primary = index === 0; row.sense_rank = index + 1; row.sense_rank_score = index === 0 ? 0 : index === 1 ? 10 : index === 2 ? 18 : 25;
    row.primary_decision_basis = primaryOverrides.has(headword) ? 'HUMAN_APPROVED_CORE_MEANING>GENERAL_LEARNING_PRIORITY>VERSATILITY>EXAM_FREQUENCY_DIVERSITY>STABLE_ID' : 'PRESERVED_EXISTING_EDUCATIONAL_PRIMARY';
    row.primary_decision_version = AUDIT_VERSION; row.primary_decision_reviewed_at = REVIEWED_AT;
    row.learning_order_score = Number(row.first_stage_score||0)+Number(row.scarcity_score||0)+Number(row.sense_rank_score||0)+Number(row.meaning_nature_score||0)+Number(row.concentration_score||0)+Number(row.expression_complexity_score||0);
  });
}

const selectedIds = new Set(curriculum.map(row => mergeByOld.get(String(row.sense_id))?.canonical || String(row.sense_id)));
for (const id of retired.keys()) selectedIds.delete(id);
for (const id of restored) selectedIds.add(id);
selectedIds.add('SEN_D61C71B6E0EB'); selectedIds.delete('SEN_A11A9CE9572E');
if (selectedIds.size !== 3200) throw new Error(`Student selection count after replacements: ${selectedIds.size}`);
let selected = [...selectedIds].map(id => senseById.get(id));
if (selected.some(x => !x)) throw new Error('Selected ID missing from final senses');
const learnOrder = (a,b) => Number(a.learning_order_score)-Number(b.learning_order_score) || (truth(b.is_primary)?1:0)-(truth(a.is_primary)?1:0) || Number(a.first_stage_rank)-Number(b.first_stage_rank) || Number(b.source_set_count)-Number(a.source_set_count) || Number(b.year_count)-Number(a.year_count) || Number(b.csat_set_count)-Number(a.csat_set_count) || norm(a.headword).localeCompare(norm(b.headword),'en') || String(a.sense_id).localeCompare(String(b.sense_id),'en');
selected.sort(learnOrder);
const orderAudit = [];
for (const [headword, group] of groups) {
  const included = group.filter(row => selectedIds.has(String(row.sense_id))), primary = included.find(row => truth(row.is_primary));
  if (!primary || included.length < 2) continue;
  const primaryIndex = selected.indexOf(primary), firstAdditional = Math.min(...included.filter(row => row !== primary).map(row => selected.indexOf(row)));
  if (primaryIndex > firstAdditional) {
    selected.splice(primaryIndex,1); selected.splice(firstAdditional,0,primary);
    orderAudit.push({ headword, primary_sense_id: primary.sense_id, primary_meaning: primary.representative_meaning, order_before: primaryIndex+1, order_after: firstAdditional+1, reason: '대표 뜻을 같은 headword의 추가 뜻보다 앞에 배치' });
  }
}
const levelFor = index => index < 800 ? 'V1' : index < 1600 ? 'V2' : index < 2400 ? 'V3' : index < 3000 ? 'V4' : 'V5';
selected.forEach((row,index) => { row.final_learning_order=index+1; row.confirmed_level_final=levelFor(index); row.curriculum_active_final=true; row.archive_only_final=false; row.selection_reason_final=restored.has(row.sense_id)?'대표 기본 뜻 복원(HUMAN_APPROVED)':'최종 기출가치 상위 학생용 어휘'; row.level_reason=`전역 학습순서 ${index+1}위; learning_order_score=${row.learning_order_score}; ${truth(row.is_primary)?'대표 뜻':`추가 뜻 ${row.sense_rank}순위`}; primary_basis=${row.primary_decision_basis}`; });
const finalIds = new Set(selected.map(row => String(row.sense_id)));
for (const row of senses) { row.active_final=true; row.curriculum_active_final=finalIds.has(String(row.sense_id)); row.archive_only_final=!row.curriculum_active_final; row.confirmed_level_final=row.curriculum_active_final?selected.find(x=>x.sense_id===row.sense_id).confirmed_level_final:''; row.final_learning_order=row.curriculum_active_final?selected.find(x=>x.sense_id===row.sense_id).final_learning_order:''; if(retired.has(String(row.sense_id)))row.final_selection_reason=retired.get(String(row.sense_id)); else if(String(row.sense_id)==='SEN_A11A9CE9572E')row.final_selection_reason='radically의 독립 기본 의미로 채택하지 않아 학생용 제외'; else row.final_selection_reason=row.curriculum_active_final?(selected.find(x=>x.sense_id===row.sense_id).selection_reason_final||'학생용 선정'):(row.final_selection_reason||'archive 보존'); row.level_reason=row.curriculum_active_final?selected.find(x=>x.sense_id===row.sense_id).level_reason:''; }

const importRows = selected.map(row => ({ level:row.confirmed_level_final, word:row.headword, meaning:row.representative_meaning, vocab_id:row.vocab_id, sense_id:row.sense_id, item_type:row.item_type, sense_order:row.sense_order, importance_score:row.exam_value_score, occurrence_count:row.occurrence_count_new, active:true, curriculum_active:true, curriculum_level:row.confirmed_level_final, archive_only:false, selection_score:row.exam_value_score, selection_reason:row.selection_reason_final, recommended_level:row.confirmed_level_final, confirmed_level:row.confirmed_level_final, semantic_review_status:row.semantic_review_status||'' }));
const levels = Object.fromEntries(['V1','V2','V3','V4','V5'].map(level => [level, selected.filter(x=>x.confirmed_level_final===level).length]));
const occurrenceIds = bridge.map(x=>String(x.occurrence_id)), bridgeIds = new Set(occurrenceIds), duplicateOccurrences = occurrenceIds.length-bridgeIds.size;
const crossVocab = bridge.filter(row => String(row.vocab_id)!==String(senseById.get(String(row.canonical_sense_id))?.vocab_id)).length;
const missingPrimary = selected.filter(row => !truth(row.is_primary) && !selected.some(x=>norm(x.headword)===norm(row.headword)&&truth(x.is_primary))).length;
const primaryAfter = selected.filter(row => !truth(row.is_primary) && selected.findIndex(x=>norm(x.headword)===norm(row.headword)&&truth(x.is_primary))>selected.indexOf(row)).length;
const required = ['level','word','meaning','vocab_id','sense_id','item_type','sense_order','importance_score','occurrence_count','active','curriculum_active','curriculum_level','archive_only','selection_score','selection_reason','recommended_level','confirmed_level'];
const missingRequired = importRows.reduce((n,row)=>n+required.filter(k=>row[k]===null||row[k]===undefined||String(row[k]).trim()==='').length,0);
const duplicateSenseIds = importRows.length-new Set(importRows.map(x=>String(x.sense_id))).size;
const v1SingleAdditional = selected.filter(row=>row.confirmed_level_final==='V1'&&!truth(row.is_primary)&&Number(row.occurrence_count_new)===1).length;
const counts = { MOCK:bridge.filter(x=>x.grade_scope!=='수능').length, CSAT:bridge.filter(x=>x.grade_scope==='수능').length, G1:bridge.filter(x=>x.grade_scope==='고1').length, G2:bridge.filter(x=>x.grade_scope==='고2').length, G3:bridge.filter(x=>x.grade_scope==='고3').length };
const expected = { student_curriculum:3200,V1:800,V2:800,V3:800,V4:600,V5:200,sense_id_duplicates:0,required_missing:0,missing_primary:0,primary_after_additional:0,v1_single_additional:0,occurrences:23735,bridge_rows:23735,bridge_mapped:23735,unresolved:0,low_confidence:0,duplicate_occurrence_links:0,cross_vocab_links:0,MOCK:22259,CSAT:1476,G1:8140,G2:8248,G3:5871 };
const actual = { student_curriculum:selected.length,...levels,sense_id_duplicates:duplicateSenseIds,required_missing:missingRequired,missing_primary:missingPrimary,primary_after_additional:primaryAfter,v1_single_additional:v1SingleAdditional,occurrences:originalOccurrenceRows.length,bridge_rows:bridge.length,bridge_mapped:bridge.filter(x=>x.mapping_status==='MAPPED').length,unresolved:bridge.filter(x=>x.mapping_status==='UNRESOLVED').length,low_confidence:bridge.filter(x=>x.mapping_status==='LOW_CONFIDENCE').length,duplicate_occurrence_links:duplicateOccurrences,cross_vocab_links:crossVocab,...counts };
const validation = Object.keys(expected).map(metric=>({metric,actual:actual[metric],expected:expected[metric],status:actual[metric]===expected[metric]?'PASS':'FAIL'}));
const specialChecks = [
  ['radically_meaning',selected.find(x=>x.sense_id==='SEN_D61C71B6E0EB')?.representative_meaning,'근본적으로, 철저하게'],
  ['sight_order',selected.find(x=>x.sense_id==='SEN_255CB719A908')?.final_learning_order < selected.find(x=>x.sense_id==='SEN_6C2C6F95BE14')?.final_learning_order,true],
  ['tie_order',selected.find(x=>x.sense_id==='SEN_1E29309D5982')?.final_learning_order < selected.find(x=>x.sense_id==='SEN_281E55A43C4C')?.final_learning_order,true],
  ['development_order',selected.find(x=>x.sense_id==='SEN_45E0E9FE6A8F')?.final_learning_order < selected.find(x=>x.sense_id==='SEN_75EB476D727D')?.final_learning_order,true],
  ...[...retired.keys()].map(id=>[`retired_${id}`,finalIds.has(id),false]),
].map(([metric,value,want])=>({metric,actual:value,expected:want,status:value===want?'PASS':'FAIL'}));
validation.push(...specialChecks);
if (validation.some(x=>x.status==='FAIL')) throw new Error(`Validation failed: ${JSON.stringify(validation.filter(x=>x.status==='FAIL'))}`);

const mergeAudit = merges.map(m=>({ headword:m.headword, canonical_sense_id:m.canonical, merged_sense_id:m.merged, canonical_meaning:m.meaning, canonical_basis:history.find(x=>x.merge_id===`MERGE_${AUDIT_VERSION}_${m.merged}`).decision_reason, merged_occurrences_before:Number(oldSenseById.get(m.merged).occurrence_count_new), canonical_occurrences_before:Number(oldSenseById.get(m.canonical).occurrence_count_new), canonical_occurrences_after:Number(senseById.get(m.canonical).occurrence_count_new), rollback_status:'AVAILABLE' }));
const primaryAudit = [...groups.entries()].map(([headword,group])=>{const p=group.find(x=>truth(x.is_primary));return{headword,primary_sense_id:p?.sense_id||'',primary_meaning:p?.representative_meaning||'',decision_basis:p?.primary_decision_basis||'',review_version:AUDIT_VERSION,reviewed_at:REVIEWED_AT};});
const replacementAudit = [
  ...[...restored].map(id=>({action:'INCLUDE_PRIMARY',sense_id:id,headword:senseById.get(id).headword,meaning:senseById.get(id).representative_meaning,final_order:selected.find(x=>x.sense_id===id).final_learning_order,final_level:selected.find(x=>x.sense_id===id).confirmed_level_final,reason:'기본·대표 뜻을 학생용에 복원'})),
  ...[...retired].map(([id,reason])=>({action:'ARCHIVE_DUPLICATE',sense_id:id,headword:senseById.get(id).headword,meaning:senseById.get(id).representative_meaning,final_order:'',final_level:'',reason})),
  {action:'PRIMARY_CORRECTION',sense_id:'SEN_D61C71B6E0EB',headword:'radically',meaning:'근본적으로, 철저하게',final_order:selected.find(x=>x.sense_id==='SEN_D61C71B6E0EB').final_learning_order,final_level:selected.find(x=>x.sense_id==='SEN_D61C71B6E0EB').confirmed_level_final,reason:'핵심·기본 의미로 primary 확정'},
  {action:'ARCHIVE_NON_PRIMARY',sense_id:'SEN_A11A9CE9572E',headword:'radically',meaning:'급격하게',final_order:'',final_level:'',reason:'독립 기본 의미로 채택하지 않음'},
];

function replaceSheet(wb,name,data){const index=wb.SheetNames.indexOf(name);const ws=XLSX.utils.json_to_sheet(data.length?data:[{status:'NONE'}]);ws['!autofilter']={ref:ws['!ref']};ws['!cols']=Object.keys(data[0]||{status:''}).map(k=>({wch:Math.min(55,Math.max(12,k.length+2))}));if(index<0){XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));}else wb.Sheets[name]=ws;}
replaceSheet(master,'VocabularySenses_Final',senses); replaceSheet(master,'SenseOccurrenceBridge',bridge); replaceSheet(master,'SenseMergeHistory',history); replaceSheet(master,'StudentCurriculum3200',selected);
for(const level of ['V1','V2','V3','V4','V5'])replaceSheet(master,level,selected.filter(x=>x.confirmed_level_final===level));
replaceSheet(master,'PrimaryOrderAudit',orderAudit); replaceSheet(master,'RepresentativeMeaningAuditV2',mergeAudit); replaceSheet(master,'PrimaryDecisionAudit',primaryAudit); replaceSheet(master,'CurriculumReplacementAuditV2',replacementAudit); replaceSheet(master,'ValidationV2',validation);
XLSX.writeFile(master,OUT_MASTER,{compression:true,cellStyles:true});

const operational=XLSX.utils.book_new();
replaceSheet(operational,'README',[{item:'용도',value:'ELAB 운영 staging용 정규 어휘 3,200개 — v2 대표 뜻 감사 반영본'},{item:'운영 상태',value:'로컬 검토본. staging/commit 미실행'},{item:'레벨',value:'V1 800 / V2 800 / V3 800 / V4 600 / V5 200'}]);
replaceSheet(operational,'ELAB_Import',importRows);for(const level of ['V1','V2','V3','V4','V5'])replaceSheet(operational,level,importRows.filter(x=>x.confirmed_level===level));replaceSheet(operational,'Validation',validation);replaceSheet(operational,'RepresentativeMeaningAuditV2',mergeAudit);replaceSheet(operational,'PrimaryDecisionAudit',primaryAudit.filter(x=>primaryOverrides.has(x.headword)));replaceSheet(operational,'CurriculumReplacementAuditV2',replacementAudit);XLSX.writeFile(operational,OUT_IMPORT,{compression:true});

const reopenedMaster=XLSX.readFile(OUT_MASTER),reopenedImport=XLSX.readFile(OUT_IMPORT),reopenedOccurrences=rows(reopenedMaster,'VocabularyOccurrences'),reopenedBridge=rows(reopenedMaster,'SenseOccurrenceBridge'),reopenedImportRows=rows(reopenedImport,'ELAB_Import');
const reopenedOccurrenceDigest=crypto.createHash('sha256').update(JSON.stringify(reopenedOccurrences)).digest('hex');
if(reopenedOccurrenceDigest!==originalOccurrenceDigest||reopenedOccurrences.length!==23735)throw new Error('VocabularyOccurrences changed');
if(reopenedBridge.length!==23735||reopenedImportRows.length!==3200)throw new Error('Reopen row count failed');
const report={audit_version:AUDIT_VERSION,source_sha256:{master:sha256(SOURCE_MASTER),operational:sha256(SOURCE_IMPORT)},output_sha256:{master:sha256(OUT_MASTER),operational:sha256(OUT_IMPORT)},canonical_senses_before:oldSenseById.size,canonical_senses_after:senses.length,merge_count:merges.length,merge_mapping:mergeAudit,curriculum:{total:selected.length,levels},replacement_audit:replacementAudit,primary_order_corrections:orderAudit,validation,occurrence_content_digest_preserved:reopenedOccurrenceDigest===originalOccurrenceDigest,reopen_verification:{master_sheets:reopenedMaster.SheetNames,operational_sheets:reopenedImport.SheetNames,occurrences:reopenedOccurrences.length,bridge:reopenedBridge.length,import_rows:reopenedImportRows.length},staging_changed:false,vocabularydb_commit:false,apps_script_deployed:false};
fs.writeFileSync(OUT_JSON,JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify({outputs:[OUT_MASTER,OUT_IMPORT,OUT_JSON],summary:{canonical_before:oldSenseById.size,canonical_after:senses.length,levels,validation_failures:validation.filter(x=>x.status==='FAIL').length,order_corrections:orderAudit.length,hashes:report.output_sha256}},null,2));
