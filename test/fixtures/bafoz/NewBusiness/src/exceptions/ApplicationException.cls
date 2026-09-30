/*------------------------------------------------------------------------
    Class:    ApplicationException
    Purpose:  Root exception type for the New Business codebase. All
              application-specific exceptions derive from this class so
              that API controllers can catch a single family of errors
              and translate them into consistent JSON error responses.

    Requirements:  Section 35 - Error Handling
------------------------------------------------------------------------*/

CLASS exceptions.ApplicationException INHERITS Progress.Lang.AppError:

    /* Machine-readable error code, e.g. NB001, NB-CAMPAIGN-001 */
    DEFINE PUBLIC PROPERTY ErrorCode AS CHARACTER NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC ApplicationException (INPUT pcMessage AS CHARACTER):
        SUPER(pcMessage, 0).
        ErrorCode = "NB000".
        THIS-OBJECT:AddMessage(pcMessage, 0).
    END CONSTRUCTOR.

    CONSTRUCTOR PUBLIC ApplicationException (INPUT pcMessage AS CHARACTER, INPUT pcErrorCode AS CHARACTER):
        SUPER(pcMessage, 0).
        ErrorCode = pcErrorCode.
        THIS-OBJECT:AddMessage(pcMessage, 0).
    END CONSTRUCTOR.

END CLASS.
