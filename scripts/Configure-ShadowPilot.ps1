[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)] [string] $ConfigurationFile,
    [Parameter(Mandatory)] [string] $MailboxProcessorFile,
    [switch] $EnableShadow
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$access = Get-Content -LiteralPath $MailboxProcessorFile -Raw | ConvertFrom-Json
if ($access.authorizationConfirmed -ne $true -or $config.authorizationConfirmed -ne $true -or
    $config.environmentType -notin @('Sandbox', 'Developer')) {
    throw 'Explicit development and all-mailbox shadow authorization is required.'
}
if (-not $PSCmdlet.ShouldProcess($config.environmentOrigin, 'Configure authorized mailbox folder exclusions and optionally enroll the approved shadow scope with current-user in-app alerts')) { return }
Import-Module Microsoft.Graph.Authentication
Connect-MgGraph -TenantId $access.tenantId -ClientId $access.clientId `
    -CertificateThumbprint $access.certificateThumbprint -ContextScope Process -NoWelcome
try {
    $context = Get-MgContext
    if ($context.AuthType.ToString() -ne 'AppOnly' -or
        $context.TokenCredentialType.ToString() -ne 'ClientCertificate' -or
        $context.TenantId -ne $access.tenantId -or $context.ClientId -ne $access.clientId) {
        throw 'The exact authorized tenant/client certificate context is required.'
    }
    $mailboxes = @(
        foreach ($mailbox in $access.expectedAllowedMailboxes) {
            $ids = @(
                foreach ($folder in 'sentitems', 'drafts', 'outbox', 'deleteditems') {
                    $uri = 'https://graph.microsoft.com/v1.0/users/' + [Uri]::EscapeDataString($mailbox) +
                        '/mailFolders/' + $folder + '?$select=id'
                    $result = Invoke-MgGraphRequest -Method GET -Uri $uri -OutputType PSObject
                    if (-not $result.id) { throw 'An excluded folder ID is missing; processing was not enabled.' }
                    [string]$result.id
                }
            )
            [pscustomobject]@{ reference = $mailbox; folders = ($ids -join "`n") }
        }
    )
} finally {
    Disconnect-MgGraph | Out-Null
}
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
$source = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed | ConvertTo-Json -Compress
$scope = $mailboxes | ConvertTo-Json -AsArray -Compress
$enable = if ($EnableShadow) { 'true' } else { 'false' }
$script = @"
$source
const target=$target;
MtcProvisioning.validateTarget(target,location.origin);
async function request(path,method='GET',body){
 const r=await fetch('/api/data/v9.2/'+path,{method,credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw new Error('Shadow configuration failed ('+r.status+'): '+(await r.text()).slice(0,1500));
 return r.status===204?null:r.json();
}
const identity=await request('WhoAmI');
if(identity.OrganizationId.toLowerCase()!==target.organizationId.toLowerCase())throw new Error('Shadow configuration organization mismatch; no writes performed.');
const rows=await request('mtc_mailboxenrollments?`$select=mtc_mailboxenrollmentid,mtc_mailboxreference,mtc_mailboxtype,mtc_enrollmentstatus');
const scope=$scope;
const enableShadow=$enable;
for(const mailbox of scope){
 const matches=rows.value.filter(row=>row.mtc_mailboxreference.toLowerCase()===mailbox.reference.toLowerCase());
 if(matches.length!==1)throw new Error('Authorized mailbox enrollment is missing or ambiguous.');
 await request('mtc_SetMailboxFolderScope','POST',{MailboxRecordId:matches[0].mtc_mailboxenrollmentid,FolderIds:mailbox.folders});
 if(enableShadow)await request('mtc_SetMailboxEnrollment','POST',{MailboxReference:mailbox.reference,MailboxType:matches[0].mtc_mailboxtype===100000001?'Shared':'User',Enrolled:true});
}
if(enableShadow){
 for(const [name,value] of [['mtc_OperatorAlertDestination','user:'+identity.UserId],['mtc_ProcessingMode','Shadow']]){
  const definitions=await request('environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '+encodeURIComponent("'"+name+"'"));
  if(definitions.value.length!==1)throw new Error('Runtime setting is missing or ambiguous.');
  const id=definitions.value[0].environmentvariabledefinitionid;
  const current=await request('environmentvariablevalues?`$select=environmentvariablevalueid,value&`$filter=_environmentvariabledefinitionid_value eq '+id);
  if(current.value.length>1)throw new Error('Multiple current runtime settings; no implicit cleanup performed.');
  if(current.value.length===1)await request('environmentvariablevalues('+current.value[0].environmentvariablevalueid+')','PATCH',{value});
  else await request('environmentvariablevalues','POST',{value,'EnvironmentVariableDefinitionId@odata.bind':'/environmentvariabledefinitions('+id+')'});
 }
}
return {mailboxesConfigured:scope.length,enrolled:enableShadow?scope.length:0,mode:enableShadow?'Shadow':'Unchanged',historyDays:30,alerts:enableShadow?'Current operator in-app':'Unchanged',visibleLabels:'Not authorized'};
"@
Invoke-MtcBrowserJob -Configuration $config -JavaScript $script | ConvertTo-Json -Depth 4
