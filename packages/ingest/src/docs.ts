import type { RequirementNode, RuleCodeNode } from '@lens/core';

// Prototype regexes (parseDocRequirements / parseDocRuleCodes); the colon separator is also accepted without a leading space (plan §10.3).
const REQ_ID = /^\s*(?:#+\s*)?\**([A-Z]{2,6}-\d{2,4})\**(?:\s+(?:—|–|-)|\s*:)\s+(.{3,90})$/;
const NUMBERED = /^\s*\d{1,2}\.\s+[A-Z][^\n]{3,60}$/;

/** `BR-001 — Create Contract` (dash, en dash, em dash or colon). IDs containing RULE are business rules. First definition wins. */
export function parseRequirements(text: string, docPath: string, into: Map<string, RequirementNode> = new Map()): RequirementNode[] {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(REQ_ID);
    if (!m || into.has(m[1]!)) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && body.length < 40; j++) {
      if (REQ_ID.test(lines[j]!) || (NUMBERED.test(lines[j]!) && body.length > 3)) break;
      body.push(lines[j]!);
    }
    into.set(m[1]!, {
      code: m[1]!,
      kind: /RULE/.test(m[1]!) ? 'rule' : 'requirement',
      title: m[2]!.trim(),
      body: body.join('\n').replace(/\n\s*\n+/g, '\n').trim().slice(0, 700),
      docPath,
      order: i,
    });
  }
  return [...into.values()];
}

/** `| NB-X-001 | `Implementing class` | BR-001 — title |` -> rule code, implementation, trace. First definition wins. */
export function parseRuleCodes(text: string, into: Map<string, RuleCodeNode> = new Map()): RuleCodeNode[] {
  for (const l of text.split('\n')) {
    const m = l.match(/^\|\s*([A-Z]{2,5}-[A-Z]+-\d{3})\s*\|\s*`?([^|`]+?)`?\s*\|\s*([^|]+?)\s*\|/);
    if (m && !into.has(m[1]!)) into.set(m[1]!, { code: m[1]!, impl: m[2]!.trim(), trace: m[3]!.trim() });
  }
  return [...into.values()];
}
