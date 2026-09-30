/*------------------------------------------------------------------------
    Rule:          PremiumPositiveRule
    Rule Code:     NB-PREMIUM-001
    Requirement:   BR-006 / BRULE-009
    Description:   The total premium must be greater than zero - Edge
                   Cases: "Zero premium", "Negative premium".
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.PremiumPositiveRule INHERITS AbstractBusinessRule:

    CONSTRUCTOR PUBLIC PremiumPositiveRule ( ):
        SUPER("NB-PREMIUM-001",
              "The total premium must be greater than zero.",
              "BR-006",
              ValidationResult:SEVERITY_ERROR).
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF poContract:TotalPremium <= 0 THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                "The total premium must be greater than zero.",
                "TotalPremium").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
