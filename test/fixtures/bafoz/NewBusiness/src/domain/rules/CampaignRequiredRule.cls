/*------------------------------------------------------------------------
    Rule:          CampaignRequiredRule
    Rule Code:     NB-CAMPAIGN-001
    Requirement:   BR-002 / BRULE-001
    Description:   A campaign must be linked before activation, and the
                   linked campaign must actually be active (not expired,
                   not yet started) - Edge Cases: "Campaign has expired",
                   "Campaign has not started".
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.entities.Campaign.
USING domain.interfaces.ICampaignRepository.
USING domain.validation.ValidationResult.

CLASS domain.rules.CampaignRequiredRule INHERITS AbstractBusinessRule:

    DEFINE PRIVATE VARIABLE moCampaignRepository AS ICampaignRepository NO-UNDO.

    CONSTRUCTOR PUBLIC CampaignRequiredRule (INPUT poCampaignRepository AS ICampaignRepository):
        SUPER("NB-CAMPAIGN-001",
              "A campaign must be linked before the contract can be activated.",
              "BR-002",
              ValidationResult:SEVERITY_ERROR).
        moCampaignRepository = poCampaignRepository.
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        DEFINE VARIABLE oCampaign AS Campaign   NO-UNDO.
        DEFINE VARIABLE cReason   AS CHARACTER  NO-UNDO.

        IF poContract:CampaignId = "" OR poContract:CampaignId = ? THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                "A campaign must be linked before the contract can be activated.",
                "CampaignId").

        IF NOT moCampaignRepository:Exists(poContract:CampaignId) THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                SUBSTITUTE("Campaign &1 does not exist.", poContract:CampaignId),
                "CampaignId").

        oCampaign = moCampaignRepository:GetById(poContract:CampaignId).
        IF NOT oCampaign:Validate(OUTPUT cReason) THEN
            RETURN THIS-OBJECT:CreateFailureResult(cReason, "CampaignId").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
