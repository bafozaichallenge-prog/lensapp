/*------------------------------------------------------------------------
    Class:    NewBusinessService
    Purpose:  Orchestrates the full New Business process end-to-end by
              coordinating the smaller application services, the
              ContractValidator, the NewBusinessWorkflow and the audit
              trail. It intentionally contains NO business rules of its
              own - those are owned by domain.rules.* and by Contract's
              own state-transition guards. This class only sequences
              calls and keeps the workflow/audit trail in sync with what
              actually happened.

    Requirements:  Section 26 - New Business Service (the most important
                   service), Section 34 - Transaction Management,
                   Section 38 - Security Considerations

    Flow:
        NewBusinessService
            +--> ContractService
            +--> CampaignService
            +--> PersonService
            +--> BenefitService
            +--> CollectionService
            +--> ContractValidator (via IContractValidator)
            +--> Contract.Activate()

    Dependencies (constructor-injected, Section 39 - Dependency
    Injection): every dependency is received as an interface so this
    class - and the whole orchestration flow - remains testable with
    stub/mock implementations.
------------------------------------------------------------------------*/

USING domain.interfaces.IContractService.
USING domain.interfaces.IPersonService.
USING domain.interfaces.IBenefitService.
USING domain.interfaces.ICollectionService.
USING domain.interfaces.IContractValidator.
USING domain.entities.Contract.
USING domain.entities.Person.
USING domain.entities.ContractBenefit.
USING domain.entities.CollectionInstruction.
USING domain.validation.ValidationSummary.
USING application.workflow.NewBusinessWorkflow.
USING infrastructure.audit.IAuditService.
USING infrastructure.audit.AuditService.
USING infrastructure.logging.ILogger.
USING infrastructure.security.IUserContext.
USING infrastructure.security.UserContext.
USING exceptions.BusinessRuleException.
USING OpenEdge.Core.Collections.CaseSensitiveStringKeyedMap.

