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
    throw 'The solution must contain exactly the seven reviewed custom table roots.'
}
$workflowRoots = @($solution.RootComponents.RootComponent | Where-Object { $_.type -eq '29' })
if ($workflowRoots.Count -ne 1 -or $workflowRoots[0].id -ne '{be76ff86-2bbf-f111-aaaf-000d3a31bda5}' -or
    $workflowRoots[0].behavior -ne '0') {
    throw 'Expected exactly the reviewed manual proof workflow root.'
}
$unexpectedRoots = @($solution.RootComponents.RootComponent | Where-Object {
    ($_.type -eq '1' -and $_.schemaName -eq 'systemuser' -and $_.behavior -ne '1') -or
    ($_.type -eq '1' -and $_.schemaName -ne 'systemuser' -and $_.schemaName -notin $expectedTables) -or
    ($_.type -notin @('1', '29'))
})
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
    if ($file.Extension -eq '.xml') {
        $xml = [xml](Get-Content -LiteralPath $file.FullName -Raw)
        if ($xml.SelectNodes('//environmentvariablevalue').Count) {
            throw "Tenant-local environment variable values in solution source: $($file.Name)"
        }
        continue
    }
    if ($file.Extension -eq '.json') {
        Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json | Out-Null
        continue
    }
    throw "Unreviewed file type in solution source: $($file.Name)"
}
$customizationsPath = Join-Path $source 'Other\Customizations.xml'
$customizations = [xml](Get-Content -LiteralPath $customizationsPath -Raw)
$expectedConnections = @{
    mtc_MTCMicrosoftDataverse = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
    mtc_MTCOffice365Outlook = '/providers/Microsoft.PowerApps/apis/shared_office365'
}
$connectionReferences = @($customizations.ImportExportXml.connectionreferences.connectionreference)
if (Compare-Object @($expectedConnections.Keys) @($connectionReferences.connectionreferencelogicalname)) {
    throw 'Unexpected solution connection references.'
}
foreach ($reference in $connectionReferences) {
    if ($reference.connectorid -ne $expectedConnections[$reference.connectionreferencelogicalname] -or
        $reference.statecode -ne '0' -or $reference.statuscode -ne '1' -or
        $reference.SelectSingleNode('./connectionid')) {
        throw "Unsafe or unexpected connection reference: $($reference.connectionreferencelogicalname)"
    }
}
$workflowDirectory = Join-Path $source 'Workflows'
$workflowFiles = @(Get-ChildItem -LiteralPath $workflowDirectory -Filter '*.json' -File)
if ($workflowFiles.Count -ne 1) {
    throw 'Expected exactly one reviewed cloud-flow definition.'
}
$workflowFile = $workflowFiles[0]
$workflowText = Get-Content -LiteralPath $workflowFile.FullName -Raw
if ($workflowText -match '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' -or
    $workflowText -match 'graph\.microsoft\.com/v1\.0/users/' -or
    $workflowText -match '"connectionId"\s*:') {
    throw 'Tenant-local mailbox or connection data was found in the workflow.'
}
$workflow = $workflowText | ConvertFrom-Json
$flowConnections = $workflow.properties.connectionReferences
if ($flowConnections.shared_office365.runtimeSource -ne 'invoker' -or
    $flowConnections.shared_office365.connection.connectionReferenceLogicalName -ne 'mtc_MTCOffice365Outlook' -or
    $flowConnections.shared_commondataserviceforapps.runtimeSource -ne 'embedded' -or
    $flowConnections.shared_commondataserviceforapps.connection.connectionReferenceLogicalName -ne 'mtc_MTCMicrosoftDataverse') {
    throw 'Unexpected workflow connection-reference binding.'
}
$triggers = @($workflow.properties.definition.triggers.PSObject.Properties)
if ($triggers.Count -ne 1 -or $triggers[0].Name -ne 'manual' -or
    $triggers[0].Value.type -ne 'Request' -or $triggers[0].Value.kind -ne 'Button') {
    throw 'The proof flow must remain manual-only.'
}
$actions = $workflow.properties.definition.actions
$messageScope = $actions.Require_exactly_one_message
$assessmentScope = $messageScope.actions.Require_at_most_one_assessment
if (-not $actions.Get_proof_folder -or -not $actions.Get_scoped_messages -or -not $messageScope -or
    -not $messageScope.actions.List_existing_assessments -or -not $assessmentScope -or
    -not $assessmentScope.actions.Assessment_record_exists -or
    -not $assessmentScope.actions.Apply_non_positive_category -or
    -not $assessmentScope.actions.Verify_category -or -not $assessmentScope.actions.Complete_assessment) {
    throw 'The reviewed immutable-message and assessment-persistence actions are incomplete.'
}
if ($workflowText -notmatch 'Prefer: IdType=\\"ImmutableId\\"' -or
    $workflowText -notmatch 'If-Match:' -or
    $workflowText -notmatch 'MTC_AUTH_BOUNDARY_UNVALIDATED' -or
    $workflowText -notmatch '"item/mtc_mailboxreference"\s*:\s*"me"') {
    throw 'The proof flow lost an immutable-ID, concurrency, or fail-closed persistence safeguard.'
}
$workflowMetadata = [xml](Get-Content -LiteralPath ($workflowFile.FullName + '.data.xml') -Raw)
if ($workflowMetadata.Workflow.StateCode -ne '0' -or $workflowMetadata.Workflow.StatusCode -ne '1') {
    throw 'The portable proof flow must remain Off.'
}
$userPath = Join-Path $source 'Entities\systemuser\Entity.xml'
if (Test-Path -LiteralPath $userPath) {
    $user = [xml](Get-Content -LiteralPath $userPath -Raw)
    if ($user.Entity.SelectNodes('./*[not(self::Name or self::RibbonDiffXml)]').Count) {
        throw 'The built-in User dependency must be a reference-only shell.'
    }
}
Write-Output "Reviewed solution source: $($solution.UniqueName) $($solution.Version); manual proof Off and tenant-local values absent."
