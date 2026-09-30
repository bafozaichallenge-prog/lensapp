/*------------------------------------------------------------------------
    Class:    AbstractRepository
    Purpose:  Shared repository plumbing - in-memory record store,
              transaction-style save semantics, consistent error
              wrapping and logging - so concrete repositories only
              implement entity-specific mapping.

              This mock application persists via an in-process key/value
              store (OpenEdge.Core.Collections map) that mirrors the
              persistent tables described in database/schema/*.df. A
              production deployment would swap the store's Get/Put/
              Remove implementation for real buffer/FOR EACH access
              against those tables without changing any calling code,
              because callers only ever depend on the I*Repository
              interfaces (Section 39 - Dependency Inversion).

    Requirements:  Section 24 - Abstract Repository
------------------------------------------------------------------------*/

USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.
USING OpenEdge.Core.Collections.CaseSensitiveStringKeyedMap.

CLASS infrastructure.repositories.AbstractRepository ABSTRACT:

    DEFINE PROTECTED PROPERTY EntityName AS CHARACTER NO-UNDO GET. PROTECTED SET.

    DEFINE PROTECTED VARIABLE moStore  AS CaseSensitiveStringKeyedMap NO-UNDO.
    DEFINE PROTECTED VARIABLE moLogger AS ILogger NO-UNDO.

    CONSTRUCTOR PROTECTED AbstractRepository (INPUT pcEntityName AS CHARACTER, INPUT poLogger AS ILogger):
        EntityName = pcEntityName.
        moLogger   = poLogger.
        moStore    = NEW CaseSensitiveStringKeyedMap().
    END CONSTRUCTOR.

    METHOD PUBLIC LOGICAL Exists (INPUT pcId AS CHARACTER):
        IF pcId = "" OR pcId = ? THEN
            RETURN FALSE.
        RETURN moStore:ContainsKey(pcId).
    END METHOD.

    METHOD PUBLIC LOGICAL Delete (INPUT pcId AS CHARACTER):
        IF NOT THIS-OBJECT:Exists(pcId) THEN
            RETURN FALSE.
        moStore:Remove(pcId).
        THIS-OBJECT:LogOperation("DELETE", pcId).
        RETURN TRUE.
    END METHOD.

    METHOD PROTECTED INTEGER Count ( ):
        RETURN moStore:Size.
    END METHOD.

    /* Raises a consistent RepositoryException when a GetById()-style
       lookup misses - keeps "not found" handling identical across every
       concrete repository. */
    METHOD PROTECTED VOID GuardExists (INPUT pcId AS CHARACTER):
        IF NOT THIS-OBJECT:Exists(pcId) THEN
            UNDO, THROW NEW RepositoryException(
                SUBSTITUTE("&1 &2 was not found.", EntityName, pcId),
                "NB-REPO-404").
    END METHOD.

    METHOD PROTECTED VOID LogOperation (INPUT pcOperation AS CHARACTER, INPUT pcId AS CHARACTER):
        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo(SUBSTITUTE("&1Repository", EntityName), SUBSTITUTE("&1 &2", pcOperation, pcId)).
    END METHOD.

    /* Wraps an unexpected lower-level error (e.g. a simulated database
       failure) into a RepositoryException so callers only ever have to
       catch application-level exceptions - Edge Case: "Database failure
       during activation". */
    METHOD PROTECTED RepositoryException WrapError (INPUT pcOperation AS CHARACTER, INPUT pcId AS CHARACTER, INPUT poError AS Progress.Lang.Error):
        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogError(SUBSTITUTE("&1Repository", EntityName),
                SUBSTITUTE("&1 failed for &2: &3", pcOperation, pcId, poError:GetMessage(1))).
        RETURN NEW RepositoryException(
            SUBSTITUTE("&1 operation &2 failed for &3.", EntityName, pcOperation, pcId),
            "NB-REPO-500").
    END METHOD.

END CLASS.
