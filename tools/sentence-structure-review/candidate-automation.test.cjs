const assert=require('assert');
const fs=require('fs');
const path=require('path');
const C=require('./core.js');

const pilot=require('../../output/sentence-structure-pilot/PILOT_50_ANNOTATIONS.json');
const baseline=C.fromPilot(pilot,'candidate-test');
const row=id=>baseline.records.find(r=>r.sentence_id===id);
const candidates=id=>row(id).teacher.teacher_clauses.flatMap(c=>c.teacher_predicates.flatMap(p=>p.verb_span_candidates));
const has=(id,type)=>candidates(id).some(x=>x.classification===type);
const checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};

const we=row('corpus:25018').teacher.teacher_clauses[0];
check('We -> We all candidate',JSON.stringify(we.auto_acceptable_subject_candidates[0]?.token_indexes)==='[0,1]');
check('candidate is not auto-accepted',we.teacher_acceptable_subject_spans.length===0&&we.auto_acceptable_subject_candidates[0].requires_teacher_confirmation===true);

const subjectFixture=(quantifier,dep='appos',end=3)=>({
  text:`They ${quantifier} know`,tokens:[{index:0,text:'They',char_start:0,char_end:4},{index:1,text:quantifier,char_start:5,char_end:5+quantifier.length},{index:2,text:'know',char_start:6+quantifier.length,char_end:10+quantifier.length}],
  parser_tokens:[{i:0,text:'They',start:0,end:4,pos:'PRON',dep:'nsubj',head:2},{i:1,text:quantifier,start:5,end:5+quantifier.length,pos:'PRON',dep,head:dep==='appos'?0:2},{i:2,text:'know',start:6+quantifier.length,end:10+quantifier.length,pos:'VERB',dep:'ROOT',head:2}],
  clauses:[{clause_id:'c1',parent_clause_id:null,start_token:0,end_token:end,marker_token_indexes:[]}]
});
let fixture=subjectFixture('both');
check('They -> They both candidate',JSON.stringify(C.autoAcceptableSubjectCandidates(fixture,fixture.clauses[0],[0])[0]?.token_indexes)==='[0,1]');
fixture=subjectFixture('all','advmod');
check('invalid partial dependency blocked',C.autoAcceptableSubjectCandidates(fixture,fixture.clauses[0],[0]).length===0);
fixture=subjectFixture('all','appos',1);
check('clause boundary crossing blocked',C.autoAcceptableSubjectCandidates(fixture,fixture.clauses[0],[0]).length===0);

check('particle classification',has('corpus:27119','INCLUDE_PARTICLE')&&has('corpus:26247','INCLUDE_PARTICLE'));
check('to-V candidate classification',has('corpus:23298','INCLUDE_TO_INFINITIVE_CANDIDATE'));
check('V-ing candidate classification',has('corpus:2542','INCLUDE_VING_COMPLEMENT_CANDIDATE'));
check('passive nonfinite candidate classification',has('corpus:59087','PASSIVE_NONFINITE_CANDIDATE'));
check('general PP negative control',has('corpus:2449','GENERAL_PP'));
check('prepositional verb candidate',has('corpus:60827','PREPOSITIONAL_VERB_CANDIDATE'));
check('uncertain candidates require teacher review',candidates('corpus:60827').some(x=>x.classification==='PREPOSITIONAL_VERB_CANDIDATE'&&x.requires_teacher_review));

const latest=process.env.ELAB_PILOT_REVIEW_EXPORT||path.join(process.env.USERPROFILE||'','Downloads','sentence-structure-pilot50-review.json');
if(fs.existsSync(latest)){
  const source=JSON.parse(fs.readFileSync(latest,'utf8')),base=C.fromPilot(pilot,source.input_fingerprint),canonical=t=>({teacher_corrected_text:t.teacher_corrected_text,teacher_clauses:t.teacher_clauses.map(c=>({clause_id:c.clause_id,teacher_type:c.teacher_type,teacher_parent:c.teacher_parent,teacher_depth:c.teacher_depth,teacher_start:c.teacher_start,teacher_end:c.teacher_end,teacher_primary_subject_span:c.teacher_primary_subject_span,teacher_acceptable_subject_spans:c.teacher_acceptable_subject_spans,teacher_predicates:c.teacher_predicates.map(p=>({predicate_id:p.predicate_id,predicate_order:p.predicate_order,source_auto_predicate_id:p.source_auto_predicate_id,teacher_student_verb_span_indexes:p.teacher_student_verb_span_indexes,teacher_finite_carrier_indexes:p.teacher_finite_carrier_indexes,teacher_lexical_verb_indexes:p.teacher_lexical_verb_indexes,teacher_auxiliary_indexes:p.teacher_auxiliary_indexes,teacher_nonfinite_complement_indexes:p.teacher_nonfinite_complement_indexes,teacher_be_pp_classification:p.teacher_be_pp_classification,teacher_be_pp_verified:p.teacher_be_pp_verified})),teacher_verified:c.teacher_verified})),teacher_skills:t.teacher_skills,teacher_level:t.teacher_level,level_verified:t.level_verified,gold_approved:t.gold_approved}),imported=C.importDoc(source,base);
  check('existing Teacher Gold canonical values unchanged',imported.records.every(r=>JSON.stringify(canonical(r.teacher))===JSON.stringify(canonical(source.records.find(x=>x.sentence_id===r.sentence_id).teacher))));
  check('existing Gold count unchanged',C.progress(imported).gold===source.records.filter(r=>r.review_status==='GOLD_READY').length);
  const round=C.importDoc(C.exportDoc(imported),base);
  check('import/export candidate provenance roundtrip',round.records.every((r,i)=>JSON.stringify(r.teacher.teacher_clauses.map(c=>c.auto_acceptable_subject_candidates))===JSON.stringify(imported.records[i].teacher.teacher_clauses.map(c=>c.auto_acceptable_subject_candidates))));
  check('clause and Level regression',round.records.every((r,i)=>JSON.stringify(canonical(r.teacher).teacher_clauses)===JSON.stringify(canonical(imported.records[i].teacher).teacher_clauses)&&r.teacher.teacher_level===imported.records[i].teacher.teacher_level));
}

const manual=C.clone(row('corpus:25018')),candidate=manual.teacher.teacher_clauses[0].auto_acceptable_subject_candidates[0];
C.acceptableSubjectCandidate(manual,'c1',candidate.candidate_id,'ACCEPT');
check('teacher click alone accepts candidate',JSON.stringify(manual.teacher.teacher_clauses[0].teacher_acceptable_subject_spans)==='[[0,1]]');
check('acceptable grading remains exact',C.subjectSelectionAccepted(manual.teacher.teacher_clauses[0],[0])&&C.subjectSelectionAccepted(manual.teacher.teacher_clauses[0],[0,1])&&!C.subjectSelectionAccepted(manual.teacher.teacher_clauses[0],[1])&&!C.subjectSelectionAccepted(manual.teacher.teacher_clauses[0],[0,1,2]));

console.log(JSON.stringify({passed:checks.length,checks},null,2));
