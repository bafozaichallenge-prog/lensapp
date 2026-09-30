New Business Process — OpenEdge OOP Web Application

1. Project Overview

Build a mock New Business Policy/Contract Management Web Application using Progress OpenEdge ABL / OpenEdge OO architecture.

The application represents the process followed when a client wants to open a new insurance policy/contract.

The primary objective is to create a realistic, modular OpenEdge codebase that can later be ingested into an AI-based Requirements Risk & Edge-Case Intelligence system.

The codebase must therefore place a strong emphasis on:

Object-oriented architecture
Abstract classes
Interfaces
Encapsulation
Separation of concerns
Domain-driven design principles
Business rules
Workflow orchestration
Validation
Dependency injection where practical
Testability
Explicit business-process states
Clear relationships between requirements, business rules, classes and database entities

The application must expose the business process through a web/API layer.

2. Technology Requirements

Use:

Progress OpenEdge ABL
OpenEdge OOABL
Classes
Interfaces
Abstract classes
Temp-tables
ProDataSets where appropriate
Business entities/services
REST/API-style service layer
JSON request/response handling
Persistent database tables
Unit-test-friendly architecture

Do NOT implement the entire application as procedural .p files.

Procedures may exist at integration boundaries, but business logic should primarily reside inside classes.

3. Business Process

The New Business process consists of the following major stages.

START
|
v

1. Open Contract
   |
   v
2. Link Campaign
   |
   v
3. Capture Client Details
   |
   v
4. Link Benefits
   |
   v
5. Capture Collection Details
   |
   v
6. Validate New Business
   |
   v
7. Activate Contract
   |
   v
   IN-FORCE

The process must prevent a contract from becoming IN-FORCE unless all mandatory business validations have passed.

4. Business Requirements
   BR-001 — Create Contract

The system must allow a new contract/policy to be created for a prospective client.

A contract must initially be created in a non-active state.

Initial status:

NEW

The system must generate a unique contract identifier.

Example:

CON-000001
BR-002 — Link Campaign

A campaign must be linked to the new contract.

Example campaigns:

JANUARY2026
SUMMER_CAMPAIGN
DIGITAL_CAMPAIGN
AGENT_CAMPAIGN
PROMOTION_001

A contract may only have one primary campaign.

BR-003 — Capture Client Details

The system must capture the person who owns the contract.

Required information:

Person ID
First Name
Surname
Date of Birth
ID Number
Email
Mobile Number
Address

The person must be linked to the contract.

Relationship:

Contract
|
+---- Contract Owner
|
+---- Person
BR-004 — Link Benefits

The client must select one or more benefits.

Example benefits:

LIFE
FUNERAL
ACCIDENT
DISABILITY
CRITICAL_ILLNESS
HOSPITAL

Each selected benefit must be linked to the contract.

A benefit must have:

Benefit ID
Benefit Code
Benefit Name
Description
Premium
Status
BR-005 — Capture Collection Details

The system must capture how and when premiums will be collected.

Collection method examples:

DEBIT_ORDER
EFT
CARD
PAYROLL
CASH

Collection date must also be captured.

Example:

Collection Method: DEBIT_ORDER
Collection Day: 25
BR-006 — Validate New Business

Before activation, the system must perform all required new-business validations.

Examples:

Contract has an owner
Owner has mandatory personal details
Campaign is linked
At least one benefit is selected
Benefits are valid
Collection method is valid
Collection date is valid
Premium is greater than zero
Contract is in NEW status
No duplicate active contract exists where prohibited

Validation must return structured results.

Example:

## ValidationResult

IsValid
RuleCode
Severity
Message
Field
BR-007 — Activate Contract

The contract can only be activated if all mandatory validation rules pass.

The status transition is:

NEW
|
v
IN-FORCE

If validation fails:

NEW
|
X
|
VALIDATION FAILED

The contract must remain NEW.

5. Business Rules

Business rules must NOT be hard-coded directly inside the web/API layer.

Rules must exist in dedicated domain/business-rule classes.

BRULE-001 — Campaign Required

A contract must have a campaign before activation.

