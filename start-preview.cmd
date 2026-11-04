@echo off
cd /d "%~dp0"
echo SECOND POPULATION / http://127.0.0.1:8040/
node tools\preview.cjs "%CD%" 8040
