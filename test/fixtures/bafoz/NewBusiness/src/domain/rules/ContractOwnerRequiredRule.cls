/*------------------------------------------------------------------------
    Rule:          ContractOwnerRequiredRule
    Rule Code:     NB-PERSON-001
    Requirement:   BR-003 / BRULE-002
    Description:   A contract must have an owner before activation.
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.ContractOwnerRequiredRule INHERITS AbstractBusinessRule:

    CONSTRUCTOR PUBLIC ContractOwnerRequiredRule ( ):
        SUPER("NB-PERSON-001",
              "A contract must have an owner before it can be activated.",
              "BR-003",
              ValidationResult:SEVERITY_ERROR).
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF poContract:OwnerPersonId = "" OR poContract:OwnerPersonId = ? THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                "A contract must have an owner before it can be activated.",
                "OwnerPersonId").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
