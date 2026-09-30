/*------------------------------------------------------------------------
    Rule:          BenefitActiveRule
    Rule Code:     NB-BENEFIT-004
    Requirement:   BR-004 / BRULE-005
    Description:   Only active benefits may remain on a new contract at
                   the time of activation - a benefit could have been
                   deactivated by product/admin staff after it was
                   selected on the contract, so this is re-checked live
                   against the Benefit master, not just at selection
                   time (see BenefitService:AddBenefitToContract()).
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.entities.ContractBenefit.
USING domain.entities.Benefit.
USING domain.interfaces.IBenefitRepository.
USING domain.validation.ValidationResult.
USING OpenEdge.Core.Collections.ArrayList.

CLASS domain.rules.BenefitActiveRule INHERITS AbstractBusinessRule:

    DEFINE PRIVATE VARIABLE moBenefitRepository AS IBenefitRepository NO-UNDO.

    CONSTRUCTOR PUBLIC BenefitActiveRule (INPUT poBenefitRepository AS IBenefitRepository):
        SUPER("NB-BENEFIT-004",
              "Only active benefits may be included on a new contract.",
              "BR-004",
              ValidationResult:SEVERITY_ERROR).
        moBenefitRepository = poBenefitRepository.
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        DEFINE VARIABLE oBenefits AS ArrayList        NO-UNDO.
        DEFINE VARIABLE oCB       AS ContractBenefit   NO-UNDO.
        DEFINE VARIABLE oBenefit  AS Benefit           NO-UNDO.
        DEFINE VARIABLE i         AS INTEGER           NO-UNDO.

        oBenefits = poContract:GetBenefits().

        DO i = 1 TO oBenefits:Size:
            oCB = CAST(oBenefits:Get(i), ContractBenefit).

            IF NOT moBenefitRepository:Exists(oCB:BenefitId) THEN
                RETURN THIS-OBJECT:CreateFailureResult(
                    SUBSTITUTE("Benefit &1 no longer exists.", oCB:BenefitCode),
                    "Benefits").

            oBenefit = moBenefitRepository:GetById(oCB:BenefitId).
            IF NOT oBenefit:IsActive() THEN
                RETURN THIS-OBJECT:CreateFailureResult(
                    SUBSTITUTE("Benefit &1 is no longer active.", oCB:BenefitCode),
                    "Benefits").
        END.

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
