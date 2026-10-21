# OpenEdge AI Suite Showcase

A small sample project that demonstrates three pieces of the Progress OpenEdge AI story end to end, on a Windows server where OpenEdge is already installed:

| Capability | What it shows | Where |
|---|---|---|
| **Agentic RAG** | AI answers business-policy questions grounded in your documents, with citations | `rag/`, `scripts/ingest-knowledge.ps1` |
| **OpenEdge MCP Server** | AI agents call real ABL business logic (read *and* write) through governed tools | `abl/`, `mcp/`, `scripts/mcp-smoke-test.ps1` |
| **MCP Connector for ABL / AI Coding Assistant** | Developer assistant that understands your ABL and OpenEdge docs | section 6 |

> **Verification status.** I could not reach docs.progress.com from the authoring sandbox, so product-specific
> property names, menu paths, endpoint URLs and version requirements below are marked **(verify)**. The ABL
> code has not been compiled and the scripts have not been run against a live OpenEdge server. Treat this as a
> scaffold and check each step against the docs for your installed version
> (the MCP Server docs bundle and the Agentic RAG docs on docs.progress.com).

## Architecture

```
 AI client (Claude Desktop / VS Code / Windsurf / custom agent)
        |  MCP (JSON-RPC over HTTPS)                |  MCP / REST
        v                                           v
 OpenEdge MCP Server  ---- REST ---->  PAS for OpenEdge        Progress Agentic RAG
 (tools = REST ops,                    (Showcase.OrderService   (Knowledge Box built from
  auth, governance)                     + sports2020 DB)         rag/knowledge/*.md)
```

Key idea: the MCP Server does **not** let the AI hit the database. It exposes your existing REST services
(PAS for OpenEdge) as tools, so credit checks, validation and audit rules in ABL still run.

## 0. Prerequisites (verify)

- OpenEdge **12.8 or later** (Progress recommends the current LTS for the MCP Server) with a **PAS for OpenEdge** instance.
- `sports2020` sample database (create with `prodb sports2020 sports2020`, start with `proserve`).
- Network: the Windows server must be able to reach the Agentic RAG SaaS endpoint (outbound HTTPS), and your AI clients must reach the MCP Server port.
- Licences/entitlements for the MCP Server and Agentic RAG (separate Progress offerings) and the install media from the Progress Download Center.
- A TLS certificate for the MCP Server / PAS HTTPS connector. Do not run MCP over plain HTTP beyond localhost.

## 1. Publish the ABL as REST on PAS

1. Create the DB: `prodb sports2020 sports2020` then `proserve sports2020 -S 20000`.
2. Create a PAS instance (run in an elevated prompt from `%DLC%\bin`):
   `pasman create -p 8830 -P 8831 -s 8832 showcase` (verify flags) then `pasman start -I showcase`.
3. In Progress Developer Studio, make a project for `abl/src/Showcase/OrderService.cls`, use the
   **REST service wizard** (the class already carries `@openapi.openedge.export` annotations), and generate a
   `.paar`. Compile with the right PROPATH.
4. Deploy: `oeprop`/`tcman deploy showcase.paar` (verify) and merge `abl/conf/openedge.properties.snippet`
   into your instance `openedge.properties`.
5. Test the REST endpoint and fetch its OpenAPI document (needed by the MCP Server):
   `curl -k https://localhost:8831/showcase/rest/ShowcaseService/OrderService/GetCustomerCreditStatus -d "{\"piCustNum\":1}" -H "Content-Type: application/json"`
   (path shape depends on the generated service name; verify).

## 2. Install and configure the OpenEdge MCP Server (verify)

1. Download the OpenEdge MCP Server package from the Progress Download Center and run the Windows installer, or unzip it to e.g. `C:\Progress\oe-mcp`.
2. Configure it to point at your PAS REST service and OpenAPI catalog (the config file name and keys are in the
   product docs: typically the PAS base URL, the OpenAPI/catalog location, listening port, TLS keystore).
3. **Choose which operations become tools.** Expose the three showcase operations and describe them so the LLM
   knows when to use them (a good description is the difference between a working and a useless tool):

   | Tool name | Maps to | Kind | Description to give the LLM |
   |---|---|---|---|
   | `get_customer_credit_status` | `GetCustomerCreditStatus` | read | "Return name, balance, credit limit and on-hold flag for a customer number." |
   | `list_open_orders` | `ListOpenOrders` | read | "List a customer's orders that have not shipped." |
   | `place_order_hold` | `PlaceOrderHold` | **write** | "Put an unshipped order on hold. Requires a reason. Confirm with the user first." |

