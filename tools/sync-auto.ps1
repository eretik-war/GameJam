param(
    [ValidateSet('install', 'remove', 'status', 'run')]
    [string]$Action = 'status',
    [string]$NodePath
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot 'sync.mjs'
$gitDirectory = & git -C $projectRoot rev-parse --path-format=absolute --git-path gamejam-sync
if ($LASTEXITCODE -ne 0) { throw 'Open a Git clone of GameJam first.' }
New-Item -ItemType Directory -Path $gitDirectory -Force | Out-Null
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-', '').Substring(0, 12) }
finally { $sha.Dispose() }
$taskName = 'GameJam-Sync-' + $suffix
$configPath = Join-Path $gitDirectory 'auto.json'

if ($Action -eq 'run') {
    if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
    $logPath = Join-Path $gitDirectory 'auto.log'
    if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 1MB) {
        Move-Item -LiteralPath $logPath -Destination ($logPath + '.old') -Force
    }
    Set-Location -LiteralPath $projectRoot
    & $NodePath $syncScript pull --background *>> $logPath
    exit $LASTEXITCODE
}

if ($Action -eq 'remove') {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    if (Test-Path -LiteralPath $configPath) { Remove-Item -LiteralPath $configPath }
    Write-Output "Automatic sync removed: $taskName"
    exit
}

if ($Action -eq 'status') {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) { Write-Output 'Automatic sync is not installed for this folder.'; exit }
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    [pscustomobject]@{
        taskName = $task.TaskName
        state = [string]$task.State
        lastRunTime = $info.LastRunTime.ToString('o')
        lastTaskResult = $info.LastTaskResult
        nextRunTime = $info.NextRunTime.ToString('o')
    } | ConvertTo-Json | Write-Output
    exit
}

$NodePath = (Get-Command node -ErrorAction Stop).Source
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$hostPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Action run -NodePath "' + $NodePath + '"'
$taskAction = New-ScheduledTaskAction -Execute $hostPath -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'GameJam: fetch origin/main and fast-forward only when the working tree is clean. Never commits or pushes automatically.' -Force | Out-Null
@{ taskName = $taskName; root = $projectRoot; intervalMinutes = 5; installedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Output "Automatic sync enabled every 5 minutes while $user is signed in: $taskName"
Start-ScheduledTask -TaskName $taskName
