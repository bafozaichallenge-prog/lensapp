-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MAINTAINER', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('BUSINESS_ANALYST', 'DEVELOPER', 'QA', 'ARCHITECT');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('IDLE', 'SYNCING', 'ERROR');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'FETCHING_CODE', 'FETCHING_HISTORY', 'PARSING', 'LINKING', 'SNAPSHOTTING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('BUILDING', 'READY', 'ACTIVE', 'SUPERSEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "Origin" AS ENUM ('EXPLICIT', 'INFERRED', 'MANUAL', 'AI_SUGGESTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ANALYSING', 'ANALYSED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceSelection" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "gitlabUserId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "audiencePref" "Audience" NOT NULL DEFAULT 'BUSINESS_ANALYST',
    "themePref" TEXT NOT NULL DEFAULT 'light',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "gitlab_connections" (
    "id" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gitlab_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "gitlabProjectId" INTEGER NOT NULL,
    "pathWithNamespace" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "pathFilters" TEXT[],
    "commitRefPattern" TEXT NOT NULL DEFAULT '\b(TSK\d{5,}|[A-Z][A-Z0-9]+-\d+)\b',
    "tokenEnc" TEXT,
    "aiAllowed" BOOLEAN NOT NULL DEFAULT false,
    "lastSha" TEXT,
    "lastCommitDate" TIMESTAMP(3),
    "status" "SourceStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_visibility" (
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_visibility_pkey" PRIMARY KEY ("userId","sourceId")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "full" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT,
    "fromSha" TEXT,
    "toSha" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "countsJson" JSONB,
    "log" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_snapshots" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "syncRunId" TEXT,
    "sha" TEXT NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'BUILDING',
    "issuesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "graph_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blobs" (
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'database',
    "data" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blobs_pkey" PRIMARY KEY ("sha256")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "blobSha" TEXT,
    "kind" TEXT NOT NULL,
    "layer" TEXT,
    "loc" INTEGER NOT NULL,
    "header" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbols" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fqn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classKind" TEXT NOT NULL,
    "inherits" TEXT,
    "implements" TEXT[],
    "methods" TEXT[],
    "tests" TEXT[],

    CONSTRAINT "symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "fromRef" TEXT NOT NULL,
    "toRef" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "origin" "Origin" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceJson" JSONB,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_tables" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "addedIn" TEXT NOT NULL,

    CONSTRAINT "db_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_fields" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "addedIn" TEXT NOT NULL,

    CONSTRAINT "db_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "docPath" TEXT NOT NULL,
    "orderIdx" INTEGER NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_codes" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "impl" TEXT NOT NULL,
    "trace" TEXT NOT NULL,

    CONSTRAINT "rule_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshot_processes" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "description" TEXT,
    "docPath" TEXT,
    "customId" TEXT,

    CONSTRAINT "snapshot_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshot_process_steps" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requirement" TEXT,

    CONSTRAINT "snapshot_process_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commits" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "parents" TEXT[],
    "branch" TEXT,
    "refs" TEXT[],

    CONSTRAINT "commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commit_files" (
    "id" TEXT NOT NULL,
    "commitId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "additions" INTEGER NOT NULL,
    "deletions" INTEGER NOT NULL,

    CONSTRAINT "commit_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_metrics" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "loc" INTEGER NOT NULL,
    "churn" INTEGER NOT NULL,
    "incidents" INTEGER NOT NULL,
    "fanIn" INTEGER NOT NULL,
    "directTests" INTEGER NOT NULL,

    CONSTRAINT "file_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_processes" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_process_steps" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requirement" TEXT,

    CONSTRAINT "custom_process_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_edges" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fromRef" TEXT NOT NULL,
    "toRef" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unresolvedSince" TIMESTAMP(3),

    CONSTRAINT "manual_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "taskmanager" TEXT,
    "system" TEXT NOT NULL DEFAULT 'Jira',
    "type" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "note" TEXT,
    "reqs" TEXT[],
    "commitRef" TEXT,
    "commitSha" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" TEXT,
    "date" TEXT,
    "title" TEXT NOT NULL,
    "symptom" TEXT,
    "rootCause" TEXT,
    "status" TEXT,
    "fixTicket" TEXT,
    "residual" TEXT,
    "reqs" TEXT[],

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_files" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "resolvedPath" TEXT,
    "ambiguous" TEXT[],

    CONSTRAINT "incident_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_mappings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "columnMapJson" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pack_overrides" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "specHash" TEXT NOT NULL,
    "snapshotId" TEXT,
    "stepsJson" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceSelection" "SourceSelection" NOT NULL DEFAULT 'AUTO',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_documents" (
    "id" TEXT NOT NULL,
    "changeProjectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "chars" INTEGER NOT NULL,
    "contentRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "changeProjectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "sourceId" TEXT NOT NULL,
    "graphSnapshotId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "inputDocumentVersionIds" TEXT[],
    "impactJson" JSONB NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "outputSchemaVersion" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "durationMs" INTEGER,
    "resultJson" JSONB,
    "groundingJson" JSONB,
    "transcriptJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acceptance" TEXT[],
    "files" TEXT[],
    "step" TEXT,
    "owner" TEXT,
    "priority" TEXT,
    "dependsOn" TEXT[],

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_progress" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "pct" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "detailJson" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_gitlabUserId_key" ON "users"("gitlabUserId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "sources_gitlabProjectId_branch_key" ON "sources"("gitlabProjectId", "branch");

-- CreateIndex
CREATE INDEX "sync_runs_sourceId_startedAt_idx" ON "sync_runs"("sourceId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "graph_snapshots_syncRunId_key" ON "graph_snapshots"("syncRunId");

-- CreateIndex
CREATE INDEX "graph_snapshots_sourceId_status_idx" ON "graph_snapshots"("sourceId", "status");

-- CreateIndex
CREATE INDEX "graph_snapshots_sourceId_sha_idx" ON "graph_snapshots"("sourceId", "sha");

-- CreateIndex
CREATE UNIQUE INDEX "files_snapshotId_path_key" ON "files"("snapshotId", "path");

-- CreateIndex
CREATE INDEX "symbols_snapshotId_filePath_idx" ON "symbols"("snapshotId", "filePath");

-- CreateIndex
CREATE UNIQUE INDEX "symbols_snapshotId_fqn_key" ON "symbols"("snapshotId", "fqn");

-- CreateIndex
CREATE INDEX "edges_snapshotId_fromRef_idx" ON "edges"("snapshotId", "fromRef");

-- CreateIndex
CREATE INDEX "edges_snapshotId_toRef_idx" ON "edges"("snapshotId", "toRef");

-- CreateIndex
CREATE UNIQUE INDEX "edges_snapshotId_type_fromRef_toRef_key" ON "edges"("snapshotId", "type", "fromRef", "toRef");

-- CreateIndex
CREATE UNIQUE INDEX "db_tables_snapshotId_type_name_key" ON "db_tables"("snapshotId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "db_fields_tableId_name_key" ON "db_fields"("tableId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_snapshotId_code_key" ON "requirements"("snapshotId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rule_codes_snapshotId_code_key" ON "rule_codes"("snapshotId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_processes_snapshotId_name_key" ON "snapshot_processes"("snapshotId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_process_steps_processId_n_key" ON "snapshot_process_steps"("processId", "n");

-- CreateIndex
CREATE UNIQUE INDEX "commits_snapshotId_sha_key" ON "commits"("snapshotId", "sha");

-- CreateIndex
CREATE INDEX "commit_files_commitId_idx" ON "commit_files"("commitId");

-- CreateIndex
CREATE INDEX "commit_files_path_idx" ON "commit_files"("path");

-- CreateIndex
CREATE UNIQUE INDEX "file_metrics_snapshotId_path_key" ON "file_metrics"("snapshotId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "custom_processes_sourceId_name_key" ON "custom_processes"("sourceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "custom_process_steps_processId_n_key" ON "custom_process_steps"("processId", "n");

-- CreateIndex
CREATE UNIQUE INDEX "manual_edges_sourceId_type_fromRef_toRef_key" ON "manual_edges"("sourceId", "type", "fromRef", "toRef");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_sourceId_key_key" ON "tickets"("sourceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_sourceId_key_key" ON "incidents"("sourceId", "key");

-- CreateIndex
CREATE INDEX "incident_files_incidentId_idx" ON "incident_files"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "import_mappings_sourceId_kind_key" ON "import_mappings"("sourceId", "kind");

-- CreateIndex
CREATE INDEX "pack_overrides_sourceId_processName_idx" ON "pack_overrides"("sourceId", "processName");

-- CreateIndex
CREATE INDEX "change_projects_status_createdAt_idx" ON "change_projects"("status", "createdAt");

-- CreateIndex
CREATE INDEX "change_documents_changeProjectId_idx" ON "change_documents"("changeProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_changeProjectId_version_key" ON "analyses"("changeProjectId", "version");

-- CreateIndex
CREATE INDEX "job_progress_jobId_createdAt_idx" ON "job_progress"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_action_at_idx" ON "audit_log"("action", "at");

-- CreateIndex
CREATE INDEX "audit_log_userId_at_idx" ON "audit_log"("userId", "at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_visibility" ADD CONSTRAINT "source_visibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_visibility" ADD CONSTRAINT "source_visibility_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_snapshots" ADD CONSTRAINT "graph_snapshots_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_snapshots" ADD CONSTRAINT "graph_snapshots_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_blobSha_fkey" FOREIGN KEY ("blobSha") REFERENCES "blobs"("sha256") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_tables" ADD CONSTRAINT "db_tables_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_fields" ADD CONSTRAINT "db_fields_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "db_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_codes" ADD CONSTRAINT "rule_codes_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_processes" ADD CONSTRAINT "snapshot_processes_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_process_steps" ADD CONSTRAINT "snapshot_process_steps_processId_fkey" FOREIGN KEY ("processId") REFERENCES "snapshot_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commit_files" ADD CONSTRAINT "commit_files_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES "commits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_metrics" ADD CONSTRAINT "file_metrics_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "graph_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_processes" ADD CONSTRAINT "custom_processes_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_process_steps" ADD CONSTRAINT "custom_process_steps_processId_fkey" FOREIGN KEY ("processId") REFERENCES "custom_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_edges" ADD CONSTRAINT "manual_edges_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_files" ADD CONSTRAINT "incident_files_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_overrides" ADD CONSTRAINT "pack_overrides_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_projects" ADD CONSTRAINT "change_projects_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_projects" ADD CONSTRAINT "change_projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_documents" ADD CONSTRAINT "change_documents_changeProjectId_fkey" FOREIGN KEY ("changeProjectId") REFERENCES "change_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_changeProjectId_fkey" FOREIGN KEY ("changeProjectId") REFERENCES "change_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_graphSnapshotId_fkey" FOREIGN KEY ("graphSnapshotId") REFERENCES "graph_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Invariants Prisma cannot express ───────────────────────────────────────────────────────────

-- At most one ACTIVE snapshot per source (plan §9). Activation swaps within one transaction.
CREATE UNIQUE INDEX "graph_snapshots_one_active_per_source" ON "graph_snapshots" ("sourceId") WHERE "status" = 'ACTIVE';

-- At most one in-flight sync run per source: a second "Sync now" click cannot create another job.
CREATE UNIQUE INDEX "sync_runs_one_inflight_per_source" ON "sync_runs" ("sourceId")
  WHERE "status" IN ('QUEUED', 'FETCHING_CODE', 'FETCHING_HISTORY', 'PARSING', 'LINKING', 'SNAPSHOTTING');

-- Confidence is a probability.
ALTER TABLE "edges" ADD CONSTRAINT "edges_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1);

-- Analyses are immutable once finished: only status/result columns may change while QUEUED or RUNNING.
CREATE FUNCTION lens_protect_finished_analysis() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('DONE', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'analysis % is finished and cannot be modified', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER analyses_immutable BEFORE UPDATE ON "analyses" FOR EACH ROW EXECUTE FUNCTION lens_protect_finished_analysis();

-- Rows of an ACTIVE or SUPERSEDED snapshot are not edited in place: block file/edge updates.
CREATE FUNCTION lens_protect_snapshot_rows() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT "status" INTO st FROM "graph_snapshots" WHERE "id" = OLD."snapshotId";
  IF st IN ('ACTIVE', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'snapshot % is % and its graph rows are immutable', OLD."snapshotId", st;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER files_immutable BEFORE UPDATE ON "files" FOR EACH ROW EXECUTE FUNCTION lens_protect_snapshot_rows();
CREATE TRIGGER edges_immutable BEFORE UPDATE ON "edges" FOR EACH ROW EXECUTE FUNCTION lens_protect_snapshot_rows();
