/*------------------------------------------------------------------------
    Class:    BenefitRepository
    Purpose:  IBenefitRepository implementation.

    Requirements:  Section 23, Section 32 (Benefit table)
------------------------------------------------------------------------*/

USING domain.interfaces.IBenefitRepository.
USING domain.entities.Benefit.
USING infrastructure.repositories.AbstractRepository.
USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.
USING OpenEdge.Core.Collections.ArrayList.
USING OpenEdge.Core.String.

CLASS infrastructure.repositories.BenefitRepository INHERITS AbstractRepository IMPLEMENTS IBenefitRepository:

    CONSTRUCTOR PUBLIC BenefitRepository (INPUT poLogger AS ILogger):
        SUPER("Benefit", poLogger).
    END CONSTRUCTOR.

    METHOD PUBLIC VOID Save (INPUT poBenefit AS Benefit):
        IF THIS-OBJECT:Exists(poBenefit:BenefitId) THEN
            UNDO, THROW NEW RepositoryException(
                SUBSTITUTE("Benefit &1 already exists.", poBenefit:BenefitId), "NB-REPO-409").

        moStore:Put(poBenefit:BenefitId, poBenefit).
        THIS-OBJECT:LogOperation("SAVE", poBenefit:BenefitId).
    END METHOD.

    METHOD PUBLIC VOID Update (INPUT poBenefit AS Benefit):
        THIS-OBJECT:GuardExists(poBenefit:BenefitId).
        moStore:Put(poBenefit:BenefitId, poBenefit).
        THIS-OBJECT:LogOperation("UPDATE", poBenefit:BenefitId).
    END METHOD.

    METHOD PUBLIC Benefit GetById (INPUT pcBenefitId AS CHARACTER):
        THIS-OBJECT:GuardExists(pcBenefitId).
        RETURN CAST(moStore:Get(pcBenefitId), Benefit).
    END METHOD.

    METHOD PUBLIC Benefit GetByCode (INPUT pcBenefitCode AS CHARACTER):
        DEFINE VARIABLE oKeys    AS ArrayList NO-UNDO.
        DEFINE VARIABLE oBenefit AS Benefit   NO-UNDO.
        DEFINE VARIABLE i        AS INTEGER   NO-UNDO.

        oKeys = moStore:Keys.
        DO i = 1 TO oKeys:Size:
            oBenefit = CAST(moStore:Get(CAST(oKeys:Get(i), String):Value), Benefit).
            IF oBenefit:BenefitCode = pcBenefitCode THEN
                RETURN oBenefit.
        END.

        UNDO, THROW NEW RepositoryException(
            SUBSTITUTE("Benefit with code &1 was not found.", pcBenefitCode), "NB-REPO-404").
    END METHOD.

END CLASS.