4. Security (do this before demoing to anyone):
   - Front it with OAuth2/OIDC or token auth; use a dedicated service identity with least privilege.
   - Keep write tools (`place_order_hold`) behind a role, and log every call.
   - Bind to an internal interface / firewall the port; terminate TLS.
5. Start it as a Windows service (e.g. with NSSM or the installer's service option) and confirm with the smoke test:

   ```powershell
   $env:MCP_URL   = 'https://localhost:8443/mcp'   # your configured URL (verify)
   $env:MCP_TOKEN = '<token>'
   .\scripts\mcp-smoke-test.ps1
   .\scripts\mcp-smoke-test.ps1 -Tool get_customer_credit_status -Arguments '{"piCustNum":1}'
   ```
   `tools/list` should return the three tools with their schemas.

## 3. Set up Agentic RAG (verify)

Agentic RAG for OpenEdge is a hosted Progress service (built on Nuclia technology). You create a **Knowledge Box**, load documents, then query it.

1. Sign in to your Progress Agentic RAG account and create a Knowledge Box (choose the region closest to the server, and consider data-residency).
2. Create a **service account key** (Contributor to ingest, Reader to query). Store it in a secret store, not in source.
3. Ingest the sample knowledge from the Windows server:

   ```powershell
   $env:RAG_API_BASE = 'https://<zone>.nuclia.cloud/api'
   $env:RAG_KB_ID    = '<knowledge-box-id>'
   $env:RAG_API_KEY  = '<service-account-key>'
   .\scripts\ingest-knowledge.ps1 -Ask 'When can an order not be placed on hold?'
   ```
4. For real use, point ingestion at your own sources: ABL source, `.df` schema, runbooks, policy PDFs, ticket exports.
   Re-ingest on a schedule (Windows Task Scheduler) or from your CI pipeline.
5. Expose the Knowledge Box to AI clients (the Agentic RAG docs describe an MCP endpoint/tool for it - verify), or call its REST `ask` API from your own app.

## 4. Connect an AI client

Copy `mcp/mcp-client.example.json` into your client's MCP settings (Claude Desktop, VS Code, Windsurf, Cursor), fill in
URLs and tokens. You now have two MCP servers: one for **doing** (business logic) and one for **knowing** (RAG).

## 5. Demo script (10 minutes)

1. **Knowing (RAG):** "What is our policy on holding shipped orders?" -> answer cites `credit-policy.md` (CR-5).
2. **Doing, read (MCP):** "Is customer 1 over their credit limit?" -> agent calls `get_customer_credit_status`.
3. **Both together:** "List customer 1's open orders and tell me whether any can be held under policy." -> RAG for the rules + `list_open_orders`.
4. **Doing, write (MCP):** "Hold order <n> because of a credit breach." -> agent confirms, calls `place_order_hold`; ABL enforces CR-3/CR-5.
5. **Guardrail:** "Hold an already shipped order" -> ABL returns 409; the AI reports it rather than bypassing logic. This is the point to land with the audience: the AI is governed by your existing business rules.
6. **Dev assistant:** open `OrderService.cls` and ask the coding assistant to add a `ReleaseOrderHold` method following the same pattern (section 6).

## 6. Developer side: AI Coding Assistant / MCP Connector for ABL (verify)

Progress ships an OpenEdge AI Coding Assistant and an MCP Connector for ABL so that tools like Windsurf, VS Code or Cursor
get OpenEdge documentation and syntax via RAG and can work with ABL. Install per the product docs, add its MCP entry to the
same client config as above, and try prompts such as "explain what `PlaceOrderHold` does and write a unit test (OEUnit)".

## Troubleshooting

- `tools/list` is empty: the OpenAPI catalog path is wrong, or no operations are marked as tools.
- 401/403 from PAS: the MCP Server's service identity lacks the role required by the REST service.
- Agent chooses the wrong tool: sharpen tool descriptions and parameter names.
- Self-signed cert errors from clients: import the CA to the client trust store; avoid disabling TLS verification.

## Files

```
abl/src/Showcase/OrderService.cls   ABL business logic exposed as REST
abl/conf/openedge.properties.snippet PAS config sample
rag/knowledge/*.md                  Sample documents to ingest
scripts/ingest-knowledge.ps1        Upload docs / ask the Knowledge Box
scripts/mcp-smoke-test.ps1          initialize / tools/list / tools/call
mcp/mcp-client.example.json         AI client config
```
