# Test-only launcher. Creates no cloud resources and never reads normal env/ADC files.
[CmdletBinding()]
param([ValidatePattern('^attempt[0-9]{2}$')][string]$Attempt = 'attempt01', [switch]$Regression, [switch]$F206, [switch]$F201, [switch]$F202, [switch]$F203, [switch]$F204, [switch]$OriginalBroad, [switch]$RegressionFixturesV2, [switch]$Investigation, [switch]$TraceTransactions, [switch]$FailureControls, [switch]$Reproduction, [switch]$F205, [switch]$F207, [switch]$F208)
$ErrorActionPreference = 'Stop'
if ($FailureControls) { $Regression = $true }
if ($TraceTransactions -and -not ($Regression -or $Investigation)) { throw 'Trace requires local regression project' }
if ($Investigation) { $Regression = $true }
if ($RegressionFixturesV2 -and (-not $Regression -or $OriginalBroad)) { throw 'V2 fixtures require the isolated regression variant' }
if ($OriginalBroad) { $Regression = $true }
$phase2Workspace = Split-Path $PSScriptRoot -Parent
$phase2Run = Join-Path $phase2Workspace '.vercel/security-f209-local/f209-20261017-v1'
$phase2Suite = if ($FailureControls) { 'failure-controls' } elseif ($Investigation) { 'security-licence-local-investigation' } elseif ($F204) { 'security-f204-local-regression' } elseif ($F203) { 'security-f203-local-regression' } elseif ($F202) { 'security-f202-local-regression' } elseif ($F206) { 'security-f206-local-regression' } elseif ($F201) { 'security-f201-local-regression' } elseif ($OriginalBroad) { 'original-broad-regression' } elseif ($Regression) { 'broad-regression' } elseif ($F208) { 'security-f208-local-regression' } elseif ($F207) { 'security-f207-local-regression' } elseif ($F205) { 'security-f207-local-F205-regression' } elseif ($Reproduction) { 'reproduction' } else { 'targeted' }
if ($Reproduction -and (Get-FileHash -LiteralPath (Join-Path $phase2Workspace 'app/api/pdf/board-image/route.ts')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $phase2Run 'board-image.route.before.ts')).Hash) { throw 'Reproduction is reserved for the captured original implementation; refusing to run old expectations against fixed code' }
$phase2Attempt = Join-Path (Join-Path $phase2Run $phase2Suite) $Attempt
if (([int][bool]$F208 + [int][bool]$F207 + [int][bool]$F205 + [int][bool]$Reproduction + [int][bool]$F206 + [int][bool]$F201 + [int][bool]$Regression + [int][bool]$F202 + [int][bool]$F203 + [int][bool]$F204) -gt 1) { throw 'Select one suite only' }
if (Test-Path -LiteralPath $phase2Attempt) { throw 'Refusing to overwrite an existing attempt' }
New-Item -ItemType Directory -Path $phase2Attempt | Out-Null
$phase2Runtime = Join-Path $phase2Attempt 'runtime'
New-Item -ItemType Directory -Path $phase2Runtime | Out-Null
$phase2Node = (Get-Command node.exe -ErrorAction Stop).Source
$phase2Cli = Join-Path $env:APPDATA 'npm/node_modules/firebase-tools/lib/bin/firebase.js'
$phase2Cache = Join-Path $phase2Run 'emulators'
if (-not (Test-Path -LiteralPath $phase2Cache)) {
  New-Item -ItemType Directory -Path $phase2Cache | Out-Null
  Copy-Item -LiteralPath (Join-Path $env:USERPROFILE '.cache/firebase/emulators/cloud-firestore-emulator-v1.20.2.jar') -Destination $phase2Cache
  Copy-Item -LiteralPath (Join-Path $phase2Workspace '.vercel/security-round1/emulators/cloud-storage-rules-runtime-v1.1.3.jar') -Destination $phase2Cache
}
foreach ($phase2Port in 9097,8287,9297,4407,4507,9157) {
  if (Get-NetTCPConnection -LocalPort $phase2Port -State Listen -ErrorAction SilentlyContinue) { throw "Port already in use: $phase2Port" }
}
$phase2Config = Join-Path $phase2Attempt 'firebase.local.json'
@{ firestore=@{rules=(Join-Path $phase2Workspace 'firestore.rules')}; storage=@{rules=(Join-Path $phase2Workspace 'storage.rules')}; emulators=@{
 auth=@{host='127.0.0.1';port=9097}; firestore=@{host='127.0.0.1';port=8287;websocketPort=9157};
 storage=@{host='127.0.0.1';port=9297}; hub=@{host='127.0.0.1';port=4407}; logging=@{host='127.0.0.1';port=4507};
 ui=@{enabled=$false}; singleProjectMode=$true }} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $phase2Config -Encoding utf8
