@echo off
rem Local dev server for the counter draft tool (ES modules need http, not file://).
rem Usage: serve.cmd [port]   ->  http://localhost:8787
cd /d "%~dp0"
node tools\dev-server.mjs %*
