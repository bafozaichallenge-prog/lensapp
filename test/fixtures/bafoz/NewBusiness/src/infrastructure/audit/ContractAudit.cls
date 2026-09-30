/*------------------------------------------------------------------------
    Class:    ContractAudit
    Purpose:  Immutable record of a single auditable action taken
              against a contract during the new-business process.

    Requirements:  Section 37 - Audit Trail, Section 49 - Auditability

    Actions:
        CONTRACT_CREATED, CAMPAIGN_LINKED, PERSON_LINKED, BENEFIT_ADDED,
        COLLECTION_UPDATED, VALIDATION_EXECUTED, CONTRACT_ACTIVATED
------------------------------------------------------------------------*/

CLASS infrastructure.audit.ContractAudit:

    DEFINE PUBLIC PROPERTY AuditId    AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY ContractId AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Action     AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY OldValue   AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY NewValue   AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY UserId     AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Timestamp  AS DATETIME  NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC ContractAudit
        ( INPUT pcAuditId    AS CHARACTER,
          INPUT pcContractId AS CHARACTER,
          INPUT pcAction     AS CHARACTER,
          INPUT pcOldValue   AS CHARACTER,
          INPUT pcNewValue   AS CHARACTER,
          INPUT pcUserId     AS CHARACTER ):

        AuditId    = pcAuditId.
        ContractId = pcContractId.
        Action     = pcAction.
        OldValue   = pcOldValue.
        NewValue   = pcNewValue.
        UserId     = pcUserId.
        Timestamp  = NOW.
    END CONSTRUCTOR.

    METHOD PUBLIC Progress.Json.ObjectModel.JsonObject ToJsonObject ( ):
        DEFINE VARIABLE oJson AS Progress.Json.ObjectModel.JsonObject NO-UNDO.
        oJson = NEW Progress.Json.ObjectModel.JsonObject().
        oJson:Add("auditId", AuditId).
        oJson:Add("contractId", ContractId).
        oJson:Add("action", Action).
        oJson:Add("oldValue", OldValue).
        oJson:Add("newValue", NewValue).
        oJson:Add("userId", UserId).
        oJson:Add("timestamp", ISO-DATE(Timestamp)).
        RETURN oJson.
    END METHOD.

END CLASS.
