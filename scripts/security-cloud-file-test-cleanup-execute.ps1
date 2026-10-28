param([switch]$ExecuteCloud, [string]$ExecutionApproval, [string]$AdcPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required for isolated cleanup launch.' }
if (($ExecuteCloud -and -not $ExecutionApproval) -or ($ExecutionApproval -and -not $ExecuteCloud)) { throw 'Separate execution switch and cleanup-manifest approval are both required.' }
$cleanupConflicts = @(Get-ChildItem Env: | Where-Object {
  $_.Value -and ($_.Name -match '^(FIREBASE|FIRESTORE|GOOGLE|GCLOUD|CLOUDSDK|GCP_|NEXT_PUBLIC_FIREBASE|NEXT_PUBLIC_GOOGLE)' -or
    $_.Name -in @('STORAGE_EMULATOR_HOST','CLOUD_STORAGE_EMULATOR_HOST','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'))
})
if ($cleanupConflicts.Count -gt 0) { throw 'Ambient cloud, proxy or Node configuration refused. Use a clean PowerShell process.' }
$cleanupStart = [System.Diagnostics.ProcessStartInfo]::new()
$cleanupStart.FileName = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$cleanupStart.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$cleanupStart.UseShellExecute = $false
$cleanupStart.CreateNoWindow = $true
$cleanupStart.RedirectStandardOutput = $true
$cleanupStart.RedirectStandardError = $true
$cleanupStart.Environment.Clear()
foreach ($cleanupName in @('SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA')) {
  $cleanupValue = [Environment]::GetEnvironmentVariable($cleanupName)
  if ($cleanupValue) { $cleanupStart.Environment[$cleanupName] = $cleanupValue }
}
foreach ($cleanupArgument in @('--import','tsx',(Join-Path $PSScriptRoot 'security-cloud-file-test-cleanup-execute.ts'))) { $cleanupStart.ArgumentList.Add($cleanupArgument) }
if ($ExecuteCloud) { $cleanupStart.ArgumentList.Add('--execute-cloud'); $cleanupStart.ArgumentList.Add('--execution-approval'); $cleanupStart.ArgumentList.Add($ExecutionApproval) }
if ($AdcPath) { $cleanupStart.ArgumentList.Add('--adc'); $cleanupStart.ArgumentList.Add($AdcPath) }
$cleanupProcess = [System.Diagnostics.Process]::Start($cleanupStart)
$cleanupOutput = $cleanupProcess.StandardOutput.ReadToEndAsync()
$cleanupErrorOutput = $cleanupProcess.StandardError.ReadToEndAsync()
$cleanupProcess.WaitForExit()
[Console]::Out.Write($cleanupOutput.GetAwaiter().GetResult())
[Console]::Error.Write($cleanupErrorOutput.GetAwaiter().GetResult())
$cleanupExit = $cleanupProcess.ExitCode
$cleanupProcess.Dispose()
exit $cleanupExit
