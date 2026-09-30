import type { TableNode } from '@lens/core';

/** Parse Progress .df dumps: ADD TABLE / ADD FIELD / ADD SEQUENCE. Later files layer over earlier ones. */
export function parseDf(text: string, file: string): TableNode[] {
  const tables = new Map<string, TableNode>();
  const lines = text.split('\n');
  const q = (s: string) => s.replace(/^"|"$/g, '');
  for (const line of lines) {
    let m = line.match(/^ADD\s+TABLE\s+("[^"]+"|\S+)/i);
    if (m) { const name = q(m[1]!); tables.set(name.toLowerCase(), { name, type: 'table', addedIn: file, fields: [] }); continue; }
    m = line.match(/^ADD\s+SEQUENCE\s+("[^"]+"|\S+)/i);
    if (m) { const name = q(m[1]!); tables.set(`seq:${name.toLowerCase()}`, { name, type: 'sequence', addedIn: file, fields: [] }); continue; }
    m = line.match(/^ADD\s+FIELD\s+("[^"]+"|\S+)\s+OF\s+("[^"]+"|\S+)\s+AS\s+(\S+)/i);
    if (m) {
      const tn = q(m[2]!);
      // A delta may add a field to a table defined in the baseline: keep it on a stub the merge step resolves.
      const t = tables.get(tn.toLowerCase()) ?? (tables.set(tn.toLowerCase(), { name: tn, type: 'table', addedIn: file, fields: [], stub: true }), tables.get(tn.toLowerCase())!);
      t.fields.push({ name: q(m[1]!), type: m[3]!, addedIn: file });
    }
  }
  return [...tables.values()];
}

/** Merge schema files: baseline first, then delta/migration files, each in path order (prototype ordering). Later fields extend earlier tables. */
export function mergeSchemas(files: { path: string; text: string }[]): TableNode[] {
  const isDelta = (p: string) => /delta|migration/i.test(p);
  const ordered = [...files].sort((a, b) => Number(isDelta(a.path)) - Number(isDelta(b.path)) || a.path.localeCompare(b.path));
  const merged = new Map<string, TableNode>();
  for (const f of ordered) {
    for (const t of parseDf(f.text, f.path)) {
      const key = (t.type === 'sequence' ? 'seq:' : '') + t.name.toLowerCase();
      const cur = merged.get(key);
      if (!cur) { merged.set(key, t); continue; }
      if (cur.stub && !t.stub) { cur.stub = false; cur.addedIn = t.addedIn; }
      for (const fld of t.fields) if (!cur.fields.some((x) => x.name.toLowerCase() === fld.name.toLowerCase())) cur.fields.push(fld);
    }
  }
  return [...merged.values()]; // definition order (baseline first, then deltas): downstream screens follow it
}
