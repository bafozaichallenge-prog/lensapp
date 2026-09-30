/*------------------------------------------------------------------------
    Interface: IContractRepository
    Purpose:   Persistence abstraction for the Contract aggregate.
              Application services depend on this interface, never on
              the concrete ContractRepository (Section 39 - Dependency
              Injection).

    Requirements:  Section 23
------------------------------------------------------------------------*/

USING domain.entities.Contract.
USING domain.interfaces.IRepository.

INTERFACE domain.interfaces.IContractRepository INHERITS IRepository:

    METHOD PUBLIC VOID Save (INPUT poContract AS Contract).

    METHOD PUBLIC VOID Update (INPUT poContract AS Contract).

    METHOD PUBLIC Contract GetById (INPUT pcContractId AS CHARACTER).

    /* Generates the next contract identifier, e.g. CON-000001 */
    METHOD PUBLIC CHARACTER GetNextContractId ( ).

    /* Supports DuplicateContractRule - Edge Case: "Client already has
       an active policy". */
    METHOD PUBLIC LOGICAL HasActiveContractForOwner (INPUT pcOwnerPersonId AS CHARACTER).

END INTERFACE.
