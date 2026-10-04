[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)] [string] $ConfigurationFile,
    [Parameter(Mandatory)] [ValidateSet('single-registrar')] [string] $VerificationAuthorityMode,
    [string] $AssemblyFile = (Join-Path (Split-Path $PSScriptRoot -Parent) 'src\registrar-plugin\bin\Release\net462\Mtc.Registrar.dll'),
    [switch] $AssignCurrentUser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$assembly = [Reflection.AssemblyName]::GetAssemblyName([IO.Path]::GetFullPath($AssemblyFile))
if ($assembly.Name -ne 'Mtc.Registrar' -or $assembly.GetPublicKeyToken().Length -ne 8) {
    throw 'Deployment requires the reviewed, strong-name-signed Mtc.Registrar assembly, not an unsigned test build.'
}
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
if (-not $PSCmdlet.ShouldProcess($config.environmentOrigin, 'Deploy protected registry APIs and the Sender Registry development app')) {
    return
}
$payload = @{
    assembly = [Convert]::ToBase64String([IO.File]::ReadAllBytes([IO.Path]::GetFullPath($AssemblyFile)))
    html = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root 'src\registrar-app\index.html')))
    javascript = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root 'src\registrar-app\app.js')))
    css = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root 'src\registrar-app\styles.css')))
    assignCurrentUser = $AssignCurrentUser.IsPresent
    verificationAuthorityMode = $VerificationAuthorityMode
} | ConvertTo-Json -Compress
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed | ConvertTo-Json -Compress
$provisioning = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$deployment = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\registrar.js') -Raw
$report = Invoke-MtcBrowserJob -Configuration $config -JavaScript "$provisioning`n$deployment`nreturn MtcRegistrarDeployment.install($target, $payload);"
$report | ConvertTo-Json -Depth 6
