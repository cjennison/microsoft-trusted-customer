[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ConfigurationFile
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$guidPattern = '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
if ($config.authorizationConfirmed -ne $true -or
    [string]$config.tenantId -notmatch $guidPattern -or
    [string]$config.clientId -notmatch $guidPattern -or
    [string]$config.certificateThumbprint -notmatch '^[0-9A-Fa-f]{40,64}$') {
    throw 'Authorized tenant, client, and certificate identifiers are required.'
}
$allowed = @($config.expectedAllowedMailboxes)
$denied = @($config.expectedDeniedMailboxes)
if (-not $allowed.Count -or
    @($allowed + $denied | Where-Object { $_ -isnot [string] -or $_ -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' }).Count -or
    (Compare-Object @($allowed + $denied) @($allowed + $denied | Select-Object -Unique))) {
    throw 'Canonical unique allowed and denied mailbox lists are required.'
}
if (-not (Get-Module -ListAvailable Microsoft.Graph.Authentication)) {
    throw 'Microsoft.Graph.Authentication is required.'
}

Import-Module Microsoft.Graph.Authentication
Connect-MgGraph -TenantId $config.tenantId -ClientId $config.clientId `
    -CertificateThumbprint $config.certificateThumbprint -NoWelcome
try {
    $context = Get-MgContext
    if ($context.AuthType.ToString() -ne 'AppOnly' -or
        $context.TokenCredentialType.ToString() -ne 'ClientCertificate') {
        throw 'Mailbox processor validation requires app-only certificate authentication.'
    }

    function Invoke-MailboxProbe {
        param([string] $Mailbox, [bool] $ShouldAllow)
        try {
            $null = Invoke-MgGraphRequest -Method GET -Uri `
                "https://graph.microsoft.com/v1.0/users/$Mailbox/mailFolders/inbox?`$select=displayName" `
                -OutputType PSObject
            $status = 200
        } catch {
            $status = $null
            if ($_.Exception.PSObject.Properties.Name -contains 'ResponseStatusCode') {
                $status = [int]$_.Exception.ResponseStatusCode
            } elseif ($_.Exception.Response) {
                $status = [int]$_.Exception.Response.StatusCode
            }
        }
        $passed = if ($ShouldAllow) { $status -eq 200 } else { $status -eq 403 }
        [pscustomobject]@{
            Mailbox = $Mailbox
            Expected = if ($ShouldAllow) { 'Allowed' } else { 'Denied' }
            Status = $status
            Passed = $passed
        }
    }

    $results = @(
        $allowed | ForEach-Object { Invoke-MailboxProbe -Mailbox $_ -ShouldAllow $true }
        $denied | ForEach-Object { Invoke-MailboxProbe -Mailbox $_ -ShouldAllow $false }
    )
    $results | Format-Table -AutoSize
    if (@($results | Where-Object { -not $_.Passed }).Count) {
        throw 'Mailbox processor access did not match the approved scope.'
    }
} finally {
    Disconnect-MgGraph | Out-Null
}
