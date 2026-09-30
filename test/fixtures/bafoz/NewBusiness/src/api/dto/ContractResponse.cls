/*------------------------------------------------------------------------
    Class:    ContractResponse
    Purpose:  DTO returned by every contract-related endpoint. Maps a
              Contract aggregate to JSON without ever exposing the
              domain object itself (Section 30 - DTO Layer) and without
              leaking full collection account details (Section 13).
------------------------------------------------------------------------*/

USING domain.entities.Contract.
USING domain.entities.ContractBenefit.
USING Progress.Json.ObjectModel.JsonObject.
USING Progress.Json.ObjectModel.JsonArray.
USING OpenEdge.Core.Collections.ArrayList.

CLASS api.dto.ContractResponse:

    DEFINE PUBLIC PROPERTY ContractId    AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Status        AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY CampaignId    AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY OwnerPersonId AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY TotalPremium  AS DECIMAL   NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY BenefitCodes  AS CHARACTER NO-UNDO GET. SET. /* comma-separated */

    METHOD PUBLIC STATIC ContractResponse FromContract (INPUT poContract AS Contract):
        DEFINE VARIABLE oResponse AS ContractResponse NO-UNDO.
        DEFINE VARIABLE oBenefits AS ArrayList         NO-UNDO.
        DEFINE VARIABLE cCodes    AS CHARACTER         NO-UNDO INITIAL "".
        DEFINE VARIABLE i         AS INTEGER           NO-UNDO.

        oResponse = NEW ContractResponse().
        oResponse:ContractId    = poContract:ContractId.
        oResponse:Status        = poContract:Status.
        oResponse:CampaignId    = poContract:CampaignId.
        oResponse:OwnerPersonId = poContract:OwnerPersonId.
        oResponse:TotalPremium  = poContract:TotalPremium.

        oBenefits = poContract:GetBenefits().
        DO i = 1 TO oBenefits:Size:
            cCodes = cCodes + CAST(oBenefits:Get(i), ContractBenefit):BenefitCode + ",".
        END.
        oResponse:BenefitCodes = TRIM(cCodes, ",").

        RETURN oResponse.
    END METHOD.

    METHOD PUBLIC JsonObject ToJsonObject ( ):
        DEFINE VARIABLE oJson     AS JsonObject NO-UNDO.
        DEFINE VARIABLE oBenArray AS JsonArray  NO-UNDO.
        DEFINE VARIABLE cCode     AS CHARACTER  NO-UNDO.
        DEFINE VARIABLE i         AS INTEGER    NO-UNDO.

        oJson = NEW JsonObject().
        oJson:Add("contractId", ContractId).
        oJson:Add("status", Status).
        oJson:Add("campaignId", CampaignId).
        oJson:Add("ownerPersonId", OwnerPersonId).
        oJson:Add("totalPremium", TotalPremium).

        oBenArray = NEW JsonArray().
        DO i = 1 TO NUM-ENTRIES(BenefitCodes):
            cCode = ENTRY(i, BenefitCodes).
            IF cCode <> "" THEN
                oBenArray:Add(cCode).
        END.
        oJson:Add("benefits", oBenArray).

        RETURN oJson.
    END METHOD.

END CLASS.
