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
$expectedWorkflowIds = @(
    '{4de55d19-e43c-44ba-be99-856d9a672e88}',
    '{be76ff86-2bbf-f111-aaaf-000d3a31bda5}'
)
$workflowDifference = Compare-Object $expectedWorkflowIds @($workflowRoots.id)
if ($workflowDifference -or
    @($workflowRoots | Where-Object { $_.behavior -ne '0' }).Count) {
    throw 'Expected exactly the two reviewed manual proof workflow roots.'
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
if ($workflowFiles.Count -ne 2) {
    throw 'Expected exactly two reviewed cloud-flow definitions.'
}
foreach ($workflowFile in $workflowFiles) {
    $workflowText = Get-Content -LiteralPath $workflowFile.FullName -Raw
    if ($workflowText -match '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' -or
        $workflowText -match 'graph\.microsoft\.com/v1\.0/users/' -or
        $workflowText -match '"connectionId"\s*:') {
        throw "Tenant-local mailbox or connection data was found in workflow: $($workflowFile.Name)"
    }
    $workflowMetadata = [xml](Get-Content -LiteralPath ($workflowFile.FullName + '.data.xml') -Raw)
    if ($workflowMetadata.Workflow.StateCode -ne '0' -or $workflowMetadata.Workflow.StatusCode -ne '1') {
        throw "The portable proof flow must remain Off: $($workflowFile.Name)"
    }
}
$workflowFile = $workflowFiles | Where-Object { $_.Name -like 'MTCProcessor-manualimmutablecategoryproof-*' }
$workflowText = Get-Content -LiteralPath $workflowFile.FullName -Raw
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
$authWorkflowFile = $workflowFiles | Where-Object { $_.Name -like 'MTCProof-externalauthenticationheaders-*' }
$authWorkflowText = Get-Content -LiteralPath $authWorkflowFile.FullName -Raw
$authWorkflow = $authWorkflowText | ConvertFrom-Json
$authConnections = $authWorkflow.properties.connectionReferences
if ($authConnections.shared_office365.runtimeSource -ne 'invoker' -or
    $authConnections.shared_office365.connection.connectionReferenceLogicalName -ne 'mtc_MTCOffice365Outlook' -or
    $authConnections.shared_commondataserviceforapps.runtimeSource -ne 'embedded' -or
    $authConnections.shared_commondataserviceforapps.connection.connectionReferenceLogicalName -ne 'mtc_MTCMicrosoftDataverse') {
    throw 'Unexpected authentication-proof connection-reference binding.'
}
$authTriggers = @($authWorkflow.properties.definition.triggers.PSObject.Properties)
if ($authTriggers.Count -ne 1 -or $authTriggers[0].Name -ne 'manual' -or
    $authTriggers[0].Value.type -ne 'Request' -or $authTriggers[0].Value.kind -ne 'Button') {
    throw 'The authentication proof must remain manual-only.'
}
$authActions = $authWorkflow.properties.definition.actions
$externalScope = $authActions.Require_exactly_one_external_message
$unrecognizedScope = $externalScope.actions.Require_unrecognized_trusted_sender
$assessmentScope = $unrecognizedScope.actions.Require_at_most_one_unrecognized_assessment
if (-not $authActions.List_external_auth_candidates -or -not $externalScope -or
    -not $externalScope.actions.Get_message_authentication_headers -or
    -not $externalScope.actions.Filter_trusted_microsoft_authentication_results -or
    -not $externalScope.actions.Filter_matching_approved_contacts -or -not $unrecognizedScope -or
    -not $assessmentScope -or -not $assessmentScope.actions.Apply_unrecognized_category -or
    -not $assessmentScope.actions.Verify_unrecognized_category -or
    -not $assessmentScope.actions.Require_unrecognized_category_readback) {
    throw 'The reviewed authentication-boundary and unrecognized-presentation actions are incomplete.'
}
if ($authWorkflowText -notmatch 'Prefer: IdType=\\"ImmutableId\\"' -or
    $authWorkflowText -notmatch 'If-Match:' -or
    $authWorkflowText -notmatch 'startsWith\(toLower\(trim\(string\(item\(\)\?\[''value''\]\)\)\), ''mx\.microsoft\.com''\)' -or
    $authWorkflowText -notmatch 'MTC Proof - unrecognized sender' -or
    $authWorkflowText -notmatch 'MTC_REGISTRY_NO_MATCH' -or
    $authWorkflowText -notmatch '"item/mtc_mailboxreference"\s*:\s*"me"') {
    throw 'The authentication proof lost a trusted-boundary, registry, concurrency, or persistence safeguard.'
}
$userPath = Join-Path $source 'Entities\systemuser\Entity.xml'
if (Test-Path -LiteralPath $userPath) {
    $user = [xml](Get-Content -LiteralPath $userPath -Raw)
    if ($user.Entity.SelectNodes('./*[not(self::Name or self::RibbonDiffXml)]').Count) {
        throw 'The built-in User dependency must be a reference-only shell.'
    }
}
Write-Output "Reviewed solution source: $($solution.UniqueName) $($solution.Version); manual proofs Off and tenant-local values absent."
