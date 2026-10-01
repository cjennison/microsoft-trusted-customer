[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ConfigurationFile,
    [Parameter(Mandatory)] [string] $OutputDirectory,
    [switch] $Managed
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$name = if ($Managed) { 'MicrosoftTrustedCustomer_managed.zip' } else { 'MicrosoftTrustedCustomer.zip' }
$directory = [IO.Path]::GetFullPath($OutputDirectory)
$path = Join-Path $directory $name
if (Test-Path -LiteralPath $path) {
    throw "Export already exists; choose a fresh output directory: $path"
}
$source = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed |
    ConvertTo-Json -Compress
$mode = if ($Managed) { 'true' } else { 'false' }
$result = Invoke-MtcBrowserJob -Configuration $config -JavaScript "$source`nreturn MtcProvisioning.exportSolution($target, $mode);"
if ($result.fileName -ne $name) {
    throw 'Export returned an unexpected filename.'
}
$bytes = [Convert]::FromBase64String($result.base64)
if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) {
    throw 'Export did not return a ZIP archive.'
}
[IO.Directory]::CreateDirectory($directory) | Out-Null
[IO.File]::WriteAllBytes($path, $bytes)
Write-Output "Exported $name ($($bytes.Length) bytes). Review before unpacking into public source control."
