import type { ProcessNode, ProcessStepNode } from '@lens/core';

const NUM = /^\s*(\d{1,2})\.\s+([A-Za-z][^.:|]{2,45}?)\s*$/;
const FILLER = /^\s*([|vV↓>+\-–—=]*)\s*$/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * Prototype parseDocProcesses: a run "1. … 2. … 3. …" (optionally separated by | / v arrow lines) of >= 3 steps
 * with an arrow line, or >= 4 steps. Process name = first non-empty line before " — ".
 */
export function detectProcesses(text: string, docPath: string): ProcessNode[] {
  const lines = text.split('\n');
  const title = ((lines.find((l) => l.trim()) ?? docPath).replace(/^#+\s*/, '').split(/\s+[—–-]\s+/)[0] ?? docPath).trim();
  const procs: ProcessNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(NUM);
    if (!m || Number(m[1]) !== 1) continue;
    const steps: ProcessStepNode[] = [{ n: 1, name: m[2]!.trim() }];
    let j = i + 1, expect = 2;
    for (; j < lines.length; j++) {
      const mm = lines[j]!.match(NUM);
      if (mm && Number(mm[1]) === expect) { steps.push({ n: expect++, name: mm[2]!.trim() }); continue; }
      if (FILLER.test(lines[j]!) || /^\s*(START|END|IN-FORCE|DONE)\s*$/i.test(lines[j]!)) continue;
      break;
    }
    const hasArrow = lines.slice(i, j).some((l) => /^\s*[|v↓]\s*$/.test(l));
    if ((steps.length >= 3 && hasArrow) || steps.length >= 4) {
      procs.push({ name: title, origin: 'DETECTED', docPath, steps });
      i = j;
    }
  }
  if (procs.length > 1) procs.forEach((p, k) => { p.name += ` (${k + 1})`; });
  for (const p of procs) p.steps = p.steps.map((s) => ({ ...s, name: cap(s.name) }));
  return procs;
}

/** Explicit override (prototype format): { processes: [{ name, stages: [{ name, requirement|req, files?, rules? }] }] } */
export function parseProcessJson(text: string, docPath: string): ProcessNode[] | null {
  try {
    const j = JSON.parse(text) as { processes?: { name: string; description?: string; stages?: { name: string; requirement?: string; req?: string; files?: string[]; rules?: string[] }[] }[] };
    if (!j || !Array.isArray(j.processes)) return null;
    return j.processes.map((p) => ({
      name: p.name, origin: 'EXPLICIT' as const, description: p.description, docPath,
      steps: (p.stages ?? []).map((st, k) => ({ n: k + 1, name: st.name, requirement: st.requirement ?? st.req, files: st.files, rules: st.rules })),
    }));
  } catch { return null; }
}

/** "Register claim | BR-010" one per line (Add process form, plan §17.5). */
export function parseStepLines(input: string): ProcessStepNode[] {
  return input.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const [name, req] = l.split('|').map((s) => s.trim());
    return { n: i + 1, name: name!, requirement: req || undefined };
  });
}
