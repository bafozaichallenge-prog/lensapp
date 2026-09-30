/*------------------------------------------------------------------------
    Class:    RepositoryException
    Purpose:  Raised by the infrastructure/repositories layer when a
              persistence operation fails (record not found, duplicate
              key, simulated database failure, concurrent update, etc).

    Requirements:  Section 23, 24, 35, Edge Cases (Section 47)
------------------------------------------------------------------------*/

CLASS exceptions.RepositoryException INHERITS exceptions.ApplicationException:

    CONSTRUCTOR PUBLIC RepositoryException (INPUT pcMessage AS CHARACTER):
        SUPER(pcMessage, "NB002").
    END CONSTRUCTOR.

    CONSTRUCTOR PUBLIC RepositoryException (INPUT pcMessage AS CHARACTER, INPUT pcErrorCode AS CHARACTER):
        SUPER(pcMessage, pcErrorCode).
    END CONSTRUCTOR.

END CLASS.
