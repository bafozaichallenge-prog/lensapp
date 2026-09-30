/*------------------------------------------------------------------------
    Test Double: FakeContractValidator
    Purpose:  A trivial IContractValidator stub that always returns a
              caller-supplied ValidationSummary, so Contract.Activate()
              can be unit-tested in isolation from the real rule
              registry (Section 40 - Testing Architecture).
------------------------------------------------------------------------*/

USING domain.interfaces.IContractValidator.
USING domain.entities.Contract.
USING domain.validation.ValidationSummary.
USING domain.validation.ValidationResult.

CLASS tests.domain.FakeContractValidator IMPLEMENTS IContractValidator:

    DEFINE PUBLIC PROPERTY ShouldPass AS LOGICAL NO-UNDO INITIAL TRUE GET. SET.

    METHOD PUBLIC ValidationSummary ValidateContract (INPUT poContract AS Contract):
        DEFINE VARIABLE oSummary AS ValidationSummary NO-UNDO.
        oSummary = NEW ValidationSummary().

        IF ShouldPass THEN
            oSummary:AddResult(NEW ValidationResult(TRUE, "NB-FAKE-001", ValidationResult:SEVERITY_INFO, "OK", "")).
        ELSE
            oSummary:AddResult(NEW ValidationResult(FALSE, "NB-FAKE-001", ValidationResult:SEVERITY_ERROR, "Forced failure", "Test")).

        RETURN oSummary.
    END METHOD.

END CLASS.