IF Contract.CampaignId IS NULL
THEN validation fails
BRULE-002 — Contract Owner Required

A contract must have an owner.

IF Contract.OwnerPersonId IS NULL
THEN validation fails
BRULE-003 — Person Details Required

The following fields are mandatory:

FirstName
Surname
DateOfBirth
IDNumber
MobileNumber
BRULE-004 — Benefit Required

At least one benefit must be associated with the contract.

BRULE-005 — Benefit Must Be Active

Only active benefits may be added to a new contract.

BRULE-006 — Collection Method Required

The contract must have a collection method.

BRULE-007 — Collection Date Required

The contract must have a collection date/day.

BRULE-008 — Valid Collection Day

Collection day must be within:

1 - 31

Additional calendar validation should prevent invalid dates where applicable.

BRULE-009 — Positive Premium

The total premium must be greater than zero.

BRULE-010 — Activation Status

Only contracts in NEW status can be activated.

BRULE-011 — All Mandatory Validations Must Pass

Activation must fail if any mandatory validation rule fails.

6. Domain Model

Create the following primary domain objects.

Contract
Person
Campaign
Benefit
ContractBenefit
CollectionInstruction
ValidationResult
ValidationSummary 7. Contract Domain Object

Create:

Contract.cls

The Contract class represents the central aggregate of the new-business process.

Suggested properties:

DEFINE PUBLIC PROPERTY ContractId AS CHARACTER NO-UNDO.
DEFINE PUBLIC PROPERTY Status AS CHARACTER NO-UNDO.
DEFINE PUBLIC PROPERTY CampaignId AS CHARACTER NO-UNDO.
DEFINE PUBLIC PROPERTY OwnerPersonId AS CHARACTER NO-UNDO.
DEFINE PUBLIC PROPERTY TotalPremium AS DECIMAL NO-UNDO.
DEFINE PUBLIC PROPERTY CreatedDate AS DATETIME NO-UNDO.
DEFINE PUBLIC PROPERTY ActivatedDate AS DATETIME NO-UNDO.

The class must expose behaviour rather than allowing external code to manipulate state directly.

Example methods:

Create()
AssignCampaign()
AssignOwner()
AddBenefit()
SetCollectionInstruction()
Validate()
Activate() 8. Contract Status

Create a strongly controlled status model.

Possible values:

NEW
VALIDATION_FAILED
IN-FORCE
CANCELLED
LAPSED

Do not allow arbitrary application code to directly change the status.

Use domain methods.

Example:

contract:Activate().

rather than:

contract:Status = "IN-FORCE".

The Contract class must enforce valid state transitions.

9. Person Domain Object

Create:

Person.cls

Properties:

PersonId
FirstName
Surname
DateOfBirth
IDNumber
Email
MobileNumber
Address

Methods:

Create()
UpdateDetails()
ValidateMandatoryDetails()

The Person object must encapsulate its own validation where appropriate.

10. Campaign Domain Object

Create:

Campaign.cls

Properties:

CampaignId
CampaignCode
CampaignName
StartDate
EndDate
Status

Methods:

IsActive()
Validate()

A contract may only link to an active campaign.

11. Benefit Domain Object

Create:

Benefit.cls

Properties:

BenefitId
BenefitCode
BenefitName
Description
Premium
Status

Methods:

IsActive()
CalculatePremium()
Validate() 12. Contract Benefit

Create:

ContractBenefit.cls

This object represents the relationship between a contract and a benefit.

Properties:

ContractId
BenefitId
BenefitCode
Premium
EffectiveDate

Methods:

Create()
Validate()
CalculatePremium() 13. Collection Instruction

Create:

CollectionInstruction.cls

Properties:

CollectionMethod
CollectionDay
AccountNumber
BankCode
AccountHolderName

Do not expose sensitive financial information unnecessarily through API responses.

Methods:

Validate()
IsValidCollectionMethod()
IsValidCollectionDay() 14. Interfaces

Prioritise interfaces throughout the architecture.

Create:

