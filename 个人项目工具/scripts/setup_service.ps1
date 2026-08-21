# setup_service.ps1
# 作用：将 daemon.py 注册为 Windows 计划任务（开机自启、后台静默运行）
# 运行方式：右键 PowerShell -> 以管理员身份运行 -> .\setup_service.ps1

$TaskName = "ProjectManagerDaemon"
$ScriptPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "daemon.py"
$ProjectRoot = Split-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DataDir = Join-Path $ProjectRoot "data"

# 确保 data 目录存在
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force
}

# 查找 pythonw.exe (无窗口模式)
$PythonPath = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $PythonPath) {
    # 如果没找到 pythonw，尝试 python
    $PythonPath = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
}

if (-not $PythonPath) {
    Write-Error "未找到 Python 环境，请确保 Python 已加入系统 PATH。"
    exit 1
}

Write-Host "正在注册服务..." -ForegroundColor Green
Write-Host "Python: $PythonPath"
Write-Host "脚本：$ScriptPath"

# 删除旧任务（如果存在）
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 创建计划任务
$action = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$ScriptPath`"" -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd -RunOnlyIfNetworkAvailable:$false
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "个人项目管理系统后台守护服务 (Hermes)"

Write-Host "✅ 服务注册成功！任务名称：$TaskName" -ForegroundColor Green
Write-Host "提示：下次开机将自动启动。如需立即测试，请在任务计划程序中右键运行。"
