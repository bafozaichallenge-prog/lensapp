# OpenEdge RAG + MCP starter kit

A small, self-contained TypeScript project that indexes **Progress OpenEdge (ABL)** source and serves it to AI assistants over the **Model Context Protocol**. It runs fully offline by default: no database, no API key, no Python.

```
ABL source ──► ABL-aware chunker ──► embedder ──► .rag/index.json
 (.p .w .i .cls)  (PROCEDURE/FUNCTION/    (hashing by default,        │
                   METHOD blocks + refs)   or any OpenAI-compatible)  ▼
                                                  MCP server (stdio): search_code,
                                                  find_references, list_symbols, read_source
```

## Run it

```bash
cd starter-kits/openedge-rag-mcp
npm install
npm test
npm run index -- sample-abl          # or the path to your own ABL checkout
npm run search -- credit limit check # try retrieval from the CLI
npm run mcp                          # stdio MCP server
```

Point Claude Code (or any MCP client) at it: `.mcp.json` is included. For your own code set `ABL_SOURCE_ROOT` to the same directory you indexed.

## MCP tools

| Tool | Purpose |
|---|---|
| `search_code` | Hybrid BM25 + vector search (reciprocal-rank fusion); returns `file:line` hits |
| `find_references` | Who uses a table, `RUN`s a program, or `{includes}` a `.i` file |
| `list_symbols` | Procedures / functions / methods, optionally per file |
| `read_source` | Numbered lines from a file (≤ 400), confined to `ABL_SOURCE_ROOT` |

## How retrieval works

- **Chunking** (`src/abl.ts`): one chunk per `PROCEDURE` / `FUNCTION` / `METHOD`; everything else is windowed as `(main block)`. Comments (ABL comments nest) are masked before parsing. Each chunk records the tables, `RUN` targets and includes it touches. This is regex-based, not a full ABL parser: extend it for `ON` triggers, `DEFINE` blocks, dynamic queries, etc.
- **Embeddings** (`src/embed.ts`): the default `HashingEmbedder` is lexical (identifier-aware, splits `cust-order-total` and `CustOrderTotal`), so it is fast and offline but **not semantic**. For semantic retrieval set `EMBEDDINGS_URL`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_API_KEY` (any OpenAI-compatible `/embeddings` endpoint) and re-index. Code is then sent to that endpoint: decide that deliberately for proprietary source.
- **Store** (`src/store.ts`): a JSON file, fine up to tens of thousands of chunks. Swap in pgvector/SQLite when you outgrow it; `Index.search` is the only seam you need to replace.

## Next steps

- Index `.df` schema dumps so `find_references` can resolve field-level usage.
- Incremental indexing keyed on file hash / Git SHA.
- Add an MCP `resources` view of the schema and a prompt for impact analysis.
- Treat retrieved code as untrusted data in any downstream prompt.

Note: `read_source` and the index expose everything under the directories you point them at. Do not index repositories the connected assistant should not see.
