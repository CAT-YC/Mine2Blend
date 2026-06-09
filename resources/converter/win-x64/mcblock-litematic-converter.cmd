@echo off
setlocal
set "ROOT=%~dp0"
"%ROOT%node.exe" "%ROOT%src\batch-obj-export.mjs" %*
