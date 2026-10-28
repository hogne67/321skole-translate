param([switch]$ReadCloud, [string]$AdcPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Check before Node starts: NODE_OPTIONS could otherwise preload code before a JS guard runs.
$testConflicts = @(Get-ChildItem Env: | Where-Object {
  $_.Value -and ($_.Name -match '^(FIREBASE|FIRESTORE|GOOGLE|GCLOUD|CLOUDSDK|GCP_|NEXT_PUBLIC_FIREBASE|NEXT_PUBLIC_GOOGLE)' -or
    $_.Name -in @('NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'))
})
if ($testConflicts.Count -gt 0) { throw 'Ambient cloud, proxy or Node configuration refused. Use a clean PowerShell process.' }

$testWorkspace = Split-Path -Parent $PSScriptRoot
$testNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$testStart = [System.Diagnostics.ProcessStartInfo]::new()
$testStart.FileName = $testNode
$testStart.WorkingDirectory = $testWorkspace
$testStart.UseShellExecute = $false
$testStart.CreateNoWindow = $true
$testStart.RedirectStandardOutput = $true
$testStart.RedirectStandardError = $true
$testStart.Environment.Clear()
foreach ($testName in @('SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA')) {
  $testValue = [Environment]::GetEnvironmentVariable($testName)
  if ($testValue) { $testStart.Environment[$testName] = $testValue }
}
foreach ($testArgument in @('--import','tsx',(Join-Path $PSScriptRoot 'security-cloud-test-preflight.ts'),
  '--project','testbilde-5683f','--bucket','testbilde-5683f.firebasestorage.app')) { $testStart.ArgumentList.Add($testArgument) }
if ($ReadCloud) { $testStart.ArgumentList.Add('--read-cloud') }
if ($AdcPath) { $testStart.ArgumentList.Add('--adc'); $testStart.ArgumentList.Add($AdcPath) }
$testProcess = [System.Diagnostics.Process]::Start($testStart)
$testOutput = $testProcess.StandardOutput.ReadToEndAsync()
$testErrorOutput = $testProcess.StandardError.ReadToEndAsync()
$testProcess.WaitForExit()
[Console]::Out.Write($testOutput.GetAwaiter().GetResult())
[Console]::Error.Write($testErrorOutput.GetAwaiter().GetResult())
$testExit = $testProcess.ExitCode
$testProcess.Dispose()
exit $testExit
