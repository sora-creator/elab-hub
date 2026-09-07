$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$teacher = Get-Content -LiteralPath (Join-Path $root 'exam\js\teacherApp.js') -Raw -Encoding UTF8
$practice = Get-Content -LiteralPath (Join-Path $root 'practice\index.html') -Raw -Encoding UTF8
$dashboard = Get-Content -LiteralPath (Join-Path $root 'teacher\dashboard.html') -Raw -Encoding UTF8
$wrongnote = Get-Content -LiteralPath (Join-Path $root 'wrongnote\index.html') -Raw -Encoding UTF8
$backend = Get-Content -LiteralPath (Join-Path $root 'exam\sheet_backend.gs') -Raw -Encoding UTF8

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Name) {
  if ($Text -notmatch $Pattern) { throw "FAIL: $Name" }
  Write-Output "PASS: $Name"
}

Assert-Contains $teacher 'data-question-type=' 'Reading type is teacher-editable'
Assert-Contains $teacher 'category_keys:readingCategoryKey\(q\.type\)' 'Reading category is saved'
Assert-Contains $dashboard 'content_type=' 'History sends a content-type filter'
Assert-Contains $dashboard '<option value="READING">.*<option value="PRACTICE_EXAM">' 'Reading and Practice filters are separate'
Assert-Contains $dashboard 'questionMetaText' 'Attempt detail renders metadata'
Assert-Contains $wrongnote 'q\.source_question_no' 'Wrongnote detail renders Reading and Practice metadata'
Assert-Contains $practice 'questions:draft\.nums\.map' 'New Practice saves QuestionsV2 metadata'
Assert-Contains $practice "exam_type:'PRACTICE_EXAM'" 'Practice source is identified'
Assert-Contains $practice 'classifyQuestionTypeByNum\(num\)' 'Practice reuses Reading taxonomy inference'
Assert-Contains $backend 'questionsById=\{\},sourcesById=\{\},categoriesById=\{\},categoriesByQuestionId=\{\}' 'Attempt detail builds in-memory maps'

$detailStart = $backend.IndexOf('function handleGetAttemptDetailV2Enhanced_')
$detailEnd = $backend.IndexOf('function homeworkBatchSummaryV2_', $detailStart)
if ($detailStart -lt 0 -or $detailEnd -lt 0) { throw 'FAIL: Attempt detail function boundaries' }
$detail = $backend.Substring($detailStart, $detailEnd - $detailStart)
if ($detail -match 'reviewQuestionMetaV2_|questionRowV2_|reviewWordMetaV2_') { throw 'FAIL: Attempt detail still performs per-item metadata lookup' }
Write-Output 'PASS: Attempt detail has no per-item metadata lookup'

Assert-Contains $backend "String\(row\[4\]\)\.toUpperCase\(\)!==typeFilter" 'History filters assignments by content type'
Assert-Contains $backend "String\(row\[4\]\)\.toUpperCase\(\)!==typeFilter" 'History preserves attempts while filtering'
Assert-Contains $backend "content_type:'PRACTICE_EXAM'" 'Practice remains a separate track'
Assert-Contains $backend 'oldQuestionIds=' 'Existing Practice question UUIDs are reused'

Write-Output 'READING V1 STATIC TESTS PASS'
