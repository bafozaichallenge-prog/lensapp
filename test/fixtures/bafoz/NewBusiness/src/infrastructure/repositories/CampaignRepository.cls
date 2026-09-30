/*------------------------------------------------------------------------
    Class:    CampaignRepository
    Purpose:  ICampaignRepository implementation.

    Requirements:  Section 23, Section 32 (Campaign table)
------------------------------------------------------------------------*/

USING domain.interfaces.ICampaignRepository.
USING domain.entities.Campaign.
USING infrastructure.repositories.AbstractRepository.
USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.
USING OpenEdge.Core.Collections.ArrayList.
USING OpenEdge.Core.String.

CLASS infrastructure.repositories.CampaignRepository INHERITS AbstractRepository IMPLEMENTS ICampaignRepository:

    CONSTRUCTOR PUBLIC CampaignRepository (INPUT poLogger AS ILogger):
        SUPER("Campaign", poLogger).
    END CONSTRUCTOR.

    METHOD PUBLIC VOID Save (INPUT poCampaign AS Campaign):
        IF THIS-OBJECT:Exists(poCampaign:CampaignId) THEN
            UNDO, THROW NEW RepositoryException(
                SUBSTITUTE("Campaign &1 already exists.", poCampaign:CampaignId), "NB-REPO-409").

        moStore:Put(poCampaign:CampaignId, poCampaign).
        THIS-OBJECT:LogOperation("SAVE", poCampaign:CampaignId).
    END METHOD.

    METHOD PUBLIC VOID Update (INPUT poCampaign AS Campaign):
        THIS-OBJECT:GuardExists(poCampaign:CampaignId).
        moStore:Put(poCampaign:CampaignId, poCampaign).
        THIS-OBJECT:LogOperation("UPDATE", poCampaign:CampaignId).
    END METHOD.

    METHOD PUBLIC Campaign GetById (INPUT pcCampaignId AS CHARACTER):
        THIS-OBJECT:GuardExists(pcCampaignId).
        RETURN CAST(moStore:Get(pcCampaignId), Campaign).
    END METHOD.

    METHOD PUBLIC Campaign GetByCode (INPUT pcCampaignCode AS CHARACTER):
        DEFINE VARIABLE oKeys     AS ArrayList NO-UNDO.
        DEFINE VARIABLE oCampaign AS Campaign  NO-UNDO.
        DEFINE VARIABLE i         AS INTEGER   NO-UNDO.

        oKeys = moStore:Keys.
        DO i = 1 TO oKeys:Size:
            oCampaign = CAST(moStore:Get(CAST(oKeys:Get(i), String):Value), Campaign).
            IF oCampaign:CampaignCode = pcCampaignCode THEN
                RETURN oCampaign.
        END.

        UNDO, THROW NEW RepositoryException(
            SUBSTITUTE("Campaign with code &1 was not found.", pcCampaignCode), "NB-REPO-404").
    END METHOD.

END CLASS.
