[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param([Parameter(Mandatory)] [string] $ConfigurationFile)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
if (-not $PSCmdlet.ShouldProcess($config.environmentOrigin, 'Add scoped all-folder Graph metadata pagination without changing connector authentication')) {
    return
}
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
$provisioning = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed | ConvertTo-Json -Compress
$code = Get-Content -LiteralPath (Join-Path $root 'src\runtime\graph-paging.cs') -Raw | ConvertTo-Json -Compress
$script = @"
$provisioning
const target=$target;
MtcProvisioning.validateTarget(target,location.origin);
async function request(path,method='GET',body){
 const r=await fetch('/api/data/v9.2/'+path,{method,credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','MSCRM.SolutionUniqueName':'MicrosoftTrustedCustomer'},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw new Error('Connector update failed ('+r.status+'): '+(await r.text()).slice(0,1600));
 return r.status===204?null:r.json();
}
const identity=await request('WhoAmI');
if(identity.OrganizationId.toLowerCase()!==target.organizationId.toLowerCase())throw new Error('Connector organization mismatch; no writes performed.');
const id='8da23315-b15c-46d9-9f6f-dc85080b0276';
const connector=await request('connectors('+id+')?`$select=name,openapidefinition');
if(connector.name!=='mtc_mtc-20microsoft-20graph-20mail')throw new Error('Unexpected Graph connector identity.');
const swagger=JSON.parse(connector.openapidefinition);
if(swagger.host!=='graph.microsoft.com'||swagger.basePath!=='/v1.0')throw new Error('Unexpected Graph connector origin.');
swagger.paths['/users/{mailbox}/messages']={get:{
 operationId:'ListMailboxMessages',summary:'List all-folder delivered message metadata with scoped pagination',
 parameters:[
  {name:'mailbox',in:'path',required:true,type:'string'},
  {name:'`$filter',in:'query',required:false,type:'string'},
  {name:'`$select',in:'query',required:false,type:'string',default:'id,parentFolderId,receivedDateTime,from,sender,replyTo,categories,internetMessageHeaders'},
  {name:'`$top',in:'query',required:false,type:'integer',format:'int32',default:50,minimum:1,maximum:50},
  {name:'Prefer',in:'header',required:false,type:'string',default:'IdType="ImmutableId"'},
  {name:'x-mtc-page-url',in:'header',required:false,type:'string','x-ms-summary':'Exact next-page URL returned by Graph'}
 ],responses:{'200':{description:'Scoped metadata page'}}
}};
await request('connectors('+id+')','PATCH',{openapidefinition:JSON.stringify(swagger),customcodeblobcontent:$code,scriptoperations:JSON.stringify(['ListMailboxMessages'])});
await request('PublishXml','POST',{ParameterXml:'<importexportxml><connectors><connector>'+id+'</connector></connectors></importexportxml>'});
return {connector:'MTC Microsoft Graph Mail',operation:'ListMailboxMessages',authentication:'Unchanged',mailSending:'Not added',paging:'Exact Graph next link with origin/mailbox/metadata guards'};
"@
Invoke-MtcBrowserJob -Configuration $config -JavaScript $script | ConvertTo-Json -Depth 4
