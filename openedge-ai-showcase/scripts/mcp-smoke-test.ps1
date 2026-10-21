<#
  Talks to an MCP server over Streamable HTTP (JSON-RPC 2.0): initialize -> tools/list -> optional tools/call.
  Use it to prove the OpenEdge MCP Server is up before wiring an AI client.

  Example:
    $env:MCP_URL   = 'https://oe-server:8443/mcp'      # URL from your OpenEdge MCP Server config
    $env:MCP_TOKEN = '<bearer token>'
    .\mcp-smoke-test.ps1
    .\mcp-smoke-test.ps1 -Tool get_customer_credit_status -Arguments '{"piCustNum":1}'
#>
param(
    [string]$Url = $env:MCP_URL,
    [string]$Token = $env:MCP_TOKEN,
    [string]$Tool,
    [string]$Arguments = '{}'
)
$ErrorActionPreference = 'Stop'
if (-not $Url) { throw 'Set MCP_URL or pass -Url' }

$h = @{ 'Content-Type' = 'application/json'; 'Accept' = 'application/json, text/event-stream' }
if ($Token) { $h['Authorization'] = "Bearer $Token" }

function Send-Rpc($method, $params, $id) {
    $msg = @{ jsonrpc = '2.0'; method = $method }
    if ($null -ne $id)     { $msg.id = $id }
    if ($null -ne $params) { $msg.params = $params }
    Invoke-WebRequest -Method Post -Uri $Url -Headers $h -Body ($msg | ConvertTo-Json -Depth 10) -UseBasicParsing
}

$init = Send-Rpc 'initialize' @{
    protocolVersion = '2025-03-26'
    capabilities    = @{}
    clientInfo      = @{ name = 'showcase-smoke-test'; version = '0.1' }
} 1
$sid = $init.Headers['Mcp-Session-Id']
if ($sid) { $h['Mcp-Session-Id'] = [string]$sid }
Write-Host "initialize: HTTP $($init.StatusCode)"
Send-Rpc 'notifications/initialized' $null $null | Out-Null

$list = Send-Rpc 'tools/list' @{} 2
Write-Host "tools/list:"; $list.Content

if ($Tool) {
    $call = Send-Rpc 'tools/call' @{ name = $Tool; arguments = ($Arguments | ConvertFrom-Json) } 3
    Write-Host "tools/call $Tool :"; $call.Content
}
