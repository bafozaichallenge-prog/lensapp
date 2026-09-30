/*------------------------------------------------------------------------
    Class:    ContractRepository
    Purpose:  IContractRepository implementation. Persists Contract
              aggregates in the in-memory store inherited from
              AbstractRepository and generates sequential contract
              identifiers (CON-000001, CON-000002, ...).

    Requirements:  Section 23, Section 32 (Contract table)
------------------------------------------------------------------------*/

USING domain.interfaces.IContractRepository.
USING domain.entities.Contract.
USING infrastructure.repositories.AbstractRepository.
USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.

CLASS infrastructure.repositories.ContractRepository INHERITS AbstractRepository IMPLEMENTS IContractRepository:

    DEFINE PRIVATE VARIABLE miNextSequence AS INTEGER NO-UNDO INITIAL 0.

    CONSTRUCTOR PUBLIC ContractRepository (INPUT poLogger AS ILogger):
        SUPER("Contract", poLogger).
    END CONSTRUCTOR.

    METHOD PUBLIC CHARACTER GetNextContractId ( ):
        miNextSequence = miNextSequence + 1.
        RETURN SUBSTITUTE("CON-&1", STRING(miNextSequence, "999999")).
    END METHOD.

    METHOD PUBLIC VOID Save (INPUT poContract AS Contract):
        IF THIS-OBJECT:Exists(poContract:ContractId) THEN
            UNDO, THROW NEW RepositoryException(
                SUBSTITUTE("Contract &1 already exists.", poContract:ContractId), "NB-REPO-409").

        moStore:Put(poContract:ContractId, poContract).
        THIS-OBJECT:LogOperation("SAVE", poContract:ContractId).
    END METHOD.

    METHOD PUBLIC VOID Update (INPUT poContract AS Contract):
        THIS-OBJECT:GuardExists(poContract:ContractId).
        moStore:Put(poContract:ContractId, poContract).
        THIS-OBJECT:LogOperation("UPDATE", poContract:ContractId).
    END METHOD.

    METHOD PUBLIC Contract GetById (INPUT pcContractId AS CHARACTER):
        THIS-OBJECT:GuardExists(pcContractId).
        RETURN CAST(moStore:Get(pcContractId), Contract).
    END METHOD.

    /* Supports DuplicateContractRule - Edge Case: "Client already has
       an active policy". Only IN-FORCE is treated as "active"; a NEW
       (still being captured) or CANCELLED/LAPSED contract for the same
       owner does not block a fresh application. */
    METHOD PUBLIC LOGICAL HasActiveContractForOwner (INPUT pcOwnerPersonId AS CHARACTER):
        DEFINE VARIABLE oKeys     AS OpenEdge.Core.Collections.ArrayList NO-UNDO.
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        DEFINE VARIABLE i         AS INTEGER  NO-UNDO.

        oKeys = moStore:Keys.
        DO i = 1 TO oKeys:Size:
            oContract = CAST(moStore:Get(CAST(oKeys:Get(i), OpenEdge.Core.String):Value), Contract).
            IF oContract:OwnerPersonId = pcOwnerPersonId AND oContract:Status = Contract:STATUS_IN_FORCE THEN
                RETURN TRUE.
        END.
        RETURN FALSE.
    END METHOD.

END CLASS.
