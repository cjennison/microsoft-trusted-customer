[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)] [string] $ConfigurationFile,
    [Parameter(Mandatory)] [string] $MailboxInventoryFile
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$inventory = Get-Content -LiteralPath $MailboxInventoryFile -Raw | ConvertFrom-Json
if ($inventory.authorizationConfirmed -ne $true -or @($inventory.mailboxes).Count -eq 0) {
    throw 'An explicitly authorized, nonempty mailbox inventory is required.'
}
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($mailbox in $inventory.mailboxes) {
    if ($mailbox.type -notin @('User', 'Shared') -or
        $mailbox.reference -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' -or
        -not $seen.Add($mailbox.reference)) {
        throw 'Mailbox inventory contains invalid types, addresses, or duplicate identities.'
    }
}
if (-not $PSCmdlet.ShouldProcess($config.environmentOrigin, 'Onboard the authorized mailbox inventory in Paused state without activating processing')) {
    return
}
. (Join-Path $PSScriptRoot 'Browser-Job.ps1')
$provisioning = Get-Content -LiteralPath (Join-Path $root 'src\provisioning\dataverse.js') -Raw
$target = $config | Select-Object environmentOrigin, organizationId, environmentType, authorizationConfirmed | ConvertTo-Json -Compress
$mailboxes = $inventory.mailboxes | ConvertTo-Json -AsArray -Compress
$script = @"
$provisioning
const target=$target;
MtcProvisioning.validateTarget(target, location.origin);
const identity=await (await fetch('/api/data/v9.2/WhoAmI',{credentials:'same-origin',redirect:'error'})).json();
if(identity.OrganizationId.toLowerCase()!==target.organizationId.toLowerCase())throw new Error('Mailbox onboarding organization mismatch; no writes performed.');
let added=0;
let existing=0;
for(const mailbox of $mailboxes){
 const filter=encodeURIComponent("mtc_mailboxreference eq '"+mailbox.reference.replaceAll("'","''")+"'");
 const result=await fetch('/api/data/v9.2/mtc_mailboxenrollments?`$select=mtc_enrollmentstatus,mtc_mailboxtype&`$filter='+filter,{credentials:'same-origin',redirect:'error'});
 if(!result.ok)throw new Error('Mailbox enrollment lookup failed ('+result.status+').');
 const rows=(await result.json()).value;
 if(rows.length>1)throw new Error('Duplicate mailbox enrollment records; no implicit cleanup performed.');
 if(rows.length===1){
  if(rows[0].mtc_enrollmentstatus!==100000000||rows[0].mtc_mailboxtype!==(mailbox.type==='Shared'?100000001:100000000))throw new Error('Existing mailbox enrollment conflicts; no implicit pausing or type change performed.');
  existing++;
  continue;
 }
 const response=await fetch('/api/data/v9.2/mtc_SetMailboxEnrollment',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({MailboxReference:mailbox.reference,MailboxType:mailbox.type,Enrolled:false})});
 if(!response.ok)throw new Error('Mailbox onboarding failed ('+response.status+'): '+(await response.text()).slice(0,1500));
 added++;
}
return {added,existing,paused:added+existing,processorActivation:'Not performed'};
"@
$report = Invoke-MtcBrowserJob -Configuration $config -JavaScript $script
$report | ConvertTo-Json -Depth 4