IContractService.cls
IPersonService.cls
IBenefitService.cls
ICampaignService.cls
ICollectionService.cls
IContractValidator.cls
IBusinessRule.cls
IRepository.cls
IContractRepository.cls
IPersonRepository.cls
IBenefitRepository.cls
ICampaignRepository.cls
ICollectionRepository.cls

Example:

INTERFACE IContractValidator:

    METHOD PUBLIC ValidateContract(
        INPUT contract AS Contract
    ) RETURNS ValidationSummary.

END INTERFACE. 15. Business Rule Interface

Create:

IBusinessRule.cls

The interface should define a common contract for all business rules.

Example:

INTERFACE IBusinessRule:

    METHOD PUBLIC GetRuleCode()
        RETURNS CHARACTER.

    METHOD PUBLIC GetDescription()
        RETURNS CHARACTER.

    METHOD PUBLIC Evaluate(
        INPUT contract AS Contract
    ) RETURNS ValidationResult.

END INTERFACE. 16. Individual Business Rule Classes

Each important rule should have its own class.

Examples:

CampaignRequiredRule.cls
ContractOwnerRequiredRule.cls
PersonMandatoryDetailsRule.cls
BenefitRequiredRule.cls
BenefitActiveRule.cls
CollectionMethodRequiredRule.cls
CollectionDateRequiredRule.cls
PremiumPositiveRule.cls
ContractStatusRule.cls
DuplicateContractRule.cls

Each class must implement:

IBusinessRule

Example architecture:

IBusinessRule
|
+---- CampaignRequiredRule
|
+---- ContractOwnerRequiredRule
|
+---- BenefitRequiredRule
|
+---- CollectionMethodRequiredRule
|
+---- PremiumPositiveRule

This is important for the AI analysis project because each business rule becomes independently identifiable.

17. Abstract Business Rule Base Class

Create:

AbstractBusinessRule.cls

It must implement common behaviour shared by business rules.

Example:

AbstractBusinessRule
|
+---- CampaignRequiredRule
+---- ContractOwnerRequiredRule
+---- BenefitRequiredRule
+---- PremiumPositiveRule

The abstract class should provide:

RuleCode
Description
Severity
CreateFailureResult()
CreateSuccessResult()

Concrete rules should only implement their specific evaluation logic.

18. Validation Result

Create:

ValidationResult.cls

Properties:

IsValid
RuleCode
Severity
Message
FieldName

Severity values:

INFO
WARNING
ERROR

Example:

RuleCode:
NB-CAMPAIGN-001

IsValid:
FALSE

Severity:
ERROR

FieldName:
CampaignId

Message:
A campaign must be linked before the contract can be activated. 19. Validation Summary

Create:

ValidationSummary.cls

The object must contain multiple validation results.

Suggested methods:

AddResult()
HasErrors()
IsValid()
GetErrors()
GetWarnings()

A contract is activatable only when:

ValidationSummary:IsValid() = TRUE 20. Contract Validator

Create:

ContractValidator.cls

Implement:

IContractValidator

The validator must execute the registered business rules.

Architecture:

ContractValidator
|
+---- IBusinessRule
| |
| +---- CampaignRequiredRule
| +---- OwnerRequiredRule
| +---- BenefitRequiredRule
| +---- CollectionRule
| +---- PremiumRule
|
v
ValidationSummary

Do not place every validation inside one large method.

21. Business Rule Registry

Create:

BusinessRuleRegistry.cls

The registry is responsible for registering and returning business rules.

Example:

RegisterRule()
GetRules()

This allows new rules to be added without modifying the core validation engine.

Example:

BusinessRuleRegistry
|
+---- CampaignRequiredRule
+---- OwnerRequiredRule
+---- BenefitRequiredRule
+---- CollectionRequiredRule
+---- PremiumRule 22. Abstract Domain Entity

Create:

AbstractDomainEntity.cls

This class should contain common entity functionality.

Suggested properties:

CreatedDate
ModifiedDate
CreatedBy
ModifiedBy

Suggested methods:

GetEntityName()
Validate()

Domain classes may inherit from this class.

Example:

AbstractDomainEntity
|
+---- Contract
+---- Person
+---- Campaign
+---- Benefit 23. Repository Architecture

Persistence must be separated from domain logic.

