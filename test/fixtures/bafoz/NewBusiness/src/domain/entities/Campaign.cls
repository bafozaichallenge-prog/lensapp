/*------------------------------------------------------------------------
    Class:    Campaign
    Purpose:  Represents a marketing campaign that a new contract is
              linked to (e.g. JANUARY2026, DIGITAL_CAMPAIGN). A contract
              may only ever link to ONE active campaign.

    Requirements:  BR-002 - Link Campaign, BRULE-001
    Edge Cases: "Campaign has expired", "Campaign has not started"
------------------------------------------------------------------------*/

USING domain.entities.AbstractDomainEntity.

CLASS domain.entities.Campaign INHERITS AbstractDomainEntity:

    DEFINE PUBLIC STATIC PROPERTY STATUS_ACTIVE  AS CHARACTER NO-UNDO INITIAL "ACTIVE"  GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_EXPIRED AS CHARACTER NO-UNDO INITIAL "EXPIRED" GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_PENDING AS CHARACTER NO-UNDO INITIAL "PENDING" GET.

    DEFINE PUBLIC PROPERTY CampaignId   AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CampaignCode AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CampaignName AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY StartDate    AS DATE      NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY EndDate      AS DATE      NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Status       AS CHARACTER NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC Campaign ( ):
        SUPER ().
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE CHARACTER GetEntityName ( ):
        RETURN "Campaign".
    END METHOD.

    METHOD PUBLIC VOID Create
        ( INPUT pcCampaignId   AS CHARACTER,
          INPUT pcCampaignCode AS CHARACTER,
          INPUT pcCampaignName AS CHARACTER,
          INPUT pdStartDate    AS DATE,
          INPUT pdEndDate      AS DATE,
          INPUT pcStatus       AS CHARACTER,
          INPUT pcUserId       AS CHARACTER ):

        CampaignId   = pcCampaignId.
        CampaignCode = pcCampaignCode.
        CampaignName = pcCampaignName.
        StartDate    = pdStartDate.
        EndDate      = pdEndDate.
        Status       = pcStatus.
        THIS-OBJECT:StampCreated(pcUserId).
    END METHOD.

    /* A campaign is usable on a new contract only when its own Status
       flag is ACTIVE *and* today falls within its start/end window -
       Edge Cases: "Campaign has expired", "Campaign has not started". */
    METHOD PUBLIC LOGICAL IsActive ( ):
        IF Status <> STATUS_ACTIVE THEN
            RETURN FALSE.
        IF StartDate <> ? AND TODAY < StartDate THEN
            RETURN FALSE.
        IF EndDate <> ? AND TODAY > EndDate THEN
            RETURN FALSE.
        RETURN TRUE.
    END METHOD.

    METHOD PUBLIC LOGICAL Validate (OUTPUT pcReason AS CHARACTER):
        IF CampaignId = "" OR CampaignId = ? THEN DO:
            pcReason = "Campaign identifier is required.".
            RETURN FALSE.
        END.
        IF NOT THIS-OBJECT:IsActive() THEN DO:
            IF Status = STATUS_EXPIRED OR (EndDate <> ? AND TODAY > EndDate) THEN
                pcReason = "Campaign has expired.".
            ELSE IF StartDate <> ? AND TODAY < StartDate THEN
                pcReason = "Campaign has not started yet.".
            ELSE
                pcReason = "Campaign is not active.".
            RETURN FALSE.
        END.
        pcReason = "".
        RETURN TRUE.
    END METHOD.

END CLASS.
