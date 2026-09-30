/*------------------------------------------------------------------------
    Test:     CampaignRequiredRuleTest
    Covers:   domain.rules.CampaignRequiredRule
    Requirement:  BR-002, NB-CAMPAIGN-001
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.rules.CampaignRequiredRule.
USING domain.entities.Contract.
USING domain.entities.Campaign.
USING domain.validation.ValidationResult.
USING infrastructure.repositories.CampaignRepository.

CLASS tests.rules.CampaignRequiredRuleTest:

    METHOD PRIVATE CampaignRepository BuildRepositoryWithCampaign (INPUT pcId AS CHARACTER, INPUT pcStatus AS CHARACTER, INPUT pdStart AS DATE, INPUT pdEnd AS DATE):
        DEFINE VARIABLE oRepo     AS CampaignRepository NO-UNDO.
        DEFINE VARIABLE oCampaign AS Campaign            NO-UNDO.

        oRepo     = NEW CampaignRepository(?).
        oCampaign = NEW Campaign().
        oCampaign:Create(pcId, pcId, "Test Campaign", pdStart, pdEnd, pcStatus, "test").
        oRepo:Save(oCampaign).
        RETURN oRepo.
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenCampaignIdIsBlank ( ):
        DEFINE VARIABLE oRule     AS CampaignRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oRule     = NEW CampaignRequiredRule(NEW CampaignRepository(?)).
        oContract = NEW Contract().
        oContract:Create("CON-TEST-001", "test").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Contract with no campaign should fail validation").
        Assert:Equals("NB-CAMPAIGN-001", oResult:RuleCode).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Fails_WhenCampaignHasExpired ( ):
        DEFINE VARIABLE oRepo     AS CampaignRepository   NO-UNDO.
        DEFINE VARIABLE oRule     AS CampaignRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oRepo = THIS-OBJECT:BuildRepositoryWithCampaign("CAM004", Campaign:STATUS_EXPIRED, 01/01/2020, 12/31/2020).
        oRule = NEW CampaignRequiredRule(oRepo).

        oContract = NEW Contract().
        oContract:Create("CON-TEST-002", "test").
        oContract:AssignCampaign("CAM004").

        oResult = oRule:Evaluate(oContract).

        Assert:IsFalse(oResult:IsValid, "Expired campaign should fail validation").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Evaluate_Passes_WhenCampaignIsActive ( ):
        DEFINE VARIABLE oRepo     AS CampaignRepository   NO-UNDO.
        DEFINE VARIABLE oRule     AS CampaignRequiredRule NO-UNDO.
        DEFINE VARIABLE oContract AS Contract              NO-UNDO.
        DEFINE VARIABLE oResult   AS ValidationResult      NO-UNDO.

        oRepo = THIS-OBJECT:BuildRepositoryWithCampaign("CAM001", Campaign:STATUS_ACTIVE, TODAY - 10, TODAY + 10).
        oRule = NEW CampaignRequiredRule(oRepo).

        oContract = NEW Contract().
        oContract:Create("CON-TEST-003", "test").
        oContract:AssignCampaign("CAM001").

        oResult = oRule:Evaluate(oContract).

        Assert:IsTrue(oResult:IsValid, "Active, in-window campaign should pass validation").
    END METHOD.

END CLASS.
