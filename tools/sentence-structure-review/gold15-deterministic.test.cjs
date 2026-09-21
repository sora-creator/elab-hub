const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const C=require('./core.js');
const pilotPath='output/sentence-structure-pilot/PILOT_50_ANNOTATIONS.json';
const sourceText=fs.readFileSync(pilotPath,'utf8');
const pilot=JSON.parse(sourceText);
const fingerprint=crypto.createHash('sha256').update(sourceText).digest('hex');
const fresh=()=>C.fromPilot(pilot,fingerprint);
const row=(d,id)=>d.records.find(x=>x.sentence_id===id);
const clause=(d,id,cid)=>row(d,id).teacher.teacher_clauses.find(x=>x.clause_id===cid);
const spans=c=>c.teacher_predicates.map(p=>p.auto_student_verb_span_indexes);

test('full student subject spans expand deterministically without changing parser heads',()=>{
  const d=fresh(),cases=[
    ['corpus:2450','c2',[9,10]],
    ['corpus:2452','c2',[4,5,6]],
    ['corpus:2452','c3',[12,13]],
    ['corpus:2501','c1',[0,1,2]],
    ['corpus:2581','c1',[15,16,17]],
    ['corpus:2485','c2',[5,6,7,8]],
    ['corpus:2485','c3',[11,12]],
    ['corpus:2485','c4',[25,26,27]],
    ['corpus:2480','c2',[3,4]],
    ['corpus:2480','c4',[17,18]],
    ['corpus:2604','c1',[0,1,2,3]],
    ['corpus:2604','c2',[7,8]],
    ['corpus:23349','c1',[1,2]],
    ['corpus:24820','c1',[0,1,2,3,4,5]]
  ];
  for(const [id,cid,expected] of cases)assert.deepEqual(clause(d,id,cid).auto_subject_indexes,expected,`${id}/${cid}`);
  assert.deepEqual(row(d,'corpus:24820').auto.clauses[0].subject_core_token_indexes,[4,5]);
});

test('clause markers and relative clauses do not leak into nominal subject spans',()=>{
  const d=fresh();
  assert.deepEqual(clause(d,'corpus:2580','c3').auto_subject_indexes,[7,8]);
  assert.deepEqual(clause(d,'corpus:2480','c2').auto_subject_indexes,[3,4]);
  assert(!clause(d,'corpus:2480','c2').auto_subject_indexes.includes(5));
  assert.deepEqual(clause(d,'corpus:2961','c1').auto_subject_indexes,[0,1,2]);
});

test('subject projection includes narrow of-complements, excludes appositives, and preserves subject coordination',()=>{
  const d=fresh();
  assert.deepEqual(clause(d,'corpus:25255','c1').auto_subject_indexes,[1,2,3,4]);
  assert.deepEqual(clause(d,'corpus:59138','c4').auto_subject_indexes,[23,24,25,26,27,28,29]);
  assert.deepEqual(clause(d,'corpus:23591','c1').auto_subject_indexes,[0]);
  assert.deepEqual(clause(d,'corpus:59138','c1').auto_subject_indexes,[0,1,2,3,4]);
});

test('subject projection does not absorb predicate coordination or verb-attached prepositions',()=>{
  const d=fresh();
  assert.deepEqual(clause(d,'corpus:2449','c1').auto_subject_indexes,[0]);
  assert(!clause(d,'corpus:2449','c1').auto_subject_indexes.includes(10));
  assert.deepEqual(clause(d,'corpus:26237','c1').auto_subject_indexes,[0,1]);
});

test('direct predicate negation is included without unrelated adverbs',()=>{
  const d=fresh();
  assert.deepEqual(spans(clause(d,'corpus:2542','c2'))[0],[5,6,7]);
  assert.deepEqual(spans(clause(d,'corpus:2542','c3'))[0],[15,16,17]);
  assert.deepEqual(spans(clause(d,'corpus:2486','c4'))[0],[32,33,34,35]);
  const expectSpan=spans(clause(d,'corpus:2479','c2'))[0];
  assert(!expectSpan.includes(7),'probably must stay outside the student verb span');
});

