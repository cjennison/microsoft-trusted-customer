[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param([Parameter(Mandatory)] [string] $ConfigurationFile)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
if (-not $PSCmdlet.ShouldProcess($config.environmentOrigin, 'Create or update the separately authorized Outlook presentation flow in Off state')) { return }
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
$source = @(
    Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
    Get-Content -LiteralPath (Join-Path $root 'src\runtime\presentation-flow.js') -Raw
) -join "`n"
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed | ConvertTo-Json -Compress
Invoke-MtcBrowserJob -Configuration $config -JavaScript "$source`nreturn MtcPresentationFlow.install($target);" | ConvertTo-Json -Depth 4
