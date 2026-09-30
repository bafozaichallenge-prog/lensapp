# Security and data handling

## Controls (and how each is tested)
| Control | Implementation | Test |
|---|---|---|
| Every page/API needs a session | middleware cookie gate + database session validation in every page/route | E2E: unauthenticated `/projects` redirects; exports/packs/SSE return 401 |
| Server-side authorisation | `can()` matrix + GitLab visibility in every service call; UI hiding is cosmetic | role × operation matrix (services); E2E direct-URL attempts |
| Source visibility = Lens access AND GitLab access | cached, fail-closed check with the user's own token | services + E2E (outsider gets 404, empty lists) |
| Secrets | AES-256-GCM key ring; never returned, logged, put in prompts or audit detail | services (no plaintext in DB/JSON/audit); logger redaction |
| CSRF | server actions: Next.js origin check; route handlers: same-origin check; SameSite=Lax | E2E: cross-origin break-glass POST refused |
| CSP | per-request nonce, `strict-dynamic`, no `unsafe-eval` in production, `frame-ancestors 'self'`, `object-src 'none'` | E2E header assertions |
| Generated HTML isolation | served with `sandbox allow-scripts` and a locked-down policy; iframe `sandbox="allow-scripts"` | E2E: frame cannot read `document.cookie` or `localStorage` |
| Safe downloads | `Content-Disposition: attachment`, `nosniff`, `no-store`, sanitised file names | E2E |
| Uploads | type allow-list, 10 MB cap, DOCX zip-bomb guard, PDF refused | services |
| Spreadsheet injection | formula-leading cells prefixed in CSV export | core + ai tests |
| Brute force | break-glass rate limit; audited attempts | services |
| Prompt injection | fenced untrusted data, grounding validator, schema, no write access to the graph | ai + services (injection in requirement doc, source file, incident) |
| Audit | sign-in, sync, import, analysis, process, role, source and credential changes | services |

## AI data policy
| Data | Sent to the model? |
|---|---|
| Repository source code | Only what is relevant: an orientation context and files the model reads through tools (≤ 220 lines each) — and only for sources an Admin has enabled |
| Requirements | Relevant text only (description + documents, capped) |
| Client personal data | **No.** Redacted (e-mail, SA ID number, phone) before any prompt; personal-data CSV columns are dropped on import; the UI warns against uploading real client data |
| Credentials / secrets | **No.** Redacted (`glpat-`, `sk-ant-`, AWS keys, bearer tokens, `password=…`, private keys) |
| Production DB extracts | **No.** Not an accepted input |
| Imported operational history | Relevant sections only (recent commits, tickets, incidents) |

Prompt contents are never logged. The analysis row stores the tool calls (names and inputs) but not prompts or tool results.

## Limits worth knowing
- Redaction and personal-data detection are pattern-based; they will miss what they do not recognise.
- Prompt-injection defences reduce, not eliminate, risk; the graph is never written by the model, and every finding is checked against the snapshot.
- The visibility cache means a GitLab permission revoked mid-session can remain effective for up to 10 minutes.
- Process-pack sample values are synthetic; the generated HTML makes no network requests.
