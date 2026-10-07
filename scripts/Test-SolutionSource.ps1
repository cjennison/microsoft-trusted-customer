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
    'mtc_approvedcontact', 'mtc_approveddomain', 'mtc_businessparty',
    'mtc_mailboxenrollment', 'mtc_messageassessment', 'mtc_verificationcase'
)
$actualTables = @($solution.RootComponents.RootComponent |
    Where-Object { $_.type -eq '1' -and $_.schemaName -ne 'systemuser' } |
    ForEach-Object { $_.schemaName })
if (Compare-Object $expectedTables $actualTables) {
    throw 'The solution must contain exactly the six reviewed known-sender runtime table roots.'
}
$workflowRoots = @($solution.RootComponents.RootComponent | Where-Object { $_.type -eq '29' })
$expectedWorkflowIds = @(
    '{4de55d19-e43c-44ba-be99-856d9a672e88}',
    '{81b229c4-d759-49a7-93da-816056e8841c}',
    '{92696be8-ad52-4b79-81b2-0dee193808cf}',
    '{be76ff86-2bbf-f111-aaaf-000d3a31bda5}'
)
$workflowDifference = Compare-Object $expectedWorkflowIds @($workflowRoots.id)
if ($workflowDifference -or
    @($workflowRoots | Where-Object { $_.behavior -ne '0' }).Count) {
    throw 'Expected the two reviewed manual proofs and the disabled shadow/presentation workflow roots.'
}
$connectorRoots = @($solution.RootComponents.RootComponent | Where-Object { $_.type -eq '372' })
if ($connectorRoots.Count -ne 1 -or
    $connectorRoots[0].id -ne '{8da23315-b15c-46d9-9f6f-dc85080b0276}' -or
    $connectorRoots[0].schemaName -ne 'mtc_mtc-20microsoft-20graph-20mail' -or
    $connectorRoots[0].behavior -ne '0') {
    throw 'Expected exactly the reviewed Graph mail custom connector root.'
}
$unexpectedRoots = @($solution.RootComponents.RootComponent | Where-Object {
    ($_.type -eq '1' -and $_.schemaName -eq 'systemuser' -and $_.behavior -ne '1') -or
    ($_.type -eq '1' -and $_.schemaName -ne 'systemuser' -and $_.schemaName -notin $expectedTables) -or
    ($_.type -notin @('1', '20', '29', '61', '62', '80', '91', '92', '372'))
})
if ($unexpectedRoots.Count) {
    throw 'Unreviewed solution root components were found.'
}
$expectedDefaults = @{
    mtc_ProcessingMode = 'Disabled'
    mtc_LabelingMode = 'Disabled'
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
    if ($file.Extension -ieq '.png' -and
        $file.Name -eq 'mtc_mtc-20microsoft-20graph-20mail_iconblob.Png' -and
        $file.Directory.Name -eq 'Connectors') {
        continue
    }
    if ($file.Extension -eq '.csx' -and
        $file.Name -eq 'mtc_mtc-20microsoft-20graph-20mail_customcodeblobcontent.csx' -and
        $file.Directory.Name -eq 'Connectors') {
        continue
    }
    if ($file.Extension -in @('.html', '.js', '.css') -and
        $file.FullName.StartsWith((Join-Path $source 'WebResources\mtc_\registrar'), [StringComparison]::OrdinalIgnoreCase) -and
        $file.Name -in @('index.html', 'app.js', 'styles.css')) {
        continue
    }
    if ($file.Extension -eq '.dll' -and
        $file.Name -eq 'MtcRegistrar.dll' -and
        $file.Directory.Parent.Name -eq 'PluginAssemblies') {
        continue
    }
    throw "Unreviewed file type in solution source: $($file.Name)"
}
$customizationsPath = Join-Path $source 'Other\Customizations.xml'
$customizations = [xml](Get-Content -LiteralPath $customizationsPath -Raw)
$expectedConnections = @{
    mtc_MTCGraphMail = '/providers/Microsoft.PowerApps/apis/shared_mtc-20microsoft-20graph-20mail-5fad2197ce913463-bbf4bc2ad08b7a26'
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
$graphReference = $connectionReferences | Where-Object connectionreferencelogicalname -eq 'mtc_MTCGraphMail'
if ($graphReference.customconnectorid.connectorid -ne '8da23315-b15c-46d9-9f6f-dc85080b0276') {
    throw 'The Graph mail connection reference is not bound to the reviewed custom connector.'
}
$connectorDirectory = Join-Path $source 'Connectors'
$connectorPrefix = 'mtc_mtc-20microsoft-20graph-20mail'
$connectorFiles = @(Get-ChildItem -LiteralPath $connectorDirectory -File)
if ($connectorFiles.Count -ne 7 -or
    @($connectorFiles.Name | Where-Object { $_ -notlike "$connectorPrefix*" }).Count) {
    throw 'Unexpected custom connector source files.'
}
$connectorParameters = Get-Content -LiteralPath (Join-Path $connectorDirectory "${connectorPrefix}_connectionparameters.json") -Raw | ConvertFrom-Json
$connectorSets = Get-Content -LiteralPath (Join-Path $connectorDirectory "${connectorPrefix}_connectionparametersets.json") -Raw | ConvertFrom-Json
$connectorOpenApi = Get-Content -LiteralPath (Join-Path $connectorDirectory "${connectorPrefix}_openapidefinition.json") -Raw | ConvertFrom-Json
$authSets = @($connectorSets.values)
if ($authSets.Count -ne 1 -or $authSets[0].name -ne 'certOauth' -or
    $authSets[0].parameters.token.oAuthSettings.clientId -ne '00000000-0000-0000-0000-000000000000' -or
    $authSets[0].parameters.token.oAuthSettings.customParameters.TenantId.value -ne 'organizations' -or
    -not $authSets[0].parameters.'token:clientId' -or
    -not $authSets[0].parameters.'token:clientCertificateSecret' -or
    -not $authSets[0].parameters.'token:TenantId') {
    throw 'The Graph connector must expose only tenant-supplied client certificate authentication.'
}
if ($connectorParameters.token.oAuthSettings.clientId -ne '00000000-0000-0000-0000-000000000000' -or
    $connectorParameters.token.oAuthSettings.customParameters.TenantId.value -ne 'organizations' -or
    -not $connectorParameters.'token:clientId' -or
    -not $connectorParameters.'token:clientCertificateSecret' -or
    -not $connectorParameters.'token:TenantId') {
    throw 'The default Graph connector authentication contains tenant-local values.'
}
$securityNames = @($connectorOpenApi.security | ForEach-Object { $_.PSObject.Properties.Name })
$definitionNames = @($connectorOpenApi.securityDefinitions.PSObject.Properties.Name)
if ((Compare-Object @('certOauth') $securityNames) -or
    (Compare-Object @('certOauth') $definitionNames)) {
    throw 'The Graph connector must not expose delegated or client-secret authentication.'
}
$connectorText = ($connectorFiles | Where-Object Extension -in @('.json', '.xml') |
    ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
if ($connectorText -match 'GenericFederatedIdentityCredential|clientSecret|authorization_code|@' -or
    $connectorText -match '(?i)\.crm\d*\.dynamics\.com') {
    throw 'Tenant-local or unsupported authentication data was found in the Graph connector source.'
}
$expectedAdditionalRoots = @{
    '20' = 3
    '61' = 3
    '62' = 1
    '80' = 1
    '91' = 1
    '92' = 14
}
foreach ($type in $expectedAdditionalRoots.Keys) {
    $roots = @($solution.RootComponents.RootComponent | Where-Object type -eq $type)
    if ($roots.Count -ne $expectedAdditionalRoots[$type] -or
        @($roots | Where-Object behavior -ne '0').Count) {
        throw "Unexpected registrar solution root count or behavior: $type"
    }
}
$roleFiles = @(Get-ChildItem -LiteralPath (Join-Path $source 'Roles') -Filter '*.xml' -File)
if ((Compare-Object @('MTC Registrar.xml', 'MTC Operator.xml', 'MTC Processor.xml') @($roleFiles.Name))) {
    throw 'Expected exactly the registrar, operator and processor roles.'
}
foreach ($roleFile in $roleFiles) {
    $roleXml = [xml](Get-Content -LiteralPath $roleFile.FullName -Raw)
    if ($roleXml.Role.IsAutoAssigned -ne '0' -or $roleXml.SelectNodes('//systemuser').Count) {
        throw 'Registrar roles must not automatically grant or transport user assignments.'
    }
    $unsafe = @($roleXml.Role.RolePrivileges.RolePrivilege | Where-Object {
        $_.name -match '^prv(Delete|Assign|Share)mtc_' -or
        ($roleXml.Role.name -eq 'MTC Operator' -and $_.name -match '^prv(Create|Write)mtc_(Approved|Business|Verification)') -or
        ($roleXml.Role.name -eq 'MTC Processor' -and $_.name -match '^prv(Create|Write)mtc_(Approved|Business|Verification)') -or
        ($roleXml.Role.name -eq 'MTC Registrar' -and $_.name -match '^prv(Create|Write)mtc_MailboxEnrollment')
    })
    if ($unsafe.Count) { throw "Unexpected registrar/operator privileges: $($roleFile.Name)" }
}
$pluginFiles = @(Get-ChildItem -LiteralPath (Join-Path $source 'PluginAssemblies') -Recurse -Filter '*.dll' -File)
if ($pluginFiles.Count -ne 1 -or $pluginFiles[0].Name -ne 'MtcRegistrar.dll') {
    throw 'Expected exactly the reviewed registrar assembly.'
}
$plugin = [xml](Get-Content -LiteralPath ($pluginFiles[0].FullName + '.data.xml') -Raw)
$pluginTypes = @($plugin.PluginAssembly.PluginTypes.PluginType)
$expectedPluginTypes = @(
    'Mtc.Registrar.VerificationApi', 'Mtc.Registrar.RegistryWriteGuard', 'Mtc.Registrar.MailboxApi',
    'Mtc.Registrar.MailboxRuntime'
    'Mtc.Registrar.LabelRuntime'
)
if ($plugin.PluginAssembly.IsolationMode -ne '2' -or $plugin.PluginAssembly.SourceType -ne '0' -or
    (Compare-Object $expectedPluginTypes @($pluginTypes.Name))) {
    throw 'Unexpected registrar assembly isolation, storage, or exported types.'
}
$stepFiles = @(Get-ChildItem -LiteralPath (Join-Path $source 'SdkMessageProcessingSteps') -Filter '*.xml' -File)
if ($stepFiles.Count -ne 14) { throw 'Expected twelve registry write guards and two relationship guards.' }
foreach ($stepFile in $stepFiles) {
    $step = ([xml](Get-Content -LiteralPath $stepFile.FullName -Raw)).SdkMessageProcessingStep
    if ($step.Stage -ne '10' -or $step.Mode -ne '0' -or $step.Rank -ne '1' -or
        $step.PluginTypeName -notlike 'Mtc.Registrar.RegistryWriteGuard,*' -or
        $step.SelectSingleNode('./ImpersonatingUserId')) {
        throw "Registry guards must remain synchronous and run as the caller: $($stepFile.Name)"
    }
}
$apiDefinitions = @{
    mtc_VerifySender = @{
        Type = 'Mtc.Registrar.VerificationApi'
        Inputs = @('TargetType', 'TargetValue', 'BusinessName', 'VerificationMethod', 'EvidenceReference', 'ExpiresOn')
    }
    mtc_RevokeSender = @{
        Type = 'Mtc.Registrar.VerificationApi'
        Inputs = @('TargetType', 'RecordId', 'Reason')
    }
    mtc_SetMailboxEnrollment = @{
        Type = 'Mtc.Registrar.MailboxApi'
        Inputs = @('MailboxReference', 'MailboxType', 'Enrolled')
    }
    mtc_SetMailboxFolderScope = @{
        Type = 'Mtc.Registrar.MailboxApi'
        Inputs = @('MailboxRecordId', 'FolderIds')
    }
    mtc_BeginMailboxPoll = @{
        Type = 'Mtc.Registrar.MailboxRuntime'
        Inputs = @('MailboxRecordId')
    }
    mtc_ProcessMessageBatch = @{
        Type = 'Mtc.Registrar.MailboxRuntime'
        Inputs = @('MailboxRecordId', 'LeaseId', 'MessagesJson', 'ImmutableIdsApplied')
    }
    mtc_CompleteMailboxPage = @{
        Type = 'Mtc.Registrar.MailboxRuntime'
        Inputs = @('MailboxRecordId', 'LeaseId', 'NextPageUrl')
    }
    mtc_ReportMailboxFailure = @{
        Type = 'Mtc.Registrar.MailboxRuntime'
        Inputs = @('MailboxRecordId', 'LeaseId', 'Reason')
    }
    mtc_GetMessageLabelPlan = @{
        Type = 'Mtc.Registrar.LabelRuntime'
        Inputs = @('AssessmentId', 'MessageJson')
    }
    mtc_IsLabelingEnabled = @{
        Type = 'Mtc.Registrar.LabelRuntime'
        Inputs = @()
    }
    mtc_VerifyMessagePresentation = @{
        Type = 'Mtc.Registrar.LabelRuntime'
        Inputs = @('AssessmentId', 'MessageJson', 'ExpectedCategoriesJson')
    }
    mtc_ReportPresentationFailure = @{
        Type = 'Mtc.Registrar.LabelRuntime'
        Inputs = @('AssessmentId', 'Reason')
    }
}
$apiDirectories = @(Get-ChildItem -LiteralPath (Join-Path $source 'customapis') -Directory)
if ((Compare-Object @($apiDefinitions.Keys) @($apiDirectories.Name))) {
    throw 'Unexpected registrar custom API definitions.'
}
foreach ($directory in $apiDirectories) {
    $api = ([xml](Get-Content -LiteralPath (Join-Path $directory.FullName 'customapi.xml') -Raw)).customapi
    $definition = $apiDefinitions[$directory.Name]
    $handler = $pluginTypes | Where-Object Name -eq $definition.Type
    if ($api.uniquename -ne $directory.Name -or $api.allowedcustomprocessingsteptype -ne '0' -or
        $api.isfunction -ne '0' -or $api.bindingtype -ne '0' -or $api.iscustomizable -ne '0' -or
        $api.plugintypeid.plugintypeexportkey -ne $handler.PluginTypeId) {
        throw "Unsafe or unbound registrar API: $($directory.Name)"
    }
    $parameterPath = Join-Path $directory.FullName 'customapirequestparameters'
    $parameters = if (Test-Path -LiteralPath $parameterPath) { @(Get-ChildItem -LiteralPath $parameterPath -Directory) } else { @() }
    if (($definition.Inputs.Count -eq 0 -and @($parameters).Count -ne 0) -or
        ($definition.Inputs.Count -gt 0 -and (Compare-Object $definition.Inputs @($parameters.Name)))) {
        throw "Unexpected registrar API inputs: $($directory.Name)"
    }
}
$registrarResourceDirectory = Join-Path $source 'WebResources\mtc_\registrar'
foreach ($fileName in 'index.html', 'app.js', 'styles.css') {
    $exported = Join-Path $registrarResourceDirectory $fileName
    $original = Join-Path (Split-Path $PSScriptRoot -Parent) "src\registrar-app\$fileName"
    if ((Get-FileHash -LiteralPath $exported).Hash -ne (Get-FileHash -LiteralPath $original).Hash) {
        throw "Registrar web resource is stale relative to source: $fileName"
    }
}
$workflowDirectory = Join-Path $source 'Workflows'
$workflowFiles = @(Get-ChildItem -LiteralPath $workflowDirectory -Filter '*.json' -File)
if ($workflowFiles.Count -ne 4) {
    throw 'Expected exactly four reviewed cloud-flow definitions.'
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
        throw "Every portable flow must remain Off: $($workflowFile.Name)"
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
    -not $externalScope.actions.Filter_matching_approved_party -or
    -not $assessmentScope -or -not $assessmentScope.actions.Apply_unrecognized_category -or
    -not $assessmentScope.actions.Verify_unrecognized_category -or
    -not $assessmentScope.actions.Require_unrecognized_category_readback) {
    throw 'The reviewed authentication-boundary and unrecognized-presentation actions are incomplete.'
}
if ($authWorkflowText -notmatch 'Prefer: IdType=\\"ImmutableId\\"' -or
    $authWorkflowText -notmatch 'If-Match:' -or
    $authWorkflowText -notmatch 'startsWith\(toLower\(trim\(string\(item\(\)\?\[''value''\]\)\)\), ''mx\.microsoft\.com''\)' -or
    $authWorkflowText -notmatch 'MTC Proof - known sender' -or
    $authWorkflowText -notmatch 'MTC Proof - not known' -or
    $authWorkflowText -notmatch 'MTC_EXACT_CONTACT_MATCH' -or
    $authWorkflowText -notmatch 'message-runtime-3' -or
    $authWorkflowText -notmatch '"item/mtc_mailboxreference"\s*:\s*"me"') {
    throw 'The authentication proof lost a trusted-boundary, registry, concurrency, or persistence safeguard.'
}
$shadowWorkflowFile = $workflowFiles | Where-Object { $_.Name -like 'MTCProcessor-scheduledshadowassessment-*' }
$shadowWorkflowText = Get-Content -LiteralPath $shadowWorkflowFile.FullName -Raw
$shadowWorkflow = $shadowWorkflowText | ConvertFrom-Json
$shadowConnections = $shadowWorkflow.properties.connectionReferences
$graphApiName = 'shared_mtc-20microsoft-20graph-20mail-5fad2197ce913463-bbf4bc2ad08b7a26'
if ($shadowConnections.$graphApiName.runtimeSource -ne 'embedded' -or
    $shadowConnections.$graphApiName.connection.connectionReferenceLogicalName -ne 'mtc_MTCGraphMail' -or
    $shadowConnections.shared_commondataserviceforapps.runtimeSource -ne 'embedded' -or
    $shadowConnections.shared_commondataserviceforapps.connection.connectionReferenceLogicalName -ne 'mtc_MTCMicrosoftDataverse') {
    throw 'Unexpected scheduled shadow connection-reference binding.'
}
$shadowTriggers = @($shadowWorkflow.properties.definition.triggers.PSObject.Properties)
if ($shadowTriggers.Count -ne 1 -or $shadowTriggers[0].Name -ne 'Recurrence' -or
    $shadowTriggers[0].Value.type -ne 'Recurrence' -or
    $shadowTriggers[0].Value.recurrence.frequency -ne 'Minute' -or
    $shadowTriggers[0].Value.recurrence.interval -ne 3) {
    throw 'The shadow processor must use only the reviewed three-minute schedule.'
}
$shadowActions = $shadowWorkflow.properties.definition.actions
if (-not $shadowActions.List_enrolled_mailboxes -or -not $shadowActions.For_each_enrolled_mailbox -or
    -not $shadowWorkflowText.Contains('ListMailboxMessages') -or
    -not $shadowWorkflowText.Contains('mtc_ProcessMessageBatch') -or
    -not $shadowWorkflowText.Contains('mtc_BeginMailboxPoll') -or
    -not $shadowWorkflowText.Contains('mtc_CompleteMailboxPage') -or
    -not $shadowWorkflowText.Contains('mtc_ReportMailboxFailure') -or
    -not $shadowWorkflowText.Contains('Stop_on_page_failure') -or
    -not $shadowWorkflowText.Contains('mtc_enrollmentstatus eq 100000001') -or
    -not $shadowWorkflowText.Contains('@odata.nextLink')) {
    throw 'The scheduled shadow flow lost a mailbox-scope, paging, authentication, or persistence safeguard.'
}
$shadowPresentationValues = [regex]::Matches(
    $shadowWorkflowText,
    '"item/mtc_presentationstatus"\s*:\s*([^,\r\n]+)'
)
if ($shadowWorkflowText -match 'UpdateMessageCategories|MTC Proof - known sender|MTC Proof - not known' -or
    $shadowPresentationValues.Count -ne 0 -or
    @($shadowPresentationValues | Where-Object { $_.Groups[1].Value.Trim() -ne '100000000' }).Count) {
    throw 'The shadow processor must not write Outlook categories or claim presentation success.'
}
$presentationFile = $workflowFiles | Where-Object { $_.Name -like 'MTCProcessor-authorizedOutlookpresentation-*' }
$presentationText = Get-Content -LiteralPath $presentationFile.FullName -Raw
$presentation = $presentationText | ConvertFrom-Json
$presentationConnections = $presentation.properties.connectionReferences
if ($presentationConnections.$graphApiName.runtimeSource -ne 'embedded' -or
    $presentationConnections.$graphApiName.connection.connectionReferenceLogicalName -ne 'mtc_MTCGraphMail' -or
    $presentationConnections.shared_commondataserviceforapps.runtimeSource -ne 'embedded' -or
    $presentationConnections.shared_commondataserviceforapps.connection.connectionReferenceLogicalName -ne 'mtc_MTCMicrosoftDataverse') {
    throw 'Unexpected presentation connection-reference binding.'
}
$presentationTriggers = @($presentation.properties.definition.triggers.PSObject.Properties)
if ($presentationTriggers.Count -ne 1 -or $presentationTriggers[0].Name -ne 'Recurrence' -or
    $presentationTriggers[0].Value.type -ne 'Recurrence' -or
    $presentationTriggers[0].Value.recurrence.frequency -ne 'Minute' -or
    $presentationTriggers[0].Value.recurrence.interval -ne 1 -or
    $presentationTriggers[0].Value.runtimeConfiguration.concurrency.runs -ne 1) {
    throw 'Presentation must retain its serialized one-minute schedule.'
}
$presentationActions = $presentation.properties.definition.actions
$authorization = $presentationActions.Require_explicit_label_authorization
$pending = $authorization.actions.For_each_pending_presentation
$reconcile = $pending.actions.Reconcile_one_message.actions
$write = $reconcile.Require_category_write.actions.Apply_owned_category_plan
if ($presentationActions.Check_explicit_label_authorization.inputs.parameters.actionName -ne 'mtc_IsLabelingEnabled' -or
    $authorization.expression.equals[0] -ne "@body('Check_explicit_label_authorization')?['Enabled']" -or
    $authorization.expression.equals[1] -ne $true -or
    @($authorization.else.actions.PSObject.Properties).Count -ne 0 -or
    -not $authorization.actions.List_pending_presentations -or
    $pending.runtimeConfiguration.concurrency.repetitions -ne 20 -or
    $reconcile.Plan_current_registry_presentation.inputs.parameters.actionName -ne 'mtc_GetMessageLabelPlan' -or
    $write.inputs.host.operationId -ne 'UpdateMessageCategories' -or
    $write.inputs.parameters.'If-Match' -ne "@body('Plan_current_registry_presentation')?['ETag']" -or
    $write.inputs.parameters.'body/categories' -ne "@json(body('Plan_current_registry_presentation')?['CategoriesJson'])" -or
    $reconcile.Verify_exact_category_readback.inputs.parameters.actionName -ne 'mtc_VerifyMessagePresentation' -or
    $pending.actions.Notify_presentation_failure.inputs.parameters.actionName -ne 'mtc_ReportPresentationFailure' -or
    -not $presentationText.Contains('MTC_PRESENTATION_FAILED')) {
    throw 'Presentation lost an independent authorization, ETag, readback, or failure safeguard.'
}
foreach ($readName in 'Get_current_immutable_metadata', 'Get_category_readback') {
    $read = $reconcile.$readName
    if ($read.inputs.host.operationId -ne 'GetMessageMetadata' -or
        $read.inputs.parameters.Prefer -ne 'IdType="ImmutableId"' -or
        $read.inputs.parameters.'$select' -ne 'id,parentFolderId,receivedDateTime,categories,from,sender,replyTo,internetMessageHeaders') {
        throw 'Presentation must retrieve fresh immutable metadata and headers before planning and after writing.'
    }
}
$userPath = Join-Path $source 'Entities\systemuser\Entity.xml'
if (Test-Path -LiteralPath $userPath) {
    $user = [xml](Get-Content -LiteralPath $userPath -Raw)
    if ($user.Entity.SelectNodes('./*[not(self::Name or self::RibbonDiffXml)]').Count) {
        throw 'The built-in User dependency must be a reference-only shell.'
    }
}
Write-Output "Reviewed solution source: $($solution.UniqueName) $($solution.Version); all flows Off and tenant-local values absent."
