/*------------------------------------------------------------------------
    Class:    CampaignController
    Purpose:  Read-side endpoint for campaign lookups. Section 29 - API
              Layer.
------------------------------------------------------------------------*/

USING domain.interfaces.ICampaignService.
USING domain.entities.Campaign.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.controllers.CampaignController:

    DEFINE PRIVATE VARIABLE moCampaignService AS ICampaignService NO-UNDO.

    CONSTRUCTOR PUBLIC CampaignController (INPUT poCampaignService AS ICampaignService):
        moCampaignService = poCampaignService.
    END CONSTRUCTOR.

    /* GET /api/campaigns/{campaignId} */
    METHOD PUBLIC JsonObject GetCampaign (INPUT pcCampaignId AS CHARACTER):
        DEFINE VARIABLE oCampaign AS Campaign    NO-UNDO.
        DEFINE VARIABLE oJson     AS JsonObject  NO-UNDO.

        oCampaign = moCampaignService:GetCampaign(pcCampaignId).

        oJson = NEW JsonObject().
        oJson:Add("campaignId", oCampaign:CampaignId).
        oJson:Add("campaignCode", oCampaign:CampaignCode).
        oJson:Add("campaignName", oCampaign:CampaignName).
        oJson:Add("status", oCampaign:Status).
        oJson:Add("active", oCampaign:IsActive()).
        RETURN oJson.
    END METHOD.

END CLASS.
