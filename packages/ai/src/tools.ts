import type { RepoIndex } from './repo';
import { filePurpose } from './repo';

export const MAX_TOOL_CHARS = 30_000;
export const MAX_READ_LINES = 220;

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
export interface Tool extends ToolDef { execute(input: Record<string, unknown>): unknown }

const clip = (t: string, n = MAX_TOOL_CHARS) => (t.length > n ? t.slice(0, n) + '\n…(truncated)' : t);

/** The four retrieval tools (plan §15.3), operating on the pinned snapshot only. `log` receives human-readable progress. */
export function makeTools(i: RepoIndex, log: (msg: string) => void = () => {}): Tool[] {
  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const g = i.graph, s = i.strip;
  const fileNode = (p: string) => g.files.find((f) => f.path === p);
  return [
    {
      name: 'search_code', description: 'Case-insensitive text search across all source files. Returns up to 12 matches as {path, line, text}.',
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute(inp) {
        const q = String(inp.query ?? '').toLowerCase().trim();
        if (!q) throw new Error('query is empty');
        log(`Searching the code for “${inp.query}”`);
        const out: { path: string; line: number; text: string }[] = [];
        for (const [p, text] of i.texts) {
          if (fileNode(p)?.kind === 'doc') continue;
          const lines = text.split('\n');
          for (let n = 0; n < lines.length && out.length < 12; n++) if (lines[n]!.toLowerCase().includes(q)) out.push({ path: s(p), line: n + 1, text: lines[n]!.trim().slice(0, 160) });
          if (out.length >= 12) break;
        }
        return out.length ? out : 'No matches.';
      },
    },
    {
      name: 'read_file', description: `Read source lines of one file by exact path from the FILE INDEX. Optional start/end line numbers (1-based); at most ${MAX_READ_LINES} lines.`,
      input_schema: { type: 'object', properties: { path: { type: 'string' }, start: { type: 'integer' }, end: { type: 'integer' } }, required: ['path'] },
      execute(inp) {
        const p = i.resolve(String(inp.path ?? ''));
        if (!p) throw new Error(`No such file: ${inp.path}`);
        log(`Reading ${name(p)}`);
        const lines = i.texts.get(p)!.split('\n');
        const a = Math.max(1, Number(inp.start) || 1), b = Math.min(lines.length, Number(inp.end) || a + MAX_READ_LINES - 1, a + MAX_READ_LINES - 1);
        return clip(lines.slice(a - 1, b).map((l, n) => `${a + n}: ${l}`).join('\n'));
      },
    },
    {
      name: 'get_node', description: 'Facts about a file path, requirement id, rule code, or table (table:Name): purpose, methods, ids, tables read/written, dependents, dependencies, direct tests, process steps.',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute(inp) {
        const id = String(inp.id ?? '');
        const path = i.resolve(id);
        log(`Looking up ${path ? name(path) : id}`);
        if (path) {
          const v = i.view.files.get(path), sym = g.symbols.find((x) => x.file === path);
          const out = g.edges.filter((e) => e.from === `file:${path}`), inc = g.edges.filter((e) => e.to === `file:${path}`);
          return {
            path: s(path), kind: v?.kind, layer: v?.layer, purpose: filePurpose(i, path), inherits: sym?.inherits, implements: sym?.implements, methods: sym?.methods ?? v?.methods,
            requirements: out.filter((e) => e.type === 'implements-req').map((e) => e.to.slice(4)), rule_codes: out.filter((e) => e.type === 'enforces').map((e) => e.to.slice(5)),
            db: out.filter((e) => e.type.startsWith('db-')).map((e) => `${e.to.slice(6)} (${e.type.slice(3)})`),
            depended_on_by: inc.filter((e) => ['uses', 'creates', 'inherits', 'implements', 'runs', 'includes'].includes(e.type)).map((e) => s(e.from.slice(5))),
            depends_on: out.filter((e) => ['uses', 'creates', 'inherits', 'implements', 'runs', 'includes'].includes(e.type)).map((e) => s(e.to.slice(5))),
            direct_tests: (v?.testedBy ?? []).map(s),
            process_steps: i.view.processes.flatMap((p) => p.steps.filter((st) => st.files.includes(path)).map((st) => `${p.name} ${st.n}`)),
          };
        }
        const req = g.requirements.find((r) => r.code === id);
        if (req) return { ...req, implemented_by: g.edges.filter((e) => e.to === `req:${id}` && e.type === 'implements-req').map((e) => s(e.from.slice(5))) };
        const rule = g.ruleCodes.find((r) => r.code === id);
        if (rule) return { ...rule, enforced_in: g.edges.filter((e) => e.to === `rule:${id}` && e.type === 'enforces').map((e) => s(e.from.slice(5))) };
        const t = g.tables.find((x) => `table:${x.name}`.toLowerCase() === id.toLowerCase());
        if (t) return { table: t.name, fields: t.fields, used_by: g.edges.filter((e) => e.to === `table:${t.name.toLowerCase()}` && e.type.startsWith('db-')).map((e) => `${s(e.from.slice(5))} (${e.type.slice(3)})`) };
        throw new Error('Unknown id. Use an exact path, requirement id, rule code or table:Name.');
      },
    },
    {
      name: 'history', description: 'Change history for a file path: commits (with branch), linked tickets, and incidents involving the file.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      execute(inp) {
        const p = i.resolve(String(inp.path ?? ''));
        if (!p) throw new Error(`No such file: ${inp.path}`);
        log(`Checking the history of ${name(p)}`);
        return {
          commits: i.commits.filter((c) => c.files.some((f) => f.path === p)).map((c) => ({ id: c.sha.slice(0, 7), date: c.date.slice(0, 10), branch: c.branch, subject: c.subject, ticket: i.tickets.find((t) => t.commit === c.sha)?.key ?? null })),
          incidents: i.incidents.filter((n) => n.files.includes(p)).map((n) => ({ id: n.key, title: n.title, status: n.status, root: n.rootCause })),
        };
      },
    },
  ];
}

export const toolDefs = (tools: Tool[]): ToolDef[] => tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

/** Serialise a tool result (or error) for the model, capped at 30,000 characters. */
export function runTool(tools: Tool[], name: string, input: Record<string, unknown>): { text: string; isError: boolean } {
  const t = tools.find((x) => x.name === name);
  if (!t) return { text: `Unknown tool ${name}`, isError: true };
  try { const r = t.execute(input); return { text: clip(typeof r === 'string' ? r : JSON.stringify(r, null, 1)), isError: false }; }
  catch (e) { return { text: (e as Error).message, isError: true }; }
}
