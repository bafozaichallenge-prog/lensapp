import fs from 'node:fs';
import path from 'node:path';
import { parseSource, parseGitLog, decodeSource, parseIncidents, parseTickets, linkTicketCommit, resolvePaths } from '@lens/ingest';
import { buildView } from '@lens/impact';

const root = path.resolve(__dirname, '../fixtures/bafoz');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

/** The BafozAIChallenge-project sample repository, exactly as embedded in the prototype (plan §12 golden fixture). */
export async function loadFixture() {
  const all = walk(root).map((f) => ({ path: path.relative(root, f).split(path.sep).join('/'), text: decodeSource(fs.readFileSync(f)) }));
  const find = (suffix: string) => all.find((f) => f.path.endsWith(suffix))!;
  const commits = parseGitLog(find('history.gitlog').text);
  const source = all.filter((f) => !f.path.startsWith('exports/'));
  const graph = await parseSource(source, commits);
  const paths = graph.files.map((f) => f.path);
  const incidents = parseIncidents(find('incidents.csv').text).map((i) => ({ ...i, resolved: resolvePaths(i.files, paths) }));
  const tickets = parseTickets(find('jira-taskmanager-tickets.csv').text).map((t) => ({ ...t, commit: linkTicketCommit(t, commits) }));
  const view = buildView(graph, {
    incidents: incidents.map((i) => ({ key: i.key, reqs: i.reqs, files: i.resolved.map((r) => r.resolved ?? r.input) })),
    tickets: tickets.map((t) => ({ key: t.key, commit: t.commit })),
    commits,
  });
  return { all, source, commits, graph, incidents, tickets, view };
}
