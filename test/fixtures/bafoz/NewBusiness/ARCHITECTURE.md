# Architecture

## Layering and dependency direction

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                            api/                                  │
 │  controllers/  NewBusinessController, ContractController, ...    │
 │  dto/          CreateContractRequest, ContractResponse, ...      │
 └───────────────────────────────┬───────────────────────────────────┘
                                  │ depends on
                                  v
 ┌─────────────────────────────────────────────────────────────────┐
 │                         application/                             │
 │  services/    NewBusinessService                                 │
 │                 +--> ContractService                             │
 │                 +--> PersonService                                │
 │                 +--> BenefitService                                │
 │                 +--> CampaignService                                │
 │                 +--> CollectionService                                │
 │  workflow/    NewBusinessWorkflow (capture-stage state machine)         │
 └───────────────────────────────┬───────────────────────────────────┘
                                  │ depends on (interfaces only)
                                  v
 ┌─────────────────────────────────────────────────────────────────┐
 │                            domain/                                │
 │                                                                    │
 │  entities/         Contract (aggregate root)                      │
 │                       +---- ContractBenefit  --> Benefit           │
 │                       +---- CollectionInstruction                   │
 │                       +---- (OwnerPersonId)   --> Person             │
 │                       +---- (CampaignId)      --> Campaign            │
 │                     all inherit AbstractDomainEntity                   │
 │                                                                    │
 │  rules/            IBusinessRule                                   │
 │                       +---- AbstractBusinessRule (ABSTRACT)          │
 │                              +---- CampaignRequiredRule                │
 │                              +---- ContractOwnerRequiredRule             │
 │                              +---- PersonMandatoryDetailsRule              │
 │                              +---- BenefitRequiredRule                       │
 │                              +---- BenefitActiveRule                           │
 │                              +---- CollectionMethodRequiredRule                  │
 │                              +---- CollectionDateRequiredRule                      │
 │                              +---- PremiumPositiveRule                               │
 │                              +---- ContractStatusRule                                  │
 │                              +---- DuplicateContractRule                                 │
 │                     BusinessRuleRegistry (holds the set above)                            │
 │                                                                    │
 │  validation/       ValidationResult, ValidationSummary,                                    │
 │                     ContractValidator (implements IContractValidator)                        │
 │                     iterates BusinessRuleRegistry:GetRules() polymorphically                   │
 └───────────────────────────────┬───────────────────────────────────┘
                                  │ depends on (interfaces only)
                                  v
 ┌─────────────────────────────────────────────────────────────────┐
 │                        infrastructure/                            │
 │  repositories/   AbstractRepository (ABSTRACT)                     │
 │                     +---- ContractRepository                        │
 │                     +---- PersonRepository                            │
 │                     +---- CampaignRepository                           │
 │                     +---- BenefitRepository                              │
 │                     +---- CollectionRepository                             │
 │                     +---- ContractBenefitRepository                          │
 │  logging/        ILogger / Logger                                              │
 │  security/       IUserContext / UserContext                                      │
 │  audit/          IAuditService / AuditService (ContractAudit records)              │
 └───────────────────────────────┬───────────────────────────────────┘
                                  │ mirrors (field-for-field)
                                  v
 ┌─────────────────────────────────────────────────────────────────┐
 │                      database/schema/newbusiness.df                │
 │        Contract, Person, Campaign, Benefit, ContractBenefit,        │
 │             CollectionInstruction, ContractAudit                      │
 └─────────────────────────────────────────────────────────────────┘
```

`Bootstrap.cls` sits outside this stack as the composition root: it is
the only class allowed to `NEW` a concrete repository, service, or
rule, and it wires everything together behind the interfaces shown
above (Section 39 - Dependency Injection).

## The new-business flow, end to end

```
START
  |
  v
1. Open Contract          NewBusinessService:CreateContract()
  |                          -> ContractService:CreateContract()
  |                          -> Contract:Create()             [Status: NEW]
  v
2. Link Campaign           NewBusinessService:LinkCampaign()
  |                          -> ContractService:AssignCampaign()
  |                          -> Contract:AssignCampaign()
  v
3. Capture Client Details  NewBusinessService:CapturePerson()
  |                          -> PersonService:CapturePerson() -> Person:Create()
  |                          -> ContractService:AssignOwner()
  v
4. Link Benefits            NewBusinessService:AddBenefit()
  |                          -> BenefitService:AddBenefitToContract()
  |                          -> ContractBenefit:Create()  (validates source Benefit)
  |                          -> Contract:AddBenefit()     (rejects duplicates)
  v
5. Capture Collection Details  NewBusinessService:SetCollectionInstruction()
  |                          -> CollectionService:CaptureCollection()
  |                          -> Contract:SetCollectionInstruction()
  v
6. Validate New Business    NewBusinessService:Validate()
  |                          -> Contract:Validate(IContractValidator)
  |                          -> ContractValidator:ValidateContract()
  |                               FOR EACH rule in BusinessRuleRegistry:
  |                                   result = rule:Evaluate(contract)
  |                          -> ValidationSummary cached on Contract
  |
  +-- FAILS --> workflow: VALIDATION_FAILED, Contract remains NEW
  |
  v (passes)
7. Activate Contract        NewBusinessService:Activate()
  |                          -> role check (SUPERVISOR/ADMIN only)
  |                          -> ContractService:Activate()
  |                          -> Contract:Activate()
  |                               guards: Status=NEW, summary exists,
  |                                       summary not stale, summary valid
  v
IN-FORCE
```

Every step above also calls `AuditService:RecordAction()` and advances
`NewBusinessWorkflow` by one stage, so both "what happened" and "how
far through capture is this application" stay independently queryable
(Sections 37, 49).

## Polymorphic rule execution (Section 44)

```
ContractValidator:ValidateContract(contract)
   oRules = BusinessRuleRegistry:GetRules()          <-- ArrayList of IBusinessRule
   DO i = 1 TO oRules:Size:
       oRule = CAST(oRules:Get(i), IBusinessRule)
       oSummary:AddResult(oRule:Evaluate(contract))   <-- no type-switch, ever
   END.
```

Adding `DuplicateContractRule` required zero changes to
`ContractValidator.cls` — only one new `RegisterRule()` call in
`Bootstrap.cls`. This is the Open/Closed principle in practice and is
exactly the shape the AI requirements-intelligence tooling should be
able to discover: one rule class, one requirement ID, one rule code,
evaluated identically to every other rule.
