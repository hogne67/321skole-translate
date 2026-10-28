param([switch]$ExecuteCloud, [string]$ExecutionApproval, [string]$AdcPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required for isolated fresh phase 1 launch.' }
if (($ExecuteCloud -and -not $ExecutionApproval) -or ($ExecutionApproval -and -not $ExecuteCloud)) { throw 'Separate execution switch and fresh-manifest approval are both required.' }
$freshPhaseConflicts = @(Get-ChildItem Env: | Where-Object {
  $_.Value -and ($_.Name -match '^(FIREBASE|FIRESTORE|GOOGLE|GCLOUD|CLOUDSDK|GCP_|NEXT_PUBLIC_FIREBASE|NEXT_PUBLIC_GOOGLE)' -or
    $_.Name -in @('STORAGE_EMULATOR_HOST','CLOUD_STORAGE_EMULATOR_HOST','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'))
})
if ($freshPhaseConflicts.Count -gt 0) { throw 'Ambient cloud, proxy or Node configuration refused. Use a clean PowerShell process.' }
$freshPhaseStart = [System.Diagnostics.ProcessStartInfo]::new()
$freshPhaseStart.FileName = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$freshPhaseStart.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$freshPhaseStart.UseShellExecute = $false
$freshPhaseStart.CreateNoWindow = $true
$freshPhaseStart.RedirectStandardOutput = $true
$freshPhaseStart.RedirectStandardError = $true
$freshPhaseStart.Environment.Clear()
foreach ($freshPhaseName in @('SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA')) {
  $freshPhaseValue = [Environment]::GetEnvironmentVariable($freshPhaseName)
  if ($freshPhaseValue) { $freshPhaseStart.Environment[$freshPhaseName] = $freshPhaseValue }
}
foreach ($freshPhaseArgument in @('--import','tsx',(Join-Path $PSScriptRoot 'security-cloud-file-test-fresh-execute.ts'))) { $freshPhaseStart.ArgumentList.Add($freshPhaseArgument) }
if ($ExecuteCloud) { $freshPhaseStart.ArgumentList.Add('--execute-cloud'); $freshPhaseStart.ArgumentList.Add('--execution-approval'); $freshPhaseStart.ArgumentList.Add($ExecutionApproval) }
if ($AdcPath) { $freshPhaseStart.ArgumentList.Add('--adc'); $freshPhaseStart.ArgumentList.Add($AdcPath) }
$freshPhaseProcess = [System.Diagnostics.Process]::Start($freshPhaseStart)
$freshPhaseOutput = $freshPhaseProcess.StandardOutput.ReadToEndAsync()
$freshPhaseErrorOutput = $freshPhaseProcess.StandardError.ReadToEndAsync()
$freshPhaseProcess.WaitForExit()
[Console]::Out.Write($freshPhaseOutput.GetAwaiter().GetResult())
[Console]::Error.Write($freshPhaseErrorOutput.GetAwaiter().GetResult())
$freshPhaseExit = $freshPhaseProcess.ExitCode
$freshPhaseProcess.Dispose()
exit $freshPhaseExit
