# Deploying on Fly.io

Lens stores source code, GitLab tokens and incident data: get approval to host that with a third party. Fly can only sync from a GitLab reachable from the internet. This config has **not** been run on Fly (or built with Docker) by the author; expect to read a build log once.

Needs `flyctl` on one person's machine (`fly auth login`). Run from the repo root.

```bash
# 1. Create the app from the committed config (edit `app`, AUTH_URL and GITLAB_BASE_URL in fly.toml first)
fly launch --no-deploy --copy-config --name <your-app-name>

# 2. Database (PostgreSQL 16 is what Lens is tested on). Unmanaged Fly Postgres shown; a managed offering works too,
#    as long as DATABASE_URL points at it and max_connections is >= 50.
fly postgres create --name <your-app-name>-db
fly postgres attach <your-app-name>-db        # sets the DATABASE_URL secret

# 3. Secrets
fly secrets set \
  AUTH_SECRET="$(openssl rand -base64 32)" \
  LENS_ENCRYPTION_KEYS="k1:$(openssl rand -base64 32)" \
  LENS_BOOTSTRAP_ADMINS="you@company.com" \
  GITLAB_CLIENT_ID=... GITLAB_CLIENT_SECRET=...
# optional, only if AI use is approved:  fly secrets set ANTHROPIC_API_KEY=...
# Keep a private copy of LENS_ENCRYPTION_KEYS: losing it makes stored GitLab tokens unreadable.

# 4. Deploy, then make sure one machine of each process runs
fly deploy
fly scale count web=1 worker=1
fly status
```

**GitLab OAuth app** (create before signing in): redirect URI `https://<your-app-name>.fly.dev/api/auth/callback/gitlab`, scopes `openid profile email read_user read_api`.

Then open the app, sign in, and use **Explore > Add system source > Sync now**.

**Operations:** `fly logs` (JSON, secrets redacted), `fly ssh console` for one-off commands, `fly postgres` backups are separate from `scripts/backup.sh` (see `docs/BACKUP-RESTORE.md`). Health: web `/api/health` (checked by Fly), worker `:3001/health` inside the machine.

**Sizing:** 1 GB per process is a starting point; watch memory during the first large sync and raise it if machines restart.
