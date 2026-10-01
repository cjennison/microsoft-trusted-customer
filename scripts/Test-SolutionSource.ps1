[CmdletBinding()]
param(
    [string] $SourceDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'solutions\MicrosoftTrustedCustomer')
)

$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($SourceDirectory)
$manifestPath = Join-Path $source 'Other\Solution.xml'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw 'Reviewed unpacked solution source is missing.'
}
$manifest = [xml](Get-Content -LiteralPath $manifestPath -Raw)
$solution = $manifest.ImportExportXml.SolutionManifest
if ($solution.UniqueName -ne 'MicrosoftTrustedCustomer' -or $solution.Publisher.CustomizationPrefix -ne 'mtc') {
    throw 'Unexpected solution identity or customization prefix.'
}
if ($solution.Version -notmatch '^\d+\.\d+\.\d+\.\d+$' -or $solution.Managed -ne '2') {
    throw 'Expected a versioned Both-format (managed and unmanaged) PAC source export.'
}
$expectedTables = @(
    'mtc_approvedcontact', 'mtc_approveddomain', 'mtc_approvedportal',
    'mtc_businessparty', 'mtc_messageassessment', 'mtc_paymentverification', 'mtc_verificationcase'
)
$actualTables = @($solution.RootComponents.RootComponent |
    Where-Object { $_.type -eq '1' -and $_.schemaName -ne 'systemuser' } |
    ForEach-Object { $_.schemaName })
if (Compare-Object $expectedTables $actualTables) {
    throw 'The foundation solution must contain exactly the seven reviewed custom table roots.'
}
$unexpectedRoots = @($solution.RootComponents.RootComponent |
    Where-Object { $_.type -ne '1' -or ($_.schemaName -eq 'systemuser' -and $_.behavior -ne '1') })
if ($unexpectedRoots.Count) {
    throw 'Unreviewed solution root components were found.'
}
$expectedDefaults = @{
    mtc_ProcessingMode = 'Disabled'
    mtc_PilotMailbox = ''
    mtc_OperatorAlertDestination = ''
    mtc_PolicyVersion = '1'
}
$definitionRoot = Join-Path $source 'environmentvariabledefinitions'
$definitionDirectories = @(Get-ChildItem -LiteralPath $definitionRoot -Directory)
if (Compare-Object @($expectedDefaults.Keys) @($definitionDirectories.Name)) {
    throw 'Unexpected environment variable definitions.'
}
foreach ($directory in $definitionDirectories) {
    $definition = [xml](Get-Content -LiteralPath (Join-Path $directory.FullName 'environmentvariabledefinition.xml') -Raw)
    $variable = $definition.environmentvariabledefinition
    $expectedDefault = $expectedDefaults[$directory.Name]
    if ($variable.schemaname -ne $directory.Name -or [string]$variable.defaultvalue -ne $expectedDefault -or
        $variable.type -ne '100000000') {
        throw "Unsafe or unexpected environment variable definition: $($directory.Name)"
    }
}
foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File) {
    if ($file.Extension -ne '.xml') {
        throw "Unreviewed file type in solution source: $($file.Name)"
    }
    $xml = [xml](Get-Content -LiteralPath $file.FullName -Raw)
    if ($xml.SelectNodes('//environmentvariablevalue | //connectionreference').Count) {
        throw "Tenant-local values or unreviewed connections in solution source: $($file.Name)"
    }
}
$userPath = Join-Path $source 'Entities\systemuser\Entity.xml'
if (Test-Path -LiteralPath $userPath) {
    $user = [xml](Get-Content -LiteralPath $userPath -Raw)
    if ($user.Entity.SelectNodes('./*[not(self::Name or self::RibbonDiffXml)]').Count) {
        throw 'The built-in User dependency must be a reference-only shell.'
    }
}
Write-Output "Reviewed foundation source: $($solution.UniqueName) $($solution.Version); tenant-local values absent."
