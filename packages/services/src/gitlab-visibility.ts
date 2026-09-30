import type { PrismaClient } from '@prisma/client';
import type { VisibilityChecker } from './context';

export interface GitlabVisibilityOptions {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof fetch;
}

/**
 * "Can this GitLab account read this project?" answered with the user's own OAuth token from sign-in (plan §7.4/§7.5).
 * On 401 the token is refreshed once. Any failure means "no": the caller fails closed.
 */
export class GitlabVisibility implements VisibilityChecker {
  private f: typeof fetch;
  constructor(private db: Pick<PrismaClient, 'account'>, private o: GitlabVisibilityOptions) { this.f = o.fetch ?? fetch; }

  async canRead(userId: string, projectId: number): Promise<boolean> {
    const acct = await this.db.account.findFirst({ where: { userId, provider: 'gitlab' } });
    if (!acct?.access_token) return false;
    let res = await this.get(projectId, acct.access_token);
    if (res.status === 401 && acct.refresh_token && this.o.clientId && this.o.clientSecret) {
      const t = await this.refresh(acct.refresh_token);
      if (t) {
        await this.db.account.update({ where: { id: acct.id }, data: { access_token: t.access_token, refresh_token: t.refresh_token ?? acct.refresh_token, expires_at: t.created_at && t.expires_in ? t.created_at + t.expires_in : acct.expires_at } });
        res = await this.get(projectId, t.access_token);
      }
    }
    return res.status === 200;
  }

  private get(projectId: number, token: string) {
    return this.f(`${this.o.baseUrl.replace(/\/$/, '')}/api/v4/projects/${projectId}`, { headers: { authorization: `Bearer ${token}` } });
  }
  private async refresh(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; created_at?: number; expires_in?: number } | null> {
    const res = await this.f(`${this.o.baseUrl.replace(/\/$/, '')}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: this.o.clientId!, client_secret: this.o.clientSecret! }),
    });
    return res.ok ? ((await res.json()) as never) : null;
  }
}
