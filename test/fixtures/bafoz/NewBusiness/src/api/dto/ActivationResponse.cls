/*------------------------------------------------------------------------
    Class:    ActivationResponse
    Purpose:  DTO for POST /api/new-business/contracts/{id}/activate
              (Section 31).
------------------------------------------------------------------------*/

USING domain.entities.Contract.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.dto.ActivationResponse:

    DEFINE PUBLIC PROPERTY ContractId AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Status     AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Activated  AS LOGICAL   NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Message    AS CHARACTER NO-UNDO GET. SET.

    METHOD PUBLIC STATIC ActivationResponse FromContract (INPUT poContract AS Contract):
        DEFINE VARIABLE oResponse AS ActivationResponse NO-UNDO.
        oResponse = NEW ActivationResponse().
        oResponse:ContractId = poContract:ContractId.
        oResponse:Status     = poContract:Status.
        oResponse:Activated  = (poContract:Status = Contract:STATUS_IN_FORCE).
        oResponse:Message    = IF oResponse:Activated
            THEN "Contract successfully activated."
            ELSE "Contract failed new-business validation.".
        RETURN oResponse.
    END METHOD.

    METHOD PUBLIC JsonObject ToJsonObject ( ):
        DEFINE VARIABLE oJson AS JsonObject NO-UNDO.
        oJson = NEW JsonObject().
        oJson:Add("contractId", ContractId).
        oJson:Add("status", Status).
        IF NOT Activated THEN DO:
            oJson:Add("activated", Activated).
            oJson:Add("message", Message).
        END.
        RETURN oJson.
    END METHOD.

END CLASS.
