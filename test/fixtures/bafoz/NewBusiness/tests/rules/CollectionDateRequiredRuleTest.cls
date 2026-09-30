/*------------------------------------------------------------------------
    Test:     CollectionDateRequiredRuleTest
    Covers:   domain.rules.CollectionDateRequiredRule
    Requirement:  BR-005, NB-COLLECTION-002, BRULE-008
    Edge Cases: "Invalid collection day" - including the regression for
                recurring monthly methods using day 29-31, which cannot
                exist in February.
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.rules.CollectionDateRequiredRule.
USING domain.entities.Contract.
USING domain.entities.CollectionInstruction.
USING domain.validation.ValidationResult.

CLASS tests.rules.CollectionDateRequiredRuleTest:

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenNoCollectionInstructionSet ( ):
        DEFINE VARIABLE oRule     AS CollectionDateRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract                    NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult            NO-UNDO.

        oRule     = NEW CollectionDateRequiredRule().
        oContract = NEW Contract().
        oContract:Create("CON-TEST-050", "test").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Contract with no collection instruction should fail validation").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenCollectionDayIsZero ( ):
        DEFINE VARIABLE oRule        AS CollectionDateRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract                    NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction       NO-UNDO.
        DEFINE VARIABLE oResult      AS ValidationResult            NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-051", "test").

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create("CON-TEST-051", CollectionInstruction:METHOD_DEBIT_ORDER, 0, "123456", "001", "John Doe", "test").
        oContract:SetCollectionInstruction(oInstruction).

        oRule   = NEW CollectionDateRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Collection day 0 should fail validation").
    END METHOD.

    /* Regression for bugfix/collection-day-monthly-validity: a monthly
       DEBIT_ORDER on day 31 cannot run in February. */
    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenDebitOrderDayDoesNotExistEveryMonth ( ):
        DEFINE VARIABLE oRule        AS CollectionDateRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract                    NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction       NO-UNDO.
        DEFINE VARIABLE oResult      AS ValidationResult            NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-052", "test").

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create("CON-TEST-052", CollectionInstruction:METHOD_DEBIT_ORDER, 31, "123456", "001", "John Doe", "test").
        oContract:SetCollectionInstruction(oInstruction).

        oRule   = NEW CollectionDateRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "DEBIT_ORDER day 31 should fail - it does not exist in every month").
        Assert:Equals("NB-COLLECTION-002", oResult:RuleCode).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenDebitOrderDayIsWithinMonthlyRange ( ):
        DEFINE VARIABLE oRule        AS CollectionDateRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract                    NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction       NO-UNDO.
        DEFINE VARIABLE oResult      AS ValidationResult            NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-053", "test").

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create("CON-TEST-053", CollectionInstruction:METHOD_DEBIT_ORDER, 25, "123456", "001", "John Doe", "test").
        oContract:SetCollectionInstruction(oInstruction).

        oRule   = NEW CollectionDateRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "DEBIT_ORDER day 25 should pass validation").
    END METHOD.

    /* One-off methods keep the full 1-31 range - day 31 is legal for
       a single EFT collection. */
    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenEftDayIs31 ( ):
        DEFINE VARIABLE oRule        AS CollectionDateRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract    AS Contract                    NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction       NO-UNDO.
        DEFINE VARIABLE oResult      AS ValidationResult            NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-054", "test").

        oInstruction = NEW CollectionInstruction().
        oInstruction:Create("CON-TEST-054", CollectionInstruction:METHOD_EFT, 31, "123456", "001", "John Doe", "test").
        oContract:SetCollectionInstruction(oInstruction).

        oRule   = NEW CollectionDateRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "EFT day 31 should pass - EFT is not a recurring monthly method").
    END METHOD.

END CLASS.
