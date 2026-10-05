# Serve the gallery and all reconstruction viewers: .\tools\serve.ps1 [-Port 8000] [-Building bundeshaus]
param([int]$Port = 8000, [string]$Building = '')
$ErrorActionPreference = 'Stop'
$arguments = @((Join-Path $PSScriptRoot 'serve.py'), '--port', $Port)
if ($Building) { $arguments += @('--building', $Building) }
python @arguments
exit $LASTEXITCODE
