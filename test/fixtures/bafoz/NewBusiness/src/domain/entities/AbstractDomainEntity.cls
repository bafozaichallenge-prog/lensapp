/*------------------------------------------------------------------------
    Class:    AbstractDomainEntity
    Purpose:  Common base behaviour shared by every domain aggregate/
              entity in the New Business model (audit stamps + entity
              identification). Concrete entities inherit from this class
              rather than duplicating created/modified bookkeeping.

    Requirements:  Section 22 - Abstract Domain Entity
    Responsibilities:
        - Track CreatedDate / ModifiedDate / CreatedBy / ModifiedBy
          (supports Section 49 - Auditability)
        - Force subclasses to identify themselves (GetEntityName)
------------------------------------------------------------------------*/

CLASS domain.entities.AbstractDomainEntity ABSTRACT:

    DEFINE PUBLIC PROPERTY CreatedDate  AS DATETIME  NO-UNDO GET. PROTECTED SET.
    DEFINE PUBLIC PROPERTY ModifiedDate AS DATETIME  NO-UNDO GET. PROTECTED SET.
    DEFINE PUBLIC PROPERTY CreatedBy    AS CHARACTER NO-UNDO GET. PROTECTED SET.
    DEFINE PUBLIC PROPERTY ModifiedBy   AS CHARACTER NO-UNDO GET. PROTECTED SET.

    CONSTRUCTOR PUBLIC AbstractDomainEntity ( ):
        CreatedDate  = NOW.
        ModifiedDate = NOW.
    END CONSTRUCTOR.

    /* Every concrete entity must be able to name itself - used by
       logging, auditing and the AI requirements-traceability tooling
       to identify which domain class a given record belongs to. */
    METHOD PUBLIC ABSTRACT CHARACTER GetEntityName ( ).

    /* Called by services/repositories whenever the entity is mutated
       and persisted, so ModifiedBy/ModifiedDate stay accurate without
       every entity re-implementing the same two lines. */
    METHOD PUBLIC VOID Touch (INPUT pcUserId AS CHARACTER):
        ModifiedDate = NOW.
        ModifiedBy   = pcUserId.
    END METHOD.

    METHOD PUBLIC VOID StampCreated (INPUT pcUserId AS CHARACTER):
        CreatedBy  = pcUserId.
        ModifiedBy = pcUserId.
    END METHOD.

END CLASS.
