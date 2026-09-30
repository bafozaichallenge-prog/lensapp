# Prototype map (M0)

The reference is `lens-system-guide.html`. It embeds the BafozAIChallenge sample repository and the worked example; both were extracted verbatim into `test/fixtures` (`bafoz/`, `example-last-day-debit-orders.json`).

## Screens → routes and components

| Prototype | Lens |
|---|---|
| Header (Lens · System Guide), source freshness | `apps/web/src/app/layout.tsx`; `Freshness` on every source page |
| Tabs: Projects / Explore the system / History and incidents | `Tabs.tsx` → `/projects`, `/explore`, `/history` (+ `/admin/users` for Admins) |
| Audience switch (Explain it for…) | `AudienceSwitch` (stored per user; changes summaries, plan tab, code visibility, not permissions) |
| Dark-mode toggle (class `lens-dark` on `<html>`) | `ThemeToggle`; same class name and CSS |
| Plan a change form | `/projects/new` (`NewProjectForm`) |
| Project cards | `/projects` |
| Result: What this means → Affected processes (today vs after) → Questions → Risks → Solution plan → What changes → Generated tests → Tasks to log | `/projects/[id]` (`AnalysisView`), same order; graph cross-check inside *What changes* |
| Progress with Stop | `ProgressLog` (SSE) + `cancelAnalysis` |
| Downloads (plan .md, tests .cls, Jira CSV) | `/api/analyses/[id]/export` |
| Explore overview, sources, Add source | `/explore` |
| Add process (one step per line, `| BR-010`) | `AddProcessForm` → `addCustomProcess` |
| Process page: station diagram, steps table, pack tiles, timeline | `/explore/[sourceId]/process/[name]`, `ProcessRail`, `PackViewer` |
| Step/class/requirement/rule/table/ticket/incident/commit pages | `/explore/[sourceId]/e/[kind]/[...key]` |
| History and incidents (panel per process, unlinked panel) | `/history` |
| Process pack overlay: 4 tabs, sandbox config YAML/JSON, Escape closes | `PackViewer` + `/api/pack-frame`, `/api/pack` |
| Import (sample data) | `ImportWizard` (column mapping, personal-data check) |

## Prototype functions → ports → tests

| Prototype | Port | Tested by |
|---|---|---|
| `parseDocRequirements`, `parseDocRuleCodes`, `parseDocProcesses`, `stripPrefix`, `classify` layers | `ingest/docs.ts`, `process.ts`, `text.ts` | `ingest.test.ts`, golden |
| `ingest()` (classes, RUN/includes, USING/AS/NEW, table access, mirrors, tests edges, metrics) | `ingest/parse.ts`, `cls.ts`, `procedural.ts` | golden + differential |
| step mapping in `ingest()` and `mapStagesIn` | `ingest/stepmap.ts` | golden (all 7 steps), custom-process consistency test |
| `parseGitLog`, `parseCSV`, `pick`, `splitList` | `ingest/history.ts`, `csv.ts` | `ingest.test.ts`, services imports |
| `tokens`, `bagsOf`, `impactIn`, `incidentsForStageIn` | `impact/impact.ts` | golden + differential |
| `normalize`, prompt, `SHAPE`, `makeTools`, `planMarkdown`, `tasksCsv` | `ai/*` | `ai.test.ts`, services |
| `modelOf`, `buildSpec`, `sandboxConfig`, `toYaml`, `docMarkdown`, templates | `pack/*` | `pack.test.ts` (byte-identical to prototype output), browser test |

## Differential testing
The prototype's own JavaScript was executed on the fixture (`ingest`, `impactIn`, `buildSpec`, `sandboxConfig`, `toYaml`, `docMarkdown`) and compared with the ports:

- **Ingestion:** requirements (18), rule codes (10), tables and fields, per-file layer/LOC/header/methods/tests, all 7 process steps (requirement, files in rank order, rules, tables), and 11 commits with branches are identical. Edges: identical, plus **one** additional correct `uses` edge (lower-case namespace, DECISIONS D-14.3), which raises one file's fan-in by 1.
- **Impact analysis:** tokens, scores, tests, incidents, tickets and process steps are identical for four requirement texts. Where scores tie at the cut-off, the prototype's insertion order and the port's path order can pick different files (D-14.4).
- **Packs:** process spec, sandbox config, YAML and Markdown are byte-identical (`test/fixtures/prototype-pack-reference.json` is the prototype's output).
- **Ordering** of tables, fields and rule codes follows definition/document order as in the prototype (D-5).

## What the plan changed relative to the prototype
Origin/confidence on every relationship; snapshots and pinned analyses; server-side sync, auth and roles; AI grounding and evidence; personal-data handling on import; sandboxed pack viewer; per-source AI opt-in. The prototype ran everything in the browser.
