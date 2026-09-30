/*------------------------------------------------------------------------
    Test:     PremiumPositiveRuleTest
    Covers:   domain.rules.PremiumPositiveRule
    Requirement:  BR-006, NB-PREMIUM-001
    Edge Cases: "Zero premium", "Negative premium"
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.rules.PremiumPositiveRule.
USING domain.entities.Contract.
USING domain.entities.Benefit.
USING domain.entities.ContractBenefit.
USING domain.validation.ValidationResult.

CLASS tests.rules.PremiumPositiveRuleTest:

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenTotalPremiumIsZero ( ):
        DEFINE VARIABLE oRule     AS PremiumPositiveRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oRule     = NEW PremiumPositiveRule().
        oContract = NEW Contract().
        oContract:Create("CON-TEST-040", "test").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Zero premium should fail validation").
        Assert:Equals("NB-PREMIUM-001", oResult:RuleCode).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenTotalPremiumIsPositive ( ):
        DEFINE VARIABLE oRule     AS PremiumPositiveRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oBenefit  AS Benefit                NO-UNDO.
        DEFINE VARIABLE oCB       AS ContractBenefit         NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-041", "test").

        oBenefit = NEW Benefit().
        oBenefit:Create("BEN001", "LIFE", "Life Cover", "desc", 250, Benefit:STATUS_ACTIVE, "test").

        oCB = NEW ContractBenefit().
        oCB:Create("CON-TEST-041", oBenefit, TODAY, "test").
        oContract:AddBenefit(oCB).

        oRule   = NEW PremiumPositiveRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "Positive premium should pass validation").
    END METHOD.

END CLASS.