$phase2Env = @{}
foreach ($phase2Name in 'PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','JAVA_HOME') {
 $phase2Value = [Environment]::GetEnvironmentVariable($phase2Name)
 if ($null -ne $phase2Value) { $phase2Env[$phase2Name] = $phase2Value }
}
$phase2Env['USERPROFILE']=$phase2Runtime; $phase2Env['APPDATA']=$phase2Runtime; $phase2Env['LOCALAPPDATA']=$phase2Runtime
$phase2Env['XDG_CONFIG_HOME']=$phase2Runtime; $phase2Env['TEMP']=$phase2Runtime; $phase2Env['TMP']=$phase2Runtime
$phase2Env['CI']='true'; $phase2Env['NO_UPDATE_NOTIFIER']='1'; $phase2Env['FIREBASE_CLI_DISABLE_TELEMETRY']='1'
$phase2Env['METADATA_SERVER_DETECTION']='none'
$phase2Env['FIREBASE_EMULATORS_PATH']=$phase2Cache; $phase2Env['GOOGLE_CLOUD_PROJECT']='demo-phase2-local'
$phase2Env['GCLOUD_PROJECT']='demo-phase2-local'; $phase2Env['FIRESTORE_EMULATOR_HOST']='127.0.0.1:8287'
$phase2Env['FIREBASE_AUTH_EMULATOR_HOST']='127.0.0.1:9097'; $phase2Env['FIREBASE_STORAGE_EMULATOR_HOST']='127.0.0.1:9297'
$phase2Env['FIREBASE_STORAGE_BUCKET']='demo-phase2-local.appspot.com'; $phase2Env['OPENAI_API_KEY']='isolated-test-no-network'
$phase2Env['PHASE2_RESULT_DIR']=$phase2Attempt; $phase2Env['PHASE2_NETWORK_LOG']=(Join-Path $phase2Attempt 'network-denials.jsonl')
$phase2Env['NEXT_PUBLIC_FIREBASE_API_KEY']='synthetic-api-key'; $phase2Env['NEXT_PUBLIC_FIREBASE_PROJECT_ID']='demo-phase2-local'
$phase2Env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN']='demo-phase2-local.invalid'; $phase2Env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET']='demo-phase2-local.appspot.com'
$phase2Ports = @(9097,8287,9297)
if ($Regression) {
 foreach ($phase2Port in 9098,8188,9199) { if (Get-NetTCPConnection -LocalPort $phase2Port -State Listen -ErrorAction SilentlyContinue) { throw 'Regression port in use' } }
 $phase2LocalConfig = Get-Content -LiteralPath $phase2Config -Raw | ConvertFrom-Json
 $phase2LocalConfig.emulators.auth.port=9098; $phase2LocalConfig.emulators.firestore.port=8188; $phase2LocalConfig.emulators.storage.port=9199
 $phase2LocalConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $phase2Config -Encoding utf8
 $phase2Env['GOOGLE_CLOUD_PROJECT']='demo-security-round1'; $phase2Env['GCLOUD_PROJECT']='demo-security-round1'
 $phase2Env['FIRESTORE_EMULATOR_HOST']='127.0.0.1:8188'; $phase2Env['FIREBASE_AUTH_EMULATOR_HOST']='127.0.0.1:9098'; $phase2Env['FIREBASE_STORAGE_EMULATOR_HOST']='127.0.0.1:9199'
 $phase2Env['FIREBASE_STORAGE_BUCKET']='demo-security-round1.appspot.com'; $phase2Ports=@(9098,8188,9199)
}
function Start-Phase2Node([string[]]$NodeArgs, [string]$WorkingDirectory) {
 Write-OutputToHost -Arguments $NodeArgs -Directory $WorkingDirectory
 $phase2Start = [Diagnostics.ProcessStartInfo]::new($phase2Node)
 $phase2Start.WorkingDirectory=$WorkingDirectory; $phase2Start.UseShellExecute=$false; $phase2Start.CreateNoWindow=$true
 $phase2Start.RedirectStandardOutput=$true; $phase2Start.RedirectStandardError=$true; $phase2Start.Environment.Clear()
 foreach ($phase2Pair in $phase2Env.GetEnumerator()) { $phase2Start.Environment[$phase2Pair.Key]=$phase2Pair.Value }
 foreach ($phase2Arg in $NodeArgs) { $phase2Start.ArgumentList.Add($phase2Arg) }
 $phase2Process=[Diagnostics.Process]::Start($phase2Start)
 return @{process=$phase2Process; stdout=$phase2Process.StandardOutput.ReadToEndAsync(); stderr=$phase2Process.StandardError.ReadToEndAsync()}
}
function Write-OutputToHost([string[]]$Arguments,[string]$Directory) {
 [pscustomobject]@{arguments=$Arguments;workingDirectory=$Directory} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $phase2Attempt ('launch-'+[Guid]::NewGuid().ToString('N')+'.json')) -Encoding utf8
 Write-Host "Starting isolated Node process ($($Arguments.Count) arguments)"
}
$phase2Guard=([Uri](Join-Path $PSScriptRoot 'security-phase2-loopback-guard.mjs')).AbsoluteUri
$phase2Sources = @('lib/security/f208/uploadLifecycle.integration.test.ts','scripts/security-f209-local.ps1','lib/spaceFiles.client.ts','lib/security/f207/privateUploadIntegrity.integration.test.ts','app/api/space-files/[id]/route.ts','app/api/images/generate/route.ts','lib/security/licenceTransactions.integration.test.ts','scripts/security-licence-local.ps1','storage.rules','firestore.rules','lib/security/f205/spaceOwnership.integration.test.ts','lib/security/spaceAccess.ts','lib/security/spaceAccess.server.ts','lib/security/f202/writingImages.integration.test.ts','.vercel/security-licence-local/licence-20261017-v1/regression-source/f201-accounts.test.ts','.vercel/security-licence-local/licence-20261017-v1/regression-source/f206-submissions.test.ts')
$phase2Sources += @('lib/spaceJoinPolicy.ts','lib/studentSpaceMembership.ts','lib/spaceMembership.ts','lib/server/teacherPupilRoster.ts','app/api/images/generate/route.ts','app/api/admin/users/anonymous/route.ts','app/api/teacher/spaces/[spaceId]/members/[memberId]/route.ts','app/api/teacher/spaces/[spaceId]/members/[memberId]/student-code/route.ts')
$phase2Sources += @('.vercel/security-licence-local/licence-20261017-v1/regression-source/f204-schools.test.ts','lib/contentFeed.ts','.vercel/security-licence-local/licence-20261017-v1/regression-source/f203-members.test.ts','app/api/teacher/spaces/create/route.ts')
$phase2Sources += @(Get-ChildItem -LiteralPath (Join-Path $phase2Workspace '.vercel/security-licence-local/licence-20261017-v1/regression-source') -Filter '*.test.ts' | ForEach-Object { [IO.Path]::GetRelativePath($phase2Workspace,$_.FullName) })
$phase2Sources += @('lib/spaceFiles.server.ts','lib/spaceFiles.ts','lib/security/spaceAccess.server.ts','scripts/security-f207-local.ps1')
$phase2Sources += @('lib/pdf/safeImage.server.ts','lib/security/f209/pdfImages.integration.test.ts','lib/security/f209/reproduction.integration.test.ts','scripts/security-f209-normal-react.mjs','app/api/pdf/board-image/route.ts','app/api/pdf/lesson/route.ts','app/[locale]/image-live/host/[sessionId]/display/page.tsx')
$phase2Sources += @('.vercel/security-f207-local/f207-20261017-v1/regression-source/f205-owners.test.ts','lib/server/runCapacityTransaction.ts','lib/server/runCapacityTransaction.test.ts','lib/security/licenceFailures.integration.test.ts','lib/schools/server/createSchoolInvite.ts','lib/schools/server/activateSchoolTeacher.ts','lib/schools/server/acceptSchoolInvite.ts')
@($phase2Sources | Sort-Object -Unique | ForEach-Object { @{ path=$_; sha256=(Get-FileHash -LiteralPath (Join-Path $phase2Workspace $_) -Algorithm SHA256).Hash.ToLowerInvariant() } }) | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $phase2Attempt 'source-hashes.json') -Encoding utf8
$phase2Server=$null
try {
 $phase2Server=Start-Phase2Node @('--import',$phase2Guard,(Join-Path $PSScriptRoot 'security-f201-emulators.mjs'),$phase2Cli,$phase2Workspace,$phase2Config) $phase2Attempt
 $phase2Ready=$false
 for ($phase2Check=0; $phase2Check -lt 120; $phase2Check++) {
  if ($phase2Server.process.HasExited) { throw 'Emulator launcher stopped before readiness' }
  $phase2Ready=$true
  foreach ($phase2Port in $phase2Ports) {
   $phase2Socket=[Net.Sockets.TcpClient]::new()
   try { $phase2Socket.Connect('127.0.0.1',$phase2Port) } catch { $phase2Ready=$false } finally { $phase2Socket.Dispose() }
  }
  if ($phase2Ready) { break }; Start-Sleep -Milliseconds 750
 }
 if (-not $phase2Ready) { throw 'Local emulator readiness timeout' }
 $phase2TestFiles = @('lib/security/f209/pdfImages.integration.test.ts')
 if ($F208) { $phase2TestFiles=@('lib/security/f208/uploadLifecycle.integration.test.ts') }
 if ($Reproduction) { $phase2TestFiles=@('lib/security/f209/reproduction.integration.test.ts') }
 if ($F207) { $phase2TestFiles=@('lib/security/f207/privateUploadIntegrity.integration.test.ts') }
 if ($F205) { $phase2TestFiles=@('.vercel/security-f207-local/f207-20261017-v1/regression-source/f205-owners.test.ts') }
 if ($F204) { $phase2TestFiles=@('.vercel/security-licence-local/licence-20261017-v1/regression-source/f204-schools.test.ts') }
 if ($F203) { $phase2TestFiles=@('.vercel/security-licence-local/licence-20261017-v1/regression-source/f203-members.test.ts') }
 if ($F202) { $phase2TestFiles=@('.vercel/security-licence-local/licence-20261017-v1/regression-source/f202-images.test.ts') }
 if ($F201) { $phase2TestFiles=@('.vercel/security-licence-local/licence-20261017-v1/regression-source/f201-accounts.test.ts','lib/schools/aggregateStatistics.test.ts') }
 if ($F206) { $phase2TestFiles=@('.vercel/security-licence-local/licence-20261017-v1/regression-source/f206-submissions.test.ts','lib/schools/aggregateStatistics.test.ts') }; if ($Regression) { $phase2TestFiles=@('lib/security/access.integration.test.ts','lib/security/privateFiles.integration.test.ts','lib/security/privateFiles.client.test.ts','.vercel/security-licence-local/licence-20261017-v1/regression-source/staging.test.ts','lib/security/schools.integration.test.ts','lib/spaceOnboarding.integration.test.ts','lib/submissions/status.test.ts') }
 if ($Regression -and -not $OriginalBroad) {
  $phase2TestFiles=$phase2TestFiles | ForEach-Object { if ($_ -eq 'lib/security/access.integration.test.ts') { '.vercel/security-licence-local/licence-20261017-v1/regression-source/access.test.ts' } elseif ($_ -eq 'lib/security/schools.integration.test.ts') { '.vercel/security-licence-local/licence-20261017-v1/regression-source/schools.test.ts' } elseif ($_ -eq 'lib/spaceOnboarding.integration.test.ts') { '.vercel/security-licence-local/licence-20261017-v1/regression-source/onboarding.test.ts' } else { $_ } }
  $phase2TestFiles += '.vercel/security-licence-local/licence-20261017-v1/regression-source/join-policy.test.ts'
 }
 if ($RegressionFixturesV2) {
  $phase2TestFiles = $phase2TestFiles | ForEach-Object { $_.Replace('/access.test.ts','/access-v2.test.ts').Replace('/onboarding.test.ts','/onboarding-v2.test.ts') }
 }
 if ($Investigation) { $phase2TestFiles = @('lib/security/licenceTransactions.integration.test.ts') }
 if ($FailureControls) { $phase2TestFiles = @('lib/security/licenceFailures.integration.test.ts','lib/server/runCapacityTransaction.test.ts') }
 $phase2TestArgs=@('--import',$phase2Guard,'--conditions=react-server','--import','tsx','--test','--test-concurrency=1','--test-reporter=tap')
 if ($TraceTransactions) { $phase2TestArgs=@('--import',$phase2Guard,'--conditions=react-server','--import','tsx','--import',([Uri](Join-Path $PSScriptRoot 'security-licence-trace-v2.mjs')).AbsoluteUri,'--test','--test-concurrency=1','--test-reporter=tap') }
 if (-not ($F201 -or $F202 -or $F203 -or $F204 -or $F205 -or $F206 -or $F207 -or $F208 -or $Regression)) { $phase2TestArgs=@('--import',$phase2Guard,'--import',([Uri](Join-Path $PSScriptRoot 'security-f209-normal-react.mjs')).AbsoluteUri,'--import','tsx','--test','--test-concurrency=1','--test-reporter=tap') }
 $phase2Test=Start-Phase2Node ($phase2TestArgs + $phase2TestFiles) $phase2Workspace
 if (-not $phase2Test.process.WaitForExit(300000)) { $phase2Test.process.Kill($true); $phase2Test.process.WaitForExit(); throw 'Local test timeout; stopped only owned test process' }
 $phase2Test.stdout.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'tests.tap.log') -Encoding utf8
 $phase2Test.stderr.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'tests.stderr.log') -Encoding utf8
 @{project=$phase2Env['GOOGLE_CLOUD_PROJECT']; localOnly=$true; exitCode=$phase2Test.process.ExitCode; attempt=$Attempt; regression=[bool]$Regression; suite=$phase2Suite} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $phase2Attempt 'process-result.json') -Encoding utf8
 Write-Output "Local test attempt: $Attempt; exit code: $($phase2Test.process.ExitCode)"
 if ($phase2Test.process.ExitCode -ne 0) { throw 'Unexpected test result; retained attempt, no application repairs' }
} finally {
 if ($phase2Server) {
  if (-not $phase2Server.process.HasExited) { $phase2Server.process.Kill($true); $phase2Server.process.WaitForExit() }
  $phase2Server.stdout.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'emulators.stdout.log') -Encoding utf8
  $phase2Server.stderr.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'emulators.stderr.log') -Encoding utf8
 }
}

