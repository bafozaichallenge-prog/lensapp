/*------------------------------------------------------------------------
    Test:     ContractActivationTest
    Covers:   domain.entities.Contract state transitions
    Requirement:  BR-007, BRULE-010, BRULE-011, Section 45, Section 48

    Required Test Scenarios covered here (Section 41):
        - Activation Without Validation      -> ContractStateException
        - Activation From Incorrect State    -> ContractStateException
        - Idempotent double activation       -> no error, single event
        - Stale validation result            -> ValidationException
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING domain.entities.Contract.
USING tests.domain.FakeContractValidator.
USING exceptions.ContractStateException.
USING exceptions.ValidationException.

CLASS tests.domain.ContractActivationTest:

    @Test.
    METHOD PUBLIC VOID Activate_Throws_WhenNeverValidated ( ):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        DEFINE VARIABLE lCaught   AS LOGICAL  NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-ACT-001", "test").

        TryActivateExpectingStateException(oContract, OUTPUT lCaught).

        Assert:IsTrue(lCaught, "Activating a never-validated contract must raise ContractStateException").
        Assert:Equals(Contract:STATUS_NEW, oContract:Status).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Activate_Throws_WhenContractIsCancelled ( ):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        DEFINE VARIABLE lCaught   AS LOGICAL  NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-ACT-002", "test").
        oContract:Cancel().

        TryActivateExpectingStateException(oContract, OUTPUT lCaught).

        Assert:IsTrue(lCaught, "Activating a CANCELLED contract must raise ContractStateException").
        Assert:Equals(Contract:STATUS_CANCELLED, oContract:Status).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Activate_Succeeds_WhenValidationPassed ( ):
        DEFINE VARIABLE oContract  AS Contract              NO-UNDO.
        DEFINE VARIABLE oValidator AS FakeContractValidator NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-ACT-003", "test").

        oValidator = NEW FakeContractValidator().
        oValidator:ShouldPass = TRUE.
        oContract:Validate(oValidator).

        oContract:Activate().

        Assert:Equals(Contract:STATUS_IN_FORCE, oContract:Status).
        Assert:IsTrue(oContract:ActivatedDate <> ?, "ActivatedDate should be stamped").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Activate_IsIdempotent_OnRepeatedCalls ( ):
        DEFINE VARIABLE oContract  AS Contract              NO-UNDO.
        DEFINE VARIABLE oValidator AS FakeContractValidator NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-ACT-004", "test").

        oValidator = NEW FakeContractValidator().
        oValidator:ShouldPass = TRUE.
        oContract:Validate(oValidator).

        oContract:Activate().
        oContract:Activate(). /* second call must be a no-op, not an error */

        Assert:Equals(Contract:STATUS_IN_FORCE, oContract:Status).
        Assert:Equals(2, oContract:ActivationRequestCount).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Activate_Throws_WhenValidationSummaryIsStale ( ):
        DEFINE VARIABLE oContract  AS Contract              NO-UNDO.
        DEFINE VARIABLE oValidator AS FakeContractValidator NO-UNDO.
        DEFINE VARIABLE lCaught    AS LOGICAL               NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-ACT-005", "test").

        oValidator = NEW FakeContractValidator().
        oValidator:ShouldPass = TRUE.
        oContract:Validate(oValidator).

        /* Mutating the contract after validation makes the cached
           summary stale - Edge Case 47. */
        oContract:AssignCampaign("CAM999").

        TryActivateExpectingValidationException(oContract, OUTPUT lCaught).

        Assert:IsTrue(lCaught, "Activating with a stale validation result must raise ValidationException").
        Assert:Equals(Contract:STATUS_NEW, oContract:Status).
    END METHOD.

    METHOD PRIVATE VOID TryActivateExpectingStateException (INPUT poContract AS Contract, OUTPUT plCaught AS LOGICAL):
        plCaught = FALSE.
        DO:
            poContract:Activate().
            CATCH ex AS ContractStateException:
                plCaught = TRUE.
            END CATCH.
        END.
    END METHOD.

    METHOD PRIVATE VOID TryActivateExpectingValidationException (INPUT poContract AS Contract, OUTPUT plCaught AS LOGICAL):
        plCaught = FALSE.
        DO:
            poContract:Activate().
            CATCH ex AS ValidationException:
                plCaught = TRUE.
            END CATCH.
        END.
    END METHOD.

END CLASS.
