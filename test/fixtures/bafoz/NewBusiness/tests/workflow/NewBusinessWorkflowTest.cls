/*------------------------------------------------------------------------
    Test:     NewBusinessWorkflowTest
    Covers:   application.workflow.NewBusinessWorkflow
    Requirement:  Section 27, Section 28
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING application.workflow.NewBusinessWorkflow.
USING exceptions.ContractStateException.

CLASS tests.workflow.NewBusinessWorkflowTest:

    @Test.
    METHOD PUBLIC VOID InitialState_IsContractCreated ( ):
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.
        oWorkflow = NEW NewBusinessWorkflow("CON-WF-001").
        Assert:Equals(NewBusinessWorkflow:STAGE_CONTRACT_CREATED, oWorkflow:GetCurrentState()).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID TransitionTo_Succeeds_ForNextStageInSequence ( ):
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.
        oWorkflow = NEW NewBusinessWorkflow("CON-WF-002").

        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_CAMPAIGN_LINKED).

        Assert:Equals(NewBusinessWorkflow:STAGE_CAMPAIGN_LINKED, oWorkflow:GetCurrentState()).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID TransitionTo_Throws_ForSkippedStage ( ):
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.
        DEFINE VARIABLE lCaught   AS LOGICAL              NO-UNDO INITIAL FALSE.

        oWorkflow = NEW NewBusinessWorkflow("CON-WF-003").

        DO:
            /* Cannot jump straight from CONTRACT_CREATED to BENEFITS_SELECTED */
            oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_BENEFITS_SELECTED).
            CATCH ex AS ContractStateException:
                lCaught = TRUE.
            END CATCH.
        END.

        Assert:IsTrue(lCaught, "Skipping a workflow stage must raise ContractStateException").
        Assert:Equals(NewBusinessWorkflow:STAGE_CONTRACT_CREATED, oWorkflow:GetCurrentState()).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID CanTransition_AllowsLoopingBack_FromValidationFailedToValidating ( ):
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.
        oWorkflow = NEW NewBusinessWorkflow("CON-WF-004").

        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_CAMPAIGN_LINKED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_PERSON_CAPTURED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_BENEFITS_SELECTED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_COLLECTION_CAPTURED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_VALIDATING).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_VALIDATION_FAILED).

        Assert:IsTrue(oWorkflow:CanTransition(NewBusinessWorkflow:STAGE_VALIDATING),
            "Workflow must allow re-submission for validation after a failure").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID ActivatedStage_HasNoFurtherTransitions ( ):
        DEFINE VARIABLE oWorkflow AS NewBusinessWorkflow NO-UNDO.
        oWorkflow = NEW NewBusinessWorkflow("CON-WF-005").

        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_CAMPAIGN_LINKED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_PERSON_CAPTURED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_BENEFITS_SELECTED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_COLLECTION_CAPTURED).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_VALIDATING).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_READY_FOR_ACTIVATION).
        oWorkflow:TransitionTo(NewBusinessWorkflow:STAGE_ACTIVATED).

        Assert:Equals(0, oWorkflow:GetAllowedTransitions():Size).
    END METHOD.

END CLASS.
