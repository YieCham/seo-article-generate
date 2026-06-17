@echo off
chcp 65001 >nul
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo 未找到 npm，请先安装 Node.js 并确保已加入 PATH。
  pause
  exit /b 1
)
call npm run dev
if errorlevel 1 (
  echo.
  echo 启动失败，请检查是否已执行 npm install 并配置 .env 文件。
  pause
)
