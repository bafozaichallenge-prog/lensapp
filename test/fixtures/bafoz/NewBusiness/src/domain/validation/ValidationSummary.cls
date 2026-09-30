/*------------------------------------------------------------------------
    Class:    ValidationSummary
    Purpose:  Aggregates every ValidationResult produced by a full
              ContractValidator run. This is the object a Contract must
              hold a fresh, passing copy of before Activate() is allowed
              to succeed (Section 19, BR-011).

    Requirements:  Section 6 (BR-006), Section 19
------------------------------------------------------------------------*/

USING OpenEdge.Core.Collections.ArrayList.
USING domain.validation.ValidationResult.

CLASS domain.validation.ValidationSummary:

    DEFINE PRIVATE VARIABLE moResults AS ArrayList NO-UNDO.

    /* When this summary was produced - used to detect "stale"
       validation results if the contract is mutated afterwards
       (Edge Case: "Activation attempted after validation result has
       become stale"). */
    DEFINE PUBLIC PROPERTY EvaluatedAt AS DATETIME NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC ValidationSummary ( ):
        moResults   = NEW ArrayList().
        EvaluatedAt = NOW.
    END CONSTRUCTOR.

    METHOD PUBLIC VOID AddResult (INPUT poResult AS ValidationResult):
        moResults:Add(poResult).
    END METHOD.

    METHOD PUBLIC INTEGER Count ( ):
        RETURN moResults:Size.
    END METHOD.

    METHOD PUBLIC ValidationResult GetResult (INPUT piIndex AS INTEGER):
        RETURN CAST(moResults:Get(piIndex), ValidationResult).
    END METHOD.

    METHOD PUBLIC LOGICAL HasErrors ( ):
        DEFINE VARIABLE i AS INTEGER NO-UNDO.
        DO i = 1 TO moResults:Size:
            IF CAST(moResults:Get(i), ValidationResult):IsError() THEN
                RETURN TRUE.
        END.
        RETURN FALSE.
    END METHOD.

    METHOD PUBLIC LOGICAL IsValid ( ):
        RETURN NOT THIS-OBJECT:HasErrors().
    END METHOD.

    METHOD PUBLIC ArrayList GetErrors ( ):
        DEFINE VARIABLE oErrors AS ArrayList NO-UNDO.
        DEFINE VARIABLE i       AS INTEGER   NO-UNDO.
        oErrors = NEW ArrayList().
        DO i = 1 TO moResults:Size:
            IF CAST(moResults:Get(i), ValidationResult):IsError() THEN
                oErrors:Add(moResults:Get(i)).
        END.
        RETURN oErrors.
    END METHOD.

    METHOD PUBLIC ArrayList GetWarnings ( ):
        DEFINE VARIABLE oWarnings AS ArrayList NO-UNDO.
        DEFINE VARIABLE i         AS INTEGER   NO-UNDO.
        oWarnings = NEW ArrayList().
        DO i = 1 TO moResults:Size:
            IF CAST(moResults:Get(i), ValidationResult):IsWarning() THEN
                oWarnings:Add(moResults:Get(i)).
        END.
        RETURN oWarnings.
    END METHOD.

    METHOD PUBLIC ArrayList GetAllResults ( ):
        RETURN moResults.
    END METHOD.

    /* A validation result is considered stale once it is older than
       the supplied "as-of" timestamp - i.e. the contract was mutated
       (campaign/person/benefit/collection changed) after this summary
       was produced. */
    METHOD PUBLIC LOGICAL IsStaleAsOf (INPUT ptLastMutated AS DATETIME):
        IF ptLastMutated = ? THEN
            RETURN FALSE.
        RETURN ptLastMutated > EvaluatedAt.
    END METHOD.

    METHOD PUBLIC Progress.Json.ObjectModel.JsonArray ToJsonArray ( ):
        DEFINE VARIABLE oArray AS Progress.Json.ObjectModel.JsonArray NO-UNDO.
        DEFINE VARIABLE i      AS INTEGER NO-UNDO.
        oArray = NEW Progress.Json.ObjectModel.JsonArray().
        DO i = 1 TO moResults:Size:
            oArray:Add(CAST(moResults:Get(i), ValidationResult):ToJsonObject()).
        END.
        RETURN oArray.
    END METHOD.

END CLASS.
