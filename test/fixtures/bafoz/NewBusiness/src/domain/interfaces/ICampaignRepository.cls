USING domain.entities.Campaign.
USING domain.interfaces.IRepository.

INTERFACE domain.interfaces.ICampaignRepository INHERITS IRepository:

    METHOD PUBLIC VOID Save (INPUT poCampaign AS Campaign).

    METHOD PUBLIC VOID Update (INPUT poCampaign AS Campaign).

    METHOD PUBLIC Campaign GetById (INPUT pcCampaignId AS CHARACTER).

    METHOD PUBLIC Campaign GetByCode (INPUT pcCampaignCode AS CHARACTER).

END INTERFACE.
