@ECHO OFF
SETLOCAL
SET /P CLI=<"%~dp0.deveco-cli-path"
node "%CLI%" %*
ENDLOCAL
