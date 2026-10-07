[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $RegistryOrigin,
    [string] $HostingBase = 'https://cjennison.github.io/microsoft-trusted-customer',
    [string] $AddinId,
    [string] $OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent) '.local\outlook-addin\manifest.xml')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if ($RegistryOrigin -cnotmatch '^https://[a-z0-9-]+\.crm[0-9]*\.dynamics\.com$') {
    throw 'RegistryOrigin must be the exact Dataverse origin, for example https://org.crm.dynamics.com.'
}
if ($HostingBase -cnotmatch '^https://[^\s?#]+[^/]$') { throw 'HostingBase must be an https URL without a trailing slash.' }
$output = [IO.Path]::GetFullPath($OutputPath)
$private = [IO.Path]::GetFullPath((Join-Path $root '.local')) + [IO.Path]::DirectorySeparatorChar
if (-not $output.StartsWith($private, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Tenant manifests contain the registry origin and must be written beneath the Git-ignored .local directory.'
}
if (-not $AddinId) {
    if (Test-Path -LiteralPath $output) {
        $AddinId = ([xml](Get-Content -LiteralPath $output -Raw)).OfficeApp.Id
    } else {
        $AddinId = [Guid]::NewGuid().ToString()
    }
}
[Guid]::Parse($AddinId) | Out-Null
$taskpane = "$HostingBase/taskpane.html?registry=$([Uri]::EscapeDataString($RegistryOrigin))"
$escape = { param($value) [Security.SecurityElement]::Escape($value) }
$template = Get-Content -LiteralPath (Join-Path $root 'src\outlook-addin\manifest.template.xml') -Raw
$manifest = $template.Replace('{{ADDIN_ID}}', (& $escape $AddinId)).
    Replace('{{TASKPANE_URL}}', (& $escape $taskpane)).
    Replace('{{HOST}}', (& $escape $HostingBase))
if ($manifest -match '\{\{') { throw 'Unresolved manifest placeholder.' }
[xml]$manifest | Out-Null
[IO.Directory]::CreateDirectory((Split-Path $output -Parent)) | Out-Null
[IO.File]::WriteAllText($output, $manifest)
Write-Output "Wrote private Outlook add-in manifest $output (id $AddinId). Upload it in Microsoft 365 admin center > Integrated apps and assign only the registrar group."
