/*------------------------------------------------------------------------
    Test:     BenefitRequiredRuleTest
    Covers:   domain.rules.BenefitRequiredRule
    Requirement:  BR-004, NB-BENEFIT-001
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.rules.BenefitRequiredRule.
USING domain.entities.Contract.
USING domain.entities.Benefit.
USING domain.entities.ContractBenefit.
USING domain.validation.ValidationResult.

CLASS tests.rules.BenefitRequiredRuleTest:

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenNoBenefitsSelected ( ):
        DEFINE VARIABLE oRule     AS BenefitRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oRule     = NEW BenefitRequiredRule().
        oContract = NEW Contract().
        oContract:Create("CON-TEST-020", "test").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Contract with zero benefits should fail validation").
        Assert:Equals("NB-BENEFIT-001", oResult:RuleCode).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenAtLeastOneBenefitSelected ( ):
        DEFINE VARIABLE oRule     AS BenefitRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oBenefit  AS Benefit                NO-UNDO.
        DEFINE VARIABLE oCB       AS ContractBenefit         NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-TEST-021", "test").

        oBenefit = NEW Benefit().
        oBenefit:Create("BEN001", "LIFE", "Life Cover", "desc", 250, Benefit:STATUS_ACTIVE, "test").

        oCB = NEW ContractBenefit().
        oCB:Create("CON-TEST-021", oBenefit, TODAY, "test").
        oContract:AddBenefit(oCB).

        oRule   = NEW BenefitRequiredRule().
        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "Contract with a benefit should pass validation").
    END METHOD.

END CLASS.
