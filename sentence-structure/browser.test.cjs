const path = require('node:path');
const assert = require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(__dirname, '../.pw-browsers');
const { chromium } = require('playwright');
const base = 'http://localhost:8010/%ED%95%99%EC%9B%90/%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/%ED%86%B5%ED%95%A9%20%EC%9B%B9%EC%95%B1/sentence-structure/index.html';
const normalize = value => String(value).replace(/\s+/g, ' ').trim();
const capabilityWithHint = level => `${Buffer.from(JSON.stringify({ metadata: { hint_level: level } })).toString('base64url')}.test-signature`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
  const seededScopes = new WeakMap();
  const dragSpan = async (targetPage, start, end) => {
    const first = await targetPage.locator(`[data-token="${start}"]`).boundingBox();
    const last = await targetPage.locator(`[data-token="${end}"]`).boundingBox();
    assert.ok(first && last, `token span ${start}-${end} is visible`);
    await targetPage.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await targetPage.mouse.down();
    await targetPage.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: Math.max(2, Math.abs(end - start) * 3) });
    await targetPage.mouse.up();
  };
  const startPractice = async targetPage => {
    if (await targetPage.locator('[data-start-practice]').count()) await targetPage.click('[data-start-practice]');
  };
  const seedStructureReview = async (targetPage, sentenceId, subjects, verbs, scope) => {
    await targetPage.goto(`${base}?sentence_id=${encodeURIComponent(sentenceId)}&local_test_scope=${encodeURIComponent(scope)}`);
    await targetPage.waitForLoadState('networkidle');
    if (seededScopes.get(targetPage) !== scope) {
      await targetPage.evaluate(() => localStorage.removeItem(ELABSentenceStructurePractice.getStorageKey()));
      await targetPage.reload();
      await targetPage.waitForLoadState('networkidle');
      seededScopes.set(targetPage, scope);
    }
    await targetPage.evaluate(({ subjects, verbs }) => {
      const state = ELABSentenceStructurePractice.getState();
      state.intro_complete = true;
      state.draft.subject_answers = subjects;
      state.draft.verb_answers = verbs;
      state.draft.subject_attempts = 2;
      state.draft.verb_attempts = 2;
      state.draft.stage = 'structure-review';
      state.draft.structure_result = ELABSentenceStructureStudentCore.evaluateStructure(ELABSentenceStructurePractice.getRecord(), subjects, verbs);
      localStorage.setItem(ELABSentenceStructurePractice.getStorageKey(), JSON.stringify(state));
    }, { subjects, verbs });
    await targetPage.reload();
    await targetPage.waitForLoadState('networkidle');
  };
  try {
    await page.goto(`${base}?sentence_id=corpus%3A25018&reading_support=foundation`);
    await page.waitForLoadState('networkidle');
    check('first session entry shows the nine-rule intro before the four learning steps', await page.locator('#chunk-intro').count() === 1 && await page.locator('.step-progress-shell').count() === 0);
    check('intro contains all nine rules and the free-form reading message', await page.locator('#chunk-intro .chunk-rule-detail').count() === 9 && (await page.locator('.chunk-intro-caution').innerText()).includes('내가 읽기 편한 의미 단위'));
    check('intro has one clear practice start action', (await page.locator('[data-start-practice]').innerText()).includes('연습 시작하기'));
    await page.screenshot({ path: path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-chunk-intro.png'), fullPage: true });
    await page.click('[data-start-practice]');
    check('student page loads reviewed acceptable-subject sentence', normalize(await page.locator('.sentence').innerText()) === 'We all know this feeling.');
    check('sentence tokens retain visible word spacing', await page.evaluate(() => { const boxes = [...document.querySelectorAll('.sentence .token')].map(node => node.getBoundingClientRect()); return boxes.slice(1).every((box, index) => Math.abs(box.top - boxes[index].top) > 2 || box.left - boxes[index].right >= 3); }));
    check('S1 level is visible without internal parser data', (await page.locator('.level-badge').innerText()).includes('S1'));
    check('internal developer metadata is hidden', await page.locator('text=dependency').count() === 0 && await page.locator('text=predicate').count() === 0);
    check('step 1 is current on sentence entry', await page.locator('[data-learning-step="1"][aria-current="step"]').count() === 1);
    check('student-friendly four-step labels are always visible', await page.locator('.step-progress-item').allTextContents().then(items => items.join(' ').includes('주어·동사 찾기') && items.join(' ').includes('의미 단위로 끊기') && items.join(' ').includes('핵심 표현 확인') && items.join(' ').includes('문장 완료')));
    check('internal learning terms stay hidden from students', await page.locator('body').innerText().then(text => !['Chunking', 'canonical', 'MUST_SPLIT', 'OPTIONAL_SPLIT', 'NO_SPLIT', 'FOUNDATION', 'BEGINNER', 'V5', 'expression candidate', 'predicate', 'clause'].some(term => text.includes(term))));
    check('step indicator stays sticky at the top', await page.locator('.step-progress-shell').evaluate(node => getComputedStyle(node).position === 'sticky'));
    check('current task is visually separate from orientation progress', await page.locator('.current-task').count() === 1 && await page.locator('.current-step-copy').count() === 0);
    check('sentence entry makes the subject task explicit', (await page.locator('.current-task h2').innerText()).includes('주어를 찾아보세요'));
    check('sentence is presented as the active workspace', await page.locator('.sentence-card.active-workspace').count() === 1);
    check('simple sentence does not show a forced smart hint', await page.locator('.sv-hint-card').count() === 0);
    check('desktop selection instruction is immediately visible', await page.locator('.desktop-method:visible').innerText().then(text => text.includes('클릭') && text.includes('한 단어') && text.includes('드래그') && text.includes('여러 단어')));
    check('selection instruction sits between task and sentence', await page.evaluate(() => { const task = document.querySelector('.current-task'), guide = document.querySelector('.selection-instruction'), sentence = document.querySelector('.sentence-card'); return task.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING && guide.compareDocumentPosition(sentence) & Node.DOCUMENT_POSITION_FOLLOWING; }));
    check('selection instruction stays visually secondary to current task', await page.evaluate(() => { const task = getComputedStyle(document.querySelector('.current-task h2')), guide = getComputedStyle(document.querySelector('.selection-method')); return parseFloat(task.fontSize) > parseFloat(guide.fontSize); }));

    check('no scoring appears before submit', await page.locator('.feedback.success,.feedback.error').count() === 0 && await page.evaluate(() => ELABSentenceStructurePractice.getState().draft.structure_result === null));
    check('legacy add button and large role buttons are absent', await page.locator('[data-add-answer],.mode-button').count() === 0);
    await page.click('[data-mode="verb"]');
    check('manual role toggle selects verb', await page.locator('[data-mode="verb"].active').count() === 1);
    await page.click('[data-mode="subject"]');
    await page.click('[data-token="0"]');
    check('subject entry automatically advances to verb', await page.locator('[data-mode="verb"].active').count() === 1);
    check('subject completion immediately updates the current task', (await page.locator('.current-task h2').innerText()).includes('이 주어와 연결되는 동사를'));
    check('registered subject is compact and edit controls stay hidden', await page.locator('[data-answer-menu="subject:0"]').count() === 1 && await page.locator('[data-edit-answer],[data-remove-answer],[data-move-answer]').count() === 0);
    await page.click('[data-answer-menu="subject:0"]');
    check('answer edit controls appear only after answer click', await page.locator('[data-edit-answer="subject:0"],[data-remove-answer="subject:0"]').count() === 2);
    await page.click('[data-remove-answer="subject:0"]');
    check('subject delete returns active role to subject', await page.locator('[data-mode="subject"].active').count() === 1 && await page.evaluate(() => ELABSentenceStructurePractice.getState().draft.subject_answers.length === 0));
    await page.keyboard.press('Control+Z');
    check('Ctrl+Z restores deleted subject only', await page.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0]]' && ELABSentenceStructurePractice.getState().draft.verb_answers.length === 0));
    await page.click('[data-answer-menu="subject:0"]');
    await page.click('[data-edit-answer="subject:0"]');
    await dragSpan(page, 0, 1);
    check('multiword subject replaces existing slot', await page.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0,1]]'));
    await page.click('[data-token="2"]');
    await page.click('[data-answer-menu="verb:0"]');
    await page.click('[data-remove-answer="verb:0"]');
    check('verb delete returns active role to verb', await page.locator('[data-mode="verb"].active').count() === 1 && await page.evaluate(() => ELABSentenceStructurePractice.getState().draft.verb_answers.length === 0));
    await page.click('[data-undo]');
    check('undo button restores deleted verb', await page.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.verb_answers) === '[[2]]'));
    await page.click('[data-answer-menu="subject:0"]');
    await page.click('[data-edit-answer="subject:0"]');
    await page.click('[data-token="0"]');
    check('subject can be changed after both roles are filled without changing verb', await page.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0]]' && JSON.stringify(ELABSentenceStructurePractice.getState().draft.verb_answers) === '[[2]]'));
    await page.keyboard.press('Control+Z');
    await page.click('[data-cancel-edit]');
    check('undo restores replaced multiword subject', await page.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0,1]]' && JSON.stringify(ELABSentenceStructurePractice.getState().draft.verb_answers) === '[[2]]'));
    check('still no scoring before final submit', await page.locator('.feedback.success,.feedback.error').count() === 0 && await page.evaluate(() => ELABSentenceStructurePractice.getState().draft.structure_result === null));
    await page.click('[data-check-structure]');
    check('acceptable subject We all passes only after submit', await page.locator('.feedback.success').count() === 1);
    check('S/V completion marks step 1 done and step 2 current', await page.locator('[data-learning-step="1"].completed').count() === 1 && await page.locator('[data-learning-step="2"][aria-current="step"]').count() === 1);
    check('step 1 CTA clearly starts the next stage', (await page.locator('[data-go-chunk]').innerText()).includes('2단계 시작: 의미 단위로 끊기'));
    check('step 1 review uses a prominent completion banner', await page.locator('.review-complete-banner h2').innerText() === '정답 확인 완료' && await page.locator('.review-complete-banner p').innerText() === '현재는 정답 확인 화면입니다. 이 단계의 답은 더 이상 수정되지 않습니다.');
    check('step 1 review section is explicitly titled as answer review', await page.locator('#structure-step h2').innerText() === '주어·동사 정답 확인');
    check('step 1 review cards show read-only status badges', await page.locator('.sentence-card .review-status').innerText() === '확인 전용' && await page.locator('#structure-step .step-review-badge').innerText() === '수정 불가');
    check('step 1 review tokens are disabled and the stepper says complete', await page.locator('[data-token]').first().isDisabled() && (await page.locator('[data-learning-step="1"]').innerText()).includes('완료'));
    await page.click('[data-go-chunk]');
    await page.waitForTimeout(50);
    check('chunk screen keeps step 2 current', await page.locator('[data-learning-step="2"][aria-current="step"]').count() === 1);
    check('chunk task is explicit and imperative', (await page.locator('.current-task h2').innerText()).includes('의미 단위로 나눠보세요') && (await page.locator('.current-task p').innerText()).includes('끊고 싶은 위치'));
    check('step 2 removes the duplicate step 1 sentence card', await page.locator('.sentence-card').count() === 0 && await page.locator('text=여기에서 직접 선택하세요').count() === 0);
    check('slash sentence is the only main active workspace', await page.locator('.chunk-workspace').count() === 1 && await page.locator('.chunk-sentence').count() === 1);
    check('step 2 workspace gives direct click instruction', (await page.locator('.chunk-workspace-head').innerText()).includes('여기에서 끊어읽기') && (await page.locator('.chunk-workspace-head').innerText()).includes('끊고 싶은 단어 사이'));
    check('completed step 1 stays compact in progress only', await page.locator('[data-learning-step="1"].completed').count() === 1 && await page.locator('.answer-key,.registered-answers').count() === 0);
    check('current learning card receives focus', await page.evaluate(() => document.activeElement?.id === 'chunk-step'));
    check('step 2 hides the nine-rule guide and keeps only a small reopen action', await page.locator('.chunk-rule-guide,.chunk-rule-detail').count() === 0 && await page.locator('[data-rule-guide-open]').count() === 1);
    await page.click('[data-rule-guide-open]');
    check('reopen action shows all nine rules in an overlay', await page.locator('.chunk-guide-dialog .chunk-rule-detail').count() === 9 && await page.locator('.chunk-guide-dialog[role="dialog"]').count() === 1);
    await page.click('[data-rule-guide-close]');
    check('closing the guide returns to the unchanged chunk workspace', await page.locator('.chunk-guide-dialog').count() === 0 && await page.locator('.chunk-workspace').count() === 1);
    check('foundation support remains internal without preselecting junctions', await page.evaluate(() => ELABSentenceStructureStudentCore.hintJunctions(ELABSentenceStructurePractice.getRecord(), 'foundation').length >= 0) && await page.locator('.junction.selected').count() === 0);
    await page.click('[data-junction="0"]');
    await page.click('[data-check-chunk]');
    check('NO_SPLIT choice completes without red correction feedback', await page.locator('.feedback.error,.feedback-item,.required-missed,.forbidden-used').count() === 0);
    check('V5-free sentence auto-completes step 3 and advances to step 4', await page.locator('[data-learning-step="2"].completed').count() === 1 && await page.locator('[data-learning-step="3"].completed').count() === 1 && await page.locator('[data-learning-step="4"][aria-current="step"]').count() === 1);
    check('free-form step 2 completion goes directly to sentence completion', await page.locator('#next-step').count() === 1);
    check('step 4 shows sentence completion before navigation', await page.locator('#next-step').count() === 1 && (await page.locator('#next-step h2').innerText()).includes('오늘 문장 학습 완료'));
    check('step 4 CTA is navigation only', (await page.locator('[data-next]').innerText()).includes('다음 문장'));
    await page.click('[data-next]');
    check('new sentence resets progress to step 1', await page.locator('[data-learning-step="1"][aria-current="step"]').count() === 1 && await page.locator('.step-progress-item.completed').count() === 0);
    check('sentence result uses local-only result contract', await page.evaluate(() => { const r = ELABSentenceStructurePractice.getResults()[0]; return r.sentence_id === 'corpus:25018' && r.subject_correct && r.verb_correct && !r.sv_hint_used && r.sv_hint_type === null && r.sv_hint_level === 0 && !r.hint_used && r.reading_support_level === 'foundation'; }));
    const currentBeforeReload = await page.evaluate(() => ELABSentenceStructurePractice.getState().current_index);
    await page.reload();
    await page.waitForLoadState('networkidle');
    check('F5 restores progress without repeating the session intro', await page.evaluate(index => ELABSentenceStructurePractice.getState().current_index === index && ELABSentenceStructurePractice.getResults().length === 1, currentBeforeReload) && await page.locator('#chunk-intro').count() === 0);

    const contracts = await page.evaluate(() => {
      const C = ELABSentenceStructureStudentCore, rows = ELAB_SENTENCE_STRUCTURE_STUDENT_V1.records, row = id => rows.find(r => r.sentence_id === id);
      const simple = row('corpus:2970'), multiple = row('corpus:23568'), acceptable = row('corpus:25018'), wanted = row('corpus:2590'), necessity = row('corpus:59087');
      const optional = wanted.boundaries.find(x => x.policy === 'OPTIONAL_SPLIT').junction;
      const must = multiple.boundaries.find(x => x.policy === 'MUST_SPLIT').junction;
      const no = multiple.boundaries.find(x => x.policy === 'NO_SPLIT').junction;
      const needSubjects = necessity.subjects.map(x => x.primary), needVerbs = necessity.verbs.map(x => x.indexes);
      return {
        simpleS1: simple.structure_level === 'S1' && C.evaluateStructure(simple, [[0]], [[2]]).correct,
        multipleSV: multiple.subjects.length === 3 && multiple.verbs.length === 3 && C.evaluateStructure(multiple, multiple.subjects.map(x => x.primary), multiple.verbs.map(x => x.indexes)).correct,
        acceptableExact: C.evaluateStructure(acceptable, [[0]], [[2]]).correct && C.evaluateStructure(acceptable, [[0, 1]], [[2]]).correct && !C.evaluateStructure(acceptable, [[1]], [[2]]).correct,
        necessityWhole: needVerbs.some(x => C.sameSpan(x, [24, 25, 26, 27])) && C.evaluateStructure(necessity, needSubjects, needVerbs).correct,
        wantedOnly: C.evaluateStructure(wanted, [[0]], [[1]]).correct && !C.evaluateStructure(wanted, [[0]], [[1, 2, 3]]).correct,
        optionalBoth: C.evaluateChunks(wanted, []).correct && C.evaluateChunks(wanted, [optional]).correct,
        mustMissing: C.evaluateChunks(multiple, []).required_missed.includes(must),
        noSplitViolation: C.evaluateChunks(multiple, [must, no]).forbidden_used.includes(no),
        foundationMore: C.hintJunctions(necessity, 'foundation').length > C.hintJunctions(necessity, 'advanced').length,
        advancedMinimal: C.hintJunctions(necessity, 'advanced').every(j => necessity.boundaries.find(x => x.junction === j).policy === 'MUST_SPLIT'),
        expressionYes: wanted.expressions.some(x => x.expression === 'blow money on ~'),
        expressionNo: acceptable.expressions.length === 0,
        cleanMarker: !wanted.text.includes('②')
      };
    });
    for (const [name, value] of Object.entries(contracts)) check(name, value);

    const grammarCases = await page.evaluate(() => {
      const N = ELABSentenceStructureSVContinuation;
      const make = (clauses, counts = clauses.map(() => 1)) => ({
        sentence_id: 'browser-synthetic', clause_meta: clauses,
        subjects: clauses.map(clause => ({ clause_id: clause.clause_id, primary: [0], acceptable: [] })),
        verbs: clauses.flatMap((clause, clauseIndex) => Array.from({ length: counts[clauseIndex] || 0 }, (_, predicateIndex) => ({ clause_id: clause.clause_id, predicate_id: `p${predicateIndex + 1}`, indexes: [1] })))
      });
      const next = (record, subjects = 1, verbs = 1) => N.nextExpectedTarget(record, { subject_answers: Array.from({ length: subjects }, () => [0]), verb_answers: Array.from({ length: verbs }, () => [1]) });
      const two = second => [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', ...second }];
      return {
        simple: next(make([{ clause_id: 'c1', type: 'MAIN' }])).role === 'COMPLETE',
        that: next(make(two({ type: 'NOUN_THAT', marker_form: 'OVERT' }))).reason === 'EXPLICIT_THAT',
        omittedThat: next(make(two({ type: 'NOUN_THAT', marker_form: 'ZERO' }))).reason === 'OMITTED_THAT',
        subjectRelative: next(make(two({ type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }))).reason === 'RELATIVE_SUBJECT',
        objectRelative: next(make(two({ type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: false }))).reason === 'RELATIVE_OBJECT',
        omittedRelative: next(make(two({ type: 'RELATIVE', marker_form: 'ZERO' }))).reason === 'OMITTED_RELATIVE',
        coordinatedPredicates: next(make([{ clause_id: 'c1', type: 'MAIN' }], [2])).reason === 'COORDINATED_PREDICATE',
        coordinatedClauses: next(make(two({ type: 'MAIN' }))).reason === 'COORDINATED_CLAUSE',
        adverbial: next(make(two({ type: 'ADVERBIAL', marker_form: 'OVERT' }))).reason === 'ADVERBIAL',
        content: next(make(two({ type: 'NOUN_WH', marker_form: 'OVERT' }))).reason === 'CONTENT_CLAUSE'
      };
    });
    for (const [name, value] of Object.entries(grammarCases)) check(`browser grammar fixture ${name}`, value);

    for (const hintCase of [
      { level: 'NONE', card: false, more: false },
      { level: 'BASIC', card: true, more: false },
      { level: 'DETAILED', card: true, more: true }
    ]) {
      const hintLevelContext = await browser.newContext({ viewport: { width: 900, height: 760 } });
      const hintLevelPage = await hintLevelContext.newPage();
      hintLevelPage.on('pageerror', error => errors.push(error.message));
      hintLevelPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await hintLevelPage.goto(`${base}?sentence_id=corpus%3A23568&hint_level=${hintCase.level}`);
      await hintLevelPage.waitForLoadState('networkidle');
      await startPractice(hintLevelPage);
      check(`${hintCase.level} assignment setting loads as source of truth`, await hintLevelPage.evaluate(level => ELABSentenceStructurePractice.getAssignedHintLevel() === level && ELABSentenceStructurePractice.getState().draft.assigned_hint_level === level, hintCase.level));
      check(`${hintCase.level} smart hint visibility`, (await hintLevelPage.locator('.sv-hint-card').count() > 0) === hintCase.card);
      check(`${hintCase.level} second hint availability`, (await hintLevelPage.locator('[data-sv-hint-more]').count() > 0) === hintCase.more);
      check(`${hintCase.level} has no student hint-level control`, await hintLevelPage.locator('[name="hint_level"],[data-hint-level]').count() === 0);
      check(`${hintCase.level} leaves S1-S5 unchanged`, (await hintLevelPage.locator('.level-badge').innerText()).includes('S4'));
      await hintLevelContext.close();
    }
    const noHintContext = await browser.newContext({ viewport: { width: 900, height: 760 } });
    const noHintPage = await noHintContext.newPage();
    noHintPage.on('pageerror', error => errors.push(error.message));
    noHintPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await noHintPage.goto(`${base}?sentence_id=corpus%3A25018&hint_level=DETAILED`);
    await noHintPage.waitForLoadState('networkidle');
    await startPractice(noHintPage);
    check('simple sentence suppresses a non-applicable hint even when DETAILED', await noHintPage.locator('.sv-hint-card').count() === 0);
    await noHintContext.close();

    const incompleteRemoteContext = await browser.newContext({ viewport: { width: 900, height: 760 } });
    const incompleteRemotePage = await incompleteRemoteContext.newPage();
    const incompleteRemoteErrors = [];
    incompleteRemotePage.on('pageerror', error => incompleteRemoteErrors.push(error.message));
    incompleteRemotePage.on('console', message => { if (message.type() === 'error') incompleteRemoteErrors.push(message.text()); });
    await incompleteRemotePage.goto(`${base}?sentence_id=corpus%3A23568&hint_level=DETAILED&assignment_target_id=incomplete-remote&assignmentCapability=${encodeURIComponent(capabilityWithHint('NONE'))}`);
    await incompleteRemotePage.waitForLoadState('networkidle');
    check('incomplete remote assignment shows an explicit launch error without local fallback', await incompleteRemotePage.locator('.load-error').innerText().then(text => text.includes('과제 연결 정보')) && await incompleteRemotePage.evaluate(() => typeof ELABSentenceStructurePractice === 'undefined') && await incompleteRemotePage.locator('.count-badge').count() === 0 && incompleteRemoteErrors.every(message => message.includes('과제 연결 정보')));
    await incompleteRemoteContext.close();

    const uiFixtures = [
      { name: 'simple', tokens: ['Identity', 'became', 'a', 'problem.'], clauses: [{ clause_id: 'c1', type: 'MAIN' }], subjects: [['c1', [0]]], verbs: [['c1', 'p1', [1]]], first: [[0], [1]], after: '주어·동사 찾기 완료', role: '' },
      { name: 'explicit that', tokens: ['I', 'think', 'that', 'he', 'is', 'right.'], clauses: [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'OVERT' }], subjects: [['c1', [0]], ['c2', [3]]], verbs: [['c1', 'p1', [1]], ['c2', 'p1', [4]]], first: [[0], [1]], after: 'that절 안의 주어', role: 'subject' },
      { name: 'omitted that', tokens: ['I', 'think', 'he', 'is', 'right.'], clauses: [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'NOUN_THAT', marker_form: 'ZERO' }], subjects: [['c1', [0]], ['c2', [2]]], verbs: [['c1', 'p1', [1]], ['c2', 'p1', [3]]], first: [[0], [1]], after: '새 절의 주어', role: 'subject' },
      { name: 'subject relative', tokens: ['the', 'person', 'who', 'lives', 'here'], clauses: [{ clause_id: 'c1', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: true }], subjects: [['c1', [2]]], verbs: [['c1', 'p1', [3]]], initial: '관계절의 주어', first: [[2], [3]], after: '주어·동사 찾기 완료', role: '' },
      { name: 'object relative', tokens: ['the', 'person', 'who', 'I', 'met'], clauses: [{ clause_id: 'c1', type: 'RELATIVE', marker_form: 'OVERT', subject_is_marker: false }], subjects: [['c1', [3]]], verbs: [['c1', 'p1', [4]]], initial: '관계절 안의 주어', first: [[3], [4]], after: '주어·동사 찾기 완료', role: '' },
      { name: 'omitted relative', tokens: ['the', 'person', 'I', 'met'], clauses: [{ clause_id: 'c1', type: 'RELATIVE', marker_form: 'ZERO' }], subjects: [['c1', [2]]], verbs: [['c1', 'p1', [3]]], initial: '명사 뒤 새 절의 주어', first: [[2], [3]], after: '주어·동사 찾기 완료', role: '' },
      { name: 'coordinated predicates', tokens: ['She', 'smiled', 'and', 'waved.'], clauses: [{ clause_id: 'c1', type: 'MAIN' }], subjects: [['c1', [0]]], verbs: [['c1', 'p1', [1]], ['c1', 'p2', [3]]], first: [[0], [1]], after: '같은 주어에 이어지는 동사', role: 'verb' },
      { name: 'coordinated clauses', tokens: ['I', 'stayed', 'home', 'but', 'he', 'went', 'out.'], clauses: [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'MAIN' }], subjects: [['c1', [0]], ['c2', [4]]], verbs: [['c1', 'p1', [1]], ['c2', 'p1', [5]]], first: [[0], [1]], after: '새로운 주어', role: 'subject' },
      { name: 'adverbial', tokens: ['I', 'stayed', 'home', 'because', 'I', 'was', 'tired.'], clauses: [{ clause_id: 'c1', type: 'MAIN' }, { clause_id: 'c2', type: 'ADVERBIAL', marker_form: 'OVERT' }], subjects: [['c1', [0]], ['c2', [4]]], verbs: [['c1', 'p1', [1]], ['c2', 'p1', [5]]], first: [[0], [1]], after: '접속사가 이끄는 절의 주어', role: 'subject' }
    ];
    for (const fixture of uiFixtures) {
      const fixtureContext = await browser.newContext({ viewport: { width: 900, height: 760 } });
      const fixturePage = await fixtureContext.newPage();
      fixturePage.on('pageerror', error => errors.push(error.message));
      fixturePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const record = {
        sentence_id: `fixture:${fixture.name}`, text: fixture.tokens.join(' '), tokens: fixture.tokens, structure_level: 'S2', clause_meta: fixture.clauses,
        subjects: fixture.subjects.map(([clause_id, primary]) => ({ clause_id, primary, acceptable: [] })),
        verbs: fixture.verbs.map(([clause_id, predicate_id, indexes]) => ({ clause_id, predicate_id, indexes })),
        boundaries: fixture.tokens.slice(0, -1).map((_, junction) => ({ junction, policy: 'NO_SPLIT' })), support: { foundation: [], beginner: [] }, expressions: [], sv_hint: null
      };
      await fixturePage.route('**/student-v1-data.js*', route => route.fulfill({ contentType: 'application/javascript', body: `window.ELAB_SENTENCE_STRUCTURE_STUDENT_V1=${JSON.stringify({ dataset_id: 'grammar-ui-fixture', fingerprint: `grammar-${fixture.name}`, records: [record] })};` }));
      await fixturePage.goto(base);
      await fixturePage.waitForLoadState('networkidle');
      await startPractice(fixturePage);
      if (fixture.initial) check(`full UI grammar fixture ${fixture.name} starts with canonical target`, (await fixturePage.locator('.current-task h2').innerText()).includes(fixture.initial));
      await fixturePage.click(`[data-token="${fixture.first[0][0]}"]`);
      await fixturePage.click(`[data-token="${fixture.first[1][0]}"]`);
      const title = await fixturePage.locator('.current-task h2').innerText();
      const activeRole = await fixturePage.locator('.role-toggle.active').count() ? await fixturePage.locator('.role-toggle.active').getAttribute('data-mode') : '';
      check(`full UI grammar fixture ${fixture.name}`, title.includes(fixture.after) && activeRole === fixture.role);
      await fixtureContext.close();
    }

    const multiContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const multiPage = await multiContext.newPage();
    multiPage.on('pageerror', error => errors.push(error.message));
    multiPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await multiPage.goto(`${base}?sentence_id=corpus%3A23568`);
    await multiPage.waitForLoadState('networkidle');
    await startPractice(multiPage);
    const addSpan = async indexes => {
      if (indexes.length === 1) await multiPage.click(`[data-token="${indexes[0]}"]`);
      else await dragSpan(multiPage, indexes[0], indexes[indexes.length - 1]);
    };
    await addSpan([0]);
    await addSpan([1]);
    check('corpus:23568 moves from first pair to omitted-that subject', await multiPage.evaluate(() => ELABSentenceStructurePractice.getState().draft.mode === 'subject') && (await multiPage.locator('.current-task h2').innerText()).includes('새 절의 주어'));
    check('corpus:23568 shows a contextual structure tip without exact answer counts', await multiPage.locator('.sv-continuation-tip').innerText().then(text => text.includes('that이 생략된') && !/\d+개/.test(text)));
    await addSpan([7, 8, 9, 10]);
    check('a good or service registers from one drag gesture', await multiPage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0],[7,8,9,10]]'));
    await addSpan([11]);
    await addSpan([16]);
    await addSpan([18]);
    check('multiple S/V answers can be entered with automatic role flow', await multiPage.evaluate(() => { const d = ELABSentenceStructurePractice.getState().draft; return d.subject_answers.length === 3 && d.verb_answers.length === 3; }));
    await multiPage.click('[data-answer-menu="subject:1"]');
    await multiPage.click('[data-edit-answer="subject:1"]');
    await dragSpan(multiPage, 7, 9);
    check('middle answer can be replaced without changing surrounding slots', await multiPage.evaluate(() => { const d = ELABSentenceStructurePractice.getState().draft; return JSON.stringify(d.subject_answers) === '[[0],[7,8,9],[16]]' && JSON.stringify(d.verb_answers) === '[[1],[11],[18]]'; }));
    await multiPage.keyboard.press('Control+Z');
    await multiPage.click('[data-cancel-edit]');
    check('middle-answer replacement is undoable', await multiPage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0],[7,8,9,10],[16]]'));
    await multiPage.click('[data-answer-menu="subject:1"]');
    await multiPage.click('[data-move-answer="subject:1:-1"]');
    check('answer input order can be adjusted', await multiPage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[7,8,9,10],[0],[16]]'));
    await multiPage.keyboard.press('Control+Z');
    check('answer-order change is undoable', await multiPage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0],[7,8,9,10],[16]]'));
    await multiContext.close();

    const hintContext = await browser.newContext({ viewport: { width: 1000, height: 860 } });
    const hintPage = await hintContext.newPage();
    hintPage.on('pageerror', error => errors.push(error.message));
    hintPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await hintPage.goto(`${base}?sentence_id=corpus%3A23568`);
    await hintPage.waitForLoadState('networkidle');
    await startPractice(hintPage);
    check('smart hint is open by default above the sentence', await hintPage.locator('.sv-hint-card:not(.compact)').count() === 1 && await hintPage.locator('.sv-hint-card').innerText().then(text => text.includes('thinking 뒤에서')));
    check('default-open view does not mark hint as used', await hintPage.evaluate(() => { const d = ELABSentenceStructurePractice.getState().draft; return !d.sv_hint_used && d.sv_hint_level === 0; }));
    check('hint order is task then hint then selection guide then sentence', await hintPage.evaluate(() => { const nodes = ['.current-task', '.sv-hint-card', '.selection-instruction', '.sentence-card'].map(selector => document.querySelector(selector)); return nodes.every(Boolean) && nodes.slice(0, -1).every((node, index) => Boolean(node.compareDocumentPosition(nodes[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)); }));
    check('smart hint and interaction guide use distinct cards', await hintPage.locator('.sv-hint-card + .selection-instruction').count() === 1);
    await hintPage.click('[data-sv-hint-toggle]');
    check('hint can be collapsed to a compact restore action', await hintPage.locator('.sv-hint-card.compact').count() === 1 && (await hintPage.locator('[data-sv-hint-toggle]').innerText()).includes('힌트 다시 보기'));
    await hintPage.click('[data-sv-hint-toggle]');
    check('collapsed hint can be restored', await hintPage.locator('.sv-hint-card:not(.compact)').count() === 1 && (await hintPage.locator('[data-sv-hint-toggle]').innerText()).includes('힌트 숨기기'));
    await hintPage.click('[data-sv-hint-more]');
    check('second-level hint names the structure but not the answer span', await hintPage.locator('.sv-hint-more').innerText().then(text => text.includes('that이 생략된 내용절') && !text.includes('a good or service')));
    check('smart hint provenance is stored in local draft state', await hintPage.evaluate(() => { const d = ELABSentenceStructurePractice.getState().draft; return d.sv_hint_used && d.sv_hint_type === 'OMITTED_THAT' && d.sv_hint_level === 2; }));
    await hintPage.reload();
    await hintPage.waitForLoadState('networkidle');
    check('smart hint level survives F5', await hintPage.evaluate(() => { const d = ELABSentenceStructurePractice.getState().draft; return d.sv_hint_used && d.sv_hint_type === 'OMITTED_THAT' && d.sv_hint_level === 2; }));
    await hintPage.screenshot({ path: path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-smart-hint.png'), fullPage: true });
    await hintPage.click('[data-sv-hint-toggle]');
    await hintPage.click('[data-token="0"]');
    await hintPage.click('[data-token="1"]');
    await dragSpan(hintPage, 7, 10);
    await hintPage.click('[data-token="11"]');
    await hintPage.click('[data-token="16"]');
    await hintPage.click('[data-token="18"]');
    await hintPage.click('[data-check-structure]');
    check('S/V hint leaves the UI when structure review is complete', await hintPage.locator('.sv-hint-card').count() === 0);
    await hintPage.click('[data-go-chunk]');
    check('S/V hint does not occupy the step 2 UI', await hintPage.locator('.sv-hint-card').count() === 0 && await hintPage.locator('#chunk-step').count() === 1);
    await hintPage.click('[data-junction="10"]');
    await hintPage.click('[data-check-chunk]');
    check('free-form completion advances directly to the V5 step', await hintPage.locator('#expression-step').count() === 1);
    await hintPage.click('[data-complete-expression]');
    await hintPage.click('[data-next]');
    check('next sentence resets its smart hint to open', await hintPage.locator('.sv-hint-card:not(.compact)').count() === 1 && await hintPage.evaluate(() => ELABSentenceStructurePractice.getState().draft.sv_hint_open === true));
    check('completed result keeps explicit second-hint usage', await hintPage.evaluate(() => { const r = ELABSentenceStructurePractice.getResults().find(item => item.sentence_id === 'corpus:23568'); return r?.sv_hint_used && r.sv_hint_type === 'OMITTED_THAT' && r.sv_hint_level === 2; }));
    await hintContext.close();

    const coordinationContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const coordinationPage = await coordinationContext.newPage();
    coordinationPage.on('pageerror', error => errors.push(error.message));
    coordinationPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await coordinationPage.goto(`${base}?sentence_id=corpus%3A2449`);
    await coordinationPage.waitForLoadState('networkidle');
    await startPractice(coordinationPage);
    check('coordinated-predicate sentence gets only its relevant default-open hint', await coordinationPage.locator('.sv-hint-card').innerText().then(text => text.includes('and / but / or') && !text.includes('that 뒤')));
    await coordinationPage.click('[data-token="0"]');
    await dragSpan(coordinationPage, 1, 2);
    check('coordinated predicate keeps VERB active without asking for a new subject', await coordinationPage.evaluate(() => ELABSentenceStructurePractice.getState().draft.mode === 'verb') && (await coordinationPage.locator('.current-task h2').innerText()).includes('같은 주어에 이어지는 동사'));
    await dragSpan(coordinationPage, 11, 12);
    await coordinationPage.click('[data-check-structure]');
    await coordinationPage.click('[data-go-chunk]');
    await coordinationPage.waitForTimeout(50);
    check('step 2 entry focuses the guide-and-workspace region', await coordinationPage.evaluate(() => document.activeElement?.id === 'chunk-step'));
    await coordinationPage.click('[data-junction="0"]');
    await coordinationPage.click('[data-junction="3"]');
    check('students may choose multiple free-form slash positions', await coordinationPage.locator('.junction.selected').count() === 2);
    await coordinationPage.click('[data-check-chunk]');
    check('multiple noncanonical positions finish without wrong feedback', await coordinationPage.locator('#next-step').count() === 1 && await coordinationPage.locator('.feedback.error,.feedback-item').count() === 0);
    await coordinationContext.close();

    const adverbGapContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const adverbGapPage = await adverbGapContext.newPage();
    adverbGapPage.on('pageerror', error => errors.push(error.message));
    adverbGapPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await adverbGapPage.goto(`${base}?sentence_id=corpus%3A2479`);
    await adverbGapPage.waitForLoadState('networkidle');
    await startPractice(adverbGapPage);
    await adverbGapPage.click('[data-token="0"]');
    await adverbGapPage.click('[data-token="3"]');
    await adverbGapPage.click('[data-token="5"]');
    await adverbGapPage.click('[data-token="6"]');
    await adverbGapPage.click('[data-mode="verb"]');
    await adverbGapPage.click('[data-token="8"]');
    check('corpus:2479 keeps the actual split-token submission before scoring', await adverbGapPage.evaluate(() => { const d = ELABSentenceStructurePractice.getState().draft; return JSON.stringify(d.subject_answers) === '[[0],[5]]' && JSON.stringify(d.verb_answers) === '[[3],[6],[8]]'; }));
    await adverbGapPage.click('[data-check-structure]');
    check('corpus:2479 accepts can-probably-expect selection as canonical can-expect', await adverbGapPage.evaluate(() => { const r = ELABSentenceStructurePractice.getState().draft.structure_result; return r?.correct && r.subject_correct && r.verb_correct && r.error_types.length === 0; }));
    check('corpus:2479 shows success without a false red review card', await adverbGapPage.locator('.feedback.success').count() === 1 && await adverbGapPage.locator('.feedback.error').count() === 0);
    check('corpus:2479 answer summary renders the teacher verb groups', await adverbGapPage.locator('.answer-key b').allTextContents().then(items => items[0].includes('Scientists') && items[0].includes('we') && items[1].includes('speculate') && items[1].includes('can expect') && !items[1].includes('probably')));
    check('corpus:2479 that-clause requires exactly two subject and two verb answers', await adverbGapPage.evaluate(() => { const r = ELABSentenceStructurePractice.getRecord(); return r.subjects.length === 2 && r.verbs.length === 2 && r.subjects[1].primary[0] === 5; }));
    await adverbGapContext.close();

    const staleContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const stalePage = await staleContext.newPage();
    stalePage.on('pageerror', error => errors.push(error.message));
    stalePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await stalePage.goto(`${base}?sentence_id=corpus%3A2479`);
    await stalePage.waitForLoadState('networkidle');
    await stalePage.evaluate(() => {
      const key = ELABSentenceStructurePractice.getStorageKey();
      const stale = ELABSentenceStructurePractice.getState();
      delete stale.scoring_version;
      stale.intro_complete = true;
      stale.draft.subject_answers = [[0], [5]];
      stale.draft.verb_answers = [[3], [6], [8]];
      stale.draft.subject_attempts = 2;
      stale.draft.verb_attempts = 2;
      stale.draft.stage = 'structure-review';
      stale.draft.structure_result = { correct: false, subject_correct: true, verb_correct: false, subject: { correct: true, missing: [], extra: [] }, verb: { correct: false, missing: [1], extra: [[6, 7, 8]] }, error_types: ['VERB_SPAN'] };
      stale.draft.message = 'old error';
      stale.draft.message_kind = 'error';
      localStorage.setItem(key, JSON.stringify(stale));
    });
    await stalePage.reload();
    await stalePage.waitForLoadState('networkidle');
    check('old corpus:2479 derived result is recomputed from raw answers on load', await stalePage.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); const r = s.draft.structure_result; return s.scoring_version === 'student-v1-23' && r?.correct && r.subject_correct && r.verb_correct && r.error_types.length === 0 && s.draft.message_kind === 'neutral'; }));
    check('migrated corpus:2479 UI has success CTA and no stale red feedback', await stalePage.locator('.feedback.success').count() === 1 && await stalePage.locator('.feedback.error').count() === 0 && await stalePage.locator('[data-go-chunk]').count() === 1);
    await stalePage.reload();
    await stalePage.waitForLoadState('networkidle');
    check('migrated corpus:2479 success survives F5', await stalePage.evaluate(() => ELABSentenceStructurePractice.getState().draft.structure_result?.correct === true) && await stalePage.locator('.feedback.error').count() === 0);
    const reopenedStalePage = await staleContext.newPage();
    await reopenedStalePage.goto(`${base}?sentence_id=corpus%3A2479`);
    await reopenedStalePage.waitForLoadState('networkidle');
    check('migrated corpus:2479 success survives tab reopen', await reopenedStalePage.evaluate(() => ELABSentenceStructurePractice.getState().draft.structure_result?.correct === true) && await reopenedStalePage.locator('.feedback.error').count() === 0);
    await staleContext.close();

    const retryContext = await browser.newContext({ viewport: { width: 900, height: 800 } });
    const retryPage = await retryContext.newPage();
    retryPage.on('pageerror', error => errors.push(error.message));
    retryPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await retryPage.goto(`${base}?sentence_id=corpus%3A2970`);
    await retryPage.waitForLoadState('networkidle');
    await startPractice(retryPage);
    await retryPage.click('[data-token="1"]');
    await retryPage.click('[data-token="2"]');
    await retryPage.click('[data-check-structure]');
    check('first wrong submit remains editable', await retryPage.evaluate(() => ELABSentenceStructurePractice.getState().draft.stage === 'structure'));
    await retryPage.click('[data-check-structure]');
    check('submitted wrong answer shows scoring and retry action', await retryPage.locator('.feedback.error').count() === 1 && await retryPage.locator('[data-retry-structure]').count() === 1);
    check('wrong submission shows raw student answer beside teacher answer', await retryPage.locator('.answer-comparison').count() === 1 && await retryPage.locator('.comparison-panel.student').innerText().then(text => text.includes('then') && text.includes('became')) && await retryPage.locator('.comparison-panel.teacher').innerText().then(text => text.includes('Identity') && text.includes('became')));
    check('subject-only error marks only the wrong student subject', await retryPage.locator('.comparison-panel.student .comparison-answer.mismatch').count() === 1 && await retryPage.locator('.comparison-panel.student .comparison-answer.matched').count() === 1);
    await retryPage.click('[data-retry-structure]');
    check('retry returns to editable answer state', await retryPage.evaluate(() => ELABSentenceStructurePractice.getState().draft.stage === 'structure' && ELABSentenceStructurePractice.getState().draft.structure_result === null));
    await retryContext.close();

    const compareContext = await browser.newContext({ viewport: { width: 1000, height: 850 } });
    const comparePage = await compareContext.newPage();
    comparePage.on('pageerror', error => errors.push(error.message));
    comparePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await seedStructureReview(comparePage, 'corpus:2970', [[0]], [[1]], 'compare-verb-only');
    check('verb-only error keeps the correct subject green and wrong verb orange', await comparePage.locator('.comparison-panel.student .comparison-answer.matched').count() === 1 && await comparePage.locator('.comparison-panel.student .comparison-answer.mismatch').count() === 1);
    await seedStructureReview(comparePage, 'corpus:2970', [[1]], [[0]], 'compare-both');
    check('subject-and-verb error marks both submitted answers for review', await comparePage.locator('.comparison-panel.student .comparison-answer.mismatch').count() === 2);
    await seedStructureReview(comparePage, 'corpus:23568', [[0], [7, 8, 9, 10]], [[1], [11], [18]], 'compare-missing');
    check('missing answer is named without exposing an internal error code', await comparePage.locator('.comparison-answer.canonical.missing').count() === 1 && await comparePage.locator('.missing-note').innerText().then(text => text.includes('빠뜨린 답')) && await comparePage.locator('.answer-comparison').innerText().then(text => !text.includes('MISSING_PREDICATE')));
    await seedStructureReview(comparePage, 'corpus:2970', [[0], [1]], [[2]], 'compare-extra');
    check('extra answer is shown as a friendly review target', await comparePage.locator('.comparison-answer.mismatch').innerText().then(text => text.includes('다시 볼 답')) && await comparePage.locator('.extra-note').count() === 1);
    await seedStructureReview(comparePage, 'corpus:25018', [[0, 1]], [[1]], 'compare-acceptable');
    check('acceptable subject is explicitly shown as another correct answer', await comparePage.locator('.comparison-panel.student .comparison-answer.matched').innerText().then(text => text.includes('We all') && text.includes('이 답도 맞아요')) && await comparePage.locator('.comparison-panel.teacher').innerText().then(text => text.includes('또는 We all')));
    check('acceptable subject tokens are not painted as extra in the sentence', await comparePage.locator('[data-token="1"].answer-extra').count() === 0);
    await seedStructureReview(comparePage, 'corpus:2479', [[0]], [[3], [6, 7, 8]], 'compare-noncontiguous');
    check('accepted non-contiguous surface verb stays green while another missing answer explains the failure', await comparePage.locator('.comparison-panel.student').innerText().then(text => text.includes('can probably expect')) && await comparePage.locator('.comparison-panel.student .comparison-answer.mismatch').count() === 0 && await comparePage.locator('.comparison-answer.canonical.missing').count() === 1);
    check('accepted intervening adverb is not painted as extra in the sentence', await comparePage.locator('[data-token="7"].answer-extra').count() === 0);
    await seedStructureReview(comparePage, 'corpus:23568', [[0], [2], [16]], [[1], [3], [18]], 'compare-multiple');
    check('multiple S/V comparison preserves every raw answer instead of replacing it with canonical', await comparePage.locator('.comparison-panel.student .comparison-answer').count() === 6 && await comparePage.locator('.comparison-panel.teacher .comparison-answer').count() === 6);
    await seedStructureReview(comparePage, 'corpus:2970', [[0]], [[2]], 'compare-correct');
    check('fully correct submission keeps the compact success UX without a large comparison card', await comparePage.locator('.feedback.success').count() === 1 && await comparePage.locator('.answer-comparison').count() === 0 && await comparePage.locator('[data-go-chunk]').count() === 1);
    const lockedReviewBefore = await comparePage.evaluate(() => ({
      draft: JSON.stringify(ELABSentenceStructurePractice.getState().draft),
      tokens: [...document.querySelectorAll('[data-token]')].map(token => ({ className: token.className, pressed: token.getAttribute('aria-pressed'), color: getComputedStyle(token).color }))
    }));
    await comparePage.locator('[data-token="1"]').evaluate(token => token.click());
    await comparePage.locator('[data-token="2"]').evaluate(token => token.click());
    const lockedReviewAfter = await comparePage.evaluate(() => ({
      draft: JSON.stringify(ELABSentenceStructurePractice.getState().draft),
      tokens: [...document.querySelectorAll('[data-token]')].map(token => ({ className: token.className, pressed: token.getAttribute('aria-pressed'), color: getComputedStyle(token).color }))
    }));
    check('answer review token clicks are complete no-ops', JSON.stringify(lockedReviewAfter) === JSON.stringify(lockedReviewBefore));
    await comparePage.click('[data-retry-structure]');
    const retryBefore = await comparePage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft));
    await comparePage.click('[data-token="1"]');
    check('retry re-enables step 1 token interaction', await comparePage.evaluate(before => ELABSentenceStructurePractice.getState().draft.stage === 'structure' && JSON.stringify(ELABSentenceStructurePractice.getState().draft) !== before, retryBefore));
    await seedStructureReview(comparePage, 'corpus:2970', [[0]], [[2]], 'compare-correct');
    await comparePage.click('[data-go-chunk]');
    check('answer review next action enters step 2', await comparePage.evaluate(() => ELABSentenceStructurePractice.getState().draft.stage === 'chunk'));
    const firstReviewJunction = comparePage.locator('[data-junction]').first();
    const reviewJunctionIndex = Number(await firstReviewJunction.getAttribute('data-junction'));
    await firstReviewJunction.click();
    check('step 2 chunking remains interactive after review', await comparePage.evaluate(index => ELABSentenceStructurePractice.getState().draft.chunk_boundaries.includes(index), reviewJunctionIndex));
    await compareContext.close();

    const necessityContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const necessityPage = await necessityContext.newPage();
    necessityPage.on('pageerror', error => errors.push(error.message));
    necessityPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await necessityPage.goto(`${base}?sentence_id=corpus%3A59087`);
    await necessityPage.waitForLoadState('networkidle');
    await startPractice(necessityPage);
    await necessityPage.click('[data-mode="verb"]');
    await dragSpan(necessityPage, 24, 27);
    check('needs to be done registers from one drag gesture', await necessityPage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.verb_answers) === '[[24,25,26,27]]'));
    await necessityContext.close();

    const expressionContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const expressionPage = await expressionContext.newPage();
    expressionPage.on('pageerror', error => errors.push(error.message));
    expressionPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await expressionPage.goto(`${base}?sentence_id=corpus%3A2590`);
    await expressionPage.waitForLoadState('networkidle');
    await startPractice(expressionPage);
    check('V5 sentence displays all four steps', await expressionPage.locator('.step-progress-item').count() === 4 && await expressionPage.locator('[data-learning-step="3"]').count() === 1);
    await expressionPage.click('[data-token="0"]');
    await expressionPage.click('[data-token="1"]');
    check('nonfinite complement sentence completes after They and wanted', (await expressionPage.locator('.current-task h2').innerText()).includes('주어·동사 찾기 완료') && await expressionPage.locator('.role-toggle.active').count() === 0);
    check('nonfinite complement does not show an extra-clause grammar tip', await expressionPage.locator('.sv-continuation-tip').count() === 0);
    await expressionPage.click('[data-check-structure]');
    await expressionPage.click('[data-go-chunk]');
    await expressionPage.click('[data-check-chunk]');
    await expressionPage.waitForTimeout(50);
    check('chunk completion advances V5 sentence to step 3', await expressionPage.locator('[data-learning-step="3"][aria-current="step"]').count() === 1);
    check('expression screen keeps step 3 current', await expressionPage.locator('#expression-step').count() === 1 && await expressionPage.locator('[data-learning-step="3"][aria-current="step"]').count() === 1);
    check('step 3 does not repeat the completed interactive sentence card', await expressionPage.locator('.sentence-card').count() === 0);
    check('expression card receives focus', await expressionPage.evaluate(() => document.activeElement?.id === 'expression-step'));
    await expressionPage.click('[data-complete-expression]');
    check('expression completion advances to step 4', await expressionPage.locator('#next-step').count() === 1 && await expressionPage.locator('[data-learning-step="3"].completed').count() === 1 && await expressionPage.locator('[data-learning-step="4"][aria-current="step"]').count() === 1);
    check('completion screen keeps prior interactive workspaces hidden', await expressionPage.locator('.sentence-card,.chunk-workspace').count() === 0);
    await expressionPage.click('[data-next]');
    check('next V5 sentence resets to step 1', await expressionPage.locator('[data-learning-step="1"][aria-current="step"]').count() === 1);
    await expressionContext.close();

    const verbExpressionContext = await browser.newContext({ viewport: { width: 1000, height: 850 } });
    const verbExpressionPage = await verbExpressionContext.newPage();
    verbExpressionPage.on('pageerror', error => errors.push(error.message));
    verbExpressionPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await seedStructureReview(verbExpressionPage, 'corpus:26237', [[0, 1], [6]], [[2, 3], [7]], 'verb-expression-consist');
    check('verified consists of span is accepted while the answer key keeps canonical consists', await verbExpressionPage.locator('.feedback.success').count() === 1 && await verbExpressionPage.locator('.answer-key').innerText().then(text => text.includes('consists') && !text.includes('consists of')));
    check('step 1 explains the accepted expression span without changing the grammar verb', await verbExpressionPage.locator('.verb-expression-note').innerText().then(text => text.includes('consists') && text.includes('consist of ~')));
    await verbExpressionPage.click('[data-go-chunk]');
    await verbExpressionPage.click('[data-check-chunk]');
    check('step 3 distinguishes the sentence verb from the memorized expression', await verbExpressionPage.locator('.expression-grammar-note').innerText().then(text => text.includes('consists') && text.includes('consist of ~')));
    check('step 3 shows the verified expression and meaning', await verbExpressionPage.locator('.expression').innerText().then(text => text.includes('consist of ~') && text.includes('~로 구성되다')));
    await verbExpressionContext.close();

    const restartContext = await browser.newContext({ viewport: { width: 1000, height: 850 } });
    const restartPage = await restartContext.newPage();
    restartPage.on('pageerror', error => errors.push(error.message));
    restartPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await seedStructureReview(restartPage, 'corpus:26237', [[0, 1], [6]], [[2], [7]], 'restart-current-sentence');
    const teacherBeforeRestart = await restartPage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getRecord()));
    await restartPage.evaluate(() => {
      const state = ELABSentenceStructurePractice.getState();
      state.results = [{ sentence_id: 'corpus:25018', subject_correct: true, verb_correct: true }];
      localStorage.setItem(ELABSentenceStructurePractice.getStorageKey(), JSON.stringify(state));
    });
    await restartPage.reload(); await restartPage.waitForLoadState('networkidle');
    await restartPage.click('[data-go-chunk]');
    await restartPage.click('[data-junction="2"]');
    check('step 2 exposes a secondary current-sentence restart action', await restartPage.locator('#chunk-step [data-restart-sentence].secondary').count() === 1);
    await restartPage.click('#chunk-step [data-restart-sentence]');
    check('step 2 restart returns to an empty step 1', await restartPage.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); return s.draft.stage === 'structure' && !s.draft.subject_answers.length && !s.draft.verb_answers.length && !s.draft.chunk_boundaries.length && s.draft.structure_result === null && s.draft.chunk_result === null; }) && await restartPage.locator('[data-learning-step="1"][aria-current="step"]').count() === 1);
    check('step 2 restart preserves previous sentence progress and assignment hint level', await restartPage.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); return s.results.length === 1 && s.results[0].sentence_id === 'corpus:25018' && s.draft.assigned_hint_level === 'DETAILED'; }));
    await restartPage.reload(); await restartPage.waitForLoadState('networkidle');
    check('restarted step 1 survives F5', await restartPage.evaluate(() => ELABSentenceStructurePractice.getState().draft.stage === 'structure' && ELABSentenceStructurePractice.getState().attempt_history.length === 1));
    await seedStructureReview(restartPage, 'corpus:26237', [[0, 1], [6]], [[2], [7]], 'restart-current-sentence');
    await restartPage.click('[data-go-chunk]'); await restartPage.click('[data-check-chunk]');
    check('step 3 exposes a secondary current-sentence restart action', await restartPage.locator('#expression-step [data-restart-sentence].secondary').count() === 1);
    await restartPage.click('#expression-step [data-restart-sentence]');
    check('step 3 restart clears chunk completion and returns to step 1', await restartPage.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); return s.draft.stage === 'structure' && s.draft.chunk_result === null && s.attempt_history.length === 2; }));
    await seedStructureReview(restartPage, 'corpus:26237', [[0, 1], [6]], [[2], [7]], 'restart-current-sentence');
    await restartPage.click('[data-go-chunk]'); await restartPage.click('[data-check-chunk]'); await restartPage.click('[data-complete-expression]');
    check('step 4 exposes a secondary current-sentence restart action', await restartPage.locator('#next-step [data-restart-sentence].secondary').count() === 1);
    await restartPage.click('#next-step [data-restart-sentence]');
    check('step 4 restart clears expression completion and starts a third attempt', await restartPage.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); return s.draft.stage === 'structure' && s.attempt_history.length === 3 && s.attempt_history[2].expression_completed === true && s.attempt_history.map(item => item.attempt_number).join(',') === '1,2,3'; }));
    check('restart never mutates teacher-backed sentence data', await restartPage.evaluate(before => JSON.stringify(ELABSentenceStructurePractice.getRecord()) === before, teacherBeforeRestart));
    check('other sentence progress remains after repeated restarts', await restartPage.evaluate(() => { const s = ELABSentenceStructurePractice.getState(); return s.results.length === 1 && s.results[0].sentence_id === 'corpus:25018'; }));
    await restartContext.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', error => errors.push(error.message));
    mobilePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mobilePage.goto(`${base}?reading_support=advanced`);
    await mobilePage.waitForLoadState('networkidle');
    check('390px intro has zero horizontal overflow', await mobilePage.evaluate(() => document.querySelector('#chunk-intro') && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await mobilePage.screenshot({ path: path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-chunk-intro-390.png'), fullPage: true });
    await startPractice(mobilePage);
    check('390px horizontal overflow is zero', await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    check('mobile instruction matches tap and drag interaction', await mobilePage.locator('.mobile-method:visible').innerText().then(text => text.includes('탭') && text.includes('한 단어') && text.includes('드래그') && text.includes('처음부터 끝까지')));
    await mobilePage.tap('[data-token="0"]');
    check('mobile single-token tap registers immediately', await mobilePage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0]]'));
    check('mobile guide remains visible after automatic role change', await mobilePage.locator('.mobile-method:visible').count() === 1 && (await mobilePage.locator('.current-task h2').innerText()).includes('동사를 찾아보세요'));
    await mobilePage.screenshot({ path: path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-390.png'), fullPage: true });
    await mobilePage.goto(`${base}?sentence_id=corpus%3A23568&reading_support=advanced`);
    await mobilePage.waitForLoadState('networkidle');
    check('390px default-open hint has zero overflow', await mobilePage.evaluate(() => document.querySelector('.sv-hint-card:not(.compact)') && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await mobilePage.tap('[data-token="0"]');
    await mobilePage.tap('[data-mode="subject"]');
    await mobilePage.locator('[data-token="7"]').dispatchEvent('pointerdown', { pointerId: 31, pointerType: 'touch', isPrimary: true, button: 0 });
    await mobilePage.locator('[data-token="10"]').dispatchEvent('pointerover', { pointerId: 31, pointerType: 'touch', isPrimary: true, button: 0 });
    await mobilePage.locator('body').dispatchEvent('pointerup', { pointerId: 31, pointerType: 'touch', isPrimary: true, button: 0 });
    check('mobile multi-token drag registers one span', await mobilePage.evaluate(() => JSON.stringify(ELABSentenceStructurePractice.getState().draft.subject_answers) === '[[0],[7,8,9,10]]'));
    await mobilePage.goto(`${base}?sentence_id=corpus%3A2590&reading_support=advanced`);
    await mobilePage.waitForLoadState('networkidle');
    check('390px V5 four-step indicator has zero overflow', await mobilePage.evaluate(() => document.querySelectorAll('.step-progress-item').length === 4 && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await mobilePage.screenshot({ path: path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-v5-390.png'), fullPage: true });
    await seedStructureReview(mobilePage, 'corpus:2970', [[1]], [[0]], 'compare-mobile');
    check('390px wrong-answer comparison stacks without horizontal overflow', await mobilePage.evaluate(() => {
      const card = document.querySelector('.answer-comparison');
      const columns = document.querySelector('.comparison-columns');
      return Boolean(card && columns) && getComputedStyle(columns).gridTemplateColumns.split(' ').length === 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    }));
    await mobile.close();

    const mobileChunk = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobileChunkPage = await mobileChunk.newPage();
    mobileChunkPage.on('pageerror', error => errors.push(error.message));
    mobileChunkPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mobileChunkPage.goto(`${base}?sentence_id=corpus%3A25018`);
    await mobileChunkPage.waitForLoadState('networkidle');
    await startPractice(mobileChunkPage);
    await mobileChunkPage.tap('[data-token="0"]');
    await mobileChunkPage.tap('[data-token="2"]');
    await mobileChunkPage.tap('[data-check-structure]');
    await mobileChunkPage.tap('[data-go-chunk]');
    check('390px step 2 hides the guide, keeps one workspace, and has zero overflow', await mobileChunkPage.evaluate(() => document.querySelectorAll('.chunk-rule-detail').length === 0 && document.querySelectorAll('.chunk-workspace').length === 1 && document.querySelectorAll('.sentence-card').length === 0 && document.querySelectorAll('[data-restart-sentence]').length === 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await mobileChunkPage.tap('[data-rule-guide-open]');
    check('390px reopened nine-rule drawer stays one-column without overflow', await mobileChunkPage.evaluate(() => document.querySelectorAll('.chunk-guide-dialog .chunk-rule-detail').length === 9 && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await mobileChunkPage.tap('[data-rule-guide-close]');
    await mobileChunkPage.screenshot({ path: path.resolve(__dirname, '../output/sentence-structure-student-v1/student-v1-step2-390.png'), fullPage: true });
    await mobileChunkPage.tap('[data-check-chunk]');
    check('zero-slash free-form completion is allowed', await mobileChunkPage.locator('#next-step').count() === 1 && await mobileChunkPage.locator('.feedback.error').count() === 0);
    await mobileChunk.close();
    if (errors.length) console.log(JSON.stringify({ browser_errors: errors }, null, 2));
    check('browser console errors are zero', errors.length === 0);
    console.log(JSON.stringify({ passed: checks.length, checks, browser_errors: errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