test('verified particles are included while ordinary prepositions are not generalized',()=>{
  const d=fresh();
  assert.deepEqual(spans(clause(d,'corpus:2581','c2'))[0],[2,3,4,5]);
  assert.deepEqual(spans(clause(d,'corpus:27119','c1'))[0],[4,5]);
  assert.deepEqual(spans(clause(d,'corpus:2480','c3'))[0],[6]);
});

test('parallel predicate evidence stays isolated',()=>{
  const d=fresh();
  assert.deepEqual(spans(clause(d,'corpus:2449','c1')),[[1,2],[11,12]]);
  assert.deepEqual(spans(clause(d,'corpus:2480','c5')),[[23,24],[35]]);
  assert.deepEqual(spans(clause(d,'corpus:2580','c3')),[[9,10],[12,13,14]]);
});

test('clause, Skill, Level and be+p.p. projections remain unchanged',()=>{
  const d=fresh();
  for(const r of d.records){
    assert.deepEqual(r.teacher.teacher_clauses.map(c=>[c.clause_id,c.teacher_type,c.teacher_parent,c.teacher_depth,c.teacher_start,c.teacher_end]),r.auto.clauses.map(c=>[c.clause_id,c.clause_type,c.parent_clause_id,c.depth,c.start_token,c.end_token]));
    assert.deepEqual(r.teacher.teacher_skills,r.auto.skills);
  }
  const excited=clause(d,'corpus:2449','c1').teacher_predicates[1],performed=clause(d,'corpus:2486','c4').teacher_predicates[0],dismissive=clause(d,'corpus:2486','c2').teacher_predicates[0];
  assert.equal(excited.auto_be_pp_classification,'ADJECTIVAL');
  assert.equal(performed.auto_be_pp_classification,'PASSIVE');
  assert.equal(performed.auto_be_pp_candidate_index,35);
  assert.equal(dismissive.auto_be_pp_classification,null);
  assert.equal(row(d,'corpus:2486').auto.teacher_level_candidate,'S5');
});

test('legacy auto provenance migrates without changing canonical teacher Gold',()=>{
  const d=fresh(),r=row(d,'corpus:2480');
  C.verifySourceFromPdf(r,{pdf_opened:true,pdf_reference:'GOLD15_FIX_TEST.pdf',pdf_path:'GOLD15_FIX_TEST.pdf',page:1});
  for(const c of r.teacher.teacher_clauses)C.confirmClause(r,c.clause_id);
  C.verify(r,'skills');C.confirmLevel(r,'S5');C.verify(r,'gold');
  const local=C.localSnapshot(d),saved=local.records.find(x=>x.sentence_id==='corpus:2480'),p=saved.teacher.teacher_clauses.find(x=>x.clause_id==='c5').teacher_predicates[1];
  p.auto_student_verb_span_indexes=[23,24,35];p.auto_finite_carrier_indexes=[23];p.auto_auxiliary_indexes=[23];
  const canonicalBefore=JSON.stringify(saved.teacher,(key,value)=>key.startsWith('auto_')?undefined:value),historyBefore=JSON.stringify(saved.history),restored=C.restoreLocal(local,fresh()),rr=row(restored,'corpus:2480'),rp=clause(restored,'corpus:2480','c5').teacher_predicates[1];
  assert.equal(C.status(rr),'GOLD_READY');
  assert.equal(JSON.stringify(rr.teacher,(key,value)=>key.startsWith('auto_')?undefined:value),canonicalBefore);
  assert.equal(JSON.stringify(rr.history),historyBefore);
  assert.deepEqual(rp.auto_student_verb_span_indexes,[35]);
  assert.deepEqual(rp.teacher_student_verb_span_indexes,[35]);
});

test('immutable Pilot source remains byte-identical during deterministic projection',()=>{
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(pilotPath)).digest('hex'),fingerprint);
});
