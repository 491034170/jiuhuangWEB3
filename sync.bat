@echo off
setlocal enabledelayedexpansion

REM === 可选：标记安全目录 ===
git config --global --add safe.directory "%cd%"

REM === 检查远端，必要时切到 SSH（注释掉的一行按需启用） ===
REM git remote set-url origin git@github.com:491034170/jiuhuangWEB3.git

REM === 确保默认分支及上游跟踪 ===
git remote set-head origin -a 1>NUL 2>NUL
git branch --set-upstream-to=origin/main main 1>NUL 2>NUL

REM === 暂存与提交（自动带时间戳） ===
git add -A
for /f "tokens=1-3 delims=/:. " %%a in ("%date% %time%") do set TS=%%a_%%b_%%c
git commit -m "chore(sync): %TS%" 1>NUL 2>NUL

REM === 先拉后推，避免冲突；不拉 tag，减少超时 ===
git fetch origin main --no-tags
git pull --rebase origin main || goto :err

git push origin main || goto :err

echo.
echo ✅ Sync done.
exit /b 0

:err
echo.
echo ❌ Sync failed. Try:
echo   1) Use SSH: git remote set-url origin git@github.com:491034170/jiuhuangWEB3.git
echo   2) Shallow fetch: git fetch --depth=1 origin main --no-tags
echo   3) Check VPN/代理/防火墙
exit /b 1
