# New Business Process — OpenEdge OOP Web Application

A mock New Business Policy/Contract Management application built in
Progress OpenEdge ABL / OpenEdge OO (OOABL). It models the process a
client goes through when taking out a new insurance policy, from
contract creation through to activation (**IN-FORCE**), with the
domain/business-rule architecture as the primary deliverable and a thin
web/API layer sitting on top of it.

This codebase was generated to satisfy [`NewBusinessProcess.md`](NewBusinessProcess.md)
and is designed to be read by an AI requirements-risk / edge-case
intelligence system as much as by a human developer — every business
rule class carries the requirement ID it implements (Section 46), and
[`TRACEABILITY.md`](TRACEABILITY.md) maps every requirement all the way
down to database fields and API endpoints.

## The core principle

> The web application is an interface to the business process, not the
> owner of the business process. The business process should remain
> executable even if the web/API layer is replaced.

Concretely: `Contract.cls` and `domain/rules/*` never import anything
from `api/`. You could delete the entire `api/` folder and drive the
exact same new-business process from a batch `.p`, a scheduled job, or
a different transport, unchanged.

## Getting started

1. Add `src/` (and the project root, for the `database/seed/SeedData.p`
   relative `RUN` reference) to your PROPATH.
2. Load the schema into a fresh database (optional — the mock
   repositories run entirely in-memory and don't require a live
   database to exercise the process; see [Persistence](#persistence-strategy) below):
   ```
   prodb newbusiness empty
   proutil newbusiness -C LOAD-DF database/schema/newbusiness.df
   ```
3. Run the test suite (ABLUnit):
   ```
   ablunit -directory tests -format xml -output results.xml
   ```
   Or, on Windows with `$env:DLC` set to your OpenEdge install root, use
   the wrappers in `tooling/`: `.\tooling\compile.ps1` (headless
   compile-check, no database needed) and `.\tooling\run-tests.ps1`
   (runs the ABLUnit suite above and writes `build\ablunit-results.xml`).
   A PCT-based `tooling/build.xml` is included for CI pipelines that
   prefer Ant.
4. To actually expose the process over HTTP, deploy `src/api/RestGateway.cls`
   to a PASOE instance — see `tooling/PASOE-DEPLOYMENT.md`. Everything
   below `api/controllers/` is transport-agnostic, so this is the only
   class in the codebase that needs to change if you swap PASOE for a
   different transport.
5. Exercise the process from a procedure or the AVM console:
   ```openedge
   USING Bootstrap.
   USING infrastructure.security.UserContext.

   DEFINE VARIABLE oBootstrap  AS Bootstrap     NO-UNDO.
   DEFINE VARIABLE oSupervisor AS UserContext    NO-UNDO.
   DEFINE VARIABLE oContract   AS domain.entities.Contract NO-UNDO.

   oBootstrap = NEW Bootstrap().
   oBootstrap:SeedMockData().

   oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
   oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
   oBootstrap:NewBusinessService:CapturePerson(oContract:ContractId,
       "John", "Doe", 01/01/1990, "9001015009087",
       "john@example.com", "0820000000", "1 Main Street", "agent1").
   oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1").
   oBootstrap:NewBusinessService:SetCollectionInstruction(oContract:ContractId,
       "DEBIT_ORDER", 25, "1234567890", "001", "John Doe", "agent1").
   oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

   oSupervisor = NEW UserContext("U001", "supervisor1", UserContext:ROLE_SUPERVISOR).
   oContract = oBootstrap:NewBusinessService:Activate(oContract:ContractId, oSupervisor).

   MESSAGE oContract:Status. /* IN-FORCE */
   ```

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full diagram and a
walk-through of every layer. In short:

```
api/ (controllers, DTOs)
   -> application/ (services, workflow — orchestration only)
        -> domain/ (entities, rules, validation — ALL business logic)
             -> infrastructure/ (repositories, logging, audit, security)
```

Dependencies always point *inward*: `domain/` knows nothing about
`application/`, `infrastructure/`, or `api/`. Everything depends on
domain interfaces, never on concrete infrastructure classes
(`Bootstrap.cls` is the single composition root that wires concrete
classes to interfaces — see Section 39, Dependency Injection).

## Persistence strategy

The `I*Repository` interfaces in `domain/interfaces/` are the only
thing the rest of the codebase depends on for persistence. The
concrete repositories under `infrastructure/repositories/` currently
implement them with an in-process key/value store
(`OpenEdge.Core.Collections.CaseSensitiveStringKeyedMap`), which mirrors
the field-for-field shape of the tables in
[`database/schema/newbusiness.df`](database/schema/newbusiness.df).
This keeps the whole process runnable and unit-testable without a live
database connection. Swapping a repository to real `FOR EACH`/buffer
access against those tables is a change confined entirely to
`infrastructure/repositories/*.cls` — no domain, service, or controller
code would need to change, because none of them reference a concrete
repository class.

## Key design decisions

- **Contract owns its own state machine.** External code never writes
  `contract:Status = "IN-FORCE"`; it calls `contract:Activate()`, which
  enforces BR-007/BRULE-010/BRULE-011 itself (Section 45). This is also
  why `ContractStateException` exists — it is *always* the aggregate
  refusing an illegal transition, never a service-layer `IF`.
- **Business rules are polymorphic and independently testable**
  (Section 44). `ContractValidator` iterates
  `BusinessRuleRegistry:GetRules()` calling `IBusinessRule:Evaluate()`
  without ever checking a concrete rule type. Adding a new rule means
  registering it in `Bootstrap.cls` — nothing else changes.
- **Stale validation is a first-class edge case.** A `Contract` caches
  its last `ValidationSummary` together with a `LastMutatedDate`. If the
  contract is mutated (campaign/person/benefit/collection changed)
  after validation ran, `Activate()` raises `ValidationException`
  instead of trusting a now-inaccurate result (Edge Case 47).
- **Activation is idempotent.** Calling `Activate()` on an already
  `IN-FORCE` contract is a silent no-op, not an error — but
  `ActivationRequestCount` still increments so the number of attempts
  remains auditable (Section 48).
- **Services orchestrate; they don't decide.** `NewBusinessService` and
  the smaller `*Service` classes never contain an `IF` that represents
  a business rule — that would duplicate logic that already lives in
  `domain/rules/*` or in `Contract.cls` itself.
- **DTOs, not domain objects, cross the API boundary** (Section 30),
  and collection account details are never fully echoed back in a
  response (Section 13).

## Project structure

```
new-business/
├── database/
│   ├── schema/newbusiness.df      Production-shaped table definitions
│   ├── seed/SeedData.p            Mock campaigns + benefits (Section 52)
│   └── migrations/                Ordered schema change log
├── src/
│   ├── Bootstrap.cls               Composition root (Section 39)
│   ├── domain/
│   │   ├── entities/               Contract, Person, Campaign, Benefit, ...
│   │   ├── interfaces/             IBusinessRule, IContractValidator, I*Repository, ...
│   │   ├── rules/                  One class per BRULE-* (Section 16/17/21)
│   │   └── validation/             ValidationResult/Summary, ContractValidator
│   ├── application/
│   │   ├── services/               NewBusinessService + per-aggregate services
│   │   └── workflow/               NewBusinessWorkflow (capture-stage tracking)
│   ├── infrastructure/
│   │   ├── repositories/           I*Repository implementations
│   │   ├── logging/                ILogger / Logger
│   │   ├── security/               IUserContext / UserContext
│   │   └── audit/                  ContractAudit / AuditService
│   ├── api/
│   │   ├── controllers/            Thin HTTP-facing entry points
│   │   └── dto/                    Request/response DTOs
│   └── exceptions/                 ApplicationException hierarchy
├── tests/                          ABLUnit test suite (@Test methods)
├── ARCHITECTURE.md
├── TRACEABILITY.md
└── README.md
```

## Roles and authorization (Section 38)

`IUserContext` carries `UserId` / `Username` / `Roles`. Data capture
(create contract, link campaign, capture person, add benefit, capture
collection, validate) requires no elevated role. **Activation** requires
`SUPERVISOR` or `ADMIN` — enforced in `NewBusinessService:Activate()`,
which raises `BusinessRuleException("NB-AUTH-001")` otherwise.

## Testing

Tests live under `tests/`, mirroring `src/`, and follow ABLUnit
conventions (`@Test.` method annotations, `OpenEdge.Core.Assert` for
assertions). See `tests/rules/*` for rule-level unit tests,
`tests/domain/ContractActivationTest.cls` for state-machine edge cases,
`tests/workflow/NewBusinessWorkflowTest.cls` for capture-stage
transitions, and `tests/services/NewBusinessServiceTest.cls` /
`tests/edgecases/EdgeCaseTest.cls` for full end-to-end and negative
scenarios (Section 41).
