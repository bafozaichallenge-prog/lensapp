/*------------------------------------------------------------------------
    Rule:          BenefitRequiredRule
    Rule Code:     NB-BENEFIT-001
    Requirement:   BR-004 / BRULE-004
    Description:   At least one benefit must be selected before activation.
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.BenefitRequiredRule INHERITS AbstractBusinessRule:

    CONSTRUCTOR PUBLIC BenefitRequiredRule ( ):
        SUPER("NB-BENEFIT-001",
              "At least one benefit must be selected.",
              "BR-004",
              ValidationResult:SEVERITY_ERROR).
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF poContract:GetBenefitCount() = 0 THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                "At least one benefit must be selected.",
                "Benefits").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
