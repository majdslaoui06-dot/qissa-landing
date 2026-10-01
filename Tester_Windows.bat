@echo off
rem Qissa - test en local (Windows) : double-cliquez sur ce fichier.
rem Si Python n'est pas installe, le lanceur en installe un dans ce dossier (.tools), sans droits administrateur.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
set "UV_PYTHON_INSTALL_DIR=%CD%\.tools\python"
set "UV_CACHE_DIR=%CD%\.tools\cache"
if exist ".venv\Scripts\python.exe" goto deps
set "PY="
where py >nul 2>nul && py -3 -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul && set "PY=py -3"
if not defined PY python -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul && set "PY=python"
if not defined PY goto uvinstall
echo Premiere installation, 1 a 2 minutes...
%PY% -m venv .venv
if errorlevel 1 goto fail
goto deps
:uvinstall
echo Python n'est pas installe : installation d'un Python pour Qissa dans ce dossier, 2 a 3 minutes...
if exist ".tools\uv.exe" goto uvvenv
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; New-Item -ItemType Directory -Force '.tools' | Out-Null; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile '.tools\uv.zip'; Expand-Archive -Force '.tools\uv.zip' '.tools'; Remove-Item '.tools\uv.zip'"
if not exist ".tools\uv.exe" goto fail
:uvvenv
".tools\uv.exe" venv .venv --python 3.12 --managed-python
if errorlevel 1 goto fail
:deps
echo Verification des modules...
if exist ".tools\uv.exe" goto depsuv
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r server\requirements.txt
if errorlevel 1 goto fail
goto run
:depsuv
".tools\uv.exe" pip install -q --python .venv\Scripts\python.exe -r server\requirements.txt
if errorlevel 1 goto fail
:run
".venv\Scripts\python.exe" tools\tester.py %*
pause
exit /b 0
:fail
echo Installation impossible : verifiez la connexion internet puis relancez.
pause
exit /b 1
