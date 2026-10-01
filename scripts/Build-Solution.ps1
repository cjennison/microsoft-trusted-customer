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
    } finally {
        $archive.Dispose()
    }
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    Write-Output "$type $version SHA256 $hash"
}
