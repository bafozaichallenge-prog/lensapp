import { redirect } from 'next/navigation';
import { listUsers, recentAudit } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { requireActor } from '@/lib/session';
import { RoleSelect } from '@/components/Forms';
import { fmtDateTime } from '@/components/ui';

export default async function Users() {
  const { actor } = await requireActor();
  if (actor.role !== 'ADMIN') redirect('/forbidden');
  const ctx = getCtx();
  const [users, audit] = await Promise.all([listUsers(ctx, actor), recentAudit(ctx, actor)]);
  return (
    <section className="panel" aria-labelledby="h-users">
      <h2 id="h-users">Users and roles</h2>
      <p className="muted">Roles control what a person can do. What they can see still follows their GitLab access. New users start as Viewers.</p>
      <div className="tbl-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Last seen</th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}><td>{u.name ?? u.email}<div className="muted">{u.email}</div></td><td><RoleSelect userId={u.id} role={u.role} self={u.id === actor.id} /></td><td>{fmtDateTime(u.lastSeenAt)}</td></tr>)}
      </tbody></table></div>
      <h3>Recent activity</h3>
      <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead><tbody>
        {audit.map((a) => <tr key={a.id}><td>{fmtDateTime(a.at)}</td><td>{a.user}</td><td>{a.action}</td><td className="mono">{a.target}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}
