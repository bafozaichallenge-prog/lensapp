/*------------------------------------------------------------------------
    Interface: IRepository
    Purpose:   Documents the common repository shape (Create/GetById/
              Update/Save/Delete/Exists) shared conceptually by every
              persistence abstraction in the system (Section 23).

    Note:      OpenEdge OOABL has no generics, so entity-specific
              repository interfaces (IContractRepository,
              IPersonRepository, etc.) each declare their own strongly
              typed method signatures rather than inheriting this
              interface directly - covariant return types are not
              supported across interface inheritance in ABL. This
              interface exists so the *shape* every repository must
              follow is defined once, in one place, for the AI
              requirements-analysis tooling to discover.

    Requirements:  Section 23, Section 24
------------------------------------------------------------------------*/

INTERFACE domain.interfaces.IRepository:

    METHOD PUBLIC LOGICAL Exists (INPUT pcId AS CHARACTER).

    METHOD PUBLIC LOGICAL Delete (INPUT pcId AS CHARACTER).

END INTERFACE.