Do not allow Contract.cls to directly contain SQL/database persistence logic.

Create repositories.

Example:

IContractRepository
|
+---- ContractRepository

Methods:

Create()
GetById()
Update()
Save()
Delete()
Exists()

Equivalent repositories should exist for:

Person
Campaign
Benefit
CollectionInstruction
ContractBenefit 24. Abstract Repository

Create:

AbstractRepository.cls

Common functionality should include:

Transaction handling
Error handling
Logging
Database connection/context

Concrete repositories inherit from the abstract repository.

25. Service Layer

Create application services that coordinate domain operations.

Required services:

ContractService.cls
PersonService.cls
BenefitService.cls
CampaignService.cls
CollectionService.cls
NewBusinessService.cls

The most important service is:

NewBusinessService.cls 26. New Business Service

The NewBusinessService orchestrates the entire process.

Example methods:

StartNewBusiness()
CreateContract()
LinkCampaign()
CapturePerson()
AddBenefit()
SetCollectionInstruction()
Validate()
Activate()

It should NOT contain all business rules.

It orchestrates domain objects and services.

Example conceptual flow:

NewBusinessService
|
+--> ContractService
|
+--> CampaignService
|
+--> PersonService
|
+--> BenefitService
|
+--> CollectionService
|
+--> ContractValidator
|
+--> Contract.Activate() 27. Workflow Object

Create:

NewBusinessWorkflow.cls

The workflow represents the state of the new-business application.

Possible workflow stages:

CONTRACT_CREATED
CAMPAIGN_LINKED
PERSON_CAPTURED
BENEFITS_SELECTED
COLLECTION_CAPTURED
VALIDATING
VALIDATION_FAILED
READY_FOR_ACTIVATION
ACTIVATED

The workflow must prevent invalid transitions.

Example:

CONTRACT_CREATED
|
v
CAMPAIGN_LINKED
|
v
PERSON_CAPTURED
|
v
BENEFITS_SELECTED
|
v
COLLECTION_CAPTURED
|
v
VALIDATING
|
v
READY_FOR_ACTIVATION
|
v
ACTIVATED 28. Workflow Interface

Create:

IWorkflow.cls

Methods:

GetCurrentState()
CanTransition()
TransitionTo()
GetAllowedTransitions()

Implement:

NewBusinessWorkflow.cls

using the interface.

29. API Layer

The application must be accessible through a web API.

Create an API/controller layer.

Suggested structure:

api/
ContractController.cls
NewBusinessController.cls
PersonController.cls
BenefitController.cls
CampaignController.cls

Controllers must NOT contain business rules.

Controller responsibility:

HTTP Request
|
v
Deserialize JSON
|
v
Application Service
|
v
Domain
|
v
Repository
|
v
Response DTO
|
v
JSON 30. DTO Layer

Do not expose domain objects directly through the API.

Create DTOs.

Examples:

CreateContractRequest.cls
ContractResponse.cls
CapturePersonRequest.cls
AddBenefitRequest.cls
CollectionInstructionRequest.cls
ValidationResponse.cls
ActivationResponse.cls 31. Example API Endpoints

Implement conceptual REST endpoints.

Create Contract
POST /api/new-business/contracts

Request:

{
"campaignId": "CAM001"
}

Response:

{
"contractId": "CON-000001",
"status": "NEW"
}
Capture Person
POST /api/new-business/contracts/{contractId}/person

Request:

{
"firstName": "John",
"surname": "Doe",
"dateOfBirth": "1990-01-01",
"idNumber": "9001015009087",
"mobileNumber": "0820000000",
"email": "john@example.com"
}
Add Benefit
POST /api/new-business/contracts/{contractId}/benefits

Request:

{
"benefitId": "BEN001"
}
Capture Collection
POST /api/new-business/contracts/{contractId}/collection

Request:

{
"collectionMethod": "DEBIT_ORDER",
"collectionDay": 25
}
Validate Contract
POST /api/new-business/contracts/{contractId}/validate

Response:

{
"valid": false,
"results": [
{
"ruleCode": "NB-BENEFIT-001",
"severity": "ERROR",
"message": "At least one benefit must be selected."
}
]
}
Activate Contract
POST /api/new-business/contracts/{contractId}/activate

