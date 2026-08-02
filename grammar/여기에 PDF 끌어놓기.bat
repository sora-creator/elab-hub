@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

if "%~1"=="" (
  echo Drag a PDF file onto this icon and drop it.
  echo.
  pause
  exit /b
)

python "%~dp0mockexam_db\drop_ingest.py" %*

echo.
pause
