/*------------------------------------------------------------------------
    Class:    AuditService
    Purpose:  Default IAuditService implementation. Appends
              ContractAudit records to an in-memory trail keyed by
              contract id (mirrors the ContractAudit table described in
              the schema - see database/schema/newbusiness.df).

    Requirements:  Section 37 - Audit Trail, Section 49 - Auditability
------------------------------------------------------------------------*/

USING infrastructure.audit.IAuditService.
USING infrastructure.audit.ContractAudit.
USING infrastructure.logging.ILogger.
USING OpenEdge.Core.Collections.ArrayList.

CLASS infrastructure.audit.AuditService IMPLEMENTS IAuditService:

    DEFINE PUBLIC STATIC PROPERTY ACTION_CONTRACT_CREATED     AS CHARACTER NO-UNDO INITIAL "CONTRACT_CREATED"     GET.
    DEFINE PUBLIC STATIC PROPERTY ACTION_CAMPAIGN_LINKED       AS CHARACTER NO-UNDO INITIAL "CAMPAIGN_LINKED"      GET.
    DEFINE PUBLIC STATIC PROPERTY ACTION_PERSON_LINKED          AS CHARACTER NO-UNDO INITIAL "PERSON_LINKED"        GET.
    DEFINE PUBLIC STATIC PROPERTY ACTION_BENEFIT_ADDED            AS CHARACTER NO-UNDO INITIAL "BENEFIT_ADDED"        GET.
    DEFINE PUBLIC STATIC PROPERTY ACTION_COLLECTION_UPDATED         AS CHARACTER NO-UNDO INITIAL "COLLECTION_UPDATED"  GET.
    DEFINE PUBLIC STATIC PROPERTY ACTION_VALIDATION_EXECUTED          AS CHARACTER NO-UNDO INITIAL "VALIDATION_EXECUTED" GET.
    DEFINE PUBLIC STATIC PROPERTY ACTION_CONTRACT_ACTIVATED              AS CHARACTER NO-UNDO INITIAL "CONTRACT_ACTIVATED" GET.

    DEFINE PRIVATE VARIABLE moTrail       AS ArrayList NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger      AS ILogger   NO-UNDO.
    DEFINE PRIVATE VARIABLE miNextAuditId AS INTEGER   NO-UNDO INITIAL 0.

    CONSTRUCTOR PUBLIC AuditService (INPUT poLogger AS ILogger):
        moTrail  = NEW ArrayList().
        moLogger = poLogger.
    END CONSTRUCTOR.

    METHOD PUBLIC VOID RecordAction
        ( INPUT pcContractId AS CHARACTER,
          INPUT pcAction     AS CHARACTER,
          INPUT pcOldValue   AS CHARACTER,
          INPUT pcNewValue   AS CHARACTER,
          INPUT pcUserId     AS CHARACTER ):

        DEFINE VARIABLE oAudit AS ContractAudit NO-UNDO.

        miNextAuditId = miNextAuditId + 1.
        oAudit = NEW ContractAudit(
            SUBSTITUTE("AUD-&1", STRING(miNextAuditId, "999999")),
            pcContractId, pcAction, pcOldValue, pcNewValue, pcUserId).

        moTrail:Add(oAudit).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("AuditService", SUBSTITUTE("&1 &2 by &3", pcContractId, pcAction, pcUserId)).
    END METHOD.

    METHOD PUBLIC ArrayList GetAuditTrail (INPUT pcContractId AS CHARACTER):
        DEFINE VARIABLE oResult AS ArrayList     NO-UNDO.
        DEFINE VARIABLE oAudit  AS ContractAudit NO-UNDO.
        DEFINE VARIABLE i       AS INTEGER       NO-UNDO.

        oResult = NEW ArrayList().
        DO i = 1 TO moTrail:Size:
            oAudit = CAST(moTrail:Get(i), ContractAudit).
            IF oAudit:ContractId = pcContractId THEN
                oResult:Add(oAudit).
        END.
        RETURN oResult.
    END METHOD.

END CLASS.