If valid:

{
"contractId": "CON-000001",
"status": "IN-FORCE"
}

If invalid:

{
"contractId": "CON-000001",
"status": "NEW",
"activated": false,
"message": "Contract failed new-business validation."
} 32. Database Model

Create mock database tables.

Contract
Contract

---

ContractId
Status
CampaignId
OwnerPersonId
TotalPremium
CreatedDate
ModifiedDate
ActivatedDate
Person
Person

---

PersonId
FirstName
Surname
DateOfBirth
IDNumber
Email
MobileNumber
Address
Campaign
Campaign

---

CampaignId
CampaignCode
CampaignName
StartDate
EndDate
Status
Benefit
Benefit

---

BenefitId
BenefitCode
BenefitName
Description
Premium
Status
ContractBenefit
ContractBenefit

---

ContractId
BenefitId
Premium
EffectiveDate
CollectionInstruction
CollectionInstruction

---

ContractId
CollectionMethod
CollectionDay
AccountNumber
BankCode
AccountHolderName 33. Database Relationships

Model the relationships as:

Campaign
|
| 1
|
| _
Contract
|
+------------------+
| |
| 1 | _
v v
Person ContractBenefit
|
| \*
v
Benefit

Contract
|
| 1
v
CollectionInstruction 34. Transaction Management

New-business operations must use transaction boundaries carefully.

For example, activation should behave as one atomic operation.

Conceptually:

BEGIN TRANSACTION

Validate Contract

IF validation succeeds:

    Update Contract
    Set Status = IN-FORCE
    Set ActivatedDate

    COMMIT

ELSE:

    ROLLBACK

Do not allow partial activation.

35. Error Handling

Create a consistent exception/error architecture.

Suggested classes:

ApplicationException.cls
BusinessRuleException.cls
ValidationException.cls
RepositoryException.cls
ContractStateException.cls

Use meaningful error codes.

Examples:

NB001
NB002
NB003
NB004

Business-rule codes should be more specific:

NB-CAMPAIGN-001
NB-PERSON-001
NB-BENEFIT-001
NB-COLLECTION-001
NB-ACTIVATION-001 36. Logging

Create:

ILogger.cls
Logger.cls

Log:

Contract created
Campaign linked
Person linked
Benefit added
Collection details captured
Validation started
Validation failed
Validation passed
Contract activated
Errors

Do not log sensitive financial or personal information unnecessarily.

37. Audit Trail

Create an audit mechanism.

Example:

## ContractAudit

AuditId
ContractId
Action
OldValue
NewValue
UserId
Timestamp

Examples:

CONTRACT_CREATED
CAMPAIGN_LINKED
PERSON_LINKED
BENEFIT_ADDED
COLLECTION_UPDATED
VALIDATION_EXECUTED
CONTRACT_ACTIVATED 38. Security Considerations

The web application must assume authenticated users.

Create an abstraction:

IUserContext.cls

Example information:

UserId
Username
Roles

Roles:

NEW_BUSINESS_AGENT
SUPERVISOR
ADMIN

The system should distinguish between:

Create Contract
Capture Details
Validate
Activate

Activation may require a higher permission than data capture.

39. Dependency Injection

Where practical, services must depend on interfaces rather than concrete implementations.

Bad:

oRepository = NEW ContractRepository().

Preferred conceptual architecture:

IContractRepository
^
|
ContractRepository
|
v
NewBusinessService

The service should receive its dependencies through a constructor or setter.

Example:

CONSTRUCTOR PUBLIC NewBusinessService(
INPUT poContractRepository AS IContractRepository,
INPUT poValidator AS IContractValidator
).

This makes the code easier to test and analyse.

40. Testing Architecture

Create unit tests around business rules.

Example:

CampaignRequiredRuleTest.cls
ContractOwnerRequiredRuleTest.cls
BenefitRequiredRuleTest.cls
CollectionMethodRequiredRuleTest.cls
PremiumPositiveRuleTest.cls
ContractActivationTest.cls
NewBusinessWorkflowTest.cls

