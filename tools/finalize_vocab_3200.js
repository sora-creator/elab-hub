const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const RECALC = path.join(ROOT, 'outputs', 'vocab-final-recalculation', 'ELAB_학생용어휘_최종재계산_검토본.xlsx');
const BRIDGE = path.join(ROOT, 'outputs', 'sense-occurrence-bridge-final', 'ELAB_SenseOccurrenceBridge_최종검증본.xlsx');
const LEGACY_MASTER = path.join(ROOT, 'outputs', 'vocab-operational-split', 'ELAB_전체기출_어휘마스터DB.xlsx');
const OUT = path.join(ROOT, 'outputs', 'vocab-final-3200');
const MASTER_OUT = path.join(OUT, 'ELAB_전체기출_어휘마스터DB_최종.xlsx');
const IMPORT_OUT = path.join(OUT, 'ELAB_운영용_정규어휘DB_3200.xlsx');

const R = XLSX.readFile(RECALC);
const B = XLSX.readFile(BRIDGE);
const L = XLSX.readFile(LEGACY_MASTER);
const rows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
const features = rows(R, 'FinalSenseFeatures');
const candidate3200 = rows(R, 'Candidate3200');
const candidate3400 = rows(R, 'Candidate3400');
const bridge = rows(B, 'SenseOccurrenceBridge');
const senses = rows(B, 'VocabularySenses_Final');
const mergeHistory = rows(B, 'SenseMergeHistory_Final');
const occurrences = rows(L, 'VocabularyOccurrences');
const norm = value => String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const truth = value => String(value).toUpperCase() === 'TRUE' || value === true;

if (features.length !== 13326 || senses.length !== 13326) throw new Error('Canonical sense count mismatch');
if (bridge.length !== 23735 || occurrences.length !== 23735) throw new Error('Occurrence/Bridge count mismatch');
if (bridge.some(row => !row.canonical_sense_id || row.mapping_status !== 'MAPPED')) throw new Error('Bridge quality gate failed');

const featureById = new Map(features.map(row => [row.sense_id, { ...row }]));
let selected = candidate3200.map(row => featureById.get(row.sense_id));
const selectedIds = new Set(selected.map(row => row.sense_id));
const generalAcademicIds = new Set(['SEN_055A72A06EE1', 'SEN_34D8D9C7DAA6']);
const classificationCorrections = selected.filter(row => generalAcademicIds.has(row.sense_id));
if (classificationCorrections.length !== 2) throw new Error(`Expected molecule/cell in original top 3200, found ${classificationCorrections.length}`);
for (const row of selected) {
  row.educational_classification_final = generalAcademicIds.has(row.sense_id)
    ? 'GENERAL_ACADEMIC'
    : Number(row.penalty_proper || 0) < 0 ? 'HIGHLY_SPECIALIZED'
    : 'GENERAL_OR_REUSABLE';
}
if (selected.length !== 3200 || selectedIds.size !== 3200) throw new Error('Original top-3200 selection count/uniqueness failed');

const learnOrder = (a, b) => Number(a.learning_order_score) - Number(b.learning_order_score)
  || (truth(b.is_primary) ? 1 : 0) - (truth(a.is_primary) ? 1 : 0)
  || Number(a.first_stage_rank) - Number(b.first_stage_rank)
  || Number(b.source_set_count) - Number(a.source_set_count)
  || Number(b.year_count) - Number(a.year_count)
  || Number(b.csat_set_count) - Number(a.csat_set_count)
  || norm(a.headword).localeCompare(norm(b.headword), 'en')
  || String(a.sense_id).localeCompare(String(b.sense_id), 'en');
selected.sort(learnOrder);

