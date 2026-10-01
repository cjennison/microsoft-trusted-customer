function Invoke-MtcBrowserJob {
    param(
        [Parameter(Mandatory)] [psobject] $Configuration,
        [Parameter(Mandatory)] [string] $JavaScript
    )

    if ($Configuration.browserSession -notmatch '^[a-zA-Z0-9-]+$' -or $Configuration.browserSession -eq 'default') {
        throw 'A named, isolated agent-browser session is required.'
    }
    if ($Configuration.browserTab -notmatch '^t[1-9][0-9]*$') {
        throw 'The authenticated Dataverse browser tab ID is required.'
    }
    if ($Configuration.authorizationConfirmed -ne $true -or $Configuration.environmentType -notin @('Sandbox', 'Developer')) {
        throw 'Only explicitly authorized Sandbox or Developer environments are supported.'
    }
    Get-Command agent-browser -ErrorAction Stop | Out-Null
    & agent-browser --session $Configuration.browserSession tab $Configuration.browserTab | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'The approved Dataverse browser tab is unavailable.'
    }
    $script = @"
if (globalThis.MtcProvisioningJob?.status === 'running') {
    throw new Error('A development job is already running. Inspect its status; do not launch a duplicate.');
}
globalThis.MtcProvisioningJob = {status: 'running'};
(async () => {
$JavaScript
})().then(
    result => { globalThis.MtcProvisioningJob = {status: 'done', result}; },
    error => { globalThis.MtcProvisioningJob = {status: 'failed', message: error.message}; }
);
({status: 'started'});
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
    if ($encoded.Length -gt 30000) {
        throw 'Browser job exceeds the Windows command-line limit. Split the operation before launching it.'
    }
    $started = & agent-browser --session $Configuration.browserSession --json eval -b $encoded
    if ($LASTEXITCODE -ne 0) {
        throw "Could not start development job: $started"
    }
    $deadline = [DateTime]::UtcNow.AddMinutes(10)
    do {
        Start-Sleep -Seconds 2
        & agent-browser --session $Configuration.browserSession tab $Configuration.browserTab | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Cannot select the approved Dataverse tab; the job may still be running.'
        }
        $output = & agent-browser --session $Configuration.browserSession --json eval 'globalThis.MtcProvisioningJob'
        if ($LASTEXITCODE -ne 0) {
            throw 'Cannot read development job status. It may still be running; inspect this browser before retrying.'
        }
        $response = $output | ConvertFrom-Json
        if (-not $response.success -or -not $response.data.result.status) {
            throw 'Development job status is unavailable. Do not navigate the target tab or launch a duplicate.'
        }
        $job = $response.data.result
        if ($job.status -eq 'failed') {
            throw "Development job failed; partial components may remain. Resolve before retrying: $($job.message)"
        }
        if ($job.status -eq 'done') {
            return $job.result
        }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Development job did not finish within 10 minutes. Inspect its browser state before retrying.'
}