Each rule must be independently testable.

41. Required Test Scenarios

Create tests for:

Successful New Business
Contract created
Campaign linked
Person captured
Benefit selected
Collection details captured
Validation passes
Contract activated

Expected:

IN-FORCE
Missing Campaign

Expected:

Validation failure
Contract remains NEW
Missing Person

Expected:

Validation failure
Contract remains NEW
Missing Benefit

Expected:

Validation failure
Contract remains NEW
Invalid Collection Day

Example:

CollectionDay = 0

Expected:

Validation failure
Zero Premium

Example:

TotalPremium = 0

Expected:

Validation failure
Activation Without Validation

Attempt:

Contract.Activate()

without successful validation.

Expected:

ContractStateException
Activation From Incorrect State

Attempt to activate:

CANCELLED

Expected:

ContractStateException 42. Project Structure

Create the project approximately as:

new-business/
│
├── database/
│ ├── schema/
│ ├── seed/
│ └── migrations/
│
├── src/
│
│ ├── domain/
│ │ ├── entities/
│ │ │ ├── AbstractDomainEntity.cls
│ │ │ ├── Contract.cls
│ │ │ ├── Person.cls
│ │ │ ├── Campaign.cls
│ │ │ ├── Benefit.cls
│ │ │ ├── ContractBenefit.cls
│ │ │ └── CollectionInstruction.cls
│ │ │
│ │ ├── interfaces/
│ │ │ ├── IWorkflow.cls
│ │ │ ├── IBusinessRule.cls
│ │ │ └── IContractValidator.cls
│ │ │
│ │ ├── rules/
│ │ │ ├── AbstractBusinessRule.cls
│ │ │ ├── CampaignRequiredRule.cls
│ │ │ ├── ContractOwnerRequiredRule.cls
│ │ │ ├── PersonMandatoryDetailsRule.cls
│ │ │ ├── BenefitRequiredRule.cls
│ │ │ ├── BenefitActiveRule.cls
│ │ │ ├── CollectionMethodRequiredRule.cls
│ │ │ ├── CollectionDateRequiredRule.cls
│ │ │ ├── PremiumPositiveRule.cls
│ │ │ └── ContractStatusRule.cls
│ │ │
│ │ └── validation/
│ │ ├── ValidationResult.cls
│ │ └── ValidationSummary.cls
│ │
│ ├── application/
│ │ ├── services/
│ │ │ ├── NewBusinessService.cls
│ │ │ ├── ContractService.cls
│ │ │ ├── PersonService.cls
│ │ │ ├── BenefitService.cls
│ │ │ ├── CampaignService.cls
│ │ │ └── CollectionService.cls
│ │ │
│ │ └── workflow/
│ │ └── NewBusinessWorkflow.cls
│ │
│ ├── infrastructure/
│ │ ├── repositories/
│ │ │ ├── AbstractRepository.cls
│ │ │ ├── ContractRepository.cls
│ │ │ ├── PersonRepository.cls
│ │ │ ├── CampaignRepository.cls
│ │ │ ├── BenefitRepository.cls
│ │ │ └── CollectionRepository.cls
│ │ │
│ │ ├── logging/
│ │ │ ├── ILogger.cls
│ │ │ └── Logger.cls
│ │ │
│ │ └── security/
│ │ └── IUserContext.cls
│ │
│ ├── api/
│ │ ├── controllers/
│ │ │ ├── NewBusinessController.cls
│ │ │ ├── ContractController.cls
│ │ │ ├── PersonController.cls
│ │ │ ├── BenefitController.cls
│ │ │ └── CampaignController.cls
│ │ │
│ │ └── dto/
│ │ ├── CreateContractRequest.cls
│ │ ├── ContractResponse.cls
│ │ ├── CapturePersonRequest.cls
│ │ ├── AddBenefitRequest.cls
│ │ ├── CollectionInstructionRequest.cls
│ │ └── ValidationResponse.cls
│ │
│ └── exceptions/
│ ├── ApplicationException.cls
│ ├── BusinessRuleException.cls
│ ├── ValidationException.cls
│ ├── RepositoryException.cls
│ └── ContractStateException.cls
│
├── tests/
│ ├── domain/
│ ├── rules/
│ ├── services/
│ └── workflow/
│
└── README.md 43. OOP Architecture Requirements

