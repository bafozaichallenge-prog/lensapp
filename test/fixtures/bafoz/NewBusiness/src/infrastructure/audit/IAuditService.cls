/*------------------------------------------------------------------------
    Interface: IAuditService
    Purpose:   Abstraction for recording and retrieving the contract
              audit trail (Section 37, Section 49).
------------------------------------------------------------------------*/

USING OpenEdge.Core.Collections.ArrayList.

INTERFACE infrastructure.audit.IAuditService:

    METHOD PUBLIC VOID RecordAction
        ( INPUT pcContractId AS CHARACTER,
          INPUT pcAction     AS CHARACTER,
          INPUT pcOldValue   AS CHARACTER,
          INPUT pcNewValue   AS CHARACTER,
          INPUT pcUserId     AS CHARACTER ).

    METHOD PUBLIC ArrayList GetAuditTrail (INPUT pcContractId AS CHARACTER).

END INTERFACE.
