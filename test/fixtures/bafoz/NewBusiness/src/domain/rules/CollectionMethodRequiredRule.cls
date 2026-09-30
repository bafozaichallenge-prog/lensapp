/*------------------------------------------------------------------------
    Rule:          CollectionMethodRequiredRule
    Rule Code:     NB-COLLECTION-001
    Requirement:   BR-005 / BRULE-006
    Description:   The contract must have a valid, supported collection
                   method - Edge Case: "Unsupported collection method".
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.CollectionMethodRequiredRule INHERITS AbstractBusinessRule:

    CONSTRUCTOR PUBLIC CollectionMethodRequiredRule ( ):
        SUPER("NB-COLLECTION-001",
              "The contract must have a valid collection method.",
              "BR-005",
              ValidationResult:SEVERITY_ERROR).
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF NOT VALID-OBJECT(poContract:CollectionInstructionRef) THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                "The contract must have a collection method.",
                "CollectionMethod").

        IF NOT poContract:CollectionInstructionRef:IsValidCollectionMethod() THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                SUBSTITUTE("Collection method &1 is not supported.", poContract:CollectionInstructionRef:CollectionMethod),
                "CollectionMethod").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
