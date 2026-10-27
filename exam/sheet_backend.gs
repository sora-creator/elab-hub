/**
 * 통합 웹앱 허브 백엔드 (Google Apps Script)
 *
 * 시험보기 모듈뿐 아니라 문법학습 모듈의 학생 공유, 그리고 학생 로스터/배정
 * (누구에게 무엇을 내줄지)까지 이 하나의 백엔드가 담당한다 — Apps Script 배포를
 * 여러 개 관리하는 부담을 줄이기 위해 한 곳에 모음.
 *
 * 설치:
 * 1. sheets.google.com 에서 새 스프레드시트 생성
 * 2. 확장 프로그램 > Apps Script, 기본 Code.gs 내용을 지우고 이 파일 내용을 붙여넣기
 * 3. 왼쪽 톱니바퀴(프로젝트 설정) > 스크립트 속성에서 TOKEN 속성 추가 (임의의 어려운 문자열)
 * 4. 배포 > 새 배포 > 유형: 웹 앱, 실행 계정: 나, 액세스: 모든 사용자
 * 5. 생성된 /exec URL을:
 *    - exam/index.html의 "설정" 탭
 *    - grammar/index.html의 "설정" 화면
 *    - teacher/students.html의 "설정"
 *    - teacher/dashboard.html의 "설정"
 *    - vocab/index.html의 "결과" 탭 (등록하면 학생 선택 자동배정 + 통합 대시보드 결과 전송도 같이 동작)
 *    - student/index.html의 링크(?hook=... 파라미터)
 *    전부에 등록(같은 백엔드 하나를 여섯 군데가 공유함)
 *
 * 이미 예전 버전(시험보기 전용)을 배포해뒀다면, 이 파일 내용으로 덮어쓰고
 * "배포 관리 > 수정 > 새 버전"으로 재배포하면 기존 Exams/ExamImages/ExamResults
 * 데이터는 그대로 유지되고 새 시트/기능만 추가된다(컬럼은 항상 끝에 추가해서
 * 기존 열 순서를 안 건드림).
 *
 * 시트 구조 (setup() 최초 1회 실행하면 자동 생성):
 * - Exams: examKey / title / range / questionCount / answersJson / imageUrlsJson / createdAt / expiresAt / questionNumsJson
 * - ExamImages: imageKey / url / savedAt
 * - ExamResults: date / examKey / name / score / totalTimeMs / answersJson / timesJson
 * - Students: name / pin / createdAt
 * - Assignments: name / updatedAt / vocabLabel / vocabLink / examLabel / examLink / grammarLabel / grammarLink
 * - GrammarSets: setKey / tag / tagLabel / sentencesJson / createdAt / videoUrl / theoryContentJson
 * - VocabResults: date / name / range / score / timeStr / wrong / count / qtype / attempt / known
 *   (VocaTest(vocab/index.html)가 결과 전송 시 이 백엔드로도 함께 보낼 수 있음 — 통합 대시보드용)
 * - GrammarSubmissions: date / setKey / name / sentenceIndex / sentenceText / interpretation /
 *   chunkStudentJson / chunkCorrectJson / chunkScore
 *   (문법학습 연습모드에서 학생이 제출한 해석/끊어읽기 — 채점 없이 교사가 나중에 검토용으로 확인)
 * - GrammarFinals: setKey / label / questionsJson / createdAt / folderId
 *   (교사가 구분문제 PPT를 검토·수정한 뒤 다시 올린 "최종본" — 학생은 이걸로 단어테스트
 *   형식의 객관식 시험을 봄. 원본 pptx가 아니라 그 안에서 파싱해낸 문제 배열만 저장함.
 *   folderId가 빈 문자열이면 최상위.)
 * - GrammarFinalResults: date / setKey / name / score / count / wrong / timeStr
 *   (최종본 구분문제 테스트 결과 — VocabResults와 비슷한 형태)
 * - GrammarFinalFolders: folderId / name / parentId / createdAt
 *   (최종본을 정리하는 폴더 트리 — parentId가 빈 문자열이면 최상위 폴더)
 * - PracticeExams: practiceKey / title / range / pageImagesJson / answersJson / questionNumsJson / createdAt / expiresAt
 *   (실전연습(practice/index.html) — PDF를 문항별로 자르지 않고 페이지 그대로 올려서 OMR처럼
 *   마킹하는 모듈. pageImagesJson은 ExamImages 시트에 올린 페이지 이미지 URL 배열)
 * - PracticeResults: date / practiceKey / name / score / totalTimeMs / answersJson
 *   (실전연습 결과 — 문항별 시간이 아니라 전체 소요시간만 기록)
 * - SentenceSets: setKey / label / passagesJson / createdAt
 *   (끊어읽기(sentence/index.html) 숙제 — 교사가 고른 지문들을 그대로 학생에게 공유. GrammarSets와
 *   같은 패턴이되, passagesJson은 [{id,text}]만 담음(끊어읽기/주어/동사/모르는 단어 표시는 학생이
 *   직접 함 — 교사가 미리 채워둔 정답을 내려주지 않음).
 * - SentenceSubmissions: date / setKey / name / passageId / passageNum / text / chunkGapsJson /
 *   svJson / submittedAt
 *   (학생이 제출한 끊어읽기/주어/동사/모르는 단어 표시 — 채점 없이 교사가 그대로 불러와 수업에서
 *   검토·수정하는 용도. 한 세트 안의 지문 개수만큼 여러 행이 쌓임)
 */

var EXAMS_SHEET = 'Exams';
var IMAGES_SHEET = 'ExamImages';
var RESULTS_SHEET = 'ExamResults';
var STUDENTS_SHEET = 'Students';
var ASSIGNMENTS_SHEET = 'Assignments';
var GRAMMAR_SHEET = 'GrammarSets';
var IMAGES_FOLDER_NAME = 'MockExamImages (시험보기 프로그램)';

var EXAMS_HEADERS = ['examKey', 'title', 'range', 'questionCount', 'answersJson', 'imageUrlsJson', 'createdAt', 'expiresAt', 'questionNumsJson', 'contentType', 'questionsJson', 'questionIdsJson'];
// contentType: ''(=미설정, 기존 PDF방식과 동일) 또는 'text'(폴더 기반 텍스트 문제 — questionsJson에
// [{promptKo,text,choices,image}]가 answersJson/questionNumsJson과 병렬 인덱스로 들어있음).
// 새 컬럼은 항상 끝에 append만 함(기존에 이미 저장된 시트 데이터와 열 순서가 어긋나면 안 되므로).
var IMAGES_HEADERS = ['imageKey', 'url', 'savedAt'];
var RESULTS_HEADERS = ['date', 'examKey', 'name', 'score', 'totalTimeMs', 'answersJson', 'timesJson'];
// student_id는 0B에서 기존 Students 끝에 추가하는 연결 열이다. 기존 3개 열과 행은
// 건드리지 않고, StudentsV2의 불변 ID를 legacy 로그인 행에 연결하는 데만 사용한다.
var STUDENTS_HEADERS = ['name', 'pin', 'createdAt', 'student_id'];
var ASSIGNMENTS_HEADERS = ['name', 'updatedAt', 'vocabLabel', 'vocabLink', 'examLabel', 'examLink', 'grammarLabel', 'grammarLink', 'finalQuizLabel', 'finalQuizLink', 'sentenceLabel', 'sentenceLink'];
var TEACHERS_V2_SHEET = 'TeachersV2';
var TEACHERS_V2_HEADERS = ['teacher_id', 'account_ref', 'display_name', 'active', 'created_at', 'updated_at'];
var TEACHER_INVITES_V2_SHEET = 'TeacherInvitesV2';
var TEACHER_INVITES_V2_HEADERS = ['invite_id', 'invite_code', 'status', 'max_uses', 'used_count', 'teacher_id', 'created_at', 'expires_at', 'last_used_at', 'active', 'note'];
var TEACHER_CREDENTIALS_V2_SHEET = 'TeacherCredentialsV2';
var TEACHER_CREDENTIALS_V2_HEADERS = ['credential_id', 'credential_hash', 'teacher_id', 'status', 'created_at', 'last_used_at', 'revoked_at', 'active', 'note'];
var STUDENTS_V2_SHEET = 'StudentsV2';
var STUDENTS_V2_HEADERS = ['student_id', 'teacher_id', 'display_name', 'grade', 'active', 'created_at', 'updated_at', 'school', 'contact', 'email', 'enrollment_start_date', 'lesson_days', 'lesson_time', 'lesson_memo'];
var LEGACY_STUDENT_MAP_SHEET = 'LegacyStudentMap';
var LEGACY_STUDENT_MAP_HEADERS = ['source_sheet', 'legacy_name', 'student_id', 'match_status', 'created_at', 'note'];
var STUDENT_WRITES_V2_SHEET = 'StudentWritesV2';
var STUDENT_WRITES_V2_HEADERS = ['request_id', 'action', 'student_id', 'status', 'created_at', 'note'];
var MIGRATION_ERRORS_SHEET = 'MigrationErrors';
var MIGRATION_ERRORS_HEADERS = ['created_at', 'phase', 'source_sheet', 'legacy_ref', 'error'];
var QUESTIONS_V2_SHEET = 'QuestionsV2';
var QUESTIONS_V2_HEADERS = ['question_id', 'teacher_id', 'content_type', 'answer_type', 'prompt_json', 'choices_json', 'correct_answer_json', 'explanation', 'source_id', 'source_question_no', 'active', 'version', 'created_at', 'updated_at', 'legacy_question_id', 'difficulty'];
var SOURCES_V2_SHEET = 'SourcesV2';
var SOURCES_V2_HEADERS = ['source_id', 'exam_type', 'year', 'grade', 'month', 'exam_name', 'source_file', 'active', 'created_at'];
var CATEGORIES_V2_SHEET = 'CategoriesV2';
var CATEGORIES_V2_HEADERS = ['category_id', 'domain', 'key', 'label', 'parent_category_id', 'active', 'created_at', 'updated_at'];
var QUESTION_CATEGORIES_V2_SHEET = 'QuestionCategoriesV2';
var QUESTION_CATEGORIES_V2_HEADERS = ['question_id', 'category_id', 'confidence', 'source', 'created_at'];
var GROUPS_V2_SHEET = 'GroupsV2';
var GROUPS_V2_HEADERS = ['group_id', 'teacher_id', 'name', 'active', 'created_at', 'updated_at', 'grade', 'lesson_days', 'lesson_time', 'memo'];
var GROUP_MEMBERS_V2_SHEET = 'GroupMembersV2';
var GROUP_MEMBERS_V2_HEADERS = ['group_member_id', 'group_id', 'student_id', 'joined_at', 'left_at', 'active'];
var ASSIGNMENTS_V2_SHEET = 'AssignmentsV2';
var ASSIGNMENTS_V2_HEADERS = ['assignment_id', 'teacher_id', 'content_type', 'content_ref_id', 'title', 'content_link', 'assigned_at', 'due_at', 'active', 'created_at', 'updated_at', 'content_subtype', 'request_id', 'linked_practice_assignment_id'];
var ASSIGNMENT_TARGETS_V2_SHEET = 'AssignmentTargetsV2';
var ASSIGNMENT_TARGETS_V2_HEADERS = ['assignment_target_id', 'assignment_id', 'student_id', 'status', 'started_at', 'completed_at', 'active', 'created_at', 'updated_at'];
var HOMEWORK_BATCHES_V2_SHEET = 'HomeworkBatchesV2';
var HOMEWORK_BATCHES_V2_HEADERS = ['homework_batch_id', 'teacher_id', 'student_id', 'lesson_date', 'assigned_at', 'title', 'active', 'created_at', 'updated_at'];
var HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET = 'HomeworkBatchAssignmentsV2';
var HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS = ['homework_batch_assignment_id', 'homework_batch_id', 'assignment_id', 'student_id', 'snapshot_json', 'created_at'];
var VOCAB_SETS_V2_SHEET = 'VocabSetsV2';
var VOCAB_SETS_V2_HEADERS = ['vocab_set_id', 'teacher_id', 'session_key', 'title', 'source_ref', 'content_link', 'active', 'created_at', 'updated_at', 'book_source', 'day_set', 'range_start', 'range_end', 'display_range', 'set_kind', 'set_size', 'catalog_id', 'set_number', 'source_folders_json', 'level', 'selection_type', 'item_count', 'created_by'];
var VOCAB_SET_ITEMS_V2_SHEET = 'VocabSetItemsV2';
var VOCAB_SET_ITEMS_V2_HEADERS = ['vocab_set_item_id', 'vocab_set_id', 'word_id', 'item_order', 'created_at', 'sense_id', 'word_snapshot', 'meaning_snapshot', 'level_snapshot'];
var VOCABULARY_DB_SHEET = 'VocabularyDB';
var VOCABULARY_DB_HEADERS = ['sense_id', 'vocab_id', 'word', 'meaning', 'level', 'item_type', 'sense_order', 'importance_score', 'occurrence_count', 'active', 'created_at', 'updated_at', 'recommended_level', 'level_review_status', 'curriculum_active', 'curriculum_level', 'archive_only', 'selection_score', 'selection_reason', 'confirmed_level', 'semantic_review_status'];
var VOCABULARY_IMPORTS_V2_SHEET = 'VocabularyImportsV2';
var VOCABULARY_IMPORTS_V2_HEADERS = ['request_id', 'teacher_id', 'source_file', 'status', 'total_count', 'new_count', 'changed_count', 'unchanged_count', 'error_count', 'created_at', 'previewed_at', 'committed_at', 'message', 'curriculum_count', 'archive_count', 'v1_count', 'v2_count', 'v3_count', 'v4_count', 'v5_count', 'headword_count', 'occurrence_count', 'duplicate_sense_count', 'missing_required_count', 'flag_conflict_count', 'curriculum_level_error_count'];
var VOCABULARY_IMPORT_ERRORS_V2_SHEET = 'VocabularyImportErrorsV2';
var VOCABULARY_IMPORT_ERRORS_V2_HEADERS = ['error_id', 'request_id', 'source_row', 'sense_id', 'code', 'message', 'created_at'];
var VOCABULARY_IMPORT_STAGING_V2_SHEET = 'VocabularyImportStagingV2';
var VOCABULARY_IMPORT_STAGING_V2_HEADERS = ['staging_id', 'request_id', 'source_row', 'level', 'word', 'meaning', 'vocab_id', 'sense_id', 'item_type', 'sense_order', 'importance_score', 'occurrence_count', 'active', 'created_at', 'curriculum_active', 'curriculum_level', 'archive_only', 'selection_score', 'selection_reason', 'recommended_level', 'confirmed_level', 'semantic_review_status'];
var vocabSetLookupV2Cache_ = null;
var VOCAB_REVIEW_SCHEDULES_V2_SHEET = 'VocabReviewSchedulesV2';
var VOCAB_REVIEW_SCHEDULES_V2_HEADERS = ['vocab_review_schedule_id', 'teacher_id', 'student_id', 'vocab_set_id', 'source_attempt_id', 'review_type', 'recommended_at', 'status', 'postponed_until', 'assigned_assignment_id', 'completed_attempt_id', 'created_at', 'updated_at'];
var ATTEMPTS_V2_SHEET = 'AttemptsV2';
var ATTEMPTS_V2_HEADERS = ['attempt_id', 'assignment_target_id', 'student_id', 'teacher_id', 'content_type', 'content_subtype', 'started_at', 'completed_at', 'duration_ms', 'status', 'attempt_no', 'request_id', 'created_at', 'updated_at', 'score', 'repetition_count'];
var QUESTION_ATTEMPT_ITEMS_V2_SHEET = 'QuestionAttemptItemsV2';
var QUESTION_ATTEMPT_ITEMS_V2_HEADERS = ['attempt_item_id', 'attempt_id', 'question_id', 'sequence', 'answer_json', 'is_correct', 'grading_status', 'elapsed_ms', 'attempt_count', 'first_wrong', 'submitted_at', 'created_at', 'updated_at'];
var SENTENCE_STRUCTURE_DETAILS_V2_SHEET = 'SentenceStructureDetailsV2';
var SENTENCE_STRUCTURE_DETAILS_V2_HEADERS = ['attempt_item_id', 'student_subject_json', 'student_main_verb_json', 'correct_subject_json', 'correct_main_verb_json', 'subject_correct', 'main_verb_correct', 'created_at', 'updated_at', 'question_id', 'student_subject_tokens_json', 'student_main_verb_tokens_json', 'correct_subject_tokens_json', 'correct_main_verb_tokens_json', 'metadata_json', 'elapsed_time', 'submitted_at'];
var WORD_ATTEMPT_ITEMS_V2_SHEET = 'WordAttemptItemsV2';
var WORD_ATTEMPT_ITEMS_V2_HEADERS = ['word_attempt_item_id', 'attempt_id', 'word_id', 'first_correct', 'wrong_count', 'final_correct', 'first_answered_at', 'final_answered_at', 'created_at', 'updated_at'];
var WORDS_V2_SHEET = 'WordsV2';
var WORDS_V2_HEADERS = ['word_id', 'vocab_set_id', 'term', 'meaning', 'active', 'created_at', 'updated_at'];
var REVIEW_ITEMS_V2_SHEET = 'ReviewItemsV2';
var REVIEW_ITEMS_V2_HEADERS = ['review_item_id', 'student_id', 'teacher_id', 'item_type', 'item_ref_id', 'subskill_key', 'first_wrong_at', 'last_wrong_at', 'wrong_count', 'last_correct_at', 'consecutive_correct', 'review_count', 'last_review_at', 'next_review_at', 'status', 'active', 'created_at', 'updated_at'];
var REVIEW_EVENTS_V2_SHEET = 'ReviewEventsV2';
var REVIEW_EVENTS_V2_HEADERS = ['event_id', 'review_item_id', 'attempt_id', 'source_item_id', 'outcome', 'wrong_delta', 'created_at'];
var GRAMMAR_HEADERS = ['setKey', 'tag', 'tagLabel', 'sentencesJson', 'createdAt', 'videoUrl', 'theoryContentJson'];
var VOCAB_RESULTS_SHEET = 'VocabResults';
var VOCAB_RESULTS_HEADERS = ['date', 'name', 'range', 'score', 'timeStr', 'wrong', 'count', 'qtype', 'attempt', 'known'];
var GRAMMAR_SUBMISSIONS_SHEET = 'GrammarSubmissions';
var GRAMMAR_SUBMISSIONS_HEADERS = ['date', 'setKey', 'name', 'sentenceIndex', 'sentenceText', 'interpretation', 'chunkStudentJson', 'chunkCorrectJson', 'chunkScore'];
var GRAMMAR_FINALS_SHEET = 'GrammarFinals';
var GRAMMAR_FINALS_HEADERS = ['setKey', 'label', 'questionsJson', 'createdAt', 'folderId'];
var GRAMMAR_FINAL_RESULTS_SHEET = 'GrammarFinalResults';
var GRAMMAR_FINAL_RESULTS_HEADERS = ['date', 'setKey', 'name', 'score', 'count', 'wrong', 'timeStr'];
var GRAMMAR_FINAL_FOLDERS_SHEET = 'GrammarFinalFolders';
var GRAMMAR_FINAL_FOLDERS_HEADERS = ['folderId', 'name', 'parentId', 'createdAt'];
var PRACTICE_SHEET = 'PracticeExams';
// 실전연습(practice/index.html) — PDF를 문항별로 자르지 않고 페이지 그대로 보여주고 OMR처럼
// 마킹하는 모듈. pageImagesJson은 ExamImages 시트를 그대로 재사용해 업로드한 페이지 이미지
// URL 배열(문항 크롭 이미지와 같은 저장 방식, uploadImage/imageStatus 액션 그대로 재사용).
var PRACTICE_HEADERS = ['practiceKey', 'title', 'range', 'pageImagesJson', 'answersJson', 'questionNumsJson', 'createdAt', 'expiresAt', 'questionIdsJson'];
var PRACTICE_RESULTS_SHEET = 'PracticeResults';
// 실전연습은 문항별 시간이 아니라 시험 전체를 마치는 데 걸린 시간만 잼(totalTimeMs만 있음).
var PRACTICE_RESULTS_HEADERS = ['date', 'practiceKey', 'name', 'score', 'totalTimeMs', 'answersJson'];
var SENTENCE_SETS_SHEET = 'SentenceSets';
var SENTENCE_SETS_HEADERS = ['setKey', 'label', 'passagesJson', 'createdAt'];
var SENTENCE_SUBMISSIONS_SHEET = 'SentenceSubmissions';
var SENTENCE_SUBMISSIONS_HEADERS = ['date', 'setKey', 'name', 'passageId', 'passageNum', 'text', 'chunkGapsJson', 'svJson', 'submittedAt', 'annotationsJson'];
// getTeacherDashboardV2 한 요청 안에서만 사용하는 read-through cache.
// 다른 API와 쓰기 경로에는 적용하지 않는다.
var dashboardSheetReadCacheV2_ = null;

function dashboardSheetProxyV2_(sheet, name) {
  return {
    getDataRange: function() {
      return {
        getValues: function() {
          if (Object.prototype.hasOwnProperty.call(dashboardSheetReadCacheV2_.values, name)) {
            dashboardSheetReadCacheV2_.hits[name] = (dashboardSheetReadCacheV2_.hits[name] || 0) + 1;
            return dashboardSheetReadCacheV2_.values[name];
          }
          var started = Date.now(), values = sheet.getDataRange().getValues();
          dashboardSheetReadCacheV2_.values[name] = values;
          dashboardSheetReadCacheV2_.reads[name] = {
            elapsed_ms: Date.now() - started,
            rows: Math.max(0, values.length - 1),
            columns: values.length ? values[0].length : 0
          };
          return values;
        }
      };
    },
    getRange: function() { return sheet.getRange.apply(sheet, arguments); },
    getLastRow: function() { return sheet.getLastRow(); },
    getLastColumn: function() { return sheet.getLastColumn(); },
    getName: function() { return sheet.getName(); }
  };
}

function setup() {
  getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  getOrCreateSheet_(RESULTS_SHEET, RESULTS_HEADERS);
  getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  ensureSheetHeaders_(getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS), GRAMMAR_HEADERS);
  getOrCreateSheet_(VOCAB_RESULTS_SHEET, VOCAB_RESULTS_HEADERS);
  getOrCreateSheet_(GRAMMAR_SUBMISSIONS_SHEET, GRAMMAR_SUBMISSIONS_HEADERS);
  getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  getOrCreateSheet_(GRAMMAR_FINAL_RESULTS_SHEET, GRAMMAR_FINAL_RESULTS_HEADERS);
  getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
  getOrCreateSheet_(PRACTICE_SHEET, PRACTICE_HEADERS);
  getOrCreateSheet_(PRACTICE_RESULTS_SHEET, PRACTICE_RESULTS_HEADERS);
  getOrCreateSheet_(SENTENCE_SETS_SHEET, SENTENCE_SETS_HEADERS);
  getOrCreateSheet_(SENTENCE_SUBMISSIONS_SHEET, SENTENCE_SUBMISSIONS_HEADERS);
  setupStudentIdentityV2_();
  setupTeacherAuthV2_();
  setupQuestionMetadataV2_();
  setupAssignmentsV2_();
  setupVocabularyDbV1_();
  setupAttemptsV2_();
  setupReviewItemsV2_();
}

function setupAttemptsV2() { return setupAttemptsV2_(); }
function setupAttemptsV2_() {
  [[ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS],[QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS],
   [SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS],[WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS]].forEach(function(pair){
    ensureSheetHeaders_(getOrCreateSheet_(pair[0],pair[1]),pair[1]);
  });
  return true;
}

function setupReviewItemsV2() { return setupReviewItemsV2_(); }
function setupReviewItemsV2_() {
  [[WORDS_V2_SHEET,WORDS_V2_HEADERS],[REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS],[REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS]].forEach(function(pair){
    getOrCreateSheet_(pair[0],pair[1]);
  });
  return {ok:true};
}

function setupAssignmentsV2() { setupAssignmentsV2_(); backfillHomeworkBatchesV2_(); return true; }
function setupAssignmentsV2_() {
  [[GROUPS_V2_SHEET,GROUPS_V2_HEADERS],[GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS],
   [ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS],[ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS],
   [HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS],[HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS],
   [VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS],[VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SET_ITEMS_V2_HEADERS]].forEach(function(pair){
    ensureSheetHeaders_(getOrCreateSheet_(pair[0], pair[1]), pair[1]);
  });
  ensureSheetHeaders_(getOrCreateSheet_(VOCAB_REVIEW_SCHEDULES_V2_SHEET,VOCAB_REVIEW_SCHEDULES_V2_HEADERS),VOCAB_REVIEW_SCHEDULES_V2_HEADERS);
  return true;
}

function setupVocabularyDbV1_() {
  [[VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS],[VOCABULARY_IMPORTS_V2_SHEET,VOCABULARY_IMPORTS_V2_HEADERS],
   [VOCABULARY_IMPORT_ERRORS_V2_SHEET,VOCABULARY_IMPORT_ERRORS_V2_HEADERS],[VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS]].forEach(function(pair){
    ensureSheetHeaders_(getOrCreateSheet_(pair[0],pair[1]),pair[1]);
  });
  return true;
}

function setupQuestionMetadataV2() { return setupQuestionMetadataV2_(); }
function setupQuestionMetadataV2_() {
  var sheets = [
    [QUESTIONS_V2_SHEET, QUESTIONS_V2_HEADERS], [SOURCES_V2_SHEET, SOURCES_V2_HEADERS],
    [CATEGORIES_V2_SHEET, CATEGORIES_V2_HEADERS], [QUESTION_CATEGORIES_V2_SHEET, QUESTION_CATEGORIES_V2_HEADERS]
  ];
  sheets.forEach(function(pair) {
    var sh = getOrCreateSheet_(pair[0], pair[1]);
    ensureSheetHeaders_(sh, pair[1]);
  });
  ensureSheetHeaders_(getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS), EXAMS_HEADERS);
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('QUESTION_METADATA_0C_SEEDED') !== 'true') {
    seedQuestionCategoriesV2_();
    props.setProperty('QUESTION_METADATA_0C_SEEDED', 'true');
  }
  if (props.getProperty('SENTENCE_STRUCTURE_V1_CATEGORIES_SEEDED') !== 'true') {
    ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_CORE', '핵심 문장구조', '');
    ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_CLAUSE', '절 구조', '');
    ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_RELATIVE', '관계사 구조', '');
    ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_INTEGRATED', '통합 문장구조', '');
    props.setProperty('SENTENCE_STRUCTURE_V1_CATEGORIES_SEEDED', 'true');
  }
  if (props.getProperty('GRAMMAR_V1_CATEGORIES_SEEDED') !== 'true') {
    seedGrammarCategoriesV1_();
    props.setProperty('GRAMMAR_V1_CATEGORIES_SEEDED', 'true');
  }
  return verifyQuestionMetadataV2();
}

function seedGrammarCategoriesV1_() {
  var top = [
    ['GRAMMAR_VERB','동사'],['GRAMMAR_NONFINITE','준동사'],['GRAMMAR_CLAUSE_CONNECTOR','절·연결'],
    ['GRAMMAR_RELATIVE','관계사'],['GRAMMAR_PARALLEL','병렬'],['GRAMMAR_PRONOUN','대명사'],['GRAMMAR_INTEGRATED','종합']
  ], ids = {};
  top.forEach(function(x) { ids[x[0]] = ensureCategoryV2_('GRAMMAR', x[0], x[1], ''); });
  [
    ['GRAMMAR_SUBJECT_VERB_AGREEMENT','수일치','GRAMMAR_VERB'],
    ['GRAMMAR_ACTIVE_PASSIVE','능동·수동','GRAMMAR_VERB'],
    ['GRAMMAR_CONNECTOR_PREPOSITION','접속사·전치사','GRAMMAR_CLAUSE_CONNECTOR'],
    ['GRAMMAR_PARALLEL_STRUCTURE','병렬구조','GRAMMAR_PARALLEL'],
    ['GRAMMAR_PRONOUN_REFERENCE','대명사 지칭','GRAMMAR_PRONOUN'],
    ['GRAMMAR_PRONOUN_CASE_NUMBER','대명사 격·수','GRAMMAR_PRONOUN']
  ].forEach(function(x) { ensureCategoryV2_('GRAMMAR', x[0], x[1], ids[x[2]] || ''); });
}

function seedQuestionCategoriesV2_() {
  var reading = [
    ['purpose','글의 목적'],['mood','심경·분위기'],['claim','필자의 주장'],['implicit','함축적 의미 추론'],['blank','빈칸 추론'],
    ['gist','요지'],['topic','주제'],['title','제목'],['graph','도표 정보 파악'],['match','내용 일치·불일치'],
    ['practical','실용문 내용 파악'],['grammar','어법'],['vocab','어휘'],['irrelevant','무관한 문장'],['order','글의 순서'],
    ['insert','문장 삽입'],['summary','요약문 완성'],['long_reference','지칭 추론(장문)']
  ];
  reading.forEach(function(x) { ensureCategoryV2_('READING', 'READING_' + x[0].toUpperCase(), x[1], ''); });
  [
    ['PRESENT_PARTICIPLE','현재분사'],['PAST_PARTICIPLE','과거분사'],['TO_INFINITIVE','to부정사'],['RELATIVE_CLAUSE','관계사절'],
    ['PASSIVE_VOICE','수동태'],['GERUND','동명사'],['COMPARATIVE','비교'],['INVERSION','도치'],['SUBJUNCTIVE','가정법'],
    ['EMPHATIC','강조'],['NOUN_CLAUSE','명사절'],['MODAL_PERFECT','조동사+완료']
  ].forEach(function(x) { ensureCategoryV2_('GRAMMAR', 'GRAMMAR_' + x[0], x[1], ''); });
  ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_SV', '문장구조 연습', '');
  ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_CORE', '핵심 문장구조', '');
  ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_CLAUSE', '절 구조', '');
  ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_RELATIVE', '관계사 구조', '');
  ensureCategoryV2_('SENTENCE_STRUCTURE', 'SENTENCE_STRUCTURE_INTEGRATED', '통합 문장구조', '');
}

function ensureCategoryV2_(domain, key, label, parentCategoryId) {
  var sh = getOrCreateSheet_(CATEGORIES_V2_SHEET, CATEGORIES_V2_HEADERS);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) === domain && String(values[i][2]) === key) return String(values[i][0]);
  }
  var id = Utilities.getUuid(), now = new Date();
  sh.appendRow([id, domain, key, label || key, parentCategoryId || '', true, now, now]);
  return id;
}

function ensureSourceV2_(source) {
  source = source || {};
  var fields = [source.exam_type || '', source.year || '', source.grade || '', source.month || '', source.exam_name || '', source.source_file || ''];
  if (fields.every(function(v) { return String(v) === ''; })) return '';
  var sh = getOrCreateSheet_(SOURCES_V2_SHEET, SOURCES_V2_HEADERS);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var same = true;
    for (var j = 0; j < fields.length; j++) if (String(values[i][j + 1]) !== String(fields[j])) same = false;
    if (same) return String(values[i][0]);
  }
  var id = Utilities.getUuid();
  sh.appendRow([id].concat(fields).concat([true, new Date()]));
  return id;
}

function validUuid_(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function parseJsonValue_(value, fallback) { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (err) { return fallback; } }

function upsertQuestionV2_(raw, defaults) {
  raw = raw || {}; defaults = defaults || {};
  var questionId = validUuid_(raw.question_id) ? String(raw.question_id) : Utilities.getUuid();
  raw.question_id = questionId;
  var source = raw.source || defaults.source || {};
  if ((!source || Object.keys(source).length === 0) && raw.srcLabel) {
    var match = String(raw.srcLabel).match(/(\d{4})년\s*(\d{1,2})월\s*([^·]+).*?(\d+)번/);
    if (match) source = { exam_type:'MOCK', year:match[1], month:match[2], grade:String(match[3]).trim(), exam_name:raw.srcLabel };
  }
  var sourceId = raw.source_id || ensureSourceV2_(source);
  var prompt = raw.prompt_json || { promptKo: raw.promptKo || null, text: raw.text || '', html: raw.html || null, image: raw.image || null, phrase: raw.phrase || null };
  var choices = raw.choices_json || raw.choices || [];
  var answer = raw.correct_answer_json !== undefined ? raw.correct_answer_json : (raw.answer !== undefined ? raw.answer : defaults.answer);
  var sh = getOrCreateSheet_(QUESTIONS_V2_SHEET, QUESTIONS_V2_HEADERS);
  var rowIdx = findRowByKey_(sh, questionId), now = new Date(), created = now, version = 1;
  if (rowIdx !== -1) {
    var old = sh.getRange(rowIdx, 1, 1, QUESTIONS_V2_HEADERS.length).getValues()[0];
    created = old[12] || now; version = (Number(old[11]) || 1) + 1;
  }
  var row = [questionId, getOrCreateDefaultTeacher_(), raw.content_type || defaults.content_type || 'READING', raw.answer_type || defaults.answer_type || 'MULTIPLE_CHOICE',
    JSON.stringify(prompt), JSON.stringify(choices), JSON.stringify(answer === undefined ? null : answer), raw.explanation || '', sourceId || '',
    raw.source_question_no || defaults.source_question_no || '', boolValue_(raw.active, true), version, created, now, raw.legacy_question_id || raw.id || '',
    /^(L1|L2|L3)$/.test(String(raw.difficulty || defaults.difficulty || '')) ? String(raw.difficulty || defaults.difficulty) : ''];
  upsertRow_(sh, questionId, row);
  linkQuestionCategoriesV2_(questionId, raw.category_keys || defaults.category_keys || []);
  return raw;
}

function linkQuestionCategoriesV2_(questionId, keys) {
  var categories = getOrCreateSheet_(CATEGORIES_V2_SHEET, CATEGORIES_V2_HEADERS).getDataRange().getValues();
  var byKey = {};
  for (var i = 1; i < categories.length; i++) byKey[String(categories[i][2])] = String(categories[i][0]);
  var sh = getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET, QUESTION_CATEGORIES_V2_HEADERS);
  var existing = sh.getDataRange().getValues(), pairs = {};
  for (var j = 1; j < existing.length; j++) pairs[String(existing[j][0]) + '|' + String(existing[j][1])] = true;
  (keys || []).forEach(function(key) {
    var categoryId = byKey[String(key)];
    if (!categoryId || pairs[questionId + '|' + categoryId]) return;
    sh.appendRow([questionId, categoryId, 1, 'MANUAL', new Date()]);
    pairs[questionId + '|' + categoryId] = true;
  });
}

function verifyQuestionMetadataV2() {
  var questions = getOrCreateSheet_(QUESTIONS_V2_SHEET, QUESTIONS_V2_HEADERS).getDataRange().getValues();
  var sources = getOrCreateSheet_(SOURCES_V2_SHEET, SOURCES_V2_HEADERS).getDataRange().getValues();
  var categories = getOrCreateSheet_(CATEGORIES_V2_SHEET, CATEGORIES_V2_HEADERS).getDataRange().getValues();
  var links = getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET, QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues();
  var questionIds = {}, sourceIds = {}, categoryIds = {}, duplicateQuestionIds = [], missingQuestionIds = [], invalidSourceIds = [], invalidCategoryIds = [], duplicatePairs = [], inactiveCategoryRefs = [], structureErrors = [];
  for (var s = 1; s < sources.length; s++) sourceIds[String(sources[s][0])] = true;
  for (var c = 1; c < categories.length; c++) categoryIds[String(categories[c][0])] = { active: boolValue_(categories[c][5], true) };
  for (var q = 1; q < questions.length; q++) {
    var id = String(questions[q][0] || '');
    if (!id) missingQuestionIds.push(q + 1);
    else if (questionIds[id]) duplicateQuestionIds.push(id);
    questionIds[id] = true;
    if (questions[q][8] && !sourceIds[String(questions[q][8])]) invalidSourceIds.push(id);
    var choices = parseJsonValue_(questions[q][5], null), answer = parseJsonValue_(questions[q][6], undefined);
    if (!Array.isArray(choices) || answer === undefined) structureErrors.push(id);
  }
  var pairs = {};
  for (var l = 1; l < links.length; l++) {
    var pair = String(links[l][0]) + '|' + String(links[l][1]);
    if (pairs[pair]) duplicatePairs.push(pair);
    pairs[pair] = true;
    if (!questionIds[String(links[l][0])] || !categoryIds[String(links[l][1])]) invalidCategoryIds.push(pair);
    else if (!categoryIds[String(links[l][1])].active) inactiveCategoryRefs.push(pair);
  }
  var result = {
    ok: !duplicateQuestionIds.length && !missingQuestionIds.length && !invalidSourceIds.length && !invalidCategoryIds.length && !duplicatePairs.length && !inactiveCategoryRefs.length && !structureErrors.length,
    question_count: Math.max(questions.length - 1, 0), source_count: Math.max(sources.length - 1, 0), category_count: Math.max(categories.length - 1, 0), link_count: Math.max(links.length - 1, 0),
    duplicate_question_ids: duplicateQuestionIds, missing_question_ids: missingQuestionIds, invalid_source_ids: invalidSourceIds,
    invalid_category_ids: invalidCategoryIds, duplicate_category_pairs: duplicatePairs, inactive_category_refs: inactiveCategoryRefs, choices_answer_errors: structureErrors
  };
  console.log(JSON.stringify(result));
  return result;
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return dashboardSheetReadCacheV2_ ? dashboardSheetProxyV2_(sh, name) : sh;
}

function ensureSheetHeaders_(sheet, headers) {
  var existing = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    : [];
  if (!existing.length || existing.every(function (v) { return String(v) === ''; })) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  headers.forEach(function (header) {
    if (existing.indexOf(header) !== -1) return;
    existing.push(header);
    sheet.getRange(1, existing.length).setValue(header);
  });
}

function setupStudentIdentityV2_() {
  var teachers = getOrCreateSheet_(TEACHERS_V2_SHEET, TEACHERS_V2_HEADERS);
  var students = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS);
  var legacyMap = getOrCreateSheet_(LEGACY_STUDENT_MAP_SHEET, LEGACY_STUDENT_MAP_HEADERS);
  var writes = getOrCreateSheet_(STUDENT_WRITES_V2_SHEET, STUDENT_WRITES_V2_HEADERS);
  var errors = getOrCreateSheet_(MIGRATION_ERRORS_SHEET, MIGRATION_ERRORS_HEADERS);
  [
    [teachers, TEACHERS_V2_HEADERS], [students, STUDENTS_V2_HEADERS],
    [legacyMap, LEGACY_STUDENT_MAP_HEADERS], [writes, STUDENT_WRITES_V2_HEADERS],
    [errors, MIGRATION_ERRORS_HEADERS]
  ].forEach(function (pair) { ensureSheetHeaders_(pair[0], pair[1]); });
  ensureSheetHeaders_(getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS), STUDENTS_HEADERS);
  return getOrCreateDefaultTeacher_();
}

function getOrCreateDefaultTeacher_() {
  var props = PropertiesService.getScriptProperties();
  var teacherId = props.getProperty('DEFAULT_TEACHER_ID') || '';
  var sh = getOrCreateSheet_(TEACHERS_V2_SHEET, TEACHERS_V2_HEADERS);
  if (teacherId && findRowByKey_(sh, teacherId) !== -1) return teacherId;
  var values = sh.getDataRange().getValues();
  if (values.length > 1 && values[1][0]) {
    teacherId = String(values[1][0]);
    props.setProperty('DEFAULT_TEACHER_ID', teacherId);
    return teacherId;
  }
  teacherId = Utilities.getUuid();
  var now = new Date();
  var accountRef = '';
  try { accountRef = Session.getEffectiveUser().getEmail() || ''; } catch (err) {}
  sh.appendRow([teacherId, accountRef || 'legacy-owner', '기본 교사', true, now, now]);
  props.setProperty('DEFAULT_TEACHER_ID', teacherId);
  return teacherId;
}

function appendMigrationError_(phase, sourceSheet, legacyRef, err) {
  try {
    getOrCreateSheet_(MIGRATION_ERRORS_SHEET, MIGRATION_ERRORS_HEADERS).appendRow([
      new Date(), phase || '', sourceSheet || '', legacyRef || '', String(err && err.message ? err.message : err)
    ]);
  } catch (ignored) {}
}

function ensure0BBackup_() {
  var props = PropertiesService.getScriptProperties();
  var existingName = props.getProperty('STUDENT_IDENTITY_0B_BACKUP_SHEET');
  if (existingName && SpreadsheetApp.getActiveSpreadsheet().getSheetByName(existingName)) return existingName;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  var backupName = '0B_Backup_Students_' + stamp;
  var source = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  source.copyTo(ss).setName(backupName);
  props.setProperty('STUDENT_IDENTITY_0B_BACKUP_SHEET', backupName);
  props.setProperty('STUDENT_IDENTITY_0B_BACKUP_CREATED_AT', new Date().toISOString());
  return backupName;
}

function boolValue_(value, defaultValue) {
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  return defaultValue;
}

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('TOKEN') || '';
}

/* ======================= Closed MVP teacher auth ======================= */
function setupTeacherAuthV2() { return setupTeacherAuthV2_(); }
function setupTeacherAuthV2_() {
  ensureSheetHeaders_(getOrCreateSheet_(TEACHER_INVITES_V2_SHEET, TEACHER_INVITES_V2_HEADERS), TEACHER_INVITES_V2_HEADERS);
  ensureSheetHeaders_(getOrCreateSheet_(TEACHER_CREDENTIALS_V2_SHEET, TEACHER_CREDENTIALS_V2_HEADERS), TEACHER_CREDENTIALS_V2_HEADERS);
  ensureSheetHeaders_(getOrCreateSheet_(TEACHERS_V2_SHEET, TEACHERS_V2_HEADERS), TEACHERS_V2_HEADERS);
  return { ok: true };
}

function normalizeInviteCode_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function randomTeacherSecret_() {
  return base64UrlEncode_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + String(Date.now()),
    Utilities.Charset.UTF_8
  ));
}

function hashTeacherCredential_(credential) {
  return base64UrlEncode_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(credential || ''), Utilities.Charset.UTF_8
  ));
}

function createTeacherCredentialRow_(teacherId, note) {
  var raw = randomTeacherSecret_();
  getOrCreateSheet_(TEACHER_CREDENTIALS_V2_SHEET, TEACHER_CREDENTIALS_V2_HEADERS).appendRow([
    Utilities.getUuid(), hashTeacherCredential_(raw), teacherId, 'ACTIVE', new Date(), '', '', true, note || ''
  ]);
  return raw;
}

function findTeacherCredential_(rawCredential) {
  var hash = hashTeacherCredential_(rawCredential);
  var sh = getOrCreateSheet_(TEACHER_CREDENTIALS_V2_SHEET, TEACHER_CREDENTIALS_V2_HEADERS);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (timingSafeEqual_(rows[i][1], hash)) return { sheet: sh, rowIndex: i + 1, row: rows[i] };
  }
  return null;
}

function validateTeacherCredential_(rawCredential, expectedTeacherId) {
  if (!rawCredential) return { ok: false, errorCode: 'INVALID_CREDENTIAL' };
  var found = findTeacherCredential_(rawCredential);
  if (!found || !boolValue_(found.row[7], false) || String(found.row[3]) !== 'ACTIVE') {
    return { ok: false, errorCode: 'INVALID_CREDENTIAL' };
  }
  var teacherId = String(found.row[2] || '');
  if (expectedTeacherId && !timingSafeEqual_(teacherId, expectedTeacherId)) {
    return { ok: false, errorCode: 'TEACHER_SCOPE_MISMATCH' };
  }
  var teachers = getOrCreateSheet_(TEACHERS_V2_SHEET, TEACHERS_V2_HEADERS);
  var teacherRow = findRowByKey_(teachers, teacherId);
  if (teacherRow === -1) return { ok: false, errorCode: 'TEACHER_NOT_FOUND' };
  var teacher = teachers.getRange(teacherRow, 1, 1, TEACHERS_V2_HEADERS.length).getValues()[0];
  if (!boolValue_(teacher[3], false)) return { ok: false, errorCode: 'TEACHER_DISABLED' };
  found.sheet.getRange(found.rowIndex, 6).setValue(new Date());
  return { ok: true, teacher_id: teacherId };
}

function redeemTeacherInvite_(inviteCode) {
  var code = normalizeInviteCode_(inviteCode);
  if (!code) return { ok: false, errorCode: 'INVITE_REQUIRED' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    setupTeacherAuthV2_();
    var sh = getOrCreateSheet_(TEACHER_INVITES_V2_SHEET, TEACHER_INVITES_V2_HEADERS);
    var rows = sh.getDataRange().getValues();
    var index = -1;
    for (var i = 1; i < rows.length; i++) {
      if (timingSafeEqual_(normalizeInviteCode_(rows[i][1]), code)) { index = i; break; }
    }
    if (index === -1) return { ok: false, errorCode: 'INVITE_INVALID' };
    var invite = rows[index];
    if (!boolValue_(invite[9], false) || String(invite[2]) === 'REVOKED') return { ok: false, errorCode: 'INVITE_REVOKED' };
    var expiresAt = invite[7] ? new Date(invite[7]).getTime() : 0;
    if (expiresAt && expiresAt <= Date.now()) return { ok: false, errorCode: 'INVITE_EXPIRED' };
    var maxUses = Number(invite[3]) || 1;
    var usedCount = Number(invite[4]) || 0;
    if (String(invite[2]) === 'USED' || usedCount >= maxUses) return { ok: false, errorCode: 'INVITE_USED' };

    var teacherId = String(invite[5] || Utilities.getUuid());
    var teachers = getOrCreateSheet_(TEACHERS_V2_SHEET, TEACHERS_V2_HEADERS);
    if (findRowByKey_(teachers, teacherId) === -1) {
      var now = new Date();
      teachers.appendRow([teacherId, 'invite:' + invite[0], '', true, now, now]);
    }
    var credential = createTeacherCredentialRow_(teacherId, 'invite:' + invite[0]);
    invite[2] = 'USED';
    invite[4] = usedCount + 1;
    invite[5] = teacherId;
    invite[8] = new Date();
    sh.getRange(index + 1, 1, 1, TEACHER_INVITES_V2_HEADERS.length).setValues([invite]);
    return { ok: true, teacher_id: teacherId, credential: credential };
  } finally {
    lock.releaseLock();
  }
}

function createTeacherInvites(count, expiresAt, note) {
  count = Number(count);
  if ([1, 10, 20, 30].indexOf(count) === -1) throw new Error('count must be 1, 10, 20, or 30');
  setupTeacherAuthV2_();
  var sh = getOrCreateSheet_(TEACHER_INVITES_V2_SHEET, TEACHER_INVITES_V2_HEADERS);
  var created = [];
  for (var i = 0; i < count; i++) {
    var code = 'ELAB-' + randomTeacherSecret_().slice(0, 12).toUpperCase();
    var inviteId = Utilities.getUuid();
    sh.appendRow([inviteId, code, 'ACTIVE', 1, 0, '', new Date(), expiresAt ? new Date(expiresAt) : '', '', true, note || '']);
    created.push({ invite_id: inviteId, invite_code: code });
  }
  return created;
}

function createDevClosedBetaInvite() {
  return createTeacherInvites(1, new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'DEV CLOSED BETA TEST')[0];
}

function listTeacherInvites(status) {
  setupTeacherAuthV2_();
  var rows = getOrCreateSheet_(TEACHER_INVITES_V2_SHEET, TEACHER_INVITES_V2_HEADERS).getDataRange().getValues();
  return rows.slice(1).filter(function (row) { return !status || String(row[2]) === String(status); }).map(function (row) {
    var item = {}; TEACHER_INVITES_V2_HEADERS.forEach(function (key, i) { item[key] = row[i]; }); return item;
  });
}

function revokeTeacherInvite(inviteId, note) {
  var sh = getOrCreateSheet_(TEACHER_INVITES_V2_SHEET, TEACHER_INVITES_V2_HEADERS);
  var rowIndex = findRowByKey_(sh, inviteId);
  if (rowIndex === -1) throw new Error('invite not found');
  sh.getRange(rowIndex, 3).setValue('REVOKED');
  sh.getRange(rowIndex, 10).setValue(false);
  if (note) sh.getRange(rowIndex, 11).setValue(note);
  return { ok: true };
}

function reissueTeacherCredential(teacherId, note) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var teachers = getOrCreateSheet_(TEACHERS_V2_SHEET, TEACHERS_V2_HEADERS);
    if (findRowByKey_(teachers, teacherId) === -1) throw new Error('teacher not found');
    var sh = getOrCreateSheet_(TEACHER_CREDENTIALS_V2_SHEET, TEACHER_CREDENTIALS_V2_HEADERS);
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][2]) !== String(teacherId) || !boolValue_(rows[i][7], false)) continue;
      sh.getRange(i + 1, 4).setValue('REVOKED');
      sh.getRange(i + 1, 7).setValue(new Date());
      sh.getRange(i + 1, 8).setValue(false);
    }
    return { ok: true, teacher_id: teacherId, credential: createTeacherCredentialRow_(teacherId, note || 'manual recovery') };
  } finally {
    lock.releaseLock();
  }
}

/* ======================= 학생 capability (0A) =======================
 * 교사용 TOKEN과 학생 제출 권한을 완전히 분리한다.
 * 기본 STUDENT_AUTH_MODE='capability'. 긴급 rollback은
 * STUDENT_AUTH_MODE='legacy_student_token'으로 바꾸되, 이때도 교사용 TOKEN이 아니라
 * 학생 제출 action에만 통하는 별도 임시 토큰을 사용한다.
 */
var STUDENT_POST_ACTIONS_ = [
  'submitResult', 'submitGrammarPractice', 'submitGrammarFinalResult',
  'submitVocabResult', 'submitPracticeResult', 'submitSentenceHomework', 'updateAssignmentStatus',
  'startAttemptV2', 'submitAttemptQuestionV2', 'completeGrammarActivityV1'
];

function getStudentAuthMode_() {
  return PropertiesService.getScriptProperties().getProperty('STUDENT_AUTH_MODE') || 'capability';
}

function getOrCreateStudentSecret_(propertyName) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty(propertyName);
  if (secret) return secret;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    secret = props.getProperty(propertyName);
    if (!secret) {
      secret = Utilities.getUuid() + Utilities.getUuid();
      props.setProperty(propertyName, secret);
    }
    return secret;
  } finally {
    lock.releaseLock();
  }
}

function base64UrlEncode_(bytesOrString) {
  var encoded = typeof bytesOrString === 'string'
    ? Utilities.base64EncodeWebSafe(bytesOrString, Utilities.Charset.UTF_8)
    : Utilities.base64EncodeWebSafe(bytesOrString);
  return encoded.replace(/=+$/, '');
}

function base64UrlDecodeString_(value) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(value)).getDataAsString('UTF-8');
}

function timingSafeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var diff = a.length ^ b.length;
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return diff === 0;
}

function createStudentCapability_(resourceType, resourceKey, actions, scope, expiresAt, metadata) {
  var props = PropertiesService.getScriptProperties();
  var ttlSeconds = Number(props.getProperty('STUDENT_CAPABILITY_TTL_SECONDS')) || 21600;
  var maxExpiry = Date.now() + ttlSeconds * 1000;
  var expiry = Number(expiresAt) || maxExpiry;
  if (expiry > maxExpiry) expiry = maxExpiry;
  var payload = {
    v: 1,
    resourceType: String(resourceType || ''),
    resourceKey: String(resourceKey || ''),
    actions: actions || [],
    scope: scope || {},
    metadata: metadata || {},
    exp: expiry
  };
  var encoded = base64UrlEncode_(JSON.stringify(payload));
  var signature = Utilities.computeHmacSha256Signature(
    encoded,
    getOrCreateStudentSecret_('STUDENT_CAPABILITY_SECRET'),
    Utilities.Charset.UTF_8
  );
  return encoded + '.' + base64UrlEncode_(signature);
}

function verifyStudentCapability_(capability, action, resourceType, resourceKey, scope) {
  try {
    var parts = String(capability || '').split('.');
    if (parts.length !== 2) return false;
    var secret=PropertiesService.getScriptProperties().getProperty('STUDENT_CAPABILITY_SECRET');
    if(!secret)return false;
    var expected = base64UrlEncode_(Utilities.computeHmacSha256Signature(
      parts[0],
      secret,
      Utilities.Charset.UTF_8
    ));
    if (!timingSafeEqual_(parts[1], expected)) return false;
    var payload = JSON.parse(base64UrlDecodeString_(parts[0]));
    if (payload.v !== 1 || Number(payload.exp) <= Date.now()) return false;
    if (String(payload.resourceType) !== String(resourceType || '')) return false;
    if (String(payload.resourceKey) !== String(resourceKey || '')) return false;
    if (!Array.isArray(payload.actions) || payload.actions.indexOf(action) === -1) return false;
    return JSON.stringify(payload.scope || {}) === JSON.stringify(scope || {});
  } catch (err) {
    return false;
  }
}

// 시험 탭을 오래 열어 둔 학생도 완료 결과만 전송할 수 있도록, 서명과 scope가 정확히
// 일치하는 launchAssignment capability에 제한된 만료 유예를 허용한다.
function verifyStudentCapabilityGrace_(capability, action, resourceType, resourceKey, scope, graceMs) {
  try {
    var parts = String(capability || '').split('.');
    if (parts.length !== 2) return false;
    var expected = base64UrlEncode_(Utilities.computeHmacSha256Signature(parts[0],getOrCreateStudentSecret_('STUDENT_CAPABILITY_SECRET'),Utilities.Charset.UTF_8));
    if (!timingSafeEqual_(parts[1], expected)) return false;
    var payload = JSON.parse(base64UrlDecodeString_(parts[0]));
    if (payload.v !== 1 || Number(payload.exp) + Math.max(0, Number(graceMs) || 0) <= Date.now()) return false;
    if (String(payload.resourceType) !== String(resourceType || '') || String(payload.resourceKey) !== String(resourceKey || '')) return false;
    if (!Array.isArray(payload.actions) || payload.actions.indexOf(action) === -1) return false;
    return JSON.stringify(payload.scope || {}) === JSON.stringify(scope || {});
  } catch (err) { return false; }
}

function studentAuthFields_(resourceType, resourceKey, actions, scope, expiresAt) {
  if (getStudentAuthMode_() === 'legacy_student_token') {
    return { studentSubmitToken: getOrCreateStudentSecret_('LEGACY_STUDENT_SUBMIT_TOKEN') };
  }
  return { studentCapability: createStudentCapability_(resourceType, resourceKey, actions, scope, expiresAt) };
}

function normalizeNumsScope_(value) {
  return parseNumList_(value).join(',');
}

function studentPostResource_(d) {
  if (d.action === 'updateAssignmentStatus') return { type:'assignmentTarget', key:d.assignment_target_id, scope:{ student_id:String(d.student_id || '') } };
  if (d.action === 'startAttemptV2' || d.action === 'submitAttemptQuestionV2' || d.action === 'completeGrammarActivityV1') return { type:'assignmentTarget', key:d.assignment_target_id, scope:{ student_id:String(d.student_id || '') } };
  if (d.action === 'submitResult') return { type: 'exam', key: d.examKey, scope: { nums: normalizeNumsScope_(d.nums) } };
  if (d.action === 'submitGrammarPractice') return { type: 'grammarSet', key: d.setKey, scope: {} };
  if (d.action === 'submitGrammarFinalResult') return { type: 'grammarFinal', key: d.setKey, scope: { nums: normalizeNumsScope_(d.nums) } };
  if (d.action === 'submitVocabResult') return { type: 'vocab', key: d.sessionKey, scope: {} };
  if (d.action === 'submitPracticeResult') return { type: 'practice', key: d.practiceKey, scope: {} };
  if (d.action === 'submitSentenceHomework') return { type: 'sentenceSet', key: d.setKey, scope: {} };
  return null;
}

function runQuestionMetadata0CSmokeTest() {
  var props = PropertiesService.getScriptProperties();
  var questionId = props.getProperty('QUESTION_METADATA_0C_SMOKE_ID') || Utilities.getUuid();
  props.setProperty('QUESTION_METADATA_0C_SMOKE_ID', questionId);
  var examKey = 'DEV-0C-SMOKE';
  var question = { question_id:questionId, content_type:'READING', answer_type:'MULTIPLE_CHOICE', text:'[DEV TEST] Learning requires consistent practice.', choices:['①','②','③','④','⑤'], answer:1, source_question_no:99, source:{exam_type:'CUSTOM',year:2026,grade:'DEV',month:8,exam_name:'0C Smoke Test',source_file:'generated-smoke-test'}, category_keys:['READING_GIST'] };
  handleSaveExam_({examKey:examKey,title:'[DEV TEST] 0C Smoke',range:'99번',contentType:'text',questionCount:1,questionNums:[99],answers:[1],questions:[question]});
  var fetched = handleFetchExam_({parameter:{key:examKey}});
  var qRow = getOrCreateSheet_(QUESTIONS_V2_SHEET, QUESTIONS_V2_HEADERS).getRange(findRowByKey_(getOrCreateSheet_(QUESTIONS_V2_SHEET, QUESTIONS_V2_HEADERS), questionId),1,1,QUESTIONS_V2_HEADERS.length).getValues()[0];
  var sourceOk = !!qRow[8], categoryOk = getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET, QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues().some(function(r){return String(r[0])===questionId;});
  var result = {ok:fetched.found && fetched.questionIds[0]===questionId && fetched.questionsContent[0].question_id===questionId && fetched.questionsContent[0].source_question_no===99 && sourceOk && categoryOk, exam_key:examKey, question_id:questionId, source_ok:sourceOk, category_ok:categoryOk, source_question_no:fetched.questionsContent[0].source_question_no};
  console.log(JSON.stringify(result)); return result;
}

function groupByIdV2_(groupId) {
  var sh=getOrCreateSheet_(GROUPS_V2_SHEET,GROUPS_V2_HEADERS), idx=findRowByKey_(sh,groupId);
  return idx===-1?null:sh.getRange(idx,1,1,GROUPS_V2_HEADERS.length).getValues()[0];
}
function assignmentByIdV2_(assignmentId) {
  var sh=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS), idx=findRowByKey_(sh,assignmentId);
  return idx===-1?null:sh.getRange(idx,1,1,ASSIGNMENTS_V2_HEADERS.length).getValues()[0];
}
function targetByIdV2_(targetId) {
  var sh=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS), idx=findRowByKey_(sh,targetId);
  return idx===-1?null:sh.getRange(idx,1,1,ASSIGNMENT_TARGETS_V2_HEADERS.length).getValues()[0];
}
function assertTeacherOwnsStudent_(teacherId, studentId) { var s=studentV2ById_(studentId); return !!s && String(s[1])===String(teacherId) && boolValue_(s[4],true); }

function handleSaveGroupV2_(d) {
  setupAssignmentsV2_(); var teacherId=getOrCreateDefaultTeacher_(), now=new Date(), id=d.group_id||Utilities.getUuid(), old=groupByIdV2_(id);
  if(old && String(old[1])!==teacherId) return textOut_('forbidden');
  upsertRow_(getOrCreateSheet_(GROUPS_V2_SHEET,GROUPS_V2_HEADERS),id,[id,teacherId,d.name||old&&old[2]||'',boolValue_(d.active,old?boolValue_(old[3],true):true),old&&old[4]||now,now,d.grade!==undefined?d.grade:(old&&old[6]||''),d.lesson_days!==undefined?d.lesson_days:(old&&old[7]||''),d.lesson_time!==undefined?d.lesson_time:(old&&old[8]||''),d.memo!==undefined?d.memo:(old&&old[9]||'')]);
  CacheService.getScriptCache().remove('teacher-class-list-v1');
  return textOut_('ok:'+id);
}
function handleSetGroupMembersV2_(d) {
  var teacherId=getOrCreateDefaultTeacher_(), group=groupByIdV2_(d.group_id); if(!group||String(group[1])!==teacherId)return textOut_('forbidden');
  var wanted={}, ids=d.student_ids||[]; for(var i=0;i<ids.length;i++)if(assertTeacherOwnsStudent_(teacherId,ids[i]))wanted[String(ids[i])]=true;
  var sh=getOrCreateSheet_(GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS), values=sh.getDataRange().getValues(), now=new Date();
  for(var r=1;r<values.length;r++)if(String(values[r][1])===String(d.group_id)){var active=!!wanted[String(values[r][2])];sh.getRange(r+1,5).setValue(active?'':now);sh.getRange(r+1,6).setValue(active);delete wanted[String(values[r][2])];}
  Object.keys(wanted).forEach(function(studentId){sh.appendRow([Utilities.getUuid(),d.group_id,studentId,now,'',true]);}); CacheService.getScriptCache().remove('teacher-class-list-v1'); return textOut_('ok');
}
function selectedStudentIdsV2_(teacherId, directIds, groupIds) {
  var selected={}; (directIds||[]).forEach(function(id){if(assertTeacherOwnsStudent_(teacherId,id))selected[String(id)]=true;});
  var members=getOrCreateSheet_(GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS).getDataRange().getValues();
  (groupIds||[]).forEach(function(gid){var g=groupByIdV2_(gid);if(!g||String(g[1])!==teacherId||!boolValue_(g[3],true))return;for(var i=1;i<members.length;i++)if(String(members[i][1])===String(gid)&&boolValue_(members[i][5],true)&&assertTeacherOwnsStudent_(teacherId,members[i][2]))selected[String(members[i][2])]=true;});
  return Object.keys(selected);
}
function linkedPracticeAssignmentIdV1_(value){return value===null||value===undefined?'':String(value).trim();}
function validateLinkedPracticeAssignmentV1_(teacherId,type,subtype,linkedAssignmentId,studentIds){
  var linkedId=linkedPracticeAssignmentIdV1_(linkedAssignmentId);
  if(!linkedId)return '';
  if(String(type)!=='GRAMMAR'||String(subtype)!=='THEORY')return 'LINKED_PRACTICE_THEORY_ONLY';
  var linked=assignmentByIdV2_(linkedId);
  if(!linked)return 'LINKED_PRACTICE_ASSIGNMENT_NOT_FOUND';
  if(String(linked[1])!==String(teacherId))return 'LINKED_PRACTICE_SCOPE_MISMATCH';
  if(String(linked[2])!=='GRAMMAR')return 'LINKED_PRACTICE_INVALID_TYPE';
  if(['BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE'].indexOf(String(linked[11]||''))===-1)return 'LINKED_PRACTICE_INVALID_SUBTYPE';
  if(!boolValue_(linked[8],true))return 'LINKED_PRACTICE_INACTIVE';
  var required={},covered={},targets=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues();
  (studentIds||[]).forEach(function(studentId){required[String(studentId)]=true;});
  for(var i=1;i<targets.length;i++)if(String(targets[i][1])===linkedId&&boolValue_(targets[i][6],true)&&String(targets[i][3]||'')!=='CANCELLED')covered[String(targets[i][2])]=true;
  var ids=Object.keys(required);for(var j=0;j<ids.length;j++)if(!covered[ids[j]])return 'LINKED_PRACTICE_TARGET_COVERAGE_MISSING';
  return '';
}
function grammarTheoryLinkEditStateV1_(assignment){
  var targetRows=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),targetIds={},studentIds=[],started=false;
  for(var i=1;i<targetRows.length;i++)if(String(targetRows[i][1])===String(assignment[0])&&boolValue_(targetRows[i][6],true)){targetIds[String(targetRows[i][0])]=true;studentIds.push(String(targetRows[i][2]));if(String(targetRows[i][3]||'NOT_STARTED')!=='NOT_STARTED'||targetRows[i][4])started=true;}
  var attemptRows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues();
  for(var j=1;j<attemptRows.length;j++)if(targetIds[String(attemptRows[j][1])]){started=true;break;}
  return{started:started,student_ids:studentIds};
}
function lessonDateV2_(value){var raw=String(value||'');if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);var d=value?new Date(value):new Date();if(isNaN(d.getTime()))d=new Date();return d.toISOString().slice(0,10);}
function vocabSetWordIdsV2_(vocabSetId){var rows=getOrCreateSheet_(VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SET_ITEMS_V2_HEADERS).getDataRange().getValues(),items=[];for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(vocabSetId))items.push({word_id:String(rows[i][2]),item_order:Number(rows[i][3])||0});items.sort(function(a,b){return a.item_order-b.item_order;});return items.map(function(x){return x.word_id;});}
function vocabSnapshotV2_(assignment){var out={content_type:assignment[2],content_subtype:assignment[11]||'',title:assignment[4]||''};if(String(assignment[2])!=='VOCAB')return out;var v=findVocabSetByIdOrSessionV2_(assignment[3]);if(!v)return out;out.vocab_set_id=v[0];out.book_source=v[9]||v[4]||'';out.day_set=v[10]||'';out.range_start=v[11]||'';out.range_end=v[12]||'';out.display_range=v[13]||[out.book_source,out.day_set,(out.range_start&&out.range_end?out.range_start+'~'+out.range_end:'')].filter(Boolean).join(' · ')||v[3]||'';out.set_kind=v[14]||'';out.catalog_id=v[16]||'';out.set_number=Number(v[17])||'';out.source_folders_json=v[18]||'';out.word_ids=vocabSetWordIdsV2_(v[0]);out.word_count=out.word_ids.length;return out;}
function findOrCreateHomeworkBatchV2_(teacherId,studentId,lessonDate,title,assignedAt){var sh=getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS),rows=sh.getDataRange().getValues(),day=lessonDateV2_(lessonDate),now=new Date();for(var i=rows.length-1;i>0;i--)if(String(rows[i][1])===String(teacherId)&&String(rows[i][2])===String(studentId)&&String(rows[i][3])===day&&boolValue_(rows[i][6],true))return rows[i];var id=Utilities.getUuid(),row=[id,teacherId,studentId,day,assignedAt||now,title||day+' 수업 후 숙제',true,now,now];sh.appendRow(row);return row;}
function linkAssignmentToHomeworkBatchV2_(batch,assignment,studentId){var sh=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS),rows=sh.getDataRange().getValues();for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(batch[0])&&String(rows[i][2])===String(assignment[0])&&String(rows[i][3])===String(studentId))return rows[i][0];var id=Utilities.getUuid();sh.appendRow([id,batch[0],assignment[0],studentId,JSON.stringify(vocabSnapshotV2_(assignment)),new Date()]);return id;}
function homeworkSnapshotForAssignmentV2_(assignmentId,studentId){var rows=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues();for(var i=rows.length-1;i>0;i--)if(String(rows[i][2])===String(assignmentId)&&String(rows[i][3])===String(studentId)){var snapshot=parseJsonValue_(rows[i][4],null);if(snapshot&&Array.isArray(snapshot.word_ids)&&snapshot.word_ids.length)return snapshot;}return null;}
function backfillHomeworkBatchesV2_(){var ar=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),tr=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),links=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),seen={};for(var l=1;l<links.length;l++)seen[String(links[l][2])+'|'+String(links[l][3])]=true;var byId={};for(var a=1;a<ar.length;a++)byId[String(ar[a][0])]=ar[a];for(var t=1;t<tr.length;t++){var target=tr[t],assignment=byId[String(target[1])],key=String(target[1])+'|'+String(target[2]);if(!assignment||seen[key])continue;var day=lessonDateV2_(assignment[6]),batch=findOrCreateHomeworkBatchV2_(assignment[1],target[2],day,day+' 수업 후 숙제',assignment[6]);linkAssignmentToHomeworkBatchV2_(batch,assignment,target[2]);seen[key]=true;}return true;}
function handleCreateAssignmentV2_(d) {
  if(!d._skip_setup)setupAssignmentsV2_(); var teacherId=getOrCreateDefaultTeacher_(), students=d._resolved_students||selectedStudentIdsV2_(teacherId,d.student_ids,d.group_ids); if(!students.length)return textOut_('no targets');
  var id=Utilities.getUuid(),now=new Date(),type=String(d.content_type||'').toUpperCase();
  if(['VOCAB','GRAMMAR','SENTENCE_STRUCTURE','READING','PRACTICE_EXAM'].indexOf(type)===-1)return textOut_('bad content type');
  var subtype=String(d.content_subtype||'').toUpperCase();if(type==='VOCAB'&&!subtype)subtype='INITIAL';
  if(type==='GRAMMAR'&&['THEORY','BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE','FINAL_QUIZ'].indexOf(subtype)===-1)return textOut_('bad content subtype');
  var linkedPracticeId=linkedPracticeAssignmentIdV1_(d.linked_practice_assignment_id),linkError=validateLinkedPracticeAssignmentV1_(teacherId,type,subtype,linkedPracticeId,students);if(linkError)return textOut_(linkError);
  var assignment=[id,teacherId,type,d.content_ref_id||'',d.title||'',d.content_link||'',now,d.due_at||'',true,now,now,subtype,String(d.request_id||''),linkedPracticeId];
  getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).appendRow(assignment);
  var targets=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS); students.forEach(function(studentId){targets.appendRow([Utilities.getUuid(),id,studentId,'NOT_STARTED','','',true,now,now]);var batch=findOrCreateHomeworkBatchV2_(teacherId,studentId,d.lesson_date||now,d.homework_title||'',now);linkAssignmentToHomeworkBatchV2_(batch,assignment,studentId);});
  CacheService.getScriptCache().remove('teacher-student-list-v1');
  return textOut_('ok:'+id+':'+students.length);
}
function handleCreateAssignmentsBatchV2_(d) {
  var items=Array.isArray(d.assignments)?d.assignments:[];
  if(!items.length||items.length>50)return textOut_('bad assignments');
  var requestId=String(d.request_id||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80),cache=CacheService.getScriptCache(),cacheKey=requestId?'assignment-batch-v2-'+requestId:'';
  if(cacheKey&&cache.get(cacheKey))return textOut_('ok:'+items.length+':duplicate');
  var lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    if(cacheKey&&cache.get(cacheKey))return textOut_('ok:'+items.length+':duplicate');
    var perfStart=Date.now(),mark=perfStart,perf={assignment_count:items.length};
    setupAssignmentsV2_();
    perf.setup_ms=Date.now()-mark;mark=Date.now();
    var teacherId=getOrCreateDefaultTeacher_(),students=selectedStudentIdsV2_(teacherId,d.student_ids,d.group_ids);
    if(!students.length)return textOut_('no targets');
    perf.student_count=students.length;perf.target_resolve_ms=Date.now()-mark;mark=Date.now();
    var assignmentsSheet=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS),targetsSheet=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),batchesSheet=getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS),linksSheet=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS);
    if(requestId){var persisted=assignmentsSheet.getDataRange().getValues(),persistedCount=0;for(var p=1;p<persisted.length;p++)if(String(persisted[p][1])===String(teacherId)&&String(persisted[p][12])===requestId)persistedCount++;if(persistedCount)return textOut_('ok:'+persistedCount+':duplicate');}
    var now=new Date(),day=lessonDateV2_(d.lesson_date||now),assignmentRows=[],snapshots=[];
    for(var i=0;i<items.length;i++){
      var item=items[i]||{};
      var type=String(item.content_type||'').toUpperCase(),subtype=String(item.content_subtype||'').toUpperCase();if(type==='VOCAB'&&!subtype)subtype='INITIAL';
      if(['VOCAB','GRAMMAR','SENTENCE_STRUCTURE','READING','PRACTICE_EXAM'].indexOf(type)===-1)return textOut_('bad content type');
      if(type==='GRAMMAR'&&['THEORY','BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE','FINAL_QUIZ'].indexOf(subtype)===-1)return textOut_('bad content subtype');
      var contentRef=item.content_ref_id||'',contentLink=item.content_link||'';
      if(type==='VOCAB'){
        var vocabSet=findVocabSetByIdOrSessionV2_(contentRef);
        if(!vocabSet)return textOut_('bad vocab ref');
        contentRef=String(vocabSet[0]);contentLink=String(vocabSet[5]||contentLink||'');
        if(!vocabSet[2]||!contentLink)return textOut_('bad vocab link');
      }
      var linkedPracticeId=linkedPracticeAssignmentIdV1_(item.linked_practice_assignment_id),linkError=validateLinkedPracticeAssignmentV1_(teacherId,type,subtype,linkedPracticeId,students);if(linkError)return textOut_(linkError);
      assignmentRows.push([Utilities.getUuid(),teacherId,type,contentRef,item.title||'',contentLink,now,d.due_at||'',true,now,now,subtype,requestId,linkedPracticeId]);
    }
    perf.assignment_build_ms=Date.now()-mark;mark=Date.now();
    for(var s=0;s<assignmentRows.length;s++)snapshots[s]=JSON.stringify(vocabSnapshotV2_(assignmentRows[s]));
    perf.snapshot_build_ms=Date.now()-mark;mark=Date.now();
    var oldBatchRows=batchesSheet.getLastRow()>1?batchesSheet.getRange(2,1,batchesSheet.getLastRow()-1,HOMEWORK_BATCHES_V2_HEADERS.length).getValues():[],batchByStudent={},newBatchRows=[];
    for(var b=oldBatchRows.length-1;b>=0;b--){var oldBatch=oldBatchRows[b],batchKey=String(oldBatch[1])+'|'+String(oldBatch[2])+'|'+String(oldBatch[3]);if(!batchByStudent[batchKey]&&boolValue_(oldBatch[6],true))batchByStudent[batchKey]=oldBatch;}
    students.forEach(function(studentId){var key=String(teacherId)+'|'+String(studentId)+'|'+day;if(!batchByStudent[key]){var row=[Utilities.getUuid(),teacherId,studentId,day,now,d.homework_title||day+' 수업 후 숙제',true,now,now];batchByStudent[key]=row;newBatchRows.push(row);}});
    perf.homework_batch_prepare_ms=Date.now()-mark;mark=Date.now();
    var targetRows=[],linkRows=[];
    assignmentRows.forEach(function(assignment,assignmentIndex){students.forEach(function(studentId){targetRows.push([Utilities.getUuid(),assignment[0],studentId,'NOT_STARTED','','',true,now,now]);var batch=batchByStudent[String(teacherId)+'|'+String(studentId)+'|'+day];linkRows.push([Utilities.getUuid(),batch[0],assignment[0],studentId,snapshots[assignmentIndex],now]);});});
    perf.target_link_build_ms=Date.now()-mark;mark=Date.now();
    appendRowsV2_(assignmentsSheet,assignmentRows,ASSIGNMENTS_V2_HEADERS.length);
    perf.assignment_write_ms=Date.now()-mark;mark=Date.now();
    appendRowsV2_(targetsSheet,targetRows,ASSIGNMENT_TARGETS_V2_HEADERS.length);
    perf.target_write_ms=Date.now()-mark;mark=Date.now();
    appendRowsV2_(batchesSheet,newBatchRows,HOMEWORK_BATCHES_V2_HEADERS.length);
    perf.homework_batch_write_ms=Date.now()-mark;mark=Date.now();
    appendRowsV2_(linksSheet,linkRows,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS.length);
    perf.homework_link_write_ms=Date.now()-mark;perf.total_ms=Date.now()-perfStart;
    perf.target_rows=targetRows.length;perf.new_homework_batches=newBatchRows.length;perf.homework_links=linkRows.length;
    CacheService.getScriptCache().remove('teacher-student-list-v1');
    students.forEach(function(studentId){CacheService.getScriptCache().remove('homework-history-v2-'+String(studentId));});
    if(cacheKey)cache.put(cacheKey,'1',21600);
    console.log('[ELAB-PERF] createAssignmentsBatchV2 '+JSON.stringify(perf));
    return textOut_('ok:'+items.length);
  }finally{lock.releaseLock();}
}
function appendRowsV2_(sheet,rows,width){if(!rows.length)return;sheet.getRange(sheet.getLastRow()+1,1,rows.length,width).setValues(rows);}
function vocabReviewScheduleByIdV1_(scheduleId){var sh=getOrCreateSheet_(VOCAB_REVIEW_SCHEDULES_V2_SHEET,VOCAB_REVIEW_SCHEDULES_V2_HEADERS),idx=findRowByKey_(sh,scheduleId);return idx===-1?null:{sheet:sh,row_index:idx,row:sh.getRange(idx,1,1,VOCAB_REVIEW_SCHEDULES_V2_HEADERS.length).getValues()[0]};}
function handlePostponeVocabReviewV1_(d){var found=vocabReviewScheduleByIdV1_(d.schedule_id),teacherId=getOrCreateDefaultTeacher_();if(!found||String(found.row[1])!==String(teacherId))return textOut_('not found');if(['PENDING','POSTPONED'].indexOf(String(found.row[7]))===-1)return textOut_('not pending');found.row[7]='POSTPONED';found.row[8]=new Date(Date.now()+86400000);found.row[12]=new Date();found.sheet.getRange(found.row_index,1,1,VOCAB_REVIEW_SCHEDULES_V2_HEADERS.length).setValues([found.row]);return textOut_('ok');}
function handleAssignVocabReviewV1_(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d.lesson_date||'')))return textOut_('lesson_date required');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var found=vocabReviewScheduleByIdV1_(d.schedule_id),teacherId=getOrCreateDefaultTeacher_();if(!found||String(found.row[1])!==String(teacherId))return textOut_('not found');
    var schedule=found.row,status=String(schedule[7]);if(status==='ASSIGNED'||status==='COMPLETED')return textOut_('ok:'+String(schedule[9]||'')+':duplicate');if(['PENDING','POSTPONED'].indexOf(status)===-1)return textOut_('not pending');
    var sourceAttempt=attemptByIdV2_(schedule[4]),sourceTarget=sourceAttempt&&targetByIdV2_(sourceAttempt[1]),sourceAssignment=sourceTarget&&assignmentByIdV2_(sourceTarget[1]);
    if(!sourceAttempt||String(sourceAttempt[9])!=='COMPLETED'||String(sourceAttempt[4])!=='VOCAB'||String(sourceAttempt[5])!=='INITIAL'||!sourceAssignment)return textOut_('invalid source attempt');
    var snapshot=homeworkSnapshotForAssignmentV2_(sourceAssignment[0],schedule[2]);if(!snapshot)return textOut_('source snapshot required');
    var vocabSet=findVocabSetByIdOrSessionV2_(schedule[3]);if(!vocabSet||String(vocabSet[0])!==String(snapshot.vocab_set_id||schedule[3]))return textOut_('invalid vocab set');
    var now=new Date(),assignmentId=Utilities.getUuid(),targetId=Utilities.getUuid(),subtype=String(schedule[5]),requestId='retention-'+String(schedule[0]),title=(vocabSet[3]||sourceAssignment[4]||'Vocabulary')+' · '+subtype;
    var assignment=[assignmentId,teacherId,'VOCAB',vocabSet[0],title,vocabSet[5]||sourceAssignment[5]||'',now,d.due_at||'',true,now,now,subtype,requestId];
    getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).appendRow(assignment);
    getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).appendRow([targetId,assignmentId,schedule[2],'NOT_STARTED','','',true,now,now]);
    var batch=findOrCreateHomeworkBatchV2_(teacherId,schedule[2],d.lesson_date,d.homework_title||'',now);
    getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).appendRow([Utilities.getUuid(),batch[0],assignmentId,schedule[2],JSON.stringify(snapshot),now]);
    schedule[7]='ASSIGNED';schedule[8]='';schedule[9]=assignmentId;schedule[12]=now;found.sheet.getRange(found.row_index,1,1,VOCAB_REVIEW_SCHEDULES_V2_HEADERS.length).setValues([schedule]);
    CacheService.getScriptCache().remove('teacher-student-list-v1');CacheService.getScriptCache().remove('homework-history-v2-'+String(schedule[2]));return textOut_('ok:'+assignmentId);
  }finally{lock.releaseLock();}
}
function handleListDueVocabReviewsV1_(e){
  if(e.parameter.token!==getToken_())return{error:'no token'};var teacherId=getOrCreateDefaultTeacher_(),limit=Math.min(100,Math.max(1,Number(e.parameter.limit)||30)),cursor=Math.max(0,Number(e.parameter.cursor)||0),cutoff=e.parameter.date?new Date(String(e.parameter.date)+'T23:59:59.999'):new Date();if(isNaN(cutoff.getTime()))return{error:'bad date'};
  var scheduleRows=getOrCreateSheet_(VOCAB_REVIEW_SCHEDULES_V2_SHEET,VOCAB_REVIEW_SCHEDULES_V2_HEADERS).getDataRange().getValues(),studentRows=getOrCreateSheet_(STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS).getDataRange().getValues(),vocabRows=getOrCreateSheet_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS).getDataRange().getValues(),students={},vocabs={},out=[];
  for(var s=1;s<studentRows.length;s++)students[String(studentRows[s][0])]=studentRows[s];for(var v=1;v<vocabRows.length;v++)vocabs[String(vocabRows[v][0])]=vocabRows[v];
  for(var i=1;i<scheduleRows.length;i++){var row=scheduleRows[i],status=String(row[7]),effective=status==='POSTPONED'?new Date(row[8]):new Date(row[6]);if(String(row[1])!==String(teacherId)||['PENDING','POSTPONED'].indexOf(status)===-1||isNaN(effective.getTime())||effective.getTime()>cutoff.getTime())continue;var student=students[String(row[2])],vocab=vocabs[String(row[3])],days=String(row[5])==='D30'?30:7,recommended=new Date(row[6]);out.push({schedule_id:row[0],student_id:row[2],student_name:student?student[2]:'',vocab_set_id:row[3],set_title:vocab?vocab[3]:'',display_range:vocab?(vocab[13]||vocab[3]):'',review_type:row[5],source_completed_at:new Date(recommended.getTime()-days*86400000),recommended_at:row[6],postponed_until:row[8]||'',status:status,assigned_assignment_id:row[9]||''});}
  out.sort(function(a,b){return new Date(a.recommended_at)-new Date(b.recommended_at);});var page=out.slice(cursor,cursor+limit);return{items:page,total:out.length,next_cursor:cursor+page.length<out.length?cursor+page.length:null};
}

// First-import extension. No setup/getOrCreate, legacy commit, or student runtime calls.
// Pin the approved immutable manifest: client-supplied hashes alone are not trusted.
function vocabularyFirstImportSpecV1_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = String(properties.getProperty('VOCABULARY_IMPORT_SPREADSHEET_ID') || '').trim();
  var targetSheetId = Number(properties.getProperty('VOCABULARY_IMPORT_TARGET_SHEET_ID'));
  var stagingSheetId = Number(properties.getProperty('VOCABULARY_IMPORT_STAGING_SHEET_ID'));
  vocabularyFirstImportAssertV1_(spreadsheetId && targetSheetId > 0 && stagingSheetId > 0,
    'FIRST_IMPORT_CONFIG_MISSING');
  return {
    batch_id: 'vocab-first-3244-4321164ed090220d', request_id: 'vocab-first-3244-4321164ed090220d',
    manifest_sha256: 'b240ba5c5dcee204ba515c8f13b8bd689717d9e32a8248fd2fad0abdceb8ce9b',
    preimport_sha256: '4321164ed090220d9fc6022f954a4cb39b97972d835f4212a1e0f94ca8ccba17',
    schema_version: 'ELAB_VOCAB_FIRST_IMPORT_MANIFEST_V1', expected_total: 3244,
    expected_unique_sense_ids: 3244, expected_levels: {V1:800,V2:822,V3:818,V4:604,V5:200}, chunk_count: 7,
    rows_hash: '80ea3056754cc952c800529f6135245eccf21e5fbb330af4845f7970b4366b01',
    headers_hash: '9973f80107a571ae46591ac10307e3ee3c6b2a497e56584c64b44051e449ec29',
    spreadsheet_id: spreadsheetId, sheet_id: targetSheetId, staging_sheet_id: stagingSheetId,
    chunk_hashes: [
      '706c4cd6ad5155f6941b3dfc39781c34b7c9b714793be711d0eb4bd2e18d42e3',
      '2b7d5fe08590c8d18882a0f6ecf8861c9218df1698a05fea4b8ce8d615723cee',
      'e3e5a33885df99941b666663e8c2ce709528f10dcf0c1f0e1754aecfdf01f886',
      '55d5e97ee6ca5d84aaceb63589306d7c58f287348a9862021c5ebc1469e0a56e',
      'baf023ad35a0ca9b2d20bdf1fde882ff6f5768291d4629a84a9aa190a8f28834',
      '5c31ee906510fea2c32dd167b92480c5bdad173ea041cef8ad5c9ad5dd90fef2',
      'b933a242377769524361fed0ea8d0c8480a07ef57c5f807c7adf1dd4d1cdbeaa'
    ]
  };
}
function vocabularyFirstImportAssertV1_(condition, code, reason) {
  if (!condition) { var error = new Error(code); error.firstImportCode = code; error.firstImportReason = reason; throw error; }
}
function vocabularyFirstImportHashV1_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function vocabularyFirstImportMetadataV1_(d, spec) {
  ['batch_id','request_id','manifest_sha256','preimport_sha256','schema_version','expected_total','expected_unique_sense_ids','chunk_count'].forEach(function(key) {
    vocabularyFirstImportAssertV1_(d[key] === spec[key], 'METADATA_MISMATCH_' + key.toUpperCase());
  });
  vocabularyFirstImportAssertV1_(d.expected_levels && Object.keys(d.expected_levels).length === 5 &&
    Object.keys(spec.expected_levels).every(function(k) { return d.expected_levels[k] === spec.expected_levels[k]; }), 'LEVEL_METADATA_MISMATCH');
}
function vocabularyFirstImportReadV1_(ss, name, headers, code, minimumRows) {
  var sheet = ss.getSheetByName(name);
  vocabularyFirstImportAssertV1_(sheet, code);
  if (minimumRows) vocabularyFirstImportAssertV1_(sheet.getMaxRows() >= minimumRows && sheet.getMaxColumns() >= headers.length,
    code, 'INSUFFICIENT_SHEET_CAPACITY');
  var range = sheet.getDataRange(), values = range.getValues(), formulas = range.getFormulas();
  vocabularyFirstImportAssertV1_(headers.every(function(h, i) { return values[0][i] === h && !formulas[0][i]; }), code);
  vocabularyFirstImportAssertV1_(values.every(function(row, r) {
    return row.slice(headers.length).every(function(v) { return v === ''; }) && formulas[r].slice(headers.length).every(function(v) { return v === ''; });
  }), code);
  return { sheet: sheet, values: values, formulas: formulas };
}
function vocabularyFirstImportAuditV1_(imports, spec) {
  var matches = [];
  imports.values.forEach(function(row, i) { if (i && row[0] === spec.batch_id) matches.push(i); });
  vocabularyFirstImportAssertV1_(matches.length <= 1, 'AUDIT_DUPLICATE');
  if (!matches.length) return null;
  var index = matches[0], row = imports.values[index], prefix = 'VOCAB_FIRST_IMPORT_V1:';
  vocabularyFirstImportAssertV1_(!imports.formulas[index].some(Boolean) && String(row[12]).indexOf(prefix) === 0, 'AUDIT_CONFLICT');
  var audit;
  try { audit = JSON.parse(String(row[12]).slice(prefix.length)); } catch (e) { vocabularyFirstImportAssertV1_(false, 'AUDIT_INVALID'); }
  vocabularyFirstImportMetadataV1_(audit, spec);
  vocabularyFirstImportAssertV1_(audit.status === row[3] && Array.isArray(audit.chunks) && audit.chunks.length === 7, 'AUDIT_INVALID');
  return { row: index + 1, audit: audit };
}
function vocabularyFirstImportSaveAuditV1_(imports, record, audit) {
  var row = record ? imports.values[record.row - 1].slice(0, 26) : Array(26).fill('');
  row[0] = audit.batch_id; row[2] = 'ELAB_Vocabulary_Curriculum_3244_PREIMPORT.xlsx';
  row[3] = audit.status; row[4] = audit.expected_total; row[5] = audit.actual_rows || 0;
  row[8] = audit.error_code ? 1 : 0; row[9] = audit.created_at;
  if (audit.status === 'COMPLETED') row[11] = audit.finished_at;
  row[12] = 'VOCAB_FIRST_IMPORT_V1:' + JSON.stringify(audit);
  var sheetRow = record ? record.row : imports.sheet.getLastRow() + 1;
  imports.sheet.getRange(sheetRow, 1, 1, 26).setValues([row]);
  imports.values[sheetRow - 1] = row;
  return { row: sheetRow, audit: audit };
}
function vocabularyFirstImportStagedV1_(staging, spec) {
  var out = [], seen = {};
  staging.values.forEach(function(row, i) {
    if (!i || row[1] !== spec.batch_id) return;
    var source = row[2];
    vocabularyFirstImportAssertV1_(Number.isInteger(source) && source >= 2 && source <= 3245 && !seen[source] &&
      row[0] === spec.batch_id + ':' + source && !staging.formulas[i].some(Boolean), 'STAGING_ROW_CONFLICT');
    // Timestamps are omitted from canonical hashes, so validate their type on EVERY read,
    // including retries/validation. A failed write must not become accepted on replay.
    vocabularyFirstImportAssertV1_(row[13] instanceof Date && isFinite(row[13].getTime()), 'TYPE_COERCION_DETECTED');
    seen[source] = true;
    // Staging has no level_review_status; the pinned PREIMPORT has blank values there.
    out.push({ sheet_row: i + 1, source_row: source,
      values: [row[7],row[6],row[4],row[5],row[3],row[8],row[9],row[10],row[11],row[12],'','',row[19],'',row[14],row[15],row[16],row[17],row[18],row[20],row[21]] });
  });
  return out.sort(function(a,b) { return a.source_row - b.source_row; });
}
function vocabularyFirstImportRowsCheckV1_(rows, spec) {
  vocabularyFirstImportAssertV1_(rows.length === spec.expected_total, 'STAGING_TOTAL_MISMATCH');
  var ids = Object.create(null), levels = {V1:0,V2:0,V3:0,V4:0,V5:0};
  rows.forEach(function(row, i) {
    vocabularyFirstImportAssertV1_(Array.isArray(row) && row.length === 21, 'ROW_WIDTH_MISMATCH');
    var raw = {}; VOCABULARY_DB_HEADERS.forEach(function(h,j) { raw[h] = row[j]; });
    vocabularyFirstImportAssertV1_(!normalizeVocabularyImportRowV1_(raw,i+2).errors.length, 'ROW_VALIDATION_FAILED');
    vocabularyFirstImportAssertV1_(!ids[row[0]], 'DUPLICATE_SENSE_ID'); ids[row[0]] = true;
    vocabularyFirstImportAssertV1_(row[4] === row[19] && row[15] === row[19] && /^V[1-5]$/.test(row[19]), 'LEVEL_MISMATCH');
    levels[row[19]]++;
    vocabularyFirstImportAssertV1_(row[9] === true && row[14] === true && row[16] === false, 'FLAG_MISMATCH');
    vocabularyFirstImportAssertV1_(row[10] === '' && row[11] === '', 'SOURCE_TIMESTAMP_MISMATCH');
  });
  vocabularyFirstImportAssertV1_(Object.keys(levels).every(function(k) { return levels[k] === spec.expected_levels[k]; }), 'LEVEL_COUNTS_MISMATCH');
  vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(rows) === spec.rows_hash, 'ROW_FINGERPRINT_MISMATCH');
  return { total: rows.length, unique_sense_ids: Object.keys(ids).length, levels: levels, row_fingerprints: 'PASS' };
}
function vocabularyFirstImportCompleteV1_(staged, audit, spec) {
  vocabularyFirstImportAssertV1_(audit && audit.chunks.every(function(h,i) { return h === spec.chunk_hashes[i]; }), 'CHUNKS_INCOMPLETE');
  vocabularyFirstImportAssertV1_(staged.length === 3244, 'STAGING_TOTAL_MISMATCH');
  vocabularyFirstImportAssertV1_(staged.every(function(row,i) { return row.source_row === i + 2; }), 'SOURCE_ROW_MISMATCH');
  var rows = staged.map(function(row) { return row.values; });
  var summary = vocabularyFirstImportRowsCheckV1_(rows,spec);
  spec.chunk_hashes.forEach(function(h,i) {
    vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(rows.slice(i*500,(i+1)*500)) === h, 'CHUNK_FINGERPRINT_MISMATCH');
  });
  return { rows: rows, summary: summary };
}
function vocabularyFirstImportOtherMarkerV1_(imports, spec) {
  return imports.values.some(function(row,i) {
    if (!i || row[0] === spec.batch_id) return false;
    return /^(COMMITTING|COMMITTED|COMPLETED|ROLLING_BACK|ROLLED_BACK)$/.test(String(row[3])) ||
      (String(row[12]).indexOf('VOCAB_FIRST_IMPORT_V1:') === 0 && String(row[3]) === 'FAILED');
  });
}
function vocabularyFirstImportPhysicalV1_(ss, imports, spec, empty) {
  var code = 'FIRST_IMPORT_PRECONDITION_FAILED';
  vocabularyFirstImportAssertV1_(ss.getId() === spec.spreadsheet_id && !vocabularyFirstImportOtherMarkerV1_(imports,spec), code);
  vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(VOCABULARY_DB_HEADERS) === spec.headers_hash, code);
  var db = vocabularyFirstImportReadV1_(ss,VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS,code,3245);
  vocabularyFirstImportAssertV1_(db.sheet.getSheetId() === spec.sheet_id, code);
  vocabularyFirstImportAssertV1_(!db.formulas.some(function(row) { return row.some(Boolean); }), code);
  vocabularyFirstImportAssertV1_(db.sheet.getRange(2,1,3244,21).getMergedRanges().length === 0, code);
  var occupied = db.values.slice(1).filter(function(row) { return row.some(function(v) { return v !== ''; }); });
  if (empty) vocabularyFirstImportAssertV1_(occupied.length === 0, code);
  db.actual_rows = occupied.length;
  return db;
}
function vocabularyFirstImportPostV1_(ss, imports, spec, audit) {
  var db = vocabularyFirstImportPhysicalV1_(ss,imports,spec,false);
  vocabularyFirstImportAssertV1_(audit.write_range === 'A2:U3245' && audit.target_id === spec.spreadsheet_id && audit.target_gid === spec.sheet_id, 'AUDIT_TARGET_MISMATCH');
  vocabularyFirstImportAssertV1_(db.actual_rows === 3244, 'PARTIAL_IMPORT_DETECTED');
  var rows = db.values.slice(1,3245).map(function(row) { return row.slice(0,21); });
  var fullHash = vocabularyFirstImportHashV1_(rows);
  rows.forEach(function(row) {
    [10,11].forEach(function(i) {
      vocabularyFirstImportAssertV1_(row[i] instanceof Date && row[i].toISOString() === audit.batch_timestamp, 'POST_TIMESTAMP_MISMATCH');
      row[i] = '';
    });
  });
  var summary = vocabularyFirstImportRowsCheckV1_(rows,spec);
  if (audit.post_hash) vocabularyFirstImportAssertV1_(audit.post_hash === fullHash, 'POST_FINGERPRINT_MISMATCH');
  return { summary: summary, post_hash: fullHash, db: db };
}
// Staging-only type contract: text, number, boolean and Date retain their types.
function vocabularyFirstImportStagingWriteV1_(sheet, firstRow, rows) {
  var text = [0,1,3,4,5,6,7,8,15,18,19,20,21], numbers = [2,9,10,11,17], flags = [12,14,16];
  var spec = vocabularyFirstImportSpecV1_();
  vocabularyFirstImportAssertV1_(rows.length > 0 && rows.length <= 500 && Number.isInteger(firstRow) && firstRow >= 2, 'STAGING_TYPE_CONTRACT_FAILED');
  rows.forEach(function(row) {
    vocabularyFirstImportAssertV1_(row.length === 22 && text.every(function(i) { return typeof row[i] === 'string'; }) &&
      numbers.every(function(i) { return typeof row[i] === 'number' && isFinite(row[i]); }) &&
      flags.every(function(i) { return typeof row[i] === 'boolean'; }) && row[13] instanceof Date && isFinite(row[13].getTime()) &&
      row[1] === spec.batch_id && Number.isInteger(row[2]) && row[2] >= 2 && row[2] <= 3245 &&
      row[0] === spec.batch_id + ':' + row[2], 'STAGING_TYPE_CONTRACT_FAILED');
  });
  // Keep the pinned, non-interpretable ownership IDs even if the first write is interrupted.
  // Other text is written separately, only after its bounded range is plain text.
  var scalar = rows.map(function(row) { return row.map(function(value,i) { return i > 1 && text.indexOf(i) !== -1 ? '' : value; }); });
  sheet.getRange(firstRow,1,rows.length,22).setValues(scalar);
  [[0,2],[3,6],[15,1],[18,4]].forEach(function(block) {
    vocabularyFirstImportTextWriteV1_(sheet.getRange(firstRow,block[0]+1,rows.length,block[1]),
      rows.map(function(row) { return row.slice(block[0],block[0]+block[1]); }));
  });
}
// First-import DB mapping only; canonical values are never escaped in memory.
// Reuse the staging round-trip primitive for STRING_REQUIRED columns alone.
function vocabularyFirstImportDbWriteV1_(sheet, rows) {
  var text = [0,1,2,3,4,5,12,13,15,18,19,20], numbers = [6,7,8,17], flags = [9,14,16];
  vocabularyFirstImportAssertV1_(rows.length === 3244 && rows.every(function(row) {
    return row.length === 21 && text.every(function(i) { return typeof row[i] === 'string'; }) &&
      numbers.every(function(i) { return typeof row[i] === 'number' && isFinite(row[i]); }) &&
      flags.every(function(i) { return typeof row[i] === 'boolean'; }) &&
      [10,11].every(function(i) { return row[i] instanceof Date && isFinite(row[i].getTime()); });
  }), 'DB_TYPE_CONTRACT_FAILED');
  // Do not pass interpretable strings to a General-format scalar write.
  sheet.getRange(2,1,3244,21).setValues(rows.map(function(row) {
    return row.map(function(value,i) { return text.indexOf(i) === -1 ? value : ''; });
  }));
  [[0,6],[12,2],[15,1],[18,3]].forEach(function(block) {
    vocabularyFirstImportTextWriteV1_(sheet.getRange(2,block[0]+1,3244,block[1]),
      rows.map(function(row) { return row.slice(block[0],block[0]+block[1]); }));
  });
}
function vocabularyFirstImportTextWriteV1_(range, rows) {
  var rich = rows.map(function(row) { return row.map(function(value) {
    vocabularyFirstImportAssertV1_(typeof value === 'string', 'STAGING_TYPE_CONTRACT_FAILED');
    return SpreadsheetApp.newRichTextValue().setText(value).build();
  }); });
  // '@' is Sheets' text format token. Formatting alone does not replace a boolean.
  // Explicitly replace scalar values too: RichText alone left E1560 boolean in production.
  range.setNumberFormat('@');
  // Never submit formula-like input to setValues, even on a plain-text range.
  range.setValues(rows.map(function(row) { return row.map(function(value) {
    return /^[=+\-@]/.test(value) ? '' : value;
  }); }));
  range.setRichTextValues(rich);
  // Literal U+0027 is canonical content, not an input escape marker. Keep the
  // normal/false/formula-like path unchanged. Only these STRING_REQUIRED cells
  // receive one extra input apostrophe, AFTER RichText, followed by exact readback.
  // The local incident model consumes one prefix. Do not infer a live Sheets
  // round-trip guarantee from that model: reject any different stored semantics.
  rows.forEach(function(row,i) { row.forEach(function(value,j) {
    if (value.charAt(0) !== "'") return;
    var cell = range.getCell(i+1,j+1);
    cell.setValues([["'" + value]]);
    SpreadsheetApp.flush();
    var stored = cell.getValues()[0][0];
    vocabularyFirstImportAssertV1_(typeof stored === 'string' && stored === value && !cell.getFormulas()[0][0],
      'LEADING_APOSTROPHE_POSTCHECK_FAILED');
  }); });
}
// Incident-specific, no client-selected destinations or replacement values.
// Exact strings are pinned from the SHA-verified PREIMPORT, not report excerpts.
function vocabularyFirstImportApostropheTargetsV1_() {
  return [
    {cell:'S3204',source_row:3204,sense_id:'SEN_543D1DA76B91',field:'selection_reason',
      before:"자신감 있는'과 구별되는 문맥적 의미로 학습 가치가 있음.",
      after:"'자신감 있는'과 구별되는 문맥적 의미로 학습 가치가 있음."},
    {cell:'S3228',source_row:3228,sense_id:'SEN_10DD210DC5B5',field:'selection_reason',
      before:"A를 ~로 여기다'의 중요한 다의어 용법으로 별도 학습 가치가 큼.",
      after:"'A를 ~로 여기다'의 중요한 다의어 용법으로 별도 학습 가치가 큼."}
  ];
}
function vocabularyFirstImportApostropheRepairV1_(d, ss, imports, record, staging, staged, spec, dry) {
  var code = 'APOSTROPHE_REPAIR_STATE_CONFLICT', audit = record && record.audit;
  vocabularyFirstImportAssertV1_(d.approval === 'REPAIR_FIRST_IMPORT_LEADING_APOSTROPHE', 'EXPLICIT_REPAIR_APPROVAL_REQUIRED');
  var keys = ['action','token','approval','dry_run','batch_id','request_id','manifest_sha256','preimport_sha256',
    'schema_version','expected_total','expected_unique_sense_ids','expected_levels','chunk_count'];
  vocabularyFirstImportAssertV1_(Object.keys(d).every(function(k) { return keys.indexOf(k) !== -1; }), 'REPAIR_TARGET_MISMATCH');
  // Unlike legacy actions, actual execution must explicitly specify false.
  vocabularyFirstImportAssertV1_(typeof d.dry_run === 'boolean', 'INVALID_DRY_RUN');
  vocabularyFirstImportPhysicalV1_(ss,imports,spec,true);
  vocabularyFirstImportAssertV1_(audit && audit.status === 'STAGING' && audit.actual_rows === 3000 &&
    imports.values[record.row-1][5] === 3000 && !audit.error_code &&
    audit.chunks.slice(0,6).every(function(h,i) { return h === spec.chunk_hashes[i]; }) && audit.chunks[6] === null,
    code);
  vocabularyFirstImportAssertV1_(staging.sheet.getSheetId() === spec.staging_sheet_id && staged.length === 3244 &&
    !staging.formulas.some(function(row) { return row.some(Boolean); }) &&
    staged.every(function(row,i) { return row.source_row === i+2 && row.sheet_row === i+2; }) &&
    staging.values.slice(1).every(function(row) { return !row.some(function(v) { return v !== ''; }) || row[1] === spec.batch_id; }), code);
  var rows = staged.map(function(row) { return row.values; }), seen = Object.create(null);
  rows.forEach(function(row) { vocabularyFirstImportAssertV1_(!seen[row[0]], 'DUPLICATE_SENSE_ID'); seen[row[0]] = true; });
  for (var i=0;i<6;i++) vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(rows.slice(i*500,(i+1)*500)) === spec.chunk_hashes[i], code);
  var targets = vocabularyFirstImportApostropheTargetsV1_(), afterCount = 0;
  targets.forEach(function(t) {
    var row = staged[t.source_row-2], value = row.values[18];
    vocabularyFirstImportAssertV1_(row.values[0] === t.sense_id &&
      staging.sheet.getRange(t.source_row,19,1,1).getMergedRanges().length === 0 &&
      typeof value === 'string' && (value === t.before || value === t.after), code);
    if (value === t.after) afterCount++;
  });
  vocabularyFirstImportAssertV1_(afterCount !== 1, 'PARTIAL_REPAIR_STATE');
  var currentHash = vocabularyFirstImportHashV1_(rows.slice(3000));
  vocabularyFirstImportAssertV1_(currentHash === (afterCount === 2 ? spec.chunk_hashes[6] :
    '01cd69c0b9103519fe2aac86abf01cab423ffc4a6bdc15ae89d783d8bb9c3f46'), code);
  var repaired = rows.map(function(row) { return row.slice(); });
  targets.forEach(function(t) { repaired[t.source_row-2][18] = t.after; });
  vocabularyFirstImportRowsCheckV1_(repaired,spec);
  vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(repaired.slice(3000)) === spec.chunk_hashes[6], code);
  var result = {ok:true,code:afterCount === 2?'ALREADY_REPAIRED':'WOULD_REPAIR',dry_run:dry,target_count:2,
    sheet:VOCABULARY_IMPORT_STAGING_V2_SHEET,chunk_index:6,current_chunk_hash:currentHash,
    expected_repaired_chunk_hash:spec.chunk_hashes[6],audit_recovered:false,history_write:false,
    targets:targets.map(function(t) { return {cell:t.cell,source_row:t.source_row,sense_id:t.sense_id,field:t.field,
      before:{value:rows[t.source_row-2][18],type:'string'},after:{value:t.after,type:'string'}}; })};
  if (dry || afterCount === 2) return result;
  // Non-contiguous Range writes are NOT atomic. Never retry or roll back here.
  // No history write: a failure is returned explicitly, not marked REPAIRED.
  var expectedPhysical = staging.values.map(function(row) { return row.slice(); });
  targets.forEach(function(t) { expectedPhysical[t.source_row-1][18] = t.after; });
  var writeFailed = false;
  try {
    targets.forEach(function(t) {
      vocabularyFirstImportTextWriteV1_(staging.sheet.getRange(t.source_row,19,1,1),[[t.after]]);
    });
    SpreadsheetApp.flush();
  } catch (writeError) { writeFailed = true; }
  try {
    var fresh = vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS,code);
    var matched = targets.filter(function(t) { return fresh.values[t.source_row-1][18] === t.after &&
      !fresh.formulas[t.source_row-1][18]; }).length;
    if (matched === 1) return {ok:false,code:'PARTIAL_REPAIR_DETECTED',repaired_target_count:1,automatic_retry:false,audit_recovered:false};
    vocabularyFirstImportAssertV1_(!writeFailed && matched === 2 &&
      vocabularyFirstImportHashV1_(fresh.values) === vocabularyFirstImportHashV1_(expectedPhysical) &&
      vocabularyFirstImportHashV1_(fresh.formulas) === vocabularyFirstImportHashV1_(staging.formulas), 'REPAIR_POSTCHECK_FAILED');
    var afterRows = vocabularyFirstImportStagedV1_(fresh,spec).map(function(row) { return row.values; });
    vocabularyFirstImportRowsCheckV1_(afterRows,spec);
    vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(afterRows.slice(3000)) === spec.chunk_hashes[6], 'REPAIR_POSTCHECK_FAILED');
    var freshImports = vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORTS_V2_SHEET,VOCABULARY_IMPORTS_V2_HEADERS,code);
    vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(freshImports.values) === vocabularyFirstImportHashV1_(imports.values) &&
      vocabularyFirstImportHashV1_(freshImports.formulas) === vocabularyFirstImportHashV1_(imports.formulas), 'REPAIR_POSTCHECK_FAILED');
    vocabularyFirstImportPhysicalV1_(ss,freshImports,spec,true);
    result.code = 'REPAIRED'; result.repaired_chunk_hash = spec.chunk_hashes[6]; result.full_rows_exact = true;
    return result;
  } catch (postError) {
    return {ok:false,code:'REPAIR_POSTCHECK_FAILED',automatic_retry:false,audit_recovered:false};
  }
}
function vocabularyFirstImportRepairV1_(d, ss, imports, record, staging, staged, spec, dry) {
  var code = 'REPAIR_STATE_CONFLICT', audit = record && record.audit;
  vocabularyFirstImportAssertV1_(d.approval === 'REPAIR_FIRST_IMPORT_WORD_FALSE', 'EXPLICIT_REPAIR_APPROVAL_REQUIRED');
  vocabularyFirstImportAssertV1_(d.chunk_index === 3 && d.source_row === 1560 && d.sense_id === 'SEN_A587053E40B9' &&
    d.field === 'word' && d.before_type === 'boolean' && d.before_value === false &&
    d.after_type === 'string' && d.after_value === 'false' &&
    ['sheet','sheet_name','sheet_id','cell','range','row','column','value','new_value'].every(function(k) { return d[k] === undefined; }),
    'REPAIR_TARGET_MISMATCH');
  vocabularyFirstImportPhysicalV1_(ss,imports,spec,true);
  vocabularyFirstImportAssertV1_(audit && audit.status === 'STAGING' && staged.length === 2000 &&
    staged.every(function(row,i) { return row.source_row === i+2; }) &&
    audit.chunks.slice(0,3).every(function(h,i) { return h === spec.chunk_hashes[i]; }) &&
    audit.chunks.slice(4).every(function(h) { return h === null; }), code);
  var rows = staged.map(function(row) { return row.values; }), target = staged[1558], chunk = rows.slice(1500);
  vocabularyFirstImportAssertV1_(target.sheet_row === 1560 && target.values[0] === d.sense_id &&
    staging.sheet.getSheetId() === spec.staging_sheet_id && staging.sheet.getRange(1560,5).getMergedRanges().length === 0, code);
  [0,1,2].forEach(function(i) { vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(rows.slice(i*500,(i+1)*500)) === spec.chunk_hashes[i], code); });
  var value = target.values[2], already = value === 'false';
  vocabularyFirstImportAssertV1_(value === false || already, code);
  var counted = imports.values[record.row-1][5];
  var pending = audit.actual_rows === 1500 && counted === 1500 && audit.chunks[3] === null;
  var accepted = audit.actual_rows === 2000 && counted === 2000 && audit.chunks[3] === spec.chunk_hashes[3];
  vocabularyFirstImportAssertV1_(pending || (already && accepted), code);
  var currentHash = vocabularyFirstImportHashV1_(chunk);
  vocabularyFirstImportAssertV1_(currentHash === (already ? spec.chunk_hashes[3] : '73ad014b341b06c658557d86b1ec5dc8d463b666b642d6fdcb0f1d96fe8fcb8d'), code);
  var repairedRows = rows.map(function(row) { return row.slice(); }); repairedRows[1558][2] = 'false';
  vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(repairedRows.slice(1500)) === spec.chunk_hashes[3], code);
  var allHash = vocabularyFirstImportHashV1_(repairedRows);
  var result = {ok:true,code:already?'ALREADY_REPAIRED':'WOULD_REPAIR',dry_run:dry,cell:'E1560',chunk_index:3,
    expected_chunk_hash:spec.chunk_hashes[3],audit_recovered:false,
    source_row:1560,sense_id:'SEN_A587053E40B9',field:'word',
    before:{value:value,type:typeof value},after:{value:'false',type:'string'},current_chunk_hash:currentHash,
    history_recorded:!!(audit.type_repair && audit.type_repair.status === 'REPAIRED')};
  if (already || dry) return result;
  var event = {batch_id:spec.batch_id,chunk_index:3,sense_id:d.sense_id,field:'word',before_type:'boolean',after_type:'string',
    status:'REPAIRED',timestamp:new Date().toISOString(),error_code:''};
  try {
    vocabularyFirstImportTextWriteV1_(staging.sheet.getRange(1560,5,1,1), [['false']]);
    SpreadsheetApp.flush();
    var fresh = vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS,code);
    var after = vocabularyFirstImportStagedV1_(fresh,spec), afterRows = after.map(function(row) { return row.values; });
    vocabularyFirstImportAssertV1_(after.length === 2000 && after[1558].sheet_row === 1560 && after[1558].values[2] === 'false' &&
      vocabularyFirstImportHashV1_(afterRows.slice(1500)) === spec.chunk_hashes[3] && vocabularyFirstImportHashV1_(afterRows) === allHash,
      'REPAIR_POSTCHECK_FAILED');
    vocabularyFirstImportPhysicalV1_(ss,imports,spec,true);
    result.code = 'REPAIRED';
  } catch (repairError) {
    event.status = 'REPAIR_POSTCHECK_FAILED'; event.error_code = 'REPAIR_POSTCHECK_FAILED';
    event.after_type = after && after[1558] ? typeof after[1558].values[2] : 'UNKNOWN';
    result = {ok:false,code:'REPAIR_POSTCHECK_FAILED',audit_recovered:false};
  }
  // History only: never advance chunks[3], actual_rows, new_count or status here.
  audit.type_repair = event;
  try {
    imports.sheet.getRange(record.row,13,1,1).setValues([['VOCAB_FIRST_IMPORT_V1:' + JSON.stringify(audit)]]);
    result.history_recorded = true;
  } catch (historyError) {
    result = {ok:false,code:'REPAIR_HISTORY_FAILED',history_recorded:false,audit_recovered:false};
  }
  return result;
}
function handleVocabularyFirstImportV1_(d) {
  var lock, spec = vocabularyFirstImportSpecV1_();
  try {
    vocabularyFirstImportAssertV1_(!!getToken_() && d.token === getToken_(), 'UNAUTHORIZED');
    vocabularyFirstImportMetadataV1_(d,spec);
    var operation = String(d.action).replace('VocabularyFirstImportV1','');
    vocabularyFirstImportAssertV1_(['stage','validate','commit','rollback','discard','repair','repairApostrophe'].indexOf(operation) !== -1, 'INVALID_ACTION');
    vocabularyFirstImportAssertV1_(d.dry_run === undefined || typeof d.dry_run === 'boolean', 'INVALID_DRY_RUN');
    var dry = d.dry_run === true;
    lock = LockService.getScriptLock(); vocabularyFirstImportAssertV1_(lock.tryLock(30000), 'LOCK_BUSY');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    vocabularyFirstImportAssertV1_(ss && ss.getId() === spec.spreadsheet_id, 'TARGET_MISMATCH');
    var imports = vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORTS_V2_SHEET,VOCABULARY_IMPORTS_V2_HEADERS,'IMPORT_SCHEMA_MISMATCH');
    var record = vocabularyFirstImportAuditV1_(imports,spec), audit = record && record.audit;
    if (operation === 'rollback') {
      vocabularyFirstImportAssertV1_(audit && audit.status === 'COMPLETED', 'ROLLBACK_BLOCKED');
      var rollbackState;
      try { rollbackState = vocabularyFirstImportPostV1_(ss,imports,spec,audit); }
      catch (rollbackError) { return {ok:false,code:'ROLLBACK_BLOCKED',reason:rollbackError.firstImportCode || 'READ_FAILED'}; }
      var plan = {ok:true,code:'ROLLBACK_PLAN_PASS',dry_run:dry,batch_id:spec.batch_id,range:'VocabularyDB!A2:U3245',row_count:3244};
      if (dry) return plan;
      vocabularyFirstImportAssertV1_(d.approval === 'ROLLBACK_FIRST_IMPORT', 'EXPLICIT_APPROVAL_REQUIRED');
      audit.status = 'ROLLING_BACK'; audit.operation = 'ROLLBACK'; audit.rollback_started_at = new Date().toISOString();
      vocabularyFirstImportSaveAuditV1_(imports,record,audit);
      SpreadsheetApp.flush();
      try {
        // Clear cells owned by this verified batch only; never delete sheet rows or headers.
        rollbackState.db.sheet.getRange(2,1,3244,21).clearContent();
        SpreadsheetApp.flush();
        vocabularyFirstImportPhysicalV1_(ss,imports,spec,true);
        audit.status = 'ROLLED_BACK'; audit.actual_rows = 0; audit.finished_at = new Date().toISOString();
        vocabularyFirstImportSaveAuditV1_(imports,record,audit);
        plan.code = 'ROLLED_BACK'; return plan;
      } catch (rollbackWriteError) {
        audit.status = 'FAILED'; audit.error_code = 'ROLLBACK_INCOMPLETE'; audit.finished_at = new Date().toISOString();
        try { audit.actual_rows = rollbackState.db.sheet.getDataRange().getValues().slice(1).filter(function(row) { return row.some(function(v) { return v !== ''; }); }).length; }
        catch (rollbackReadError) { audit.actual_rows = null; }
        var rollbackRecorded = true;
        try { vocabularyFirstImportSaveAuditV1_(imports,record,audit); } catch (rollbackAuditError) { rollbackRecorded = false; }
        return {ok:false,code:'ROLLBACK_INCOMPLETE',actual_rows:audit.actual_rows,audit_recorded:rollbackRecorded};
      }
    }
    // Completed retries do not depend on retained staging and never append again.
    if (operation === 'commit' && audit && /^(COMPLETED|COMMITTING|FAILED)$/.test(audit.status)) {
      vocabularyFirstImportAssertV1_(d.approval === 'COMMIT_FIRST_IMPORT', 'EXPLICIT_APPROVAL_REQUIRED');
      vocabularyFirstImportAssertV1_(audit.operation !== 'ROLLBACK', 'STATE_MISMATCH', 'ROLLBACK_RECOVERY_REQUIRED');
      var recovered;
      try { recovered = vocabularyFirstImportPostV1_(ss,imports,spec,audit); }
      catch (retryError) { return {ok:false,code:audit.status === 'COMPLETED'?'STATE_MISMATCH':'PARTIAL_IMPORT_DETECTED',reason:retryError.firstImportCode || 'READ_FAILED'}; }
      if (audit.status !== 'COMPLETED' && !dry) {
        audit.status = 'COMPLETED'; audit.actual_rows = 3244; audit.error_code = '';
        audit.post_hash = recovered.post_hash; audit.finished_at = new Date().toISOString();
        vocabularyFirstImportSaveAuditV1_(imports,record,audit);
      }
      return {ok:true,code:'ALREADY_COMMITTED',dry_run:dry,summary:recovered.summary};
    }
    var staging = vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS,'STAGING_SCHEMA_MISMATCH');
    var staged = vocabularyFirstImportStagedV1_(staging,spec);
    if (operation === 'repair') return vocabularyFirstImportRepairV1_(d,ss,imports,record,staging,staged,spec,dry);
    if (operation === 'repairApostrophe') return vocabularyFirstImportApostropheRepairV1_(d,ss,imports,record,staging,staged,spec,dry);
    if (operation === 'stage') {
      vocabularyFirstImportAssertV1_(!audit || /^(STAGING|STAGED|VALIDATED|COMPLETED)$/.test(audit.status), 'BATCH_CLOSED');
      var index = d.chunk_index, count = index === 6 ? 244 : 500;
      vocabularyFirstImportAssertV1_(Number.isInteger(index) && index >= 0 && index < 7, 'INVALID_CHUNK');
      vocabularyFirstImportAssertV1_(d.payload_hash === spec.chunk_hashes[index], 'CHUNK_CONFLICT');
      vocabularyFirstImportAssertV1_(d.row_count === count && Array.isArray(d.rows) && d.rows.length === count &&
        d.rows.every(function(row) { return Array.isArray(row) && row.length === 21; }), 'CHUNK_SIZE_MISMATCH');
      vocabularyFirstImportAssertV1_(vocabularyFirstImportHashV1_(d.rows) === d.payload_hash, 'CHUNK_CONFLICT');
      var present = staged.filter(function(row) { return Math.floor((row.source_row-2)/500) === index; });
      if (present.length) {
        vocabularyFirstImportAssertV1_(present.length === count && vocabularyFirstImportHashV1_(present.map(function(row) { return row.values; })) === d.payload_hash, 'CHUNK_CONFLICT');
      }
      vocabularyFirstImportAssertV1_(!audit || !audit.chunks[index] || (audit.chunks[index] === d.payload_hash && present.length === count), 'CHUNK_CONFLICT');
      vocabularyFirstImportAssertV1_(audit || !staged.length, 'ORPHAN_STAGING');
      if (present.length && audit.chunks[index]) return {ok:true,code:'ALREADY_ACCEPTED',dry_run:dry,row_count:count};
      vocabularyFirstImportAssertV1_(!audit || /^(STAGING|STAGED)$/.test(audit.status), 'BATCH_CLOSED');
      if (dry) return {ok:true,code:present.length?'ALREADY_ACCEPTED':'WOULD_STAGE',dry_run:true,row_count:count};
      if (!audit) {
        audit = {};
        ['batch_id','request_id','manifest_sha256','preimport_sha256','schema_version','expected_total','expected_unique_sense_ids','expected_levels','chunk_count'].forEach(function(k) { audit[k] = spec[k]; });
        audit.created_at = new Date().toISOString(); audit.status = 'STAGING'; audit.actual_rows = 0;
        audit.chunks = Array(7).fill(null); audit.error_code = '';
        record = vocabularyFirstImportSaveAuditV1_(imports,null,audit);
        SpreadsheetApp.flush();
      }
      if (!present.length) {
        var now = new Date();
        var output = d.rows.map(function(row,i) {
          var source = index * 500 + i + 2;
          return [spec.batch_id+':'+source,spec.batch_id,source,row[4],row[2],row[3],row[1],row[0],row[5],row[6],row[7],row[8],row[9],now,row[14],row[15],row[16],row[17],row[18],row[12],row[19],row[20]];
        });
        vocabularyFirstImportStagingWriteV1_(staging.sheet,staging.sheet.getLastRow()+1,output);
        SpreadsheetApp.flush();
      }
      // Re-read before acknowledging: a setter may have only partially persisted.
      staging = vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS,'STAGING_SCHEMA_MISMATCH');
      staged = vocabularyFirstImportStagedV1_(staging,spec);
      present = staged.filter(function(row) { return Math.floor((row.source_row-2)/500) === index; });
      vocabularyFirstImportAssertV1_(present.every(function(row,i) {
        var storedDate = staging.values[row.sheet_row-1][13];
        return (!output || (storedDate instanceof Date && storedDate.getTime() === output[i][13].getTime())) &&
          d.rows[i] && row.values.every(function(value,j) { return typeof value === typeof d.rows[i][j]; });
      }), 'TYPE_COERCION_DETECTED');
      vocabularyFirstImportAssertV1_(present.length === count && vocabularyFirstImportHashV1_(present.map(function(row) { return row.values; })) === d.payload_hash, 'CHUNK_CONFLICT');
      audit.chunks[index] = d.payload_hash; audit.actual_rows = staged.length;
      audit.status = audit.chunks.every(Boolean) ? 'STAGED' : 'STAGING';
      vocabularyFirstImportSaveAuditV1_(imports,record,audit);
      return {ok:true,code:'ACCEPTED',staging_rows:staged.length,chunk_index:index};
    }
    vocabularyFirstImportAssertV1_(audit && /^(STAGING|STAGED|VALIDATED)$/.test(audit.status), 'BATCH_NOT_READY');
    if (operation === 'discard') {
      var ranges = [];
      staged.map(function(row) { return row.sheet_row; }).sort(function(a,b) { return a-b; }).forEach(function(row) {
        var last = ranges[ranges.length-1];
        if (last && last.last + 1 === row) last.last = row; else ranges.push({first:row,last:row});
      });
      if (!dry) {
        vocabularyFirstImportAssertV1_(d.approval === 'DISCARD_FIRST_IMPORT_STAGING', 'EXPLICIT_APPROVAL_REQUIRED');
        ranges.forEach(function(r) { staging.sheet.getRange(r.first,1,r.last-r.first+1,22).clearContent(); });
        SpreadsheetApp.flush();
        var remaining = vocabularyFirstImportStagedV1_(vocabularyFirstImportReadV1_(ss,VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS,'STAGING_SCHEMA_MISMATCH'),spec);
        vocabularyFirstImportAssertV1_(!remaining.length, 'DISCARD_INCOMPLETE');
        audit.status = 'DISCARDED'; audit.actual_rows = 0; audit.finished_at = new Date().toISOString();
        vocabularyFirstImportSaveAuditV1_(imports,record,audit);
      }
      return {ok:true,code:dry?'DISCARD_PLAN_PASS':'DISCARDED',ranges:ranges,row_count:staged.length,dry_run:dry};
    }
    var validated = vocabularyFirstImportCompleteV1_(staged,audit,spec);
    if (operation === 'validate') {
      if (!dry) { audit.status = 'VALIDATED'; vocabularyFirstImportSaveAuditV1_(imports,record,audit); }
      return {ok:true,code:'VALIDATED',summary:validated.summary,dry_run:dry};
    }
    vocabularyFirstImportAssertV1_(audit.status === 'VALIDATED', 'VALIDATION_REQUIRED');
    vocabularyFirstImportAssertV1_(d.approval === 'COMMIT_FIRST_IMPORT', 'EXPLICIT_APPROVAL_REQUIRED');
    // This gate precedes EVERY write, including the COMMITTING audit marker.
    var db = vocabularyFirstImportPhysicalV1_(ss,imports,spec,true);
    if (dry) return {ok:true,code:'COMMIT_ELIGIBLE',dry_run:true,staging_rows:staged.length,chunk_status:'7/7 PASS',manifest_validation:'PASS',precondition:'PASS',would_write_range:'VocabularyDB!A2:U3245',expected_post_state:validated.summary,rollback_candidate:'exact completed batch A2:U3245'};
    audit.status = 'COMMITTING'; audit.started_at = new Date().toISOString(); audit.batch_timestamp = audit.started_at;
    audit.write_range = 'A2:U3245'; audit.target_id = spec.spreadsheet_id; audit.target_gid = spec.sheet_id;
    audit.before_data_rows = db.actual_rows; audit.actual_rows = 0; audit.error_code = '';
    vocabularyFirstImportSaveAuditV1_(imports,record,audit);
    SpreadsheetApp.flush(); // Persist ownership/range evidence before writing VocabularyDB.
    try {
      var timestamp = new Date(audit.batch_timestamp);
      var committedRows = validated.rows.map(function(row) { var copy = row.slice(); copy[10] = timestamp; copy[11] = timestamp; return copy; });
      vocabularyFirstImportDbWriteV1_(db.sheet, committedRows);
      SpreadsheetApp.flush();
      var post = vocabularyFirstImportPostV1_(ss,imports,spec,audit);
      audit.status = 'COMPLETED'; audit.actual_rows = post.summary.total; audit.post_hash = post.post_hash;
      audit.finished_at = new Date().toISOString(); vocabularyFirstImportSaveAuditV1_(imports,record,audit);
      return {ok:true,code:'COMPLETED',batch_id:spec.batch_id,summary:post.summary};
    } catch (writeError) {
      audit.status = 'FAILED'; audit.error_code = 'PARTIAL_IMPORT_DETECTED'; audit.finished_at = new Date().toISOString();
      try { audit.actual_rows = db.sheet.getDataRange().getValues().slice(1).filter(function(row) { return row.some(function(v) { return v !== ''; }); }).length; }
      catch (readError) { audit.actual_rows = null; }
      var recorded = true;
      try { vocabularyFirstImportSaveAuditV1_(imports,record,audit); } catch (auditError) { recorded = false; }
      return {ok:false,code:'PARTIAL_IMPORT_DETECTED',expected_rows:3244,actual_rows:audit.actual_rows,audit_recorded:recorded};
    }
  } catch (error) {
    // Never echo payloads, tokens, row contents, or arbitrary service error messages.
    return {ok:false,code:error.firstImportCode || 'FIRST_IMPORT_OPERATION_FAILED',reason:error.firstImportReason};
  } finally {
    if (lock && lock.hasLock()) {
      // Apps Script buffers Sheet writes. Publish the final audit before another request enters.
      try { SpreadsheetApp.flush(); }
      catch (finalFlushError) { return {ok:false,code:'FIRST_IMPORT_FLUSH_FAILED'}; }
      finally { lock.releaseLock(); }
    }
  }
}
function vocabularyImportBoolV1_(value){var v=String(value==null?'':value).trim().toLowerCase();return value===true||value===1||v==='1'||v==='true'||v==='yes'||v==='y';}
function toImportTextV1_(value){if(value===null||value===undefined)return'';if(value===true)return'true';if(value===false)return'false';return String(value).trim();}
function normalizeVocabularyImportRowV1_(raw,sourceRow){
  var confirmed=toImportTextV1_(raw.confirmed_level||raw.level).toUpperCase(),curriculumActive=vocabularyImportBoolV1_(raw.curriculum_active),archiveOnly=vocabularyImportBoolV1_(raw.archive_only);
  var row={source_row:Number(sourceRow)||0,level:confirmed,word:toImportTextV1_(raw.word),meaning:toImportTextV1_(raw.meaning),vocab_id:toImportTextV1_(raw.vocab_id),sense_id:toImportTextV1_(raw.sense_id),item_type:toImportTextV1_(raw.item_type),sense_order:Number(raw.sense_order),importance_score:Number(raw.importance_score),occurrence_count:Number(raw.occurrence_count),active:vocabularyImportBoolV1_(raw.active),curriculum_active:curriculumActive,curriculum_level:toImportTextV1_(raw.curriculum_level).toUpperCase(),archive_only:archiveOnly,selection_score:Number(raw.selection_score),selection_reason:toImportTextV1_(raw.selection_reason),recommended_level:toImportTextV1_(raw.recommended_level).toUpperCase(),confirmed_level:confirmed,semantic_review_status:toImportTextV1_(raw.semantic_review_status).toUpperCase()};
  var errors=[];if(!/^V[1-5]$/.test(row.confirmed_level))errors.push('INVALID_CONFIRMED_LEVEL');if(!row.word)errors.push('MISSING_WORD');if(!row.meaning)errors.push('MISSING_MEANING');if(!row.vocab_id)errors.push('MISSING_VOCAB_ID');if(!row.sense_id)errors.push('MISSING_SENSE_ID');if(!row.item_type)errors.push('MISSING_ITEM_TYPE');if(!isFinite(row.sense_order)||row.sense_order<1)errors.push('INVALID_SENSE_ORDER');if(!isFinite(row.importance_score)||row.importance_score<0)errors.push('INVALID_IMPORTANCE');if(!isFinite(row.occurrence_count)||row.occurrence_count<0)errors.push('INVALID_OCCURRENCE');if(!isFinite(row.selection_score))errors.push('INVALID_SELECTION_SCORE');if(row.curriculum_active&&row.archive_only)errors.push('CURRICULUM_ARCHIVE_CONFLICT');if(row.curriculum_active&&(!/^V[1-5]$/.test(row.curriculum_level)||row.curriculum_level!==row.confirmed_level))errors.push('CURRICULUM_LEVEL_MISMATCH');row.errors=errors;return row;
}
function vocabularyDbRowObjectV1_(row){var confirmed=String(row[19]||row[4]||'');return{sense_id:String(row[0]),vocab_id:String(row[1]),word:String(row[2]),meaning:String(row[3]),level:confirmed,item_type:String(row[5]),sense_order:Number(row[6])||0,importance_score:Number(row[7])||0,occurrence_count:Number(row[8])||0,active:boolValue_(row[9],true),created_at:row[10],updated_at:row[11],recommended_level:String(row[12]||''),level_review_status:String(row[13]||''),curriculum_active:boolValue_(row[14],false),curriculum_level:String(row[15]||''),archive_only:boolValue_(row[16],false),selection_score:Number(row[17])||0,selection_reason:String(row[18]||''),confirmed_level:confirmed,semantic_review_status:String(row[20]||'')};}
function vocabularyImportRowsV1_(requestId){var rows=getOrCreateSheet_(VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS).getDataRange().getValues(),out=[];for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(requestId))out.push(normalizeVocabularyImportRowV1_({level:rows[i][3],word:rows[i][4],meaning:rows[i][5],vocab_id:rows[i][6],sense_id:rows[i][7],item_type:rows[i][8],sense_order:rows[i][9],importance_score:rows[i][10],occurrence_count:rows[i][11],active:rows[i][12],curriculum_active:rows[i][14],curriculum_level:rows[i][15],archive_only:rows[i][16],selection_score:rows[i][17],selection_reason:rows[i][18],recommended_level:rows[i][19],confirmed_level:rows[i][20],semantic_review_status:rows[i][21]},rows[i][2]));return out;}
function vocabularyImportCountsV1_(requestId){
  var staged=vocabularyImportRowsV1_(requestId),dbRows=getOrCreateSheet_(VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS).getDataRange().getValues(),byId={},seen={},headwords={},counts={total_count:staged.length,new_count:0,changed_count:0,unchanged_count:0,error_count:0,curriculum_count:0,archive_count:0,v1_count:0,v2_count:0,v3_count:0,v4_count:0,v5_count:0,headword_count:0,occurrence_count:0,duplicate_sense_count:0,missing_required_count:0,flag_conflict_count:0,curriculum_level_error_count:0},errors=[];
  for(var d=1;d<dbRows.length;d++)byId[String(dbRows[d][0])]=vocabularyDbRowObjectV1_(dbRows[d]);
  staged.forEach(function(row){if(seen[row.sense_id]){row.errors.push('DUPLICATE_SENSE_ID');counts.duplicate_sense_count++;}seen[row.sense_id]=true;headwords[row.word.toLowerCase()]=true;counts.occurrence_count+=Number(row.occurrence_count)||0;if(row.curriculum_active){counts.curriculum_count++;counts[String(row.confirmed_level).toLowerCase()+'_count']++;}if(row.archive_only)counts.archive_count++;if(row.errors.some(function(x){return x.indexOf('MISSING_')===0;}))counts.missing_required_count++;if(row.errors.indexOf('CURRICULUM_ARCHIVE_CONFLICT')!==-1)counts.flag_conflict_count++;if(row.errors.indexOf('CURRICULUM_LEVEL_MISMATCH')!==-1)counts.curriculum_level_error_count++;if(row.errors.length){counts.error_count++;errors.push({source_row:row.source_row,sense_id:row.sense_id,code:row.errors[0],message:row.errors.join(', ')});return;}var old=byId[row.sense_id];if(!old){counts.new_count++;return;}var changed=['vocab_id','word','meaning','item_type','sense_order','importance_score','occurrence_count','active','curriculum_active','curriculum_level','archive_only','selection_score','selection_reason','recommended_level','confirmed_level','semantic_review_status'].some(function(k){return String(old[k])!==String(row[k]);});if(changed)counts.changed_count++;else counts.unchanged_count++;});counts.headword_count=Object.keys(headwords).length;return{rows:staged,counts:counts,errors:errors,by_id:byId};
}
function handleStageVocabularyImportV1_(d){
  setupVocabularyDbV1_();var requestId=String(d.request_id||''),rows=Array.isArray(d.rows)?d.rows:[];if(!requestId||!rows.length||rows.length>500)return textOut_('bad import chunk');var sh=getOrCreateSheet_(VOCABULARY_IMPORT_STAGING_V2_SHEET,VOCABULARY_IMPORT_STAGING_V2_HEADERS),now=new Date(),out=[];
  rows.forEach(function(raw,index){var sourceRow=Number(raw.source_row)||Number(d.start_row)||index+2,r=normalizeVocabularyImportRowV1_(raw,sourceRow);out.push([requestId+':'+sourceRow,requestId,sourceRow,r.level,r.word,r.meaning,r.vocab_id,r.sense_id,r.item_type,r.sense_order,r.importance_score,r.occurrence_count,r.active,now,r.curriculum_active,r.curriculum_level,r.archive_only,r.selection_score,r.selection_reason,r.recommended_level,r.confirmed_level,r.semantic_review_status]);});appendRowsV2_(sh,out,VOCABULARY_IMPORT_STAGING_V2_HEADERS.length);return textOut_('ok:'+requestId+':'+out.length);
}
function handlePreviewVocabularyImportV1_(d){
  setupVocabularyDbV1_();var requestId=String(d.request_id||''),audit=vocabularyImportCountsV1_(requestId),now=new Date(),teacherId=getOrCreateDefaultTeacher_(),history=getOrCreateSheet_(VOCABULARY_IMPORTS_V2_SHEET,VOCABULARY_IMPORTS_V2_HEADERS),oldIndex=findRowByKey_(history,requestId),created=oldIndex===-1?now:history.getRange(oldIndex,10).getValue()||now;
  var errorSheet=getOrCreateSheet_(VOCABULARY_IMPORT_ERRORS_V2_SHEET,VOCABULARY_IMPORT_ERRORS_V2_HEADERS),errorRows=audit.errors.slice(0,500).map(function(err){return[requestId+':'+err.source_row+':'+err.code,requestId,err.source_row,err.sense_id,err.code,err.message,now];});appendRowsV2_(errorSheet,errorRows,VOCABULARY_IMPORT_ERRORS_V2_HEADERS.length);
  var c=audit.counts,status=c.error_count?'INVALID':'PREVIEWED';upsertRow_(history,requestId,[requestId,teacherId,String(d.source_file||''),status,c.total_count,c.new_count,c.changed_count,c.unchanged_count,c.error_count,created,now,'',c.error_count?'Import validation failed':'Ready to commit',c.curriculum_count,c.archive_count,c.v1_count,c.v2_count,c.v3_count,c.v4_count,c.v5_count,c.headword_count,c.occurrence_count,c.duplicate_sense_count,c.missing_required_count,c.flag_conflict_count,c.curriculum_level_error_count]);return textOut_('ok:'+requestId+':'+status);
}
function handleCommitVocabularyImportV1_(d){
  setupVocabularyDbV1_();var requestId=String(d.request_id||''),audit=vocabularyImportCountsV1_(requestId);if(!requestId||!audit.rows.length||audit.counts.error_count)return textOut_('invalid import');var history=getOrCreateSheet_(VOCABULARY_IMPORTS_V2_SHEET,VOCABULARY_IMPORTS_V2_HEADERS),historyIndex=findRowByKey_(history,requestId);if(historyIndex===-1)return textOut_('preview required');var historyRow=history.getRange(historyIndex,1,1,VOCABULARY_IMPORTS_V2_HEADERS.length).getValues()[0];if(String(historyRow[3])==='COMMITTED')return textOut_('ok:'+requestId+':duplicate');if(String(historyRow[3])!=='PREVIEWED')return textOut_('preview required');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var sh=getOrCreateSheet_(VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS),rows=sh.getDataRange().getValues(),byId={},now=new Date();
    for(var i=1;i<rows.length;i++)byId[String(rows[i][0])]=i;
    audit.rows.forEach(function(r){
      var idx=byId[r.sense_id],old=idx==null?null:rows[idx],confirmed=r.confirmed_level,recommended=r.recommended_level,reviewStatus=recommended&&recommended!==confirmed?'REVIEW_REQUIRED':'',created=old?old[10]:now;
      var newRow=[r.sense_id,r.vocab_id,r.word,r.meaning,confirmed,r.item_type,r.sense_order,r.importance_score,r.occurrence_count,r.active,created,now,recommended,reviewStatus,r.curriculum_active,r.curriculum_level,r.archive_only,r.selection_score,r.selection_reason,confirmed,r.semantic_review_status];
      if(old)rows[idx]=newRow;else{byId[r.sense_id]=rows.length;rows.push(newRow);}
    });
    var normalizedRows=rows.map(function(row){var out=row.slice(0,VOCABULARY_DB_HEADERS.length);while(out.length<VOCABULARY_DB_HEADERS.length)out.push('');return out;});
    sh.getRange(1,1,normalizedRows.length,VOCABULARY_DB_HEADERS.length).setValues(normalizedRows);
    historyRow[3]='COMMITTED';historyRow[11]=now;historyRow[12]='Committed '+audit.rows.length+' senses';
    history.getRange(historyIndex,1,1,VOCABULARY_IMPORTS_V2_HEADERS.length).setValues([historyRow]);SpreadsheetApp.flush();
    return textOut_('ok:'+requestId+':'+audit.rows.length);
  }finally{lock.releaseLock();}
}
function handleGetVocabularyImportStatusV1_(e){if(e.parameter.token!==getToken_())return{error:'no token'};setupVocabularyDbV1_();var requestId=String(e.parameter.request_id||''),sh=getOrCreateSheet_(VOCABULARY_IMPORTS_V2_SHEET,VOCABULARY_IMPORTS_V2_HEADERS),idx=findRowByKey_(sh,requestId);if(idx===-1)return{found:false};var r=sh.getRange(idx,1,1,VOCABULARY_IMPORTS_V2_HEADERS.length).getValues()[0],errors=getOrCreateSheet_(VOCABULARY_IMPORT_ERRORS_V2_SHEET,VOCABULARY_IMPORT_ERRORS_V2_HEADERS).getDataRange().getValues(),sample=[];for(var i=1;i<errors.length&&sample.length<20;i++)if(String(errors[i][1])===requestId)sample.push({source_row:errors[i][2],sense_id:errors[i][3],code:errors[i][4],message:errors[i][5]});return{found:true,request_id:r[0],source_file:r[2],status:r[3],total_count:Number(r[4])||0,new_count:Number(r[5])||0,changed_count:Number(r[6])||0,unchanged_count:Number(r[7])||0,error_count:Number(r[8])||0,message:r[12]||'',curriculum_count:Number(r[13])||0,archive_count:Number(r[14])||0,v1_count:Number(r[15])||0,v2_count:Number(r[16])||0,v3_count:Number(r[17])||0,v4_count:Number(r[18])||0,v5_count:Number(r[19])||0,headword_count:Number(r[20])||0,occurrence_count:Number(r[21])||0,duplicate_sense_count:Number(r[22])||0,missing_required_count:Number(r[23])||0,flag_conflict_count:Number(r[24])||0,curriculum_level_error_count:Number(r[25])||0,errors:sample};}
function handleInspectVocabularyStagingStateV1_(e){
  if(e.parameter.token!==getToken_())return{error:'no token'};
  var ss=SpreadsheetApp.getActiveSpreadsheet(),stagingSh=ss.getSheetByName(VOCABULARY_IMPORT_STAGING_V2_SHEET),importsSh=ss.getSheetByName(VOCABULARY_IMPORTS_V2_SHEET),stagingRows=stagingSh?stagingSh.getDataRange().getValues():[VOCABULARY_IMPORT_STAGING_V2_HEADERS],importRows=importsSh?importsSh.getDataRange().getValues():[VOCABULARY_IMPORTS_V2_HEADERS],imports={},requests={},total=0,expectedParam=Math.max(0,Number(e.parameter.expected_total)||0);
  for(var h=1;h<importRows.length;h++){var historyId=String(importRows[h][0]||'');if(historyId)imports[historyId]={file_name:String(importRows[h][2]||''),status:String(importRows[h][3]||''),total_count:Number(importRows[h][4])||0,created_at:importRows[h][9]||''};}
  for(var i=1;i<stagingRows.length;i++){
    var row=stagingRows[i],requestId=String(row[1]||'');if(!requestId)continue;total++;
    var meta=imports[requestId]||{},group=requests[requestId];if(!group)group=requests[requestId]={request_id:requestId,file_name:meta.file_name||'',created_at:meta.created_at||row[13]||'',staging_status:meta.status||'STAGING',row_count:0,first_sheet_row:i+1,last_sheet_row:i+1,level_counts:{V1:0,V2:0,V3:0,V4:0,V5:0},duplicate_sense_ids:0,duplicate_source_rows:0,curriculum_active_count:0,archive_only_count:0,source_row_min:null,source_row_max:null,_sense_ids:{},_source_rows:{},_expected_total:meta.total_count||expectedParam};
    group.row_count++;group.last_sheet_row=i+1;var level=String(row[3]||'').toUpperCase();if(group.level_counts[level]!==undefined)group.level_counts[level]++;
    var senseId=String(row[7]||'');if(senseId){if(group._sense_ids[senseId])group.duplicate_sense_ids++;group._sense_ids[senseId]=true;}
    var sourceRow=Number(row[2]);if(isFinite(sourceRow)&&sourceRow>0){if(group._source_rows[sourceRow])group.duplicate_source_rows++;group._source_rows[sourceRow]=true;group.source_row_min=group.source_row_min===null?sourceRow:Math.min(group.source_row_min,sourceRow);group.source_row_max=group.source_row_max===null?sourceRow:Math.max(group.source_row_max,sourceRow);}
    if(vocabularyImportBoolV1_(row[14]))group.curriculum_active_count++;if(vocabularyImportBoolV1_(row[16]))group.archive_only_count++;
  }
  var out=Object.keys(requests).map(function(id){var group=requests[id],expected=group._expected_total,sourceCount=Object.keys(group._source_rows).length;group.expected_total=expected||null;group.is_contiguous=group.row_count>0&&group.duplicate_source_rows===0&&sourceCount===group.row_count&&group.source_row_min===2&&group.source_row_max===group.row_count+1;group.is_complete=!!expected&&group.row_count===expected&&group.duplicate_sense_ids===0&&group.is_contiguous;delete group._sense_ids;delete group._source_rows;delete group._expected_total;return group;});
  out.sort(function(a,b){return new Date(b.created_at).getTime()-new Date(a.created_at).getTime();});return{ok:true,total_staging_rows:total,requests:out};
}
// Incremental teacher operations use VocabularyDB only, never import history/staging.
function vocabularyDbCheckV1_(condition, code) {
  if (!condition) { var error = new Error(code); error.vocabularyCode = code; throw error; }
}
function vocabularyDbReadV1_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VOCABULARY_DB_SHEET);
  vocabularyDbCheckV1_(!!sheet, 'SCHEMA_MISMATCH');
  var range = sheet.getDataRange(), rows = range.getValues(), formulas = range.getFormulas();
  vocabularyDbCheckV1_(JSON.stringify(rows[0]) === JSON.stringify(VOCABULARY_DB_HEADERS), 'SCHEMA_MISMATCH');
  var byId = Object.create(null);
  for (var i=1;i<rows.length;i++) {
    if (rows[i].every(function(v) { return v === ''; }) && formulas[i].every(function(v) { return v === ''; })) continue;
    vocabularyDbCheckV1_(rows[i].length === 21 && typeof rows[i][0] === 'string' && rows[i][0] && !byId[rows[i][0]] &&
      formulas[i].every(function(v) { return v === ''; }), 'DB_INTEGRITY_ERROR');
    byId[rows[i][0]] = i;
  }
  return {sheet:sheet,rows:rows,byId:byId};
}
function handleGetVocabularyDbItemV1_(e) {
  if (!e.parameter.token || e.parameter.token !== getToken_()) return {ok:false,code:'UNAUTHORIZED'};
  try {
    var db = vocabularyDbReadV1_(), index = db.byId[String(e.parameter.sense_id || '')];
    if (!index) return {ok:false,code:'NOT_FOUND'};
    return {ok:true,item:vocabularyDbRowObjectV1_(db.rows[index]),fingerprint:vocabularyFirstImportHashV1_(db.rows[index])};
  } catch (err) { return {ok:false,code:err.vocabularyCode || 'READ_FAILED'}; }
}
function vocabularyDbRowCheckV1_(row) {
  var text = [0,1,2,3,4,5,12,13,15,18,19,20];
  vocabularyDbCheckV1_(text.every(function(i) { return typeof row[i] === 'string' && row[i].length <= 10000; }) &&
    [0,1,2,3,5].every(function(i) { return !!row[i].trim(); }) &&
    [0,1].every(function(i) { return /^[A-Za-z0-9_-]{1,128}$/.test(row[i]); }) &&
    /^V[1-5]$/.test(row[19]) && row[4] === row[19] && row[15] === row[19] &&
    (row[12] === '' || /^V[1-5]$/.test(row[12])) &&
    [6,7,8,17].every(function(i) { return typeof row[i] === 'number' && isFinite(row[i]) && row[i] >= 0; }) &&
    Number.isInteger(row[6]) && row[6] >= 1 && Number.isInteger(row[8]) &&
    typeof row[9] === 'boolean' && row[14] === true && row[16] === false &&
    [10,11].every(function(i) { return row[i] instanceof Date && isFinite(row[i].getTime()); }), 'VALIDATION_ERROR');
}
function vocabularyDbWriteItemV1_(sheet, sheetRow, row) {
  var text = [0,1,2,3,4,5,12,13,15,18,19,20];
  sheet.getRange(sheetRow,1,1,21).setValues([row.map(function(value,i) { return text.indexOf(i) === -1 ? value : ''; })]);
  [[0,6],[12,2],[15,1],[18,3]].forEach(function(block) {
    vocabularyFirstImportTextWriteV1_(sheet.getRange(sheetRow,block[0]+1,1,block[1]),[row.slice(block[0],block[0]+block[1])]);
  });
}
function handleVocabularyDbMutationV1_(d) {
  var lock, started = false;
  try {
    vocabularyDbCheckV1_(!!d.token && d.token === getToken_(), 'UNAUTHORIZED');
    var create = d.action === 'createVocabularyDbItemV1';
    vocabularyDbCheckV1_(create || d.action === 'updateVocabularyDbItemV1', 'VALIDATION_ERROR');
    vocabularyDbCheckV1_(Object.keys(d).every(function(k) { return ['action','token','request_id','sense_id','item','changes','expected_current_fingerprint'].indexOf(k) !== -1; }), 'VALIDATION_ERROR');
    var requestId = d.request_id;
    vocabularyDbCheckV1_(typeof requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(requestId) && !/^vocab-first-/.test(requestId), 'VALIDATION_ERROR');
    var fields = create ? d.item : d.changes;
    vocabularyDbCheckV1_(fields && typeof fields === 'object' && !Array.isArray(fields) && Object.keys(fields).length > 0 &&
      (create ? !d.changes && !d.sense_id && !d.expected_current_fingerprint : !d.item && typeof d.sense_id === 'string' && /^[a-f0-9]{64}$/.test(d.expected_current_fingerprint || '')), 'VALIDATION_ERROR');
    var allowed = ['word','meaning','confirmed_level','item_type','sense_order','importance_score','active','selection_score','selection_reason','recommended_level','level_review_status','semantic_review_status'];
    if (create) allowed = allowed.concat(['sense_id','vocab_id','occurrence_count']);
    vocabularyDbCheckV1_(Object.keys(fields).every(function(k) { return allowed.indexOf(k) !== -1; }), 'VALIDATION_ERROR');
    var id = create ? fields.sense_id : d.sense_id;
    vocabularyDbCheckV1_(typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id), 'VALIDATION_ERROR');
    // Sorted field names make equivalent JSON object key order idempotent.
    var payloadHash = vocabularyFirstImportHashV1_([d.action,id,d.expected_current_fingerprint || '',Object.keys(fields).sort().map(function(k) { return [k,fields[k]]; })]);
    lock = LockService.getScriptLock(); vocabularyDbCheckV1_(lock.tryLock(5000), 'LOCK_BUSY');
    var props = PropertiesService.getScriptProperties(), key = 'VOCAB_DB_REQUEST_V1_' + vocabularyFirstImportHashV1_(requestId);
    var previous = props.getProperty(key), pendingKey = 'VOCAB_DB_PENDING_V1';
    if (previous) {
      var receipt = JSON.parse(previous);
      vocabularyDbCheckV1_(receipt.payload_hash === payloadHash, 'REQUEST_CONFLICT');
      vocabularyDbCheckV1_(!props.getProperty(pendingKey) && receipt.status === 'COMPLETED', 'PARTIAL_WRITE_DETECTED');
      return {ok:true,code:create?'ALREADY_CREATED':'ALREADY_UPDATED',sense_id:receipt.sense_id,fingerprint:receipt.fingerprint};
    }
    // Durable fail-closed guard: an uncertain write requires separate diagnosis.
    // Never expire/evict receipts or automatically repair/delete partially written rows.
    vocabularyDbCheckV1_(!props.getProperty(pendingKey), 'PARTIAL_WRITE_DETECTED');
    var db = vocabularyDbReadV1_(), index = db.byId[id], now = new Date(), row;
    if (create) {
      vocabularyDbCheckV1_(!index, 'DUPLICATE_SENSE_ID');
      row = [id,fields.vocab_id,fields.word,fields.meaning,fields.confirmed_level,'WORD',1,0,0,true,now,now,'','',true,fields.confirmed_level,false,0,'',fields.confirmed_level,''];
      index = db.rows.length;
    } else {
      vocabularyDbCheckV1_(!!index, 'NOT_FOUND');
      vocabularyDbCheckV1_(vocabularyFirstImportHashV1_(db.rows[index]) === d.expected_current_fingerprint, 'STALE_UPDATE');
      row = db.rows[index].slice(); row[11] = now;
    }
    Object.keys(fields).forEach(function(k) { row[VOCABULARY_DB_HEADERS.indexOf(k)] = fields[k]; });
    if (Object.prototype.hasOwnProperty.call(fields,'confirmed_level')) row[4] = row[15] = fields.confirmed_level;
    vocabularyDbRowCheckV1_(row);
    vocabularyDbCheckV1_(index+1 <= db.sheet.getMaxRows() && db.sheet.getMaxColumns() >= 21 &&
      !db.sheet.getRange(index+1,1,1,21).getMergedRanges().length, 'CAPACITY_OR_RANGE_ERROR');
    var fingerprint = vocabularyFirstImportHashV1_(row);
    // Reserve before any DB write; failures of PropertiesService also fail closed.
    started = true;
    props.setProperty(pendingKey, JSON.stringify({request_key:key,sense_id:id,row:index+1}));
    props.setProperty(key, JSON.stringify({status:'PENDING',payload_hash:payloadHash,sense_id:id}));
    vocabularyDbWriteItemV1_(db.sheet,index+1,row); SpreadsheetApp.flush();
    var range = db.sheet.getRange(index+1,1,1,21), stored = range.getValues()[0];
    vocabularyDbRowCheckV1_(stored);
    vocabularyDbCheckV1_(range.getFormulas()[0].every(function(v) { return v === ''; }) &&
      vocabularyFirstImportHashV1_(stored) === fingerprint, 'PARTIAL_WRITE_DETECTED');
    props.setProperty(key, JSON.stringify({status:'COMPLETED',payload_hash:payloadHash,sense_id:id,fingerprint:fingerprint}));
    props.deleteProperty(pendingKey);
    return {ok:true,code:create?'CREATED':'UPDATED',sense_id:id,fingerprint:fingerprint};
  } catch (err) {
    return {ok:false,code:started?'PARTIAL_WRITE_DETECTED':(err.vocabularyCode || 'OPERATION_FAILED')};
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function handleListVocabularyDbV1_(e){
  if(e.parameter.token!==getToken_())return{error:'no token'};
  var p=e.parameter;
  function integer(value,fallback,min,max){var n=Number(value);return value==null||value===''||!isFinite(n)?fallback:Math.min(max,Math.max(min,Math.floor(n)));}
  var limit=integer(p.limit,200,1,500),page=integer(p.page,1,1,Number.MAX_SAFE_INTEGER),offset=integer(p.offset!=null?p.offset:p.cursor,(page-1)*limit,0,Number.MAX_SAFE_INTEGER);
  var level=String(p.level||'').toUpperCase(),query=String(p.q||'').trim().toLowerCase(),sort=String(p.sort||'importance'),activeOnly=String(p.active_only||'1')!=='0',scope=String(p.scope||'curriculum'),includeArchive=String(p.include_archive||'0')==='1',uncertainOnly=String(p.uncertain_only||'0')==='1';
  // Listing never creates sheets or repairs headers.
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VOCABULARY_DB_SHEET),rows=sheet?sheet.getDataRange().getValues():[],items=[];
  for(var i=1;i<rows.length;i++){
    if(!rows[i][0])continue;
    var item=vocabularyDbRowObjectV1_(rows[i]);
    if(level&&item.confirmed_level!==level)continue;
    if(activeOnly&&!item.active)continue;
    if(scope==='archive'&&!item.archive_only)continue;
    if(scope==='curriculum'&&!includeArchive&&(!item.curriculum_active||item.archive_only))continue;
    if(uncertainOnly&&item.semantic_review_status!=='UNCERTAIN')continue;
    if(query&&item.word.toLowerCase().indexOf(query)===-1&&item.meaning.toLowerCase().indexOf(query)===-1)continue;
    items.push(item);
  }
  items.sort(function(a,b){
    var order=sort==='alphabetical'?a.word.localeCompare(b.word)||a.sense_order-b.sense_order:
      sort==='occurrence'?b.occurrence_count-a.occurrence_count||b.importance_score-a.importance_score:
      b.selection_score-a.selection_score||b.importance_score-a.importance_score||b.occurrence_count-a.occurrence_count;
    return order||(a.sense_id<b.sense_id?-1:a.sense_id>b.sense_id?1:0);
  });
  var total=items.length,result=items.slice(offset,offset+limit),hasMore=offset+result.length<total;
  return{items:result,total:total,total_count:total,offset:offset,page:Math.floor(offset/limit)+1,limit:limit,total_pages:Math.ceil(total/limit),has_more:hasMore,next_cursor:hasMore?offset+result.length:null};
}
function handleUpdateVocabularySenseV1_(d){setupVocabularyDbV1_();var id=String(d.sense_id||''),sh=getOrCreateSheet_(VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS),idx=findRowByKey_(sh,id);if(idx===-1)return textOut_('not found');var row=sh.getRange(idx,1,1,VOCABULARY_DB_HEADERS.length).getValues()[0];while(row.length<VOCABULARY_DB_HEADERS.length)row.push('');if(d.word!==undefined)row[2]=String(d.word).trim();if(d.meaning!==undefined)row[3]=String(d.meaning).trim();if(d.level!==undefined&&/^V[1-5]$/.test(String(d.level).toUpperCase())){row[4]=String(d.level).toUpperCase();row[19]=row[4];}if(d.active!==undefined)row[9]=vocabularyImportBoolV1_(d.active);if(d.curriculum_active!==undefined){row[14]=vocabularyImportBoolV1_(d.curriculum_active);row[16]=!row[14];if(row[14])row[15]=String(d.curriculum_level||row[19]||row[4]);}row[11]=new Date();sh.getRange(idx,1,1,VOCABULARY_DB_HEADERS.length).setValues([row]);return textOut_('ok:'+id);}
function handleListVocabularySensesV1_(e){if(e.parameter.token!==getToken_())return{error:'no token'};var vocabId=String(e.parameter.vocab_id||''),rows=getOrCreateSheet_(VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS).getDataRange().getValues(),out=[];for(var i=1;i<rows.length;i++)if(String(rows[i][1])===vocabId)out.push(vocabularyDbRowObjectV1_(rows[i]));out.sort(function(a,b){return a.sense_order-b.sense_order;});return{items:out};}
function vocabularySelectionContextV1_(studentId){var learned={},wrong={},attemptRows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),owned={};for(var a=1;a<attemptRows.length;a++)if(String(attemptRows[a][2])===String(studentId)&&String(attemptRows[a][4])==='VOCAB')owned[String(attemptRows[a][0])]=true;var rows=getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues();for(var i=1;i<rows.length;i++)if(owned[String(rows[i][1])]){var id=String(rows[i][2]);if(rows[i][5]===true)learned[id]=true;wrong[id]=Math.max(wrong[id]||0,Number(rows[i][4])||0);}return{learned:learned,wrong:wrong};}
function selectVocabularyItemsV1_(options){var rows=getOrCreateSheet_(VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS).getDataRange().getValues(),items=[],level=String(options.level||'').toUpperCase(),context=vocabularySelectionContextV1_(options.student_id||'');for(var i=1;i<rows.length;i++){var item=vocabularyDbRowObjectV1_(rows[i]);if(!item.active||!item.curriculum_active||item.archive_only||item.confirmed_level!==level||options.exclude_learned&&context.learned[item.sense_id])continue;item.learned=!!context.learned[item.sense_id];item.wrong_count=context.wrong[item.sense_id]||0;items.push(item);}var type=String(options.selection_type||'importance');if(type==='random')for(var j=items.length-1;j>0;j--){var k=Math.floor(Math.random()*(j+1)),tmp=items[j];items[j]=items[k];items[k]=tmp;}else if(type==='unlearned')items.sort(function(a,b){return Number(a.learned)-Number(b.learned)||b.selection_score-a.selection_score;});else if(type==='wrong')items.sort(function(a,b){return b.wrong_count-a.wrong_count||b.selection_score-a.selection_score;});else items.sort(function(a,b){return b.selection_score-a.selection_score||b.importance_score-a.importance_score||b.occurrence_count-a.occurrence_count;});return items.slice(0,Math.min(500,Math.max(1,Number(options.item_count)||50)));}
function handlePreviewVocabularySetV1_(e){if(e.parameter.token!==getToken_())return{error:'no token'};var items=selectVocabularyItemsV1_({level:e.parameter.level,selection_type:e.parameter.selection_type,item_count:e.parameter.item_count,student_id:e.parameter.student_id,exclude_learned:String(e.parameter.exclude_learned)==='1'});return{items:items,total:items.length};}
// Read-only schema preflight: administrative setup is never part of set creation.
function vocabularySetReadV1_(name, headers) {
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  vocabularyDbCheckV1_(!!sheet,'SET_SCHEMA_NOT_READY');
  var range=sheet.getDataRange(),rows=range.getValues(),formulas=range.getFormulas();
  vocabularyDbCheckV1_(JSON.stringify(rows[0])===JSON.stringify(headers),'SET_SCHEMA_NOT_READY');
  vocabularyDbCheckV1_(formulas.every(function(row){return row.every(function(v){return v==='';});}),'SET_DATA_NOT_READY');
  while(rows.length>1&&rows[rows.length-1].every(function(v){return v==='';}))rows.pop();
  return {sheet:sheet,rows:rows,headers:headers};
}
// Include runtime types: JSON alone cannot distinguish a Date from an ISO string.
function vocabularySetStateV1_(rows) {
  return vocabularyFirstImportHashV1_(rows.map(function(row){return row.map(function(v){
    return [v instanceof Date?'date':typeof v,v];
  });}));
}
function vocabularySetVerifyV1_(table, added) {
  var actual=vocabularySetReadV1_(table.sheet.getName(),table.headers);
  vocabularyDbCheckV1_(vocabularySetStateV1_(actual.rows)===vocabularySetStateV1_(table.rows.concat(added)),'PARTIAL_SET_CREATE');
}
function vocabularySetCapacityV1_(table, count) {
  if(!count)return;
  var start=table.rows.length+1;
  vocabularyDbCheckV1_(start+count-1<=table.sheet.getMaxRows()&&table.headers.length<=table.sheet.getMaxColumns(),'SET_CAPACITY_NOT_READY');
  vocabularyDbCheckV1_(!table.sheet.getRange(start,1,count,table.headers.length).getMergedRanges().length,'SET_CAPACITY_NOT_READY');
}
function vocabularySetAppendV1_(table, rows, textBlocks) {
  if(!rows.length)return;
  var start=table.rows.length+1,textCols={};
  textBlocks.forEach(function(block){for(var i=block[0];i<block[0]+block[1];i++)textCols[i]=true;});
  table.sheet.getRange(start,1,rows.length,table.headers.length).setValues(rows.map(function(row){
    return row.map(function(v,i){return textCols[i]?'':v;});
  }));
  textBlocks.forEach(function(block){vocabularyFirstImportTextWriteV1_(
    table.sheet.getRange(start,block[0]+1,rows.length,block[1]),
    rows.map(function(row){return row.slice(block[0],block[0]+block[1]);})
  );});
  SpreadsheetApp.flush();
  vocabularySetVerifyV1_(table,rows);
}
// Explicit, header-only maintenance. Never invoked by normal set creation.
function vocabularySetSchemaSpecV1_(name){
  var items=name===VOCAB_SET_ITEMS_V2_SHEET,sets=name===VOCAB_SETS_V2_SHEET;
  vocabularyDbCheckV1_(items||sets,'SCHEMA_CONFLICT');
  var headers=items?VOCAB_SET_ITEMS_V2_HEADERS:VOCAB_SETS_V2_HEADERS,legacy=items?5:19;
  var added=items?['sense_id','word_snapshot','meaning_snapshot','level_snapshot']:['level','selection_type','item_count','created_by'];
  vocabularyDbCheckV1_(headers.length===legacy+4&&JSON.stringify(headers.slice(legacy))===JSON.stringify(added),'SCHEMA_CONFLICT');
  return {name:name,headers:headers,legacy:legacy,range:items?'F1:I1':'T1:W1'};
}
// Pure planner shared with the offline tool; accepts complete value/formula evidence.
function vocabularySetSchemaPlanV1_(snapshot){
  var spec=vocabularySetSchemaSpecV1_(snapshot&&snapshot.sheet),values=snapshot.values,formulas=snapshot.formulas;
  vocabularyDbCheckV1_(Array.isArray(values)&&values.length>0&&Array.isArray(formulas)&&formulas.length===values.length,'SCHEMA_CONFLICT');
  var width=Array.isArray(values[0])?values[0].length:0;
  vocabularyDbCheckV1_(width>=spec.headers.length&&values.every(function(row,i){
    return Array.isArray(row)&&row.length===width&&Array.isArray(formulas[i])&&formulas[i].length===width&&
      row.every(function(v){return typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&isFinite(v)||v instanceof Date&&isFinite(v.getTime());})&&
      formulas[i].every(function(v){return typeof v==='string';});
  }),'SCHEMA_CONFLICT');
  vocabularyDbCheckV1_(JSON.stringify(values[0].slice(0,spec.legacy))===JSON.stringify(spec.headers.slice(0,spec.legacy)),'SCHEMA_CONFLICT');
  vocabularyDbCheckV1_(formulas[0].every(function(v){return v==='';})&&values.every(function(row,i){
    return row.slice(spec.headers.length).every(function(v){return v==='';})&&formulas[i].slice(spec.headers.length).every(function(v){return v==='';});
  }),'SCHEMA_CONFLICT');
  var current=values[0].slice(spec.legacy,spec.headers.length),already=JSON.stringify(current)===JSON.stringify(spec.headers.slice(spec.legacy));
  vocabularyDbCheckV1_(already||current.every(function(v){return v==='';}),'SCHEMA_CONFLICT');
  vocabularyDbCheckV1_(values.slice(1).every(function(row,i){return row.slice(spec.legacy,spec.headers.length).every(function(v){return v==='';})&&formulas[i+1].slice(spec.legacy,spec.headers.length).every(function(v){return v==='';});}),'SCHEMA_CONFLICT');
  return {sheet:spec.name,status:already?'ALREADY_UPGRADED':'PLAN_ONLY',current_headers:values[0].slice(0,spec.headers.length),
    writes:already?[]:[{sheet:spec.name,range:spec.range,values:[spec.headers.slice(spec.legacy)]}],
    planned_header_cells:already?0:4,data_row_writes:0,
    data_rows:values.slice(1).filter(function(row,i){return row.some(function(v){return v!=='';})||formulas[i+1].some(function(v){return v!=='';});}).length,
    pre_fingerprint:vocabularySetStateV1_(values.concat(formulas))};
}
function vocabularySetSchemaReadV1_(name){
  var spec=vocabularySetSchemaSpecV1_(name),sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  vocabularyDbCheckV1_(!!sheet&&sheet.getMaxColumns()>=spec.headers.length,'SCHEMA_CONFLICT');
  vocabularyDbCheckV1_(!sheet.getRange(1,spec.legacy+1,1,4).getMergedRanges().length,'SCHEMA_CONFLICT');
  var range=sheet.getDataRange(),values=range.getValues(),formulas=range.getFormulas();
  // getDataRange omits unused trailing columns; they are known empty, not new cells.
  [values,formulas].forEach(function(rows){rows.forEach(function(row){while(row.length<spec.headers.length)row.push('');});});
  var snapshot={sheet:name,values:values,formulas:formulas};
  return {sheet:sheet,spec:spec,snapshot:snapshot,plan:vocabularySetSchemaPlanV1_(snapshot)};
}
function handleUpgradeVocabularySetSchemasV1_(d){
  var lock,writeAttempted=false,written=[];
  try{
    vocabularyDbCheckV1_(!!d.token&&d.token===getToken_(),'UNAUTHORIZED');
    vocabularyDbCheckV1_(d.action==='upgradeVocabularySetSchemasV1'&&typeof d.dry_run==='boolean'&&Object.keys(d).every(function(k){return ['action','token','dry_run','approval'].indexOf(k)!==-1;}),'SCHEMA_REQUEST_INVALID');
    vocabularyDbCheckV1_(d.dry_run||d.approval==='UPGRADE_VOCAB_SET_HEADERS_ONLY_V1','SCHEMA_APPROVAL_REQUIRED');
    lock=LockService.getScriptLock();vocabularyDbCheckV1_(lock.tryLock(5000),'LOCK_BUSY');
    var tables=[VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SETS_V2_SHEET].map(vocabularySetSchemaReadV1_);
    var plans=tables.map(function(t){return t.plan;}),cells=plans.reduce(function(n,p){return n+p.planned_header_cells;},0);
    if(d.dry_run||!cells)return{ok:true,status:cells?'DRY_RUN':'ALREADY_UPGRADED',dry_run:d.dry_run,sheets:plans,planned_header_cells:cells,header_cells_written:0,data_row_writes:0};
    // Recheck BOTH snapshots under the lock before the first write.
    tables.forEach(function(t){vocabularyDbCheckV1_(vocabularySetSchemaReadV1_(t.spec.name).plan.pre_fingerprint===t.plan.pre_fingerprint,'SCHEMA_STATE_CHANGED');});
    tables.forEach(function(t){if(t.plan.planned_header_cells){
      writeAttempted=true;
      t.sheet.getRange(1,t.spec.legacy+1,1,4).setValues([t.spec.headers.slice(t.spec.legacy)]);
      written.push(t.spec.name);
    }});
    SpreadsheetApp.flush();
    var verified=tables.map(function(t){
      var actual=vocabularySetSchemaReadV1_(t.spec.name),expected=t.snapshot.values.map(function(row){return row.slice();});
      for(var c=t.spec.legacy;c<t.spec.headers.length;c++)expected[0][c]=t.spec.headers[c];
      vocabularyDbCheckV1_(actual.plan.status==='ALREADY_UPGRADED'&&actual.plan.data_rows===t.plan.data_rows&&
        actual.plan.pre_fingerprint===vocabularySetStateV1_(expected.concat(t.snapshot.formulas)),'SCHEMA_POSTCHECK_FAILED');
      return {sheet:t.spec.name,data_rows:actual.plan.data_rows,post_fingerprint:actual.plan.pre_fingerprint,data_unchanged:true,formulas_unchanged:true};
    });
    return{ok:true,status:'UPGRADED',sheets:plans,verification:verified,planned_header_cells:cells,header_cells_written:cells,data_row_writes:0};
  }catch(err){return{ok:false,error:writeAttempted?'SCHEMA_UPGRADE_INCOMPLETE':err.vocabularyCode||'SCHEMA_UPGRADE_FAILED',write_attempted:writeAttempted,completed_header_sheets:written,automatic_rollback:false};}
  finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function handleCreateVocabularySetV1_(d){
  var lock,started=false;
  try {
    vocabularyDbCheckV1_(!!d.token&&d.token===getToken_(),'UNAUTHORIZED');
    vocabularyDbCheckV1_(typeof d.request_id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(d.request_id),'INVALID_REQUEST_ID');
    vocabularyDbCheckV1_(Object.keys(d).every(function(k){return ['action','token','request_id','sense_ids','title','level','selection_type','session_key','hook'].indexOf(k)!==-1;}),'SET_VALIDATION_ERROR');
    vocabularyDbCheckV1_(Array.isArray(d.sense_ids)&&d.sense_ids.every(function(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id); }),'bad selection');
    var seen=Object.create(null),ids=d.sense_ids.filter(function(id){if(seen[id])return false;seen[id]=true;return true;});
    vocabularyDbCheckV1_(ids.length>0&&ids.length<=500,'bad selection');
    var title=d.title,level=d.level||'',type=d.selection_type||'manual',session=d.session_key||'',hook=d.hook||'';
    vocabularyDbCheckV1_(typeof title==='string'&&!!title.trim()&&title.length<=200,'INVALID_SET_NAME');
    vocabularyDbCheckV1_(typeof level==='string'&&(!level||/^V[1-5]$/.test(level))&&
      ['manual','importance','random','unlearned','wrong'].indexOf(type)!==-1&&
      typeof session==='string'&&(!session||/^[A-Za-z0-9_-]{10,80}$/.test(session))&&
      typeof hook==='string'&&hook.length<=2000&&(!hook||/^https:\/\/[^\s]+$/.test(hook)),'SET_VALIDATION_ERROR');
    title=title.trim();
    var props=PropertiesService.getScriptProperties(),teacherId=props.getProperty('DEFAULT_TEACHER_ID');
    var teachers=vocabularySetReadV1_(TEACHERS_V2_SHEET,TEACHERS_V2_HEADERS);
    vocabularyDbCheckV1_(!!teacherId&&teachers.rows.slice(1).filter(function(row){return row[0]===teacherId&&row[3]===true;}).length===1,'SET_TEACHER_NOT_READY');
    var payloadHash=vocabularyFirstImportHashV1_([teacherId,ids,title,level,type,session,hook]);
    var key='VOCAB_SET_REQUEST_V1_'+vocabularyFirstImportHashV1_(d.request_id),pendingKey='VOCAB_SET_CREATE_PENDING_V1';
    lock=LockService.getScriptLock();vocabularyDbCheckV1_(lock.tryLock(5000),'LOCK_BUSY');
    var previous=props.getProperty(key);
    if(previous){
      var receipt=JSON.parse(previous);
      vocabularyDbCheckV1_(receipt.payload_hash===payloadHash,'REQUEST_CONFLICT');
      vocabularyDbCheckV1_(receipt.state==='COMPLETED'&&!props.getProperty(pendingKey),'PARTIAL_SET_CREATE');
      return textOut_(receipt.result);
    }
    vocabularyDbCheckV1_(!props.getProperty(pendingKey),'PARTIAL_SET_CREATE');
    var db=vocabularySetReadV1_(VOCABULARY_DB_SHEET,VOCABULARY_DB_HEADERS),sets=vocabularySetReadV1_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS),
      snapshots=vocabularySetReadV1_(VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SET_ITEMS_V2_HEADERS),words=vocabularySetReadV1_(WORDS_V2_SHEET,WORDS_V2_HEADERS);
    var byId=Object.create(null),byWord=Object.create(null);
    db.rows.slice(1).forEach(function(row){if(row.every(function(v){return v==='';}))return;
      vocabularyDbCheckV1_(typeof row[0]==='string'&&!!row[0]&&!byId[row[0]],'SET_DATA_NOT_READY');byId[row[0]]=row;
    });
    words.rows.slice(1).forEach(function(row){if(row.every(function(v){return v==='';}))return;
      vocabularyDbCheckV1_(typeof row[0]==='string'&&!!row[0]&&!byWord[row[0]],'WORD_COMPAT_CONFLICT');byWord[row[0]]=row;
    });
    var items=ids.map(function(id){
      var row=byId[id];vocabularyDbCheckV1_(!!row,'VOCAB_SENSE_NOT_FOUND');
      vocabularyDbCheckV1_(row[9]===true&&(type==='manual'||row[14]===true&&row[16]===false),'invalid sense');
      vocabularyDbCheckV1_([0,2,3,19].every(function(i){return typeof row[i]==='string'&&!!row[i].trim()&&row[i].length<=10000;})&&/^V[1-5]$/.test(row[19]),'SET_VALIDATION_ERROR');
      var old=byWord[id];
      // A WordsV2 row can belong to an earlier set. Preserve its link and timestamps.
      vocabularyWordCompatibilityV1_(old,id,row[2],row[3]);
      return {id:id,word:row[2],meaning:row[3],level:row[19],missing:!old};
    });
    level=level||items[0].level;
    var setId=Utilities.getUuid(),sessionKey=session||Utilities.getUuid().replace(/-/g,'').slice(0,20),now=new Date();
    vocabularyDbCheckV1_(!sets.rows.slice(1).some(function(row){return row[0]===setId||row[2]===sessionKey;})&&
      !snapshots.rows.slice(1).some(function(row){return row[1]===setId;}),'SET_ID_CONFLICT');
    var link='../vocab/index.html?session='+encodeURIComponent(sessionKey)+'&server_set=1'+(hook?'&hook='+encodeURIComponent(hook):'');
    var setRows=[[setId,teacherId,sessionKey,title,'VocabularyDB '+level,link,true,now,now,level,'','','',title,'DB',items.length,'',0,'',level,type,items.length,teacherId]];
    var itemRows=items.map(function(item,i){return [Utilities.getUuid(),setId,item.id,i+1,now,item.id,item.word,item.meaning,item.level];});
    var wordRows=items.filter(function(item){return item.missing;}).map(function(item){return [item.id,setId,item.word,item.meaning,true,now,now];});
    vocabularySetCapacityV1_(words,wordRows.length);vocabularySetCapacityV1_(sets,1);vocabularySetCapacityV1_(snapshots,itemRows.length);
    // No automatic rollback/retry. Durable pending guard also blocks a new request ID
    // after an uncertain write, until separately authorized manual diagnosis.
    var pending={state:'PENDING',payload_hash:payloadHash,set_id:setId,session_key:sessionKey,result:''};
    started=true;
    props.setProperty(pendingKey,JSON.stringify({request_key:key,set_id:setId}));
    props.setProperty(key,JSON.stringify(pending));
    vocabularySetAppendV1_(words,wordRows,[[0,4]]);
    vocabularySetAppendV1_(sets,setRows,[[0,6],[9,6],[16,1],[18,3],[22,1]]);
    vocabularySetAppendV1_(snapshots,itemRows,[[0,3],[5,4]]);
    vocabularySetVerifyV1_(words,wordRows);vocabularySetVerifyV1_(sets,setRows);vocabularySetVerifyV1_(snapshots,itemRows);vocabularySetVerifyV1_(db,[]);
    pending.state='COMPLETED';pending.result='ok:'+setId+':'+sessionKey;
    props.setProperty(key,JSON.stringify(pending));props.deleteProperty(pendingKey);
    vocabSetLookupV2Cache_=null;
    return textOut_(pending.result);
  } catch(err) {return textOut_(started?'PARTIAL_SET_CREATE':err.vocabularyCode||'SET_CREATE_FAILED');}
  finally {if(lock&&lock.hasLock())lock.releaseLock();}
}
// Read-only item resolution: historical IDs are never converted or backfilled.
function vocabularySetItemKindV1_(row){
  var values=[row[5],row[6],row[7],row[8]];
  if(values.every(function(v){return v===undefined||v===null||v==='';}))return 'LEGACY';
  vocabularyDbCheckV1_(values.every(function(v){return typeof v==='string'&&v.trim()!=='';})&&/^V[1-5]$/.test(row[8]),'VOCAB_SET_ITEM_SNAPSHOT_INVALID');
  vocabularyDbCheckV1_(typeof row[2]==='string'&&row[2].trim()!=='','VOCAB_SET_ITEM_SNAPSHOT_INVALID');
  return 'SNAPSHOT';
}
function vocabularySetWordMapV1_(rows){
  var byId=Object.create(null);
  for(var i=1;i<rows.length;i++){
    var key=String(rows[i][0]);if(!byId[key])byId[key]=[];byId[key].push(rows[i]);
  }
  return byId;
}
function vocabularySetLegacyMetadataV1_(row,byId){
  vocabularyDbCheckV1_(typeof row[2]==='string'&&row[2].trim()!=='','LEGACY_WORD_METADATA_CONFLICT');
  var matches=byId[row[2]]||[];
  vocabularyDbCheckV1_(matches.length>0,'LEGACY_WORD_METADATA_NOT_FOUND');
  vocabularyDbCheckV1_(matches.length===1&&matches[0][0]===row[2],'LEGACY_WORD_METADATA_CONFLICT');
  var word=matches[0][2],meaning=matches[0][3];
  vocabularyDbCheckV1_(typeof word==='string'&&word.trim()!==''&&typeof meaning==='string'&&meaning.trim()!=='','LEGACY_WORD_METADATA_CONFLICT');
  return {word:word,meaning:meaning};
}
function vocabularySetFetchItemsV1_(sheet,setId){
  var rows=sheet.getDataRange().getValues(),selected=[],needsWords=false,byId=Object.create(null);
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(setId)){
    var kind=vocabularySetItemKindV1_(rows[i]);selected.push({row:rows[i],kind:kind});
    if(kind==='LEGACY')needsWords=true;
  }
  if(needsWords){
    var wordSheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORDS_V2_SHEET);
    vocabularyDbCheckV1_(!!wordSheet,'LEGACY_WORD_METADATA_NOT_FOUND');
    byId=vocabularySetWordMapV1_(wordSheet.getDataRange().getValues());
  }
  var items=selected.map(function(entry){
    var row=entry.row,word=row[6],meaning=row[7];
    if(entry.kind==='LEGACY'){
      var metadata=vocabularySetLegacyMetadataV1_(row,byId);word=metadata.word;meaning=metadata.meaning;
    }
    return {order:Number(row[3])||0,id:row[2],e:word,k:meaning};
  });
  items.sort(function(a,b){return a.order-b.order;});return items;
}
// Independent evidence path: no setup, normal fetch, attempt or mutation handler.
function vocabularySetSchemaDiagnosticV1_(name){
  var spec=vocabularySetSchemaSpecV1_(name),sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if(!sheet)return{report:{sheet_name:name,error:'SCHEMA_NOT_FOUND',upgrade_eligible:false}};
  var range=sheet.getDataRange(),values=range.getValues(),formulas=range.getFormulas();
  var lastRow=sheet.getLastRow(),lastColumn=sheet.getLastColumn();
  [values,formulas].forEach(function(rows){rows.forEach(function(row){while(row.length<spec.headers.length)row.push('');});});
  var header=values[0].slice(0,spec.headers.length),headerFormulas=formulas[0].slice(0,spec.headers.length);
  var extension=header.slice(spec.legacy),expected=spec.headers.slice(spec.legacy);
  var headerState=extension.every(function(v){return v==='';})?'BLANK':JSON.stringify(extension)===JSON.stringify(expected)?'CANONICAL':
    extension.every(function(v,i){return v===''||v===expected[i];})?'PARTIAL':'CONFLICT';
  if(headerFormulas.slice(spec.legacy).some(function(v){return v!=='';}))headerState='CONFLICT';
  var types=[],nonblank={},formulaCounts={existing_data:0,extension_data:0},count=0;
  for(var c=0;c<spec.headers.length;c++){
    types.push({column:String.fromCharCode(65+c),header:spec.headers[c],string:0,number:0,boolean:0,date:0,blank:0,other:0});
    if(c>=spec.legacy)nonblank[String.fromCharCode(65+c)]=0;
  }
  for(var r=1;r<values.length;r++){
    if(values[r].some(function(v){return v!=='';})||formulas[r].some(function(v){return v!=='';}))count++;
    for(var col=0;col<spec.headers.length;col++){
      var v=values[r][col],type=v===''?'blank':v instanceof Date?'date':typeof v;
      types[col][['string','number','boolean','date','blank'].indexOf(type)!==-1?type:'other']++;
      if(col>=spec.legacy&&v!=='')nonblank[String.fromCharCode(65+col)]++;
      if(formulas[r][col]!=='')formulaCounts[col<spec.legacy?'existing_data':'extension_data']++;
    }
  }
  var existingValues=values.slice(1).map(function(row){return row.slice(0,spec.legacy);});
  var existingFormulas=formulas.slice(1).map(function(row){return row.slice(0,spec.legacy);});
  var currentValues=values.map(function(row){return row.slice(0,spec.headers.length);});
  var currentFormulas=formulas.map(function(row){return row.slice(0,spec.headers.length);});
  var snapshot={sheet:name,values:values,formulas:formulas},plan=null,planError='';
  var capacity=sheet.getMaxColumns()>=spec.headers.length;
  var merged=capacity?sheet.getRange(1,spec.legacy+1,1,4).getMergedRanges().length:0;
  try{plan=vocabularySetSchemaPlanV1_(snapshot);}catch(err){planError=err.vocabularyCode||'SCHEMA_CONFLICT';}
  var eligible=!!plan&&capacity&&merged===0,totalNonblank=Object.keys(nonblank).reduce(function(n,k){return n+nonblank[k];},0);
  return {snapshot:snapshot,report:{sheet_name:name,header_values:header,header_formulas:headerFormulas,last_row:lastRow,last_column:lastColumn,data_row_count:count,
    canonical_prefix_match:JSON.stringify(header.slice(0,spec.legacy))===JSON.stringify(spec.headers.slice(0,spec.legacy)),extension_header_state:headerState,
    missing_headers:expected.map(function(h,i){return{column:String.fromCharCode(65+spec.legacy+i),header:h};}).filter(function(x,i){return extension[i]==='';}),
    extension_data:{all_blank:totalNonblank===0&&formulaCounts.extension_data===0,nonblank_count:totalNonblank,nonblank_by_column:nonblank},
    formula_counts:formulaCounts,runtime_type_counts:types,type_count_scope:'data rows 2..last_row, including blank gaps',
    existing_data_values_fingerprint:vocabularySetStateV1_(existingValues),existing_data_formulas_fingerprint:vocabularySetStateV1_(existingFormulas),
    existing_data_state_fingerprint:vocabularySetStateV1_(existingValues.concat(existingFormulas)),
    current_values_fingerprint:vocabularySetStateV1_(currentValues),current_formulas_fingerprint:vocabularySetStateV1_(currentFormulas),
    current_state_fingerprint:vocabularySetStateV1_(currentValues.concat(currentFormulas)),
    planner_pre_fingerprint:vocabularySetStateV1_(values.concat(formulas)),
    upgrade_eligible:eligible,planner_status:plan?plan.status:'SCHEMA_CONFLICT',planner_error:planError||(!eligible?'SCHEMA_CONFLICT':''),
    capacity_ready:capacity,merged_extension_ranges:merged,planned_writes:eligible?plan.writes:[],planned_header_cells:eligible?plan.planned_header_cells:0,planned_data_writes:0}};
}
function vocabularySetLegacyDiagnosticV1_(snapshot){
  var out={legacy_item_count:0,snapshot_item_count:0,invalid_item_count:0,resolved_count:0,metadata_missing_count:0,metadata_conflict_count:0,empty_word_count:0,empty_meaning_count:0,sample_limit:5,samples:[]};
  var legacy=[];
  for(var i=1;i<snapshot.values.length;i++){
    var row=snapshot.values[i];if(row.every(function(v){return v==='';})&&snapshot.formulas[i].every(function(v){return v==='';}))continue;
    try{if(vocabularySetItemKindV1_(row)==='LEGACY')legacy.push(row);else out.snapshot_item_count++;}
    catch(err){if(err.vocabularyCode!=='VOCAB_SET_ITEM_SNAPSHOT_INVALID')throw err;out.invalid_item_count++;}
  }
  out.legacy_item_count=legacy.length;
  if(!legacy.length)return out;
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORDS_V2_SHEET),words=sheet?sheet.getDataRange().getValues():[];
  out.words_sheet_found=!!sheet;out.words_header_match=!!sheet&&JSON.stringify((words[0]||[]).slice(0,WORDS_V2_HEADERS.length))===JSON.stringify(WORDS_V2_HEADERS);
  var byId=vocabularySetWordMapV1_(words);
  legacy.forEach(function(row){
    var matches=byId[String(row[2])]||[];
    if(matches.length===1){
      if(typeof matches[0][2]!=='string'||!matches[0][2].trim())out.empty_word_count++;
      if(typeof matches[0][3]!=='string'||!matches[0][3].trim())out.empty_meaning_count++;
    }
    try{
      vocabularyDbCheckV1_(!sheet||out.words_header_match,'LEGACY_WORD_METADATA_CONFLICT');
      var metadata=vocabularySetLegacyMetadataV1_(row,byId);out.resolved_count++;
      if(out.samples.length<out.sample_limit)out.samples.push({vocab_set_id:String(row[1]).slice(0,128),word_id:row[2].slice(0,128),resolved_word:metadata.word.slice(0,512),resolved_meaning:metadata.meaning.slice(0,512),
        truncated:String(row[1]).length>128||row[2].length>128||metadata.word.length>512||metadata.meaning.length>512});
    }catch(err){if(err.vocabularyCode==='LEGACY_WORD_METADATA_NOT_FOUND')out.metadata_missing_count++;else if(err.vocabularyCode==='LEGACY_WORD_METADATA_CONFLICT')out.metadata_conflict_count++;else throw err;}
  });
  return out;
}
function handleInspectVocabularySetSchemasV1_(e){
  var p=e&&e.parameter||{};
  if(typeof p.token!=='string'||!p.token||p.token!==getToken_())return{ok:false,error:'UNAUTHORIZED'};
  try{
    var tables=[VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SETS_V2_SHEET].map(vocabularySetSchemaDiagnosticV1_),reports=tables.map(function(t){return t.report;});
    var found=reports.every(function(r){return !r.error;}),eligible=reports.every(function(r){return r.upgrade_eligible;});
    return{ok:found,error:found?'':'SCHEMA_NOT_FOUND',sheets:reports,upgrade_eligible:eligible,
      planned_writes:eligible?reports.reduce(function(a,r){return a.concat(r.planned_writes);},[]):[],
      planned_header_cells:eligible?reports.reduce(function(n,r){return n+r.planned_header_cells;},0):0,planned_data_writes:0,
      legacy_resolution:tables[0].snapshot?vocabularySetLegacyDiagnosticV1_(tables[0].snapshot):null};
  }catch(err){return{ok:false,error:err.vocabularyCode||'SCHEMA_DIAGNOSTIC_FAILED'};}
}
// VOCAB-7P: administrative evidence only; never enters launch/fetch/creation paths.
function handleInspectVocabularyAssignmentStartPreflightV1_(e){
  var p=e&&e.parameter||{};
  if(typeof p.token!=='string'||!p.token||p.token!==getToken_())return{ok:false,eligible:false,error:'UNAUTHORIZED'};
  var out={ok:true,status:'NO_GO',eligible:false,reasons:[]};
  function reason(code){if(out.reasons.indexOf(code)===-1)out.reasons.push(code);}
  function read(name,headers,legacyWidth){
    var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    vocabularyDbCheckV1_(!!sheet,'PREFLIGHT_SCHEMA_NOT_READY');
    var range=sheet.getDataRange(),rows=range.getValues(),h=rows[0]||[];
    vocabularyDbCheckV1_((h.length===headers.length||h.length===legacyWidth)&&h.every(function(v,i){return v===headers[i];}),'PREFLIGHT_SCHEMA_NOT_READY');
    vocabularyDbCheckV1_(range.getFormulas().every(function(row){return row.every(function(v){return v==='';});}),'PREFLIGHT_DATA_NOT_READY');
    return rows.slice(1);
  }
  function exact(rows,index,id){return rows.filter(function(row){return row[index]===id;});}
  function one(rows,missing,duplicate){if(!rows.length)reason(missing);else if(rows.length!==1)reason(duplicate);return rows.length===1?rows[0]:null;}
  try{
    ['student_id','assignment_id','set_id'].forEach(function(key){vocabularyDbCheckV1_(typeof p[key]==='string'&&p[key].length>0&&p[key].length<=128&&p[key]===p[key].trim(),'INVALID_PREFLIGHT_INPUT');});
    var student=one(exact(read(STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS),0,p.student_id),'STUDENT_NOT_FOUND','STUDENT_DUPLICATE');
    out.student={student_id:p.student_id,student_found:!!student,student_active:!!student&&boolValue_(student[4],true)};
    if(student&&!out.student.student_active)reason('STUDENT_INACTIVE');
    var assignment=one(exact(read(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS),0,p.assignment_id),'ASSIGNMENT_NOT_FOUND','ASSIGNMENT_DUPLICATE');
    out.assignment={assignment_id:p.assignment_id,assignment_found:!!assignment,type:assignment?assignment[2]:'',set_id:assignment?assignment[3]:'',active:!!assignment&&boolValue_(assignment[8],true)};
    if(assignment){
      if(assignment[2]!=='VOCAB')reason('ASSIGNMENT_TYPE_MISMATCH');
      if(assignment[3]!==p.set_id)reason('SET_REFERENCE_MISMATCH');
      if(!out.assignment.active)reason('ASSIGNMENT_INACTIVE');
    }
    var targets=read(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).filter(function(row){return row[1]===p.assignment_id&&row[2]===p.student_id;});
    var target=one(targets,'TARGET_NOT_FOUND','TARGET_DUPLICATE');
    out.target={target_found:targets.length>0,target_count_for_pair:targets.length,target_status:target?target[3]:null,active:!!target&&boolValue_(target[6],true)};
    if(target){if(target[3]!=='NOT_STARTED')reason('TARGET_ALREADY_STARTED');if(!out.target.active)reason('TARGET_INACTIVE');}
    // Attempts have no assignment_id: join ALL exact pair targets, including duplicates/inactive rows.
    var targetIds=targets.map(function(row){return row[0];});
    var attempts=read(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).filter(function(row){return row[2]===p.student_id&&targetIds.indexOf(row[1])!==-1;});
    out.attempts={attempt_count:attempts.length};if(attempts.length)reason('ATTEMPT_ALREADY_EXISTS');
    var set=one(exact(read(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS,19),0,p.set_id),'VOCAB_SET_NOT_FOUND','VOCAB_SET_DUPLICATE');
    out.vocab_set={set_id:p.set_id,set_found:!!set,title:set?String(set[3]).slice(0,512):'',active:!!set&&boolValue_(set[6],true)};
    if(set&&!out.vocab_set.active)reason('VOCAB_SET_INACTIVE');
    var rows=exact(read(VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SET_ITEMS_V2_HEADERS,5),1,p.set_id),wordMap=null;
    out.vocab_set.item_count=rows.length;out.items=[];out.item_sample_limit=20;out.items_truncated=rows.length>20;out.valid_item_count=0;
    if(!rows.length)reason('VOCAB_SET_EMPTY');
    rows.sort(function(a,b){return (Number(a[3])||0)-(Number(b[3])||0);});
    rows.forEach(function(row){
      try{
        var mode=vocabularySetItemKindV1_(row),metadata;
        if(mode==='LEGACY'){
          if(!wordMap)wordMap=vocabularySetWordMapV1_([WORDS_V2_HEADERS].concat(read(WORDS_V2_SHEET,WORDS_V2_HEADERS)));
          metadata=vocabularySetLegacyMetadataV1_(row,wordMap);
        }else metadata={word:row[6],meaning:row[7]};
        out.valid_item_count++;
        if(out.items.length<out.item_sample_limit){
          var item={sense_id:mode==='SNAPSHOT'?row[5]:'',word_id:row[2],word:metadata.word,meaning:metadata.meaning,level:mode==='SNAPSHOT'?row[8]:'',mode:mode,truncated:false};
          ['sense_id','word_id','word','meaning','level'].forEach(function(key){if(item[key].length>512){item[key]=item[key].slice(0,512);item.truncated=true;}});
          out.items.push(item);
        }
      }catch(err){if(!err.vocabularyCode)throw err;reason('VOCAB_SET_ITEM_INVALID');}
    });
    out.eligible=out.reasons.length===0;out.status=out.eligible?'START_ELIGIBLE':'NO_GO';
    if(!out.eligible){out.ok=false;out.error=out.reasons[0];}
    return out;
  }catch(err){out.ok=false;reason(err.vocabularyCode||'PREFLIGHT_DIAGNOSTIC_FAILED');out.error=out.reasons[0];return out;}
}
function handleFetchVocabularySetV1_(e){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),setSheet=ss.getSheetByName(VOCAB_SETS_V2_SHEET),itemSheet=ss.getSheetByName(VOCAB_SET_ITEMS_V2_SHEET);
  if(!setSheet||!itemSheet||!ss.getSheetByName(ASSIGNMENTS_V2_SHEET)||!ss.getSheetByName(ASSIGNMENT_TARGETS_V2_SHEET))return{found:false,error:'VOCAB_SET_SCHEMA_NOT_READY'};
  var set=findVocabSetByIdOrSessionV2_(e.parameter.key),targetId=String(e.parameter.assignment_target_id||'');
  if(!set||!targetId||!validateAssignmentLaunchV2_(e,'VOCAB',String(set[0])))return{found:false,error:'forbidden'};
  var items;
  try{items=vocabularySetFetchItemsV1_(itemSheet,set[0]);}
  catch(err){if(err.vocabularyCode)return{found:false,error:err.vocabularyCode};throw err;}
  var ctx;
  try{ctx=attemptContextForFetchV2_(e,false,true);}
  catch(err){if(err.vocabularyCode)return{found:false,error:err.vocabularyCode};throw err;}
  return Object.assign({found:items.length>0,payload:{v:1,s:String(set[2]),n:String(set[3]),sn:'',mode:'mixed',sec:4,goal:0,exp:0,dm:'hook',dv:String(e.parameter.hook||''),rng:String(set[13]||set[3]),cnt:items.length+'개',w:items}},ctx);
}
function handleSaveVocabSetV2_(d) {
  setupAssignmentsV2_();var teacherId=getOrCreateDefaultTeacher_(),sessionKey=String(d.session_key||'');
  if(!/^[A-Za-z0-9_-]{10,80}$/.test(sessionKey)||!d.content_link)return textOut_('bad vocab set');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var sh=getOrCreateSheet_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS),rows=sh.getDataRange().getValues(),id='',created=new Date();
    for(var i=1;i<rows.length;i++)if(String(rows[i][1])===teacherId&&String(rows[i][2])===sessionKey){id=String(rows[i][0]);created=rows[i][7]||created;break;}
    id=id||Utilities.getUuid();var now=new Date(),old=findVocabSetV2_(id),items=Array.isArray(d.word_items)?d.word_items:[];
    upsertRow_(sh,id,[id,teacherId,sessionKey,d.title||sessionKey,d.source_ref||'',d.content_link,true,created,now,d.book_source!==undefined?d.book_source:(old?old[9]:''),d.day_set!==undefined?d.day_set:(old?old[10]:''),d.range_start!==undefined?d.range_start:(old?old[11]:''),d.range_end!==undefined?d.range_end:(old?old[12]:''),d.display_range!==undefined?d.display_range:(old?old[13]:''),d.fixed_set===true?'FIXED':(old?old[14]||'RANDOM':'RANDOM'),items.length||((old&&old[15])||''),d.catalog_id!==undefined?d.catalog_id:(old?old[16]:''),d.set_number!==undefined?d.set_number:(old?old[17]:''),d.source_folders_json!==undefined?d.source_folders_json:(old?old[18]:'')]);
    upsertVocabSetItemsV2_(id,items);
    vocabSetLookupV2Cache_=null;
    return textOut_('ok:'+id+':'+items.length);
  }finally{lock.releaseLock();}
}
function handleUpdateAssignmentV2_(d) {
  var hasLinkedPractice=Object.prototype.hasOwnProperty.call(d,'linked_practice_assignment_id'),lock=hasLinkedPractice?LockService.getScriptLock():null;if(lock)lock.waitLock(30000);
  try{
    var teacherId=getOrCreateDefaultTeacher_(),a=assignmentByIdV2_(d.assignment_id);if(!a||String(a[1])!==teacherId)return textOut_('forbidden');
    if(hasLinkedPractice){var current=linkedPracticeAssignmentIdV1_(a[13]),next=linkedPracticeAssignmentIdV1_(d.linked_practice_assignment_id);if(next!==current){if(String(a[2])!=='GRAMMAR'||String(a[11])!=='THEORY')return textOut_('LINKED_PRACTICE_THEORY_ONLY');var state=grammarTheoryLinkEditStateV1_(a);if(state.started)return textOut_('LINKED_PRACTICE_LOCKED_AFTER_START');var linkError=validateLinkedPracticeAssignmentV1_(teacherId,a[2],a[11],next,state.student_ids);if(linkError)return textOut_(linkError);a[13]=next;}}
    a[4]=d.title!==undefined?d.title:a[4];a[7]=d.due_at!==undefined?d.due_at:a[7];a[8]=d.active!==undefined?boolValue_(d.active,true):a[8];a[10]=new Date();upsertRow_(getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS),a[0],a);CacheService.getScriptCache().remove('teacher-student-list-v1');return textOut_('ok');
  }finally{if(lock)lock.releaseLock();}
}
function sentenceStructureAssignmentEditStateV1_(assignmentId) {
  var teacherId=getOrCreateDefaultTeacher_(),a=assignmentByIdV2_(assignmentId);
  if(!a||String(a[1])!==String(teacherId)||String(a[2])!=='SENTENCE_STRUCTURE')return null;
  var targetRows=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),targetIds={},targets=[],started=false;
  for(var i=1;i<targetRows.length;i++)if(String(targetRows[i][1])===String(a[0])&&boolValue_(targetRows[i][6],true)){targetIds[String(targetRows[i][0])]=true;targets.push({assignment_target_id:targetRows[i][0],student_id:targetRows[i][2],status:String(targetRows[i][3]||'NOT_STARTED')});if(String(targetRows[i][3]||'NOT_STARTED')!=='NOT_STARTED'||targetRows[i][4])started=true;}
  var attemptRows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),attemptCount=0;
  for(var j=1;j<attemptRows.length;j++)if(targetIds[String(attemptRows[j][1])])attemptCount++;
  if(attemptCount)started=true;
  var setSheet=getOrCreateSheet_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS),setIndex=findRowByKey_(setSheet,a[3]),passages=[];
  if(setIndex!==-1)passages=parseJsonValue_(setSheet.getRange(setIndex,3).getValue(),[]);
  var hint=sentenceHintLevelFromLinkV2_(a[2],a[5])||'BASIC',support=sentenceReadingSupportFromLinkV2_(a[2],a[5])||'beginner',completed=targets.filter(function(t){return t.status==='COMPLETED';}).length,inProgress=targets.filter(function(t){return t.status==='IN_PROGRESS';}).length;
  return{assignment_id:a[0],content_type:a[2],content_ref_id:a[3],title:a[4],content_link:a[5],due_at:a[7]||'',hint_level:hint,reading_support:support,targets:targets,attempt_count:attemptCount,can_edit_content:!started,sentence_count:passages.length,passages:passages,progress_label:completed===targets.length&&targets.length?'완료':(inProgress||started?'진행 중':'미시작')};
}
function handleGetSentenceStructureAssignmentEditV1_(e){if(e.parameter.token!==getToken_())return{error:'no token'};var state=sentenceStructureAssignmentEditStateV1_(e.parameter.assignment_id);return state||{error:'not found'};}
function handleUpdateSentenceStructureAssignmentV1_(d){
  var state=sentenceStructureAssignmentEditStateV1_(d.assignment_id);if(!state)return textOut_('not found');
  var a=assignmentByIdV2_(d.assignment_id),nextRef=String(d.content_ref_id||a[3]),nextLink=String(d.content_link||a[5]),oldHint=sentenceHintLevelFromLinkV2_(a[2],a[5])||'BASIC',nextHint=sentenceHintLevelFromLinkV2_(a[2],nextLink)||oldHint,oldSupport=sentenceReadingSupportFromLinkV2_(a[2],a[5])||'beginner',nextSupport=sentenceReadingSupportFromLinkV2_(a[2],nextLink)||oldSupport,changesContent=nextRef!==String(a[3])||nextHint!==oldHint||nextSupport!==oldSupport;
  if(changesContent&&!state.can_edit_content)return textOut_('assignment started');
  if(changesContent&&findRowByKey_(getOrCreateSheet_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS),nextRef)===-1)return textOut_('sentence set not found');
  if(d.title!==undefined)a[4]=String(d.title||'문장구조 연습').slice(0,120);if(d.due_at!==undefined)a[7]=d.due_at||'';if(changesContent){a[3]=nextRef;a[5]=nextLink;}a[10]=new Date();
  upsertRow_(getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS),a[0],a);CacheService.getScriptCache().remove('teacher-student-list-v1');return textOut_('ok');
}
function handleDeleteAssignmentV2_(d) {
  var teacherId=getOrCreateDefaultTeacher_(),a=assignmentByIdV2_(d.assignment_id);if(!a||String(a[1])!==teacherId)return textOut_('forbidden');
  var now=new Date();a[8]=false;a[10]=now;upsertRow_(getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS),a[0],a);
  var sh=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),rows=sh.getDataRange().getValues();
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(a[0])&&boolValue_(rows[i][6],true)){if(String(rows[i][3])!=='COMPLETED')rows[i][3]='CANCELLED';rows[i][6]=false;rows[i][8]=now;sh.getRange(i+1,1,1,ASSIGNMENT_TARGETS_V2_HEADERS.length).setValues([rows[i]]);}
  CacheService.getScriptCache().remove('teacher-student-list-v1');return textOut_('ok');
}
function handleCancelAssignmentTargetV2_(d) {
  var teacherId=getOrCreateDefaultTeacher_(),t=targetByIdV2_(d.assignment_target_id),a=t&&assignmentByIdV2_(t[1]);if(!t||!a||String(a[1])!==teacherId)return textOut_('forbidden');if(String(t[3])==='COMPLETED')return textOut_('completed');t[3]='CANCELLED';t[6]=false;t[8]=new Date();upsertRow_(getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),t[0],t);CacheService.getScriptCache().remove('teacher-student-list-v1');return textOut_('ok');
}
function handleUpdateAssignmentStatus_(d) {
  var t=targetByIdV2_(d.assignment_target_id);if(!t||String(t[2])!==String(d.student_id)||!boolValue_(t[6],true))return textOut_('forbidden');
  var status=String(d.status||'');if(['IN_PROGRESS','COMPLETED'].indexOf(status)===-1)return textOut_('bad status');var now=new Date();if(status==='IN_PROGRESS'&&String(t[3])==='NOT_STARTED')t[4]=now;if(status==='COMPLETED'){if(!t[4])t[4]=now;t[5]=now;}t[3]=status;t[8]=now;upsertRow_(getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),t[0],t);CacheService.getScriptCache().remove('teacher-student-list-v1');return textOut_('ok');
}

function attemptByIdV2_(attemptId) {
  var sh=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS),idx=findRowByKey_(sh,attemptId);
  return idx===-1?null:sh.getRange(idx,1,1,ATTEMPTS_V2_HEADERS.length).getValues()[0];
}
function inProgressAttemptForTargetV2_(targetId) {
  var rows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues();
  for(var i=rows.length-1;i>0;i--)if(String(rows[i][1])===String(targetId)&&String(rows[i][9])==='IN_PROGRESS')return rows[i];
  return null;
}
function attemptNoForTargetV2_(targetId) {
  var rows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),max=0;
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(targetId))max=Math.max(max,Number(rows[i][10])||0);
  return max+1;
}
function getOrCreateAttemptV2_(targetId,studentId,requestId,allowRetry,existingSchemaOnly) {
  var rid=String(requestId||''),lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    if(existingSchemaOnly){
      // Fetch may start an attempt, but must never create or repair a schema.
      var ss=SpreadsheetApp.getActiveSpreadsheet();
      [[ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS],[QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS],
       [SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS],[WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS]].forEach(function(pair){
        var sheet=ss.getSheetByName(pair[0]);
        vocabularyDbCheckV1_(!!sheet,'VOCAB_SET_SCHEMA_NOT_READY');
        var headers=sheet.getRange(1,1,1,pair[1].length).getValues()[0];
        vocabularyDbCheckV1_(pair[1].every(function(h,i){return headers[i]===h;}),'VOCAB_SET_SCHEMA_NOT_READY');
      });
    }else setupAttemptsV2_();
    var target=targetByIdV2_(targetId),assignment=target&&assignmentByIdV2_(target[1]);
    if(!target||!assignment||String(target[2])!==String(studentId)||!boolValue_(target[6],true)||!boolValue_(assignment[8],true))return null;
    var sh=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS),rows=sh.getDataRange().getValues();
    var current=null,maxAttemptNo=0;
    for(var i=rows.length-1;i>0;i--){
      if(String(rows[i][1])!==String(targetId))continue;
      maxAttemptNo=Math.max(maxAttemptNo,Number(rows[i][10])||0);
      if(!current&&String(rows[i][9])==='IN_PROGRESS')current=rows[i];
    }
    if(current)return current;
    if(String(target[3])==='COMPLETED'&&!allowRetry)return null;
    if(rid)for(var j=1;j<rows.length;j++)if(String(rows[j][1])===String(targetId)&&String(rows[j][11])===rid)return rows[j];
    var now=new Date(),id=Utilities.getUuid(),row=[id,targetId,studentId,assignment[1],assignment[2],assignment[11]||'',now,'','', 'IN_PROGRESS',maxAttemptNo+1,rid||Utilities.getUuid(),now,now,'',''];
    sh.appendRow(row);
    if(String(target[3])==='NOT_STARTED'){target[3]='IN_PROGRESS';target[4]=target[4]||now;target[8]=now;upsertRow_(getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),target[0],target);}
    SpreadsheetApp.flush();
    var verifiedRows=sh.getDataRange().getValues(),activeMatches=[],requestMatches=[],createdRequestId=String(row[11]);
    for(var k=1;k<verifiedRows.length;k++){
      if(String(verifiedRows[k][1])!==String(targetId))continue;
      if(String(verifiedRows[k][9])==='IN_PROGRESS')activeMatches.push(verifiedRows[k]);
      if(String(verifiedRows[k][11])===createdRequestId)requestMatches.push(verifiedRows[k]);
    }
    if(activeMatches.length!==1||String(activeMatches[0][0])!==String(id)||requestMatches.length!==1||String(requestMatches[0][0])!==String(id))throw new Error('ATTEMPT_ATOMICITY_POST_FLUSH_MISMATCH');
    return row;
  }finally{lock.releaseLock();}
}
function attemptContextForFetchV2_(e,allowRetry,existingSchemaOnly) {
  var targetId=String(e.parameter.assignment_target_id||''),studentId=String(e.parameter.student_id||'');if(!targetId)return {};
  var requestId=allowRetry?'review:'+targetId+':'+String(e.parameter.review_request_id||Utilities.getUuid()):'launch:'+targetId;
  var attempt=getOrCreateAttemptV2_(targetId,studentId,requestId,allowRetry===true,existingSchemaOnly===true);if(!attempt)return {};
  return {attempt_id:attempt[0],attempt_no:attempt[10],attempt_status:attempt[9],attemptCapability:createStudentCapability_('assignmentTarget',targetId,['submitAttemptQuestionV2','verifyVocabResultV2','verifyAttemptCompletionV2','completeGrammarActivityV1'],{student_id:studentId},0)};
}
function handleStartAttemptV2_(d) {
  var target=targetByIdV2_(d.assignment_target_id),assignment=target&&assignmentByIdV2_(target[1]);
  if(!target||!assignment||String(target[2])!==String(d.student_id)||!boolValue_(target[6],true)||!boolValue_(assignment[8],true))return textOut_('forbidden');
  if(String(target[3])==='COMPLETED')return textOut_('ok:completed');
  if(String(target[3])==='NOT_STARTED'){
    var now=new Date();target[3]='IN_PROGRESS';target[4]=target[4]||now;target[8]=now;
    upsertRow_(getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),target[0],target);
    CacheService.getScriptCache().remove('teacher-student-list-v1');
  }
  return textOut_('ok:started');
}
function handleAllowRetryAttemptV2_(d){var target=targetByIdV2_(d.assignment_target_id),assignment=target&&assignmentByIdV2_(target[1]);if(!target||!assignment||String(assignment[1])!==getOrCreateDefaultTeacher_())return textOut_('forbidden');var attempt=getOrCreateAttemptV2_(target[0],target[2],d.request_id||Utilities.getUuid(),true);return textOut_(attempt?'ok:'+attempt[0]:'forbidden');}
function requireAttemptScopeV2_(d) {
  var attempt=attemptByIdV2_(d.attempt_id),target=attempt&&targetByIdV2_(attempt[1]);
  if(!attempt||!target||String(attempt[1])!==String(d.assignment_target_id)||String(attempt[2])!==String(d.student_id)||String(target[2])!==String(d.student_id))return null;
  if(!verifyStudentCapability_(d.attemptCapability,'submitAttemptQuestionV2','assignmentTarget',d.assignment_target_id,{student_id:String(d.student_id||'')}))return null;
  return attempt;
}
function questionRowV2_(questionId){var sh=getOrCreateSheet_(QUESTIONS_V2_SHEET,QUESTIONS_V2_HEADERS),idx=findRowByKey_(sh,questionId);return idx===-1?null:sh.getRange(idx,1,1,QUESTIONS_V2_HEADERS.length).getValues()[0];}
function sameAnswerV2_(a,b){
  if(Array.isArray(a)&&Array.isArray(b)){
    var normalize=function(values){var seen={};return values.filter(function(v){return v!==null&&v!==''&&v!==false;}).map(Number).filter(function(v){return isFinite(v)&&Math.floor(v)===v;}).filter(function(v){if(seen[v])return false;seen[v]=true;return true;}).sort(function(x,y){return x-y;});};
    return JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
  }
  return JSON.stringify(a)===JSON.stringify(b)||String(a)===String(b);
}
function sentenceAnswerV2_(value){
  value=value&&typeof value==='object'?value:{};
  return {subject:Array.isArray(value.subject)?value.subject:[],main_verb:Array.isArray(value.main_verb)?value.main_verb:[]};
}
function buildTokenSnapshotV2_(text){return String(text||'').split(/\s+/).filter(function(token){return token;});}
function tokenIndexesSnapshotV2_(tokens,indexes){return (indexes||[]).filter(function(index){return index!==null&&index!==''&&index!==false;}).map(Number).filter(function(index){return isFinite(index)&&index>=0&&index<tokens.length;}).map(function(index){return{index:index,original_text:tokens[index]};});}
function reviewItemRowV2_(studentId,itemType,itemRefId,subskillKey){
  var sh=getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS),rows=sh.getDataRange().getValues();
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(studentId)&&String(rows[i][3])===String(itemType)&&String(rows[i][4])===String(itemRefId)&&String(rows[i][5]||'')===String(subskillKey||''))return rows[i];
  return null;
}
function recordReviewOutcomeV2_(attempt,itemType,itemRefId,subskillKey,isCorrect,sourceItemId,eventVersion,wrongDelta,validatedLock){
  if(!attempt||!itemRefId||isCorrect==='')return null;
  if(!validatedLock)setupReviewItemsV2_();
  var lock=validatedLock||LockService.getScriptLock();if(!validatedLock)lock.waitLock(10000);
  try{
    var review=reviewItemRowV2_(attempt[2],itemType,itemRefId,subskillKey),delta=Math.max(0,Number(wrongDelta==null?(isCorrect?0:1):wrongDelta)||0);
    if(!review&&isCorrect&&delta===0)return null;
    var eventId=[sourceItemId,eventVersion||1,subskillKey||'GENERAL'].join(':'),events=getOrCreateSheet_(REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS);
    if(findRowByKey_(events,eventId)!==-1)return review;
    var now=new Date(),created=review?review[16]:now;
    if(!review)review=[Utilities.getUuid(),attempt[2],attempt[3],itemType,itemRefId,subskillKey||'',now,now,0,'',0,0,'','', 'NEEDS_REVIEW',true,created,now];
    if(delta>0){if(!review[6])review[6]=now;review[7]=now;review[8]=(Number(review[8])||0)+delta;review[10]=0;review[14]='NEEDS_REVIEW';}
    if(isCorrect===true){review[9]=now;review[10]=(Number(review[10])||0)+1;review[11]=(Number(review[11])||0)+1;review[12]=now;review[14]='REVIEWED';}
    review[15]=true;review[17]=now;upsertRow_(getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS),review[0],review);
    events.appendRow([eventId,review[0],attempt[0],sourceItemId,isCorrect?'CORRECT':'WRONG',delta,now]);
    return review;
  }finally{if(!validatedLock)lock.releaseLock();}
}
function syncQuestionReviewV2_(attempt,item){
  if(!attempt||!item||String(attempt[4])==='SENTENCE_STRUCTURE'||item[5]==='')return;
  recordReviewOutcomeV2_(attempt,'QUESTION',item[2],'',item[5]===true,item[0],item[8],item[5]===false?1:0);
}
function syncSentenceReviewV2_(attempt,item,subjectCorrect,verbCorrect){
  recordReviewOutcomeV2_(attempt,'QUESTION',item[2],'SUBJECT',subjectCorrect===true,item[0],item[8],subjectCorrect===false?1:0);
  recordReviewOutcomeV2_(attempt,'QUESTION',item[2],'MAIN_VERB',verbCorrect===true,item[0],item[8],verbCorrect===false?1:0);
}
function normalizeWordTermV2_(value){return String(value==null?'':value).trim().toLowerCase();}
function normalizeWordMeaningV2_(value){return String(value==null?'':value).trim().replace(/\s+/g,' ');}
function canonicalWordKeyV2_(term,meaning){return JSON.stringify([normalizeWordTermV2_(term),normalizeWordMeaningV2_(meaning)]);}
function stableWordHashV2_(str){var a=0x811c9dc5,b=0x9e3779b9;for(var i=0;i<str.length;i++){var c=str.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b);b^=b>>>13;}function hex_(n){return ('00000000'+(n>>>0).toString(16)).slice(-8);}return hex_(a)+hex_(b);}
function stableWordIdV2_(term,meaning){return 'word_'+stableWordHashV2_(canonicalWordKeyV2_(term,meaning));}
function upsertVocabSetItemsV2_(vocabSetId,items){
  if(!Array.isArray(items)||!items.length)return 0;
  var sh=getOrCreateSheet_(VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SET_ITEMS_V2_HEADERS),rows=sh.getDataRange().getValues(),incoming={},byWord={},now=new Date(),count=0;
  items.forEach(function(raw){var term=raw.term||raw.word||'',meaning=raw.meaning||raw.definition||'',wordId=String(raw.word_id||'').trim()||stableWordIdV2_(term,meaning);if(wordId)incoming[wordId]=true;});
  if(typeof sh.deleteRow==='function'){for(var stale=rows.length-1;stale>0;stale--)if(String(rows[stale][1])===String(vocabSetId)&&!incoming[String(rows[stale][2])])sh.deleteRow(stale+1);rows=sh.getDataRange().getValues();}
  for(var r=1;r<rows.length;r++)if(String(rows[r][1])===String(vocabSetId))byWord[String(rows[r][2])]={row:r+1,id:rows[r][0],created:rows[r][4]};
  items.forEach(function(raw,index){
    var term=raw.term||raw.word||'',meaning=raw.meaning||raw.definition||'',wordId=String(raw.word_id||'').trim()||stableWordIdV2_(term,meaning),old=byWord[wordId],order=Math.max(1,Number(raw.item_order)||index+1);
    upsertWordV2_({word_id:wordId,term:term,meaning:meaning},vocabSetId);
    var itemRow=[old?old.id:Utilities.getUuid(),vocabSetId,wordId,order,old?old.created||now:now,String(raw.sense_id||wordId),String(term),String(meaning),String(raw.level||'')];
    if(old)sh.getRange(old.row,1,1,VOCAB_SET_ITEMS_V2_HEADERS.length).setValues([itemRow]);
    else{sh.appendRow(itemRow);byWord[wordId]={};}
    count++;
  });
  return count;
}
function auditVocabWordIdentityV2(){
  var rows=getOrCreateSheet_(WORDS_V2_SHEET,WORDS_V2_HEADERS).getDataRange().getValues(),byCanonical={},duplicates=[];
  for(var i=1;i<rows.length;i++){var key=canonicalWordKeyV2_(rows[i][2],rows[i][3]);(byCanonical[key]||(byCanonical[key]=[])).push(String(rows[i][0]));}
  Object.keys(byCanonical).forEach(function(key){if(byCanonical[key].length>1)duplicates.push({canonical_key:key,word_ids:byCanonical[key]});});
  return {ok:true,duplicate_canonical_count:duplicates.length,duplicates:duplicates};
}
function upsertWordV2_(raw,vocabSetId){
  var term=raw.term||raw.word||'',meaning=raw.meaning||raw.definition||'',wordId=String(raw.word_id||'').trim()||stableWordIdV2_(term,meaning);
  if(!wordId)return;
  var sh=getOrCreateSheet_(WORDS_V2_SHEET,WORDS_V2_HEADERS),idx=findRowByKey_(sh,wordId),now=new Date(),old=idx===-1?null:sh.getRange(idx,1,1,WORDS_V2_HEADERS.length).getValues()[0];
  upsertRow_(sh,wordId,[wordId,(old&&old[1])||vocabSetId||raw.vocab_set_id||'',term||(old?old[2]:''),meaning||(old?old[3]:''),true,old?old[5]:now,now]);
  return wordId;
}
function upsertQuestionAttemptItemV2_(attempt,raw) {
  var question=questionRowV2_(raw.question_id);if(!question||!validUuid_(raw.question_id))return null;
  var correct=parseJsonValue_(question[6],null),answer=raw.answer,grading=String(question[3])==='FREE_TEXT'?'PENDING':'AUTO_GRADED',isCorrect=grading==='PENDING'?'':sameAnswerV2_(answer,correct);
  var sh=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS),rows=sh.getDataRange().getValues(),old=null;
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(attempt[0])&&String(rows[i][2])===String(raw.question_id)){old=rows[i];break;}
  var now=new Date(),id=old?old[0]:Utilities.getUuid(),count=old?(raw.finalize?(Number(old[8])||1):(Number(old[8])||1)+1):1,firstWrong=old?boolValue_(old[9],false):(isCorrect===false);
  var row=[id,attempt[0],raw.question_id,Number(raw.sequence)||0,JSON.stringify(answer),isCorrect,grading,raw.elapsed_ms==null?'':Math.max(0,Number(raw.elapsed_ms)||0),count,firstWrong,now,old?old[11]:now,now];upsertRow_(sh,id,row);syncQuestionReviewV2_(attempt,row);return row;
}
function handleSubmitAttemptQuestionV2_(d){var attempt=requireAttemptScopeV2_(d);if(!attempt||String(attempt[9])!=='IN_PROGRESS')return textOut_('forbidden');var item=upsertQuestionAttemptItemV2_(attempt,d);return textOut_(item?'ok:'+item[0]:'bad question');}
function grammarQuestionIdsV1_(sentences) {
  var ids=[];
  (sentences||[]).forEach(function(sentence){Object.keys(sentence.tags||{}).forEach(function(tag){(sentence.tags[tag]||[]).forEach(function(hit){if(validUuid_(hit.question_id)&&ids.indexOf(String(hit.question_id))===-1)ids.push(String(hit.question_id));});});});
  return ids;
}
function grammarProgressForFetchV1_(e) {
  var targetId=String(e.parameter.assignment_target_id||''),studentId=String(e.parameter.student_id||'');
  if(!targetId||!studentId)return null;
  var attempts=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),attempt=null;
  for(var i=attempts.length-1;i>0;i--)if(String(attempts[i][1])===targetId&&String(attempts[i][2])===studentId&&String(attempts[i][4])==='GRAMMAR'){if(!attempt)attempt=attempts[i];if(String(attempts[i][9])==='IN_PROGRESS'){attempt=attempts[i];break;}}
  if(!attempt)return null;
  var rows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),items=[];
  for(var q=1;q<rows.length;q++)if(String(rows[q][1])===String(attempt[0]))items.push({question_id:rows[q][2],sequence:Number(rows[q][3])||0,answer:parseJsonValue_(rows[q][4],null),is_correct:rows[q][5],elapsed_ms:Number(rows[q][7])||0,attempt_count:Number(rows[q][8])||0,first_wrong:boolValue_(rows[q][9],false)});
  items.sort(function(a,b){return a.sequence-b.sequence;});
  return {attempt_id:attempt[0],attempt_status:attempt[9],attempt_no:attempt[10],completed:String(attempt[9])==='COMPLETED',score:attempt[14],question_items:items};
}
function linkedPracticeLaunchForTheoryV1_(theoryTarget,theoryAssignment,studentId,completed){
  if(!completed||!theoryTarget||!theoryAssignment||String(theoryAssignment[2])!=='GRAMMAR'||String(theoryAssignment[11])!=='THEORY'||String(theoryTarget[1])!==String(theoryAssignment[0])||String(theoryTarget[2])!==String(studentId)||String(theoryTarget[3])!=='COMPLETED'||!boolValue_(theoryTarget[6],true)||!boolValue_(theoryAssignment[8],true))return null;
  var linkedId=linkedPracticeAssignmentIdV1_(theoryAssignment[13]);if(!linkedId)return null;
  var practice=assignmentByIdV2_(linkedId),subtype=practice?String(practice[11]||''):'';
  if(!practice||String(practice[1])!==String(theoryAssignment[1])||String(practice[2])!=='GRAMMAR'||['BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE'].indexOf(subtype)===-1||!boolValue_(practice[8],true)||!assignmentContentAvailableV2_(practice[2],practice[3],subtype))return{available:false,reason:'PRACTICE_UNAVAILABLE'};
  var rows=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),matches=[];
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===linkedId&&String(rows[i][2])===String(studentId)&&boolValue_(rows[i][6],true)&&String(rows[i][3]||'')!=='CANCELLED')matches.push(rows[i]);
  if(matches.length!==1)return{available:false,reason:'PRACTICE_TARGET_UNAVAILABLE'};
  var target=matches[0],capability=createStudentCapability_('assignmentTarget',String(target[0]),['updateAssignmentStatus','launchAssignment','startAttemptV2'],{student_id:String(studentId)},practice[7]?new Date(practice[7]).getTime()+30*86400000:0);
  return{available:true,content_ref_id:String(practice[3]),content_subtype:subtype,assignment_target_id:String(target[0]),student_id:String(studentId),launch_capability:capability};
}
function handleCompleteGrammarActivityV1_(d) {
  var attempt=requireAttemptScopeV2_(d);
  if(!attempt||String(attempt[4])!=='GRAMMAR'||String(attempt[9])!=='IN_PROGRESS')return textOut_('forbidden');
  var target=targetByIdV2_(attempt[1]),assignment=target&&assignmentByIdV2_(target[1]),subtype=String(attempt[5]||'');
  if(!assignment||String(assignment[3])!==String(d.setKey||''))return textOut_('forbidden');
  if(subtype==='THEORY'){completeAttemptV2_(attempt,'',null);return textOut_('ok:'+attempt[0]);}
  if(['BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE'].indexOf(subtype)===-1)return textOut_('bad subtype');
  var setSheet=getOrCreateSheet_(GRAMMAR_SHEET,GRAMMAR_HEADERS),setRow=findRowByKey_(setSheet,d.setKey);
  if(setRow===-1)return textOut_('set not found');
  var expected=grammarQuestionIdsV1_(parseJsonValue_(setSheet.getRange(setRow,4).getValue(),[]));
  if(!expected.length)return textOut_('no questions');
  var expectedMap={},answered={},correct=0,rows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues();
  expected.forEach(function(id){expectedMap[id]=true;});
  for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(attempt[0])&&expectedMap[String(rows[i][2])]){answered[String(rows[i][2])]=true;if(rows[i][5]===true)correct++;}
  if(Object.keys(answered).length!==expected.length)return textOut_('incomplete:'+Object.keys(answered).length+':'+expected.length);
  completeAttemptV2_(attempt,Math.round(correct/expected.length*100),null);
  return textOut_('ok:'+attempt[0]);
}
function syncVocabRetentionOnCompleteV1_(attempt) {
  if(!attempt||String(attempt[4])!=='VOCAB'||String(attempt[9])!=='COMPLETED')return;
  var subtype=String(attempt[5]||''),target=targetByIdV2_(attempt[1]),assignment=target&&assignmentByIdV2_(target[1]);
  if(!target||!assignment||!boolValue_(target[6],true)||!boolValue_(assignment[8],true))return;
  var sh=getOrCreateSheet_(VOCAB_REVIEW_SCHEDULES_V2_SHEET,VOCAB_REVIEW_SCHEDULES_V2_HEADERS),rows=sh.getDataRange().getValues(),now=new Date();
  if(subtype==='D7'||subtype==='D30'){
    for(var i=1;i<rows.length;i++)if(String(rows[i][1])===String(attempt[3])&&String(rows[i][9])===String(assignment[0])&&String(rows[i][5])===subtype){
      rows[i][7]='COMPLETED';rows[i][10]=attempt[0];rows[i][12]=now;sh.getRange(i+1,1,1,VOCAB_REVIEW_SCHEDULES_V2_HEADERS.length).setValues([rows[i]]);return;
    }
    return;
  }
  if(subtype!=='INITIAL')return;
  var snapshot=homeworkSnapshotForAssignmentV2_(assignment[0],attempt[2]);
  if(!snapshot){console.warn('[ELAB-RETENTION] schedule skipped: initial snapshot missing',attempt[0]);return;}
  var vocabSet=findVocabSetByIdOrSessionV2_(assignment[3]);
  if(!vocabSet||String(vocabSet[0])!==String(snapshot.vocab_set_id||assignment[3])){console.warn('[ELAB-RETENTION] schedule skipped: vocab set mismatch',attempt[0]);return;}
  var existing={};for(var r=1;r<rows.length;r++)existing[String(rows[r][2])+'|'+String(rows[r][4])+'|'+String(rows[r][5])]=true;
  var completedAt=new Date(attempt[7]),types=[['D7',7],['D30',30]],newRows=[];
  types.forEach(function(item){var key=String(attempt[2])+'|'+String(attempt[0])+'|'+item[0];if(existing[key])return;newRows.push([Utilities.getUuid(),attempt[3],attempt[2],vocabSet[0],attempt[0],item[0],new Date(completedAt.getTime()+item[1]*86400000),'PENDING','','','',now,now]);existing[key]=true;});
  appendRowsV2_(sh,newRows,VOCAB_REVIEW_SCHEDULES_V2_HEADERS.length);
}
function completeAttemptV2_(attempt,score,repetitionCount) {
  if(!attempt||String(attempt[9])==='COMPLETED')return attempt;var now=new Date();attempt[7]=now;attempt[8]=Math.max(0,now.getTime()-new Date(attempt[6]).getTime());attempt[9]='COMPLETED';attempt[13]=now;attempt[14]=score==null?'':score;attempt[15]=repetitionCount==null?'':repetitionCount;upsertRow_(getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS),attempt[0],attempt);
  var target=targetByIdV2_(attempt[1]);if(target){target[3]='COMPLETED';target[4]=target[4]||attempt[6];target[5]=now;target[8]=now;upsertRow_(getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),target[0],target);CacheService.getScriptCache().remove('teacher-student-list-v1');}try{syncVocabRetentionOnCompleteV1_(attempt);}catch(retentionError){console.error('[ELAB-RETENTION] completion sync failed',attempt[0],String(retentionError&&retentionError.stack||retentionError));}return attempt;
}
function attemptForLegacySubmissionV2_(d){if(!d.assignment_target_id||!d.student_id||!d.attempt_id||!d.attemptCapability)return null;return requireAttemptScopeV2_(d);}
function attemptPublicV2_(r){return {attempt_id:r[0],assignment_target_id:r[1],student_id:r[2],teacher_id:r[3],content_type:r[4],content_subtype:r[5],started_at:r[6],completed_at:r[7],duration_ms:r[8],status:r[9],attempt_no:r[10],request_id:r[11],score:r[14],repetition_count:r[15]};}
function handleListAttemptsV2_(e){if(e.parameter.token!==getToken_())return {error:'no token'};var teacherId=getOrCreateDefaultTeacher_(),rows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),out=[];for(var i=1;i<rows.length;i++)if(String(rows[i][3])===teacherId&&(!e.parameter.student_id||String(rows[i][2])===String(e.parameter.student_id)))out.push(attemptPublicV2_(rows[i]));return {attempts:out};}
function handleListStudentAttemptHistoryV2_(e){
  if(e.parameter.token!==getToken_())return{error:'no token'};
  var teacherId=getOrCreateDefaultTeacher_(),studentId=String(e.parameter.student_id||''),student=studentV2ById_(studentId);
  if(!student||String(student[1])!==String(teacherId))return{error:'forbidden'};
  var limit=Math.min(20,Math.max(1,Number(e.parameter.limit)||10)),cursor=Math.max(0,Number(e.parameter.cursor)||0),typeFilter=String(e.parameter.content_type||'').toUpperCase();
  var attemptsRows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),assignmentRows=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),targetRows=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),batchRows=getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS).getDataRange().getValues(),linkRows=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),questionRows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),wordRows=getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues();
  var assignments={},targets={},targetByAssignment={},batches={},datesByAssignment={},questionSummary={},wordSummary={};
  for(var a=1;a<assignmentRows.length;a++)if(String(assignmentRows[a][1])===String(teacherId))assignments[String(assignmentRows[a][0])]=assignmentRows[a];
  for(var t=1;t<targetRows.length;t++)if(String(targetRows[t][2])===studentId){targets[String(targetRows[t][0])]=targetRows[t];targetByAssignment[String(targetRows[t][1])]=targetRows[t];}
  for(var b=1;b<batchRows.length;b++)if(String(batchRows[b][1])===String(teacherId)&&String(batchRows[b][2])===studentId)batches[String(batchRows[b][0])]=batchRows[b];
  for(var l=1;l<linkRows.length;l++)if(String(linkRows[l][3])===studentId&&batches[String(linkRows[l][1])]){
    var assignmentId=String(linkRows[l][2]),batch=batches[String(linkRows[l][1])],day=lessonDateV2_(batch[3]||batch[4]);
    (datesByAssignment[assignmentId]||(datesByAssignment[assignmentId]=[])).push({lesson_date:day,homework_batch_id:String(batch[0])});
  }
  for(var q=1;q<questionRows.length;q++){
    var qs=questionSummary[String(questionRows[q][1])]||(questionSummary[String(questionRows[q][1])]={total:0,correct:0,graded:0});
    qs.total++;if(questionRows[q][5]===true||questionRows[q][5]===false){qs.graded++;if(questionRows[q][5]===true)qs.correct++;}
  }
  for(var w=1;w<wordRows.length;w++){
    var ws=wordSummary[String(wordRows[w][1])]||(wordSummary[String(wordRows[w][1])]={total:0,correct:0});
    ws.total++;if(boolValue_(wordRows[w][3],false))ws.correct++;
  }
  var groupsByDate={},unlinked=[];
  Object.keys(datesByAssignment).forEach(function(assignmentId){
    var assignment=assignments[assignmentId],target=targetByAssignment[assignmentId];if(!assignment||typeFilter&&String(assignment[2]).toUpperCase()!==typeFilter)return;
    datesByAssignment[assignmentId].forEach(function(link){var group=groupsByDate[link.lesson_date]||(groupsByDate[link.lesson_date]={lesson_date:link.lesson_date,homework_batch_ids:[],assignment_ids:{},completed_ids:{},assignment_rows:{},tracks:[],attempts:[]});if(group.homework_batch_ids.indexOf(link.homework_batch_id)===-1)group.homework_batch_ids.push(link.homework_batch_id);group.assignment_ids[assignmentId]=true;group.assignment_rows[assignmentId]=group.assignment_rows[assignmentId]||{assignment_id:assignmentId,assignment_target_id:target?String(target[0]):'',content_type:String(assignment[2]||''),content_subtype:String(assignment[11]||''),title:String(assignment[4]||''),target_status:target?String(target[3]||'NOT_STARTED'):'NOT_STARTED',target_active:target?boolValue_(target[6],true):false,attempts:[]};if(target&&String(target[3])==='COMPLETED')group.completed_ids[assignmentId]=true;if(group.tracks.indexOf(String(assignment[2]))===-1)group.tracks.push(String(assignment[2]));});
  });
  for(var i=1;i<attemptsRows.length;i++){
    var row=attemptsRows[i];if(String(row[2])!==studentId||String(row[3])!==String(teacherId)||typeFilter&&String(row[4]).toUpperCase()!==typeFilter)continue;
    var target=targets[String(row[1])],assignment=target&&assignments[String(target[1])],links=assignment?datesByAssignment[String(assignment[0])]||[]:[],summary=String(row[4])==='VOCAB'?wordSummary[String(row[0])]:questionSummary[String(row[0])],total=summary&&summary.total||null,correct=summary&&(String(row[4])==='VOCAB'||summary.graded===summary.total)?summary.correct:null;
    var item={attempt_id:String(row[0]),assignment_id:assignment?String(assignment[0]):'',assignment_target_id:String(row[1]||''),content_type:String(row[4]||''),content_subtype:String(row[5]||''),title:assignment?String(assignment[4]||''):'',started_at:row[6]||'',completed_at:row[7]||'',duration_ms:Number(row[8])||0,status:String(row[9]||''),score:row[14],repetition_count:Number(row[15])||0,total_count:total,correct_count:correct,accuracy:total&&correct!=null?Math.round(correct/total*100):null};
    if(!links.length){unlinked.push(item);continue;}
    var chosen=links[0],group=groupsByDate[chosen.lesson_date]||(groupsByDate[chosen.lesson_date]={lesson_date:chosen.lesson_date,homework_batch_ids:[],assignment_ids:{},completed_ids:{},assignment_rows:{},tracks:[],attempts:[]});
    links.forEach(function(link){if(link.lesson_date===chosen.lesson_date&&group.homework_batch_ids.indexOf(link.homework_batch_id)===-1)group.homework_batch_ids.push(link.homework_batch_id);});
    if(assignment){var groupedAssignment=group.assignment_rows[String(assignment[0])];group.assignment_ids[String(assignment[0])]=true;if(groupedAssignment)groupedAssignment.attempts.push(item);if(target&&String(target[3])==='COMPLETED')group.completed_ids[String(assignment[0])]=true;}
    if(group.tracks.indexOf(item.content_type)===-1)group.tracks.push(item.content_type);group.attempts.push(item);
  }
  var groups=Object.keys(groupsByDate).map(function(day){var group=groupsByDate[day];group.total_assignments=Object.keys(group.assignment_ids).length;group.completed_assignments=Object.keys(group.completed_ids).length;group.attempts.sort(function(x,y){return new Date(y.completed_at||y.started_at)-new Date(x.completed_at||x.started_at);});group.assignments=Object.keys(group.assignment_rows).map(function(id){var assigned=group.assignment_rows[id];assigned.attempts.sort(function(x,y){return new Date(y.completed_at||y.started_at)-new Date(x.completed_at||x.started_at);});return assigned;});delete group.assignment_ids;delete group.completed_ids;delete group.assignment_rows;return group;});
  groups.sort(function(x,y){return String(y.lesson_date).localeCompare(String(x.lesson_date));});unlinked.sort(function(x,y){return new Date(y.completed_at||y.started_at)-new Date(x.completed_at||x.started_at);});
  var units=groups.map(function(group){return{kind:'group',sort_key:group.lesson_date,value:group};}).concat(unlinked.map(function(item){return{kind:'unlinked',sort_key:String(item.completed_at||item.started_at||''),value:item};}));
  units.sort(function(x,y){return String(y.sort_key).localeCompare(String(x.sort_key));});var page=units.slice(cursor,cursor+limit),pageGroups=[],pageUnlinked=[];page.forEach(function(unit){(unit.kind==='group'?pageGroups:pageUnlinked).push(unit.value);});
  return{ok:true,student:{student_id:studentId,name:student[2]||'',grade:student[3]||''},groups:pageGroups,unlinked_attempts:pageUnlinked,next_cursor:cursor+limit<units.length?String(cursor+limit):null};
}
function handleVerifyVocabResultV2_(e){
  var p=e.parameter,traceId=String(p.trace_id||''),attemptId=String(p.attempt_id||''),targetId=String(p.assignment_target_id||''),studentId=String(p.student_id||''),expected=Math.max(0,Number(p.expected_word_count)||0),response;
  try{
    if(!attemptId||!targetId||!studentId)throw new Error('missing context');
    if(!verifyStudentCapability_(p.attemptCapability,'verifyVocabResultV2','assignmentTarget',targetId,{student_id:studentId}))throw new Error('forbidden');
    var attempt=vocabSubmitExactV2_(vocabSubmitReadV2_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS),attemptId),
      target=vocabSubmitExactV2_(vocabSubmitReadV2_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),targetId);
    if(attempt[1]!==targetId||attempt[2]!==studentId||target[2]!==studentId)throw new Error('forbidden');
    var rows=vocabSubmitReadV2_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).rows.slice(1).filter(function(row){return row[1]===attemptId;}),wordCount=rows.length,seen=Object.create(null),
      valid=rows.every(function(row){if(!row[2]||seen[row[2]]||row[5]!==true)return false;seen[row[2]]=true;return true;}),
      completed=attempt[9]==='COMPLETED'&&target[3]==='COMPLETED',itemsComplete=wordCount>0&&valid&&(!expected||wordCount===expected),
      partial=attempt[9]==='SUBMITTING'||attempt[9]==='COMPLETED'&&!completed;
    response={trace_id:traceId,found:true,found_attempt:true,complete:completed&&itemsComplete,attempt_complete:completed,attempt_status:attempt[9],target_status:target[3],items_complete:itemsComplete,attempt_id:attemptId,status:attempt[9],score:attempt[14],repetition_count:attempt[15],word_item_count:wordCount,expected_word_item_count:expected,expected_word_count:expected,error:partial?'PARTIAL_VOCAB_SUBMIT:READ_ONLY_DIAGNOSIS_REQUIRED':''};
  }catch(error){response={trace_id:traceId,found:false,found_attempt:false,complete:false,error:String(error&&error.message||error)};}
  resultTraceLog_(traceId,'VERIFY RESPONSE',response);return response;
}

function handleVerifyAttemptCompletionV2_(e){
  var attemptId=String(e.parameter.attempt_id||''),targetId=String(e.parameter.assignment_target_id||''),studentId=String(e.parameter.student_id||'');
  if(!attemptId||!targetId||!studentId)return{ok:false,attempt_found:false,target_found:false,complete:false,reason:'MISSING_CONTEXT'};
  if(!verifyStudentCapability_(e.parameter.attemptCapability,'verifyAttemptCompletionV2','assignmentTarget',targetId,{student_id:studentId}))return{ok:false,attempt_found:false,target_found:false,complete:false,reason:'FORBIDDEN'};
  var attempt=attemptByIdV2_(attemptId),target=targetByIdV2_(targetId),attemptMatches=!!attempt&&String(attempt[1])===targetId&&String(attempt[2])===studentId,targetMatches=!!target&&String(target[2])===studentId;
  if(!attemptMatches||!targetMatches)return{ok:true,attempt_found:attemptMatches,target_found:targetMatches,complete:false,reason:!attemptMatches?'ATTEMPT_NOT_FOUND':'TARGET_NOT_FOUND'};
  var attemptComplete=String(attempt[9])==='COMPLETED',targetComplete=String(target[3])==='COMPLETED',itemCount=0;
  if(String(attempt[4])==='VOCAB'){var words=getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues();for(var w=1;w<words.length;w++)if(String(words[w][1])===attemptId)itemCount++;}
  else{var questions=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues();for(var q=1;q<questions.length;q++)if(String(questions[q][1])===attemptId)itemCount++;}
  var complete=attemptComplete&&targetComplete,response={ok:true,attempt_found:true,target_found:true,attempt_status:String(attempt[9]),target_status:String(target[3]),content_type:String(attempt[4]),content_subtype:String(attempt[5]||''),item_count:itemCount,complete:complete,reason:complete?'':(!attemptComplete&&targetComplete?'ATTEMPT_INCOMPLETE':attemptComplete&&!targetComplete?'TARGET_INCOMPLETE':'INCOMPLETE_ITEMS')};
  if(complete&&String(attempt[4])==='GRAMMAR'&&String(attempt[5])==='THEORY'){var assignment=assignmentByIdV2_(target[1]);response.linked_practice_launch=linkedPracticeLaunchForTheoryV1_(target,assignment,studentId,true);}
  return response;
}

function verifyDataIntegrityV2(){
  var attempts=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),targets=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),assignments=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),questionItems=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),reviewItems=getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getDataRange().getValues(),reviewEvents=getOrCreateSheet_(REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS).getDataRange().getValues();
  var attemptIds={},targetIds={},assignmentIds={},reviewIds={},targetPairs={},out={orphan_attempts:[],orphan_question_items:[],completed_target_in_progress_attempt:[],completed_attempt_incomplete_target:[],orphan_review_events:[],duplicate_assignment_targets:[]};
  for(var a=1;a<assignments.length;a++)assignmentIds[String(assignments[a][0])]=true;
  for(var t=1;t<targets.length;t++){var tid=String(targets[t][0]),pair=String(targets[t][1])+'|'+String(targets[t][2]);targetIds[tid]=targets[t];if(targetPairs[pair])out.duplicate_assignment_targets.push(pair);else targetPairs[pair]=true;}
  for(var i=1;i<attempts.length;i++){var attemptId=String(attempts[i][0]),target=targetIds[String(attempts[i][1])];attemptIds[attemptId]=true;if(!target||!assignmentIds[String(target[1])])out.orphan_attempts.push(attemptId);else{if(String(target[3])==='COMPLETED'&&String(attempts[i][9])==='IN_PROGRESS')out.completed_target_in_progress_attempt.push(attemptId);if(String(attempts[i][9])==='COMPLETED'&&String(target[3])!=='COMPLETED')out.completed_attempt_incomplete_target.push(attemptId);}}
  for(var q=1;q<questionItems.length;q++)if(!attemptIds[String(questionItems[q][1])])out.orphan_question_items.push(String(questionItems[q][0]));
  for(var r=1;r<reviewItems.length;r++)reviewIds[String(reviewItems[r][0])]=true;
  for(var e=1;e<reviewEvents.length;e++)if(!reviewIds[String(reviewEvents[e][1])])out.orphan_review_events.push(String(reviewEvents[e][0]));
  out.ok=!out.orphan_attempts.length&&!out.orphan_question_items.length&&!out.completed_target_in_progress_attempt.length&&!out.completed_attempt_incomplete_target.length&&!out.orphan_review_events.length&&!out.duplicate_assignment_targets.length;console.log(JSON.stringify(out));return out;
}
function reviewQuestionMetaV2_(questionId){
  var q=questionRowV2_(questionId);if(!q)return {display:'삭제되었거나 사용할 수 없는 문제',content_type:'QUESTION',categories:[]};
  var prompt=parseJsonValue_(q[4],{}),display=prompt.promptKo||prompt.text||prompt.phrase||('문항 '+(q[9]||'')),source=null;
  if(q[8]){var ss=getOrCreateSheet_(SOURCES_V2_SHEET,SOURCES_V2_HEADERS),si=findRowByKey_(ss,q[8]);if(si!==-1){var s=ss.getRange(si,1,1,SOURCES_V2_HEADERS.length).getValues()[0];source={exam_type:s[1],year:s[2],grade:s[3],month:s[4],exam_name:s[5],question_no:q[9]};}}
  var links=getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues(),cats=getOrCreateSheet_(CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS).getDataRange().getValues(),byId={},out=[];
  for(var c=1;c<cats.length;c++)byId[String(cats[c][0])]={key:cats[c][2],label:cats[c][3],domain:cats[c][1]};
  for(var i=1;i<links.length;i++)if(String(links[i][0])===String(questionId)&&byId[String(links[i][1])])out.push(byId[String(links[i][1])]);
  return {display:String(display).slice(0,500),content_type:q[2],source:source,categories:out};
}
function reviewWordMetaV2_(wordId){var sh=getOrCreateSheet_(WORDS_V2_SHEET,WORDS_V2_HEADERS),idx=findRowByKey_(sh,wordId);if(idx===-1)return {display:'단어 정보 없음',meaning:'',content_type:'VOCAB',categories:[]};var w=sh.getRange(idx,1,1,WORDS_V2_HEADERS.length).getValues()[0];return {display:w[2]||'단어 정보 없음',meaning:w[3]||'',content_type:'VOCAB',categories:[]};}
function sentenceReviewErrorTypeV1_(subskill){return String(subskill)==='SUBJECT'?'SUBJECT_SPAN':String(subskill)==='MAIN_VERB'?'VERB_SPAN':'';}
function publicReviewItemV2_(row,includeIdentity){var meta=String(row[3])==='WORD'?reviewWordMetaV2_(row[4]):reviewQuestionMetaV2_(row[4]),out={item_type:row[3],subskill_key:row[5]||'',error_type:sentenceReviewErrorTypeV1_(row[5]),display:meta.display,meaning:meta.meaning||'',content_type:meta.content_type,categories:meta.categories||[],source:meta.source||null,first_wrong_at:row[6],last_wrong_at:row[7],wrong_count:Number(row[8])||0,last_correct_at:row[9],consecutive_correct:Number(row[10])||0,review_count:Number(row[11])||0,last_review_at:row[12],next_review_at:row[13],status:row[14],repeated:(Number(row[8])||0)>=2};if(includeIdentity){out.review_item_id=row[0];out.item_ref_id=row[4];}return out;}
function reviewAttemptDetailV2_(reviewRow){if(String(reviewRow[3])!=='QUESTION')return null;var events=getOrCreateSheet_(REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS).getDataRange().getValues(),sourceId='';for(var e=events.length-1;e>0;e--)if(String(events[e][1])===String(reviewRow[0])&&events[e][3]){sourceId=String(events[e][3]);break;}if(!sourceId)return null;var items=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS),idx=findRowByKey_(items,sourceId);if(idx===-1)return null;var it=items.getRange(idx,1,1,QUESTION_ATTEMPT_ITEMS_V2_HEADERS.length).getValues()[0],q=questionRowV2_(it[2]),out={student_answer:parseJsonValue_(it[4],null),correct_answer:q?parseJsonValue_(q[6],null):null,elapsed_ms:Number(it[7])>0?Number(it[7]):null};var details=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS),di=findRowByKey_(details,it[0]);if(di!==-1){var d=details.getRange(di,1,1,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS.length).getValues()[0];out.sentence_structure={student_subject:parseJsonValue_(d[1],[]),correct_subject:parseJsonValue_(d[3],[]),subject_correct:d[5],student_main_verb:parseJsonValue_(d[2],[]),correct_main_verb:parseJsonValue_(d[4],[]),main_verb_correct:d[6],student_subject_tokens:parseJsonValue_(d[10],[]),student_main_verb_tokens:parseJsonValue_(d[11],[]),correct_subject_tokens:parseJsonValue_(d[12],[]),correct_main_verb_tokens:parseJsonValue_(d[13],[]),metadata:parseJsonValue_(d[14],[])};}return out;}
function reviewRetryContextV2_(reviewRow){
  if(String(reviewRow[3])!=='QUESTION'||['SUBJECT','MAIN_VERB'].indexOf(String(reviewRow[5]))===-1)return null;
  var events=getOrCreateSheet_(REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS).getDataRange().getValues(),sourceId='';for(var e=events.length-1;e>0;e--)if(String(events[e][1])===String(reviewRow[0])&&events[e][3]){sourceId=String(events[e][3]);break;}if(!sourceId)return null;
  var items=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS),itemIdx=findRowByKey_(items,sourceId);if(itemIdx===-1)return null;var item=items.getRange(itemIdx,1,1,QUESTION_ATTEMPT_ITEMS_V2_HEADERS.length).getValues()[0],attempt=attemptByIdV2_(item[1]),target=attempt&&targetByIdV2_(attempt[1]),assignment=target&&assignmentByIdV2_(target[1]);
  if(!attempt||!target||!assignment||String(attempt[2])!==String(reviewRow[1])||String(assignment[2])!=='SENTENCE_STRUCTURE')return null;
  return{set_key:assignment[3],assignment_target_id:target[0],assignmentCapability:createStudentCapability_('assignmentTarget',target[0],['launchAssignment'],{student_id:String(reviewRow[1])},Date.now()+30*60*1000),review_request_id:Utilities.getUuid()};
}
function handleListStudentReviewItemsV2_(e){
  var studentId=String(e.parameter.student_id||''),student=studentV2ById_(studentId),teacherMode=!!e.parameter.token&&e.parameter.token===getToken_(),studentMode=verifyStudentCapability_(e.parameter.assignmentCapability,'listStudentReviewItems','studentAssignments',studentId,{student_id:studentId});
  if(!student||(!teacherMode&&!studentMode))return {error:'forbidden'};var teacherId=getOrCreateDefaultTeacher_();if(String(student[1])!==String(teacherId))return {error:'forbidden'};
  var rows=getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getDataRange().getValues(),out=[],type=String(e.parameter.item_type||''),status=String(e.parameter.status||''),category=String(e.parameter.category||'');
  for(var i=1;i<rows.length;i++){var r=rows[i];if(String(r[1])!==studentId||String(r[2])!==String(teacherId)||!boolValue_(r[15],true)||type&&String(r[3])!==type||status&&String(r[14])!==status)continue;var pub=publicReviewItemV2_(r,teacherMode);if(teacherMode)pub.attempt_detail=reviewAttemptDetailV2_(r);if(studentMode)pub.retry=reviewRetryContextV2_(r);if(category&&!pub.categories.some(function(c){return String(c.key)===category||String(c.label)===category;}))continue;out.push(pub);}
  out.sort(function(a,b){return new Date(b.last_wrong_at)-new Date(a.last_wrong_at);});return {items:out,summary:{wrong_items:out.length,repeated_items:out.filter(function(x){return x.repeated;}).length}};
}

function wrongnoteAccessV2_(e){
  var studentId=String(e.parameter.student_id||''),student=studentV2ById_(studentId),teacherMode=!!e.parameter.token&&e.parameter.token===getToken_();
  var studentMode=verifyStudentCapability_(e.parameter.assignmentCapability,'listStudentReviewItems','studentAssignments',studentId,{student_id:studentId});
  if(!student||(!teacherMode&&!studentMode)||String(student[1])!==String(getOrCreateDefaultTeacher_()))return null;
  return{student_id:studentId,teacher_id:String(student[1]),student_name:student[2]||'',teacher_mode:teacherMode,student_mode:studentMode};
}
function wrongnoteTrackV2_(review,attempt,ctx){
  if(String(review[3])==='WORD')return'VOCAB';
  if(String(review[5])==='SUBJECT'||String(review[5])==='MAIN_VERB')return'SENTENCE_STRUCTURE';
  var type=attempt?String(attempt[4]||''):'';
  if(['GRAMMAR','READING','PRACTICE_EXAM','SENTENCE_STRUCTURE'].indexOf(type)!==-1)return type;
  var q=ctx&&ctx.questions[String(review[4])];return q&&String(q[2])==='PRACTICE_EXAM'?'PRACTICE_EXAM':q&&String(q[2])==='GRAMMAR'?'GRAMMAR':'READING';
}
function wrongnoteContextV2_(access,options){
  var summaryOnly=options&&options.summaryOnly,groupsOnly=options&&options.groupsOnly,itemsOnly=options&&options.itemsOnly,historyOnly=options&&options.historyOnly,historyItemType=String(options&&options.itemType||''),contextTrack=String(options&&options.track||''),reviewRows=options&&options.reviewRows||getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getDataRange().getValues(),eventRows=getOrCreateSheet_(REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS).getDataRange().getValues(),attemptRows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),targetRows=summaryOnly?[]:getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),assignmentRows=summaryOnly?[]:getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),batchRows=summaryOnly?[]:getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS).getDataRange().getValues(),batchLinkRows=summaryOnly?[]:getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),vocabRows=historyOnly||summaryOnly||(groupsOnly||itemsOnly)&&contextTrack!=='VOCAB'?[]:getOrCreateSheet_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS).getDataRange().getValues(),questionRows=historyOnly&&historyItemType==='WORD'||itemsOnly&&contextTrack==='VOCAB'?[]:getOrCreateSheet_(QUESTIONS_V2_SHEET,QUESTIONS_V2_HEADERS).getDataRange().getValues(),wordRows=historyOnly&&historyItemType!=='WORD'||summaryOnly||groupsOnly||itemsOnly&&contextTrack!=='VOCAB'?[]:getOrCreateSheet_(WORDS_V2_SHEET,WORDS_V2_HEADERS).getDataRange().getValues(),categoryRows=historyOnly&&historyItemType==='WORD'||summaryOnly||groupsOnly||itemsOnly&&contextTrack==='VOCAB'?[]:getOrCreateSheet_(CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS).getDataRange().getValues(),questionCategoryRows=historyOnly&&historyItemType==='WORD'||summaryOnly||groupsOnly||itemsOnly&&contextTrack==='VOCAB'?[]:getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues();
  var reviews={},eventsByReview={},attempts={},targets={},assignments={},batchByAssignmentStudent={},batches={},vocabs={},questions={},words={},categories={},categoriesByQuestion={};
  for(var r=1;r<reviewRows.length;r++)if(String(reviewRows[r][1])===access.student_id&&String(reviewRows[r][2])===access.teacher_id&&boolValue_(reviewRows[r][15],true))reviews[String(reviewRows[r][0])]=reviewRows[r];
  for(var e=1;e<eventRows.length;e++)if(reviews[String(eventRows[e][1])])(eventsByReview[String(eventRows[e][1])]||(eventsByReview[String(eventRows[e][1])]=[])).push(eventRows[e]);
  for(var a=1;a<attemptRows.length;a++)if(String(attemptRows[a][2])===access.student_id&&String(attemptRows[a][3])===access.teacher_id)attempts[String(attemptRows[a][0])]=attemptRows[a];
  for(var t=1;t<targetRows.length;t++)if(String(targetRows[t][2])===access.student_id)targets[String(targetRows[t][0])]=targetRows[t];
  for(var n=1;n<assignmentRows.length;n++)if(String(assignmentRows[n][1])===access.teacher_id)assignments[String(assignmentRows[n][0])]=assignmentRows[n];
  for(var b=1;b<batchRows.length;b++)if(String(batchRows[b][1])===access.teacher_id&&String(batchRows[b][2])===access.student_id)batches[String(batchRows[b][0])]=batchRows[b];
  for(var l=1;l<batchLinkRows.length;l++)if(String(batchLinkRows[l][3])===access.student_id)batchByAssignmentStudent[String(batchLinkRows[l][2])+'|'+access.student_id]=String(batchLinkRows[l][1]);
  for(var v=1;v<vocabRows.length;v++)if(String(vocabRows[v][1])===access.teacher_id)vocabs[String(vocabRows[v][0])]=vocabRows[v];
  for(var q=1;q<questionRows.length;q++)questions[String(questionRows[q][0])]=questionRows[q];
  for(var w=1;w<wordRows.length;w++)words[String(wordRows[w][0])]=wordRows[w];
  for(var c=1;c<categoryRows.length;c++)categories[String(categoryRows[c][0])]={key:categoryRows[c][2],label:categoryRows[c][3],domain:categoryRows[c][1]};
  for(var qc=1;qc<questionCategoryRows.length;qc++)if(categories[String(questionCategoryRows[qc][1])])(categoriesByQuestion[String(questionCategoryRows[qc][0])]||(categoriesByQuestion[String(questionCategoryRows[qc][0])]=[])).push(categories[String(questionCategoryRows[qc][1])]);
  return{reviews:reviews,eventsByReview:eventsByReview,attempts:attempts,targets:targets,assignments:assignments,batches:batches,batchByAssignmentStudent:batchByAssignmentStudent,vocabs:vocabs,questions:questions,words:words,categoriesByQuestion:categoriesByQuestion};
}
function wrongnotePublicReviewV2_(ctx,row){var word=String(row[3])==='WORD'?ctx.words[String(row[4])]:null,q=ctx.questions[String(row[4])],prompt=q?parseJsonValue_(q[4],{}):{},display=word?word[2]:(prompt.promptKo||prompt.text||prompt.phrase||('문항 '+(q&&q[9]||'')));return{review_item_id:row[0],item_ref_id:row[4],item_type:row[3],subskill_key:row[5]||'',error_type:sentenceReviewErrorTypeV1_(row[5]),display:display||'정보 없음',meaning:word?word[3]||'':'',content_type:word?'VOCAB':q?q[2]:'QUESTION',categories:ctx.categoriesByQuestion[String(row[4])]||[],first_wrong_at:row[6],last_wrong_at:row[7],wrong_count:Number(row[8])||0,last_correct_at:row[9],review_count:Number(row[11])||0,status:row[14],repeated:Number(row[8])>=2};}
function wrongnoteEventContextV2_(ctx,event){var attempt=ctx.attempts[String(event[2])],target=attempt&&ctx.targets[String(attempt[1])],assignment=target&&ctx.assignments[String(target[1])],batchId=assignment&&ctx.batchByAssignmentStudent[String(assignment[0])+'|'+String(attempt[2])],batch=batchId&&ctx.batches[batchId];return{attempt:attempt,target:target,assignment:assignment,batch:batch};}
function wrongnoteHistoryPreviewV2_(ctx,reviewId,limit){var source=ctx.eventsByReview[String(reviewId)]||[],max=Math.max(0,Number(limit)||0),ordered=source.map(function(event,index){return{event:event,index:index,time:new Date(event[6]).getTime()||0};}).sort(function(a,b){return a.time-b.time||a.index-b.index;}),selected=max?ordered.slice(Math.max(0,ordered.length-max)):[],events=selected.map(function(entry){var event=entry.event,ec=wrongnoteEventContextV2_(ctx,event),attempt=ec.attempt,assignment=ec.assignment;return{outcome:event[4],created_at:event[6],attempt_id:event[2]||'',wrong_delta:Number(event[5])||0,assignment_title:assignment?assignment[4]||'':'',content_type:attempt?attempt[4]||'':'',lesson_date:ec.batch?lessonDateV2_(ec.batch[3]):''};});return{events:events,total_events:ordered.length,has_more:ordered.length>events.length};}
function wrongnoteGroupV2_(ctx,review,event){var ec=wrongnoteEventContextV2_(ctx,event),track=wrongnoteTrackV2_(review,ec.attempt,ctx),assignment=ec.assignment,key=assignment?String(assignment[0]):'UNLINKED:'+track,title=assignment?String(assignment[4]||assignment[3]):'과제 연결 없음',ref=assignment?String(assignment[3]||''):'';if(track==='VOCAB'&&assignment){var vocab=ctx.vocabs[ref];if(vocab)title=String(vocab[13]||vocab[3]||title);}return{group_key:key,track:track,assignment_id:assignment?assignment[0]:'',content_ref_id:ref,title:title,lesson_date:ec.batch?lessonDateV2_(ec.batch[3]):'',latest_at:event[6]};}
function handleGetWrongnoteSummaryV2_(e){var access=wrongnoteAccessV2_(e);if(!access)return{error:'forbidden'};var ctx=wrongnoteContextV2_(access,{summaryOnly:true}),tracks={VOCAB:{},SENTENCE_STRUCTURE:{},GRAMMAR:{},READING:{},PRACTICE_EXAM:{}};Object.keys(tracks).forEach(function(k){tracks[k]={track:k,item_count:0,repeated_count:0,last_wrong_at:''};});Object.keys(ctx.reviews).forEach(function(id){var review=ctx.reviews[id],events=ctx.eventsByReview[id]||[],latest=events.length?events.slice().sort(function(a,b){return new Date(b[6])-new Date(a[6]);})[0]:null,track=wrongnoteTrackV2_(review,latest&&ctx.attempts[String(latest[2])],ctx),sum=tracks[track]||tracks.READING;sum.item_count++;if(Number(review[8])>=2)sum.repeated_count++;if(!sum.last_wrong_at||new Date(review[7])>new Date(sum.last_wrong_at))sum.last_wrong_at=review[7];});return{student:{student_id:access.student_id,name:access.student_name},tracks:Object.keys(tracks).map(function(k){return tracks[k];})};}
function handleListWrongnoteGroupsV2_(e){var access=wrongnoteAccessV2_(e);if(!access)return{error:'forbidden'};var track=String(e.parameter.track||''),limit=Math.min(30,Math.max(1,Number(e.parameter.limit)||20)),offset=Math.max(0,Number(e.parameter.cursor)||0),ctx=wrongnoteContextV2_(access,{groupsOnly:true,track:track}),groups={};Object.keys(ctx.reviews).forEach(function(id){var review=ctx.reviews[id],seen={};(ctx.eventsByReview[id]||[]).forEach(function(event){var g=wrongnoteGroupV2_(ctx,review,event);if(g.track!==track)return;var x=groups[g.group_key]||(groups[g.group_key]={group_key:g.group_key,track:g.track,assignment_id:g.assignment_id,content_ref_id:g.content_ref_id,title:g.title,lesson_date:g.lesson_date,last_study_at:g.latest_at,item_count:0,repeated_count:0,_items:{}});if(!x.last_study_at||new Date(g.latest_at)>new Date(x.last_study_at))x.last_study_at=g.latest_at;if(!seen[g.group_key]){x._items[id]=review;seen[g.group_key]=true;}});});var out=Object.keys(groups).map(function(k){var g=groups[k];g.item_count=Object.keys(g._items).length;g.repeated_count=Object.keys(g._items).filter(function(id){return Number(g._items[id][8])>=2;}).length;delete g._items;return g;}).sort(function(a,b){return new Date(b.last_study_at)-new Date(a.last_study_at);});return{groups:out.slice(offset,offset+limit),next_cursor:offset+limit<out.length?String(offset+limit):null};}
function handleListWrongnoteGroupItemsV2_(e){var access=wrongnoteAccessV2_(e);if(!access)return{error:'forbidden'};var key=String(e.parameter.group_key||''),track=String(e.parameter.track||''),limit=Math.min(30,Math.max(1,Number(e.parameter.limit)||25)),offset=Math.max(0,Number(e.parameter.cursor)||0),ctx=wrongnoteContextV2_(access,{itemsOnly:true,track:track}),matched={};Object.keys(ctx.reviews).forEach(function(id){var review=ctx.reviews[id];(ctx.eventsByReview[id]||[]).some(function(event){var g=wrongnoteGroupV2_(ctx,review,event);if(g.group_key===key&&g.track===track){matched[id]=review;return true;}return false;});});var grouped={};Object.keys(matched).forEach(function(id){var item=wrongnotePublicReviewV2_(ctx,matched[id]);try{item.history_preview=wrongnoteHistoryPreviewV2_(ctx,id,3);}catch(previewError){item.history_preview=null;console.error('wrongnote history preview failed');}if(access.student_mode)item.retry=reviewRetryContextV2_(matched[id]);var groupId=track==='SENTENCE_STRUCTURE'?'QUESTION:'+String(item.item_ref_id):'REVIEW:'+id,current=grouped[groupId];if(!current){item.review_item_ids=[item.review_item_id];item.subskills=item.subskill_key?[item.subskill_key]:[];grouped[groupId]=item;return;}current.review_item_ids.push(item.review_item_id);if(!current.retry&&item.retry)current.retry=item.retry;if(item.subskill_key&&current.subskills.indexOf(item.subskill_key)===-1)current.subskills.push(item.subskill_key);current.wrong_count+=item.wrong_count;current.repeated=current.repeated||item.repeated;if(new Date(item.last_wrong_at)>new Date(current.last_wrong_at))current.last_wrong_at=item.last_wrong_at;});var out=Object.keys(grouped).map(function(id){return grouped[id];}).sort(function(a,b){return new Date(b.last_wrong_at)-new Date(a.last_wrong_at);});return{items:out.slice(offset,offset+limit),next_cursor:offset+limit<out.length?String(offset+limit):null};}
function handleGetReviewItemHistoryV2_(e){var access=wrongnoteAccessV2_(e);if(!access)return{error:'forbidden'};var id=String(e.parameter.review_item_id||''),limit=Math.min(50,Math.max(1,Number(e.parameter.limit)||30)),reviewRows=getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getDataRange().getValues(),review=null;for(var r=1;r<reviewRows.length;r++)if(String(reviewRows[r][0])===id&&String(reviewRows[r][1])===access.student_id&&String(reviewRows[r][2])===access.teacher_id&&boolValue_(reviewRows[r][15],true)){review=reviewRows[r];break;}if(!review)return{error:'not found'};var ctx=wrongnoteContextV2_(access,{historyOnly:true,itemType:String(review[3]),reviewRows:reviewRows}),events=(ctx.eventsByReview[id]||[]).map(function(event){var ec=wrongnoteEventContextV2_(ctx,event),attempt=ec.attempt,assignment=ec.assignment;return{event_id:event[0],attempt_id:event[2]||'',source_item_id:event[3]||'',outcome:event[4],wrong_delta:Number(event[5])||0,created_at:event[6],lesson_date:ec.batch?lessonDateV2_(ec.batch[3]):'',assignment_title:assignment?assignment[4]||'':'',content_type:attempt?attempt[4]||'':'',attempt_status:attempt?attempt[9]||'':''};}).sort(function(a,b){return new Date(a.created_at)-new Date(b.created_at);});return{item:wrongnotePublicReviewV2_(ctx,review),events:events.slice(Math.max(0,events.length-limit)),history_complete:events.length<=limit};}
function handleGetTeacherDashboardV2Legacy_(e){
  if(!e.parameter.token||e.parameter.token!==getToken_())return {error:'no token'};
  var teacherId=getOrCreateDefaultTeacher_(),days=e.parameter.days===''?7:Number(e.parameter.days||7),since=days>0?Date.now()-days*86400000:0,studentFilter=String(e.parameter.student_id||''),groupFilter=String(e.parameter.group_id||'');
  var studentRows=getOrCreateSheet_(STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS).getDataRange().getValues(),assignmentRows=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),targetRows=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),attemptRows=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),qRows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),wordRows=getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),detailRows=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues(),reviewRows=getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getDataRange().getValues(),catRows=getOrCreateSheet_(CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS).getDataRange().getValues(),linkRows=getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues(),questionRows=getOrCreateSheet_(QUESTIONS_V2_SHEET,QUESTIONS_V2_HEADERS).getDataRange().getValues(),groupRows=getOrCreateSheet_(GROUPS_V2_SHEET,GROUPS_V2_HEADERS).getDataRange().getValues(),memberRows=getOrCreateSheet_(GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS).getDataRange().getValues();
  var groupStudents={};if(groupFilter)for(var gm=1;gm<memberRows.length;gm++)if(String(memberRows[gm][1])===groupFilter&&boolValue_(memberRows[gm][5],true))groupStudents[String(memberRows[gm][2])]=true;
  var students={},out=[];for(var s=1;s<studentRows.length;s++){var sr=studentRows[s],sid=String(sr[0]);if(String(sr[1])!==teacherId||!boolValue_(sr[4],true)||studentFilter&&sid!==studentFilter||groupFilter&&!groupStudents[sid])continue;students[sid]={student_id:sid,name:sr[2],grade:sr[3],assignments:0,completed:0,overdue:0,pending:0,repeated_wrong_count:0,last_study_at:'',accuracy:{},elapsed:{},subject:{correct:0,total:0},verb:{correct:0,total:0},words:{},attempts:[]};}
  var assignments={};for(var a=1;a<assignmentRows.length;a++)if(String(assignmentRows[a][1])===teacherId)assignments[String(assignmentRows[a][0])]=assignmentRows[a];
  for(var t=1;t<targetRows.length;t++){var tr=targetRows[t],st=students[String(tr[2])],ar=assignments[String(tr[1])];if(!st||!ar||!boolValue_(tr[6],true)||since&&new Date(ar[6]).getTime()<since)continue;st.assignments++;var status=derivedAssignmentStatus_(tr[3],ar[7]);if(status==='COMPLETED')st.completed++;if(status==='OVERDUE')st.overdue++;}
  var targetById={},attempts={},attemptStudent={};for(var tt=1;tt<targetRows.length;tt++)targetById[String(targetRows[tt][0])]=targetRows[tt];for(var at=1;at<attemptRows.length;at++){var aa=attemptRows[at],st2=students[String(aa[2])];if(!st2||String(aa[3])!==teacherId||since&&new Date(aa[6]).getTime()<since)continue;attempts[String(aa[0])]=aa;attemptStudent[String(aa[0])]=st2;if(!st2.last_study_at||new Date(aa[6])>new Date(st2.last_study_at))st2.last_study_at=aa[6];var ap=attemptPublicV2_(aa),tg=targetById[String(aa[1])],asg=tg&&assignments[String(tg[1])];ap.assignment_title=asg?asg[4]:'';st2.attempts.push(ap);}
  var catById={},catsByQ={},qById={};for(var c=1;c<catRows.length;c++)catById[String(catRows[c][0])]={key:catRows[c][2],label:catRows[c][3],domain:catRows[c][1]};for(var l=1;l<linkRows.length;l++){var cm=catById[String(linkRows[l][1])];if(cm)(catsByQ[String(linkRows[l][0])]||(catsByQ[String(linkRows[l][0])]=[])).push(cm);}for(var qq=1;qq<questionRows.length;qq++)qById[String(questionRows[qq][0])]=questionRows[qq];
  var itemById={};for(var qi=1;qi<qRows.length;qi++){var qr=qRows[qi],st3=attemptStudent[String(qr[1])];if(!st3)continue;itemById[String(qr[0])]=qr;if(String(qr[6])==='PENDING')st3.pending++;var correct=qr[5]===true,cats=catsByQ[String(qr[2])]||[];cats.forEach(function(cm){var x=st3.accuracy[cm.key]||(st3.accuracy[cm.key]={key:cm.key,label:cm.label,domain:cm.domain,correct:0,total:0});x.total++;if(correct)x.correct++;var el=st3.elapsed[cm.key]||(st3.elapsed[cm.key]={sum:0,count:0});if(Number(qr[7])>0){el.sum+=Number(qr[7]);el.count++;}});}
  for(var di=1;di<detailRows.length;di++){var dr=detailRows[di],item=itemById[String(dr[0])],st4=item&&attemptStudent[String(item[1])];if(!st4)continue;st4.subject.total++;st4.verb.total++;if(dr[5]===true)st4.subject.correct++;if(dr[6]===true)st4.verb.correct++;}
  for(var wi=1;wi<wordRows.length;wi++){var wr=wordRows[wi],st5=attemptStudent[String(wr[1])];if(st5&&Number(wr[4])>0)st5.words[String(wr[2])]=(st5.words[String(wr[2])]||0)+Number(wr[4]);}
  for(var ri=1;ri<reviewRows.length;ri++){var rr=reviewRows[ri],st6=students[String(rr[1])];if(st6&&String(rr[2])===teacherId&&boolValue_(rr[15],true)&&Number(rr[8])>=2)st6.repeated_wrong_count++;}
  Object.keys(students).forEach(function(id){var st=students[id],acc=[];Object.keys(st.accuracy).forEach(function(k){var x=st.accuracy[k],el=st.elapsed[k]||{sum:0,count:0};acc.push({key:x.key,label:x.label,domain:x.domain,correct:x.correct,total:x.total,accuracy:x.total?Math.round(x.correct/x.total*100):null,average_elapsed_ms:el.count?Math.round(el.sum/el.count):null});});var frequent=Object.keys(st.words).map(function(k){return{word_id:k,wrong_count:st.words[k]};}).sort(function(x,y){return y.wrong_count-x.wrong_count;}).slice(0,10);st.completion_rate=st.assignments?Math.round(st.completed/st.assignments*100):null;st.subject_accuracy=st.subject.total?Math.round(st.subject.correct/st.subject.total*100):null;st.main_verb_accuracy=st.verb.total?Math.round(st.verb.correct/st.verb.total*100):null;st.accuracy_by_category=acc;st.frequently_missed_words=frequent;st.status=st.overdue||st.repeated_wrong_count||st.pending||st.completion_rate!==null&&st.completion_rate<70?'CHECK':'NORMAL';st.attempts.sort(function(x,y){return new Date(y.started_at)-new Date(x.started_at);});delete st.accuracy;delete st.elapsed;delete st.subject;delete st.verb;delete st.words;out.push(st);});
  out.sort(function(a,b){return(a.status==='CHECK'?0:1)-(b.status==='CHECK'?0:1)||String(a.name).localeCompare(String(b.name));});var groups=[];for(var g=1;g<groupRows.length;g++)if(String(groupRows[g][1])===teacherId&&boolValue_(groupRows[g][3],true))groups.push({group_id:groupRows[g][0],name:groupRows[g][2]});return {period_days:days,summary:{active_students:out.length,incomplete_students:out.filter(function(x){return x.assignments>x.completed;}).length,overdue_students:out.filter(function(x){return x.overdue>0;}).length,repeated_wrong_students:out.filter(function(x){return x.repeated_wrong_count>0;}).length,pending_items:out.reduce(function(n,x){return n+x.pending;},0)},students:out,groups:groups};
}
function dashboardAreaV2_(type){if(String(type)==='VOCAB')return'VOCAB';if(String(type)==='SENTENCE_STRUCTURE')return'SENTENCE_STRUCTURE';if(String(type)==='GRAMMAR')return'GRAMMAR';if(['READING','PRACTICE_EXAM'].indexOf(String(type))!==-1)return'READING';return'';}
function handleGetTeacherDashboardV2_(e){
  if(!e.parameter.token||e.parameter.token!==getToken_())return{error:'no token'};
  var teacherId=getOrCreateDefaultTeacher_(),days=e.parameter.days===''?7:Number(e.parameter.days||7),since=days>0?Date.now()-days*86400000:0,groupFilter=String(e.parameter.group_id||''),studentFilter=String(e.parameter.student_id||''),summaryOnly=String(e.parameter.summary||'')==='1';
  var sr=getOrCreateSheet_(STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS).getDataRange().getValues(),ar=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),tr=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),atr=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),qr=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),wr=summaryOnly?[]:getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),dr=summaryOnly?[]:getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues(),rr=getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getDataRange().getValues(),cr=getOrCreateSheet_(CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS).getDataRange().getValues(),lr=getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues(),words=summaryOnly?[]:getOrCreateSheet_(WORDS_V2_SHEET,WORDS_V2_HEADERS).getDataRange().getValues(),gr=getOrCreateSheet_(GROUPS_V2_SHEET,GROUPS_V2_HEADERS).getDataRange().getValues(),gmr=groupFilter?getOrCreateSheet_(GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS).getDataRange().getValues():[];
  var groupIds={};if(groupFilter)for(var gm=1;gm<gmr.length;gm++)if(String(gmr[gm][1])===groupFilter&&boolValue_(gmr[gm][5],true))groupIds[String(gmr[gm][2])]=true;
  var students={};for(var s=1;s<sr.length;s++){var row=sr[s],sid=String(row[0]);if(String(row[1])!==teacherId||!boolValue_(row[4],true)||studentFilter&&sid!==studentFilter||groupFilter&&!groupIds[sid])continue;students[sid]={student_id:sid,name:row[2],grade:row[3],assignments:0,completed:0,overdue:0,pending:0,last_study_at:'',areas:{VOCAB:{assigned:0},SENTENCE_STRUCTURE:{assigned:0},GRAMMAR:{assigned:0},READING:{assigned:0}},category:{},subject_correct:0,subject_total:0,verb_correct:0,verb_total:0,recent_sentence:[],word_wrong:{},repeated:{VOCAB:0,SENTENCE_STRUCTURE:0,GRAMMAR:0,READING:0},attempts:[],recent_vocab:null};}
  var assignments={},targets={};for(var a=1;a<ar.length;a++)if(String(ar[a][1])===teacherId)assignments[String(ar[a][0])]=ar[a];for(var t=1;t<tr.length;t++){targets[String(tr[t][0])]=tr[t];var st=students[String(tr[t][2])],as=assignments[String(tr[t][1])];if(!st||!as||!boolValue_(tr[t][6],true)||since&&new Date(as[6]).getTime()<since)continue;st.assignments++;var area=dashboardAreaV2_(as[2]);if(area)st.areas[area].assigned++;var status=derivedAssignmentStatus_(tr[t][3],as[7]);if(status==='COMPLETED')st.completed++;if(status==='OVERDUE')st.overdue++;}
  var attempts={},attemptStudent={},attemptArea={};for(var ai=1;ai<atr.length;ai++){var at=atr[ai],st2=students[String(at[2])];if(!st2||String(at[3])!==teacherId||since&&new Date(at[6]).getTime()<since)continue;attempts[String(at[0])]=at;attemptStudent[String(at[0])]=st2;attemptArea[String(at[0])]=dashboardAreaV2_(at[4]);if(!st2.last_study_at||new Date(at[6])>new Date(st2.last_study_at))st2.last_study_at=at[6];var target=targets[String(at[1])],assignment=target&&assignments[String(target[1])],pub=attemptPublicV2_(at);pub.assignment_title=assignment?assignment[4]:'';st2.attempts.push(pub);if(String(at[4])==='VOCAB'&&(!st2.recent_vocab||new Date(at[6])>new Date(st2.recent_vocab.started_at)))st2.recent_vocab={assignment_title:pub.assignment_title,status:at[9],started_at:at[6],completed_at:at[7],duration_ms:at[8],repetition_count:Number(at[15])||0,first_wrong_count:0};}
  var catById={},catsByQ={};for(var c=1;c<cr.length;c++)catById[String(cr[c][0])]={key:cr[c][2],label:cr[c][3],domain:cr[c][1]};for(var l=1;l<lr.length;l++){var cat=catById[String(lr[l][1])];if(cat)(catsByQ[String(lr[l][0])]||(catsByQ[String(lr[l][0])]=[])).push(cat);}
  var itemById={};for(var q=1;q<qr.length;q++){var qi=qr[q],st3=attemptStudent[String(qi[1])];if(!st3)continue;itemById[String(qi[0])]=qi;if(String(qi[6])==='PENDING')st3.pending++;if(qi[5]!==true&&qi[5]!==false)continue;(catsByQ[String(qi[2])]||[]).forEach(function(cat){var x=st3.category[cat.key]||(st3.category[cat.key]={key:cat.key,label:cat.label,domain:cat.domain,correct:0,total:0,elapsed_sum:0,elapsed_count:0});x.total++;if(qi[5]===true)x.correct++;var em=Number(qi[7]);if(em>0){x.elapsed_sum+=em;x.elapsed_count++;}});}
  for(var d=1;d<dr.length;d++){var detail=dr[d],item=itemById[String(detail[0])],st4=item&&attemptStudent[String(item[1])];if(!st4)continue;st4.subject_total++;st4.verb_total++;if(detail[5]===true)st4.subject_correct++;if(detail[6]===true)st4.verb_correct++;st4.recent_sentence.push({subject_correct:detail[5]===true,main_verb_correct:detail[6]===true,submitted_at:detail[16]||detail[8]||item[10]||''});}
  var wordMeta={};for(var w=1;w<words.length;w++)wordMeta[String(words[w][0])]={term:words[w][2],meaning:words[w][3]};for(var wi=1;wi<wr.length;wi++){var witem=wr[wi],st5=attemptStudent[String(witem[1])];if(!st5)continue;var wrong=Math.max(0,Number(witem[4])||0);if(wrong)st5.word_wrong[String(witem[2])]=(st5.word_wrong[String(witem[2])]||0)+wrong;if(st5.recent_vocab&&String(st5.recent_vocab.started_at)===String(attempts[String(witem[1])][6])&&!boolValue_(witem[3],true))st5.recent_vocab.first_wrong_count++;}
  for(var r=1;r<rr.length;r++){var rev=rr[r],st6=students[String(rev[1])];if(!st6||String(rev[2])!==teacherId||!boolValue_(rev[15],true)||Number(rev[8])<2)continue;var area2=String(rev[3])==='WORD'?'VOCAB':rev[5]?'SENTENCE_STRUCTURE':'';if(!area2){var cs=catsByQ[String(rev[4])]||[];area2=cs.some(function(x){return x.domain==='GRAMMAR';})?'GRAMMAR':'READING';}st6.repeated[area2]=(st6.repeated[area2]||0)+1;}
  var out=[];Object.keys(students).forEach(function(id){var st=students[id],cats=[];Object.keys(st.category).forEach(function(k){var x=st.category[k];cats.push({key:x.key,label:x.label,domain:x.domain,correct:x.correct,total:x.total,accuracy:x.total?Math.round(x.correct/x.total*100):null,average_elapsed_ms:x.elapsed_count?Math.round(x.elapsed_sum/x.elapsed_count):null,elapsed_sample_size:x.elapsed_count});});st.accuracy_by_category=cats;st.subject_accuracy=st.subject_total?Math.round(st.subject_correct/st.subject_total*100):null;st.main_verb_accuracy=st.verb_total?Math.round(st.verb_correct/st.verb_total*100):null;var recent=st.recent_sentence.sort(function(a,b){return new Date(b.submitted_at)-new Date(a.submitted_at);}).slice(0,10),recentSubject=recent.filter(function(x){return x.subject_correct;}).length,recentVerb=recent.filter(function(x){return x.main_verb_correct;}).length;st.recent10_sentence_count=recent.length;st.recent10_subject_accuracy=recent.length?Math.round(recentSubject/recent.length*100):null;st.recent10_main_verb_accuracy=recent.length?Math.round(recentVerb/recent.length*100):null;st.sentence_structure_observation=st.subject_accuracy!=null&&st.main_verb_accuracy!=null&&st.subject_accuracy!==st.main_verb_accuracy?(st.subject_accuracy>st.main_verb_accuracy?'주어보다 본동사 식별에서 오답이 더 많이 발생했습니다.':'본동사보다 주어 식별에서 오답이 더 많이 발생했습니다.'):'주어와 본동사 식별 정답률에 뚜렷한 차이가 없습니다.';st.frequently_missed_words=Object.keys(st.word_wrong).map(function(k){var m=wordMeta[k]||{};return{term:m.term||'과거 테스트 데이터',meaning:m.meaning||'',wrong_count:st.word_wrong[k]};}).sort(function(x,y){return y.wrong_count-x.wrong_count;}).slice(0,10);st.repeated_wrong_count=st.repeated.VOCAB+st.repeated.SENTENCE_STRUCTURE+st.repeated.GRAMMAR+st.repeated.READING;st.completion_rate=st.assignments?Math.round(st.completed/st.assignments*100):null;st.status=st.overdue||st.repeated_wrong_count||st.pending||st.completion_rate!==null&&st.completion_rate<70?'CHECK':'NORMAL';st.attempts.sort(function(x,y){return new Date(y.started_at)-new Date(x.started_at);});delete st.category;delete st.word_wrong;delete st.subject_correct;delete st.subject_total;delete st.verb_correct;delete st.verb_total;delete st.recent_sentence;out.push(st);});
  out.sort(function(a,b){return(a.status==='CHECK'?0:1)-(b.status==='CHECK'?0:1)||b.overdue-a.overdue||(a.completion_rate==null?101:a.completion_rate)-(b.completion_rate==null?101:b.completion_rate)||String(a.name).localeCompare(String(b.name));});var groups=[];for(var g=1;g<gr.length;g++)if(String(gr[g][1])===teacherId&&boolValue_(gr[g][3],true))groups.push({group_id:gr[g][0],name:gr[g][2]});return{period_days:days,summary:{active_students:out.length,incomplete_students:out.filter(function(x){return x.assignments>x.completed;}).length,overdue_students:out.filter(function(x){return x.overdue>0;}).length,pending_items:out.reduce(function(n,x){return n+x.pending;},0)},students:out,groups:groups};
}
function handleGetAttemptDetailV2Enhanced_(e){
  var attempt=attemptByIdV2_(e.parameter.attempt_id),target=attempt&&targetByIdV2_(attempt[1]),studentId=String(e.parameter.student_id||''),ownsAttempt=attempt&&target&&String(attempt[2])===studentId&&String(target[2])===studentId,attemptAllowed=ownsAttempt&&verifyStudentCapability_(e.parameter.attemptCapability,'submitAttemptQuestionV2','assignmentTarget',attempt[1],{student_id:studentId}),readAllowed=ownsAttempt&&verifyStudentCapability_(e.parameter.assignmentCapability,'getAttemptDetailV2','studentAssignments',studentId,{student_id:studentId}),studentAllowed=attemptAllowed||readAllowed,teacherAllowed=!!e.parameter.token&&e.parameter.token===getToken_()&&attempt&&String(attempt[3])===getOrCreateDefaultTeacher_();if(!attempt||(!studentAllowed&&!teacherAllowed))return{error:'forbidden'};
  var assignment=target&&assignmentByIdV2_(target[1]),contentType=String(attempt[4]||'').toUpperCase(),isVocab=contentType==='VOCAB',isSentence=contentType==='SENTENCE_STRUCTURE',qRows=isVocab?[]:getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),wRows=isVocab?getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues():[],dRows=isSentence?getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues():[];
  var questionRows=isVocab?[]:getOrCreateSheet_(QUESTIONS_V2_SHEET,QUESTIONS_V2_HEADERS).getDataRange().getValues(),sourceRows=isVocab?[]:getOrCreateSheet_(SOURCES_V2_SHEET,SOURCES_V2_HEADERS).getDataRange().getValues(),categoryRows=isVocab?[]:getOrCreateSheet_(CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS).getDataRange().getValues(),categoryLinkRows=isVocab?[]:getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues(),wordMetaRows=isVocab?getOrCreateSheet_(WORDS_V2_SHEET,WORDS_V2_HEADERS).getDataRange().getValues():[];
  var questionsById={},sourcesById={},categoriesById={},categoriesByQuestionId={},wordsById={},details={};
  for(var qi=1;qi<questionRows.length;qi++)questionsById[String(questionRows[qi][0])]=questionRows[qi];
  for(var si=1;si<sourceRows.length;si++)sourcesById[String(sourceRows[si][0])]=sourceRows[si];
  for(var ci=1;ci<categoryRows.length;ci++)categoriesById[String(categoryRows[ci][0])]={key:categoryRows[ci][2],label:categoryRows[ci][3],domain:categoryRows[ci][1]};
  for(var li=1;li<categoryLinkRows.length;li++){var linkedCategory=categoriesById[String(categoryLinkRows[li][1])];if(linkedCategory)(categoriesByQuestionId[String(categoryLinkRows[li][0])]||(categoriesByQuestionId[String(categoryLinkRows[li][0])]=[])).push(linkedCategory);}
  for(var wi=1;wi<wordMetaRows.length;wi++)wordsById[String(wordMetaRows[wi][0])]={display:wordMetaRows[wi][2]||'단어 정보 없음',meaning:wordMetaRows[wi][3]||''};
  for(var d=1;d<dRows.length;d++)details[String(dRows[d][0])]={student_subject:parseJsonValue_(dRows[d][1],[]),student_main_verb:parseJsonValue_(dRows[d][2],[]),correct_subject:parseJsonValue_(dRows[d][3],[]),correct_main_verb:parseJsonValue_(dRows[d][4],[]),subject_correct:dRows[d][5],main_verb_correct:dRows[d][6],student_subject_tokens:parseJsonValue_(dRows[d][10],[]),student_main_verb_tokens:parseJsonValue_(dRows[d][11],[]),correct_subject_tokens:parseJsonValue_(dRows[d][12],[]),correct_main_verb_tokens:parseJsonValue_(dRows[d][13],[]),metadata:parseJsonValue_(dRows[d][14],{}),elapsed_ms:Number(dRows[d][15])||null,submitted_at:dRows[d][16]};
  var questions=[],words=[];for(var q=1;q<qRows.length;q++)if(String(qRows[q][1])===String(attempt[0])){var question=questionsById[String(qRows[q][2])],prompt=question?parseJsonValue_(question[4],{}):{},source=question&&sourcesById[String(question[8])],display=prompt.promptKo||prompt.text||prompt.phrase||('문항 '+(question&&question[9]||qRows[q][3]||''));questions.push({sequence:qRows[q][3],display:String(display).slice(0,500),categories:categoriesByQuestionId[String(qRows[q][2])]||[],source:source?{exam_type:source[1],year:source[2],grade:source[3],month:source[4],exam_name:source[5],question_no:question[9]}:null,source_question_no:question?question[9]:'',student_answer:parseJsonValue_(qRows[q][4],null),correct_answer:question?parseJsonValue_(question[6],null):null,is_correct:qRows[q][5],grading_status:qRows[q][6],elapsed_ms:Number(qRows[q][7])>0?Number(qRows[q][7]):null,difficulty:question?question[15]||'':'',sentence_structure:details[String(qRows[q][0])]||null});}
  for(var w=1;w<wRows.length;w++)if(String(wRows[w][1])===String(attempt[0])){var wm=wordsById[String(wRows[w][2])]||{display:'단어 정보 없음',meaning:''};words.push({term:wm.display,meaning:wm.meaning,first_correct:wRows[w][3],wrong_count:wRows[w][4],final_correct:wRows[w][5]});}var pub=attemptPublicV2_(attempt);delete pub.teacher_id;delete pub.student_id;delete pub.assignment_target_id;pub.assignment_title=assignment?assignment[4]:'';return{attempt:pub,question_items:questions,word_items:words};
}
function homeworkBatchSummaryV2_(batch,links,assignments,targetByAssignmentStudent){var areas={VOCAB:{assigned:0,completed:0},SENTENCE_STRUCTURE:{assigned:0,completed:0},GRAMMAR:{assigned:0,completed:0},READING:{assigned:0,completed:0}},items=[],completed=0,overdue=0;for(var i=0;i<links.length;i++){var link=links[i],a=assignments[String(link[2])];if(!a)continue;var target=targetByAssignmentStudent[String(a[0])+'|'+String(batch[2])],status=target?derivedAssignmentStatus_(target[3],a[7]):'NOT_STARTED',area=dashboardAreaV2_(a[2]),snap=parseJsonValue_(link[4],{});if(area){areas[area].assigned++;if(status==='COMPLETED')areas[area].completed++;if(area==='VOCAB'&&snap.display_range)areas[area].display_range=snap.display_range;}if(status==='COMPLETED')completed++;if(status==='OVERDUE')overdue++;items.push({assignment_id:a[0],content_type:a[2],content_subtype:a[11]||'',title:a[4],due_at:a[7],status:status,snapshot:snap});}var count=items.length;return{homework_batch_id:batch[0],lesson_date:batch[3],assigned_at:batch[4],title:batch[5],assignments:count,completed:completed,completion_rate:count?Math.round(completed/count*100):null,overdue:overdue,areas:areas,items:items};}
function homeworkBatchReadRowsV2_(ss,name,headers,columnCount,perf){var opened=Date.now(),sheet=ss.getSheetByName(name);perf.sheet_open_ms+=Date.now()-opened;if(!sheet)return[];var readStarted=Date.now(),lastRow=sheet.getLastRow(),rows=lastRow>1?sheet.getRange(2,1,lastRow-1,columnCount).getValues():[];perf.range_read_ms+=Date.now()-readStarted;perf.reads.push({sheet:name,rows:rows.length,columns:columnCount});return rows;}
function handleListHomeworkBatchesV2_(e){var totalStarted=Date.now(),perf={api:'listHomeworkBatchesV2',dispatch_ms:e.__elab_dispatch_started?totalStarted-e.__elab_dispatch_started:0,sheet_open_ms:0,range_read_ms:0,filter_ms:0,group_ms:0,serialize_ms:0,sheet_read_count:0,reads:[]};if(!e.parameter.token||e.parameter.token!==getToken_())return{error:'no token'};var teacherId=PropertiesService.getScriptProperties().getProperty('DEFAULT_TEACHER_ID')||getOrCreateDefaultTeacher_(),studentId=String(e.parameter.student_id||''),openStarted=Date.now(),ss=SpreadsheetApp.getActiveSpreadsheet();perf.sheet_open_ms+=Date.now()-openStarted;var students=homeworkBatchReadRowsV2_(ss,STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS,5,perf),br=homeworkBatchReadRowsV2_(ss,HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS,HOMEWORK_BATCHES_V2_HEADERS.length,perf),lr=homeworkBatchReadRowsV2_(ss,HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS.length,perf),ar=homeworkBatchReadRowsV2_(ss,ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS,ASSIGNMENTS_V2_HEADERS.length,perf),tr=homeworkBatchReadRowsV2_(ss,ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS,ASSIGNMENT_TARGETS_V2_HEADERS.length,perf),filterStarted=Date.now(),student=null,assignments={},targets={},byBatch={};perf.sheet_read_count=perf.reads.length;for(var s=0;s<students.length;s++)if(String(students[s][0])===studentId){student=students[s];break}if(!student||String(student[1])!==String(teacherId))return{error:'forbidden'};for(var a=0;a<ar.length;a++)if(String(ar[a][1])===String(teacherId))assignments[String(ar[a][0])]=ar[a];for(var t=0;t<tr.length;t++)if(String(tr[t][2])===studentId)targets[String(tr[t][1])+'|'+studentId]=tr[t];for(var l=0;l<lr.length;l++)if(String(lr[l][3])===studentId)(byBatch[String(lr[l][1])]||(byBatch[String(lr[l][1])]=[])).push(lr[l]);var selected=[];for(var b=0;b<br.length;b++)if(String(br[b][1])===String(teacherId)&&String(br[b][2])===studentId&&boolValue_(br[b][6],true))selected.push(br[b]);perf.filter_ms=Date.now()-filterStarted;var groupStarted=Date.now(),out=[];for(var i=0;i<selected.length;i++)out.push(homeworkBatchSummaryV2_(selected[i],byBatch[String(selected[i][0])]||[],assignments,targets));out.sort(function(x,y){return String(y.lesson_date).localeCompare(String(x.lesson_date))||new Date(y.assigned_at)-new Date(x.assigned_at);});perf.group_ms=Date.now()-groupStarted;var response={batches:out},serializeStarted=Date.now();JSON.stringify(response);perf.serialize_ms=Date.now()-serializeStarted;perf.total_ms=Date.now()-totalStarted;response.perf=perf;console.log('[ELAB-PERF][HOMEWORK_BATCHES] '+JSON.stringify(perf));return response;}
function handleGetTeacherDashboardG01_(e){if(!e.parameter.token||e.parameter.token!==getToken_())return{error:'no token'};var p={};Object.keys(e.parameter||{}).forEach(function(k){p[k]=e.parameter[k];});p.days='0';var base=handleGetTeacherDashboardV2_({parameter:p});if(base.error)return base;var teacherId=getOrCreateDefaultTeacher_(),br=getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS).getDataRange().getValues(),lr=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),ar=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),tr=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),assignments={},targets={},linksByBatch={},batchByAssignmentStudent={};for(var a=1;a<ar.length;a++)if(String(ar[a][1])===String(teacherId))assignments[String(ar[a][0])]=ar[a];for(var t=1;t<tr.length;t++)targets[String(tr[t][1])+'|'+String(tr[t][2])]=tr[t];for(var l=1;l<lr.length;l++){(linksByBatch[String(lr[l][1])]||(linksByBatch[String(lr[l][1])]=[])).push(lr[l]);batchByAssignmentStudent[String(lr[l][2])+'|'+String(lr[l][3])]=String(lr[l][1]);}var batchesByStudent={};for(var b=1;b<br.length;b++)if(String(br[b][1])===String(teacherId)&&boolValue_(br[b][6],true)){var sum=homeworkBatchSummaryV2_(br[b],linksByBatch[String(br[b][0])]||[],assignments,targets);(batchesByStudent[String(br[b][2])]||(batchesByStudent[String(br[b][2])]=[])).push(sum);}base.students.forEach(function(st){var list=batchesByStudent[String(st.student_id)]||[];list.sort(function(x,y){return String(y.lesson_date).localeCompare(String(x.lesson_date))||new Date(y.assigned_at)-new Date(x.assigned_at);});st.homework_batches=list;st.current_batch=list[0]||null;if(st.current_batch){st.assignments=st.current_batch.assignments;st.completed=st.current_batch.completed;st.completion_rate=st.current_batch.completion_rate;st.overdue=st.current_batch.overdue;st.areas=st.current_batch.areas;}else{st.assignments=0;st.completed=0;st.completion_rate=null;st.overdue=0;st.areas={VOCAB:{assigned:0},SENTENCE_STRUCTURE:{assigned:0},GRAMMAR:{assigned:0},READING:{assigned:0}};}(st.attempts||[]).forEach(function(at){var target=targetByIdV2_(at.assignment_target_id),aid=target&&target[1];at.homework_batch_id=aid?batchByAssignmentStudent[String(aid)+'|'+String(st.student_id)]||'':'';});if(st.current_batch&&st.current_batch.areas.VOCAB.display_range){st.vocab_display_range=st.current_batch.areas.VOCAB.display_range;}});base.students.sort(function(a,b){return(a.status==='CHECK'?0:1)-(b.status==='CHECK'?0:1)||(a.completion_rate==null?101:a.completion_rate)-(b.completion_rate==null?101:b.completion_rate)||String(a.name).localeCompare(String(b.name));});base.summary={active_students:base.students.length,incomplete_students:base.students.filter(function(x){return x.current_batch&&x.current_batch.assignments>x.current_batch.completed;}).length,pending_items:base.students.reduce(function(n,x){return n+x.pending;},0)};base.dashboard_basis='LATEST_HOMEWORK_BATCH';return base;}
function attachBatchPerformanceG01_(base){var students={},batches={},teacherId=getOrCreateDefaultTeacher_();(base.students||[]).forEach(function(st){students[String(st.student_id)]=st;(st.homework_batches||[]).forEach(function(b){b.performance={correct:0,total:0,subject_correct:0,subject_sample:0,main_verb_correct:0,main_verb_sample:0,categories:{}};batches[String(b.homework_batch_id)]=b;});});var lr=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),tr=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),atr=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),qr=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),dr=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues(),cr=getOrCreateSheet_(CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS).getDataRange().getValues(),qcr=getOrCreateSheet_(QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS).getDataRange().getValues(),batchByAssignmentStudent={},targetById={},attemptBatch={},attemptStudent={},itemAttempt={};for(var l=1;l<lr.length;l++)batchByAssignmentStudent[String(lr[l][2])+'|'+String(lr[l][3])]=String(lr[l][1]);for(var t=1;t<tr.length;t++)targetById[String(tr[t][0])]=tr[t];for(var a=1;a<atr.length;a++){if(String(atr[a][3])!==String(teacherId)||!students[String(atr[a][2])])continue;var target=targetById[String(atr[a][1])],bid=target&&batchByAssignmentStudent[String(target[1])+'|'+String(atr[a][2])];if(bid&&batches[bid]){attemptBatch[String(atr[a][0])]=batches[bid];attemptStudent[String(atr[a][0])]=students[String(atr[a][2])];}}var catById={},catsByQ={};for(var c=1;c<cr.length;c++)catById[String(cr[c][0])]={key:cr[c][2],label:cr[c][3],domain:cr[c][1],parent_category_id:cr[c][4]||''};for(var qc=1;qc<qcr.length;qc++){var cat=catById[String(qcr[qc][1])];if(cat)(catsByQ[String(qcr[qc][0])]||(catsByQ[String(qcr[qc][0])]=[])).push(cat);}for(var q=1;q<qr.length;q++){var item=qr[q],batch=attemptBatch[String(item[1])];if(!batch)continue;itemAttempt[String(item[0])]=String(item[1]);if(item[5]===true||item[5]===false){batch.performance.total++;if(item[5]===true)batch.performance.correct++;(catsByQ[String(item[2])]||[]).forEach(function(cat){var x=batch.performance.categories[cat.key]||(batch.performance.categories[cat.key]={key:cat.key,label:cat.label,domain:cat.domain,parent_category_id:cat.parent_category_id,correct:0,total:0,elapsed_sum:0,elapsed_sample:0});x.total++;if(item[5]===true)x.correct++;if(Number(item[7])>0){x.elapsed_sum+=Number(item[7]);x.elapsed_sample++;}});}}for(var d=1;d<dr.length;d++){var aid=itemAttempt[String(dr[d][0])],batch2=aid&&attemptBatch[aid],st=aid&&attemptStudent[aid];if(!batch2||!st)continue;batch2.performance.subject_sample++;batch2.performance.main_verb_sample++;st.subject_sample=(st.subject_sample||0)+1;st.main_verb_sample=(st.main_verb_sample||0)+1;if(dr[d][5]===true)batch2.performance.subject_correct++;if(dr[d][6]===true)batch2.performance.main_verb_correct++;}Object.keys(batches).forEach(function(id){var p=batches[id].performance;p.accuracy=p.total?Math.round(p.correct/p.total*100):null;p.subject_accuracy=p.subject_sample?Math.round(p.subject_correct/p.subject_sample*100):null;p.main_verb_accuracy=p.main_verb_sample?Math.round(p.main_verb_correct/p.main_verb_sample*100):null;p.categories=Object.keys(p.categories).map(function(k){var x=p.categories[k];return{key:x.key,label:x.label,domain:x.domain,parent_category_id:x.parent_category_id,correct:x.correct,total:x.total,accuracy:x.total?Math.round(x.correct/x.total*100):null,average_elapsed_ms:x.elapsed_sample?Math.round(x.elapsed_sum/x.elapsed_sample):null,elapsed_sample_size:x.elapsed_sample};});});return base;}
function handleGetTeacherDashboardH_(e){
  var started=Date.now();
  dashboardSheetReadCacheV2_={values:{},reads:{},hits:{}};
  try{
    var base=handleGetTeacherDashboardG01_(e),afterBase=Date.now();
    if(base&&base.error)return base;
    var result=String(e.parameter.summary||'')==='1'?base:attachBatchPerformanceG01_(base),afterPerformance=Date.now(),readCount=Object.keys(dashboardSheetReadCacheV2_.reads).length;
    console.log('[ELAB-PERF] dashboard optimized '+JSON.stringify({
      base_and_latest_batch_ms:afterBase-started,
      batch_performance_ms:afterPerformance-afterBase,
      aggregation_and_json_ms:afterPerformance-started-Object.keys(dashboardSheetReadCacheV2_.reads).reduce(function(total,key){return total+dashboardSheetReadCacheV2_.reads[key].elapsed_ms;},0),
      total_ms:afterPerformance-started,
      sheet_read_count:readCount,
      avoided_duplicate_reads:Object.keys(dashboardSheetReadCacheV2_.hits).reduce(function(total,key){return total+dashboardSheetReadCacheV2_.hits[key];},0),
      reads:dashboardSheetReadCacheV2_.reads,
      response_bytes:JSON.stringify(result).length
    }));
    return result;
  }finally{
    dashboardSheetReadCacheV2_=null;
  }
}
function handleGetTeacherDashboardSafe_(e){
  var traceId=String(e.parameter.trace_id||'');resultTraceLog_(traceId,'DASHBOARD route entry',{token_present:!!e.parameter.token});
  try{var result=handleGetTeacherDashboardH_(e);resultTraceLog_(traceId,'DASHBOARD response',{error:result&&result.error||'',student_count:Array.isArray(result&&result.students)?result.students.length:null,has_summary:!!(result&&result.summary)});return result;}
  catch(error){
    var message=String(error&&error.message||error||'unknown dashboard error'),stack=String(error&&error.stack||'');
    console.error('getTeacherDashboardV2 failed',message,stack);
    resultTraceLog_(traceId,'DASHBOARD_SERVER_ERROR',{message:message,stack:stack});
    return{error:'dashboard exception',message:message,location:(stack.split('\n')[1]||'').trim()};
  }
}

// 운영 데이터의 Sheet별 읽기 비용을 결과 계산과 분리해 측정하는 read-only 진단.
// dashboard 최적화 전 병목 확인용이며 데이터나 캐시를 변경하지 않는다.
function handleMeasureTeacherDashboardReads_(e){
  if(!e.parameter.token||e.parameter.token!==getToken_())return{error:'no token'};
  var specs=[
    [STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS],[GROUPS_V2_SHEET,GROUPS_V2_HEADERS],[GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS],
    [HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS],[HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS],
    [ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS],[ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS],
    [ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS],[QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS],
    [SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS],[WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS],
    [REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS],[CATEGORIES_V2_SHEET,CATEGORIES_V2_HEADERS],
    [QUESTION_CATEGORIES_V2_SHEET,QUESTION_CATEGORIES_V2_HEADERS],[WORDS_V2_SHEET,WORDS_V2_HEADERS]
  ],started=Date.now(),reads=[];
  specs.forEach(function(spec){
    var readStarted=Date.now(),values=getOrCreateSheet_(spec[0],spec[1]).getDataRange().getValues();
    reads.push({sheet:spec[0],elapsed_ms:Date.now()-readStarted,rows:Math.max(0,values.length-1),columns:values.length?values[0].length:0});
  });
  var result={ok:true,total_ms:Date.now()-started,read_count:reads.length,reads:reads};
  console.log('[ELAB-PERF] dashboard sheet reads '+JSON.stringify(result));
  return result;
}
function rebuildReviewItemsV2FromAttempts(){
  setupReviewItemsV2_();var attempts=getOrCreateSheet_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS).getDataRange().getValues(),byAttempt={},qRows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),wRows=getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),dRows=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues(),detailByItem={},processed=0;
  for(var a=1;a<attempts.length;a++)byAttempt[String(attempts[a][0])]=attempts[a];for(var d=1;d<dRows.length;d++)detailByItem[String(dRows[d][0])]=dRows[d];
  for(var q=1;q<qRows.length;q++){var qr=qRows[q],attempt=byAttempt[String(qr[1])];if(!attempt||String(qr[6])==='PENDING')continue;var detail=detailByItem[String(qr[0])];if(detail){syncSentenceReviewV2_(attempt,qr,boolValue_(detail[5],false),boolValue_(detail[6],false));processed++;continue;}var correct=boolValue_(qr[5],false),count=Math.max(1,Number(qr[8])||1),wrong=correct?(boolValue_(qr[9],false)?Math.max(1,count-1):0):count;recordReviewOutcomeV2_(attempt,'QUESTION',qr[2],'',correct,qr[0],'backfill',wrong);processed++;}
  for(var w=1;w<wRows.length;w++){var wr=wRows[w],wa=byAttempt[String(wr[1])];if(!wa)continue;recordReviewOutcomeV2_(wa,'WORD',wr[2],'',boolValue_(wr[5],false),wr[0],'backfill',Math.max(0,Number(wr[4])||0));processed++;}
  return {ok:true,processed:processed,review_items:Math.max(0,getOrCreateSheet_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS).getLastRow()-1)};
}
function handleGetAttemptDetailV2_(e){var attempt=attemptByIdV2_(e.parameter.attempt_id),studentAllowed=attempt&&verifyStudentCapability_(e.parameter.attemptCapability,'submitAttemptQuestionV2','assignmentTarget',attempt[1],{student_id:String(e.parameter.student_id||'')})&&String(attempt[2])===String(e.parameter.student_id||''),teacherAllowed=e.parameter.token===getToken_()&&attempt&&String(attempt[3])===getOrCreateDefaultTeacher_();if(!attempt||(!studentAllowed&&!teacherAllowed))return {error:'forbidden'};var qRows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),wRows=getOrCreateSheet_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),dRows=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues(),detailByItem={};for(var d=1;d<dRows.length;d++)detailByItem[String(dRows[d][0])]={student_subject:parseJsonValue_(dRows[d][1],[]),student_main_verb:parseJsonValue_(dRows[d][2],[]),correct_subject:parseJsonValue_(dRows[d][3],[]),correct_main_verb:parseJsonValue_(dRows[d][4],[]),subject_correct:dRows[d][5],main_verb_correct:dRows[d][6]};var questions=[],words=[];for(var q=1;q<qRows.length;q++)if(String(qRows[q][1])===String(attempt[0]))questions.push({attempt_item_id:qRows[q][0],question_id:qRows[q][2],sequence:qRows[q][3],answer:parseJsonValue_(qRows[q][4],null),is_correct:qRows[q][5],grading_status:qRows[q][6],elapsed_ms:qRows[q][7],attempt_count:qRows[q][8],first_wrong:qRows[q][9],sentence_structure:detailByItem[String(qRows[q][0])]||null});for(var w=1;w<wRows.length;w++)if(String(wRows[w][1])===String(attempt[0]))words.push({word_attempt_item_id:wRows[w][0],word_id:wRows[w][2],first_correct:wRows[w][3],wrong_count:wRows[w][4],final_correct:wRows[w][5]});return {attempt:attemptPublicV2_(attempt),question_items:questions,word_items:words};}

function setupAssignment0DTestData() {
  setupAssignmentsV2_(); var props=PropertiesService.getScriptProperties(), teacherId=getOrCreateDefaultTeacher_(), names=['김테스트1','김테스트2','박테스트'], pins=['9001','9002','9003'], ids=[];
  for(var i=0;i<names.length;i++){var saved=handleSaveStudent_({name:names[i],pin:pins[i],grade:'고1',active:true,request_id:'0D-TEST-STUDENT-'+(i+1)}).getContent();ids.push(saved.indexOf('ok:')===0?saved.split(':')[1]:props.getProperty('ASSIGNMENT_0D_TEST_STUDENT_'+i)||'');props.setProperty('ASSIGNMENT_0D_TEST_STUDENT_'+i,ids[i]);}
  var groupId=props.getProperty('ASSIGNMENT_0D_TEST_GROUP')||Utilities.getUuid();props.setProperty('ASSIGNMENT_0D_TEST_GROUP',groupId);handleSaveGroupV2_({group_id:groupId,name:'고1 테스트반',active:true});handleSetGroupMembersV2_({group_id:groupId,student_ids:ids});
if(props.getProperty('ASSIGNMENT_0D_TEST_ASSIGNED')!=='true'){var link='http://127.0.0.1:8765/exam/index.html?session=DEV-0C-SMOKE&hook='+encodeURIComponent(ScriptApp.getService().getUrl());handleCreateAssignmentV2_({group_ids:[groupId],content_type:'READING',content_ref_id:'DEV-0C-SMOKE',title:'[DEV TEST] 오늘 마감 독해',content_link:link,due_at:new Date(Date.now()+3600000).toISOString()});handleCreateAssignmentV2_({student_ids:[ids[0]],content_type:'READING',content_ref_id:'DEV-0C-SMOKE',title:'[DEV TEST] 기한초과 독해',content_link:link,due_at:new Date(Date.now()-3600000).toISOString()});props.setProperty('ASSIGNMENT_0D_TEST_ASSIGNED','true');}
  var result={ok:ids.every(Boolean),students:names.map(function(n,j){return{name:n,pin:pins[j],student_id:ids[j]};}),group_id:groupId};console.log(JSON.stringify(result));return result;
}

function setupAssignment0DFinishTestData() {
  setup();var now=new Date(),teacherId=getOrCreateDefaultTeacher_();
  var vocabId='00000000-0000-4000-8000-0000000000df';
  var vocabTestPayload={v:1,s:'DEV0DFVOCAB1',n:'[DEV TEST] 수능기본 Day 12',sn:'',mode:'mc',sec:1,goal:0,exp:0,dm:'hook',dv:ScriptApp.getService().getUrl(),rng:'수능기본 › Day 12',cnt:'4개(전체)',w:[{e:'learn',k:'배우다'},{e:'study',k:'공부하다'},{e:'read',k:'읽다'},{e:'write',k:'쓰다'}],g:'1l2lu6w'};
  var vocabTestLink='http://127.0.0.1:8765/vocab/index.html?session=DEV0DFVOCAB1&d='+base64UrlEncode_(JSON.stringify(vocabTestPayload));
  upsertRow_(getOrCreateSheet_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS),vocabId,[vocabId,teacherId,'DEV0DFVOCAB1','[DEV TEST] 수능기본 Day 12','수능기본/Day 12',vocabTestLink,true,now,now]);
  upsertRow_(getOrCreateSheet_(GRAMMAR_SHEET,GRAMMAR_HEADERS),'DEV-0DF-GRAMMAR',['DEV-0DF-GRAMMAR','relative_clause','[DEV TEST] 관계사절 연습',JSON.stringify([{text:'The book that I borrowed was interesting.',tags:{},matches:[]}]),now,'']);
  upsertRow_(getOrCreateSheet_(GRAMMAR_FINALS_SHEET,GRAMMAR_FINALS_HEADERS),'DEV-0DF-GRAMMAR-FINAL',['DEV-0DF-GRAMMAR-FINAL','[DEV TEST] 문법 최종 문제',JSON.stringify([{srcLabel:'개발 테스트 1번',text:'The book that I borrowed was interesting.',phrase:'that I borrowed',options:['관계사절','부사절','명사절','분사구문'],correctIdx:0}]),now,'']);
  upsertRow_(getOrCreateSheet_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS),'DEV-0DF-SENTENCE',['DEV-0DF-SENTENCE','[DEV TEST] 문장구조 연습',JSON.stringify([{id:'dev-sentence-1',text:'Consistent practice helps students improve their English.'}]),now]);
  upsertRow_(getOrCreateSheet_(PRACTICE_SHEET,PRACTICE_HEADERS),'DEV-0DF-PRACTICE',['DEV-0DF-PRACTICE','[DEV TEST] 실전 모의고사','1번',JSON.stringify(['https://dummyimage.com/1000x1400/ffffff/111827.png&text=DEV+PRACTICE+EXAM']),JSON.stringify([1]),JSON.stringify([1]),now,0]);
  var result={ok:true,vocab_set_id:vocabId,grammar_practice:'DEV-0DF-GRAMMAR',grammar_final:'DEV-0DF-GRAMMAR-FINAL',sentence:'DEV-0DF-SENTENCE',practice:'DEV-0DF-PRACTICE'};console.log(JSON.stringify(result));return result;
}

function setupPhase0ETestData() {
  setup();var props=PropertiesService.getScriptProperties(),now=new Date(),studentId=props.getProperty('PHASE_0E_TEST_STUDENT_ID')||'',pin='9050',name='0E 테스트학생';
  if(!studentId){var saved=handleSaveStudent_({name:name,pin:pin,grade:'고1',active:true,request_id:'PHASE-0E-STUDENT'}).getContent();if(saved.indexOf('ok:')!==0)throw new Error(saved);studentId=saved.split(':')[1];props.setProperty('PHASE_0E_TEST_STUDENT_ID',studentId);}
  var readingQuestions=[{question_id:'00000000-0000-4000-8000-0000000000e1',content_type:'READING',answer_type:'MULTIPLE_CHOICE',promptKo:'글의 요지는?',text:'Practice makes progress.',choices:['꾸준한 연습은 발전을 만든다.','잠은 필요 없다.','시험은 의미 없다.','책은 무겁다.','시간은 멈춘다.'],answer:1,source_question_no:1,category_keys:['READING_GIST']},{question_id:'00000000-0000-4000-8000-0000000000e2',content_type:'READING',answer_type:'MULTIPLE_CHOICE',promptKo:'글의 주제는?',text:'Reading daily builds vocabulary.',choices:['운동','매일 읽기의 효과','요리','여행','음악'],answer:2,source_question_no:2,category_keys:['READING_TOPIC']}];
  handleSaveExam_({examKey:'DEV-0E-READING',title:'[0E] 독해 2문항',range:'1~2번',contentType:'text',questionCount:2,questionNums:[1,2],answers:[1,2],questions:readingQuestions});
  handleSaveGrammarFinal_({setKey:'DEV-0E-GRAMMAR',label:'[0E] 문법 객관식',questions:[{question_id:'00000000-0000-4000-8000-0000000000e3',srcLabel:'0E 1번',text:'The book that I borrowed was useful.',phrase:'that I borrowed',options:['관계사절','부사절','분사구문','명사절'],correctIdx:0,category_keys:['GRAMMAR_RELATIVE_CLAUSE']},{question_id:'00000000-0000-4000-8000-0000000000e4',srcLabel:'0E 2번',text:'The window was broken by Tom.',phrase:'was broken',options:['능동태','수동태','가정법','도치'],correctIdx:1,category_keys:['GRAMMAR_PASSIVE_VOICE']}]});
  handleSaveSentenceSet_({setKey:'DEV-0E-SENTENCE',label:'[0E] 주어·본동사',passages:[{question_id:'00000000-0000-4000-8000-0000000000e5',id:'0e-sentence-1',num:1,text:'Consistent practice helps students improve.',correct_sv:['subj','subj','verb',null,null]}]});
  handleSavePractice_({practiceKey:'DEV-0E-PRACTICE',title:'[0E] 실전 모의고사',range:'1~2번',pageImageKeys:[],answers:[1,2],questionNums:[1,2],questions:[{question_id:'00000000-0000-4000-8000-0000000000e6',text:'0E practice question 1',choices:['1','2','3','4','5'],answer:1,source_question_no:1},{question_id:'00000000-0000-4000-8000-0000000000e7',text:'0E practice question 2',choices:['1','2','3','4','5'],answer:2,source_question_no:2}]});
  if(props.getProperty('PHASE_0E_ASSIGNMENTS_CREATED')!=='true'){var base='http://127.0.0.1:8765/',hook=ScriptApp.getService().getUrl(),vocabId='00000000-0000-4000-8000-0000000000df',vocab=findVocabSetV2_(vocabId);[
    ['VOCAB','',vocabId,'[0E] 단어 반복시험',vocab&&vocab[5]],['READING','','DEV-0E-READING','[0E] 독해',base+'exam/index.html?session=DEV-0E-READING&hook='+encodeURIComponent(hook)],['GRAMMAR','FINAL_QUIZ','DEV-0E-GRAMMAR','[0E] 문법',base+'grammar/index.html?finalQuiz=DEV-0E-GRAMMAR&hook='+encodeURIComponent(hook)],['SENTENCE_STRUCTURE','','DEV-0E-SENTENCE','[0E] 문장구조',base+'exam/index.html?study=DEV-0E-SENTENCE&hook='+encodeURIComponent(hook)],['PRACTICE_EXAM','','DEV-0E-PRACTICE','[0E] 실전 모의고사',base+'practice/index.html?session=DEV-0E-PRACTICE&hook='+encodeURIComponent(hook)]
  ].forEach(function(x){handleCreateAssignmentV2_({student_ids:[studentId],content_type:x[0],content_subtype:x[1],content_ref_id:x[2],title:x[3],content_link:x[4]});});props.setProperty('PHASE_0E_ASSIGNMENTS_CREATED','true');}
  var assignments=handleListMyAssignmentsV2_({parameter:{student_id:studentId,assignmentCapability:studentAssignmentLoginFields_(studentId).assignmentCapability}}).assignments.filter(function(a){return String(a.title).indexOf('[0E]')===0;});var result={ok:assignments.length===5,student_id:studentId,name:name,pin:pin,assignments:assignments.map(function(a){return{content_type:a.content_type,assignment_id:a.assignment_id,assignment_target_id:a.assignment_target_id,content_ref_id:a.content_ref_id};})};console.log(JSON.stringify(result));return result;
}

function authorizeStudentPost_(d) {
  var resource = studentPostResource_(d);
  if (!resource || !resource.key) return false;
  if (getStudentAuthMode_() === 'legacy_student_token') {
    return timingSafeEqual_(d.studentSubmitToken, getOrCreateStudentSecret_('LEGACY_STUDENT_SUBMIT_TOKEN'));
  }
  return verifyStudentCapability_(d.studentCapability, d.action, resource.type, resource.key, resource.scope);
}

function resultCacheKey_(kind, contentKey, resultKey) {
  var raw = [kind, contentKey, resultKey].join('|');
  return 'student-result-' + base64UrlEncode_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8));
}

function cacheStudentResult_(kind, contentKey, resultKey, result) {
  if (!resultKey) return;
  CacheService.getScriptCache().put(resultCacheKey_(kind, contentKey, resultKey), JSON.stringify(result), 600);
}

function readCachedStudentResult_(kind, contentKey, resultKey) {
  if (!resultKey) return null;
  var raw = CacheService.getScriptCache().get(resultCacheKey_(kind, contentKey, resultKey));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function getOrCreateImagesFolder_() {
  var it = DriveApp.getFoldersByName(IMAGES_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(IMAGES_FOLDER_NAME);
}

// Apps Script 편집기에서 한 번 직접 실행해 Drive/Sheets 저장 권한을 승인하고 확인한다.
function authorizePracticeStorage() {
  var folder = getOrCreateImagesFolder_();
  var sheet = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  SpreadsheetApp.flush();
  return { ok: true, folderId: folder.getId(), sheetName: sheet.getName() };
}

// key 값(첫 번째 열)으로 행을 찾아 인덱스(1-base, 시트 row 번호) 반환. 없으면 -1.
function findRowByKey_(sheet, keyValue) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(keyValue)) return i + 1;
  }
  return -1;
}

function upsertRow_(sheet, keyValue, rowValues) {
  var rowIdx = findRowByKey_(sheet, keyValue);
  if (rowIdx === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
  }
}

function findStudentV2Row_(studentId) {
  return findRowByKey_(getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS), studentId);
}

function studentV2ById_(studentId) {
  if (!studentId) return null;
  var sh = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS);
  var rowIdx = findRowByKey_(sh, studentId);
  if (rowIdx === -1) return null;
  return sh.getRange(rowIdx, 1, 1, STUDENTS_V2_HEADERS.length).getValues()[0];
}

function legacyStudentRowById_(studentId) {
  var sh = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var idCol = STUDENTS_HEADERS.indexOf('student_id');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || '') === String(studentId || '')) return i + 1;
  }
  return -1;
}

function appendLegacyStudentMap_(legacyName, studentId, status, note) {
  var sh = getOrCreateSheet_(LEGACY_STUDENT_MAP_SHEET, LEGACY_STUDENT_MAP_HEADERS);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === STUDENTS_SHEET &&
        String(values[i][1]) === String(legacyName || '') &&
        String(values[i][2]) === String(studentId || '')) return;
  }
  sh.appendRow([STUDENTS_SHEET, legacyName || '', studentId || '', status, new Date(), note || '']);
}

function migrateLegacyStudentsV2_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensure0BBackup_();
    var teacherId = setupStudentIdentityV2_();
    var legacy = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
    var studentsV2 = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS);
    var values = legacy.getDataRange().getValues();
    var nameCounts = {};
    for (var i = 1; i < values.length; i++) {
      var countName = String(values[i][0] || '').trim();
      if (countName) nameCounts[countName] = (nameCounts[countName] || 0) + 1;
    }
    var stats = { total: Math.max(values.length - 1, 0), autoMatched: 0, reviewRequired: 0, unresolved: 0 };
    for (var row = 1; row < values.length; row++) {
      var legacyName = String(values[row][0] || '').trim();
      var studentId = String(values[row][3] || '').trim();
      if (!legacyName) {
        stats.unresolved++;
        appendLegacyStudentMap_('', studentId, 'UNRESOLVED', 'Students row ' + (row + 1) + ': empty name');
        continue;
      }
      try {
        if (!studentId) {
          studentId = Utilities.getUuid();
          legacy.getRange(row + 1, 4).setValue(studentId);
        }
        if (findRowByKey_(studentsV2, studentId) === -1) {
          var createdAt = values[row][2] || new Date();
          studentsV2.appendRow([studentId, teacherId, legacyName, '', true, createdAt, new Date()]);
        }
        var duplicate = nameCounts[legacyName] > 1;
        appendLegacyStudentMap_(legacyName, studentId, duplicate ? 'REVIEW_REQUIRED' : 'AUTO_MATCHED',
          duplicate ? '동일 legacy_name 행이 여러 개이므로 과거 결과는 자동 연결하지 않음' : 'Students의 유일한 이름 행');
        if (duplicate) stats.reviewRequired++; else stats.autoMatched++;
      } catch (err) {
        stats.unresolved++;
        appendMigrationError_('0B_BACKFILL', STUDENTS_SHEET, 'row:' + (row + 1), err);
        appendLegacyStudentMap_(legacyName, studentId, 'UNRESOLVED', 'migration error; see MigrationErrors');
      }
    }
    return stats;
  } finally {
    lock.releaseLock();
  }
}

function studentWriteByRequest_(requestId) {
  if (!requestId) return null;
  var sh = getOrCreateSheet_(STUDENT_WRITES_V2_SHEET, STUDENT_WRITES_V2_HEADERS);
  var rowIdx = findRowByKey_(sh, requestId);
  if (rowIdx === -1) return null;
  return sh.getRange(rowIdx, 1, 1, STUDENT_WRITES_V2_HEADERS.length).getValues()[0];
}

function logStudentWrite_(requestId, action, studentId, status, note) {
  getOrCreateSheet_(STUDENT_WRITES_V2_SHEET, STUDENT_WRITES_V2_HEADERS).appendRow([
    requestId, action, studentId, status, new Date(), note || ''
  ]);
}

function textOut_(body) {
  return ContentService.createTextOutput(body);
}

function resultTraceLog_(traceId, step, detail) {
  var prefix='[ELAB-RESULT][trace='+String(traceId||'missing')+'] '+step;
  if(detail===undefined||detail===null||detail==='')console.log(prefix);
  else console.log(prefix+' '+(typeof detail==='string'?detail:JSON.stringify(detail)));
}

function jsonpOut_(callback, obj) {
  var body = (callback || 'callback') + '(' + JSON.stringify(obj) + ')';
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// "18,19,30" 같은 콤마문자열 또는 배열을 정수 배열로
function parseNumList_(v) {
  if (!v) return [];
  var arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map(function (x) { return parseInt(x, 10); }).filter(function (n) { return !isNaN(n); });
}

// fullNums(그 시험의 전체 문항번호, 순서대로) + fullValues(imageUrls 또는 answers, 같은 순서) 중에서
// requestedNums 순서대로 골라낸 부분집합을 반환(못 찾은 번호는 건너뜀)
function filterBySelectedNums_(fullNums, fullValues, requestedNums) {
  if (!requestedNums || requestedNums.length === 0) return fullValues;
  var out = [];
  for (var i = 0; i < requestedNums.length; i++) {
    var idx = fullNums.indexOf(requestedNums[i]);
    if (idx !== -1) out.push(fullValues[idx]);
  }
  return out;
}

/* ============================= doPost ============================= */
// 전부 POST + no-cors로 호출됨(클라이언트는 응답을 못 읽음) → 결과는 doGet의 조회 액션으로 재확인.
function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return textOut_('bad json');
  }
  var isVocabularyFirstImport = /^(stage|validate|commit|rollback|discard|repair|repairApostrophe)VocabularyFirstImportV1$/.test(d.action || '');
  // Do not log arbitrary caller-supplied trace_id on these administrative write actions.
  var isVocabularyIncremental = /^(create|update)VocabularyDbItemV1$/.test(d.action || '');
  if (!isVocabularyFirstImport && !isVocabularyIncremental) resultTraceLog_(d.trace_id,'STEP_A doPost entry',{action:d.action||''});

  if (d.action === 'redeemInviteCode') return textOut_(JSON.stringify(redeemTeacherInvite_(d.inviteCode)));
  if (d.action === 'validateTeacherCredential') return textOut_(JSON.stringify(validateTeacherCredential_(d.credential, d.teacher_id)));

  var isStudentAction = STUDENT_POST_ACTIONS_.indexOf(d.action) !== -1;
  if (isStudentAction) {
    var studentAuthorized=authorizeStudentPost_(d);
    resultTraceLog_(d.trace_id,'STEP_C capability '+(studentAuthorized?'OK':'FAIL'),{action:d.action||''});
    if (!studentAuthorized) return textOut_('no student capability');
  } else if (d.token !== getToken_()) {
    return textOut_('no'); // 교사용 action은 교사용 TOKEN만 허용
  }

  if (d.action === 'uploadImage') return handleUploadImage_(d);
  if (d.action === 'saveExam') return handleSaveExam_(d);
  if (d.action === 'updateAnswers') return handleUpdateAnswers_(d);
  if (d.action === 'submitResult') return handleSubmitResult_(d);
  if (d.action === 'saveStudent') return handleSaveStudent_(d);
  if (d.action === 'deleteStudent') return handleDeleteStudent_(d);
  if (d.action === 'migrateStudentsV2') return handleMigrateStudentsV2_();
  if (d.action === 'saveAssignment') return handleSaveAssignment_(d);
  if (d.action === 'saveGroupV2') return handleSaveGroupV2_(d);
  if (d.action === 'setGroupMembersV2') return handleSetGroupMembersV2_(d);
  if (d.action === 'createAssignmentV2') return handleCreateAssignmentV2_(d);
  if (d.action === 'createAssignmentsBatchV2') return handleCreateAssignmentsBatchV2_(d);
  if (d.action === 'postponeVocabReviewV1') return handlePostponeVocabReviewV1_(d);
  if (d.action === 'assignVocabReviewV1') return handleAssignVocabReviewV1_(d);
  if (isVocabularyFirstImport) return textOut_(JSON.stringify(handleVocabularyFirstImportV1_(d)));
  if (isVocabularyIncremental) return textOut_(JSON.stringify(handleVocabularyDbMutationV1_(d)));
  if (d.action === 'stageVocabularyImportV1') return handleStageVocabularyImportV1_(d);
  if (d.action === 'previewVocabularyImportV1') return handlePreviewVocabularyImportV1_(d);
  if (d.action === 'commitVocabularyImportV1') return handleCommitVocabularyImportV1_(d);
  if (d.action === 'updateVocabularySenseV1') return handleUpdateVocabularySenseV1_(d);
  if (d.action === 'createVocabularySetV1') return handleCreateVocabularySetV1_(d);
  if (d.action === 'upgradeVocabularySetSchemasV1') return textOut_(JSON.stringify(handleUpgradeVocabularySetSchemasV1_(d)));
  if (d.action === 'saveVocabSetV2') return handleSaveVocabSetV2_(d);
  if (d.action === 'updateAssignmentV2') return handleUpdateAssignmentV2_(d);
  if (d.action === 'updateSentenceStructureAssignmentV1') return handleUpdateSentenceStructureAssignmentV1_(d);
  if (d.action === 'deleteAssignmentV2') return handleDeleteAssignmentV2_(d);
  if (d.action === 'cancelAssignmentTargetV2') return handleCancelAssignmentTargetV2_(d);
  if (d.action === 'updateAssignmentStatus') return handleUpdateAssignmentStatus_(d);
  if (d.action === 'startAttemptV2') return handleStartAttemptV2_(d);
  if (d.action === 'submitAttemptQuestionV2') return handleSubmitAttemptQuestionV2_(d);
  if (d.action === 'completeGrammarActivityV1') return handleCompleteGrammarActivityV1_(d);
  if (d.action === 'allowRetryAttemptV2') return handleAllowRetryAttemptV2_(d);
  if (d.action === 'saveGrammarSet') return handleSaveGrammarSet_(d);
  if (d.action === 'saveGrammarVideo') return handleSaveGrammarVideo_(d);
  if (d.action === 'submitGrammarPractice') return handleSubmitGrammarPractice_(d);
  if (d.action === 'saveGrammarFinal') return handleSaveGrammarFinal_(d);
  if (d.action === 'renameGrammarFinal') return handleRenameGrammarFinal_(d);
  if (d.action === 'moveGrammarFinal') return handleMoveGrammarFinal_(d);
  if (d.action === 'deleteGrammarFinal') return handleDeleteGrammarFinal_(d);
  if (d.action === 'createGrammarFinalFolder') return handleCreateGrammarFinalFolder_(d);
  if (d.action === 'renameGrammarFinalFolder') return handleRenameGrammarFinalFolder_(d);
  if (d.action === 'moveGrammarFinalFolder') return handleMoveGrammarFinalFolder_(d);
  if (d.action === 'deleteGrammarFinalFolder') return handleDeleteGrammarFinalFolder_(d);
  if (d.action === 'submitGrammarFinalResult') return handleSubmitGrammarFinalResult_(d);
  if (d.action === 'submitVocabResult') {
    resultTraceLog_(d.trace_id,'STEP_B submitVocabResult route entry');
    try{return handleSubmitVocabResult_(d);}catch(vocabSubmitError){resultTraceLog_(d.trace_id,'SUBMIT ERROR',{message:String(vocabSubmitError&&vocabSubmitError.message||vocabSubmitError),stack:String(vocabSubmitError&&vocabSubmitError.stack||'')});throw vocabSubmitError;}
  }
  if (d.action === 'savePractice') return handleSavePractice_(d);
  if (d.action === 'submitPracticeResult') return handleSubmitPracticeResult_(d);
  if (d.action === 'saveSentenceSet') return handleSaveSentenceSet_(d);
  if (d.action === 'submitSentenceHomework') return handleSubmitSentenceHomework_(d);

  return textOut_('unknown action');
}

// {action:'uploadImage', token, imageKey, dataUrl}
// dataUrl: "data:image/jpeg;base64,...."
function handleUploadImage_(d) {
  var m = /^data:(image\/\w+);base64,(.*)$/.exec(d.dataUrl || '');
  if (!m) return textOut_('bad dataUrl');
  var mime = m[1];
  var base64 = m[2];
  var ext = mime === 'image/png' ? 'png' : 'jpg';
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // 재시도나 같은 검수 완료 PDF 재사용 시 Drive 파일을 중복 생성하지 않는다.
    var sh = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
    var existingRow = findRowByKey_(sh, d.imageKey);
    if (existingRow !== -1) return textOut_('ok');

    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mime, d.imageKey + '.' + ext);
    var folder = getOrCreateImagesFolder_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
    sh.appendRow([d.imageKey, url, new Date()]);
    SpreadsheetApp.flush();
    return textOut_('ok');
  } finally {
    lock.releaseLock();
  }
}

// {action:'saveExam', token, examKey, title, range, questionCount, answers:[1,3,...], imageKeys:[...], questionNums:[18,19,...], expiresAt}
function handleSaveExam_(d) {
  setupQuestionMetadataV2_();
  var imgSheet = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  var imgValues = imgSheet.getDataRange().getValues();
  var urlByKey = {};
  for (var i = 1; i < imgValues.length; i++) {
    urlByKey[String(imgValues[i][0])] = imgValues[i][1];
  }

  var imageUrls = (d.imageKeys || []).map(function (k) {
    return urlByKey[k] || '';
  });

  var questions = d.questions || [];
  var questionIds = [];
  var count = Math.max(Number(d.questionCount) || 0, questions.length, imageUrls.length);
  for (var q = 0; q < count; q++) {
    var item = questions[q] || { source_question_no: (d.questionNums || [])[q] || '', image: imageUrls[q] || '' };
    upsertQuestionV2_(item, { content_type: 'READING', answer_type: 'MULTIPLE_CHOICE', answer: (d.answers || [])[q], source_question_no: (d.questionNums || [])[q] || '' });
    questionIds.push(item.question_id);
  }

  var sh = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  upsertRow_(sh, d.examKey, [
    d.examKey,
    d.title || '',
    d.range || '',
    d.questionCount || imageUrls.length,
    JSON.stringify(d.answers || []),
    JSON.stringify(imageUrls),
    new Date(),
    d.expiresAt || 0,
    JSON.stringify(d.questionNums || []),
    d.contentType || '',
    JSON.stringify(questions),
    JSON.stringify(questionIds)
  ]);
  return textOut_('ok');
}

// {action:'updateAnswers', token, examKey, answers:[1,3,...]} -- 정답만 갱신(나머지 열은 그대로).
// 게시할 때 정답을 다 안 채웠거나(나중에 등록) 정답을 고쳐야 할 때 씀.
function handleUpdateAnswers_(d) {
  var sh = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.examKey);
  if (rowIdx === -1) return textOut_('exam not found');
  var answersCol = EXAMS_HEADERS.indexOf('answersJson') + 1; // 1-base 열 번호
  sh.getRange(rowIdx, answersCol).setValue(JSON.stringify(d.answers || []));
  return textOut_('ok');
}

// {action:'submitResult', token, examKey, name, answers:[...], times:[ms,...], nums:[30,31] (선택, 문항 일부만 배정된 경우)}
function handleSubmitResult_(d) {
  var sh = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.examKey);
  if (rowIdx === -1) return textOut_('exam not found');
  var row = sh.getRange(rowIdx, 1, 1, EXAMS_HEADERS.length).getValues()[0];
  var correctAnswers = [];
  try {
    correctAnswers = JSON.parse(row[4] || '[]'); // answersJson
  } catch (err) {}

  var requestedNums = parseNumList_(d.nums);
  if (requestedNums.length > 0) {
    var fullNums = [];
    try { fullNums = JSON.parse(row[8] || '[]'); } catch (err) {}
    correctAnswers = filterBySelectedNums_(fullNums, correctAnswers, requestedNums);
  }

  var studentAnswers = d.answers || [];
  var score = 0;
  for (var i = 0; i < correctAnswers.length; i++) {
    if (studentAnswers[i] != null && Number(studentAnswers[i]) === Number(correctAnswers[i])) score++;
  }

  var times = d.times || [];
  var totalTimeMs = times.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);

  var resultSheet = getOrCreateSheet_(RESULTS_SHEET, RESULTS_HEADERS);
  resultSheet.appendRow([
    new Date(),
    d.examKey,
    d.name || '',
    score,
    totalTimeMs,
    JSON.stringify(studentAnswers),
    JSON.stringify(times)
  ]);
  cacheStudentResult_('exam', d.examKey, d.resultKey, {
    found: true, name: d.name || '', score: score, total: correctAnswers.length,
    totalTimeMs: totalTimeMs, correctAnswers: correctAnswers, studentAnswers: studentAnswers
  });
  var attempt=attemptForLegacySubmissionV2_(d);
  if(attempt){var ids=parseJsonValue_(row[11],[]);if(requestedNums.length>0){var nums=parseJsonValue_(row[8],[]);ids=filterBySelectedNums_(nums,ids,requestedNums);}for(var qi=0;qi<ids.length;qi++)upsertQuestionAttemptItemV2_(attempt,{question_id:ids[qi],sequence:qi+1,answer:studentAnswers[qi],elapsed_ms:times[qi],finalize:true});completeAttemptV2_(attempt,score,null);}
  return textOut_('ok');
}

// {action:'saveStudent', token, name, pin, grade?, active?, student_id?, request_id?}
// 신규는 legacy Students 성공 후 StudentsV2를 기록한다. 기존 student_id가 있으면 같은 ID를
// 유지한 채 표시명/학년/활성 상태만 수정하고, 과거 결과 행의 name은 바꾸지 않는다.
function handleSaveStudent_(d) {
  if (!d.name) return textOut_('name required');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var newLegacyRow = -1;
  try {
    ensure0BBackup_();
    var teacherId = setupStudentIdentityV2_();
    var requestId = String(d.request_id || Utilities.getUuid());
    var previousWrite = studentWriteByRequest_(requestId);
    if (previousWrite && previousWrite[3] === 'COMPLETED') return textOut_('ok:' + previousWrite[2]);

    var legacy = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
    var studentsV2 = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS);
    var now = new Date();
    var studentId = String(d.student_id || '').trim();
    if (studentId) {
      var v2Row = findRowByKey_(studentsV2, studentId);
      var legacyRow = legacyStudentRowById_(studentId);
      if (v2Row === -1 || legacyRow === -1) return textOut_('student not found');
      var oldV2 = studentsV2.getRange(v2Row, 1, 1, STUDENTS_V2_HEADERS.length).getValues()[0];
      if (String(oldV2[1]) !== String(teacherId)) return textOut_('student not found');
      var oldLegacy = legacy.getRange(legacyRow, 1, 1, STUDENTS_HEADERS.length).getValues()[0];
      var oldName = String(oldLegacy[0] || '');
      var oldNameCount = legacy.getDataRange().getValues().filter(function (legacyRowValue, idx) {
        return idx > 0 && String(legacyRowValue[0] || '') === oldName;
      }).length;
      var active = boolValue_(d.active, boolValue_(oldV2[4], true));
      legacy.getRange(legacyRow, 1, 1, STUDENTS_HEADERS.length).setValues([[
        d.name, Object.prototype.hasOwnProperty.call(d, 'pin') ? d.pin : oldLegacy[1], oldLegacy[2], studentId
      ]]);
      studentsV2.getRange(v2Row, 1, 1, STUDENTS_V2_HEADERS.length).setValues([[
        studentId, teacherId, d.name, Object.prototype.hasOwnProperty.call(d, 'grade') ? d.grade : oldV2[3],
        active, oldV2[5], now,
        Object.prototype.hasOwnProperty.call(d, 'school') ? d.school : (oldV2[7] || ''),
        Object.prototype.hasOwnProperty.call(d, 'contact') ? d.contact : (oldV2[8] || ''),
        Object.prototype.hasOwnProperty.call(d, 'email') ? d.email : (oldV2[9] || ''),
        Object.prototype.hasOwnProperty.call(d, 'enrollment_start_date') ? d.enrollment_start_date : (oldV2[10] || ''),
        Object.prototype.hasOwnProperty.call(d, 'lesson_days') ? d.lesson_days : (oldV2[11] || ''),
        Object.prototype.hasOwnProperty.call(d, 'lesson_time') ? d.lesson_time : (oldV2[12] || ''),
        Object.prototype.hasOwnProperty.call(d, 'lesson_memo') ? d.lesson_memo : (oldV2[13] || '')
      ]]);
      if (oldName !== String(d.name)) {
        var assignmentSheet = getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
        var assignmentRow = findRowByKey_(assignmentSheet, oldName);
        if (assignmentRow !== -1 && oldNameCount === 1) {
          assignmentSheet.getRange(assignmentRow, 1).setValue(d.name);
        } else if (assignmentRow !== -1) {
          appendMigrationError_('0B_RENAME_ASSIGNMENT', ASSIGNMENTS_SHEET, studentId,
            '동명이인 legacy assignment는 자동 이동하지 않음');
        }
      }
      appendLegacyStudentMap_(d.name, studentId, 'CONFIRMED', 'student_id 기반 수정');
      logStudentWrite_(requestId, 'UPDATE', studentId, 'COMPLETED', '');
      CacheService.getScriptCache().remove('teacher-student-list-v1');
      return textOut_('ok:' + studentId);
    }

    studentId = Utilities.getUuid();
    legacy.appendRow([d.name, d.pin || '', now, studentId]);
    newLegacyRow = legacy.getLastRow();
    try {
      studentsV2.appendRow([studentId, teacherId, d.name, d.grade || '', boolValue_(d.active, true), now, now, d.school || '', d.contact || '', d.email || '', d.enrollment_start_date || '', d.lesson_days || '', d.lesson_time || '', d.lesson_memo || '']);
      var duplicateCount = legacy.getDataRange().getValues().filter(function (row, idx) {
        return idx > 0 && String(row[0] || '').trim() === String(d.name).trim();
      }).length;
      appendLegacyStudentMap_(d.name, studentId, duplicateCount > 1 ? 'REVIEW_REQUIRED' : 'CONFIRMED',
        duplicateCount > 1 ? '신규 동명이인: 별도 student_id로 생성, 과거 이름 결과는 자동 연결하지 않음' : '신규 dual-write');
      logStudentWrite_(requestId, 'CREATE', studentId, 'COMPLETED', '');
      CacheService.getScriptCache().remove('teacher-student-list-v1');
      return textOut_('ok:' + studentId);
    } catch (v2Err) {
      if (newLegacyRow === legacy.getLastRow()) legacy.deleteRow(newLegacyRow);
      appendMigrationError_('0B_DUAL_WRITE_CREATE', STUDENTS_SHEET, requestId, v2Err);
      return textOut_('v2 write failed');
    }
  } finally {
    lock.releaseLock();
  }
}

// {action:'deleteStudent', token, student_id}; 0B부터는 hard delete하지 않고 active=false만 기록한다.
function handleDeleteStudent_(d) {
  ensure0BBackup_();
  setupStudentIdentityV2_();
  var studentId = String(d.student_id || '').trim();
  if (!studentId && d.name) {
    var legacy = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS).getDataRange().getValues();
    var matches = legacy.filter(function (row, idx) {
      return idx > 0 && String(row[0] || '').trim() === String(d.name).trim() && row[3];
    });
    if (matches.length === 1) studentId = String(matches[0][3]);
  }
  if (!studentId) return textOut_('student_id required');
  var sh = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS);
  var rowIdx = findRowByKey_(sh, studentId);
  if (rowIdx === -1) return textOut_('student not found');
  var row = sh.getRange(rowIdx, 1, 1, STUDENTS_V2_HEADERS.length).getValues()[0];
  if (String(row[1]) !== String(getOrCreateDefaultTeacher_())) return textOut_('student not found');
  row[4] = false;
  row[6] = new Date();
  sh.getRange(rowIdx, 1, 1, STUDENTS_V2_HEADERS.length).setValues([row]);
  CacheService.getScriptCache().remove('teacher-student-list-v1');
  return textOut_('ok');
}

function handleMigrateStudentsV2_() {
  return textOut_(JSON.stringify(migrateLegacyStudentsV2_()));
}

// Apps Script 편집기에서 최초 1회 직접 실행하는 0B entry point.
function migrateStudentsV2() {
  var stats = migrateLegacyStudentsV2_();
  console.log(JSON.stringify(stats));
  return stats;
}

// 이름/PIN을 로그에 노출하지 않고 0B 운영 상태만 점검하는 read-only verifier.
function verifyStudentsV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var legacy = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS).getDataRange().getValues();
  var students = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS).getDataRange().getValues();
  var maps = getOrCreateSheet_(LEGACY_STUDENT_MAP_SHEET, LEGACY_STUDENT_MAP_HEADERS).getDataRange().getValues();
  var teacherId = getOrCreateDefaultTeacher_();
  var seen = {};
  var duplicateIds = 0;
  var missingIds = 0;
  for (var i = 1; i < legacy.length; i++) {
    var id = String(legacy[i][3] || '');
    if (!id) missingIds++;
    else if (seen[id]) duplicateIds++;
    else seen[id] = true;
  }
  var wrongTeacher = 0;
  for (var s = 1; s < students.length; s++) {
    if (String(students[s][1] || '') !== String(teacherId)) wrongTeacher++;
  }
  var statuses = { AUTO_MATCHED: 0, REVIEW_REQUIRED: 0, CONFIRMED: 0, UNRESOLVED: 0 };
  for (var m = 1; m < maps.length; m++) {
    var status = String(maps[m][3] || '');
    if (Object.prototype.hasOwnProperty.call(statuses, status)) statuses[status]++;
  }
  var backupCount = ss.getSheets().filter(function (sheet) {
    return sheet.getName().indexOf('0B_Backup_Students_') === 0;
  }).length;
  var resultCounts = {};
  [RESULTS_SHEET, VOCAB_RESULTS_SHEET, GRAMMAR_FINAL_RESULTS_SHEET, PRACTICE_RESULTS_SHEET, SENTENCE_SUBMISSIONS_SHEET]
    .forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      resultCounts[name] = sheet ? Math.max(sheet.getLastRow() - 1, 0) : null;
    });
  var summary = {
    legacyStudents: Math.max(legacy.length - 1, 0), studentsV2: Math.max(students.length - 1, 0),
    missingStudentIds: missingIds, duplicateStudentIds: duplicateIds, wrongTeacherLinks: wrongTeacher,
    mapStatuses: statuses, backupSheets: backupCount, resultRowCounts: resultCounts
  };
  console.log(JSON.stringify(summary));
  return summary;
}

// {action:'saveAssignment', token, name, vocabLabel?, vocabLink?, examLabel?, examLink?, grammarLabel?, grammarLink?,
//  finalQuizLabel?, finalQuizLink?}
// 전달 안 된 필드는 기존 값을 그대로 유지(부분 업데이트) — vocab 모듈의 자동배정(단어 필드만
// 보냄)과 teacher/students.html의 수동배정(보통 전체를 같이 보냄)이 서로 안 지우게 하기 위함.
function handleSaveAssignment_(d) {
  if (!d.name) return textOut_('name required');
  var sh = getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.name);
  var existing = rowIdx === -1 ? null : sh.getRange(rowIdx, 1, 1, ASSIGNMENTS_HEADERS.length).getValues()[0];
  function field(key, existingIdx) {
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key] || '';
    return existing ? existing[existingIdx] : '';
  }
  upsertRow_(sh, d.name, [
    d.name, new Date(),
    field('vocabLabel', 2), field('vocabLink', 3),
    field('examLabel', 4), field('examLink', 5),
    field('grammarLabel', 6), field('grammarLink', 7),
    field('finalQuizLabel', 8), field('finalQuizLink', 9),
    field('sentenceLabel', 10), field('sentenceLink', 11)
  ]);
  return textOut_('ok');
}

// {action:'submitVocabResult', token, name, range, score, timeStr, wrong:[...], count, qtype, attempt, known:[...]}
// vocab/index.html의 sendResult()가 결과 웹훅을 이 백엔드로 등록해두면 자동으로 호출됨(action
// 필드만 추가된 것 — VocaTest 자체 개인 Apps Script를 쓰는 기존 사용자는 이 필드를 무시하므로
// 하위호환에 영향 없음).
// Shared with set creation: exact compatibility rows retain their original set and dates.
function vocabularyWordCompatibilityV1_(old,id,term,meaning){
  if(old)vocabularyDbCheckV1_(old[0]===id&&old[2]===term&&old[3]===meaning&&old[4]===true&&typeof old[1]==='string'&&
    [5,6].every(function(i){return old[i] instanceof Date&&isFinite(old[i].getTime());}),'WORD_COMPAT_CONFLICT');
}
function vocabSubmitReadV2_(name,headers,legacyWidth){
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name),error=name===WORD_ATTEMPT_ITEMS_V2_SHEET?'WORD_ATTEMPT_SCHEMA_NOT_READY':'VOCAB_SUBMIT_SCHEMA_NOT_READY:'+name;
  vocabularyDbCheckV1_(!!sheet,error);
  var actual=sheet.getDataRange().getValues()[0];
  if(legacyWidth&&actual.length===legacyWidth)headers=headers.slice(0,legacyWidth);
  vocabularyDbCheckV1_(JSON.stringify(actual)===JSON.stringify(headers),error);
  return vocabularySetReadV1_(name,headers);
}
function vocabSubmitExactV2_(table,id){
  var found=table.rows.slice(1).filter(function(row){return row[0]===id;});
  vocabularyDbCheckV1_(found.length===1,'VOCAB_SUBMIT_IDENTITY_CONFLICT:'+table.sheet.getName());
  return found[0];
}
function vocabSubmitUpdateV2_(table,row){
  var index=table.rows.findIndex(function(old){return old[0]===row[0];});
  vocabularyDbCheckV1_(index>0,'VOCAB_SUBMIT_IDENTITY_CONFLICT');
  table.sheet.getRange(index+1,1,1,table.headers.length).setValues([row]);
  SpreadsheetApp.flush();
  var expected=table.rows.slice();expected[index]=row;
  vocabularyDbCheckV1_(vocabularySetStateV1_(vocabularySetReadV1_(table.sheet.getName(),table.headers).rows)===vocabularySetStateV1_(expected),'VOCAB_SUBMIT_READBACK_FAILED');
  table.rows=expected;
}
function handleSubmitVocabResultSafeV2_(d){
  var lock=LockService.getScriptLock(),started=false,stage='PREVALIDATION';
  if(!lock.tryLock(20000))return textOut_('VOCAB_SUBMIT_BUSY');
  try{
    vocabularyDbCheckV1_(verifyStudentCapability_(d.attemptCapability,'submitAttemptQuestionV2','assignmentTarget',d.assignment_target_id,{student_id:String(d.student_id||'')}),'forbidden attempt');
    var attempts=vocabSubmitReadV2_(ATTEMPTS_V2_SHEET,ATTEMPTS_V2_HEADERS),targets=vocabSubmitReadV2_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS),
      attempt=vocabSubmitExactV2_(attempts,d.attempt_id),target=vocabSubmitExactV2_(targets,d.assignment_target_id);
    vocabularyDbCheckV1_(attempt[1]===target[0]&&attempt[2]===d.student_id&&target[2]===d.student_id,'VOCAB_SUBMIT_SCOPE_MISMATCH');
    vocabularyDbCheckV1_(attempt[9]!=='COMPLETED','ATTEMPT_ALREADY_COMPLETED');
    vocabularyDbCheckV1_(attempt[9]!=='SUBMITTING','PARTIAL_VOCAB_SUBMIT:READ_ONLY_DIAGNOSIS_REQUIRED');
    vocabularyDbCheckV1_(attempt[9]==='IN_PROGRESS'&&target[3]==='IN_PROGRESS','VOCAB_SUBMIT_STATUS_CONFLICT');
    var assignments=vocabSubmitReadV2_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS),students=vocabSubmitReadV2_(STUDENTS_V2_SHEET,STUDENTS_V2_HEADERS),
      assignment=vocabSubmitExactV2_(assignments,target[1]),student=vocabSubmitExactV2_(students,d.student_id),
      sets=vocabSubmitReadV2_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS,19),set=vocabSubmitExactV2_(sets,d.vocab_set_id),
      sources=vocabSubmitReadV2_(VOCAB_SET_ITEMS_V2_SHEET,VOCAB_SET_ITEMS_V2_HEADERS,5),words=vocabSubmitReadV2_(WORDS_V2_SHEET,WORDS_V2_HEADERS),
      items=vocabSubmitReadV2_(WORD_ATTEMPT_ITEMS_V2_SHEET,WORD_ATTEMPT_ITEMS_V2_HEADERS),results=vocabSubmitReadV2_(VOCAB_RESULTS_SHEET,VOCAB_RESULTS_HEADERS);
    vocabularyDbCheckV1_(assignment[2]==='VOCAB'&&attempt[4]==='VOCAB'&&assignment[3]===set[0]&&
      (!d.assignment_id||d.assignment_id===assignment[0])&&(!d.sessionKey||d.sessionKey===set[2])&&
      attempt[3]===assignment[1]&&student[1]===assignment[1]&&set[1]===assignment[1]&&
      boolValue_(target[6],true)&&boolValue_(assignment[8],true)&&boolValue_(student[4],true)&&boolValue_(set[6],true),'VOCAB_SUBMIT_SCOPE_MISMATCH');
    var now=new Date(),sourceRows=sources.rows.slice(1).filter(function(row){return row[1]===set[0];}),byWord=vocabularySetWordMapV1_(words.rows),
      submitted=Array.isArray(d.wordItems)?d.wordItems:[],seen=Object.create(null),saved=[],newWords=[],newItems=[],correct=0;
    vocabularyDbCheckV1_(sourceRows.length>0&&submitted.length===sourceRows.length,'VOCAB_SUBMIT_ITEMS_MISMATCH');
    submitted.forEach(function(w){
      vocabularyDbCheckV1_(w&&typeof w.word_id==='string'&&!seen[w.word_id],'VOCAB_SUBMIT_ITEMS_MISMATCH');seen[w.word_id]=true;
      var matches=sourceRows.filter(function(row){return row[2]===w.word_id;});
      vocabularyDbCheckV1_(matches.length===1,'VOCAB_SUBMIT_ITEMS_MISMATCH');
      var source=matches[0],kind=vocabularySetItemKindV1_(source),meta=kind==='SNAPSHOT'?{word:source[6],meaning:source[7]}:vocabularySetLegacyMetadataV1_(source,byWord);
      vocabularyDbCheckV1_(kind!=='SNAPSHOT'||source[5]===w.word_id,'VOCAB_SUBMIT_ITEMS_MISMATCH');
      vocabularyDbCheckV1_(w.term===meta.word&&w.meaning===meta.meaning&&typeof w.first_correct==='boolean'&&w.final_correct===true&&
        typeof w.wrong_count==='number'&&isFinite(w.wrong_count)&&w.wrong_count>=0&&Math.floor(w.wrong_count)===w.wrong_count&&
        (w.first_correct?w.wrong_count===0:w.wrong_count>0),'VOCAB_SUBMIT_ANSWER_INVALID');
      var oldWords=byWord[w.word_id]||[];vocabularyDbCheckV1_(oldWords.length<=1,'WORD_COMPAT_CONFLICT');
      vocabularyWordCompatibilityV1_(oldWords[0],w.word_id,meta.word,meta.meaning);
      if(!oldWords.length){vocabularyDbCheckV1_(kind==='SNAPSHOT','WORD_COMPAT_SOURCE_REQUIRED');newWords.push([w.word_id,set[0],meta.word,meta.meaning,true,now,now]);}
      var oldItems=items.rows.slice(1).filter(function(row){return row[1]===attempt[0]&&row[2]===w.word_id;});
      vocabularyDbCheckV1_(oldItems.length<=1,'WORD_ATTEMPT_ITEM_CONFLICT');
      vocabularyDbCheckV1_([w.first_answered_at,w.final_answered_at].every(function(value){return value==null||typeof value==='number'&&isFinite(value)&&value>=0;}),'VOCAB_SUBMIT_ANSWER_INVALID');
      var old=oldItems[0],first=w.first_answered_at==null?(old?old[6]:now):new Date(w.first_answered_at),last=w.final_answered_at==null?(old?old[7]:now):new Date(w.final_answered_at);
      vocabularyDbCheckV1_(first instanceof Date&&last instanceof Date&&isFinite(first.getTime())&&isFinite(last.getTime())&&first<=last,'VOCAB_SUBMIT_ANSWER_INVALID');
      if(old)vocabularyDbCheckV1_(typeof old[0]==='string'&&!!old[0]&&old[3]===w.first_correct&&old[4]===w.wrong_count&&old[5]===true&&
        [6,7,8,9].every(function(i){return old[i] instanceof Date&&isFinite(old[i].getTime());})&&old[6].getTime()===first.getTime()&&old[7].getTime()===last.getTime(),'WORD_ATTEMPT_ITEM_CONFLICT');
      var row=old||[Utilities.getUuid(),attempt[0],w.word_id,w.first_correct,w.wrong_count,true,first,last,now,now];
      saved.push(row);if(!old)newItems.push(row);if(w.first_correct)correct++;
    });
    vocabularyDbCheckV1_(!items.rows.slice(1).some(function(row){return row[1]===attempt[0]&&!seen[row[2]];}),'WORD_ATTEMPT_ITEM_CONFLICT');
    saved.forEach(function(row){vocabularyDbCheckV1_(saved.filter(function(other){return other[0]===row[0];}).length===1&&
      !items.rows.slice(1).some(function(old){return old[0]===row[0]&&old!==row;}),'WORD_ATTEMPT_ITEM_CONFLICT');});
    var score=correct+'/'+saved.length+' ('+Math.round(correct/saved.length*100)+'%)',repetition=d.repetition_count==null?0:d.repetition_count;
    vocabularyDbCheckV1_(typeof repetition==='number'&&isFinite(repetition)&&repetition>=0&&Math.floor(repetition)===repetition,'VOCAB_SUBMIT_ANSWER_INVALID');
    vocabularyDbCheckV1_(!d.score||d.score===score||d.score===correct+'/'+saved.length,'VOCAB_SUBMIT_SCORE_MISMATCH');
    var wrong=saved.filter(function(row){return row[4]>0;});
    var resultRow=[now,String(d.name||''),String(d.range||''),score,String(d.timeStr||''),wrong.map(function(row){return submitted.find(function(w){return w.word_id===row[2];}).term;}).join(', '),String(d.count||saved.length),String(d.qtype||''),String(d.attempt||''),(d.known||[]).join(', ')];
    // Preflight all ancillary tables before the first write; existing policies remain in their helpers.
    if(wrong.length){
      var reviews=vocabSubmitReadV2_(REVIEW_ITEMS_V2_SHEET,REVIEW_ITEMS_V2_HEADERS),events=vocabSubmitReadV2_(REVIEW_EVENTS_V2_SHEET,REVIEW_EVENTS_V2_HEADERS);
      wrong.forEach(function(row){
        var matches=reviews.rows.slice(1).filter(function(review){return review[1]===attempt[2]&&review[3]==='WORD'&&review[4]===row[2]&&!review[5];});
        vocabularyDbCheckV1_(matches.length<=1,'VOCAB_SUBMIT_REVIEW_CONFLICT');
        var prior=events.rows.slice(1).filter(function(event){return event[0]===row[0]+':1:GENERAL';});
        vocabularyDbCheckV1_(prior.length<=1&&(!prior.length||matches.length===1&&prior[0][1]===matches[0][0]&&prior[0][2]===attempt[0]&&prior[0][3]===row[0]&&prior[0][4]==='CORRECT'&&prior[0][5]===row[4]),'VOCAB_SUBMIT_REVIEW_CONFLICT');
        if(matches.length)vocabularyDbCheckV1_(!reviews.sheet.getRange(reviews.rows.indexOf(matches[0])+1,1,1,reviews.headers.length).getMergedRanges().length,'VOCAB_SUBMIT_CAPACITY_NOT_READY');
      });
      vocabularySetCapacityV1_(reviews,wrong.length);vocabularySetCapacityV1_(events,wrong.length);
    }
    var schedules=vocabSubmitReadV2_(VOCAB_REVIEW_SCHEDULES_V2_SHEET,VOCAB_REVIEW_SCHEDULES_V2_HEADERS);
    if(attempt[5]==='D7'||attempt[5]==='D30'){
      var matchingSchedules=schedules.rows.slice(1).filter(function(row){return row[1]===attempt[3]&&row[9]===assignment[0]&&row[5]===attempt[5];});
      vocabularyDbCheckV1_(matchingSchedules.length<=1,'VOCAB_SUBMIT_RETENTION_CONFLICT');
      if(matchingSchedules.length)vocabularyDbCheckV1_(!schedules.sheet.getRange(schedules.rows.indexOf(matchingSchedules[0])+1,1,1,schedules.headers.length).getMergedRanges().length,'VOCAB_SUBMIT_CAPACITY_NOT_READY');
    }
    if(attempt[5]==='INITIAL')vocabSubmitReadV2_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS);
    vocabularySetCapacityV1_(schedules,attempt[5]==='INITIAL'?2:0);
    vocabularySetCapacityV1_(words,newWords.length);vocabularySetCapacityV1_(items,newItems.length);vocabularySetCapacityV1_(results,1);
    [[attempts,attempt],[targets,target]].forEach(function(pair){vocabularyDbCheckV1_(!pair[0].sheet.getRange(pair[0].rows.indexOf(pair[1])+1,1,1,pair[0].headers.length).getMergedRanges().length,'VOCAB_SUBMIT_CAPACITY_NOT_READY');});
    vocabularyDbCheckV1_(isFinite(new Date(attempt[6]).getTime()),'VOCAB_SUBMIT_ATTEMPT_TIME_INVALID');
    // A small durable fence, not an automatic retry protocol. Any uncertainty requires read-only diagnosis.
    stage='ATTEMPT_FENCE';started=true;
    var pending=attempt.slice();pending[9]='SUBMITTING';vocabSubmitUpdateV2_(attempts,pending);
    stage='WORDS';vocabularySetAppendV1_(words,newWords,[[0,4]]);
    stage='WORD_ATTEMPT_ITEMS';vocabularySetAppendV1_(items,newItems,[[0,3]]);
    stage='RESULT';vocabularySetAppendV1_(results,[resultRow],[[1,9]]);
    var completed=attempt.slice();completed[7]=now;completed[8]=Math.max(0,now.getTime()-new Date(attempt[6]).getTime());completed[9]='COMPLETED';completed[13]=now;completed[14]=score;completed[15]=repetition;
    var completedTarget=target.slice();completedTarget[3]='COMPLETED';completedTarget[4]=target[4]||attempt[6];completedTarget[5]=now;completedTarget[8]=now;
    stage='TARGET_COMPLETION';vocabSubmitUpdateV2_(targets,completedTarget);
    stage='REVIEW';wrong.forEach(function(row){recordReviewOutcomeV2_(completed,'WORD',row[2],'',true,row[0],1,row[4],lock);});
    stage='RETENTION';syncVocabRetentionOnCompleteV1_(completed);SpreadsheetApp.flush();
    // Completion is the final seal, so verify cannot report success after an earlier partial write.
    stage='ATTEMPT_COMPLETION';vocabSubmitUpdateV2_(attempts,completed);
    CacheService.getScriptCache().remove('teacher-student-list-v1');
    return textOut_('ok');
  }catch(error){
    return textOut_(started?'PARTIAL_VOCAB_SUBMIT:'+stage+':READ_ONLY_DIAGNOSIS_REQUIRED':String(error&&error.message||error));
  }finally{lock.releaseLock();}
}
function handleSubmitVocabResult_(d) {
  if(d.assignment_target_id||d.attempt_id||d.student_id||d.attemptCapability)return handleSubmitVocabResultSafeV2_(d);
  var traceId=String(d.trace_id||''),now=new Date();
  try{getOrCreateSheet_(VOCAB_RESULTS_SHEET,VOCAB_RESULTS_HEADERS).appendRow([now,d.name||'',d.range||'',d.score||'',d.timeStr||'',(d.wrong||[]).join(', '),d.count||'',d.qtype||'',d.attempt||'',(d.known||[]).join(', ')]);resultTraceLog_(traceId,'STEP_H VocabResults write OK');}catch(legacyError){resultTraceLog_(traceId,'STEP_H VocabResults write ERROR',{message:String(legacyError&&legacyError.message||legacyError),stack:String(legacyError&&legacyError.stack||'')});}
  resultTraceLog_(traceId,'STEP_J submitVocabResult success',{legacy:true});
  return textOut_('ok');
}

// {action:'savePractice', token, practiceKey, title, range, pageImageKeys:[...], answers:[...],
//  questionNums:[...], expiresAt}
// pageImageKeys는 ExamImages 시트(uploadImage로 이미 올린 페이지 이미지들)의 키 배열 —
// 문항 크롭 이미지와 저장 방식을 그대로 재사용함(별도 이미지 저장소 안 둠).
function handleSavePractice_(d) {
  setupQuestionMetadataV2_();
  var imgSheet = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  var imgValues = imgSheet.getDataRange().getValues();
  var urlByKey = {};
  for (var i = 1; i < imgValues.length; i++) {
    urlByKey[String(imgValues[i][0])] = imgValues[i][1];
  }
  var pageImages = (d.pageImageKeys || []).map(function (k) { return urlByKey[k] || ''; });

  var existingPractice=getOrCreateSheet_(PRACTICE_SHEET,PRACTICE_HEADERS),existingPracticeIdx=findRowByKey_(existingPractice,d.practiceKey),oldQuestionIds=existingPracticeIdx===-1?[]:parseJsonValue_(existingPractice.getRange(existingPracticeIdx,9).getValue(),[]);
  var questionIds=(d.questionIds||oldQuestionIds||[]).slice();
  for(var q=0;q<(d.questionNums||[]).length;q++){var raw=(d.questions||[])[q]||{source_question_no:(d.questionNums||[])[q]};if(questionIds[q])raw.question_id=questionIds[q];upsertQuestionV2_(raw,{content_type:'PRACTICE_EXAM',answer_type:'MULTIPLE_CHOICE',answer:(d.answers||[])[q],source_question_no:(d.questionNums||[])[q]});questionIds[q]=raw.question_id;}
  var sh = getOrCreateSheet_(PRACTICE_SHEET, PRACTICE_HEADERS);
  upsertRow_(sh, d.practiceKey, [
    d.practiceKey,
    d.title || '',
    d.range || '',
    JSON.stringify(pageImages),
    JSON.stringify(d.answers || []),
    JSON.stringify(d.questionNums || []),
    new Date(),
    d.expiresAt || 0,
    JSON.stringify(questionIds)
  ]);
  return textOut_('ok');
}

// {action:'submitPracticeResult', token, practiceKey, name, answers:[...], totalTimeMs}
// 실전연습은 문항 일부 배정 개념이 없음(항상 전체 범위) — exam처럼 nums 필터링 불필요.
function handleSubmitPracticeResult_(d) {
  var sh = getOrCreateSheet_(PRACTICE_SHEET, PRACTICE_HEADERS);
  var rowIdx = findRowByKey_(sh, d.practiceKey);
  if (rowIdx === -1) return textOut_('practice not found');
  var row = sh.getRange(rowIdx, 1, 1, PRACTICE_HEADERS.length).getValues()[0];
  var correctAnswers = [];
  try { correctAnswers = JSON.parse(row[4] || '[]'); } catch (err) {} // answersJson
  var questionNums = [];
  try { questionNums = JSON.parse(row[5] || '[]'); } catch (err) {}

  var studentAnswers = d.answers || [];
  var score = 0;
  for (var i = 0; i < correctAnswers.length; i++) {
    if (studentAnswers[i] != null && Number(studentAnswers[i]) === Number(correctAnswers[i])) score++;
  }

  var resultSheet = getOrCreateSheet_(PRACTICE_RESULTS_SHEET, PRACTICE_RESULTS_HEADERS);
  resultSheet.appendRow([
    new Date(), d.practiceKey, d.name || '', score, d.totalTimeMs || 0, JSON.stringify(studentAnswers)
  ]);
  cacheStudentResult_('practice', d.practiceKey, d.resultKey, {
    found: true, name: d.name || '', score: score, total: correctAnswers.length,
    totalTimeMs: d.totalTimeMs || 0, correctAnswers: correctAnswers,
    studentAnswers: studentAnswers, questionNums: questionNums
  });
  var attempt=attemptForLegacySubmissionV2_(d),ids=parseJsonValue_(row[8],[]);
  if(attempt){for(var qi=0;qi<ids.length;qi++)upsertQuestionAttemptItemV2_(attempt,{question_id:ids[qi],sequence:qi+1,answer:studentAnswers[qi],elapsed_ms:null,finalize:true});completeAttemptV2_(attempt,score,null);}
  return textOut_('ok');
}

// {action:'saveSentenceSet', token, setKey, label, passages:[{id,text}]}
// 끊어읽기(sentence/index.html)에서 교사가 고른 지문들을 학생에게 공유할 때 씀 — GrammarSets와
// 같은 upsert 패턴(setKey로 재공유하면 덮어씀).
function handleSaveSentenceSet_(d) {
  setupQuestionMetadataV2_();
  var passages = (d.passages || []).map(function(p) {
    var sv=p.correct_sv||p.sv||[],subjectGroups=(p.subjects||[]).map(function(x){return x.primary||[];}),verbGroups=(p.verbs||[]).map(function(x){return x.indexes||[];}),subject=p.correct_subject_token_indexes||subjectGroups[0]||[],verb=p.correct_main_verb_token_indexes||verbGroups[0]||[];
    if(!subject.length&&!verb.length)sv.forEach(function(value,index){if(value==='subj')subject.push(index);if(value==='verb')verb.push(index);});
    p.correct_subject_token_indexes=subject;
    p.correct_main_verb_token_indexes=verb;
    if(subjectGroups.length)p.correct_subject_spans=subjectGroups;
    if(verbGroups.length)p.correct_main_verb_spans=verbGroups;
    return upsertQuestionV2_(p, { content_type:'SENTENCE_STRUCTURE', answer_type:'SV_SELECTION', answer:{subject:subject,main_verb:verb}, source_question_no:p.num || '', category_keys:['SENTENCE_STRUCTURE_SV'].concat(p.learning_area?[p.learning_area]:(p.metadata||p.category_keys||[])), difficulty:p.difficulty||'' });
  });
  var sh = getOrCreateSheet_(SENTENCE_SETS_SHEET, SENTENCE_SETS_HEADERS);
  upsertRow_(sh, d.setKey, [
    d.setKey, d.label || '', JSON.stringify(passages), new Date()
  ]);
  return textOut_('ok');
}

// {action:'submitSentenceHomework', token, setKey, name, passages:[{id,num,text,chunkGaps:[...],sv:[...]}]}
// 학생이 세트 안의 모든 지문을 다 표시하고 한 번에 제출 -- GrammarSubmissions와 마찬가지로
// 채점 없이 그대로 저장만 함(교사가 나중에 그대로 불러와 수업에서 검토). 지문 개수만큼 여러
// 행으로 나눠 저장(한 행 = 한 지문의 제출 상태).
function handleSubmitSentenceHomework_(d) {
  if(String(d.contract_version||'')==='sentence-structure-student-v1')return handleSubmitSentenceStructureStudentV1_(d);
  var sh = getOrCreateSheet_(SENTENCE_SUBMISSIONS_SHEET, SENTENCE_SUBMISSIONS_HEADERS);
  ensureSheetHeaders_(sh, SENTENCE_SUBMISSIONS_HEADERS);
  var passages = d.passages || [];
  var now = new Date();
  passages.forEach(function (p) {
    sh.appendRow([
      now, d.setKey || '', d.name || '', p.id || '', p.num || '', p.text || '',
      JSON.stringify(p.chunkGaps || []), JSON.stringify(p.sv || []), now, JSON.stringify(p.annotations || [])
    ]);
  });
  var attempt=attemptForLegacySubmissionV2_(d);
  if(attempt){
    var setSh=getOrCreateSheet_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS),setIdx=findRowByKey_(setSh,d.setKey),stored=setIdx===-1?[]:parseJsonValue_(setSh.getRange(setIdx,3).getValue(),[]),details=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS),now2=new Date();
    passages.forEach(function(p,idx){
      var original=stored.filter(function(x){return String(x.question_id)===String(p.question_id||p.id);})[0]||stored[idx]||{},correct=original.correct_sv||original.sv||[],student=p.sv||[],questionId=original.question_id||p.question_id||'',questionRow=questionRowV2_(questionId),serverAnswer=questionRow?sentenceAnswerV2_(parseJsonValue_(questionRow[6],{})):null;
      var subjectStudent=p.selected_subject_token_indexes||[],verbStudent=p.selected_main_verb_token_indexes||[],subjectCorrect=serverAnswer?serverAnswer.subject:(original.correct_subject_token_indexes||[]),verbCorrect=serverAnswer?serverAnswer.main_verb:(original.correct_main_verb_token_indexes||[]);
      if(!subjectStudent.length&&!verbStudent.length)student.forEach(function(v,i){if(v==='subj')subjectStudent.push(i);if(v==='verb')verbStudent.push(i);});
      if(!subjectCorrect.length&&!verbCorrect.length)correct.forEach(function(v,i){if(v==='subj')subjectCorrect.push(i);if(v==='verb')verbCorrect.push(i);});
      var item=upsertQuestionAttemptItemV2_(attempt,{question_id:questionId,sequence:idx+1,answer:{subject:subjectStudent,main_verb:verbStudent},elapsed_ms:p.elapsed_ms,finalize:true});
      if(item){
        var detailId=item[0],oldDetail=findRowByKey_(details,detailId),created=oldDetail===-1?now2:details.getRange(oldDetail,8).getValue(),subjectOk=sameAnswerV2_(subjectStudent,subjectCorrect),verbOk=sameAnswerV2_(verbStudent,verbCorrect),tokens=buildTokenSnapshotV2_(p.text||original.text||'');
        item[5]=subjectOk&&verbOk;item[6]='GRADED';item[12]=now2;upsertRow_(getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS),item[0],item);
        upsertRow_(details,detailId,[detailId,JSON.stringify(subjectStudent),JSON.stringify(verbStudent),JSON.stringify(subjectCorrect),JSON.stringify(verbCorrect),subjectOk,verbOk,created,now2,questionId,JSON.stringify(p.subject_token_snapshot||tokenIndexesSnapshotV2_(tokens,subjectStudent)),JSON.stringify(p.main_verb_token_snapshot||tokenIndexesSnapshotV2_(tokens,verbStudent)),JSON.stringify(tokenIndexesSnapshotV2_(tokens,subjectCorrect)),JSON.stringify(tokenIndexesSnapshotV2_(tokens,verbCorrect)),JSON.stringify({learning_area:original.learning_area||'',difficulty:original.difficulty||'',legacy_metadata:p.metadata||original.metadata||original.category_keys||[]}),Math.max(0,Number(p.elapsed_ms)||0),now2]);
        syncSentenceReviewV2_(attempt,item,subjectOk,verbOk);
      }
    });
    if(passages.length===stored.length)completeAttemptV2_(attempt,'',null);
  }
  return textOut_('ok');
}

function sentenceStructureProgressV1_(attempt){
  var qRows=getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS).getDataRange().getValues(),dRows=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS).getDataRange().getValues(),items={},results=[];
  for(var q=1;q<qRows.length;q++)if(String(qRows[q][1])===String(attempt[0]))items[String(qRows[q][0])]=true;
  for(var i=1;i<dRows.length;i++)if(items[String(dRows[i][0])]){var meta=parseJsonValue_(dRows[i][14],{}),result=meta&&meta.student_v1_result;if(result&&result.sentence_id)results.push(result);}
  results.sort(function(a,b){return(Number(a.sequence)||0)-(Number(b.sequence)||0);});
  return{attempt_id:attempt[0],attempt_status:attempt[9],results:results,summary:{sentences_completed:results.length,subject_correct_count:results.filter(function(x){return x.subject_correct===true;}).length,verb_correct_count:results.filter(function(x){return x.verb_correct===true;}).length,hint_used_count:results.filter(function(x){return x.hint_used===true;}).length,expressions_seen:results.reduce(function(n,x){return n+(Array.isArray(x.expression_ids_shown)?x.expression_ids_shown.length:0);},0)}};
}
function handleGetSentenceStructureProgressV1_(e){
  var attempt=attemptByIdV2_(e.parameter.attempt_id),target=attempt&&targetByIdV2_(attempt[1]),studentId=String(e.parameter.student_id||'');
  if(!attempt||!target||String(attempt[4])!=='SENTENCE_STRUCTURE'||String(attempt[1])!==String(e.parameter.assignment_target_id||'')||String(attempt[2])!==studentId||String(target[2])!==studentId||!verifyStudentCapability_(e.parameter.attemptCapability,'submitAttemptQuestionV2','assignmentTarget',attempt[1],{student_id:studentId}))return{error:'forbidden'};
  return sentenceStructureProgressV1_(attempt);
}
function handleSubmitSentenceStructureStudentV1_(d){
  var attempt=requireAttemptScopeV2_(d),target=attempt&&targetByIdV2_(attempt[1]),assignment=target&&assignmentByIdV2_(target[1]);
  if(!attempt||String(attempt[4])!=='SENTENCE_STRUCTURE'||String(attempt[9])!=='IN_PROGRESS'||!assignment||String(assignment[3])!==String(d.setKey||''))return textOut_('forbidden');
  var setSh=getOrCreateSheet_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS),setIdx=findRowByKey_(setSh,d.setKey),stored=setIdx===-1?[]:parseJsonValue_(setSh.getRange(setIdx,3).getValue(),[]),incoming=Array.isArray(d.passages)?d.passages:[],details=getOrCreateSheet_(SENTENCE_STRUCTURE_DETAILS_V2_SHEET,SENTENCE_STRUCTURE_DETAILS_V2_HEADERS),now=new Date(),already={};
  sentenceStructureProgressV1_(attempt).results.forEach(function(result){already[String(result.sentence_id)]=true;});
  incoming.forEach(function(result){
    var sentenceId=String(result.sentence_id||''),original=stored.filter(function(x){return String(x.sentence_id||x.id)===sentenceId;})[0];if(already[sentenceId]||!original||!validUuid_(original.question_id)||typeof result.subject_correct!=='boolean'||typeof result.verb_correct!=='boolean')return;
    var subjectStudent=Array.isArray(result.subject_answers)?result.subject_answers:[],verbStudent=Array.isArray(result.verb_answers)?result.verb_answers:[],subjectCorrect=(original.subjects||[]).map(function(x){return x.primary||[];}),verbCorrect=(original.verbs||[]).map(function(x){return x.indexes||[];}),rawAnswer={subject_answers:subjectStudent,verb_answers:verbStudent,student_chunk_boundaries:result.student_chunk_boundaries||[]};
    var item=upsertQuestionAttemptItemV2_(attempt,{question_id:original.question_id,sequence:Number(result.sequence)||1,answer:rawAnswer,elapsed_ms:result.elapsed_ms,finalize:true});if(!item)return;
    var detailId=item[0],old=findRowByKey_(details,detailId),created=old===-1?now:details.getRange(old,8).getValue(),overall=result.subject_correct&&result.verb_correct,storedResult=JSON.parse(JSON.stringify(result));storedResult.sequence=Number(result.sequence)||1;
    item[5]=overall;item[6]='GRADED';item[12]=now;upsertRow_(getOrCreateSheet_(QUESTION_ATTEMPT_ITEMS_V2_SHEET,QUESTION_ATTEMPT_ITEMS_V2_HEADERS),item[0],item);
    upsertRow_(details,detailId,[detailId,JSON.stringify(subjectStudent),JSON.stringify(verbStudent),JSON.stringify(subjectCorrect),JSON.stringify(verbCorrect),result.subject_correct,result.verb_correct,created,now,original.question_id,JSON.stringify(subjectStudent),JSON.stringify(verbStudent),JSON.stringify(subjectCorrect),JSON.stringify(verbCorrect),JSON.stringify({contract_version:'sentence-structure-student-v1',sentence_id:result.sentence_id,student_v1_result:storedResult}),Math.max(0,Number(result.elapsed_ms)||0),now]);
    syncSentenceReviewV2_(attempt,item,result.subject_correct,result.verb_correct);already[sentenceId]=true;
  });
  var progress=sentenceStructureProgressV1_(attempt),expected={};stored.forEach(function(x){if(x.sentence_id||x.id)expected[String(x.sentence_id||x.id)]=true;});var completed={};progress.results.forEach(function(x){completed[String(x.sentence_id)]=true;});
  if(Object.keys(expected).length&&Object.keys(expected).every(function(id){return completed[id];})){var total=progress.results.length*2,correct=progress.summary.subject_correct_count+progress.summary.verb_correct_count;completeAttemptV2_(attempt,total?Math.round(correct/total*100):'',null);}
  return textOut_('ok:'+attempt[0]+':'+progress.results.length);
}

var THEORY_CONTENT_V1_MAX_JSON_LENGTH = 40000;
function theoryContentObjectV1_(value, allowedKeys, label) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') throw new Error(label + ' must be an object');
  Object.keys(value).forEach(function(key) {
    if (allowedKeys.indexOf(key) === -1) throw new Error(label + ' has an unexpected field');
  });
  return value;
}
function theoryContentTextV1_(value, label, maxLength, required) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new Error(label + ' must be text');
  var text=value.trim();
  if (required && !text) throw new Error(label + ' is required');
  if (text.length > maxLength) throw new Error(label + ' is too long');
  if (/[<>]/.test(text) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) throw new Error(label + ' must be plain text');
  return text;
}
function sanitizeTheoryContentV1_(raw) {
  raw=theoryContentObjectV1_(raw,['version','grammar_id','title','short_summary','blocks','examples','exam_sentences','linked_practice_ref','cta_text'],'theoryContent');
  if (raw.version !== 1) throw new Error('unsupported theory content version');
  if (!Array.isArray(raw.blocks) || raw.blocks.length > 12) throw new Error('invalid theory blocks');
  if (!Array.isArray(raw.examples) || raw.examples.length > 10) throw new Error('invalid theory examples');
  if (!Array.isArray(raw.exam_sentences) || raw.exam_sentences.length > 30) throw new Error('invalid theory exam sentences');
  if (raw.linked_practice_ref != null || raw.cta_text != null) throw new Error('practice linking is not supported in TheoryContentV1');
  var out={
    version:1,
    grammar_id:theoryContentTextV1_(raw.grammar_id,'grammar_id',80,true),
    title:theoryContentTextV1_(raw.title,'title',160,true),
    short_summary:theoryContentTextV1_(raw.short_summary,'short_summary',500,false),
    blocks:raw.blocks.map(function(block) {
      block=theoryContentObjectV1_(block,['type','text'],'block');
      var type=theoryContentTextV1_(block.type,'block.type',20,true);
      if (['concept','form','meaning','caution'].indexOf(type) === -1) throw new Error('invalid theory block type');
      return {type:type,text:theoryContentTextV1_(block.text,'block.text',2000,true)};
    }),
    examples:raw.examples.map(function(example) {
      example=theoryContentObjectV1_(example,['english','korean','highlight','note'],'example');
      var english=theoryContentTextV1_(example.english,'example.english',1000,true);
      if (!Array.isArray(example.highlight) || example.highlight.length > 10) throw new Error('invalid example highlight');
      var highlight=example.highlight.map(function(item) {
        item=theoryContentObjectV1_(item,['text','start','end'],'highlight');
        var text=theoryContentTextV1_(item.text,'highlight.text',200,true),hasStart=item.start != null,hasEnd=item.end != null,outItem={text:text};
        if (hasStart !== hasEnd) throw new Error('highlight offsets must be paired');
        if (hasStart) {
          if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start || item.end > english.length || english.slice(item.start,item.end) !== text) throw new Error('invalid highlight offsets');
          outItem.start=item.start;outItem.end=item.end;
        }
        return outItem;
      });
      return {english:english,korean:theoryContentTextV1_(example.korean,'example.korean',1000,false),highlight:highlight,note:theoryContentTextV1_(example.note,'example.note',1000,false)};
    }),
    exam_sentences:raw.exam_sentences.map(function(sentence) {
      sentence=theoryContentObjectV1_(sentence,['source','question_no','english','detected_hit','explanation'],'exam_sentence');
      var source=theoryContentObjectV1_(sentence.source||{},['year','month','grade','exam_name'],'exam_sentence.source');
      var hit=theoryContentObjectV1_(sentence.detected_hit,['grammar_id','text'],'exam_sentence.detected_hit');
      return {source:{year:theoryContentTextV1_(source.year,'source.year',20,false),month:theoryContentTextV1_(source.month,'source.month',20,false),grade:theoryContentTextV1_(source.grade,'source.grade',40,false),exam_name:theoryContentTextV1_(source.exam_name,'source.exam_name',200,false)},question_no:theoryContentTextV1_(sentence.question_no,'question_no',50,false),english:theoryContentTextV1_(sentence.english,'exam_sentence.english',2000,true),detected_hit:{grammar_id:theoryContentTextV1_(hit.grammar_id,'detected_hit.grammar_id',80,true),text:theoryContentTextV1_(hit.text,'detected_hit.text',200,true)},explanation:theoryContentTextV1_(sentence.explanation,'exam_sentence.explanation',1500,false)};
    }),
    linked_practice_ref:null,
    cta_text:null
  };
  if (JSON.stringify(out).length > THEORY_CONTENT_V1_MAX_JSON_LENGTH) throw new Error('theory content is too large');
  return out;
}
function validateTheoryContentV1_(raw) {
  try { return {valid:true,value:sanitizeTheoryContentV1_(raw),error:''}; }
  catch (error) { return {valid:false,value:null,error:String(error&&error.message||error)}; }
}
function parseTheoryContentV1_(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  try { var parsed=typeof raw === 'string'?JSON.parse(raw):raw,result=validateTheoryContentV1_(parsed);return result.valid?result.value:null; }
  catch (error) { return null; }
}

// {action:'saveGrammarSet', token, setKey, tag, tagLabel, sentences:[{text,matches:[...],tags:{...},translationDraft,chunkGloss:[{en,ko}]}], theoryContent?}
// videoUrl은 여기서 안 보내면(재공유 시 sentences만 새로 보낼 때) 기존 값을 그대로 유지한다 —
// theoryContent도 명시적으로 보낼 때만 갱신한다. exam_sentences는 학생 설명용 snapshot이고,
// sentences는 QuestionsV2와 P0 호환용이다. 둘은 서로 대체하지 않는다.
// saveGrammarVideo와 saveGrammarSet가 서로의 필드를 덮어쓰지 않게 하기 위한 merge 방식
// (handleSaveAssignment_와 같은 패턴).
function handleSaveGrammarSet_(d) {
  var hasTheoryContent=Object.prototype.hasOwnProperty.call(d,'theoryContent'),theoryResult=hasTheoryContent?validateTheoryContentV1_(d.theoryContent):null;
  if (theoryResult && !theoryResult.valid) return textOut_('invalid theory content');
  setupQuestionMetadataV2_();
  var optionIds=String(d.tag||'').split(',').filter(Boolean),sentences=d.sentences||[];
  sentences.forEach(function(sentence,sentenceIndex){
    Object.keys(sentence.tags||{}).forEach(function(tagId){
      (sentence.tags[tagId]||[]).forEach(function(hit,hitIndex){
        var explicitChoices=hit.choices&&hit.choices.length?hit.choices:null;
        var raw={question_id:hit.question_id,content_type:'GRAMMAR',answer_type:'MULTIPLE_CHOICE',promptKo:hit.prompt||'',text:sentence.text||'',phrase:hit.text||'',choices:explicitChoices||optionIds,answer:explicitChoices?hit.correct_answer:tagId,source_question_no:sentence.source_question_no||sentenceIndex+1,category_keys:hit.category_keys||d.category_keys||[],difficulty:hit.difficulty||d.difficulty||''};
        upsertQuestionV2_(raw,{content_type:'GRAMMAR',answer_type:'MULTIPLE_CHOICE'});
        hit.question_id=raw.question_id;
        hit.category_keys=raw.category_keys;
        hit.difficulty=raw.difficulty;
      });
    });
  });
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  ensureSheetHeaders_(sh, GRAMMAR_HEADERS);
  var rowIdx = findRowByKey_(sh, d.setKey);
  var existing = rowIdx === -1 ? null : sh.getRange(rowIdx, 1, 1, GRAMMAR_HEADERS.length).getValues()[0];
  var videoUrl = Object.prototype.hasOwnProperty.call(d, 'videoUrl') ? (d.videoUrl || '') : (existing ? existing[5] : '');
  var theoryContentJson = hasTheoryContent ? JSON.stringify(theoryResult.value) : (existing ? existing[6] || '' : '');
  upsertRow_(sh, d.setKey, [
    d.setKey, d.tag || '', d.tagLabel || '',
    JSON.stringify(sentences),
    new Date(),
    videoUrl,
    theoryContentJson
  ]);
  return textOut_('ok');
}

// {action:'saveGrammarVideo', token, setKey, videoUrl}
// 영상 나중에 촬영해서 링크만 갱신할 때 씀 — sentences/tagLabel 등 나머지 열은 안 건드림.
function handleSaveGrammarVideo_(d) {
  if (!d.setKey) return textOut_('setKey required');
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  var rowIdx = findRowByKey_(sh, d.setKey);
  if (rowIdx === -1) return textOut_('set not found');
  var videoCol = GRAMMAR_HEADERS.indexOf('videoUrl') + 1;
  sh.getRange(rowIdx, videoCol).setValue(d.videoUrl || '');
  return textOut_('ok');
}

// {action:'submitGrammarPractice', token, setKey, name, sentenceIndex, sentenceText, interpretation,
//  chunkStudent:[...], chunkCorrect:[...], chunkScore}
// 채점 없이 그대로 저장만 함(끊어읽기 자동채점 결과도 학생에게는 안 보여주고 교사만 조회).
function handleSubmitGrammarPractice_(d) {
  var sh = getOrCreateSheet_(GRAMMAR_SUBMISSIONS_SHEET, GRAMMAR_SUBMISSIONS_HEADERS);
  sh.appendRow([
    new Date(), d.setKey || '', d.name || '', d.sentenceIndex, d.sentenceText || '',
    d.interpretation || '',
    JSON.stringify(d.chunkStudent || []),
    JSON.stringify(d.chunkCorrect || []),
    d.chunkScore != null ? d.chunkScore : ''
  ]);
  return textOut_('ok');
}

// {action:'saveGrammarFinal', token, setKey, label, questions:[{srcLabel,text,phrase,options:[...],correctIdx}], folderId?}
// 교사가 구분문제 PPT를 검토(필요하면 슬라이드 삭제/수정)한 뒤 그 pptx에서 파싱해낸 최종
// 문제 배열을 저장 -- 원본 pptx 파일 자체는 저장 안 하고 파싱 결과만 저장한다.
function handleSaveGrammarFinal_(d) {
  setupQuestionMetadataV2_();
  var questions = (d.questions || []).map(function(q) {
    return upsertQuestionV2_(q, { content_type:'GRAMMAR', answer_type:'MULTIPLE_CHOICE', answer:q.correctIdx, category_keys:d.category_keys||[], difficulty:d.difficulty||'' });
  });
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  upsertRow_(sh, d.setKey, [
    d.setKey, d.label || '', JSON.stringify(questions), new Date(), d.folderId || ''
  ]);
  return textOut_('ok');
}

// {action:'renameGrammarFinal', token, setKey, label} -- 라벨(이름표)만 갱신, 나머지는 그대로.
function handleRenameGrammarFinal_(d) {
  if (!d.setKey) return textOut_('setKey required');
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.setKey);
  if (rowIdx === -1) return textOut_('not found');
  var labelCol = GRAMMAR_FINALS_HEADERS.indexOf('label') + 1;
  sh.getRange(rowIdx, labelCol).setValue(d.label || '');
  return textOut_('ok');
}

// {action:'moveGrammarFinal', token, setKey, folderId} -- 이 최종본이 속한 폴더만 변경.
function handleMoveGrammarFinal_(d) {
  if (!d.setKey) return textOut_('setKey required');
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.setKey);
  if (rowIdx === -1) return textOut_('not found');
  var folderCol = GRAMMAR_FINALS_HEADERS.indexOf('folderId') + 1;
  sh.getRange(rowIdx, folderCol).setValue(d.folderId || '');
  return textOut_('ok');
}

// {action:'deleteGrammarFinal', token, setKey}
function handleDeleteGrammarFinal_(d) {
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.setKey);
  if (rowIdx !== -1) sh.deleteRow(rowIdx);
  return textOut_('ok');
}

/* -------- GrammarFinalFolders (최종본 정리용 폴더 트리) -------- */

// folderId -> 그 폴더 자신 포함 모든 하위 폴더 id 집합(사이클 방지·cascade 삭제에 씀)
function grammarFinalFolderDescendants_(rows, folderId) {
  var ids = [folderId];
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i][0], parentId = rows[i][2];
      if (ids.indexOf(id) === -1 && ids.indexOf(parentId) !== -1) {
        ids.push(id);
        changed = true;
      }
    }
  }
  return ids;
}

// {action:'createGrammarFinalFolder', token, folderId, name, parentId}
// folderId는 다른 setKey들처럼 클라이언트가 미리 만들어서 보낸다 -- POST는 no-cors라
// 응답을 못 읽으므로 서버가 새로 만든 id를 돌려주는 방식은 안 쓴다(이 코드베이스 전체 관례).
function handleCreateGrammarFinalFolder_(d) {
  if (!d.name || !d.folderId) return textOut_('name and folderId required');
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
  sh.appendRow([d.folderId, d.name, d.parentId || '', new Date()]);
  return textOut_('ok');
}

// {action:'renameGrammarFinalFolder', token, folderId, name}
function handleRenameGrammarFinalFolder_(d) {
  if (!d.folderId) return textOut_('folderId required');
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.folderId);
  if (rowIdx === -1) return textOut_('not found');
  var nameCol = GRAMMAR_FINAL_FOLDERS_HEADERS.indexOf('name') + 1;
  sh.getRange(rowIdx, nameCol).setValue(d.name || '');
  return textOut_('ok');
}

// {action:'moveGrammarFinalFolder', token, folderId, parentId} -- 폴더를 다른 폴더 밑으로 이동.
// 자기 자신의 하위 폴더 밑으로는 못 옮기게 막음(사이클 방지).
function handleMoveGrammarFinalFolder_(d) {
  if (!d.folderId) return textOut_('folderId required');
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.folderId);
  if (rowIdx === -1) return textOut_('not found');
  var newParentId = d.parentId || '';
  if (newParentId) {
    var rows = sh.getDataRange().getValues().slice(1);
    var descendants = grammarFinalFolderDescendants_(rows, d.folderId);
    if (descendants.indexOf(newParentId) !== -1) return textOut_('cycle rejected');
  }
  var parentCol = GRAMMAR_FINAL_FOLDERS_HEADERS.indexOf('parentId') + 1;
  sh.getRange(rowIdx, parentCol).setValue(newParentId);
  return textOut_('ok');
}

// {action:'deleteGrammarFinalFolder', token, folderId} -- 하위 폴더까지 전부 삭제(cascade).
// 그 안에 있던 최종본(GrammarFinals)은 안 지우고 최상위(folderId='')로 꺼내놓는다(안전).
function handleDeleteGrammarFinalFolder_(d) {
  if (!d.folderId) return textOut_('folderId required');
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
  var allRows = sh.getDataRange().getValues();
  var dataRows = allRows.slice(1);
  var toDelete = grammarFinalFolderDescendants_(dataRows, d.folderId);

  var finalsSh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  var finalsValues = finalsSh.getDataRange().getValues();
  var folderCol = GRAMMAR_FINALS_HEADERS.indexOf('folderId');
  for (var i = 1; i < finalsValues.length; i++) {
    if (toDelete.indexOf(finalsValues[i][folderCol]) !== -1) {
      finalsSh.getRange(i + 1, folderCol + 1).setValue('');
    }
  }

  // 뒤에서부터 지워야 행 번호가 안 밀림
  for (var r = allRows.length - 1; r >= 1; r--) {
    if (toDelete.indexOf(allRows[r][0]) !== -1) sh.deleteRow(r + 1);
  }
  return textOut_('ok');
}

// {action:'submitGrammarFinalResult', token, setKey, name, score, count, wrong:[...], timeStr}
// 단어테스트(VocabResults)와 같은 형태로 결과만 쌓음 -- 채점 자체는 학생 브라우저에서 이미
// 끝난 뒤 결과만 보고하는 것(정답은 fetchGrammarFinal 응답에 들어있어 브라우저에서 바로 채점).
function handleSubmitGrammarFinalResult_(d) {
  var scoped=!!(d.assignment_target_id||d.student_id||d.attempt_id||d.attemptCapability),attempt=attemptForLegacySubmissionV2_(d), resultName=d.name || '';
  if(scoped&&!attempt)return textOut_('forbidden');
  if(attempt&&String(attempt[9])!=='IN_PROGRESS')return textOut_('already completed');
  if(attempt){
    var student=studentV2ById_(attempt[2]);
    if(student&&student[2])resultName=student[2];
    else console.warn('[ELAB-GRAMMAR-FINAL] canonical student name unavailable; client fallback used');
  }
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_RESULTS_SHEET, GRAMMAR_FINAL_RESULTS_HEADERS);
  sh.appendRow([
    new Date(), d.setKey || '', resultName, d.score || '', d.count || '',
    (d.wrong || []).join(', '), d.timeStr || ''
  ]);
  if(attempt){var finalSh=getOrCreateSheet_(GRAMMAR_FINALS_SHEET,GRAMMAR_FINALS_HEADERS),idx=findRowByKey_(finalSh,d.setKey),questions=idx===-1?[]:parseJsonValue_(finalSh.getRange(idx,3).getValue(),[]),answers=d.answers||[];for(var qi=0;qi<questions.length;qi++)upsertQuestionAttemptItemV2_(attempt,{question_id:questions[qi].question_id,sequence:qi+1,answer:answers[qi],elapsed_ms:(d.times||[])[qi],finalize:true});completeAttemptV2_(attempt,d.score,null);}
  return textOut_('ok');
}

/* ============================= doGet ============================= */
// 전부 JSONP(?callback=...)로 호출됨.
function doGet(e) {
  e.__elab_dispatch_started = Date.now();
  var cb = e.parameter.callback || 'callback';
  var action = e.parameter.action;

  if (action === 'imageStatus') return jsonpOut_(cb, handleImageStatus_(e));
  if (action === 'fetchExam') return jsonpOut_(cb, handleFetchExam_(e));
  if (action === 'fetchMyResult') return jsonpOut_(cb, handleFetchMyResult_(e));
  if (action === 'listResults') return jsonpOut_(cb, handleListResults_(e));
  if (action === 'listStudents') return jsonpOut_(cb, handleListStudents_(e));
  if (action === 'listAssignments') return jsonpOut_(cb, handleListAssignments_(e));
  if (action === 'fetchAssignment') return jsonpOut_(cb, handleFetchAssignment_(e));
  if (action === 'listGroupsV2') return jsonpOut_(cb, handleListGroupsV2_(e));
  if (action === 'getAssignmentWorkspaceV2') return jsonpOut_(cb, handleGetAssignmentWorkspaceV2_(e));
  if (action === 'listAssignmentsV2') return jsonpOut_(cb, handleListAssignmentsV2_(e));
  if (action === 'getSentenceStructureAssignmentEditV1') return jsonpOut_(cb, handleGetSentenceStructureAssignmentEditV1_(e));
  if (action === 'listDueVocabReviewsV1') return jsonpOut_(cb, handleListDueVocabReviewsV1_(e));
  if (action === 'getVocabularyImportStatusV1') return jsonpOut_(cb, handleGetVocabularyImportStatusV1_(e));
  if (action === 'inspectVocabularyStagingStateV1') return jsonpOut_(cb, handleInspectVocabularyStagingStateV1_(e));
  if (action === 'inspectVocabularySetSchemasV1') return jsonpOut_(cb, handleInspectVocabularySetSchemasV1_(e));
  if (action === 'inspectVocabularyAssignmentStartPreflightV1') return jsonpOut_(cb, handleInspectVocabularyAssignmentStartPreflightV1_(e));
  if (action === 'listVocabularyDbV1') return jsonpOut_(cb, handleListVocabularyDbV1_(e));
  if (action === 'getVocabularyDbItemV1') return jsonpOut_(cb, handleGetVocabularyDbItemV1_(e));
  if (action === 'listVocabularySensesV1') return jsonpOut_(cb, handleListVocabularySensesV1_(e));
  if (action === 'previewVocabularySetV1') return jsonpOut_(cb, handlePreviewVocabularySetV1_(e));
  if (action === 'fetchVocabularySetV1') return jsonpOut_(cb, handleFetchVocabularySetV1_(e));
  if (action === 'verifyAssignmentBatchV2') return jsonpOut_(cb, handleVerifyAssignmentBatchV2_(e));
  if (action === 'listAssignmentContentV2') return jsonpOut_(cb, handleListAssignmentContentV2_(e));
  if (action === 'listMyAssignmentsV2') return jsonpOut_(cb, handleListMyAssignmentsV2_(e));
  if (action === 'listStudentReviewItemsV2') return jsonpOut_(cb, handleListStudentReviewItemsV2_(e));
  if (action === 'getWrongnoteSummaryV2') return jsonpOut_(cb, handleGetWrongnoteSummaryV2_(e));
  if (action === 'listWrongnoteGroupsV2') return jsonpOut_(cb, handleListWrongnoteGroupsV2_(e));
  if (action === 'listWrongnoteGroupItemsV2') return jsonpOut_(cb, handleListWrongnoteGroupItemsV2_(e));
  if (action === 'getReviewItemHistoryV2') return jsonpOut_(cb, handleGetReviewItemHistoryV2_(e));
  if (action === 'listHomeworkBatchesV2') return jsonpOut_(cb, handleListHomeworkBatchesV2_(e));
  if (action === 'getTeacherDashboardV2') return jsonpOut_(cb, handleGetTeacherDashboardSafe_(e));
  if (action === 'measureTeacherDashboardReads') return jsonpOut_(cb, handleMeasureTeacherDashboardReads_(e));
  if (action === 'fetchGrammarSet') return jsonpOut_(cb, handleFetchGrammarSet_(e));
  if (action === 'listVocabResults') return jsonpOut_(cb, handleListVocabResults_(e));
  if (action === 'recentVocabWords') return jsonpOut_(cb, handleRecentVocabWords_(e));
  if (action === 'listAllExamResults') return jsonpOut_(cb, handleListAllExamResults_(e));
  if (action === 'listGrammarSets') return jsonpOut_(cb, handleListGrammarSets_(e));
  if (action === 'listGrammarSubmissions') return jsonpOut_(cb, handleListGrammarSubmissions_(e));
  if (action === 'listGrammarFinals') return jsonpOut_(cb, handleListGrammarFinals_(e));
  if (action === 'fetchGrammarFinal') return jsonpOut_(cb, handleFetchGrammarFinal_(e));
  if (action === 'listGrammarFinalResults') return jsonpOut_(cb, handleListGrammarFinalResults_(e));
  if (action === 'listGrammarFinalFolders') return jsonpOut_(cb, handleListGrammarFinalFolders_(e));
  if (action === 'fetchPractice') return jsonpOut_(cb, handleFetchPractice_(e));
  if (action === 'fetchMyPracticeResult') return jsonpOut_(cb, handleFetchMyPracticeResult_(e));
  if (action === 'listPracticeResults') return jsonpOut_(cb, handleListPracticeResults_(e));
  if (action === 'fetchSentenceSet') return jsonpOut_(cb, handleFetchSentenceSet_(e));
  if (action === 'getSentenceStructureProgressV1') return jsonpOut_(cb, handleGetSentenceStructureProgressV1_(e));
  if (action === 'issueVocabCapability') return jsonpOut_(cb, handleIssueVocabCapability_(e));
  if (action === 'verifyVocabResultV2') return jsonpOut_(cb, handleVerifyVocabResultV2_(e));
  if (action === 'verifyAttemptCompletionV2') return jsonpOut_(cb, handleVerifyAttemptCompletionV2_(e));
  if (action === 'listSentenceSets') return jsonpOut_(cb, handleListSentenceSets_(e));
  if (action === 'listSentenceSubmissions') return jsonpOut_(cb, handleListSentenceSubmissions_(e));
  if (action === 'listAttemptsV2') return jsonpOut_(cb, handleListAttemptsV2_(e));
  if (action === 'listStudentAttemptHistoryV2') return jsonpOut_(cb, handleListStudentAttemptHistoryV2_(e));
  if (action === 'getAttemptDetailV2') return jsonpOut_(cb, handleGetAttemptDetailV2Enhanced_(e));

  return jsonpOut_(cb, { error: 'unknown action' });
}

// ?action=imageStatus&key=IMAGEKEY
function handleImageStatus_(e) {
  var sh = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, IMAGES_HEADERS.length).getValues()[0];
  return { found: true, url: row[1] };
}

// ?action=fetchExam&key=EXAMKEY&nums=30,31(선택)  (학생용 — 정답은 절대 포함하지 않음)
function handleFetchExam_(e) {
  if (!validateAssignmentLaunchV2_(e, 'READING', e.parameter.key)) return { found:false, error:'forbidden assignment' };
  var sh = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, EXAMS_HEADERS.length).getValues()[0];

  var expiresAt = Number(row[7]) || 0;
  if (expiresAt && Date.now() > expiresAt) return { found: false, expired: true };

  var imageUrls = [];
  try {
    imageUrls = JSON.parse(row[5] || '[]');
  } catch (err) {}
  var fullNums = [];
  try { fullNums = JSON.parse(row[8] || '[]'); } catch (err) {}
  var contentType = row[9] || 'image';
  var questionsContent = [];
  if (contentType === 'text') {
    try { questionsContent = JSON.parse(row[10] || '[]'); } catch (err) {}
  }
  var questionIds = [];
  try { questionIds = JSON.parse(row[11] || '[]'); } catch (err) {}

  var requestedNums = parseNumList_(e.parameter.nums);
  var outNums = fullNums;
  if (requestedNums.length > 0) {
    imageUrls = filterBySelectedNums_(fullNums, imageUrls, requestedNums);
    questionsContent = filterBySelectedNums_(fullNums, questionsContent, requestedNums);
    questionIds = filterBySelectedNums_(fullNums, questionIds, requestedNums);
    outNums = requestedNums.filter(function (n) { return fullNums.indexOf(n) !== -1; });
  }

  var response = {
    found: true,
    title: row[1],
    range: row[2],
    questionCount: contentType === 'text' ? questionsContent.length : imageUrls.length,
    imageUrls: imageUrls,
    contentType: contentType,
    questionsContent: questionsContent, // contentType==='text'일 때만 채워짐: [{promptKo,text,choices,image}]
    questionNums: outNums, // 교사용 미리보기(결과 탭)에서 각 이미지가 몇 번 문항인지 표시하는 데 씀
    questionIds: questionIds
  };
  Object.assign(response,attemptContextForFetchV2_(e,String(e.parameter.review||'')==='1'));
  var auth = studentAuthFields_('exam', e.parameter.key, ['submitResult', 'fetchMyResult'],
    { nums: normalizeNumsScope_(e.parameter.nums) }, expiresAt || 0);
  Object.keys(auth).forEach(function (k) { response[k] = auth[k]; });
  return response;
}

// ?action=fetchMyResult&key=EXAMKEY&name=...&studentCapability=...&resultKey=...
// 학생용 capability가 시험/action/부분문항 범위를 제한하고, 제출 때 만든 resultKey가 방금 제출한
// 결과만 다시 읽게 한다. no-cors POST 응답을 못 읽는 문제는 10분짜리 서버 cache로 우회한다.
function handleFetchMyResult_(e) {
  var scope = { nums: normalizeNumsScope_(e.parameter.nums) };
  var authorized = getStudentAuthMode_() === 'legacy_student_token'
    ? timingSafeEqual_(e.parameter.studentSubmitToken, getOrCreateStudentSecret_('LEGACY_STUDENT_SUBMIT_TOKEN'))
    : verifyStudentCapability_(e.parameter.studentCapability, 'fetchMyResult', 'exam', e.parameter.key, scope);
  if (!authorized) return { found: false };
  var cached = readCachedStudentResult_('exam', e.parameter.key, e.parameter.resultKey);
  if (!cached || String(cached.name).trim() !== String(e.parameter.name || '').trim()) return { found: false };
  var examSheet = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  var examRowIdx = findRowByKey_(examSheet, e.parameter.key);
  if (examRowIdx === -1) return { found: false };
  var examRow = examSheet.getRange(examRowIdx, 1, 1, EXAMS_HEADERS.length).getValues()[0];
  var correctAnswers = [];
  try { correctAnswers = JSON.parse(examRow[4] || '[]'); } catch (err) {}
  var fullNums = [];
  try { fullNums = JSON.parse(examRow[8] || '[]'); } catch (err) {}
  var contentType = examRow[9] || 'image';
  var questionsContent = [];
  if (contentType === 'text') {
    try { questionsContent = JSON.parse(examRow[10] || '[]'); } catch (err) {}
  }

  var requestedNums = parseNumList_(e.parameter.nums);
  if (requestedNums.length > 0) {
    correctAnswers = filterBySelectedNums_(fullNums, correctAnswers, requestedNums);
    questionsContent = filterBySelectedNums_(fullNums, questionsContent, requestedNums);
  }

  cached.correctAnswers = correctAnswers;
  cached.total = correctAnswers.length;
  cached.contentType = contentType;
  cached.questionsContent = questionsContent;
  delete cached.name;
  return cached;
}

// ?action=listResults&key=EXAMKEY&token=...  (교사용, 토큰 필요)
function handleListResults_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(RESULTS_SHEET, RESULTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) !== String(e.parameter.key)) continue;
    var answers = [];
    var times = [];
    try { answers = JSON.parse(values[i][5] || '[]'); } catch (err) {}
    try { times = JSON.parse(values[i][6] || '[]'); } catch (err) {}
    out.push({
      date: values[i][0],
      name: values[i][2],
      score: values[i][3],
      totalTimeMs: values[i][4],
      answers: answers,
      times: times
    });
  }

  // 정답도 같이 내려줘야 결과 탭에서 문항별 O/X를 그릴 수 있음
  var examSheet = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  var examRowIdx = findRowByKey_(examSheet, e.parameter.key);
  var correctAnswers = [];
  if (examRowIdx !== -1) {
    var examRow = examSheet.getRange(examRowIdx, 1, 1, EXAMS_HEADERS.length).getValues()[0];
    try { correctAnswers = JSON.parse(examRow[4] || '[]'); } catch (err) {}
  }

  return { results: out, correctAnswers: correctAnswers };
}

// ?action=listStudents&token=...  (교사용, 토큰 필요 — PIN도 같이 내려줌, 교사가 학생에게 알려주려고)
function handleListStudents_(e, assignmentTargetRows) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var cache = CacheService.getScriptCache();
  var cached = cache.get('teacher-student-list-v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (cacheErr) {}
  }
  var sh = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var v2Values = getOrCreateSheet_(STUDENTS_V2_SHEET, STUDENTS_V2_HEADERS).getDataRange().getValues();
  var v2ById = {};
  for (var vi = 1; vi < v2Values.length; vi++) {
    v2ById[String(v2Values[vi][0] || '')] = v2Values[vi];
  }
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var studentId = String(values[i][3] || '');
    var v2 = v2ById[studentId] || null;
    out.push({
      name: v2 ? v2[2] : values[i][0], pin: values[i][1], createdAt: values[i][2],
      student_id: studentId, teacher_id: v2 ? v2[1] : '', grade: v2 ? v2[3] : '',
      active: v2 ? boolValue_(v2[4], true) : true,
      school: v2 ? v2[7] : '', contact: v2 ? v2[8] : '', email: v2 ? v2[9] : '',
      enrollment_start_date: v2 ? v2[10] : '', lesson_days:v2?v2[11]:'', lesson_time:v2?v2[12]:'', lesson_memo:v2?v2[13]:''
    });
  }
  var listedIds = {}, listTeacherId = getOrCreateDefaultTeacher_();
  out.forEach(function(student) { listedIds[String(student.student_id || '')] = true; });
  for (var vj = 1; vj < v2Values.length; vj++) {
    var v2Only = v2Values[vj], v2Id = String(v2Only[0] || '');
    if (!v2Id || listedIds[v2Id] || String(v2Only[1]) !== String(listTeacherId)) continue;
    out.push({
      name:v2Only[2], pin:'', createdAt:v2Only[5], student_id:v2Id, teacher_id:v2Only[1],
      grade:v2Only[3], active:boolValue_(v2Only[4],true), school:v2Only[7]||'',
      contact:v2Only[8]||'', email:v2Only[9]||'', enrollment_start_date:v2Only[10]||'',
      lesson_days:v2Only[11]||'', lesson_time:v2Only[12]||'', lesson_memo:v2Only[13]||''
    });
  }
  var unfinished = {};
  var targetRows = assignmentTargetRows || getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET, ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues();
  for (var ti = 1; ti < targetRows.length; ti++) {
    if (!boolValue_(targetRows[ti][6], true) || ['COMPLETED','CANCELLED'].indexOf(String(targetRows[ti][3])) !== -1) continue;
    unfinished[String(targetRows[ti][2])] = (unfinished[String(targetRows[ti][2])] || 0) + 1;
  }
  out.forEach(function(student) { student.unfinished_assignment_count = unfinished[String(student.student_id)] || 0; });
  var response = { students: out };
  cache.put('teacher-student-list-v1', JSON.stringify(response), 120);
  return response;
}

function handleListGroupsV2_(e) {
  if(e.parameter.token!==getToken_())return {error:'no token'};var cache=CacheService.getScriptCache(),cached=cache.get('teacher-class-list-v1');if(cached){try{return JSON.parse(cached)}catch(ignore){}}ensureSheetHeaders_(getOrCreateSheet_(GROUPS_V2_SHEET,GROUPS_V2_HEADERS),GROUPS_V2_HEADERS);ensureSheetHeaders_(getOrCreateSheet_(GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS),GROUP_MEMBERS_V2_HEADERS);var teacherId=getOrCreateDefaultTeacher_();
  var groups=getOrCreateSheet_(GROUPS_V2_SHEET,GROUPS_V2_HEADERS).getDataRange().getValues(),members=getOrCreateSheet_(GROUP_MEMBERS_V2_SHEET,GROUP_MEMBERS_V2_HEADERS).getDataRange().getValues(),out=[];
  for(var i=1;i<groups.length;i++){if(String(groups[i][1])!==teacherId)continue;var ids=[];for(var j=1;j<members.length;j++)if(String(members[j][1])===String(groups[i][0])&&boolValue_(members[j][5],true))ids.push(String(members[j][2]));out.push({group_id:groups[i][0],name:groups[i][2],active:boolValue_(groups[i][3],true),student_ids:ids,grade:groups[i][6]||'',lesson_days:groups[i][7]||'',lesson_time:groups[i][8]||'',memo:groups[i][9]||''});}var response={groups:out};cache.put('teacher-class-list-v1',JSON.stringify(response),600);return response;
}
function handleListAssignmentsV2_(e, assignmentRows, assignmentTargetRows, workspaceTeacherId) {
  if(e.parameter.token!==getToken_())return {error:'no token'};var teacherId=workspaceTeacherId||getOrCreateDefaultTeacher_(),assignments=assignmentRows||getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),targets=assignmentTargetRows||getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),out=[];
  for(var i=1;i<assignments.length;i++){if(String(assignments[i][1])!==teacherId)continue;var rows=[];for(var j=1;j<targets.length;j++)if(String(targets[j][1])===String(assignments[i][0]))rows.push({assignment_target_id:targets[j][0],student_id:targets[j][2],status:targets[j][3],active:boolValue_(targets[j][6],true)});out.push({assignment_id:assignments[i][0],content_type:assignments[i][2],content_ref_id:assignments[i][3],title:assignments[i][4],content_link:assignments[i][5],assigned_at:assignments[i][6],due_at:assignments[i][7],active:boolValue_(assignments[i][8],true),content_subtype:assignments[i][11]||'',request_id:assignments[i][12]||'',linked_practice_assignment_id:assignments[i][13]?String(assignments[i][13]):null,targets:rows});}return {assignments:out};
}
function handleVerifyAssignmentBatchV2_(e){
  if(e.parameter.token!==getToken_())return{error:'no token'};
  var requestId=String(e.parameter.request_id||''),expectedAssignments=Math.max(1,Number(e.parameter.assignment_count)||0),expectedTargets=Math.max(1,Number(e.parameter.target_count)||0),teacherId=getOrCreateDefaultTeacher_();
  if(!requestId)return{error:'no request id'};
  var assignments=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),targets=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),batches=getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS).getDataRange().getValues(),links=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),assignmentIds={},saved=[];
  for(var a=1;a<assignments.length;a++)if(String(assignments[a][1])===String(teacherId)&&String(assignments[a][12])===requestId){assignmentIds[String(assignments[a][0])]=true;saved.push(assignments[a]);}
  var targetCount=0,targetStudents={};for(var t=1;t<targets.length;t++)if(assignmentIds[String(targets[t][1])]&&boolValue_(targets[t][6],true)){targetCount++;targetStudents[String(targets[t][2])]=true;}
  var batchIds={};for(var b=1;b<batches.length;b++)if(String(batches[b][1])===String(teacherId)&&boolValue_(batches[b][6],true))batchIds[String(batches[b][0])]=true;
  var linkCount=0;for(var l=1;l<links.length;l++)if(assignmentIds[String(links[l][2])]&&targetStudents[String(links[l][3])]&&batchIds[String(links[l][1])])linkCount++;
  var requiredTargets=expectedAssignments*expectedTargets,complete=saved.length===expectedAssignments&&targetCount===requiredTargets&&linkCount===requiredTargets;
  return{found:saved.length>0,complete:complete,request_id:requestId,assignment_count:saved.length,target_count:targetCount,homework_link_count:linkCount,expected_assignment_count:expectedAssignments,expected_target_count:requiredTargets,assignments:saved.map(function(row){return{assignment_id:row[0],content_type:row[2],content_ref_id:row[3],title:row[4],content_link:row[5],assigned_at:row[6],due_at:row[7],active:boolValue_(row[8],true),content_subtype:row[11]||'',request_id:row[12]||'',linked_practice_assignment_id:row[13]?String(row[13]):null};})};
}
function assignmentContentSummaryRows_(sheetName, headers, columnCount, perf) {
  var started=Date.now(),sheet=getOrCreateSheet_(sheetName,headers),lastRow=sheet.getLastRow(),rows=lastRow>1?sheet.getRange(2,1,lastRow-1,columnCount).getValues():[];
  perf.read_count[sheetName]=(perf.read_count[sheetName]||0)+1;
  perf.reads.push({sheet:sheetName,elapsed_ms:Date.now()-started,rows:rows.length,columns:columnCount,read_count:perf.read_count[sheetName]});
  return rows;
}
function contentRowsForAssignmentV2_(rows,type,keyIndex,titleIndex,extra) {var out=[];for(var i=0;i<rows.length;i++)out.push({content_type:type,content_ref_id:String(rows[i][keyIndex]),title:String(rows[i][titleIndex]||rows[i][keyIndex]),extra:extra?extra(rows[i]):{}});return out;}
function handleListAssignmentContentV2_(e) {
  if(e.parameter.token!==getToken_())return {error:'no token'};
  var totalStarted=Date.now(),processStarted=Date.now(),items=[],teacherId=getOrCreateDefaultTeacher_(),perf={reads:[],read_count:{}};
  var vocab=assignmentContentSummaryRows_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS,VOCAB_SETS_V2_HEADERS.length,perf);
  var exams=assignmentContentSummaryRows_(EXAMS_SHEET,EXAMS_HEADERS,4,perf);
  var grammar=assignmentContentSummaryRows_(GRAMMAR_SHEET,GRAMMAR_HEADERS,3,perf);
  var finals=assignmentContentSummaryRows_(GRAMMAR_FINALS_SHEET,GRAMMAR_FINALS_HEADERS,2,perf);
  var sentences=assignmentContentSummaryRows_(SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS,2,perf);
  var practices=assignmentContentSummaryRows_(PRACTICE_SHEET,PRACTICE_HEADERS,3,perf);
  processStarted=Date.now();
  for(var vi=0;vi<vocab.length;vi++)if(String(vocab[vi][1])===teacherId&&boolValue_(vocab[vi][6],true))items.push({content_type:'VOCAB',content_ref_id:String(vocab[vi][0]),title:String(vocab[vi][3]||vocab[vi][4]||vocab[vi][2]),content_link:String(vocab[vi][5]),extra:{session_key:String(vocab[vi][2]),source_ref:String(vocab[vi][4]||''),book_source:String(vocab[vi][9]||vocab[vi][4]||''),day_set:String(vocab[vi][10]||''),range_start:String(vocab[vi][11]||''),range_end:String(vocab[vi][12]||''),display_range:String(vocab[vi][13]||vocab[vi][3]||''),set_kind:String(vocab[vi][14]||'RANDOM'),set_size:Number(vocab[vi][15])||0,catalog_id:String(vocab[vi][16]||''),set_number:Number(vocab[vi][17])||0,source_folders_json:String(vocab[vi][18]||'')}});
  items=items.concat(contentRowsForAssignmentV2_(exams,'READING',0,1,function(r){return{question_count:Number(r[3])||0,content_subtype:'INDIVIDUAL'};}));
  items=items.concat(contentRowsForAssignmentV2_(grammar,'GRAMMAR',0,2,function(){return{route:'study',content_subtype:'LESSON_PRACTICE'};}));
  items=items.concat(contentRowsForAssignmentV2_(finals,'GRAMMAR',0,1,function(){return{route:'finalQuiz',content_subtype:'FINAL_QUIZ'};}));
  items=items.concat(contentRowsForAssignmentV2_(sentences,'SENTENCE_STRUCTURE',0,1));
  items=items.concat(contentRowsForAssignmentV2_(practices,'PRACTICE_EXAM',0,1,function(r){return{range:String(r[2]||''),content_subtype:'FULL_EXAM'};}));
  var processMs=Date.now()-processStarted,jsonStarted=Date.now(),responseBytes=JSON.stringify({items:items}).length,jsonMs=Date.now()-jsonStarted;
  console.log('[ELAB-PERF][ASSIGNMENT] '+JSON.stringify({api:'listAssignmentContentV2',reads:perf.reads,sheet_read_count:perf.reads.length,data_processing_ms:processMs,content_availability_ms:0,signed_link_ms:0,json_build_ms:jsonMs,total_ms:Date.now()-totalStarted,response_bytes:responseBytes,content_count:items.length}));
  return {items:items};
}
function handleGetAssignmentWorkspaceV2_(e) {
  if(e.parameter.token!==getToken_())return {error:'no token'};var totalStarted=Date.now(),stages=[],stageStarted=Date.now();
  var assignmentRows=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),assignmentTargetRows=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),teacherId=getOrCreateDefaultTeacher_();stages.push({stage:'assignment_shared_reads',elapsed_ms:Date.now()-stageStarted,sheets:[{sheet:ASSIGNMENTS_V2_SHEET,rows:assignmentRows.length-1,columns:ASSIGNMENTS_V2_HEADERS.length},{sheet:ASSIGNMENT_TARGETS_V2_SHEET,rows:assignmentTargetRows.length-1,columns:ASSIGNMENT_TARGETS_V2_HEADERS.length}]});
  stageStarted=Date.now();var students=handleListStudents_(e,assignmentTargetRows);stages.push({stage:'students',elapsed_ms:Date.now()-stageStarted});
  stageStarted=Date.now();var groups=handleListGroupsV2_(e);stages.push({stage:'groups',elapsed_ms:Date.now()-stageStarted});
  stageStarted=Date.now();var content=handleListAssignmentContentV2_(e);stages.push({stage:'content',elapsed_ms:Date.now()-stageStarted});
  stageStarted=Date.now();var assignments=handleListAssignmentsV2_(e,assignmentRows,assignmentTargetRows,teacherId);stages.push({stage:'assignments',elapsed_ms:Date.now()-stageStarted});
  if(students.error||groups.error||content.error||assignments.error)return {error:'workspace load failed'};
  var response={students:students.students||[],groups:groups.groups||[],items:content.items||[],assignments:assignments.assignments||[]},jsonStarted=Date.now(),responseBytes=JSON.stringify(response).length,jsonMs=Date.now()-jsonStarted;console.log('[ELAB-PERF][ASSIGNMENT] '+JSON.stringify({api:'getAssignmentWorkspaceV2',stages:stages,sheet_read_count:{AssignmentsV2:1,AssignmentTargetsV2:1},json_build_ms:jsonMs,total_ms:Date.now()-totalStarted,response_bytes:responseBytes,content_count:response.items.length}));return response;
}
function derivedAssignmentStatus_(stored,dueAt) {if(String(stored)==='COMPLETED'||String(stored)==='CANCELLED')return String(stored);if(dueAt&&new Date(dueAt).getTime()<Date.now())return 'OVERDUE';return String(stored||'NOT_STARTED');}
function sentenceHintLevelFromLinkV2_(type,link){if(String(type)!=='SENTENCE_STRUCTURE')return'';var match=String(link||'').match(/[?&]hint_level=(NONE|BASIC|DETAILED)(?:[&#]|$)/i);return match?String(match[1]).toUpperCase():'DETAILED';}
function sentenceReadingSupportFromLinkV2_(type,link){if(String(type)!=='SENTENCE_STRUCTURE')return'';var match=String(link||'').match(/[?&]reading_support=(foundation|beginner|intermediate|advanced)(?:[&#]|$)/i);return match?String(match[1]).toLowerCase():'beginner';}
function vocabAssignmentAvailabilityV2_(ref,storedLink){var vocab=findVocabSetByIdOrSessionV2_(ref);if(!vocab)return{available:false,reason:'VOCAB_SET_NOT_FOUND',link:''};var sessionKey=String(vocab[2]||'');if(!sessionKey)return{available:false,reason:'MISSING_SESSION_KEY',link:''};var link=String(vocab[5]||storedLink||'');if(!link)return{available:false,reason:'MISSING_CONTENT_LINK',link:''};var match=link.match(/[?&]session=([^&#]+)/),linkSession='';try{linkSession=match?decodeURIComponent(match[1]):''}catch(ignore){}if(!match||linkSession!==sessionKey)return{available:false,reason:'INVALID_CONTENT_REF',link:link};return{available:true,reason:'',link:link,vocab_set_id:String(vocab[0]),session_key:sessionKey};}
function assignmentContentAvailableV2_(type,key,subtype) {var map={READING:[EXAMS_SHEET,EXAMS_HEADERS],SENTENCE_STRUCTURE:[SENTENCE_SETS_SHEET,SENTENCE_SETS_HEADERS],PRACTICE_EXAM:[PRACTICE_SHEET,PRACTICE_HEADERS]};if(String(type)==='VOCAB')return vocabAssignmentAvailabilityV2_(key,'').available;if(String(type)==='GRAMMAR'){var pair=String(subtype)==='FINAL_QUIZ'?[GRAMMAR_FINALS_SHEET,GRAMMAR_FINALS_HEADERS]:[GRAMMAR_SHEET,GRAMMAR_HEADERS];return findRowByKey_(getOrCreateSheet_(pair[0],pair[1]),key)!==-1;}var pair=map[String(type)];return !!pair&&findRowByKey_(getOrCreateSheet_(pair[0],pair[1]),key)!==-1;}
function handleListMyAssignmentsV2_(e) {
  var studentId=String(e.parameter.student_id||'');if(!verifyStudentCapability_(e.parameter.assignmentCapability,'listMyAssignmentsV2','studentAssignments',studentId,{student_id:studentId}))return {error:'forbidden'};
  var student=studentV2ById_(studentId);if(!student||!boolValue_(student[4],true))return {error:'inactive'};var assignments=getOrCreateSheet_(ASSIGNMENTS_V2_SHEET,ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),byId={};for(var i=1;i<assignments.length;i++)byId[String(assignments[i][0])]=assignments[i];
  var batches=getOrCreateSheet_(HOMEWORK_BATCHES_V2_SHEET,HOMEWORK_BATCHES_V2_HEADERS).getDataRange().getValues(),batchDates={};for(var b=1;b<batches.length;b++)if(String(batches[b][2])===studentId&&boolValue_(batches[b][6],true))batchDates[String(batches[b][0])]=lessonDateV2_(batches[b][3]||batches[b][4]);
  var batchLinks=getOrCreateSheet_(HOMEWORK_BATCH_ASSIGNMENTS_V2_SHEET,HOMEWORK_BATCH_ASSIGNMENTS_V2_HEADERS).getDataRange().getValues(),lessonDates={};for(var l=1;l<batchLinks.length;l++)if(String(batchLinks[l][3])===studentId&&batchDates[String(batchLinks[l][1])])lessonDates[String(batchLinks[l][2])]=batchDates[String(batchLinks[l][1])];
  var targets=getOrCreateSheet_(ASSIGNMENT_TARGETS_V2_SHEET,ASSIGNMENT_TARGETS_V2_HEADERS).getDataRange().getValues(),out=[];for(var j=1;j<targets.length;j++){var t=targets[j];if(String(t[2])!==studentId||!boolValue_(t[6],true))continue;var a=byId[String(t[1])];if(!a||!boolValue_(a[8],true)||String(a[1])!==String(student[1]))continue;var storedLink=String(a[5]||''),hintLevel=sentenceHintLevelFromLinkV2_(a[2],storedLink),supportLevel=sentenceReadingSupportFromLinkV2_(a[2],storedLink),metadata=hintLevel?{hint_level:hintLevel,reading_support_level:supportLevel||'beginner'}:{},launch=createStudentCapability_('assignmentTarget',String(t[0]),['updateAssignmentStatus','launchAssignment','startAttemptV2'],{student_id:studentId},a[7]?new Date(a[7]).getTime()+30*86400000:0,metadata),availability=String(a[2])==='VOCAB'?vocabAssignmentAvailabilityV2_(a[3],storedLink):{available:!!storedLink&&assignmentContentAvailableV2_(a[2],a[3],a[11]),reason:storedLink?'INVALID_CONTENT_REF':'MISSING_CONTENT_LINK',link:storedLink};if(availability.available)availability.reason='';out.push({assignment_target_id:t[0],assignment_id:a[0],student_id:studentId,student_name:student[2]||'',content_type:a[2],content_subtype:a[11]||'',content_ref_id:availability.vocab_set_id||a[3],title:a[4],content_link:availability.link||a[5],lesson_date:lessonDates[String(a[0])]||lessonDateV2_(a[6]),assigned_at:a[6],due_at:a[7],status:derivedAssignmentStatus_(t[3],a[7]),stored_status:t[3],content_available:availability.available,unavailable_reason:availability.reason||'',launch_capability:launch});}return {assignments:out};
}
function validateAssignmentLaunchV2_(e,contentType,contentRefId,contentSubtype) {var targetId=String(e.parameter.assignment_target_id||'');if(!targetId)return true;var studentId=String(e.parameter.student_id||''),t=targetByIdV2_(targetId),a=t&&assignmentByIdV2_(t[1]);return !!t&&!!a&&String(t[2])===studentId&&boolValue_(t[6],true)&&boolValue_(a[8],true)&&String(a[2])===String(contentType)&&String(a[3])===String(contentRefId)&&(!contentSubtype||String(a[11])===String(contentSubtype))&&verifyStudentCapability_(e.parameter.assignmentCapability,'launchAssignment','assignmentTarget',targetId,{student_id:studentId});}

// ?action=listAssignments&token=...  (교사용, 토큰 필요)
function handleListAssignments_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    out.push({
      name: values[i][0], updatedAt: values[i][1],
      vocabLabel: values[i][2], vocabLink: values[i][3],
      examLabel: values[i][4], examLink: values[i][5],
      grammarLabel: values[i][6], grammarLink: values[i][7],
      finalQuizLabel: values[i][8] || '', finalQuizLink: values[i][9] || '',
      sentenceLabel: values[i][10] || '', sentenceLink: values[i][11] || ''
    });
  }
  return { assignments: out };
}

function studentAssignmentLoginFields_(studentId) {
  return { assignmentCapability:createStudentCapability_('studentAssignments',String(studentId),['listMyAssignmentsV2','listStudentReviewItems','getAttemptDetailV2'],{student_id:String(studentId)},Date.now()+8*60*60*1000) };
}

function attachAssignmentsToStudentLoginV2_(response, e) {
  if (String(e.parameter.include_assignments || '') !== '1') return response;
  var listed = handleListMyAssignmentsV2_({ parameter: {
    student_id: response.student_id,
    assignmentCapability: response.assignmentCapability
  }});
  response.assignments = listed.assignments || [];
  return response;
}

// ?action=fetchAssignment&name=...&pin=...  (학생용 — 토큰 없음, 이름+PIN 일치가 곧 인증)
function normalizeStudentLoginName_(value) {
  var text = String(value == null ? '' : value);
  try { text = text.normalize('NFC'); } catch (ignore) {}
  return text.trim().replace(/\s+/g, ' ');
}

function normalizeStudentLoginPin_(value) {
  return String(value == null ? '' : value).trim();
}

function handleFetchAssignment_(e) {
  var requestedName = normalizeStudentLoginName_(e.parameter.name);
  var requestedPin = normalizeStudentLoginPin_(e.parameter.pin);
  if (!requestedName || !requestedPin) return { found: false, reason: 'MISSING_CREDENTIALS' };

  var studentSheet = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  var studentValues = studentSheet.getDataRange().getValues();
  var matchingByStudentId = {};
  for (var si = 1; si < studentValues.length; si++) {
    var legacyRow = studentValues[si], linkedStudentId = String(legacyRow[3] || '').trim();
    var linkedV2 = linkedStudentId ? studentV2ById_(linkedStudentId) : null;
    var legacyName = normalizeStudentLoginName_(legacyRow[0]);
    var currentName = normalizeStudentLoginName_(linkedV2 ? linkedV2[2] : legacyRow[0]);
    var pinMatches = normalizeStudentLoginPin_(legacyRow[1]) === requestedPin;
    if (pinMatches && (currentName === requestedName || legacyName === requestedName)) {
      var matchKey = linkedStudentId || 'legacy-row-' + si;
      matchingByStudentId[matchKey] = { legacy: legacyRow, v2: linkedV2, student_id: linkedStudentId };
    }
  }
  var matchingRows = Object.keys(matchingByStudentId).map(function(key) { return matchingByStudentId[key]; });
  // 같은 이름은 PIN으로 구분하지만, 이름+PIN까지 같은 행이 둘 이상이면 추측하지 않는다.
  if (matchingRows.length !== 1) return { found: false, ambiguous: matchingRows.length > 1, reason: matchingRows.length > 1 ? 'AMBIGUOUS' : 'NO_MATCH' };
  var match = matchingRows[0], studentRow = match.legacy;
  var studentId = match.student_id;
  if (!studentId) return { found: false, reason: 'STUDENT_ID_LINK_MISSING' };
  var v2 = match.v2 || studentV2ById_(studentId);
  if (!v2) return { found: false, reason: 'STUDENT_V2_MISSING' };
  if (!boolValue_(v2[4], true)) return { found: false, inactive: true, reason: 'INACTIVE' };
  var name = String(v2[2] || studentRow[0] || '').trim();

  var assignSheet = getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  var assignRowIdx = findRowByKey_(assignSheet, name);
  if (assignRowIdx === -1 && String(studentRow[0] || '') !== name) assignRowIdx = findRowByKey_(assignSheet, String(studentRow[0] || ''));
  if (assignRowIdx === -1) {
    return attachAssignmentsToStudentLoginV2_(Object.assign({
      found: true, name: name, student_id: studentId, vocabLabel: '', vocabLink: '', examLabel: '', examLink: '',
      grammarLabel: '', grammarLink: '', finalQuizLabel: '', finalQuizLink: '',
      sentenceLabel: '', sentenceLink: ''
    }, studentAssignmentLoginFields_(studentId)), e);
  }
  var row = assignSheet.getRange(assignRowIdx, 1, 1, ASSIGNMENTS_HEADERS.length).getValues()[0];
  return attachAssignmentsToStudentLoginV2_(Object.assign({
    found: true, name: name, student_id: studentId,
    vocabLabel: row[2], vocabLink: row[3],
    examLabel: row[4], examLink: row[5],
    grammarLabel: row[6], grammarLink: row[7],
    finalQuizLabel: row[8] || '', finalQuizLink: row[9] || '',
    sentenceLabel: row[10] || '', sentenceLink: row[11] || ''
  }, studentAssignmentLoginFields_(studentId)), e);
}

// ?action=fetchGrammarSet&key=SETKEY  (학생용 — 교사용 TOKEN 없음)
// translationDraft(교사용 번역초안)는 학생에게 절대 안 나가도록 여기서 지우고 내려준다.
// 학생에게는 이 set의 submitGrammarPractice만 허용하는 capability를 내려준다.
function handleFetchGrammarSet_(e) {
  var subtype='LESSON_PRACTICE',targetId=String(e.parameter.assignment_target_id||'');
  if(targetId){var target=targetByIdV2_(targetId),assignment=target&&assignmentByIdV2_(target[1]);subtype=assignment?String(assignment[11]||'LESSON_PRACTICE'):'';}
  if (['THEORY','BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE'].indexOf(subtype)===-1 || !validateAssignmentLaunchV2_(e, 'GRAMMAR', e.parameter.key, targetId?subtype:'')) return { found:false, error:'forbidden assignment' };
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, GRAMMAR_HEADERS.length).getValues()[0];
  var sentences = [];
  try { sentences = JSON.parse(row[3] || '[]'); } catch (err) {}
  sentences.forEach(function (s) { delete s.translationDraft; delete s.chunkGloss; });
  var theoryContent=parseTheoryContentV1_(row[6]);
  var response = {
    found: true, tag: row[1], tagLabel: row[2], sentences: sentences,
    videoUrl: row[5] || '', content_subtype:subtype,
    question_count:grammarQuestionIdsV1_(sentences).length,
    theory_content:theoryContent
  };
  Object.assign(response,attemptContextForFetchV2_(e));
  response.grammar_progress=grammarProgressForFetchV1_(e);
  if(targetId&&subtype==='THEORY')response.linked_practice_launch=linkedPracticeLaunchForTheoryV1_(target,assignment,String(e.parameter.student_id||''),!!(response.grammar_progress&&response.grammar_progress.completed));
  var auth = studentAuthFields_('grammarSet', e.parameter.key, ['submitGrammarPractice'], {}, 0);
  Object.keys(auth).forEach(function (k) { response[k] = auth[k]; });
  return response;
}

// ?action=listGrammarSets&token=...  (교사용 — 공유했던 세트 목록, 영상 링크 나중에 추가하거나
// 제출현황 볼 때 어느 세트인지 고르는 용도)
function handleListGrammarSets_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var theoryContent=parseTheoryContentV1_(values[i][6]);
    out.push({
      setKey: values[i][0], tag: values[i][1], tagLabel: values[i][2],
      createdAt: values[i][4], videoUrl: values[i][5] || '',
      has_theory_content:theoryContent!==null,
      theory_title:theoryContent?theoryContent.title:'',
      theory_example_count:theoryContent?theoryContent.examples.length:0,
      theory_exam_sentence_count:theoryContent?theoryContent.exam_sentences.length:0
    });
  }
  out.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return { sets: out };
}

// ?action=listGrammarSubmissions&key=SETKEY&token=...  (교사용 — 해석/끊어읽기 제출현황 검토)
function handleListGrammarSubmissions_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(GRAMMAR_SUBMISSIONS_SHEET, GRAMMAR_SUBMISSIONS_HEADERS);
  var values = sh.getDataRange().getValues();
  var key = e.parameter.key;
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (key && String(values[i][1]) !== String(key)) continue;
    var chunkStudent = [], chunkCorrect = [];
    try { chunkStudent = JSON.parse(values[i][6] || '[]'); } catch (err) {}
    try { chunkCorrect = JSON.parse(values[i][7] || '[]'); } catch (err) {}
    out.push({
      date: values[i][0], setKey: values[i][1], name: values[i][2],
      sentenceIndex: values[i][3], sentenceText: values[i][4], interpretation: values[i][5],
      chunkStudent: chunkStudent, chunkCorrect: chunkCorrect, chunkScore: values[i][8]
    });
  }
  return { submissions: out };
}

// ?action=listGrammarFinals&token=...  (교사용 — "최종본 관리" 탭 목록)
function handleListGrammarFinals_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var questions = [];
    try { questions = JSON.parse(values[i][2] || '[]'); } catch (err) {}
    out.push({
      setKey: values[i][0], label: values[i][1], createdAt: values[i][3],
      questionCount: questions.length, folderId: values[i][4] || ''
    });
  }
  out.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return { finals: out };
}

// ?action=listGrammarFinalFolders&token=...  (교사용 — 폴더 트리 전체를 평평하게 반환,
// 화면에서 parentId로 트리 구조를 다시 조립함)
function handleListGrammarFinalFolders_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    out.push({ folderId: values[i][0], name: values[i][1], parentId: values[i][2] || '', createdAt: values[i][3] });
  }
  return { folders: out };
}

// ?action=fetchGrammarFinal&key=SETKEY&nums=1,3,5  (학생용 — 토큰 없음, 최종본 구분문제 테스트 응시)
// nums를 안 주면(비우면) 전체 문제. nums는 업로드된 pptx의 순서상 번호(슬라이드 번호와
// 동일, 1부터 시작) -- exam 모듈의 문항 번호 부분 배정과 같은 방식(parseNumList_/
// filterBySelectedNums_ 재사용).
function handleFetchGrammarFinal_(e) {
  if (!validateAssignmentLaunchV2_(e, 'GRAMMAR', e.parameter.key, 'FINAL_QUIZ')) return { found:false, error:'forbidden assignment' };
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, GRAMMAR_FINALS_HEADERS.length).getValues()[0];
  var questions = [];
  try { questions = JSON.parse(row[2] || '[]'); } catch (err) {}

  var requestedNums = parseNumList_(e.parameter.nums);
  if (requestedNums.length > 0) {
    var fullNums = questions.map(function (_, i) { return i + 1; });
    questions = filterBySelectedNums_(fullNums, questions, requestedNums);
  }

  var response = { found: true, label: row[1], questions: questions };
  Object.assign(response,attemptContextForFetchV2_(e));
  response.grammar_progress=grammarProgressForFetchV1_(e);
  var auth = studentAuthFields_('grammarFinal', e.parameter.key, ['submitGrammarFinalResult'],
    { nums: normalizeNumsScope_(e.parameter.nums) }, 0);
  Object.keys(auth).forEach(function (k) { response[k] = auth[k]; });
  return response;
}

// ?action=listGrammarFinalResults&key=SETKEY&token=...  (교사용 — 결과 확인, key 생략 시 전체)
function handleListGrammarFinalResults_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_RESULTS_SHEET, GRAMMAR_FINAL_RESULTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var key = e.parameter.key;
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (key && String(values[i][1]) !== String(key)) continue;
    out.push({
      date: values[i][0], setKey: values[i][1], name: values[i][2], score: values[i][3],
      count: values[i][4], wrong: values[i][5], timeStr: values[i][6]
    });
  }
  return { results: out };
}

// ?action=listVocabResults&token=...  (교사용 대시보드, 토큰 필요 — 전체 반환)
function handleListVocabResults_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(VOCAB_RESULTS_SHEET, VOCAB_RESULTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    out.push({
      date: values[i][0], name: values[i][1], range: values[i][2], score: values[i][3],
      timeStr: values[i][4], wrong: values[i][5], count: values[i][6], qtype: values[i][7],
      attempt: values[i][8], known: values[i][9]
    });
  }
  return { results: out };
}

// ?action=recentVocabWords&name=...&kind=wrong|known&token=...  (교사용 — 재시험 만들기 미리보기)
// VocabResults에서 이름이 일치하는 행을 최신순으로 최대 5개 찾아 kind에 따라 wrong 또는 known
// 열의 콤마구분 문자열들을 모아 평탄화된 배열로 반환. VocaTest 구버전의 action=recent와 같은
// 응답 포맷(배열 그대로)이라 클라이언트 파싱 로직을 그대로 재사용할 수 있음.
function handleRecentVocabWords_(e) {
  if (e.parameter.token !== getToken_()) return [];
  var name = (e.parameter.name || '').trim();
  var kind = e.parameter.kind === 'known' ? 'known' : 'wrong';
  if (!name) return [];
  var sh = getOrCreateSheet_(VOCAB_RESULTS_SHEET, VOCAB_RESULTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var colIdx = kind === 'known' ? 9 : 5;
  var picked = [];
  for (var i = values.length - 1; i >= 1 && picked.length < 5; i--) {
    if (String(values[i][1]).trim() === name) picked.push(values[i][colIdx] || '');
  }
  var words = [];
  picked.forEach(function (cell) {
    String(cell).split(',').forEach(function (tok) {
      var t = tok.trim(); if (t) words.push(t);
    });
  });
  return words;
}

// ?action=listAllExamResults&token=...  (교사용 대시보드, 토큰 필요 — 전체 시험의 결과를
// 시험 제목과 함께 반환. 기존 listResults는 시험 하나만 조회하는 exam 모듈 결과탭 전용이라
// 그대로 두고, 이건 대시보드 전용으로 별도 추가)
function handleListAllExamResults_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var examSheet = getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  var examValues = examSheet.getDataRange().getValues();
  var titleByKey = {};
  for (var i = 1; i < examValues.length; i++) {
    titleByKey[String(examValues[i][0])] = examValues[i][1];
  }

  var sh = getOrCreateSheet_(RESULTS_SHEET, RESULTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var j = 1; j < values.length; j++) {
    var examKey = String(values[j][1]);
    out.push({
      date: values[j][0], examKey: examKey, title: titleByKey[examKey] || examKey,
      name: values[j][2], score: values[j][3], totalTimeMs: values[j][4]
    });
  }
  return { results: out };
}

// ?action=fetchPractice&key=PRACTICEKEY  (학생용, 토큰 없이 키만으로 조회 — 정답은 절대 포함 안 함)
function handleFetchPractice_(e) {
  if (!validateAssignmentLaunchV2_(e, 'PRACTICE_EXAM', e.parameter.key)) return { found:false, error:'forbidden assignment' };
  var sh = getOrCreateSheet_(PRACTICE_SHEET, PRACTICE_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, PRACTICE_HEADERS.length).getValues()[0];

  var expiresAt = Number(row[7]) || 0;
  if (expiresAt && Date.now() > expiresAt) return { found: false, expired: true };

  var pageImages = [];
  try { pageImages = JSON.parse(row[3] || '[]'); } catch (err) {}
  var questionNums = [];
  try { questionNums = JSON.parse(row[5] || '[]'); } catch (err) {}

  var response = {
    found: true,
    title: row[1],
    range: row[2],
    pageImages: pageImages,
    questionNums: questionNums,
    questionIds: parseJsonValue_(row[8],[])
  };
  Object.assign(response,attemptContextForFetchV2_(e));
  var auth = studentAuthFields_('practice', e.parameter.key, ['submitPracticeResult', 'fetchMyPracticeResult'], {}, expiresAt || 0);
  Object.keys(auth).forEach(function (k) { response[k] = auth[k]; });
  return response;
}

// ?action=fetchMyPracticeResult&key=PRACTICEKEY&name=...&studentCapability=...&resultKey=...
// practice/action 범위 capability와 제출별 resultKey가 모두 맞아야 방금 제출한 결과만 조회된다.
function handleFetchMyPracticeResult_(e) {
  var authorized = getStudentAuthMode_() === 'legacy_student_token'
    ? timingSafeEqual_(e.parameter.studentSubmitToken, getOrCreateStudentSecret_('LEGACY_STUDENT_SUBMIT_TOKEN'))
    : verifyStudentCapability_(e.parameter.studentCapability, 'fetchMyPracticeResult', 'practice', e.parameter.key, {});
  if (!authorized) return { found: false };
  var cached = readCachedStudentResult_('practice', e.parameter.key, e.parameter.resultKey);
  if (!cached || String(cached.name).trim() !== String(e.parameter.name || '').trim()) return { found: false };
  var examSheet = getOrCreateSheet_(PRACTICE_SHEET, PRACTICE_HEADERS);
  var examRowIdx = findRowByKey_(examSheet, e.parameter.key);
  if (examRowIdx === -1) return { found: false };
  var examRow = examSheet.getRange(examRowIdx, 1, 1, PRACTICE_HEADERS.length).getValues()[0];
  var correctAnswers = [];
  try { correctAnswers = JSON.parse(examRow[4] || '[]'); } catch (err) {}
  var questionNums = [];
  try { questionNums = JSON.parse(examRow[5] || '[]'); } catch (err) {}

  cached.correctAnswers = correctAnswers;
  cached.total = correctAnswers.length;
  cached.questionNums = questionNums;
  delete cached.name;
  return cached;
}

// ?action=listPracticeResults&key=PRACTICEKEY&token=...  (교사용, 진짜 토큰 필요)
function handleListPracticeResults_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(PRACTICE_RESULTS_SHEET, PRACTICE_RESULTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) !== String(e.parameter.key)) continue;
    var studentAnswers = [];
    try { studentAnswers = JSON.parse(values[i][5] || '[]'); } catch (err) {}
    out.push({
      date: values[i][0], name: values[i][2], score: values[i][3],
      totalTimeMs: values[i][4], answers: studentAnswers
    });
  }

  var examSheet = getOrCreateSheet_(PRACTICE_SHEET, PRACTICE_HEADERS);
  var examRowIdx = findRowByKey_(examSheet, e.parameter.key);
  var correctAnswers = [];
  if (examRowIdx !== -1) {
    var examRow = examSheet.getRange(examRowIdx, 1, 1, PRACTICE_HEADERS.length).getValues()[0];
    try { correctAnswers = JSON.parse(examRow[4] || '[]'); } catch (err) {}
  }

  return { results: out, correctAnswers: correctAnswers };
}

// ?action=fetchSentenceSet&key=SETKEY  (학생용 — 토큰 없음)
function handleFetchSentenceSet_(e) {
  if (!validateAssignmentLaunchV2_(e, 'SENTENCE_STRUCTURE', e.parameter.key)) return { found:false, error:'forbidden assignment' };
  var sh = getOrCreateSheet_(SENTENCE_SETS_SHEET, SENTENCE_SETS_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, SENTENCE_SETS_HEADERS.length).getValues()[0];
  var passages = [];
  try { passages = JSON.parse(row[2] || '[]'); } catch (err) {}
  var response = { found: true, label: row[1], passages: passages };
  Object.assign(response,attemptContextForFetchV2_(e));
  if(response.attempt_id){var attempt=attemptByIdV2_(response.attempt_id);if(attempt)response.sentence_progress=sentenceStructureProgressV1_(attempt);}
  var auth = studentAuthFields_('sentenceSet', e.parameter.key, ['submitSentenceHomework'], {}, 0);
  Object.keys(auth).forEach(function (k) { response[k] = auth[k]; });
  return response;
}

// 단어 링크는 단어 목록을 URL 자체에 담으므로 서버에 별도 콘텐츠 행이 없다.
// 링크의 충분히 긴 session key를 resourceKey로 삼아 submitVocabResult 한 action만 허용한다.
function handleIssueVocabCapability_(e) {
  var key = String(e.parameter.key || '');
  var traceId=String(e.parameter.trace_id||'');resultTraceLog_(traceId,'ISSUE entry',{key_present:!!key,target_present:!!e.parameter.assignment_target_id,student_present:!!e.parameter.student_id});
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(key)) return { found: false };
  var targetId=String(e.parameter.assignment_target_id||'');
  if(targetId){var target=targetByIdV2_(targetId),a=target&&assignmentByIdV2_(target[1]),vocab=a&&findVocabSetByIdOrSessionV2_(a[3]),studentId=String(e.parameter.student_id||''),launchValid=a&&validateAssignmentLaunchV2_(e,'VOCAB',a[3]),resultGraceValid=!!target&&!!a&&String(target[2])===studentId&&boolValue_(target[6],true)&&boolValue_(a[8],true)&&String(a[2])==='VOCAB'&&String(a[3])===String(vocab&&vocab[0])&&String(vocab&&vocab[2])===key&&verifyStudentCapabilityGrace_(e.parameter.assignmentCapability,'launchAssignment','assignmentTarget',targetId,{student_id:studentId},30*24*60*60*1000);resultTraceLog_(traceId,'ISSUE checks',{target_exists:!!target,assignment_exists:!!a,target_active:!!target&&boolValue_(target[6],true),student_match:!!target&&String(target[2])===studentId,content_ref_id_present:!!a&&!!a[3],vocab_set_exists:!!vocab,session_key_matches:!!vocab&&String(vocab[2])===key,normal_capability_valid:!!launchValid,grace_entered:!launchValid,grace_capability_valid:!!resultGraceValid});if(!a||!vocab||String(vocab[2])!==key||(!launchValid&&!resultGraceValid))return {found:false,error:'forbidden assignment',trace_id:traceId};}
  var response = { found: true, vocab_set_id: targetId && vocab ? vocab[0] : '' };
  Object.assign(response,attemptContextForFetchV2_(e));
  var auth = studentAuthFields_('vocab', key, ['submitVocabResult'], {}, Number(e.parameter.expiresAt) || 0);
  Object.keys(auth).forEach(function (k) { response[k] = auth[k]; });
  response.trace_id=traceId;resultTraceLog_(traceId,'ISSUE success',{attempt_id:response.attempt_id||'',attempt_status:response.attempt_status||''});return response;
}
function findVocabSetV2_(id){var sh=getOrCreateSheet_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS),idx=findRowByKey_(sh,id);return idx===-1?null:sh.getRange(idx,1,1,VOCAB_SETS_V2_HEADERS.length).getValues()[0];}
function findVocabSetByIdOrSessionV2_(ref){if(!vocabSetLookupV2Cache_){var rows=getOrCreateSheet_(VOCAB_SETS_V2_SHEET,VOCAB_SETS_V2_HEADERS).getDataRange().getValues(),byId={},bySession={};for(var i=1;i<rows.length;i++){byId[String(rows[i][0])]=rows[i];if(boolValue_(rows[i][6],true))bySession[String(rows[i][2])]=rows[i];}vocabSetLookupV2Cache_={byId:byId,bySession:bySession};}return vocabSetLookupV2Cache_.byId[String(ref)]||vocabSetLookupV2Cache_.bySession[String(ref)]||null;}

// ?action=listSentenceSets&token=...  (교사용 — 공유했던 세트 목록, "📥 제출현황" 탭에서
// 어느 세트인지 고르는 용도. listGrammarSets와 같은 패턴)
function handleListSentenceSets_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(SENTENCE_SETS_SHEET, SENTENCE_SETS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var passages = [];
    try { passages = JSON.parse(values[i][2] || '[]'); } catch (err) {}
    out.push({ setKey: values[i][0], label: values[i][1], passageCount: passages.length, createdAt: values[i][3] });
  }
  out.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return { sets: out };
}

// ?action=listSentenceSubmissions&key=SETKEY&token=...  (교사용 — 제출현황 탭에서 학생별
// 제출 내용을 그대로 불러와 수업 중 다시 표시/수정하는 데 씀)
function handleListSentenceSubmissions_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(SENTENCE_SUBMISSIONS_SHEET, SENTENCE_SUBMISSIONS_HEADERS);
  ensureSheetHeaders_(sh, SENTENCE_SUBMISSIONS_HEADERS);
  var values = sh.getDataRange().getValues();
  var key = e.parameter.key;
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (key && String(values[i][1]) !== String(key)) continue;
    var chunkGaps = [], sv = [], annotations = [];
    try { chunkGaps = JSON.parse(values[i][6] || '[]'); } catch (err) {}
    try { sv = JSON.parse(values[i][7] || '[]'); } catch (err) {}
    try { annotations = JSON.parse(values[i][9] || '[]'); } catch (err) {}
    out.push({
      date: values[i][0], setKey: values[i][1], name: values[i][2], passageId: values[i][3],
      passageNum: values[i][4], text: values[i][5], chunkGaps: chunkGaps, sv: sv, annotations: annotations, submittedAt: values[i][8]
    });
  }
  return { submissions: out };
}
