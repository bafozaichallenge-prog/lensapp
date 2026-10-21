import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { embedderFromEnv } from './embed.js';
import { Index } from './store.js';
import { findReferences, listSymbols, readSource, searchCode } from './tools.js';

const indexPath = process.env.RAG_INDEX_PATH ?? '.rag/index.json';
const sourceRoot = process.env.ABL_SOURCE_ROOT ?? 'sample-abl';
const embedder = embedderFromEnv();
const index = await Index.load(indexPath).catch(() => {
  console.error(`No index at ${indexPath}. Run: npm run index -- <abl-source-dir>`);
  process.exit(1);
});

const server = new McpServer({ name: 'openedge-rag', version: '0.1.0' });
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

server.tool(
  'search_code',
  'Hybrid (keyword + vector) search over indexed Progress OpenEdge ABL code. Returns matching procedures/functions/methods with file:line.',
  { query: z.string().min(1), limit: z.number().int().min(1).max(25).optional() },
  async ({ query, limit }) => text(await searchCode(index, embedder, query, limit)),
);
server.tool(
  'find_references',
  'Find code that uses a database table, RUNs a procedure/program, or includes a .i file.',
  { kind: z.enum(['table', 'run', 'include']), name: z.string().min(1) },
  async ({ kind, name }) => text(findReferences(index, kind, name)),
);
server.tool(
  'list_symbols',
  'List procedures, functions and methods, optionally for a single file.',
  { path: z.string().optional() },
  async ({ path }) => text(listSymbols(index, path)),
);
server.tool(
  'read_source',
  'Read numbered lines (max 400) from a source file, to confirm what a search hit actually says.',
  { path: z.string().min(1), from: z.number().int().min(1).optional(), to: z.number().int().min(1).optional() },
  async ({ path, from, to }) => {
    try { return text(await readSource(sourceRoot, path, from, to)); }
    catch (e) { return { ...text((e as Error).message), isError: true }; }
  },
);

await server.connect(new StdioServerTransport());
console.error(`openedge-rag ready: ${index.rows.length} chunks, embedder ${index.embedderName}`);
