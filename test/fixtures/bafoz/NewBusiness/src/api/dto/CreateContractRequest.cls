/*------------------------------------------------------------------------
    Class:    CreateContractRequest
    Purpose:  DTO for POST /api/new-business/contracts (Section 31).
              CampaignId is optional at creation time - a contract can
              be created first and linked to a campaign in a later step.
------------------------------------------------------------------------*/

USING Progress.Json.ObjectModel.JsonObject.

CLASS api.dto.CreateContractRequest:

    DEFINE PUBLIC PROPERTY CampaignId AS CHARACTER NO-UNDO GET. SET.

    METHOD PUBLIC STATIC CreateContractRequest FromJson (INPUT poJson AS JsonObject):
        DEFINE VARIABLE oRequest AS CreateContractRequest NO-UNDO.
        oRequest = NEW CreateContractRequest().
        IF poJson:Has("campaignId") THEN
            oRequest:CampaignId = poJson:GetCharacter("campaignId").
        RETURN oRequest.
    END METHOD.

END CLASS.
