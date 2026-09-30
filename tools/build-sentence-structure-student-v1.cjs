const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SmartHints = require('../sentence-structure/smart-hints.js');

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

function read(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function tokenText(token) {
  return typeof token === 'string' ? token : String(token.text || token.token || '');
}

function keptJunctions(items) {
  return (items || [])
    .filter(item => !item.decision || item.decision === 'KEEP')
    .map(item => Number(item.junction))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function approvedExpressions(review) {
  const decisions = review.expression_proposal_reviews || {};
  return (review.ai_expression_candidates || [])
    .filter(item => decisions[item.proposal_id]?.decision === 'APPROVED')
    .map(item => ({
      expression_id: decisions[item.proposal_id].candidate_id || item.proposal_id,
      expression: item.canonical_expression,
      meaning: item.display_meaning,
      token_indexes: item.source_token_indexes || []
    }));
}

function main() {
  const a = args(process.argv);
  const required = ['structure-pilot', 'structure-holdout', 'chunk-dataset', 'chunk-review', 'out'];
  for (const key of required) if (!a[key]) throw new Error(`Missing --${key}`);

  const structure = [...read(a['structure-pilot']).records, ...read(a['structure-holdout']).records];
  const dataset = read(a['chunk-dataset']);
  const chunkReview = read(a['chunk-review']);
  const records = dataset.record_ids.map(sentenceId => {
    const base = dataset.records.find(item => item.sentence_id === sentenceId);
    const reviewedStructure = structure.find(item => item.sentence_id === sentenceId);
    const reviewedChunk = chunkReview.records.find(item => item.sentence_id === sentenceId);
    if (!base || !reviewedStructure || !reviewedChunk) throw new Error(`Missing reviewed input: ${sentenceId}`);
    if (reviewedStructure.review_status !== 'GOLD_READY' || !reviewedStructure.teacher?.gold_approved) {
      throw new Error(`Structure is not Gold: ${sentenceId}`);
    }
    const text = reviewedStructure.teacher.teacher_corrected_text || reviewedStructure.auto.text;
    if (text !== base.text) throw new Error(`Frozen text mismatch: ${sentenceId}`);
    const tokens = base.tokens.map(tokenText);
    const subjects = [];
    const verbs = [];
    const autoClauses = new Map((reviewedStructure.auto?.clauses || []).map(clause => [clause.clause_id, clause]));
    const clauseMeta = [];
    for (const clause of reviewedStructure.teacher.teacher_clauses) {
      const autoClause = autoClauses.get(clause.clause_id) || {};
      const primarySubject = [...(clause.teacher_primary_subject_span || clause.teacher_subject_indexes || [])];
      const markerIndexes = autoClause.marker_token_indexes || [];
      subjects.push({
        clause_id: clause.clause_id,
        primary: primarySubject,
        acceptable: (clause.teacher_acceptable_subject_spans || []).map(span => [...span])
      });
      clauseMeta.push({
        clause_id: clause.clause_id,
        type: clause.teacher_type || autoClause.clause_type || '',
        marker_form: autoClause.marker_form || '',
        subject_is_marker: markerIndexes.some(index => primarySubject.includes(index))
      });
      for (const predicate of clause.teacher_predicates || []) {
        verbs.push({
          clause_id: clause.clause_id,
          predicate_id: predicate.predicate_id,
          indexes: [...predicate.teacher_student_verb_span_indexes]
        });
      }
    }
    const boundaries = (reviewedChunk.teacher_boundary_policy || reviewedChunk.canonical_boundary_policy || [])
      .map(item => ({ junction: Number(item.junction), policy: item.policy }))
      .sort((x, y) => x.junction - y.junction);
    if (boundaries.length !== Math.max(0, tokens.length - 1)) throw new Error(`Incomplete boundary policy: ${sentenceId}`);
    if (subjects.some(item => !item.primary.length) || verbs.some(item => !item.indexes.length)) {
      throw new Error(`Empty student answer span: ${sentenceId}`);
    }
    return {
      sentence_id: sentenceId,
      text,
      tokens,
      structure_level: reviewedStructure.teacher.teacher_level,
      subjects,
      verbs,
      clause_meta: clauseMeta,
      sv_hint: SmartHints.chooseSmartHint(reviewedStructure, subjects, verbs, tokens),
      boundaries,
      support: {
        foundation: keptJunctions(reviewedChunk.teacher_foundation_support_policy),
        beginner: keptJunctions(reviewedChunk.teacher_support_split_policy)
      },
      expressions: approvedExpressions(reviewedChunk)
    };
  });

  const canonical = JSON.stringify({ dataset_id: 'sentence-structure-student-v1-pilot12', records });
  const bundle = {
    dataset_id: 'sentence-structure-student-v1-pilot12',
    version: 1,
    record_count: records.length,
    fingerprint: crypto.createHash('sha256').update(canonical).digest('hex'),
    generated_at: new Date().toISOString(),
    records
  };
  const destination = path.resolve(a.out);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1=${JSON.stringify(bundle)};\n`);
  console.log(JSON.stringify({ output: destination, records: records.length, fingerprint: bundle.fingerprint }, null, 2));
}

if (require.main === module) main();
