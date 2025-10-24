@echo off
setlocal
rem Simple wrapper to run the PowerShell static server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*

