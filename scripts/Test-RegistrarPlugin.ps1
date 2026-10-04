[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root 'artifacts\registrar-tests'
& dotnet build (Join-Path $root 'test\registrar-plugin\registrar-plugin.test.csproj') -c Release --nologo --verbosity quiet `
    --output $output '-p:SignAssembly=false'
if ($LASTEXITCODE -ne 0) { throw 'Registrar plug-in test build failed.' }
& (Join-Path $output 'Mtc.Registrar.Tests.exe')
if ($LASTEXITCODE -ne 0) { throw 'Registrar plug-in behavior tests failed.' }
