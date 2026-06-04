@echo off
title WPPConnect Server - Mesquita Imoveis
echo ============================================
echo  Iniciando servidor WhatsApp (WPPConnect)
echo ============================================
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
)
node server.js
pause
