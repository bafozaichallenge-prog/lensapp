# Changelog

All notable changes to the New Business project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- CI: OpenEdge jobs now only exist when project variable `OE_RUNNER` is
  `"true"`, so pipelines no longer sit pending when no `[openedge]`
  tagged runner is registered. Added a `validate:repo` stage that runs
  on GitLab.com shared runners (delta/migration pairing check).

## [1.1.0] - 2026-09-20

### Added
- GitLab CI pipeline (`.gitlab-ci.yml`): PCT compile, ABLUnit test stage
  with JUnit reporting, schema delta load check, packaging and manual
  PASOE deploy; `tooling/build.xml` + `tooling/deploy-pasoe.ps1`.
- `Benefit.CoverAmount` — default sum assured on the benefit catalogue
  (schema delta `002_benefit_cover_amount.df`, entity property +
  `SetCoverAmount()`, seed data).
- `DbContractRepository` — DB-backed `IContractRepository` with
  `DO TRANSACTION`-scoped writes, `EXCLUSIVE-LOCK NO-WAIT` isolation,
  `NB-REPO-423` lock-conflict errors and `NB-REPO-500` wrapping
  (schema delta `003_contract_sequence.df` adds `SeqContract`).
- `Contract:RestorePersistedState()` / `RestoreBenefit()` and
  `ContractBenefit:RestorePersistedState()` rehydration seams.
- `Bootstrap(plUseDbPersistence)` constructor; `RestGateway` wires
  `NEW Bootstrap(TRUE)` for PASOE deployments.
- Contract status report: shared `include/ttContractStatus.i`
  temp-table/ProDataSet, `src/api/procs/ContractStatusReport.p`
  (GET `/api/reports/contract-status`) and
  `src/batch/ExportContractStatusCsv.p` nightly extract.
- `tests/rules/CollectionDateRequiredRuleTest.cls` rule test suite.

### Changed
- Repository layout normalized: `src/src`, `tests/tests`,
  `database/database` flattened to single roots; `include/` and
  `database/delta/` added.
- `Bootstrap:ContractRepo` widened from concrete `ContractRepository`
  to `IContractRepository` (interface-compatible for all callers).

### Fixed
- Recurring monthly collection methods (`DEBIT_ORDER`, `PAYROLL`) now
  reject collection days 29-31, which cannot exist in every calendar
  month (BRULE-008 / `NB-COLLECTION-002`). One-off methods keep 1-31.