const orderBefore = new Map(selected.map((row, index) => [row.sense_id, index + 1]));
const headGroups = new Map();
for (const row of selected) {
  const key = norm(row.headword);
  if (!headGroups.has(key)) headGroups.set(key, []);
  headGroups.get(key).push(row);
}
const orderAudit = [];
for (const group of headGroups.values()) {
  const primary = group.find(row => truth(row.is_primary));
  if (!primary) continue;
  const primaryIndex = selected.findIndex(row => row.sense_id === primary.sense_id);
  const earlierAdditional = group
    .filter(row => !truth(row.is_primary))
    .map(row => ({ row, index: selected.findIndex(x => x.sense_id === row.sense_id) }))
    .filter(entry => entry.index < primaryIndex)
    .sort((a, b) => a.index - b.index);
  for (const entry of earlierAdditional) {
    const currentPrimaryIndex = selected.findIndex(row => row.sense_id === primary.sense_id);
    const currentAdditionalIndex = selected.findIndex(row => row.sense_id === entry.row.sense_id);
    if (currentAdditionalIndex >= currentPrimaryIndex) continue;
    [selected[currentAdditionalIndex], selected[currentPrimaryIndex]] = [selected[currentPrimaryIndex], selected[currentAdditionalIndex]];
    orderAudit.push({
      headword: primary.headword,
      primary_sense_id: primary.sense_id,
      primary_meaning: primary.representative_meaning,
      additional_sense_id: entry.row.sense_id,
      additional_meaning: entry.row.representative_meaning,
      primary_order_before: orderBefore.get(primary.sense_id),
      additional_order_before: orderBefore.get(entry.row.sense_id),
      correction: '대표 뜻과 선행 추가 뜻의 learning_order 교환',
    });
  }
}

const levelFor = index => index < 800 ? 'V1' : index < 1600 ? 'V2' : index < 2400 ? 'V3' : index < 3000 ? 'V4' : 'V5';
selected.forEach((row, index) => {
  row.final_learning_order = index + 1;
  row.confirmed_level_final = levelFor(index);
  row.curriculum_active_final = true;
  row.archive_only_final = false;
  row.selection_reason_final = generalAcademicIds.has(row.sense_id)
    ? '여러 수능 과학·학술 지문에서 재사용 가능한 GENERAL_ACADEMIC 어휘로 복원'
    : '최종 기출가치 상위 3,200개';
  row.level_reason = `전역 학습순서 ${index + 1}위; learning_order_score=${row.learning_order_score}; ${row.is_primary ? '대표 뜻' : `추가 뜻 ${row.sense_rank}순위`}; 최초 출현=${row.first_stage}; source_set=${row.source_set_count}`;
});

const orderAfter = new Map(selected.map(row => [row.sense_id, row.final_learning_order]));
for (const audit of orderAudit) {
  audit.primary_order_after = orderAfter.get(audit.primary_sense_id);
  audit.additional_order_after = orderAfter.get(audit.additional_sense_id);
  audit.primary_level_before = levelFor(audit.primary_order_before - 1);
  audit.additional_level_before = levelFor(audit.additional_order_before - 1);
  audit.primary_level_after = levelFor(audit.primary_order_after - 1);
  audit.additional_level_after = levelFor(audit.additional_order_after - 1);
}

const finalIds = new Set(selected.map(row => row.sense_id));
const excludedTie200 = candidate3400
  .filter(row => !finalIds.has(row.sense_id))
  .map(row => ({ ...row, retirement_status: 'MASTER_ONLY', exclusion_reason: '3,200 확정에 따른 동점 경계 retirement' }));
if (excludedTie200.length !== 200) throw new Error(`Expected exactly 200 retired rows, found ${excludedTie200.length}`);

const retiredByCorrection = new Set(['SEN_92856B25C480', 'SEN_92F15368A250']);
const domainAudit = classificationCorrections.map((row, index) => {
  const retired = candidate3400.find(item => item.sense_id === [...retiredByCorrection][index]);
  return {
    restored_sense_id: row.sense_id,
    restored_word: row.headword,
    restored_meaning: row.representative_meaning,
    exam_value_rank: row.exam_value_rank,
    exam_value_score: row.exam_value_score,
    previous_classification: 'DOMAIN_LIMITED',
    corrected_classification: 'GENERAL_ACADEMIC',
    correction_reason: '과학·학술 분야에 속하지만 여러 수능 지문에서 재사용 가능한 일반 학술어이므로 학생용 포함 가능',
    curriculum_active: true,
    archive_only: false,
    retired_sense_id: retired.sense_id,
    retired_word: retired.headword,
    retired_meaning: retired.representative_meaning,
    retired_reason: '3,200 확정 경계 밖 항목으로 원상 복귀; 전체 마스터에만 보존',
  };
});

