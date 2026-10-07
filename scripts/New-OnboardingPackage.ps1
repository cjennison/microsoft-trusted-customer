[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Company,
    [Parameter(Mandatory)] [string] $SupportContact,
    [Parameter(Mandatory)] [string] $Registrars,
    [Parameter(Mandatory)] [string] $RegistryLink,
    [string] $GuideLink = '(link to the guide in your SharePoint)',
    [string] $SenderName = $SupportContact,
    [string] $LookalikeExample = 'supp1ier.com instead of supplier.com',
    [Parameter(Mandatory)] [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = [IO.Path]::GetFullPath($OutputDirectory)
$private = [IO.Path]::GetFullPath((Join-Path $root '.local')) + [IO.Path]::DirectorySeparatorChar
if (-not $output.StartsWith($private, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Customer onboarding packages contain tenant details and must be written beneath the Git-ignored .local directory.'
}
if ($RegistryLink -cnotmatch '^https://[a-z0-9-]+\.crm[0-9]*\.dynamics\.com/') { throw 'RegistryLink must be the Sender Registry app URL.' }

$values = @{
    '{{COMPANY}}' = $Company; '{{SUPPORT_CONTACT}}' = $SupportContact; '{{REGISTRARS}}' = $Registrars
    '{{REGISTRY_LINK}}' = $RegistryLink; '{{GUIDE_LINK}}' = $GuideLink; '{{SENDER_NAME}}' = $SenderName
    '{{LOOKALIKE_EXAMPLE}}' = $LookalikeExample
}
function Expand-Template([string] $Text) {
    foreach ($key in $values.Keys) { $Text = $Text.Replace($key, $values[$key]) }
    if ($Text -match '\{\{[A-Z_]+\}\}') { throw "Unresolved placeholder: $($Matches[0])" }
    return $Text
}

function ConvertTo-WordXml([string] $Markdown) {
    $escape = { param($t) [Security.SecurityElement]::Escape($t) }
    function Runs([string] $line, [string] $extra = '') {
        $parts = [regex]::Split($line, '(\*\*[^*]+\*\*|\*[^*]+\*)')
        ($parts | Where-Object { $_ } | ForEach-Object {
            $props = $extra
            $text = $_
            if ($text -match '^\*\*(.+)\*\*$') { $text = $Matches[1]; $props += '<w:b/>' }
            elseif ($text -match '^\*(.+)\*$') { $text = $Matches[1]; $props += '<w:i/>' }
            $rpr = if ($props) { "<w:rPr>$props</w:rPr>" } else { '' }
            "<w:r>$rpr<w:t xml:space=`"preserve`">$(& $escape $text)</w:t></w:r>"
        }) -join ''
    }
    $body = New-Object System.Text.StringBuilder
    $paragraph = New-Object System.Collections.Generic.List[string]
    $flush = {
        if ($paragraph.Count) {
            [void]$body.Append("<w:p>$(Runs ($paragraph -join ' '))</w:p>")
            $paragraph.Clear()
        }
    }
    foreach ($raw in ($Markdown -split "`r?`n")) {
        $line = $raw.TrimEnd()
        if (-not $line.Trim() -or $line -eq '---') { & $flush; continue }
        if ($line -match '^(#{1,3}) (.+)$') {
            & $flush
            $style = @{ 1 = 'Heading1'; 2 = 'Heading2'; 3 = 'Heading3' }[$Matches[1].Length]
            [void]$body.Append("<w:p><w:pPr><w:pStyle w:val=`"$style`"/></w:pPr>$(Runs $Matches[2])</w:p>")
        } elseif ($line -match '^- (.+)$') {
            & $flush
            [void]$body.Append("<w:p><w:pPr><w:pStyle w:val=`"ListParagraph`"/><w:ind w:left=`"720`" w:hanging=`"360`"/></w:pPr><w:r><w:t xml:space=`"preserve`">•`t</w:t></w:r>$(Runs $Matches[1])</w:p>")
        } elseif ($line -match '^(\d+)\. (.+)$') {
            & $flush
            [void]$body.Append("<w:p><w:pPr><w:pStyle w:val=`"ListParagraph`"/><w:ind w:left=`"720`" w:hanging=`"360`"/></w:pPr><w:r><w:t xml:space=`"preserve`">$($Matches[1]).`t</w:t></w:r>$(Runs $Matches[2])</w:p>")
        } elseif ($line -match '^> (.+)$') {
            & $flush
            [void]$body.Append("<w:p><w:pPr><w:pStyle w:val=`"IntenseQuote`"/></w:pPr>$(Runs $Matches[1])</w:p>")
        } else {
            $paragraph.Add($line.Trim())
        }
    }
    & $flush
    return $body.ToString()
}

function Write-Docx([string] $Path, [string] $Markdown, [string] $Title) {
    $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    $document = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><w:document xmlns:w=`"$w`"><w:body>$(ConvertTo-WordXml $Markdown)<w:sectPr><w:pgSz w:w=`"12240`" w:h=`"15840`"/><w:pgMar w:top=`"1080`" w:right=`"1080`" w:bottom=`"1080`" w:left=`"1080`" w:header=`"720`" w:footer=`"720`" w:gutter=`"0`"/></w:sectPr></w:body></w:document>"
    $font = '<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>'
    $styles = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><w:styles xmlns:w=`"$w`">" +
        "<w:docDefaults><w:rPrDefault><w:rPr>$font<w:sz w:val=`"21`"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after=`"120`" w:line=`"276`" w:lineRule=`"auto`"/></w:pPr></w:pPrDefault></w:docDefaults>" +
        "<w:style w:type=`"paragraph`" w:default=`"1`" w:styleId=`"Normal`"><w:name w:val=`"Normal`"/></w:style>" +
        "<w:style w:type=`"paragraph`" w:styleId=`"Heading1`"><w:name w:val=`"heading 1`"/><w:basedOn w:val=`"Normal`"/><w:next w:val=`"Normal`"/><w:pPr><w:keepNext/><w:spacing w:before=`"360`" w:after=`"160`"/><w:outlineLvl w:val=`"0`"/></w:pPr><w:rPr><w:b/><w:color w:val=`"0F4C81`"/><w:sz w:val=`"36`"/></w:rPr></w:style>" +
        "<w:style w:type=`"paragraph`" w:styleId=`"Heading2`"><w:name w:val=`"heading 2`"/><w:basedOn w:val=`"Normal`"/><w:next w:val=`"Normal`"/><w:pPr><w:keepNext/><w:spacing w:before=`"280`" w:after=`"100`"/><w:outlineLvl w:val=`"1`"/></w:pPr><w:rPr><w:b/><w:color w:val=`"0078D4`"/><w:sz w:val=`"28`"/></w:rPr></w:style>" +
        "<w:style w:type=`"paragraph`" w:styleId=`"Heading3`"><w:name w:val=`"heading 3`"/><w:basedOn w:val=`"Normal`"/><w:next w:val=`"Normal`"/><w:pPr><w:keepNext/><w:outlineLvl w:val=`"2`"/></w:pPr><w:rPr><w:b/><w:sz w:val=`"24`"/></w:rPr></w:style>" +
        "<w:style w:type=`"paragraph`" w:styleId=`"ListParagraph`"><w:name w:val=`"List Paragraph`"/><w:basedOn w:val=`"Normal`"/><w:pPr><w:spacing w:after=`"60`"/></w:pPr></w:style>" +
        "<w:style w:type=`"paragraph`" w:styleId=`"IntenseQuote`"><w:name w:val=`"Intense Quote`"/><w:basedOn w:val=`"Normal`"/><w:pPr><w:pBdr><w:left w:val=`"single`" w:sz=`"24`" w:space=`"8`" w:color=`"0078D4`"/></w:pBdr><w:shd w:val=`"clear`" w:color=`"auto`" w:fill=`"EFF6FC`"/><w:ind w:left=`"360`"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>"
    $now = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $core = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><cp:coreProperties xmlns:cp=`"http://schemas.openxmlformats.org/package/2006/metadata/core-properties`" xmlns:dc=`"http://purl.org/dc/elements/1.1/`" xmlns:dcterms=`"http://purl.org/dc/terms/`" xmlns:xsi=`"http://www.w3.org/2001/XMLSchema-instance`"><dc:title>$([Security.SecurityElement]::Escape($Title))</dc:title><dcterms:created xsi:type=`"dcterms:W3CDTF`">$now</dcterms:created></cp:coreProperties>"
    $parts = [ordered]@{
        '[Content_Types].xml' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
        '_rels/.rels' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
        'word/_rels/document.xml.rels' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
        'word/document.xml' = $document
        'word/styles.xml' = $styles
        'docProps/core.xml' = $core
    }
    foreach ($xml in $parts.Values) { [xml]$xml | Out-Null }
    if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path }
    Add-Type -AssemblyName System.IO.Compression
    $zip = [IO.Compression.ZipFile]::Open($Path, 'Create')
    try {
        foreach ($name in $parts.Keys) {
            $entry = $zip.CreateEntry($name)
            $stream = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding $false))
            try { $stream.Write($parts[$name]) } finally { $stream.Dispose() }
        }
    } finally { $zip.Dispose() }
}

[IO.Directory]::CreateDirectory($output) | Out-Null
$guide = Expand-Template (Get-Content -LiteralPath (Join-Path $root 'docs\onboarding\staff-guide.template.md') -Raw -Encoding UTF8)
$email = Expand-Template (Get-Content -LiteralPath (Join-Path $root 'docs\onboarding\announcement-email.template.txt') -Raw -Encoding UTF8)
[IO.File]::WriteAllText((Join-Path $output 'Known sender labels - staff guide.md'), $guide)
[IO.File]::WriteAllText((Join-Path $output 'announcement-email.txt'), $email)
Write-Docx (Join-Path $output 'Known sender labels - staff guide.docx') $guide 'Known sender labels in Outlook: staff guide'
Get-ChildItem -LiteralPath $output | Select-Object Name, Length
