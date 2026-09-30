# Requirements Traceability

Maps every business requirement in `NewBusinessProcess.md` down through
the rule/class/service/workflow/repository/database/API chain described
in Section 50:

```
Business Requirement -> Business Rule -> Domain Class -> Service ->
Workflow -> Repository -> Database -> API
```

## BR-001 — Create Contract

| Layer | Reference |
|---|---|
| Domain | `domain/entities/Contract.cls` — `Create()` |
| Service | `application/services/ContractService.cls` — `CreateContract()` |
| Orchestration | `application/services/NewBusinessService.cls` — `CreateContract()` / `StartNewBusiness()` |
| Workflow stage | `CONTRACT_CREATED` |
| Repository | `infrastructure/repositories/ContractRepository.cls` — `GetNextContractId()`, `Save()` |
| Database | `Contract` table (`database/schema/newbusiness.df`) |
| API | `POST /api/new-business/contracts` — `api/controllers/NewBusinessController.cls:CreateContract()` |

## BR-002 — Link Campaign

| Layer | Reference |
|---|---|
| Business Rule | `NB-CAMPAIGN-001` — `domain/rules/CampaignRequiredRule.cls` (BRULE-001) |
| Domain | `Contract.cls:AssignCampaign()`, `Campaign.cls:IsActive()`/`Validate()` |
| Service | `ContractService.cls:AssignCampaign()`, `CampaignService.cls` |
| Orchestration | `NewBusinessService.cls:LinkCampaign()` |
| Workflow stage | `CAMPAIGN_LINKED` |
| Repository | `CampaignRepository.cls` |
| Database | `Campaign` table |
| API | `POST /api/new-business/contracts/{contractId}` (campaignId), `GET /api/campaigns/{campaignId}` |

## BR-003 — Capture Client Details

| Layer | Reference |
|---|---|
| Business Rules | `NB-PERSON-001` — `ContractOwnerRequiredRule.cls` (BRULE-002); `NB-PERSON-002` — `PersonMandatoryDetailsRule.cls` (BRULE-003) |
| Domain | `Person.cls:Create()`/`ValidateMandatoryDetails()`, `Contract.cls:AssignOwner()` |
| Service | `PersonService.cls:CapturePerson()`, `ContractService.cls:AssignOwner()` |
| Orchestration | `NewBusinessService.cls:CapturePerson()` |
| Workflow stage | `PERSON_CAPTURED` |
| Repository | `PersonRepository.cls` |
| Database | `Person` table |
| API | `POST /api/new-business/contracts/{contractId}/person`, `GET /api/persons/{personId}` |

## BR-004 — Link Benefits

| Layer | Reference |
|---|---|
| Business Rules | `NB-BENEFIT-001` — `BenefitRequiredRule.cls` (BRULE-004); `NB-BENEFIT-004` — `BenefitActiveRule.cls` (BRULE-005); `NB-BENEFIT-002`/`NB-BENEFIT-003` — duplicate/nonexistent-benefit guards in `Contract.cls:AddBenefit()` and `ContractBenefit.cls:Create()` |
| Domain | `Benefit.cls`, `ContractBenefit.cls:Create()`, `Contract.cls:AddBenefit()` |
| Service | `BenefitService.cls:AddBenefitToContract()` |
| Orchestration | `NewBusinessService.cls:AddBenefit()` |
| Workflow stage | `BENEFITS_SELECTED` |
| Repository | `BenefitRepository.cls`, `ContractBenefitRepository.cls` |
| Database | `Benefit`, `ContractBenefit` tables |
| API | `POST /api/new-business/contracts/{contractId}/benefits`, `GET /api/benefits/{benefitId}` |

## BR-005 — Capture Collection Details

| Layer | Reference |
|---|---|
| Business Rules | `NB-COLLECTION-001` — `CollectionMethodRequiredRule.cls` (BRULE-006); `NB-COLLECTION-002` — `CollectionDateRequiredRule.cls` (BRULE-007/BRULE-008) |
| Domain | `CollectionInstruction.cls:Create()`/`Validate()`, `Contract.cls:SetCollectionInstruction()` |
| Service | `CollectionService.cls:CaptureCollection()` |
| Orchestration | `NewBusinessService.cls:SetCollectionInstruction()` |
| Workflow stage | `COLLECTION_CAPTURED` |
| Repository | `CollectionRepository.cls` |
| Database | `CollectionInstruction` table |
| API | `POST /api/new-business/contracts/{contractId}/collection` |

## BR-006 — Validate New Business

| Layer | Reference |
|---|---|
| Business Rules | `NB-PREMIUM-001` — `PremiumPositiveRule.cls` (BRULE-009); `NB-STATUS-001` — `ContractStatusRule.cls` (BRULE-010); `NB-CONTRACT-002` — `DuplicateContractRule.cls`; plus every rule above (all are evaluated together) |
| Domain | `Contract.cls:Validate()`, `ValidationResult.cls`, `ValidationSummary.cls` |
| Validator | `domain/validation/ContractValidator.cls` (implements `IContractValidator`), driven by `domain/rules/BusinessRuleRegistry.cls` |
| Orchestration | `NewBusinessService.cls:Validate()` |
| Workflow stage | `VALIDATING` -> `VALIDATION_FAILED` \| `READY_FOR_ACTIVATION` |
| Repository | (read-only — no persistence of validation results themselves) |
| Database | n/a |
| API | `POST /api/new-business/contracts/{contractId}/validate` -> `api/dto/ValidationResponse.cls` |

