[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ConfigurationFile,
    [Parameter(Mandatory)] [string] $OutputDirectory,
    [switch] $Managed,
    [switch] $PrivateReview
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$name = if ($Managed) { 'MicrosoftTrustedCustomer_managed.zip' } else { 'MicrosoftTrustedCustomer.zip' }
$directory = [IO.Path]::GetFullPath($OutputDirectory)
if ($PrivateReview) {
    $privateRoot = [IO.Path]::GetFullPath((Join-Path $root '.local')) + [IO.Path]::DirectorySeparatorChar
    if (-not $directory.StartsWith($privateRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Exports containing current tenant values are allowed only beneath the Git-ignored .local review directory.'
    }
    & git -C $root check-ignore --quiet -- $directory
    if ($LASTEXITCODE -ne 0) { throw 'The private review output is not Git-ignored.' }
}
$path = Join-Path $directory $name
if (Test-Path -LiteralPath $path) {
    throw "Export already exists; choose a fresh output directory: $path"
}
$source = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed |
    ConvertTo-Json -Compress
$mode = if ($Managed) { 'true' } else { 'false' }
$context = if ($PrivateReview) { '{privateReviewOnly:true}' } else { '{}' }
$result = Invoke-MtcBrowserJob -Configuration $config -JavaScript "$source`nreturn MtcProvisioning.exportSolution($target, $mode, $context);"
if ($result.fileName -ne $name) {
    throw 'Export returned an unexpected filename.'
}
$bytes = [Convert]::FromBase64String($result.base64)
if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) {
    throw 'Export did not return a ZIP archive.'
}
[IO.Directory]::CreateDirectory($directory) | Out-Null
[IO.File]::WriteAllBytes($path, $bytes)
Write-Output "Exported $name ($($bytes.Length) bytes). Private review: $($PrivateReview.IsPresent). Review and remove tenant bindings/current values before public source control."
