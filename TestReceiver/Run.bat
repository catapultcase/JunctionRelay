@echo off
setlocal

set "ROOT_DIR=%~dp0"

echo Activating virtual environment...
call "%ROOT_DIR%venv\Scripts\activate"

echo Installing required Python modules...
python -m pip install flask

echo Starting Python scripts...
cd "%ROOT_DIR%TestReceiver"
start cmd /k "python TestReceiver5000.py"
start cmd /k "python TestReceiver5005.py"

echo Python scripts started. Closing this window...
exit
