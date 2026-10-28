# Test-only launcher. Creates no cloud resources and never reads normal env/ADC files.
[CmdletBinding()]
param([ValidatePattern('^attempt[0-9]{2}$')][string]$Attempt = 'attempt01')
$ErrorActionPreference = 'Stop'
$phase2Workspace = Split-Path $PSScriptRoot -Parent
$phase2Run = Join-Path $phase2Workspace '.vercel/security-phase2-local/p2a-20261017-repro-v1'
$phase2Attempt = Join-Path $phase2Run $Attempt
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
$phase2Server=$null
try {
 $phase2Server=Start-Phase2Node @('--import',$phase2Guard,(Join-Path $PSScriptRoot 'security-phase2-emulators.mjs'),$phase2Cli,$phase2Workspace,$phase2Config) $phase2Attempt
 $phase2Ready=$false
 for ($phase2Check=0; $phase2Check -lt 40; $phase2Check++) {
  if ($phase2Server.process.HasExited) { throw 'Emulator launcher stopped before readiness' }
  $phase2Ready=$true
  foreach ($phase2Port in 9097,8287,9297) {
   $phase2Socket=[Net.Sockets.TcpClient]::new()
   try { $phase2Socket.Connect('127.0.0.1',$phase2Port) } catch { $phase2Ready=$false } finally { $phase2Socket.Dispose() }
  }
  if ($phase2Ready) { break }; Start-Sleep -Milliseconds 750
 }
 if (-not $phase2Ready) { throw 'Local emulator readiness timeout' }
 $phase2Test=Start-Phase2Node @('--import',$phase2Guard,'--conditions=react-server','--import','tsx','--test','--test-concurrency=1','--test-reporter=tap','lib/security/phase2A/reproduction.integration.test.ts','lib/schools/aggregateStatistics.test.ts') $phase2Workspace
 if (-not $phase2Test.process.WaitForExit(180000)) { $phase2Test.process.Kill($true); $phase2Test.process.WaitForExit(); throw 'Local test timeout; stopped only owned test process' }
 $phase2Test.stdout.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'tests.tap.log') -Encoding utf8
 $phase2Test.stderr.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'tests.stderr.log') -Encoding utf8
 @{project='demo-phase2-local'; localOnly=$true; exitCode=$phase2Test.process.ExitCode; attempt=$Attempt} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $phase2Attempt 'process-result.json') -Encoding utf8
 Write-Output "Local test attempt: $Attempt; exit code: $($phase2Test.process.ExitCode)"
 if ($phase2Test.process.ExitCode -ne 0) { throw 'Unexpected test result; retained attempt, no application repairs' }
} finally {
 if ($phase2Server) {
  if (-not $phase2Server.process.HasExited) { $phase2Server.process.Kill($true); $phase2Server.process.WaitForExit() }
  $phase2Server.stdout.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'emulators.stdout.log') -Encoding utf8
  $phase2Server.stderr.Result | Set-Content -LiteralPath (Join-Path $phase2Attempt 'emulators.stderr.log') -Encoding utf8
 }
}
