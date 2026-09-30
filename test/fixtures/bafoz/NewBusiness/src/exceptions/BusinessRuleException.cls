/*------------------------------------------------------------------------
    Class:    BusinessRuleException
    Purpose:  Raised when an operation would violate a domain business
              rule that is not merely a "soft" validation failure - e.g.
              attempting to add a benefit that does not exist.

    Requirements:  Section 35 - Error Handling
------------------------------------------------------------------------*/

CLASS exceptions.BusinessRuleException INHERITS exceptions.ApplicationException:

    DEFINE PUBLIC PROPERTY RuleCode AS CHARACTER NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC BusinessRuleException (INPUT pcMessage AS CHARACTER, INPUT pcRuleCode AS CHARACTER):
        SUPER(pcMessage, pcRuleCode).
        RuleCode = pcRuleCode.
    END CONSTRUCTOR.

END CLASS.
