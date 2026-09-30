/*------------------------------------------------------------------------
    Class:    ValidationException
    Purpose:  Raised when an operation is attempted against a
              ValidationSummary that contains errors, e.g. activation
              being attempted without a passing validation result.

    Requirements:  Section 6 (BR-006), Section 35
------------------------------------------------------------------------*/

CLASS exceptions.ValidationException INHERITS exceptions.ApplicationException:

    DEFINE PUBLIC PROPERTY Summary AS domain.validation.ValidationSummary NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC ValidationException (INPUT pcMessage AS CHARACTER, INPUT poSummary AS domain.validation.ValidationSummary):
        SUPER(pcMessage, "NB003").
        Summary = poSummary.
    END CONSTRUCTOR.

END CLASS.
