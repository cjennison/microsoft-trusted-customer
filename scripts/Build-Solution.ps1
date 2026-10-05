[CmdletBinding()]
param(
    [string] $SourceDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'solutions\MicrosoftTrustedCustomer'),
    [string] $OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'artifacts\build')
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Test-SolutionSource.ps1') -SourceDirectory $SourceDirectory
$source = [IO.Path]::GetFullPath($SourceDirectory)
$output = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($output) | Out-Null
$manifest = [xml](Get-Content -LiteralPath (Join-Path $source 'Other\Solution.xml') -Raw)
$version = $manifest.ImportExportXml.SolutionManifest.Version
$paths = @(
    @{ Type = 'Unmanaged'; Path = (Join-Path $output "MicrosoftTrustedCustomer_$version.zip") },
    @{ Type = 'Managed'; Path = (Join-Path $output "MicrosoftTrustedCustomer_${version}_managed.zip") }
)
foreach ($package in $paths) {
    if (Test-Path -LiteralPath $package.Path) {
        throw "Build output already exists; choose a fresh output directory: $($package.Path)"
    }
}
foreach ($package in $paths) {
    $zipPath = $package.Path
    $type = $package.Type
    & dotnet tool run pac solution pack --folder $source --zipfile $zipPath --packagetype $type --errorlevel Warning
    if ($LASTEXITCODE -ne 0) {
        throw "$type solution packaging failed."
    }
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entry = $archive.GetEntry('solution.xml')
        if (-not $entry) { throw 'Packaged solution manifest is missing.' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $packedManifest = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
        $expectedManaged = if ($type -eq 'Managed') { '1' } else { '0' }
        $packed = $packedManifest.ImportExportXml.SolutionManifest
        if ($packed.UniqueName -ne 'MicrosoftTrustedCustomer' -or $packed.Managed -ne $expectedManaged -or $packed.Version -ne $version) {
            throw 'Packaged solution identity, version, or managed mode is incorrect.'
        }
        $customizationEntry = $archive.GetEntry('customizations.xml')
        if (-not $customizationEntry) { throw 'Packaged customization metadata is missing.' }
        $reader = [IO.StreamReader]::new($customizationEntry.Open())
        try { $packedCustomizations = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
        $connectors = @($packedCustomizations.ImportExportXml.Connectors.Connector)
        if ($connectors.Count -ne 1 -or
            $connectors[0].connectorid -ne '8da23315-b15c-46d9-9f6f-dc85080b0276') {
            throw 'The packaged custom Graph connector is missing or has the wrong identity.'
        }
        foreach ($property in 'openapidefinition', 'connectionparameters', 'connectionparametersets', 'policytemplateinstances', 'customcodeblobcontent', 'iconblob') {
            $entryPath = [string]$connectors[0].$property
            if (-not $entryPath.StartsWith('/Connector/') -or
                -not $archive.GetEntry($entryPath.TrimStart('/'))) {
                throw "Packaged Graph connector payload is missing: $property"
            }
        }
        $pluginAssemblies = @($packedCustomizations.ImportExportXml.SolutionPluginAssemblies.PluginAssembly)
        if ($pluginAssemblies.Count -ne 1 -or
            $pluginAssemblies[0].FullName -notlike 'Mtc.Registrar,*' -or
            $pluginAssemblies[0].IsolationMode -ne '2') {
            throw 'The packaged registrar assembly is missing or not sandbox-isolated.'
        }
        $pluginFileName = [string]$pluginAssemblies[0].FileName
        if (-not $archive.GetEntry($pluginFileName.TrimStart('/'))) {
            throw 'The packaged registrar assembly binary is missing.'
        }
        foreach ($apiName in 'mtc_VerifySender', 'mtc_RevokeSender', 'mtc_SetMailboxEnrollment',
            'mtc_SetMailboxFolderScope', 'mtc_BeginMailboxPoll', 'mtc_ProcessMessageBatch',
            'mtc_CompleteMailboxPage', 'mtc_ReportMailboxFailure', 'mtc_GetMessageLabelPlan',
            'mtc_IsLabelingEnabled', 'mtc_VerifyMessagePresentation', 'mtc_ReportPresentationFailure') {
            if (-not $archive.GetEntry("customapis/$apiName/customapi.xml")) {
                throw "Packaged registrar API metadata is missing: $apiName"
            }
        }
    } finally {
        $archive.Dispose()
    }
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    Write-Output "$type $version SHA256 $hash"
}
