param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
python (Join-Path $PSScriptRoot 'scripts\serve.py') --port $Port
exit $LASTEXITCODE
