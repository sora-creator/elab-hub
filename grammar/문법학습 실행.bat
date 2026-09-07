@echo off
chcp 65001 > nul
cd /d "%~dp0"
set "ELAB_PYTHON=..\.venv-grammar\Scripts\python.exe"
if not exist "%ELAB_PYTHON%" (
  echo 문법학습 Python 환경을 찾을 수 없습니다.
  echo .venv-grammar 설치 상태를 확인하세요.
  pause
  exit /b 1
)
"%ELAB_PYTHON%" "mockexam_db\local_bridge.py"
if errorlevel 1 (
  echo.
  echo Python 실행에 실패했습니다. Python 설치 상태를 확인하세요.
  pause
)
