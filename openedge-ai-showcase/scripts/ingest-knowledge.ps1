<#
  Uploads rag/knowledge/*.md into a Progress Agentic RAG (Nuclia-based) Knowledge Box
  and optionally asks a test question.

  Required env vars:
    RAG_API_BASE   e.g. https://europe-1.nuclia.cloud/api   (zone URL from your Agentic RAG account)
    RAG_KB_ID      Knowledge Box id
    RAG_API_KEY    Service-account key (Contributor role to ingest, Reader to ask)

  NOTE: endpoint paths follow the public Nuclia REST API; confirm against the
  Progress Agentic RAG docs for your tenant before relying on them.
#>
param(
    [string]$KnowledgeDir = (Join-Path $PSScriptRoot '..\rag\knowledge'),
    [string]$Ask
)
$ErrorActionPreference = 'Stop'
foreach ($v in 'RAG_API_BASE', 'RAG_KB_ID', 'RAG_API_KEY') {
    if (-not (Get-Item "env:$v" -ErrorAction SilentlyContinue)) { throw "Set `$env:$v first" }
}
$base    = "$($env:RAG_API_BASE.TrimEnd('/'))/v1/kb/$($env:RAG_KB_ID)"
$headers = @{ 'X-NUCLIA-SERVICEACCOUNT' = "Bearer $($env:RAG_API_KEY)"; 'Content-Type' = 'application/json' }

Get-ChildItem $KnowledgeDir -Filter *.md | ForEach-Object {
    $slug = $_.BaseName.ToLower()
    $body = @{
        title = $_.BaseName
        slug  = $slug
        texts = @{ content = @{ body = (Get-Content $_.FullName -Raw); format = 'MARKDOWN' } }
    } | ConvertTo-Json -Depth 5
    try {
        Invoke-RestMethod -Method Post -Uri "$base/resources" -Headers $headers -Body $body | Out-Null
        Write-Host "Ingested $($_.Name)"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 419 -or $_.Exception.Response.StatusCode.value__ -eq 409) {
            Write-Host "Already exists, skipped: $($_.Name)"
        } else { throw }
    }
}

if ($Ask) {
    $q = @{ query = $Ask } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Post -Uri "$base/ask" -Headers $headers -Body $q
    $r
}
