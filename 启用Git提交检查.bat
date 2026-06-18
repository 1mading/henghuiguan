@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在配置 Git 提交前敏感信息检查...
git config core.hooksPath .githooks
if errorlevel 1 (
  echo 配置失败，请在本仓库根目录手动执行: git config core.hooksPath .githooks
  exit /b 1
)
echo.
echo 已启用 .githooks/pre-commit
echo 每次 git commit 将自动运行 scripts/check-secrets.js
echo.
node scripts\check-secrets.js --staged
echo.
echo 若需从 Git 追踪中移除已提交的敏感文件，示例:
echo   git rm --cached server/src/db/seed-data.json
echo   git rm --cached server/.env
pause
