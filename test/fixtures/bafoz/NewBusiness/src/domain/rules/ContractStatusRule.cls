/*------------------------------------------------------------------------
    Rule:          ContractStatusRule
    Rule Code:     NB-STATUS-001
    Requirement:   BR-006 / BRULE-010
    Description:   Only contracts in NEW status can be validated for
                   activation - Edge Case: "Contract already activated",
                   "Contract cancelled".
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.ContractStatusRule INHERITS AbstractBusinessRule:

    CONSTRUCTOR PUBLIC ContractStatusRule ( ):
        SUPER("NB-STATUS-001",
              "Only contracts in NEW status can be activated.",
              "BR-006",
              ValidationResult:SEVERITY_ERROR).
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF poContract:Status <> Contract:STATUS_NEW THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                SUBSTITUTE("Contract is in &1 status; only NEW contracts can be activated.", poContract:Status),
                "Status").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