## BR-007 — Activate Contract

| Layer | Reference |
|---|---|
| Business Rule | `NB-ACTIVATION-001` — enforced inside `Contract.cls:Activate()` itself (not a registry rule, since it governs the state transition, not a validation check); `BRULE-011` (all mandatory validations must pass) is enforced by the same method checking `ValidationSummary:IsValid()` |
| Domain | `Contract.cls:Activate()` — guards: `Status = NEW`, validation summary exists, not stale, valid; raises `ContractStateException` / `ValidationException` otherwise |
| Service | `ContractService.cls:Activate()` |
| Orchestration | `NewBusinessService.cls:Activate()` — additionally enforces the `SUPERVISOR`/`ADMIN` role check (Section 38) |
| Workflow stage | `READY_FOR_ACTIVATION` -> `ACTIVATED` |
| Repository | `ContractRepository.cls:Update()` |
| Database | `Contract.Status`, `Contract.ActivatedDate` |
| API | `POST /api/new-business/contracts/{contractId}/activate` -> `api/dto/ActivationResponse.cls` |

## Cross-cutting requirements

| Requirement | Implementation |
|---|---|
| Section 21 — Business Rule Registry (open/closed) | `domain/rules/BusinessRuleRegistry.cls`, wired in `Bootstrap.cls` |
| Section 34 — Transaction Management (atomic activation) | `Contract:Activate()` mutates in-memory state as a single operation; `ContractService:Activate()` persists it with one `Update()` call — no code path can observe a partially-activated contract |
| Section 37/49 — Audit Trail / Auditability | `infrastructure/audit/ContractAudit.cls`, `AuditService.cls`; every `NewBusinessService` method records an action |
| Section 38 — Security | `infrastructure/security/IUserContext.cls`, role check in `NewBusinessService:Activate()` |
| Section 39 — Dependency Injection | Every service/rule/repository constructor takes interfaces; `Bootstrap.cls` is the sole composition root |
| Section 44 — Polymorphism | `ContractValidator:ValidateContract()` iterates `IBusinessRule` without a type switch |
| Section 45 — State-based domain behaviour | `Contract.cls` — `Activate()`, `Cancel()`, `Lapse()`, `MarkValidationFailed()`, `ResetForRecapture()`, guarded by `GuardMutable()` |
| Section 48 — Idempotency | `Contract:Activate()` — repeat calls on an `IN-FORCE` contract are a no-op; `ActivationRequestCount` still increments |

## Edge cases (Section 47) — where each is handled

| Edge case | Handled in |
|---|---|
| Client already has an active policy | `DuplicateContractRule.cls`, `ContractRepository:HasActiveContractForOwner()` |
| Campaign has expired / not started | `Campaign.cls:IsActive()`/`Validate()`, exercised by `CampaignRequiredRule.cls` |
| Benefit is inactive / does not exist | `BenefitActiveRule.cls`, `BenefitService:AddBenefitToContract()` |
| Duplicate benefit added | `Contract.cls:AddBenefit()` |
| Required person information missing / invalid date of birth | `Person.cls:ValidateMandatoryDetails()`, `PersonMandatoryDetailsRule.cls` |
| Invalid collection day / unsupported collection method | `CollectionInstruction.cls`, `CollectionMethodRequiredRule.cls`, `CollectionDateRequiredRule.cls` |
| Zero / negative premium | `PremiumPositiveRule.cls`, `Benefit.cls:Validate()` |
| Contract already activated / cancelled | `Contract.cls:GuardMutable()`, `ContractStatusRule.cls` |
| Validation performed before all data is captured | Every rule independently reports its own missing precondition; `ValidationSummary:IsValid()` reflects the aggregate result |
| Activation attempted after validation result has become stale | `Contract.cls:LastMutatedDate` / `ValidationSummary:IsStaleAsOf()`, checked in `Activate()` |
| Database failure during activation | `AbstractRepository:WrapError()` -> `RepositoryException` |
| Duplicate activation request | `Contract:Activate()` idempotency guard (Section 48) |

## Rule code index

| Rule Code | Class | Requirement |
|---|---|---|
| NB-CAMPAIGN-001 | `CampaignRequiredRule` | BR-002 / BRULE-001 |
| NB-PERSON-001 | `ContractOwnerRequiredRule` | BR-003 / BRULE-002 |
| NB-PERSON-002 | `PersonMandatoryDetailsRule` | BR-003 / BRULE-003 |
| NB-BENEFIT-001 | `BenefitRequiredRule` | BR-004 / BRULE-004 |
| NB-BENEFIT-004 | `BenefitActiveRule` | BR-004 / BRULE-005 |
| NB-COLLECTION-001 | `CollectionMethodRequiredRule` | BR-005 / BRULE-006 |
| NB-COLLECTION-002 | `CollectionDateRequiredRule` | BR-005 / BRULE-007, BRULE-008 |
| NB-PREMIUM-001 | `PremiumPositiveRule` | BR-006 / BRULE-009 |
| NB-STATUS-001 | `ContractStatusRule` | BR-006 / BRULE-010 |
| NB-CONTRACT-002 | `DuplicateContractRule` | BR-006 |
| NB-ACTIVATION-001 | `Contract.Activate()` guard | BR-007 / BRULE-011 |
| NB-AUTH-001 | `NewBusinessService.Activate()` role check | Section 38 |
