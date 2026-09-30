/*------------------------------------------------------------------------
    Test:     ContractOwnerRequiredRuleTest
    Covers:   domain.rules.ContractOwnerRequiredRule
    Requirement:  BR-003, NB-PERSON-001
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.rules.ContractOwnerRequiredRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS tests.rules.ContractOwnerRequiredRuleTest:

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenNoOwnerAssigned ( ):
        DEFINE VARIABLE oRule     AS ContractOwnerRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract                   NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult           NO-UNDO.

        oRule     = NEW ContractOwnerRequiredRule().
        oContract = NEW Contract().
        oContract:Create("CON-TEST-010", "test").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Contract with no owner should fail validation").
        Assert:Equals("NB-PERSON-001", oResult:RuleCode).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenOwnerAssigned ( ):
        DEFINE VARIABLE oRule     AS ContractOwnerRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract                   NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult           NO-UNDO.

        oRule     = NEW ContractOwnerRequiredRule().
        oContract = NEW Contract().
        oContract:Create("CON-TEST-011", "test").
        oContract:AssignOwner("PER-000001").

        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "Contract with an owner should pass validation").
    END METHOD.

END CLASS.
