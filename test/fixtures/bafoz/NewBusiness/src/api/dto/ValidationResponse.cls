/*------------------------------------------------------------------------
    Class:    ValidationResponse
    Purpose:  DTO for POST /api/new-business/contracts/{id}/validate
              (Section 31).
------------------------------------------------------------------------*/

USING domain.validation.ValidationSummary.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.dto.ValidationResponse:

    DEFINE PUBLIC PROPERTY Valid   AS LOGICAL           NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Summary AS ValidationSummary NO-UNDO GET. SET.

    METHOD PUBLIC STATIC ValidationResponse FromSummary (INPUT poSummary AS ValidationSummary):
        DEFINE VARIABLE oResponse AS ValidationResponse NO-UNDO.
        oResponse = NEW ValidationResponse().
        oResponse:Valid   = poSummary:IsValid().
        oResponse:Summary = poSummary.
        RETURN oResponse.
    END METHOD.

    METHOD PUBLIC JsonObject ToJsonObject ( ):
        DEFINE VARIABLE oJson AS JsonObject NO-UNDO.
        oJson = NEW JsonObject().
        oJson:Add("valid", Valid).
        oJson:Add("results", Summary:ToJsonArray()).
        RETURN oJson.
    END METHOD.

END CLASS.
