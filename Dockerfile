# syntax=docker/dockerfile:1
# Targets: web (Next.js), worker (pg-boss jobs), tools (migrations, seed, backup helpers).
# NOTE: this file was written and its individual steps verified outside Docker (standalone build, worker bundle, migrations,
# seed), but no Docker daemon was available where it was authored, so `docker compose build` has not been run.

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/gitlab/package.json packages/gitlab/
COPY packages/ingest/package.json packages/ingest/
COPY packages/graph/package.json packages/graph/
COPY packages/impact/package.json packages/impact/
COPY packages/pack/package.json packages/pack/
COPY packages/ai/package.json packages/ai/
COPY packages/storage/package.json packages/storage/
COPY packages/services/package.json packages/services/
COPY packages/queue/package.json packages/queue/
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate --schema packages/storage/prisma/schema.prisma
# build-time placeholders on this command only (not baked into the image); nothing connects to a database while building
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build AUTH_SECRET=build-time-placeholder npm run build && node scripts/bundle-worker.mjs

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM base AS worker
ENV NODE_ENV=production WORKER_HEALTH_PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/worker.mjs ./dist/worker.mjs
USER node
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/worker.mjs"]

FROM build AS tools
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy", "--schema", "packages/storage/prisma/schema.prisma"]