const masterSenses = features.map(source => {
  const selectedRow = finalIds.has(source.sense_id) ? selected.find(row => row.sense_id === source.sense_id) : null;
  const retired = excludedTie200.some(row => row.sense_id === source.sense_id);
  return {
    ...source,
    active_final: true,
    curriculum_active_final: !!selectedRow,
    archive_only_final: !selectedRow,
    confirmed_level_final: selectedRow ? selectedRow.confirmed_level_final : '',
    final_learning_order: selectedRow ? selectedRow.final_learning_order : '',
    educational_classification_final: generalAcademicIds.has(source.sense_id) ? 'GENERAL_ACADEMIC' : Number(source.penalty_proper || 0) < 0 ? 'HIGHLY_SPECIALIZED' : 'GENERAL_OR_REUSABLE',
    final_selection_reason: selectedRow ? selectedRow.selection_reason_final : retired ? '3,200 확정에 따른 동점 경계 retirement' : '기출가치 순위 기준 학생 정규 목록 미선정',
    level_reason: selectedRow ? selectedRow.level_reason : '',
  };
});

const importRows = selected.map(row => ({
  level: row.confirmed_level_final,
  word: row.headword,
  meaning: row.representative_meaning,
  vocab_id: row.vocab_id,
  sense_id: row.sense_id,
  item_type: row.item_type,
  sense_order: row.sense_order,
  importance_score: row.exam_value_score,
  occurrence_count: row.occurrence_count_new,
  active: true,
  curriculum_active: true,
  curriculum_level: row.confirmed_level_final,
  archive_only: false,
  selection_score: row.exam_value_score,
  selection_reason: row.selection_reason_final,
  recommended_level: row.confirmed_level_final,
  confirmed_level: row.confirmed_level_final,
}));

const missingRequired = importRows.filter(row => !row.sense_id || !row.word || !row.meaning || !/^V[1-5]$/.test(row.confirmed_level)).length;
const duplicateIds = importRows.length - new Set(importRows.map(row => row.sense_id)).size;
const highlySpecializedRemaining = selected.filter(row => row.educational_classification_final === 'HIGHLY_SPECIALIZED').length;
const properRemaining = selected.filter(row => Number(row.penalty_proper || 0) < 0).length;
const v1SingleAdditional = selected.filter(row => row.confirmed_level_final === 'V1' && !truth(row.is_primary) && Number(row.occurrence_count_new) === 1).length;
let primaryAfterAdditional = 0;
for (const group of headGroups.values()) {
  const included = group.filter(row => finalIds.has(row.sense_id));
  const primary = included.find(row => truth(row.is_primary));
  if (primary) primaryAfterAdditional += included.filter(row => !truth(row.is_primary) && row.final_learning_order < primary.final_learning_order).length;
}
const levelCounts = Object.fromEntries(['V1', 'V2', 'V3', 'V4', 'V5'].map(level => [level, selected.filter(row => row.confirmed_level_final === level).length]));
const validation = [
  ['canonical_senses', senses.length, 13326], ['student_curriculum', selected.length, 3200],
  ...Object.entries(levelCounts).map(([key, value]) => [key, value, { V1: 800, V2: 800, V3: 800, V4: 600, V5: 200 }[key]]),
  ['sense_id_duplicates', duplicateIds, 0], ['required_missing', missingRequired, 0],
  ['highly_specialized_or_passage_only', highlySpecializedRemaining, 0], ['proper_noun', properRemaining, 0],
  ['primary_after_additional', primaryAfterAdditional, 0], ['v1_single_additional', v1SingleAdditional, 0],
  ['original_occurrences', occurrences.length, 23735], ['bridge_rows', bridge.length, 23735],
  ['bridge_mapped', bridge.filter(row => row.mapping_status === 'MAPPED').length, 23735],
].map(([metric, actual, expected]) => ({ metric, actual, expected, status: actual === expected ? 'PASS' : 'FAIL' }));
if (validation.some(row => row.status === 'FAIL')) throw new Error(`Final validation failed: ${JSON.stringify(validation.filter(row => row.status === 'FAIL'))}`);

const levelBoundary = [];
const boundaries = [800, 1600, 2400, 3000];
for (const boundary of boundaries) {
  for (let index = Math.max(0, boundary - 30); index < Math.min(selected.length, boundary + 30); index++) {
    levelBoundary.push({ boundary: `${levelFor(boundary - 1)}→${levelFor(boundary)}`, relative_position: index + 1 - boundary, ...selected[index] });
  }
}
const representativeSamples = [];
for (const level of ['V1', 'V2', 'V3', 'V4', 'V5']) {
  const levelRows = selected.filter(row => row.confirmed_level_final === level);
  const count = Math.min(50, levelRows.length);
  for (let i = 0; i < count; i++) {
    const index = count === 1 ? 0 : Math.round(i * (levelRows.length - 1) / (count - 1));
    representativeSamples.push({ sample_level: level, sample_no: i + 1, ...levelRows[index] });
  }
}

