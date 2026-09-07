const fs=require('fs'),path=require('path'),XLSX=require('xlsx');
const ROOT=path.resolve(__dirname,'..');
const REVIEW=path.join(ROOT,'outputs','sense-occurrence-bridge-37-review','ELAB_SenseOccurrenceBridge_37건_복구검토본.xlsx');
const BASE=process.argv[2]?path.resolve(process.argv[2]):path.join(ROOT,'inputs','ELAB_통합_어휘DB_모의고사+수능_2022-2026.xlsx');
const MASTER=path.join(ROOT,'outputs','vocab-operational-split','ELAB_전체기출_어휘마스터DB.xlsx');
const OUT=path.join(ROOT,'outputs','sense-occurrence-bridge-37-review','ManualRequired_FinalReview.xlsx');
const R=XLSX.readFile(REVIEW),B=XLSX.readFile(BASE),M=XLSX.readFile(MASTER);
const rows=(w,s)=>XLSX.utils.sheet_to_json(w.Sheets[s],{defval:''});
const manual=rows(R,'ManualRequired'),occ=rows(B,'VocabularyOccurrences'),sets=rows(B,'VocabularySets'),senses=rows(M,'VocabularySenses');
const om=new Map(occ.map(x=>[x.occurrence_id,x])),sm=new Map(sets.map(x=>[x.set_id,x])),byId=new Map(senses.map(x=>[x.sense_id,x]));
const recommendations={
 'OCC_9EA8931E7A5680E4':{id:'SEN_6D61BB5ECF41',reason:'절대적으로는 이 문맥 뜻 목록에서 일반 부사 의미인 확실히가 가장 가깝지만 원문 문장이 없어 확정 불가',diff:'전적으로 그렇다·당연하다는 응답/동의 용법, 전혀는 부정 강조 용법, 물론이지·그럼은 대화 응답 용법이다.'},
 'OCC_F3EBA9EC6E6F93CA':{id:'SEN_6D61BB5ECF41',reason:'반드시·절대적으로는 일반 확신 부사인 확실히와 가장 가깝지만 원문 문장이 없어 확정 불가',diff:'전적으로 그렇다·당연하다는 동의 강조, 전혀는 부정 강조, 물론이지·그럼은 독립 응답에 가깝다.'},
 'OCC_A8D6D1E0EE84D66F':{id:'SEN_8A1E37D7F9DC',reason:'원래 뜻 학문적인·이론적인이 후보 대표 뜻과 문자 및 의미상 직접 일치',diff:'학업의·학교의는 교육/학교 관련, 학문의·학리적인은 학문 분야 관련이며 이론적이라는 뉘앙스는 후보 1이 가장 직접적이다.'},
 'OCC_B1DE42F53DD0A617':{id:'SEN_2F6FF8B3C645',reason:'학업의라는 표현이 학교·교육 관련 후보와 가장 직접적으로 겹치지만 학문의도 함께 있어 확정 전 검토 필요',diff:'학문의·학리적인과 학문적인·이론적인은 학술/이론 성격에 더 가깝고 학교·학업 의미는 후보 1이 강하다.'},
 'OCC_75239BD1962406A6':{id:'SEN_2F6FF8B3C645',reason:'동일 meaning_id의 다른 occurrence와 같은 학업의·학문의 번역이며 학교·교육 관련 후보가 우선',diff:'학문 자체의 성격을 뜻했다면 학문의·학리적인 또는 학문적인·이론적인 후보가 가능하다.'},
 'OCC_998FC849F0E0D4BA':{id:'SEN_8A1E37D7F9DC',reason:'학문적인이 후보 학문적인·이론적인과 직접 겹침',diff:'학업의·학교의는 학교 교육 맥락, 학문의·학리적인은 명사적 학문 분야의 성격이 더 강하다.'},
 'OCC_6BEB915017E824E8':{id:'SEN_2F6FF8B3C645',reason:'학업적인은 학교·교육 활동 의미가 가장 가까움',diff:'학문의·학리적인과 학문적인·이론적인은 학술·이론적 의미가 중심이다.'},
 'OCC_E529ACD3462668DF':{id:'SEN_185208D82050',reason:'학술적인은 학문의·학리적인 후보가 가장 가깝지만 학문적인·이론적인과도 겹칠 수 있음',diff:'학업의·학교의는 교육기관 관련, 학문적인·이론적인은 이론적 성격을 더 강조한다.'},
 'OCC_6AB2EF855184E2CA':{id:'SEN_F31A350CE72B',reason:'계라는 번역은 생태학의 군집 의미일 가능성이 가장 높지만 원문 문장이 없어 확정 불가',diff:'공동체·지역사회 후보는 사람의 사회 집단, 집단 생활·공동체는 생활 방식에 가깝고 군집은 생태 집단 의미다.'},
 'OCC_757F462F4D62BA0C':{id:'SEN_04AADCBCC229',reason:'학문 분야는 (학문의) 분야와 가장 직접적으로 일치',diff:'학문은 discipline 전체 영역, 학과는 학교 조직 단위이며 (학문의) 분야가 원래 번역을 가장 정확히 보존한다.'},
 'OCC_B5D0AEEE64B52825':{id:'SEN_04AADCBCC229',reason:'동일 meaning_id의 다른 수능 occurrence와 같은 학문 분야 번역이며 (학문의) 분야가 직접 일치',diff:'학문은 더 넓은 개념이고 학과는 교육기관의 부서 의미다.'}
};
function candidates(row,rec){const all=(row.candidates||'').split(' | ').map(x=>{const i=x.indexOf(':');return{i:x.slice(0,i),m:x.slice(i+1)}}).filter(x=>x.i);const preferred=[];if(rec&&rec.id){const p=all.find(x=>x.i===rec.id);if(p)preferred.push(p);}for(const x of all)if(!preferred.some(p=>p.i===x.i))preferred.push(x);return preferred.slice(0,3);}
const outRows=manual.map((r,i)=>{const o=om.get(r.occurrence_id)||{},set=sm.get(o.set_id)||{},rec=recommendations[r.occurrence_id],cs=candidates(r,rec);while(cs.length<3)cs.push({i:'',m:''});return{
 review_no:i+1,occurrence_id:r.occurrence_id,vocab_id:r.vocab_id,headword:r.headword,original_meaning:r.source_meaning,set_title:set.set_title||'',grade_scope:o.grade_scope||'',administered_year:o.administered_year||'',administered_month:o.administered_month||'',question_key:o.question_key||'',source_file:o.source_file||'',source_page:o.source_page||'',source_sentence:'원문 미확보',contextual_meaning:o.meaning_in_context||r.source_meaning,source_sense_id:r.source_sense_id,
 candidate_1_canonical_sense_id:cs[0].i,candidate_1_representative_meaning:cs[0].m,candidate_2_canonical_sense_id:cs[1].i,candidate_2_representative_meaning:cs[1].m,candidate_3_canonical_sense_id:cs[2].i,candidate_3_representative_meaning:cs[2].m,ai_recommended_candidate:rec?rec.id:'',ai_recommendation_reason:rec?rec.reason:'',difference_from_other_candidates:rec?rec.diff:'',final_selection:''};});
const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(outRows);ws['!autofilter']={ref:ws['!ref']};ws['!freeze']={xSplit:0,ySplit:1};ws['!cols']=[10,22,18,16,26,32,12,14,14,12,48,12,20,28,22,22,26,22,26,22,26,22,55,60,24].map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,'ManualRequired_FinalReview');const guide=XLSX.utils.aoa_to_sheet([['검토 안내'],['final_selection 열에 선택한 canonical_sense_id만 입력하세요.'],['AI 추천은 참고용이며 현재 어떤 항목도 확정되지 않았습니다.'],['source_sentence가 원문 미확보인 경우 원문을 추측하지 않았습니다.']]);guide['!cols']=[{wch:100}];XLSX.utils.book_append_sheet(wb,guide,'안내');XLSX.writeFile(wb,OUT,{compression:true});console.log(JSON.stringify({file:OUT,rows:outRows.length,blankFinal:outRows.every(x=>!x.final_selection),missingSentence:outRows.filter(x=>x.source_sentence==='원문 미확보').length},null,2));
