[CmdletBinding()]
param(
    [string] $SigningKeyFile = (Join-Path (Split-Path $PSScriptRoot -Parent) '.local\mtc-registrar.snk'),
    [switch] $CreateSigningKey
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$key = [IO.Path]::GetFullPath($SigningKeyFile)
if (-not (Test-Path -LiteralPath $key)) {
    if (-not $CreateSigningKey) {
        throw 'The approved publisher signing key is required. Do not generate a different key for each customer deployment.'
    }
    & git -C $root check-ignore --quiet -- $key
    if ($LASTEXITCODE -ne 0) {
        throw 'A new private signing key must be generated only into Git-ignored storage.'
    }
    [IO.Directory]::CreateDirectory((Split-Path $key -Parent)) | Out-Null
    $rsa = [Security.Cryptography.RSACryptoServiceProvider]::new(2048)
    try {
        $rsa.PersistKeyInCsp = $false
        [IO.File]::WriteAllBytes($key, $rsa.ExportCspBlob($true))
    } finally {
        $rsa.Dispose()
    }
}
& dotnet build (Join-Path $root 'src\registrar-plugin\registrar-plugin.csproj') -c Release --no-incremental --nologo --verbosity quiet `
    '-p:SignAssembly=true' "-p:AssemblyOriginatorKeyFile=$key"
if ($LASTEXITCODE -ne 0) { throw 'Signed registrar assembly build failed.' }
$path = Join-Path $root 'src\registrar-plugin\bin\Release\net462\Mtc.Registrar.dll'
$assembly = [Reflection.AssemblyName]::GetAssemblyName($path)
if ($assembly.Name -ne 'Mtc.Registrar' -or $assembly.GetPublicKeyToken().Length -ne 8) {
    throw 'The registrar assembly was not strong-name signed.'
}
Write-Output 'Signed registrar assembly built. Private signing material was not included in the solution.'
