/*------------------------------------------------------------------------
    Class:    Logger
    Purpose:  Default ILogger implementation. Writes structured, single-
              line log entries. Deliberately does not log sensitive
              financial/personal information (Section 36).

    Requirements:  Section 36 - Logging
------------------------------------------------------------------------*/

USING infrastructure.logging.ILogger.

CLASS infrastructure.logging.Logger IMPLEMENTS ILogger:

    DEFINE PRIVATE VARIABLE mcLogFile AS CHARACTER NO-UNDO.

    CONSTRUCTOR PUBLIC Logger ( ):
        mcLogFile = "new-business.log".
    END CONSTRUCTOR.

    CONSTRUCTOR PUBLIC Logger (INPUT pcLogFile AS CHARACTER):
        mcLogFile = pcLogFile.
    END CONSTRUCTOR.

    METHOD PUBLIC VOID LogInfo (INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER):
        THIS-OBJECT:WriteEntry("INFO", pcSource, pcMessage).
    END METHOD.

    METHOD PUBLIC VOID LogWarn (INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER):
        THIS-OBJECT:WriteEntry("WARN", pcSource, pcMessage).
    END METHOD.

    METHOD PUBLIC VOID LogError (INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER):
        THIS-OBJECT:WriteEntry("ERROR", pcSource, pcMessage).
    END METHOD.

    METHOD PRIVATE VOID WriteEntry (INPUT pcLevel AS CHARACTER, INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER):
        DEFINE VARIABLE cLine AS CHARACTER NO-UNDO.

        cLine = SUBSTITUTE("&1 [&2] &3 - &4",
            ISO-DATE(NOW), pcLevel, pcSource, pcMessage).

        OUTPUT TO VALUE(mcLogFile) APPEND.
        PUT UNFORMATTED cLine SKIP.
        OUTPUT CLOSE.
    END METHOD.

END CLASS.
