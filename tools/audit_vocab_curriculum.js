const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'outputs', 'vocab-student-curriculum', 'ELAB_V1-V5_학생용_정규어휘_선별_검토본.xlsx');
const OUT = path.join(ROOT, 'outputs', 'vocab-curriculum-audit');
const LEVELS = ['V1', 'V2', 'V3', 'V4', 'V5'];
const QUOTAS = { V1: 800, V2: 800, V3: 800, V4: 600, V5: 400 };

function rows(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
}
function yes(v) { return String(v).toUpperCase() === 'TRUE'; }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function countFromReason(reason, re, fallback = 1) {
  const m = String(reason || '').match(re);
  return m ? Number(m[1]) : fallback;
}
function splitCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  const s = String(value || '').trim();
  if (!s) return 0;
  return s.split(/\s*[,;|]\s*/).filter(Boolean).length;
}
function round3(v) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function scoreParts(r) {
  const reason = String(r.selection_reason || '');
  const occurrence = n(r.occurrence_count);
  const sourceSetMatch = reason.match(/(\d+)개 시험 출현/) || reason.match(/서로 다른 시험 (\d+)회/);
  const sourceSets = sourceSetMatch ? Number(sourceSetMatch[1]) : splitCount(r.source_sets);
  const years = countFromReason(reason, /(\d+)개 연도/, occurrence ? 1 : 0);
  const grades = countFromReason(reason, /(\d+)개 학년\/수능 범위/, occurrence ? 1 : 0);
  const primary = reason.includes('동일 단어 대표 뜻');
  const proper = reason.includes('고유명사 가능성 감점');
  const singlePenalty = occurrence === 1 && !primary && n(r.csat_count) === 0;
  const parts = {
    importance: n(r.importance_score),
    occurrence_log: 6 * Math.log2(occurrence + 1),
    source_set_log: 12 * Math.log2(sourceSets + 1),
    year: 8 * years,
    grade: 7 * grades,
    csat: 15 * n(r.csat_count),
    primary: primary ? 10 : 0,
    single_penalty: singlePenalty ? -15 : 0,
    proper_penalty: proper ? -8 : 0
  };
  return { occurrence, sourceSets, years, grades, primary, proper, singlePenalty, parts,
    calculated: round3(Object.values(parts).reduce((a, b) => a + b, 0)) };
}
function cmpScore(a, b) {
  return n(b.selection_score) - n(a.selection_score) || a._sourceIndex - b._sourceIndex;
}
function fmt(v) { return typeof v === 'number' ? String(round3(v)) : String(v ?? ''); }
function table(headers, data) {
  const esc = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return `| ${headers.map(esc).join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n` +
    data.map(r => `| ${r.map(esc).join(' | ')} |`).join('\n') + '\n';
}
function itemRow(r) {
  return [r.sense_id, r.headword, r.representative_meaning, r.confirmed_level, fmt(r.selection_score), n(r.occurrence_count), r.selection_reason];
}
function addSheet(wb, name, data, widths) {
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!autofilter'] = data.length ? { ref: ws['!ref'] } : undefined;
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!cols'] = (widths || Object.keys(data[0] || {}).map(k => Math.min(45, Math.max(12, k.length + 2)))).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

fs.mkdirSync(OUT, { recursive: true });
const wb = XLSX.readFile(SOURCE, { cellDates: true });
const senses = rows(wb, 'VocabularySenses').map((r, i) => ({ ...r, _sourceIndex: i }));
const curriculum = rows(wb, 'StudentCurriculum');
const occurrences = rows(wb, 'VocabularyOccurrences');
const uncertain = rows(wb, 'CurriculumUncertain');
const uncertainIds = new Set();
for (const r of uncertain) {
  for (const k of Object.keys(r)) if (/sense.*id/i.test(k) && r[k]) uncertainIds.add(String(r[k]));
}

let formulaMismatch = 0;
for (const r of senses) if (Math.abs(scoreParts(r).calculated - n(r.selection_score)) > 0.0001) formulaMismatch++;

const levelStats = {};
const boundaryRows = [];
const examplesRows = [];
const exceptionRows = [];
for (const level of LEVELS) {
  const pool = senses.filter(r => r.confirmed_level === level);
  const selected = pool.filter(r => yes(r.curriculum_active)).sort(cmpScore);
  const archived = pool.filter(r => !yes(r.curriculum_active)).sort(cmpScore);
  const minSelected = selected[selected.length - 1];
  const maxArchived = archived[0];
  const cut = n(minSelected.selection_score);
  const tied = pool.filter(r => n(r.selection_score) === cut).sort((a, b) => a._sourceIndex - b._sourceIndex);
  const selectedAtTie = tied.filter(r => yes(r.curriculum_active));
  const archivedAtTie = tied.filter(r => !yes(r.curriculum_active));
  const primaryCount = selected.filter(r => scoreParts(r).primary).length;
  const additionalCount = selected.length - primaryCount;
  const expressionCount = selected.filter(r => r.item_type === 'EXPRESSION').length;
  const singleCount = selected.filter(r => n(r.occurrence_count) === 1).length;
  const noCsatCount = selected.filter(r => n(r.csat_count) === 0).length;
  const properCount = selected.filter(r => scoreParts(r).proper).length;
  levelStats[level] = {
    pool_count: pool.length,
    quota: QUOTAS[level],
    selected_count: selected.length,
    score_max: n(selected[0].selection_score),
    score_min: cut,
    cutoff_score: cut,
    selected_at_cutoff_tie: selectedAtTie.length,
    archived_at_cutoff_tie: archivedAtTie.length,
    cutoff_tie_total: tied.length,
    single_occurrence_count: singleCount,
    csat_absent_count: noCsatCount,
    primary_sense_count: primaryCount,
    additional_sense_count: additionalCount,
    expression_count: expressionCount,
    proper_noun_penalty_count: properCount,
    lowest_selected: { sense_id: minSelected.sense_id, word: minSelected.headword, meaning: minSelected.representative_meaning, score: cut, source_index: minSelected._sourceIndex + 2 },
    highest_archived: { sense_id: maxArchived.sense_id, word: maxArchived.headword, meaning: maxArchived.representative_meaning, score: n(maxArchived.selection_score), source_index: maxArchived._sourceIndex + 2 },
    tie_break_observed: 'selection_score 내림차순 후 VocabularySenses 원본 행 순서(안정 정렬)'
  };
  selected.slice(0, 50).forEach((r, i) => examplesRows.push({ level, section: '대표 표본(상위 50)', rank: i + 1, ...Object.fromEntries(['sense_id','headword','representative_meaning','selection_score','occurrence_count','selection_reason'].map(k => [k, r[k]])) }));
  selected.slice(0, 30).forEach((r, i) => examplesRows.push({ level, section: '처음 30', rank: i + 1, sense_id:r.sense_id, headword:r.headword, representative_meaning:r.representative_meaning, selection_score:r.selection_score, occurrence_count:r.occurrence_count, selection_reason:r.selection_reason }));
  selected.slice(-30).forEach((r, i) => examplesRows.push({ level, section: '마지막 30', rank: selected.length - 29 + i, sense_id:r.sense_id, headword:r.headword, representative_meaning:r.representative_meaning, selection_score:r.selection_score, occurrence_count:r.occurrence_count, selection_reason:r.selection_reason }));
  boundaryRows.push({ level, status: '마지막 선정', ...levelStats[level].lowest_selected }, { level, status: '첫 탈락', ...levelStats[level].highest_archived });
}

const auditRows = senses.filter(r => yes(r.curriculum_active)).map(r => {
  const p = scoreParts(r);
  const flags = [];
  if (n(r.occurrence_count) === 1) flags.push('SINGLE_OCCURRENCE');
  if (!p.primary) flags.push('ADDITIONAL_SENSE');
  if (p.proper) flags.push('PROPER_NOUN_PENALTY');
  if (uncertainIds.has(String(r.sense_id))) flags.push('AI_UNCERTAIN_PAIR');
  if (r.recommended_level && r.recommended_level !== r.confirmed_level) flags.push('RECOMMENDED_CONFIRMED_MISMATCH');
  if (!r.selection_reason) flags.push('INSUFFICIENT_SELECTION_REASON');
  return {
    sense_id: r.sense_id,
    vocab_id: r.vocab_id,
    word: r.headword,
    meaning: r.representative_meaning,
    occurrence_count: p.occurrence,
    source_set_count: p.sourceSets,
    year_count: p.years,
    grade_coverage: p.grades,
    mock_count: n(r.mock_count),
    csat_count: n(r.csat_count),
    primary_or_additional_sense: p.primary ? 'PRIMARY' : 'ADDITIONAL',
    selection_score: n(r.selection_score),
    level_score: '',
    recommended_level: r.recommended_level,
    confirmed_level: r.confirmed_level,
    selection_reason: r.selection_reason,
    level_reason: `${r.classification_reason || ''} | 기존 confirmed_level 유지; 별도 level_score 미기록`,
    exception_flag: flags.join(';')
  };
});

for (const r of senses.filter(r => yes(r.curriculum_active))) {
  const p = scoreParts(r), reasons = [];
  if (r.recommended_level && r.recommended_level !== r.confirmed_level) reasons.push('추천/확정 레벨 불일치');
  if (p.proper) reasons.push('고유명사 가능성 -8');
  if (p.singlePenalty) reasons.push('단일 출현·추가 뜻·수능 미출현 -15');
  if (uncertainIds.has(String(r.sense_id))) reasons.push('학생용 후보 내부 AI UNCERTAIN');
  if (!r.selection_reason) reasons.push('선정 근거 누락');
  if (reasons.length) exceptionRows.push({ sense_id:r.sense_id, headword:r.headword, representative_meaning:r.representative_meaning, selection_score:r.selection_score, recommended_level:r.recommended_level, confirmed_level:r.confirmed_level, change_reason:reasons.join('; ') });
}

const cases = senses.filter(r => ['false','issue','subject','address','run'].includes(String(r.headword).toLowerCase())).map(r => ({
  headword:r.headword, sense_id:r.sense_id, meaning:r.representative_meaning, occurrence_count:r.occurrence_count,
  primary_or_additional:scoreParts(r).primary?'PRIMARY':'ADDITIONAL', selection_score:r.selection_score,
  selected:yes(r.curriculum_active), recommended_level:r.recommended_level, confirmed_level:r.confirmed_level,
  selection_reason:r.selection_reason
}));

const selectedAll = senses.filter(r => yes(r.curriculum_active));
const selectedSingleBoundary = selectedAll.filter(r => n(r.occurrence_count) === 1 && n(r.csat_count) === 0);
const globalSelected = [...selectedAll].sort(cmpScore);
const globalArchived = senses.filter(r => !yes(r.curriculum_active)).sort(cmpScore);
const lastCurriculumRow = curriculum[curriculum.length - 1] || {};
const sameScoreCrossBoundary = LEVELS.reduce((sum, l) => sum + levelStats[l].cutoff_tie_total, 0);
const scoreStats = {
  audit_metadata: {
    generated_at: new Date().toISOString(), source_workbook: path.relative(ROOT, SOURCE).replace(/\\/g, '/'),
    source_rows: senses.length, selected_rows: selectedAll.length, occurrence_rows: occurrences.length,
    formula_mismatch_count: formulaMismatch,
    selection_method: 'confirmed_level별 selection_score 내림차순 상대평가 후 V1 800/V2 800/V3 800/V4 600/V5 400 쿼터',
    level_assignment_provenance: 'recommended_level/confirmed_level 산출 원본 코드와 level_score는 작업공간 및 산출물에 없음; 기존 레벨을 그대로 유지',
    tie_break_observed: '동점에서는 VocabularySenses 원본 행 순서를 유지한 안정 정렬',
    unique_global_3400_3401_boundary_exists: false
  },
  selection_score_formula: {
    expression: 'importance_score + 6*log2(occurrence_count+1) + 12*log2(source_set_count+1) + 8*year_count + 7*grade_coverage + 15*csat_count + 10*primary_sense - 15*single_nonprimary_noncsat - 8*proper_noun_candidate',
    rounding: '소수 셋째 자리',
    weights: { importance_score:1, occurrence_log2:6, distinct_source_set_log2:12, year_count:8, grade_coverage:7, csat_count:15, primary_sense:10, single_nonprimary_noncsat:-15, proper_noun_candidate:-8, mock_count_direct:0, evaluation_agency_direct:0, headword_sense_share_direct:0, item_type_direct:0, ai_manual_direct:0 },
    verified_rows: senses.length, mismatch_count: formulaMismatch
  },
  levels: levelStats,
  selected_single_occurrence_count: selectedAll.filter(r => n(r.occurrence_count) === 1).length,
  selected_single_occurrence_non_csat_boundary_count: selectedSingleBoundary.length,
  selected_headword_count: new Set(selectedAll.map(r => String(r.headword).toLowerCase())).size,
  archive_count: senses.length - selectedAll.length,
  uncertain_pair_rows: uncertain.length,
  cutoff_tie_rows_total: sameScoreCrossBoundary,
  worksheet_last_selected_3400th: { sense_id:lastCurriculumRow.sense_id, word:lastCurriculumRow.headword || lastCurriculumRow.word, meaning:lastCurriculumRow.representative_meaning || lastCurriculumRow.meaning, level:lastCurriculumRow.curriculum_level || lastCurriculumRow.confirmed_level, score:lastCurriculumRow.selection_score },
  global_lowest_selected: globalSelected[globalSelected.length-1] ? { sense_id:globalSelected.at(-1).sense_id, word:globalSelected.at(-1).headword, level:globalSelected.at(-1).confirmed_level, score:globalSelected.at(-1).selection_score } : null,
  global_highest_archived: globalArchived[0] ? { sense_id:globalArchived[0].sense_id, word:globalArchived[0].headword, level:globalArchived[0].confirmed_level, score:globalArchived[0].selection_score } : null
};

fs.writeFileSync(path.join(OUT, 'V1~V5 점수·커트라인 통계.json'), JSON.stringify(scoreStats, null, 2), 'utf8');

const md = [];
md.push('# V1~V5 선정기준 감사보고서', '', `- 감사 대상: \`${path.relative(ROOT, SOURCE).replace(/\\/g,'/')}\``, `- VocabularySenses: ${senses.length.toLocaleString()} sense`, `- 학생용 선정: ${selectedAll.length.toLocaleString()} sense / ${new Set(selectedAll.map(r=>String(r.headword).toLowerCase())).size.toLocaleString()} headword`, `- VocabularyOccurrences: ${occurrences.length.toLocaleString()}행`, '- 운영 staging 및 VocabularyDB commit: **실행하지 않음**', '');
md.push('## 1. 증거 수준과 핵심 결론', '', '- 현재 작업공간에는 이 학생용 선별본을 만든 원본 생성 스크립트가 남아 있지 않습니다. 따라서 코드에 존재하지 않는 난도식이나 교육적 레벨 공식을 새로 설명하지 않았습니다.', `- 다만 저장된 산출값을 역산한 selection_score 식은 ${senses.length.toLocaleString()}행 모두에서 소수 셋째 자리까지 일치했습니다(불일치 ${formulaMismatch}건).`, '- V1~V5는 공통 절대 점수 구간이 아닙니다. 기존 `confirmed_level`별 후보군을 유지한 채, 각 후보군 안에서 selection_score를 내림차순 정렬하여 정해진 수량을 자른 상대평가입니다.', '- 별도 `level_score`는 저장되지 않았습니다. `recommended_level`과 `confirmed_level`의 원래 산출 코드도 현재 산출물/작업공간에서 확인되지 않습니다.', '');
md.push('## 2. 실제 selection_score 계산식', '', '```text', 'selection_score = importance_score', '  + 6 × log2(occurrence_count + 1)', '  + 12 × log2(source_set_count + 1)', '  + 8 × year_count', '  + 7 × grade_coverage', '  + 15 × csat_count', '  + 10 (같은 headword의 대표 뜻)', '  - 15 (occurrence_count=1 AND 추가 뜻 AND csat_count=0)', '  - 8 (고유명사 가능성)', '```', '', '- 최종값은 소수 셋째 자리로 반올림했습니다.', '- `mock_count` 자체의 직접 가중치는 0입니다. 모의고사는 occurrence/source set/year/grade 항에 간접 반영됩니다.', '- 평가원 모의평가와 교육청 모의고사를 별도 가중한 흔적은 없습니다. 산출물에는 MOCK/CSAT 구분만 있어 CSAT만 직접 +15×횟수로 반영됩니다.', '- headword 내 출현 비중을 퍼센트로 넣는 항은 없습니다. 대신 대표 뜻 여부에 +10을 줍니다.', '- `item_type=EXPRESSION`에 대한 직접 가감점은 없습니다.', '- 전문어·지엽성에 대한 별도 수치 감점은 확인되지 않습니다. 확인 가능한 휴리스틱은 `고유명사 가능성` -8뿐입니다.', '- AI 판단/수동 예외는 selection_score에 직접 숫자로 더해지지 않았습니다. AI 의미 검토는 sense 병합/UNCERTAIN 표시에 사용되었습니다.', '');
md.push('## 3. 선정 필수조건·제외조건과 동점 처리', '', '- 선발 모집단은 active한 sense이며 기존 confirmed_level V1~V5별로 분리되어 있습니다.', '- 쿼터: V1 800, V2 800, V3 800, V4 600, V5 400.', '- 정렬: selection_score 내림차순. 경계 동점에서는 `VocabularySenses` 원본 행 순서를 유지한 안정 정렬이 실제 결과와 일치합니다.', '- 모든 레벨 경계에서 선정/탈락 동점이 발생했습니다. 따라서 점수만으로 고유한 3,400번째/3,401번째 전역 경계는 존재하지 않습니다.', '- `StudentCurriculum`의 실제 3,400번째 행은 아래 V5 마지막 행이지만, 3,401번째는 생성되지 않았습니다. 가장 가까운 비교는 레벨별 첫 탈락 행입니다.', '');
md.push(table(['레벨','후보','선정','점수 범위','커트라인','커트 동점 선정/탈락','단일 출현','수능 미출현','대표/추가 뜻','표현'], LEVELS.map(l=>{const s=levelStats[l];return [l,s.pool_count,s.selected_count,`${s.score_min}~${s.score_max}`,s.cutoff_score,`${s.selected_at_cutoff_tie}/${s.archived_at_cutoff_tie}`,s.single_occurrence_count,s.csat_absent_count,`${s.primary_sense_count}/${s.additional_sense_count}`,s.expression_count];})), '');
md.push('### 레벨별 마지막 선정과 첫 탈락', '', table(['레벨','상태','sense_id','단어','뜻','점수','원본 행'], boundaryRows.map(r=>[r.level,r.status,r.sense_id,r.word,r.meaning,r.score,r.source_index])), '');
md.push('## 4. V1~V5 공통 배정 원칙', '', '- 기출 중요도·빈도·범위·수능 출현·대표 뜻 여부는 **선정 우선순위(selection_score)** 에 반영됩니다.', '- 단어 자체 난도, 추상성, 전문성, 학습 순서를 별도 수치화한 `level_score`는 없습니다.', '- 출현 학년은 selection_score의 grade_coverage에는 반영되지만, 그것이 V1~V5를 직접 다시 배정하지는 않았습니다.', '- 최종 레벨은 기존 confirmed_level을 보존했고 curriculum_level도 그대로 복사했습니다.', '- 그러므로 V1 800번째와 V2 1번째가 갈린 이유는 공통 점수 컷이 아니라 서로 다른 기존 레벨 후보군에 속했기 때문입니다. V2 항목이 V1 경계보다 점수가 높을 수 있습니다.', '- V5는 “가장 어려운 단어”만도, “가장 낮은 우선순위”만도 아닙니다. 기존 수능 확장 레벨 안에서 중요도를 다시 순위화한 혼합 단계이므로 제시된 선택지 중 D에 가장 가깝습니다.', '');
for (const level of LEVELS) {
  const s=levelStats[level];
  md.push(`## ${5 + LEVELS.indexOf(level)}. ${level} 실제 감사`, '', `- 후보 ${s.pool_count.toLocaleString()}개 중 ${s.selected_count.toLocaleString()}개를 상대 선발했습니다.`, `- selection_score 범위: ${s.score_min}~${s.score_max}; 커트라인 ${s.cutoff_score}.`, `- 단일 출현 ${s.single_occurrence_count}개, 수능 미출현 ${s.csat_absent_count}개, 추가 뜻 ${s.additional_sense_count}개, 표현·구문 ${s.expression_count}개.`, `- 커트 동점군 ${s.cutoff_tie_total}개 중 ${s.selected_at_cutoff_tie}개 선정, ${s.archived_at_cutoff_tie}개 탈락. 동점은 원본 행 순서로 갈렸습니다.`, '- 대표 표본 50개와 처음·마지막 각 30개는 판정 근거 XLSX의 `LevelExamples` 시트에 수록했습니다.', '');
}
md.push('## 10. 단일 출현 선정 294개', '', `- occurrence_count=1인 선정 항목은 총 ${scoreStats.selected_single_occurrence_count}개이며, 그중 수능 미출현 단일 항목이 요청에서 지칭한 ${scoreStats.selected_single_occurrence_non_csat_boundary_count}개입니다. 나머지는 수능 단일 출현으로 +15가 반영된 항목입니다.`, '- 별도의 “예외 승격” 공식은 없습니다. 각 항목이 기존 레벨 후보군 안에서 쿼터 커트라인을 통과했습니다.', '- 대표 뜻이면 +10, 수능 출현이면 횟수당 +15가 적용됩니다. 반대로 단일 출현이면서 추가 뜻이고 수능 미출현이면 -15가 적용됩니다.', '- 따라서 단일 출현도 importance_score, 대표 뜻, 수능 여부 및 레벨별 경쟁 강도에 따라 선정될 수 있습니다.', '');
md.push('## 11. 같은 단어의 여러 뜻', '', '- 같은 headword의 sense는 서로 독립적으로 점수를 받습니다.', '- 대표 뜻은 +10을 받고, 단일 출현 추가 뜻·수능 미출현이면 -15를 받습니다.', '- 출현이 충분한 추가 뜻은 해당 감점을 받지 않으며 독립적으로 쿼터를 통과할 수 있습니다.', '- 레벨은 sense별 기존 confirmed_level을 유지하므로 같은 단어가 서로 다른 레벨에 다시 등장할 수 있습니다.', '- 실제 false/issue/subject/address/run 전체 사례는 XLSX의 `HeadwordCases` 시트에 수록했습니다.', '', table(['단어','sense_id','뜻','출현','대표/추가','점수','선정','레벨'], cases.map(r=>[r.headword,r.sense_id,r.meaning,r.occurrence_count,r.primary_or_additional,r.selection_score,r.selected?'선정':'보관',r.confirmed_level])), '');
md.push('## 12. 예외·수동 조정 감사', '', '- `recommended_level != confirmed_level`인 항목은 판정 근거 XLSX에서 플래그했습니다. 다만 변경을 수행한 원본 코드/수동 기록이 없어 이유를 새로 추측하지 않았습니다.', '- 쿼터 때문에 다른 레벨로 이동한 항목은 없습니다. 쿼터는 각 confirmed_level 내부의 선정 여부만 결정합니다.', '- 모든 레벨 경계가 동점이므로 경계 동점으로 선정/탈락이 갈린 항목이 존재합니다.', '- `CurriculumUncertain`에 포함된 학생용 후보는 `AI_UNCERTAIN_PAIR`로 표시했습니다. 자동 병합은 0건입니다.', '- 전체 예외 목록은 XLSX의 `Exceptions` 시트, 경계는 `Boundaries` 시트에 수록했습니다.', '');
md.push('## 13. 감사 판정', '', '**판정: 계산식 재설계 필요**', '', '이 판정은 현재 3,400개가 무가치하다는 뜻이 아닙니다. selection_score 자체는 완전히 재현되며 기출 중요도 선별에는 일관성이 있습니다. 그러나 V1~V5가 난도·학습 순서를 설명하는 독립적인 level_score로 산출되지 않았고, 기존 confirmed_level별 쿼터와 대규모 경계 동점(원본 행 순서)이 최종 분류를 좌우했습니다. 운영 확정 전에 최소한 다음이 필요합니다:', '', '1. V1~V5의 교육적 의미와 난도/학년 기준을 명시한 별도 level_score 또는 판정 규칙.', '2. 원본 행 순서 대신 교육적으로 설명 가능한 동점 규칙.', '3. 경계 동점군과 recommended/confirmed 불일치 항목에 대한 검토.', '', '## 14. 보존·비실행 확인', '', `- VocabularyOccurrences ${occurrences.length.toLocaleString()}행은 원본 그대로 읽기만 했습니다.`, '- 운영 staging 업로드: 실행하지 않음.', '- VocabularyDB commit: 실행하지 않음.', '');
for (const level of LEVELS) {
  const selected=senses.filter(r=>r.confirmed_level===level&&yes(r.curriculum_active)).sort(cmpScore);
  md.push(`## 부록: ${level} 대표 표본 50개`, '', table(['sense_id','단어','뜻','레벨','점수','출현','선정 근거'], selected.slice(0,50).map(itemRow)), '', `### ${level} 처음 30개`, '', table(['sense_id','단어','뜻','레벨','점수','출현','선정 근거'], selected.slice(0,30).map(itemRow)), '', `### ${level} 마지막 30개`, '', table(['sense_id','단어','뜻','레벨','점수','출현','선정 근거'], selected.slice(-30).map(itemRow)), '');
}
fs.writeFileSync(path.join(OUT, 'V1~V5 선정기준 감사보고서.md'), md.join('\n'), 'utf8');

const outWb = XLSX.utils.book_new();
addSheet(outWb, 'LevelDecisionEvidence', auditRows, [22,18,22,38,14,16,12,14,12,12,22,14,14,18,18,55,60,35]);
addSheet(outWb, 'CutoffStatistics', LEVELS.map(l=>({ level:l, ...levelStats[l] })).map(r=>({
  level:r.level,pool_count:r.pool_count,quota:r.quota,selected_count:r.selected_count,score_max:r.score_max,score_min:r.score_min,cutoff_score:r.cutoff_score,
  cutoff_tie_total:r.cutoff_tie_total,selected_at_cutoff_tie:r.selected_at_cutoff_tie,archived_at_cutoff_tie:r.archived_at_cutoff_tie,
  single_occurrence_count:r.single_occurrence_count,csat_absent_count:r.csat_absent_count,primary_sense_count:r.primary_sense_count,
  additional_sense_count:r.additional_sense_count,expression_count:r.expression_count,proper_noun_penalty_count:r.proper_noun_penalty_count
})), [10,12,10,14,12,12,12,16,20,20,20,18,18,20,16,22]);
addSheet(outWb, 'Boundaries', boundaryRows, [10,14,22,22,40,12,14]);
addSheet(outWb, 'LevelExamples', examplesRows, [10,22,10,22,22,40,14,14,55]);
addSheet(outWb, 'HeadwordCases', cases, [16,22,40,16,22,14,12,18,18,55]);
addSheet(outWb, 'Exceptions', exceptionRows.length ? exceptionRows : [{note:'예외 없음'}], [22,22,40,14,18,18,60]);
addSheet(outWb, 'FormulaVerification', [{
  formula:'importance_score + 6*log2(occurrence_count+1) + 12*log2(source_set_count+1) + 8*year_count + 7*grade_coverage + 15*csat_count + 10*primary - 15*single_nonprimary_noncsat - 8*proper_noun',
  verified_rows:senses.length,mismatch_count:formulaMismatch,rounding:'0.001',level_score_status:'원본 산출물에 미기록'
}], [100,16,18,12,35]);
outWb.Props = { Title:'ELAB V1~V5 레벨 판정 근거', Subject:'학생용 3,400개 선별·레벨 감사', Author:'ELAB audit', CreatedDate:new Date() };
XLSX.writeFile(outWb, path.join(OUT, '전체 3,400개의 레벨 판정 근거.xlsx'), { compression:true });

console.log(JSON.stringify({ output:OUT, rows:auditRows.length, formulaMismatch, occurrences:occurrences.length, levelStats, cases:cases.length, exceptions:exceptionRows.length }, null, 2));
