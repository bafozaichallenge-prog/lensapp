/*------------------------------------------------------------------------
    Class:    NewBusinessWorkflow
    Purpose:  Tracks the capture-stage state of a single new-business
              application, independent of - but coordinated with - the
              Contract aggregate's own status. Where Contract.Status
              answers "is this policy IN-FORCE", NewBusinessWorkflow
              answers "how far through data capture is this application".

    Requirements:  Section 27 - Workflow Object, Section 28 - Workflow
                   Interface

    Stages:
        CONTRACT_CREATED -> CAMPAIGN_LINKED -> PERSON_CAPTURED ->
        BENEFITS_SELECTED -> COLLECTION_CAPTURED -> VALIDATING ->
        (VALIDATION_FAILED | READY_FOR_ACTIVATION) -> ACTIVATED

        VALIDATION_FAILED loops back to VALIDATING once data has been
        corrected and re-submitted.
------------------------------------------------------------------------*/

USING domain.interfaces.IWorkflow.
USING exceptions.ContractStateException.
USING OpenEdge.Core.Collections.ArrayList.
USING OpenEdge.Core.String.

CLASS application.workflow.NewBusinessWorkflow IMPLEMENTS IWorkflow:

    DEFINE PUBLIC STATIC PROPERTY STAGE_CONTRACT_CREATED      AS CHARACTER NO-UNDO INITIAL "CONTRACT_CREATED"      GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_CAMPAIGN_LINKED        AS CHARACTER NO-UNDO INITIAL "CAMPAIGN_LINKED"       GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_PERSON_CAPTURED         AS CHARACTER NO-UNDO INITIAL "PERSON_CAPTURED"       GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_BENEFITS_SELECTED        AS CHARACTER NO-UNDO INITIAL "BENEFITS_SELECTED"     GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_COLLECTION_CAPTURED       AS CHARACTER NO-UNDO INITIAL "COLLECTION_CAPTURED"   GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_VALIDATING                 AS CHARACTER NO-UNDO INITIAL "VALIDATING"            GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_VALIDATION_FAILED           AS CHARACTER NO-UNDO INITIAL "VALIDATION_FAILED"     GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_READY_FOR_ACTIVATION          AS CHARACTER NO-UNDO INITIAL "READY_FOR_ACTIVATION"  GET.
    DEFINE PUBLIC STATIC PROPERTY STAGE_ACTIVATED                      AS CHARACTER NO-UNDO INITIAL "ACTIVATED"             GET.

    DEFINE PUBLIC PROPERTY ContractId AS CHARACTER NO-UNDO GET. PRIVATE SET.

    DEFINE PRIVATE VARIABLE mcCurrentState AS CHARACTER NO-UNDO.

    CONSTRUCTOR PUBLIC NewBusinessWorkflow (INPUT pcContractId AS CHARACTER):
        ContractId     = pcContractId.
        mcCurrentState = STAGE_CONTRACT_CREATED.
    END CONSTRUCTOR.

    METHOD PUBLIC CHARACTER GetCurrentState ( ):
        RETURN mcCurrentState.
    END METHOD.

    METHOD PUBLIC LOGICAL CanTransition (INPUT pcTargetState AS CHARACTER):
        DEFINE VARIABLE oAllowed AS ArrayList NO-UNDO.
        oAllowed = THIS-OBJECT:GetAllowedTransitions().
        RETURN THIS-OBJECT:ListContains(oAllowed, pcTargetState).
    END METHOD.

    METHOD PUBLIC VOID TransitionTo (INPUT pcTargetState AS CHARACTER):
        IF NOT THIS-OBJECT:CanTransition(pcTargetState) THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Workflow for &1 cannot move from &2 to &3.", ContractId, mcCurrentState, pcTargetState),
                mcCurrentState, pcTargetState).

        mcCurrentState = pcTargetState.
    END METHOD.

    METHOD PUBLIC ArrayList GetAllowedTransitions ( ):
        DEFINE VARIABLE oAllowed AS ArrayList NO-UNDO.
        oAllowed = NEW ArrayList().

        CASE mcCurrentState:
            WHEN STAGE_CONTRACT_CREATED THEN
                oAllowed:Add(NEW String(STAGE_CAMPAIGN_LINKED)).
            WHEN STAGE_CAMPAIGN_LINKED THEN
                oAllowed:Add(NEW String(STAGE_PERSON_CAPTURED)).
            WHEN STAGE_PERSON_CAPTURED THEN
                oAllowed:Add(NEW String(STAGE_BENEFITS_SELECTED)).
            WHEN STAGE_BENEFITS_SELECTED THEN
                oAllowed:Add(NEW String(STAGE_COLLECTION_CAPTURED)).
            WHEN STAGE_COLLECTION_CAPTURED THEN
                oAllowed:Add(NEW String(STAGE_VALIDATING)).
            WHEN STAGE_VALIDATING THEN DO:
                oAllowed:Add(NEW String(STAGE_VALIDATION_FAILED)).
                oAllowed:Add(NEW String(STAGE_READY_FOR_ACTIVATION)).
            END.
            WHEN STAGE_VALIDATION_FAILED THEN
                oAllowed:Add(NEW String(STAGE_VALIDATING)). /* re-submit after correction */
            WHEN STAGE_READY_FOR_ACTIVATION THEN DO:
                oAllowed:Add(NEW String(STAGE_ACTIVATED)).
                oAllowed:Add(NEW String(STAGE_VALIDATING)). /* data changed post-validation, must re-validate - Edge Case 47 */
            END.
            WHEN STAGE_ACTIVATED THEN
                /* Terminal for this workflow - no further capture-stage transitions. */
                RETURN oAllowed.
        END CASE.

        RETURN oAllowed.
    END METHOD.

    METHOD PRIVATE LOGICAL ListContains (INPUT poList AS ArrayList, INPUT pcValue AS CHARACTER):
        DEFINE VARIABLE i AS INTEGER NO-UNDO.
        DO i = 1 TO poList:Size:
            IF CAST(poList:Get(i), String):Value = pcValue THEN
                RETURN TRUE.
        END.
        RETURN FALSE.
    END METHOD.

END CLASS.
