param([switch]$ExecuteCloud, [string]$ExecutionApproval, [string]$AdcPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required for isolated process launch.' }
if (($ExecuteCloud -and -not $ExecutionApproval) -or ($ExecutionApproval -and -not $ExecuteCloud)) { throw 'Separate execution switch and manifest-bound approval are both required.' }
$phaseOneConflicts = @(Get-ChildItem Env: | Where-Object {
  $_.Value -and ($_.Name -match '^(FIREBASE|FIRESTORE|GOOGLE|GCLOUD|CLOUDSDK|GCP_|NEXT_PUBLIC_FIREBASE|NEXT_PUBLIC_GOOGLE)' -or
    $_.Name -in @('STORAGE_EMULATOR_HOST','CLOUD_STORAGE_EMULATOR_HOST','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'))
})
if ($phaseOneConflicts.Count -gt 0) { throw 'Ambient cloud, proxy or Node configuration refused. Use a clean PowerShell process.' }
$phaseOneStart = [System.Diagnostics.ProcessStartInfo]::new()
$phaseOneStart.FileName = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$phaseOneStart.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$phaseOneStart.UseShellExecute = $false
$phaseOneStart.CreateNoWindow = $true
$phaseOneStart.RedirectStandardOutput = $true
$phaseOneStart.RedirectStandardError = $true
$phaseOneStart.Environment.Clear()
foreach ($phaseOneName in @('SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA')) {
  $phaseOneValue = [Environment]::GetEnvironmentVariable($phaseOneName)
  if ($phaseOneValue) { $phaseOneStart.Environment[$phaseOneName] = $phaseOneValue }
}
foreach ($phaseOneArgument in @('--import','tsx',(Join-Path $PSScriptRoot 'security-cloud-file-test-execute.ts'))) { $phaseOneStart.ArgumentList.Add($phaseOneArgument) }
if ($ExecuteCloud) { $phaseOneStart.ArgumentList.Add('--execute-cloud'); $phaseOneStart.ArgumentList.Add('--execution-approval'); $phaseOneStart.ArgumentList.Add($ExecutionApproval) }
if ($AdcPath) { $phaseOneStart.ArgumentList.Add('--adc'); $phaseOneStart.ArgumentList.Add($AdcPath) }
$phaseOneProcess = [System.Diagnostics.Process]::Start($phaseOneStart)
$phaseOneOutput = $phaseOneProcess.StandardOutput.ReadToEndAsync()
$phaseOneErrorOutput = $phaseOneProcess.StandardError.ReadToEndAsync()
$phaseOneProcess.WaitForExit()
[Console]::Out.Write($phaseOneOutput.GetAwaiter().GetResult())
[Console]::Error.Write($phaseOneErrorOutput.GetAwaiter().GetResult())
$phaseOneExit = $phaseOneProcess.ExitCode
$phaseOneProcess.Dispose()
exit $phaseOneExit
