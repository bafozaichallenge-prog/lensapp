USING domain.entities.Campaign.

INTERFACE domain.interfaces.ICampaignService:

    METHOD PUBLIC Campaign GetCampaign (INPUT pcCampaignId AS CHARACTER).

    METHOD PUBLIC Campaign GetCampaignByCode (INPUT pcCampaignCode AS CHARACTER).

END INTERFACE.
