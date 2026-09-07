$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
function Read([string]$path) { Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root $path) }
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message }; Write-Host "PASS $message" }

$transport = Read 'shared\appsScriptTransport.js'
$student = Read 'student\index.html'
$utils = Read 'exam\js\utils.js'
$studentApp = Read 'exam\js\studentApp.js'
$grammar = Read 'grammar\index.html'
$practice = Read 'practice\index.html'
$vocab = Read 'vocab\index.html'
$dashboard = Read 'teacher\dashboard.html'
$backend = Read 'exam\sheet_backend.gs'

Assert ($transport -match "redirect:'follow'") 'common read follows Apps Script redirects'
Assert ($transport -match "JSON\.parse\(body\)") 'common read accepts plain JSON'
Assert ($transport -match "prefix=callback\+'\('") 'common read accepts matching JSONP wrapper'
Assert ($transport -match "NETWORK_ERROR" -and $transport -match "HTTP_ERROR" -and $transport -match "PARSE_ERROR" -and $transport -match "AUTH_ERROR" -and $transport -match "SERVER_ERROR") 'common read exposes required error classes'

$studentReads = @($student, $utils, $grammar, $practice, $vocab)
$studentReadText = $studentReads -join "`n"
Assert (-not $studentReadText.Contains("createElement('script')")) 'student track reads do not create JSONP script elements'
Assert (-not $studentReadText.Contains('createElement("script")')) 'student track reads do not create JSONP script elements with double quotes'
Assert ($student -match 'ELABAppsScript\.read') 'student login and assignment list use common fetch read'
Assert ($utils -match 'ELABAppsScript\.read') 'exam and sentence reads use common fetch read'
Assert ($grammar -match 'ELABAppsScript\.read') 'grammar reads use common fetch read'
Assert ($practice -match 'ELABAppsScript\.read') 'practice reads use common fetch read'
Assert ($vocab -match 'return fetchJsonpObject') 'vocabulary legacy jsonpFetch delegates to fetch transport'

Assert ($backend -match "'verifyAttemptCompletionV2'") 'attempt capability includes common completion verification'
Assert ($backend -match "attemptComplete&&targetComplete") 'completion requires both Attempt and Target COMPLETED'
Assert ($backend -match "ATTEMPT_INCOMPLETE" -and $backend -match "TARGET_INCOMPLETE" -and $backend -match "INCOMPLETE_ITEMS") 'completion mismatch reasons are explicit'
Assert ($backend -match "verifyStudentCapability_\(e\.parameter\.attemptCapability,'verifyAttemptCompletionV2'") 'completion verifier preserves student capability scope'
Assert ($studentApp -match 'SENTENCE_VERIFY_START' -and $studentApp -match 'SENTENCE_COMPLETE_NOT_CONFIRMED' -and $studentApp -match "completion\.attempt_status==='COMPLETED'" -and $studentApp -match "completion\.target_status==='COMPLETED'") 'sentence incomplete submission cannot show silent success'
Assert ($grammar -match 'verifyGrammarCompletion') 'grammar theory and practice use completion verifier'
Assert ($practice -match 'ELABAppsScript\.verifyCompletion') 'practice final submission uses completion verifier'
Assert ($backend -match 'persistedCount.*duplicate') 'assignment batch checks persistent request_id before writing'
Assert ($backend -match 'function verifyDataIntegrityV2') 'read-only integrity verifier exists'
Assert ($backend -match 'duplicate_assignment_targets' -and $backend -match 'orphan_question_items' -and $backend -match 'orphan_review_events') 'integrity verifier covers required orphan and duplicate cases'
Assert (-not ($dashboard -match 'Element\.prototype\.appendChild=function|document\.body\.appendChild=function')) 'dashboard transport monkeypatch wrappers are removed'
Assert ($dashboard -match 'ELABAppsScript\.read') 'dashboard has one explicit fetch transport path'

Write-Host 'ELAB P0 TRANSPORT STATIC PASS'
