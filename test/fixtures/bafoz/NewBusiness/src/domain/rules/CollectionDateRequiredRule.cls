/*------------------------------------------------------------------------
    Rule:          CollectionDateRequiredRule
    Rule Code:     NB-COLLECTION-002
    Requirement:   BR-005 / BRULE-007 / BRULE-008
    Description:   The contract must have a valid collection day (1-31,
                   1-28 for recurring monthly methods)
                   - Edge Case: "Invalid collection day".
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.CollectionDateRequiredRule INHERITS AbstractBusinessRule:

    CONSTRUCTOR PUBLIC CollectionDateRequiredRule ( ):
        SUPER("NB-COLLECTION-002",
              "The contract must have a valid collection day.",
              "BR-005",
              ValidationResult:SEVERITY_ERROR).
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF NOT VALID-OBJECT(poContract:CollectionInstructionRef) THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                "The contract must have a collection date/day.",
                "CollectionDay").

        IF NOT poContract:CollectionInstructionRef:IsValidCollectionDay() THEN DO:
            IF poContract:CollectionInstructionRef:IsRecurringMonthly() THEN
                RETURN THIS-OBJECT:CreateFailureResult(
                    "Collection day must be between 1 and 28 for monthly debit-order/payroll collections.",
                    "CollectionDay").
            RETURN THIS-OBJECT:CreateFailureResult(
                "Collection day must be between 1 and 31.",
                "CollectionDay").
        END.

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
