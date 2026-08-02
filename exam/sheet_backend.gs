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
 * - GrammarSets: setKey / tag / tagLabel / sentencesJson / createdAt / videoUrl
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
 */

var EXAMS_SHEET = 'Exams';
var IMAGES_SHEET = 'ExamImages';
var RESULTS_SHEET = 'ExamResults';
var STUDENTS_SHEET = 'Students';
var ASSIGNMENTS_SHEET = 'Assignments';
var GRAMMAR_SHEET = 'GrammarSets';
var IMAGES_FOLDER_NAME = 'MockExamImages (시험보기 프로그램)';

var EXAMS_HEADERS = ['examKey', 'title', 'range', 'questionCount', 'answersJson', 'imageUrlsJson', 'createdAt', 'expiresAt', 'questionNumsJson'];
var IMAGES_HEADERS = ['imageKey', 'url', 'savedAt'];
var RESULTS_HEADERS = ['date', 'examKey', 'name', 'score', 'totalTimeMs', 'answersJson', 'timesJson'];
var STUDENTS_HEADERS = ['name', 'pin', 'createdAt'];
var ASSIGNMENTS_HEADERS = ['name', 'updatedAt', 'vocabLabel', 'vocabLink', 'examLabel', 'examLink', 'grammarLabel', 'grammarLink', 'finalQuizLabel', 'finalQuizLink'];
var GRAMMAR_HEADERS = ['setKey', 'tag', 'tagLabel', 'sentencesJson', 'createdAt', 'videoUrl'];
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

function setup() {
  getOrCreateSheet_(EXAMS_SHEET, EXAMS_HEADERS);
  getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  getOrCreateSheet_(RESULTS_SHEET, RESULTS_HEADERS);
  getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  getOrCreateSheet_(VOCAB_RESULTS_SHEET, VOCAB_RESULTS_HEADERS);
  getOrCreateSheet_(GRAMMAR_SUBMISSIONS_SHEET, GRAMMAR_SUBMISSIONS_HEADERS);
  getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  getOrCreateSheet_(GRAMMAR_FINAL_RESULTS_SHEET, GRAMMAR_FINAL_RESULTS_HEADERS);
  getOrCreateSheet_(GRAMMAR_FINAL_FOLDERS_SHEET, GRAMMAR_FINAL_FOLDERS_HEADERS);
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('TOKEN') || '';
}

function getOrCreateImagesFolder_() {
  var it = DriveApp.getFoldersByName(IMAGES_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(IMAGES_FOLDER_NAME);
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

function textOut_(body) {
  return ContentService.createTextOutput(body);
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

  if (d.token !== getToken_()) {
    return textOut_('no'); // 토큰 불일치 → 조용히 무시(스팸 방지)
  }

  if (d.action === 'uploadImage') return handleUploadImage_(d);
  if (d.action === 'saveExam') return handleSaveExam_(d);
  if (d.action === 'updateAnswers') return handleUpdateAnswers_(d);
  if (d.action === 'submitResult') return handleSubmitResult_(d);
  if (d.action === 'saveStudent') return handleSaveStudent_(d);
  if (d.action === 'deleteStudent') return handleDeleteStudent_(d);
  if (d.action === 'saveAssignment') return handleSaveAssignment_(d);
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
  if (d.action === 'submitVocabResult') return handleSubmitVocabResult_(d);

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

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime, d.imageKey + '.' + ext);
  var folder = getOrCreateImagesFolder_();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var url = 'https://drive.google.com/uc?export=view&id=' + file.getId();

  var sh = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  upsertRow_(sh, d.imageKey, [d.imageKey, url, new Date()]);
  return textOut_('ok');
}

// {action:'saveExam', token, examKey, title, range, questionCount, answers:[1,3,...], imageKeys:[...], questionNums:[18,19,...], expiresAt}
function handleSaveExam_(d) {
  var imgSheet = getOrCreateSheet_(IMAGES_SHEET, IMAGES_HEADERS);
  var imgValues = imgSheet.getDataRange().getValues();
  var urlByKey = {};
  for (var i = 1; i < imgValues.length; i++) {
    urlByKey[String(imgValues[i][0])] = imgValues[i][1];
  }

  var imageUrls = (d.imageKeys || []).map(function (k) {
    return urlByKey[k] || '';
  });

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
    JSON.stringify(d.questionNums || [])
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
  return textOut_('ok');
}

// {action:'saveStudent', token, name, pin}
function handleSaveStudent_(d) {
  if (!d.name) return textOut_('name required');
  var sh = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  upsertRow_(sh, d.name, [d.name, d.pin || '', new Date()]);
  return textOut_('ok');
}

// {action:'deleteStudent', token, name}
function handleDeleteStudent_(d) {
  var sh = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  var rowIdx = findRowByKey_(sh, d.name);
  if (rowIdx !== -1) sh.deleteRow(rowIdx);
  return textOut_('ok');
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
    field('finalQuizLabel', 8), field('finalQuizLink', 9)
  ]);
  return textOut_('ok');
}

