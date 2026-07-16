@echo off
chcp 65001 >nul
title 恒慧管 - 本地服务器
cd /d "%~dp0server"

echo.
echo  恒慧管本地服务器
echo  ==================
echo  数据目录: %~dp0server\data\
echo  按 Ctrl+C 可停止服务
echo.

npm start
