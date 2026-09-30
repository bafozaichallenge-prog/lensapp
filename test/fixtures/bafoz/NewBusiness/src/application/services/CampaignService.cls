/*------------------------------------------------------------------------
    Class:    CampaignService
    Purpose:  Read-side application service for campaign lookups. Actual
              "may this contract use this campaign" logic belongs to
              Campaign.cls / CampaignRequiredRule.cls.

    Requirements:  Section 25 - Service Layer, BR-002
------------------------------------------------------------------------*/

USING domain.interfaces.ICampaignService.
USING domain.interfaces.ICampaignRepository.
USING domain.entities.Campaign.

CLASS application.services.CampaignService IMPLEMENTS ICampaignService:

    DEFINE PRIVATE VARIABLE moCampaignRepository AS ICampaignRepository NO-UNDO.

    CONSTRUCTOR PUBLIC CampaignService (INPUT poCampaignRepository AS ICampaignRepository):
        moCampaignRepository = poCampaignRepository.
    END CONSTRUCTOR.

    METHOD PUBLIC Campaign GetCampaign (INPUT pcCampaignId AS CHARACTER):
        RETURN moCampaignRepository:GetById(pcCampaignId).
    END METHOD.

    METHOD PUBLIC Campaign GetCampaignByCode (INPUT pcCampaignCode AS CHARACTER):
        RETURN moCampaignRepository:GetByCode(pcCampaignCode).
    END METHOD.

END CLASS.
