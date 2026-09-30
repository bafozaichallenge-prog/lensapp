import { redirect } from 'next/navigation';
import { can } from '@lens/core';
import { listSources } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { requireActor } from '@/lib/session';
import { NewProjectForm } from '@/components/Forms';

export default async function NewProject() {
  const { actor } = await requireActor();
  if (!can('project.create', { role: actor.role, canSeeSource: true })) redirect('/forbidden');
  const sources = (await listSources(getCtx(), actor)).filter((s) => s.snapshot);
  return (
    <section className="panel" aria-labelledby="h-new">
      <h2 id="h-new">Plan a change</h2>
      <p className="muted">Lens compares the change with the real system, shows what it touches, and drafts the plan, tasks and tests.</p>
      {sources.length === 0 ? <div className="notice err">No system has been synced yet. Ask a Maintainer to add and sync a source.</div> : <NewProjectForm sources={sources.map((s) => ({ id: s.id, name: s.name, vertical: s.vertical }))} />}
    </section>
  );
}
