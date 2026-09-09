@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title MinhaObra - Reiniciar ambiente

echo.
echo ========================================
echo   MINHAOBRA - REINICIO DO AMBIENTE
echo ========================================
echo.

if not exist "package.json" (
    echo ERRO: package.json nao encontrado em:
    echo %CD%
    echo.
    pause
    exit /b 1
)

echo [1/3] Encerrando servidores antigos...

for %%P in (5174 3002) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        echo Encerrando processo %%A da porta %%P...
        taskkill /PID %%A /F >nul 2>&1
    )
)

timeout /t 1 /nobreak >nul

echo.
echo [2/3] Compilando o projeto...
call npm.cmd run build

if errorlevel 1 (
    echo.
    echo ========================================
    echo BUILD FALHOU. Servidores nao iniciados.
    echo ========================================
    pause
    exit /b 1
)

echo.
echo Build concluido com sucesso.
echo.
echo [3/3] Iniciando WEB + API na mesma janela...
echo.

set "API_SCRIPT="

for /f "usebackq delims=" %%S in (`node -e "const s=require('./package.json').scripts||{};const pref=['dev:api','api','dev:server','server','dev:backend','backend','start:api','start:server','start:backend'];let n=pref.find(x=>s[x]);if(!n)n=Object.keys(s).find(x=>x!=='dev'&&x!=='build'&&/(api|server|backend)/i.test(x));if(!n)n=Object.entries(s).find(([k,v])=>k!=='dev'&&k!=='build'&&/3002/.test(String(v)))?.[0];if(n)console.log(n);"`) do (
    set "API_SCRIPT=%%S"
)

start "" /b cmd /c "npm.cmd run dev"

if defined API_SCRIPT (
    echo API detectada: npm run !API_SCRIPT!
    start "" /b cmd /c "npm.cmd run !API_SCRIPT!"
) else (
    echo.
    echo AVISO: nao encontrei automaticamente um script separado para a API.
    echo Scripts disponiveis:
    npm.cmd run
    echo.
)

echo.
echo Aguardando as portas 5174 e 3002...
echo.

set "WEB_OK=NAO"
set "API_OK=NAO"

for /L %%I in (1,1,15) do (
    netstat -ano | findstr ":5174 " | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 set "WEB_OK=SIM"

    netstat -ano | findstr ":3002 " | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 set "API_OK=SIM"

    if "!WEB_OK!"=="SIM" if "!API_OK!"=="SIM" goto :success

    timeout /t 1 /nobreak >nul
)

echo.
echo ========================================
echo   FALHA AO INICIAR TODO O AMBIENTE
echo ========================================

if /I "!WEB_OK!"=="SIM" (
    echo [OK]   WEB: http://localhost:5174/
) else (
    echo [ERRO] WEB: porta 5174 nao esta em LISTENING.
)

if /I "!API_OK!"=="SIM" (
    echo [OK]   API: http://localhost:3002/
) else (
    echo [ERRO] API: porta 3002 nao esta em LISTENING.
)

echo.
echo Verifique as mensagens acima para identificar o erro.
echo.
goto :keepalive

:success
echo.
echo ========================================
echo   AMBIENTE INICIADO COM SUCESSO
echo ========================================
echo.
echo WEB: http://localhost:5174/
echo API: http://localhost:3002/
echo.

:keepalive
echo Pressione Ctrl+C para encerrar esta janela.
cmd /k
