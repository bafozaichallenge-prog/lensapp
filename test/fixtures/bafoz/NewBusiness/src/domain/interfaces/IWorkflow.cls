/*------------------------------------------------------------------------
    Interface: IWorkflow
    Purpose:   Abstraction for a stage-based process workflow. Implemented
              by NewBusinessWorkflow to track/enforce the progression of
              a contract through the new-business capture stages.

    Requirements:  Section 27, Section 28
------------------------------------------------------------------------*/

USING OpenEdge.Core.Collections.ArrayList.

INTERFACE domain.interfaces.IWorkflow:

    METHOD PUBLIC CHARACTER GetCurrentState ( ).

    METHOD PUBLIC LOGICAL CanTransition (INPUT pcTargetState AS CHARACTER).

    METHOD PUBLIC VOID TransitionTo (INPUT pcTargetState AS CHARACTER).

    METHOD PUBLIC ArrayList GetAllowedTransitions ( ).

END INTERFACE.
