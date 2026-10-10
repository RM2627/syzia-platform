@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale Node.js 22.12 ou superior com npm e PATH. Reabra esta janela.
 echo Consulte README.md para instrucoes.
 pause
 exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
 echo npm nao encontrado. Reinstale Node.js incluindo npm e PATH.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm ci
 if errorlevel 1 (
  echo Falha na instalacao. Verifique a mensagem acima e a conexao.
  pause
  exit /b 1
 )
)
echo Demonstracao ficticia local. Aguarde aparecer Local no terminal.
echo Abra http://127.0.0.1:5173/empresa/ms-auto-ficticia
call npm run dev:demo
pause