const addSheet = (wb, name, data, freeze = true) => {
  const safe = data.length ? data : [{ status: 'NONE' }];
  const ws = XLSX.utils.json_to_sheet(safe);
  ws['!autofilter'] = { ref: ws['!ref'] };
  ws['!cols'] = Object.keys(safe[0]).map(key => ({ wch: Math.min(45, Math.max(12, key.length + 2)) }));
  if (freeze) ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
};
const copyLegacySheet = (target, sourceName, targetName = sourceName) => {
  if (!L.Sheets[sourceName]) return;
  addSheet(target, targetName, rows(L, sourceName));
};

fs.mkdirSync(OUT, { recursive: true });
const master = XLSX.utils.book_new();
addSheet(master, 'README', [
  { item: '목적', value: '전체 기출 canonical sense와 occurrence를 보존하는 최종 마스터. 운영 업로드 금지.' },
  { item: '학생용 확정', value: '3,200 sense; V1 800 / V2 800 / V3 800 / V4 600 / V5 200' },
  { item: '운영 상태', value: 'staging 미실행 / VocabularyDB commit 미실행' },
  { item: '정렬', value: '기출가치 및 학습순서 지정 동점 기준 사용; 원본 행 순서 미사용' },
]);
addSheet(master, 'VocabularySenses_Final', masterSenses);
addSheet(master, 'VocabularyOccurrences', occurrences);
addSheet(master, 'SenseOccurrenceBridge', bridge);
addSheet(master, 'SenseMergeHistory', mergeHistory);
addSheet(master, 'StudentCurriculum3200', selected);
addSheet(master, 'ExcludedTie200', excludedTie200);
addSheet(master, 'DomainReplacementAudit', domainAudit);
addSheet(master, 'PrimaryOrderAudit', orderAudit);
addSheet(master, 'RepresentativeSamples', representativeSamples);
addSheet(master, 'LevelBoundaryReview', levelBoundary);
for (const level of ['V1', 'V2', 'V3', 'V4', 'V5']) addSheet(master, level, selected.filter(row => row.confirmed_level_final === level));
addSheet(master, 'Validation', validation);
addSheet(master, 'Approved11Audit', rows(B, 'Approved11Audit'));
addSheet(master, 'BridgeValidation', rows(B, 'Validation'));
for (const sheet of ['AI_AutoMerge', 'AI_Different', 'AIReviewQueue', 'AI_BeforeAfter', 'AI_Statistics', 'CurriculumAIReview', 'CurriculumUncertain']) copyLegacySheet(master, sheet);
XLSX.writeFile(master, MASTER_OUT, { compression: true });

const operational = XLSX.utils.book_new();
addSheet(operational, 'README', [
  { item: '용도', value: 'ELAB 운영 staging용 정규 어휘 3,200개. 아직 staging/commit하지 않음.' },
  { item: '레벨', value: 'V1 800 / V2 800 / V3 800 / V4 600 / V5 200' },
  { item: '스냅샷', value: '세트 생성 시 기존 VocabSetItems snapshot 정책 유지' },
]);
addSheet(operational, 'ELAB_Import', importRows);
for (const level of ['V1', 'V2', 'V3', 'V4', 'V5']) addSheet(operational, level, importRows.filter(row => row.confirmed_level === level));
addSheet(operational, 'Validation', validation);
XLSX.writeFile(operational, IMPORT_OUT, { compression: true });

const report = {
  canonical_senses: senses.length,
  occurrences: occurrences.length,
  bridge: { rows: bridge.length, mapped: bridge.filter(row => row.mapping_status === 'MAPPED').length },
  curriculum: { total: selected.length, levels: levelCounts },
  excluded_domain: domainAudit,
  primary_order_corrections: orderAudit,
  excluded_tie_200_count: excludedTie200.length,
  validation,
  staging: false,
  vocabularydb_commit: false,
};
fs.writeFileSync(path.join(OUT, 'ELAB_정규어휘_3200_최종검증.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ files: [MASTER_OUT, IMPORT_OUT], summary: report }, null, 2));
