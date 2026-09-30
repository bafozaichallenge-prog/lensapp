# Deploying on Render

Before you start: Lens stores source code, GitLab tokens and incident data. Get approval to host that with a third party, and prefer a region close to your users. This path has **not** been exercised on Render (or with Docker) by the author; expect to read a build log once.

1. Push this repo to GitHub/GitLab (already on `claude/intelligent-clarke-a6iyw7`; merge or select that branch).
2. Render dashboard > **New > Blueprint** > choose the repo/branch. Render reads `render.yaml` and creates `lens-db`, `lens-web` and `lens-worker`.
3. When prompted, fill the secrets:
   - `LENS_ENCRYPTION_KEYS`: run `echo "k1:$(openssl rand -base64 32)"` anywhere and paste it. **Save it somewhere safe**; losing it makes stored GitLab tokens unreadable.
   - `GITLAB_BASE_URL`: your GitLab URL (must be reachable from the internet if Render hosts you; a GitLab behind a VPN will not work).
   - `LENS_BOOTSTRAP_ADMINS`: your e-mail.
   - `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET`: see step 4 (you can add them after the first deploy).
   - `ANTHROPIC_API_KEY`: leave empty unless AI use is approved.
   Set the same `LENS_ENCRYPTION_KEYS`, `GITLAB_BASE_URL` and key values on the worker.
4. After the web service is live at `https://lens-web-xxxx.onrender.com`, create a GitLab OAuth application: redirect URI `https://lens-web-xxxx.onrender.com/api/auth/callback/gitlab`, scopes `openid profile email read_user read_api`. Put its ID and secret in `lens-web` and redeploy.
5. Open the URL, sign in with GitLab, then **Explore > Add system source** and **Sync now**.

The web service runs the database migrations before each deploy (`preDeployCommand`). Health check: `/api/health`.

## Fly.io instead
Not prepared. It needs `flyctl` on someone's machine, a `fly.toml` per process (web, worker), `fly postgres create`, and the same environment variables; the Dockerfile and `AUTH_URL` (https URL of the app) work the same way.

## Troubleshooting
**`Prisma schema validation - (get-config wasm)`** has two causes. (1) During the *image build*, `prisma generate` had no `DATABASE_URL` at all (fixed: a build-only value is now supplied). (2) At *deploy time*, the `DATABASE_URL` you set is malformed: it must start with `postgresql://` or `postgres://`, with no spaces, quotes or line breaks around it. Paste the **Internal Database URL** exactly as Render shows it.

**`P1001: Can't reach database server at localhost:5432`** during the deploy: the service has no `DATABASE_URL`, so it is not talking to your Render database. Use the Blueprint (it wires `DATABASE_URL` from `lens-db`), or if you created the service by hand: Render > `lens-db` > copy the **Internal Database URL**, add it as `DATABASE_URL` on both `lens-web` and `lens-worker`, and set the service's **Pre-Deploy Command** to `npx prisma migrate deploy --schema packages/storage/prisma/schema.prisma`. The database and the services must be in the same region for the internal URL to work.