This requirement is extremely important.

The generated code must demonstrate real OpenEdge OO design.

Use:

Interfaces
Abstract classes
Inheritance
Polymorphism
Composition
Encapsulation
Dependency inversion
Single responsibility

Avoid:

Large procedural programs
Global variables
Business logic inside controllers
Business logic inside database triggers
Duplicated validation
Direct database access from controllers
Direct status manipulation
God classes
Large CASE statements controlling the entire process 44. Polymorphism Example

Business rules must be executable polymorphically.

Conceptually:

IBusinessRule
|
+---- CampaignRequiredRule
+---- BenefitRequiredRule
+---- PersonRequiredRule
+---- CollectionRequiredRule

The validator should be able to execute:

FOR EACH rule:
result = rule:Evaluate(contract)

without needing to know the concrete rule type.

This is a key architectural requirement.

45. State-Based Domain Behaviour

The Contract object should enforce business state transitions.

For example:

NEW
|
+-- Activate() --> IN-FORCE
|
+-- Cancel() ----> CANCELLED

Invalid:

CANCELLED
|
+-- Activate() --> ERROR

The domain object must own this behaviour.

46. Requirements Traceability

Every major business rule should contain metadata linking it back to the business requirement.

Example:

Rule:
CampaignRequiredRule

Requirement:
BR-002

Rule Code:
NB-CAMPAIGN-001

Description:
A campaign must be linked before activation.

Where practical, include this metadata as class constants or annotations/comments.

Example:

/\*

- Requirement: BR-002
- Business Rule: NB-CAMPAIGN-001
- Description: Campaign is mandatory before activation.
  \*/

This is especially important because the resulting codebase will later be analysed by an AI requirements-intelligence system.

47. Edge Cases

The system must explicitly model and test edge cases.

Examples:

Client already has an active policy
Client has multiple existing policies
Campaign has expired
Campaign has not started
Benefit is inactive
Benefit does not exist
Duplicate benefit added
Person ID already exists
Required person information missing
Invalid date of birth
Invalid collection day
Unsupported collection method
Zero premium
Negative premium
Contract already activated
Contract cancelled
Validation performed before all data is captured
Activation attempted after validation result has become stale
Database failure during activation
Concurrent update
Duplicate activation request

Do not simply ignore these cases.

Represent them as business rules, exceptions, workflow constraints or tests where appropriate.

48. Idempotency

Activation must be protected against duplicate requests.

Example:

POST /contracts/CON-000001/activate
POST /contracts/CON-000001/activate

The second request must not create another activation event or corrupt the contract.

49. Auditability

The system must make it possible to determine:

Who created the contract?
When was it created?
Who linked the campaign?
Who captured the person?
Who added benefits?
Who captured collection information?
Who performed validation?
What validation rules failed?
Who activated the contract?
When was it activated?

This information should be represented in the domain/application architecture.

50. AI Analysis Requirements

The codebase will eventually be consumed by an AI system that analyses business requirements against source code.

Therefore, structure the code so that the following relationships are discoverable:

Business Requirement
|
v
Business Rule
|
v
Domain Class
|
v
Service
|
v
Workflow
|
v
Repository
|
v
Database
|
v
API

For example:

BR-007
Collection Date Required
|
v
NB-COLLECTION-002
|
v
CollectionDateRequiredRule.cls
|
v
ContractValidator.cls
|
v
NewBusinessService.cls
|
v
NewBusinessController.cls

This traceability is a core requirement.

51. Code Documentation

Every major class must contain documentation explaining:

Purpose
Business responsibility
Requirement IDs
Business rules
Dependencies
State assumptions

Example:

/\*

- Class: Contract
-
- Purpose:
- Represents the policy/contract aggregate within
- the New Business process.
-
- Requirements:
- BR-001
- BR-006
- BR-007
-
- Responsibilities:
- - Maintain contract state
- - Manage owner
- - Manage benefits
- - Manage collection instruction
- - Enforce activation rules
    \*/

