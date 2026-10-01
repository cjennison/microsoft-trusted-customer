[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [string] $ConfigurationFile
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
if (-not $PSCmdlet.ShouldProcess($config.environmentOrigin, 'Create or verify the MTC development foundation')) {
    return
}
$source = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed |
    ConvertTo-Json -Compress
$report = Invoke-MtcBrowserJob -Configuration $config -JavaScript "$source`nreturn MtcProvisioning.bootstrap($target);"
$report | ConvertTo-Json -Depth 5