// {action:'submitVocabResult', token, name, range, score, timeStr, wrong:[...], count, qtype, attempt, known:[...]}
// vocab/index.html의 sendResult()가 결과 웹훅을 이 백엔드로 등록해두면 자동으로 호출됨(action
// 필드만 추가된 것 — VocaTest 자체 개인 Apps Script를 쓰는 기존 사용자는 이 필드를 무시하므로
// 하위호환에 영향 없음).
function handleSubmitVocabResult_(d) {
  var sh = getOrCreateSheet_(VOCAB_RESULTS_SHEET, VOCAB_RESULTS_HEADERS);
  sh.appendRow([
    new Date(), d.name || '', d.range || '', d.score || '', d.timeStr || '',
    (d.wrong || []).join(', '), d.count || '', d.qtype || '', d.attempt || '', (d.known || []).join(', ')
  ]);
  return textOut_('ok');
}

// {action:'saveGrammarSet', token, setKey, tag, tagLabel, sentences:[{text,matches:[...],tags:{...},translationDraft,chunkGloss:[{en,ko}]}]}
// videoUrl은 여기서 안 보내면(재공유 시 sentences만 새로 보낼 때) 기존 값을 그대로 유지한다 —
// saveGrammarVideo와 saveGrammarSet가 서로의 필드를 덮어쓰지 않게 하기 위한 merge 방식
// (handleSaveAssignment_와 같은 패턴).
function handleSaveGrammarSet_(d) {
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  var rowIdx = findRowByKey_(sh, d.setKey);
  var existing = rowIdx === -1 ? null : sh.getRange(rowIdx, 1, 1, GRAMMAR_HEADERS.length).getValues()[0];
  var videoUrl = Object.prototype.hasOwnProperty.call(d, 'videoUrl') ? (d.videoUrl || '') : (existing ? existing[5] : '');
  upsertRow_(sh, d.setKey, [
    d.setKey, d.tag || '', d.tagLabel || '',
    JSON.stringify(d.sentences || []),
    new Date(),
    videoUrl
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
  var sh = getOrCreateSheet_(GRAMMAR_FINALS_SHEET, GRAMMAR_FINALS_HEADERS);
  upsertRow_(sh, d.setKey, [
    d.setKey, d.label || '', JSON.stringify(d.questions || []), new Date(), d.folderId || ''
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
  var sh = getOrCreateSheet_(GRAMMAR_FINAL_RESULTS_SHEET, GRAMMAR_FINAL_RESULTS_HEADERS);
  sh.appendRow([
    new Date(), d.setKey || '', d.name || '', d.score || '', d.count || '',
    (d.wrong || []).join(', '), d.timeStr || ''
  ]);
  return textOut_('ok');
}

/* ============================= doGet ============================= */
// 전부 JSONP(?callback=...)로 호출됨.
function doGet(e) {
  var cb = e.parameter.callback || 'callback';
  var action = e.parameter.action;

  if (action === 'imageStatus') return jsonpOut_(cb, handleImageStatus_(e));
  if (action === 'fetchExam') return jsonpOut_(cb, handleFetchExam_(e));
  if (action === 'listResults') return jsonpOut_(cb, handleListResults_(e));
  if (action === 'listStudents') return jsonpOut_(cb, handleListStudents_(e));
  if (action === 'listAssignments') return jsonpOut_(cb, handleListAssignments_(e));
  if (action === 'fetchAssignment') return jsonpOut_(cb, handleFetchAssignment_(e));
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

  var requestedNums = parseNumList_(e.parameter.nums);
  var outNums = fullNums;
  if (requestedNums.length > 0) {
    imageUrls = filterBySelectedNums_(fullNums, imageUrls, requestedNums);
    outNums = requestedNums.filter(function (n) { return fullNums.indexOf(n) !== -1; });
  }

  return {
    found: true,
    title: row[1],
    range: row[2],
    questionCount: imageUrls.length,
    imageUrls: imageUrls,
    questionNums: outNums, // 교사용 미리보기(결과 탭)에서 각 이미지가 몇 번 문항인지 표시하는 데 씀
    submitToken: getToken_() // 학생 브라우저가 submitResult를 호출할 때 필요(공개돼도 큰 문제 없는 낮은 보안 수준의 토큰)
  };
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
function handleListStudents_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    out.push({ name: values[i][0], pin: values[i][1], createdAt: values[i][2] });
  }
  return { students: out };
}

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
      finalQuizLabel: values[i][8] || '', finalQuizLink: values[i][9] || ''
    });
  }
  return { assignments: out };
}

