/*------------------------------------------------------------------------
    Interface: ILogger
    Purpose:   Abstraction over log output so services/repositories never
              depend on a concrete logging implementation (Section 36,
              Section 39 - Dependency Injection).

    Requirements:  Section 36 - Logging
------------------------------------------------------------------------*/

INTERFACE infrastructure.logging.ILogger:

    METHOD PUBLIC VOID LogInfo  (INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER).

    METHOD PUBLIC VOID LogWarn  (INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER).

    METHOD PUBLIC VOID LogError (INPUT pcSource AS CHARACTER, INPUT pcMessage AS CHARACTER).

END INTERFACE.
