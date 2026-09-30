/*------------------------------------------------------------------------
    Class:    ContractService
    Purpose:  Application service coordinating Contract aggregate
              operations against persistence. Contains NO business
              rules itself - those live in domain.rules.* and are
              enforced by Contract.cls / ContractValidator.cls. This
              class only orchestrates "load, call domain method, save".

    Requirements:  Section 25 - Service Layer
    Dependencies (constructor-injected, Section 39):
        IContractRepository, ILogger
------------------------------------------------------------------------*/

USING domain.interfaces.IContractService.
USING domain.interfaces.IContractRepository.
USING domain.entities.Contract.
USING infrastructure.logging.ILogger.

CLASS application.services.ContractService IMPLEMENTS IContractService:

    DEFINE PRIVATE VARIABLE moContractRepository AS IContractRepository NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger              AS ILogger            NO-UNDO.

    CONSTRUCTOR PUBLIC ContractService (INPUT poContractRepository AS IContractRepository, INPUT poLogger AS ILogger):
        moContractRepository = poContractRepository.
        moLogger              = poLogger.
    END CONSTRUCTOR.

    METHOD PUBLIC Contract CreateContract (INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oContract   AS Contract  NO-UNDO.
        DEFINE VARIABLE cContractId AS CHARACTER NO-UNDO.

        cContractId = moContractRepository:GetNextContractId().

        oContract = NEW Contract().
        oContract:Create(cContractId, pcUserId).

        moContractRepository:Save(oContract).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("ContractService", SUBSTITUTE("Contract &1 created by &2", cContractId, pcUserId)).

        RETURN oContract.
    END METHOD.

    METHOD PUBLIC Contract GetContract (INPUT pcContractId AS CHARACTER):
        RETURN moContractRepository:GetById(pcContractId).
    END METHOD.

    METHOD PUBLIC VOID AssignCampaign (INPUT pcContractId AS CHARACTER, INPUT pcCampaignId AS CHARACTER):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        oContract = moContractRepository:GetById(pcContractId).
        oContract:AssignCampaign(pcCampaignId).
        moContractRepository:Update(oContract).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("ContractService", SUBSTITUTE("Campaign &1 linked to contract &2", pcCampaignId, pcContractId)).
    END METHOD.

    METHOD PUBLIC VOID AssignOwner (INPUT pcContractId AS CHARACTER, INPUT pcPersonId AS CHARACTER):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        oContract = moContractRepository:GetById(pcContractId).
        oContract:AssignOwner(pcPersonId).
        moContractRepository:Update(oContract).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("ContractService", SUBSTITUTE("Owner &1 linked to contract &2", pcPersonId, pcContractId)).
    END METHOD.

    /* BR-007 / Section 34 - Transaction Management: the status flip and
       ActivatedDate stamp happen inside Contract:Activate() as a single
       in-memory operation, then persisted as one atomic Update() call -
       there is no code path that can persist a partial activation. */
    METHOD PUBLIC VOID Activate (INPUT pcContractId AS CHARACTER, INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.

        oContract = moContractRepository:GetById(pcContractId).

        oContract:Activate().
        moContractRepository:Update(oContract).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("ContractService", SUBSTITUTE("Contract &1 activated by &2 (status=&3)", pcContractId, pcUserId, oContract:Status)).
    END METHOD.

END CLASS.