// ?action=fetchAssignment&name=...&pin=...  (학생용 — 토큰 없음, 이름+PIN 일치가 곧 인증)
function handleFetchAssignment_(e) {
  var name = (e.parameter.name || '').trim();
  var pin = (e.parameter.pin || '').trim();
  if (!name || !pin) return { found: false };

  var studentSheet = getOrCreateSheet_(STUDENTS_SHEET, STUDENTS_HEADERS);
  var studentRowIdx = findRowByKey_(studentSheet, name);
  if (studentRowIdx === -1) return { found: false };
  var studentRow = studentSheet.getRange(studentRowIdx, 1, 1, STUDENTS_HEADERS.length).getValues()[0];
  if (String(studentRow[1]) !== pin) return { found: false };

  var assignSheet = getOrCreateSheet_(ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  var assignRowIdx = findRowByKey_(assignSheet, name);
  if (assignRowIdx === -1) {
    return {
      found: true, name: name, vocabLabel: '', vocabLink: '', examLabel: '', examLink: '',
      grammarLabel: '', grammarLink: '', finalQuizLabel: '', finalQuizLink: ''
    };
  }
  var row = assignSheet.getRange(assignRowIdx, 1, 1, ASSIGNMENTS_HEADERS.length).getValues()[0];
  return {
    found: true, name: name,
    vocabLabel: row[2], vocabLink: row[3],
    examLabel: row[4], examLink: row[5],
    grammarLabel: row[6], grammarLink: row[7],
    finalQuizLabel: row[8] || '', finalQuizLink: row[9] || ''
  };
}

// ?action=fetchGrammarSet&key=SETKEY  (학생용 — 토큰 없음)
// translationDraft(교사용 번역초안)는 학생에게 절대 안 나가도록 여기서 지우고 내려준다.
// submitToken은 exam 모듈의 fetchExam과 같은 패턴 — 학생 브라우저가 이후
// submitGrammarPractice를 호출할 때 이 값을 그대로 token으로 실어 보낸다.
function handleFetchGrammarSet_(e) {
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  var rowIdx = findRowByKey_(sh, e.parameter.key);
  if (rowIdx === -1) return { found: false };
  var row = sh.getRange(rowIdx, 1, 1, GRAMMAR_HEADERS.length).getValues()[0];
  var sentences = [];
  try { sentences = JSON.parse(row[3] || '[]'); } catch (err) {}
  sentences.forEach(function (s) { delete s.translationDraft; delete s.chunkGloss; });
  return {
    found: true, tag: row[1], tagLabel: row[2], sentences: sentences,
    videoUrl: row[5] || '', submitToken: getToken_()
  };
}

// ?action=listGrammarSets&token=...  (교사용 — 공유했던 세트 목록, 영상 링크 나중에 추가하거나
// 제출현황 볼 때 어느 세트인지 고르는 용도)
function handleListGrammarSets_(e) {
  if (e.parameter.token !== getToken_()) return { error: 'no token' };
  var sh = getOrCreateSheet_(GRAMMAR_SHEET, GRAMMAR_HEADERS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    out.push({
      setKey: values[i][0], tag: values[i][1], tagLabel: values[i][2],
      createdAt: values[i][4], videoUrl: values[i][5] || ''
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

  return { found: true, label: row[1], questions: questions, submitToken: getToken_() };
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
