/*------------------------------------------------------------------------
    Test:     CollectionMethodRequiredRuleTest
    Covers:   domain.rules.CollectionMethodRequiredRule
    Requirement:  BR-005, NB-COLLECTION-001
    Edge Case: "Unsupported collection method"
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.rules.CollectionMethodRequiredRule.
USING domain.entities.Contract.
USING domain.entities.CollectionInstruction.
USING domain.validation.ValidationResult.

CLASS tests.rules.CollectionMethodRequiredRuleTest:

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenNoCollectionInstructionSet ( ):
        DEFINE VARIABLE oRule     AS CollectionMethodRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract                      NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult              NO-UNDO.

        oRule     = NEW CollectionMethodRequiredRule().
        oContract = NEW Contract().
        oContract:Create("CON-TEST-030", "test").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Contract with no collection instruction should fail validation").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenCollectionMethodIsUnsupported ( ):
        DEFINE VARIABLE oRule        AS CollectionMethodRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract                      NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction         NO-UNDO.
        DEFINE VARIABLE oResult      AS ValidationResult              NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-031", "test").

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create("CON-TEST-031", "BITCOIN", 25, "", "", "", "test").
        oContract:SetCollectionInstruction(oInstruction).

        oRule   = NEW CollectionMethodRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Unsupported collection method should fail validation").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenCollectionMethodIsDebitOrder ( ):
        DEFINE VARIABLE oRule        AS CollectionMethodRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract                      NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction         NO-UNDO.
        DEFINE VARIABLE oResult      AS ValidationResult              NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-032", "test").

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create("CON-TEST-032", CollectionInstruction:METHOD_DEBIT_ORDER, 25, "123456", "001", "John Doe", "test").
        oContract:SetCollectionInstruction(oInstruction).

        oRule   = NEW CollectionMethodRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "DEBIT_ORDER should pass validation").
    END METHOD.

END CLASS.