CLASS application.services.NewBusinessService:

    DEFINE PRIVATE VARIABLE moContractService   AS IContractService   NO-UNDO.
    DEFINE PRIVATE VARIABLE moPersonService      AS IPersonService     NO-UNDO.
    DEFINE PRIVATE VARIABLE moBenefitService     AS IBenefitService    NO-UNDO.
    DEFINE PRIVATE VARIABLE moCollectionService  AS ICollectionService NO-UNDO.
    DEFINE PRIVATE VARIABLE moValidator          AS IContractValidator NO-UNDO.
    DEFINE PRIVATE VARIABLE moAuditService        AS IAuditService      NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger              AS ILogger            NO-UNDO.
    DEFINE PRIVATE VARIABLE moWorkflows            AS CaseSensitiveStringKeyedMap NO-UNDO.

    CONSTRUCTOR PUBLIC NewBusinessService
        ( INPUT poContractService  AS IContractService,
          INPUT poPersonService    AS IPersonService,
          INPUT poBenefitService   AS IBenefitService,
          INPUT poCollectionService AS ICollectionService,
          INPUT poValidator         AS IContractValidator,
          INPUT poAuditService      AS IAuditService,
          INPUT poLogger            AS ILogger ):

        moContractService   = poContractService.
        moPersonService      = poPersonService.
        moBenefitService     = poBenefitService.
        moCollectionService  = poCollectionService.
        moValidator           = poValidator.
        moAuditService         = poAuditService.
        moLogger               = poLogger.
        moWorkflows             = NEW CaseSensitiveStringKeyedMap().
    END CONSTRUCTOR.

    METHOD PRIVATE NewBusinessWorkflow GetWorkflow (INPUT pcContractId AS CHARACTER):
        IF NOT moWorkflows:ContainsKey(pcContractId) THEN
            moWorkflows:Put(pcContractId, NEW NewBusinessWorkflow(pcContractId)).
        RETURN CAST(moWorkflows:Get(pcContractId), NewBusinessWorkflow).
    END METHOD.

    /* Convenience entry point matching Section 26s suggested method
       list - simply delegates to CreateContract(). */
    METHOD PUBLIC Contract StartNewBusiness (INPUT pcUserId AS CHARACTER):
        RETURN THIS-OBJECT:CreateContract(pcUserId).
    END METHOD.

    METHOD PUBLIC Contract CreateContract (INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.

        oContract = moContractService:CreateContract(pcUserId).
        THIS-OBJECT:GetWorkflow(oContract:ContractId). /* seeds workflow at CONTRACT_CREATED */

        moAuditService:RecordAction(oContract:ContractId, AuditService:ACTION_CONTRACT_CREATED, "", oContract:Status, pcUserId).

        RETURN oContract.
    END METHOD.

    METHOD PUBLIC VOID LinkCampaign (INPUT pcContractId AS CHARACTER, INPUT pcCampaignId AS CHARACTER, INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.

        moContractService:AssignCampaign(pcContractId, pcCampaignId).

        oWorkflow = THIS-OBJECT:GetWorkflow(pcContractId).
        IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_CAMPAIGN_LINKED) THEN
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_CAMPAIGN_LINKED).

        moAuditService:RecordAction(pcContractId, AuditService:ACTION_CAMPAIGN_LINKED, "", pcCampaignId, pcUserId).
    END METHOD.

    METHOD PUBLIC Person CapturePerson
        ( INPUT pcContractId    AS CHARACTER,
          INPUT pcFirstName     AS CHARACTER,
          INPUT pcSurname       AS CHARACTER,
          INPUT pdDateOfBirth   AS DATE,
          INPUT pcIDNumber      AS CHARACTER,
          INPUT pcEmail         AS CHARACTER,
          INPUT pcMobileNumber  AS CHARACTER,
          INPUT pcAddress       AS CHARACTER,
          INPUT pcUserId        AS CHARACTER ):

        DEFINE VARIABLE oPerson   AS Person              NO-UNDO.
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.

        oPerson = moPersonService:CapturePerson(pcFirstName, pcSurname, pdDateOfBirth, pcIDNumber, pcEmail, pcMobileNumber, pcAddress, pcUserId).
        moContractService:AssignOwner(pcContractId, oPerson:PersonId).

        oWorkflow = THIS-OBJECT:GetWorkflow(pcContractId).
        IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_PERSON_CAPTURED) THEN
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_PERSON_CAPTURED).

        moAuditService:RecordAction(pcContractId, AuditService:ACTION_PERSON_LINKED, "", oPerson:PersonId, pcUserId).

        RETURN oPerson.
    END METHOD.

    METHOD PUBLIC ContractBenefit AddBenefit (INPUT pcContractId AS CHARACTER, INPUT pcBenefitId AS CHARACTER, INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oContractBenefit AS ContractBenefit      NO-UNDO.
        DEFINE VARIABLE oWorkflow        AS NewBusinessWorkflow  NO-UNDO.

        oContractBenefit = moBenefitService:AddBenefitToContract(pcContractId, pcBenefitId, pcUserId).

        oWorkflow = THIS-OBJECT:GetWorkflow(pcContractId).
        IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_BENEFITS_SELECTED) THEN
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_BENEFITS_SELECTED).

        moAuditService:RecordAction(pcContractId, AuditService:ACTION_BENEFIT_ADDED, "", oContractBenefit:BenefitCode, pcUserId).

        RETURN oContractBenefit.
    END METHOD.

    METHOD PUBLIC CollectionInstruction SetCollectionInstruction
        ( INPUT pcContractId        AS CHARACTER,
          INPUT pcCollectionMethod  AS CHARACTER,
          INPUT piCollectionDay     AS INTEGER,
          INPUT pcAccountNumber     AS CHARACTER,
          INPUT pcBankCode          AS CHARACTER,
          INPUT pcAccountHolderName AS CHARACTER,
          INPUT pcUserId            AS CHARACTER ):

        DEFINE VARIABLE oInstruction AS CollectionInstruction NO-UNDO.
        DEFINE VARIABLE oWorkflow    AS NewBusinessWorkflow   NO-UNDO.

        oInstruction = moCollectionService:CaptureCollection(
            pcContractId, pcCollectionMethod, piCollectionDay,
            pcAccountNumber, pcBankCode, pcAccountHolderName, pcUserId).

        oWorkflow = THIS-OBJECT:GetWorkflow(pcContractId).
        IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_COLLECTION_CAPTURED) THEN
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_COLLECTION_CAPTURED).

        moAuditService:RecordAction(pcContractId, AuditService:ACTION_COLLECTION_UPDATED, "", pcCollectionMethod, pcUserId).

        RETURN oInstruction.
    END METHOD.

    METHOD PUBLIC ValidationSummary Validate (INPUT pcContractId AS CHARACTER, INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oSummary  AS ValidationSummary      NO-UNDO.
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow    NO-UNDO.

        oContract = moContractService:GetContract(pcContractId).
        oWorkflow = THIS-OBJECT:GetWorkflow(pcContractId).

        IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_VALIDATING) THEN
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_VALIDATING).

        oSummary = oContract:Validate(moValidator).

        IF oSummary:IsValid() THEN DO:
            IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_READY_FOR_ACTIVATION) THEN
                oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_READY_FOR_ACTIVATION).
        END.
        ELSE DO:
            IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_VALIDATION_FAILED) THEN
                oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_VALIDATION_FAILED).
        END.

        moAuditService:RecordAction(pcContractId, AuditService:ACTION_VALIDATION_EXECUTED,
            "", SUBSTITUTE("valid=&1 errors=&2", oSummary:IsValid(), oSummary:GetErrors():Size), pcUserId).

        RETURN oSummary.
    END METHOD.

    /* BR-007 - only NEW_BUSINESS_AGENT-captured contracts may be
       activated by a SUPERVISOR or ADMIN (Section 38 - activation
       requires a higher permission than data capture). */
    METHOD PUBLIC Contract Activate (INPUT pcContractId AS CHARACTER, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oContract AS Contract             NO-UNDO.
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow  NO-UNDO.

        IF NOT (poUser:HasRole(UserContext:ROLE_SUPERVISOR) OR poUser:HasRole(UserContext:ROLE_ADMIN)) THEN
            UNDO, THROW NEW BusinessRuleException(
                "Activation requires SUPERVISOR or ADMIN privileges.", "NB-AUTH-001").

        moContractService:Activate(pcContractId, poUser:GetUserId()).
        oContract = moContractService:GetContract(pcContractId).

        oWorkflow = THIS-OBJECT:GetWorkflow(pcContractId).
        IF oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_ACTIVATED) THEN
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_ACTIVATED).

        moAuditService:RecordAction(pcContractId, AuditService:ACTION_CONTRACT_ACTIVATED,
            Contract:STATUS_NEW, oContract:Status, poUser:GetUserId()).

        RETURN oContract.
    END METHOD.

    METHOD PUBLIC NewBusinessWorkflow GetWorkflowState (INPUT pcContractId AS CHARACTER):
        RETURN THIS-OBJECT:GetWorkflow(pcContractId).
    END METHOD.

    METHOD PUBLIC Contract GetContract (INPUT pcContractId AS CHARACTER):
        RETURN moContractService:GetContract(pcContractId).
    END METHOD.

END CLASS.
