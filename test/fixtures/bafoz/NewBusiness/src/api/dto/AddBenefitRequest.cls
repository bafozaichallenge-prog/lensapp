/*------------------------------------------------------------------------
    Class:    AddBenefitRequest
    Purpose:  DTO for POST /api/new-business/contracts/{id}/benefits
              (Section 31).
------------------------------------------------------------------------*/

USING Progress.Json.ObjectModel.JsonObject.

CLASS api.dto.AddBenefitRequest:

    DEFINE PUBLIC PROPERTY BenefitId AS CHARACTER NO-UNDO GET. SET.

    METHOD PUBLIC STATIC AddBenefitRequest FromJson (INPUT poJson AS JsonObject):
        DEFINE VARIABLE oRequest AS AddBenefitRequest NO-UNDO.
        oRequest = NEW AddBenefitRequest().
        IF poJson:Has("benefitId") THEN
            oRequest:BenefitId = poJson:GetCharacter("benefitId").
        RETURN oRequest.
    END METHOD.

END CLASS.
