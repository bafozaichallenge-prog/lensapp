/*------------------------------------------------------------------------
    Class:    BenefitService
    Purpose:  Application service coordinating benefit selection against
              a contract. Delegates the actual link creation to
              ContractBenefit.Create() (which validates the source
              Benefit) and to Contract.AddBenefit() (which rejects
              duplicates) - this service just wires the pieces together.

    Requirements:  Section 25 - Service Layer, BR-004
------------------------------------------------------------------------*/

USING domain.interfaces.IBenefitService.
USING domain.interfaces.IBenefitRepository.
USING domain.interfaces.IContractRepository.
USING domain.entities.Benefit.
USING domain.entities.Contract.
USING domain.entities.ContractBenefit.
USING infrastructure.logging.ILogger.
USING exceptions.BusinessRuleException.

CLASS application.services.BenefitService IMPLEMENTS IBenefitService:

    DEFINE PRIVATE VARIABLE moBenefitRepository  AS IBenefitRepository  NO-UNDO.
    DEFINE PRIVATE VARIABLE moContractRepository AS IContractRepository NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger             AS ILogger             NO-UNDO.

    CONSTRUCTOR PUBLIC BenefitService
        ( INPUT poBenefitRepository  AS IBenefitRepository,
          INPUT poContractRepository AS IContractRepository,
          INPUT poLogger             AS ILogger ):
        moBenefitRepository  = poBenefitRepository.
        moContractRepository = poContractRepository.
        moLogger             = poLogger.
    END CONSTRUCTOR.

    METHOD PUBLIC Benefit GetBenefit (INPUT pcBenefitId AS CHARACTER):
        RETURN moBenefitRepository:GetById(pcBenefitId).
    END METHOD.

    METHOD PUBLIC ContractBenefit AddBenefitToContract (INPUT pcContractId AS CHARACTER, INPUT pcBenefitId AS CHARACTER, INPUT pcUserId AS CHARACTER):
        DEFINE VARIABLE oContract        AS Contract        NO-UNDO.
        DEFINE VARIABLE oBenefit         AS Benefit         NO-UNDO.
        DEFINE VARIABLE oContractBenefit AS ContractBenefit NO-UNDO.

        IF NOT moBenefitRepository:Exists(pcBenefitId) THEN
            UNDO, THROW NEW BusinessRuleException(
                SUBSTITUTE("Benefit &1 does not exist.", pcBenefitId), "NB-BENEFIT-003").

        oContract = moContractRepository:GetById(pcContractId).
        oBenefit  = moBenefitRepository:GetById(pcBenefitId).

        oContractBenefit = NEW ContractBenefit().
        oContractBenefit:Create(pcContractId, oBenefit, TODAY, pcUserId).

        oContract:AddBenefit(oContractBenefit).
        moContractRepository:Update(oContract).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("BenefitService", SUBSTITUTE("Benefit &1 added to contract &2", oBenefit:BenefitCode, pcContractId)).

        RETURN oContractBenefit.
    END METHOD.

END CLASS.