52. Mock Data

Create realistic seed data.

Campaigns:

CAM001 | January New Business | ACTIVE
CAM002 | Digital Campaign | ACTIVE
CAM003 | Summer Campaign | ACTIVE
CAM004 | Expired Campaign | EXPIRED

Benefits:

BEN001 | LIFE | 250
BEN002 | FUNERAL | 150
BEN003 | ACCIDENT | 100
BEN004 | DISABILITY | 300
BEN005 | HOSPITAL | 200 53. Example End-to-End Scenario

Implement an example scenario:

1. Agent creates contract

Contract:
CON-000001

Status:
NEW

Then:

2. Campaign linked

CAM001

Then:

3. Person captured

John Doe

Then:

4. Benefits selected

LIFE
FUNERAL

Then:

5. Collection details

DEBIT_ORDER
25

Then:

6. Validation

Expected:

VALID

Then:

7. Activation

Expected:

Status = IN-FORCE 54. Expected Deliverables

Claude must generate a complete mock OpenEdge project containing:

Database schema
Seed data
Domain entities
Interfaces
Abstract classes
Concrete business-rule classes
Validation engine
Workflow engine
Application services
Repository layer
API/controller layer
DTOs
Error handling
Logging
Audit functionality
Unit tests
README
Architecture documentation
Requirements-to-code traceability documentation 55. Implementation Priority

Implement in this order:

PHASE 1
Domain model
|
v
PHASE 2
Interfaces + abstract classes
|
v
PHASE 3
Business rules
|
v
PHASE 4
Validation engine
|
v
PHASE 5
Workflow
|
v
PHASE 6
Application services
|
v
PHASE 7
Repositories/database
|
v
PHASE 8
API
|
v
PHASE 9
Tests
|
v
PHASE 10
Traceability documentation

Do not build the UI/API first and then put business logic behind it.

The domain and business-rule architecture must be established first.

56. Final Architectural Goal

The final architecture should resemble:

                         WEB / REST API
                               |
                               v
                    +---------------------+
                    | NewBusinessController|
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    | NewBusinessService  |
                    +----------+----------+
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
        ContractService   PersonService   BenefitService
              |
              v
        +-------------+
        |   Contract  |
        |   Aggregate |
        +------+------+
               |
       +-------+--------+
       |                |
       v                v

ContractBenefit CollectionInstruction
|
v
Benefit

              VALIDATION
                   |
                   v
          +----------------+
          | ContractValidator|
          +-------+--------+
                  |
                  v
          +----------------+
          |BusinessRuleRegistry|
          +-------+--------+
                  |
       +----------+----------+
       |          |          |
       v          v          v

Campaign Benefit Person
Rule Rule Rule
|
+---- all implement IBusinessRule

              PERSISTENCE
                   |
                   v
             IRepository
                   |
                   v
          Concrete Repository
                   |
                   v
              DATABASE

The most important principle is:

The web application is an interface to the business process, not the owner of the business process.

The business process should remain executable even if the web/API layer is replaced.

57. Claude Build Instruction

When generating the project:

Generate actual OpenEdge ABL/OOABL code.
Do not merely provide pseudocode.
Ensure classes use valid OpenEdge syntax.
Prefer .cls classes over procedural .p files for business logic.
Use interfaces wherever a dependency represents an abstraction.
Use abstract classes where shared behaviour exists.
Use inheritance only where an actual "is-a" relationship exists.
Use composition where an object owns another object.
Keep controllers thin.
Keep business rules independently testable.
Keep persistence separate from domain logic.
Keep validation separate from API handling.
Enforce contract state transitions inside the Contract domain object.
Include requirement IDs and business-rule IDs in relevant classes.
Include unit tests for every major business rule.
Include negative/edge-case tests.
Produce a README explaining how the architecture works.
Produce a requirements traceability document.
Produce an architecture diagram in Markdown.
Ensure the final codebase is internally consistent and compiles as far as possible in a standard OpenEdge environment.

The resulting application should look like a small but realistic enterprise insurance new-business system rather than a simple CRUD application.
