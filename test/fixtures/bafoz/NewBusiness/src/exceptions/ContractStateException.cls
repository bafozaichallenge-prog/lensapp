/*------------------------------------------------------------------------
    Class:    ContractStateException
    Purpose:  Raised by Contract.cls whenever a caller attempts an
              invalid state transition (e.g. Activate() from CANCELLED,
              or Activate() without a passing, non-stale validation
              result). This keeps status-transition ownership inside the
              Contract aggregate itself (Section 45).

    Requirements:  BR-007, BR-010, Section 8, Section 45,
                   Edge Cases: "Activation Without Validation",
                   "Activation From Incorrect State"
------------------------------------------------------------------------*/

CLASS exceptions.ContractStateException INHERITS exceptions.ApplicationException:

    DEFINE PUBLIC PROPERTY CurrentStatus AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY AttemptedTransition AS CHARACTER NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC ContractStateException
        ( INPUT pcMessage             AS CHARACTER,
          INPUT pcCurrentStatus       AS CHARACTER,
          INPUT pcAttemptedTransition AS CHARACTER ):
        SUPER(pcMessage, "NB-ACTIVATION-001").
        CurrentStatus       = pcCurrentStatus.
        AttemptedTransition = pcAttemptedTransition.
    END CONSTRUCTOR.

END CLASS.
