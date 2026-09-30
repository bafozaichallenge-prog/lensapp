/*------------------------------------------------------------------------
    Class:    CollectionService
    Purpose:  Application service coordinating capture of the premium
              collection instruction against a contract.

    Requirements:  Section 25 - Service Layer, BR-005
------------------------------------------------------------------------*/

USING domain.interfaces.ICollectionService.
USING domain.interfaces.ICollectionRepository.
USING domain.interfaces.IContractRepository.
USING domain.entities.CollectionInstruction.
USING domain.entities.Contract.
USING infrastructure.logging.ILogger.
USING exceptions.BusinessRuleException.

CLASS application.services.CollectionService IMPLEMENTS ICollectionService:

    DEFINE PRIVATE VARIABLE moCollectionRepository AS ICollectionRepository NO-UNDO.
    DEFINE PRIVATE VARIABLE moContractRepository    AS IContractRepository  NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger                AS ILogger              NO-UNDO.

    CONSTRUCTOR PUBLIC CollectionService
        ( INPUT poCollectionRepository AS ICollectionRepository,
          INPUT poContractRepository   AS IContractRepository,
          INPUT poLogger               AS ILogger ):
        moCollectionRepository = poCollectionRepository.
        moContractRepository   = poContractRepository.
        moLogger                = poLogger.
    END CONSTRUCTOR.

    METHOD PUBLIC CollectionInstruction CaptureCollection
        ( INPUT pcContractId        AS CHARACTER,
          INPUT pcCollectionMethod  AS CHARACTER,
          INPUT piCollectionDay     AS INTEGER,
          INPUT pcAccountNumber     AS CHARACTER,
          INPUT pcBankCode          AS CHARACTER,
          INPUT pcAccountHolderName AS CHARACTER,
          INPUT pcUserId            AS CHARACTER ):

        DEFINE VARIABLE oInstruction AS CollectionInstruction NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract               NO-UNDO.
        DEFINE VARIABLE cReason      AS CHARACTER              NO-UNDO.

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create(pcContractId, pcCollectionMethod, piCollectionDay, pcAccountNumber, pcBankCode, pcAccountHolderName, pcUserId).

        IF NOT oInstruction:Validate(OUTPUT cReason) THEN
            UNDO, THROW NEW BusinessRuleException(cReason, "NB-COLLECTION-003").

        moCollectionRepository:Save(oInstruction).

        oContract = moContractRepository:GetById(pcContractId).
        oContract:SetCollectionInstruction(oInstruction).
        moContractRepository:Update(oContract).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("CollectionService", SUBSTITUTE("Collection details captured for contract &1 (method=&2)", pcContractId, pcCollectionMethod)).

        RETURN oInstruction.
    END METHOD.

END CLASS.
