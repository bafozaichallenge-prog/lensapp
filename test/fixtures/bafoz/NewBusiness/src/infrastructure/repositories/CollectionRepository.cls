/*------------------------------------------------------------------------
    Class:    CollectionRepository
    Purpose:  ICollectionRepository implementation. Keyed by ContractId
              since each contract has at most one collection instruction
              (Section 33 - 1:1 relationship).

    Requirements:  Section 23, Section 32 (CollectionInstruction table)
------------------------------------------------------------------------*/

USING domain.interfaces.ICollectionRepository.
USING domain.entities.CollectionInstruction.
USING infrastructure.repositories.AbstractRepository.
USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.

CLASS infrastructure.repositories.CollectionRepository INHERITS AbstractRepository IMPLEMENTS ICollectionRepository:

    CONSTRUCTOR PUBLIC CollectionRepository (INPUT poLogger AS ILogger):
        SUPER("CollectionInstruction", poLogger).
    END CONSTRUCTOR.

    METHOD PUBLIC VOID Save (INPUT poInstruction AS CollectionInstruction):
        moStore:Put(poInstruction:ContractId, poInstruction).
        THIS-OBJECT:LogOperation("SAVE", poInstruction:ContractId).
    END METHOD.

    METHOD PUBLIC VOID Update (INPUT poInstruction AS CollectionInstruction):
        THIS-OBJECT:GuardExists(poInstruction:ContractId).
        moStore:Put(poInstruction:ContractId, poInstruction).
        THIS-OBJECT:LogOperation("UPDATE", poInstruction:ContractId).
    END METHOD.

    METHOD PUBLIC CollectionInstruction GetByContractId (INPUT pcContractId AS CHARACTER):
        THIS-OBJECT:GuardExists(pcContractId).
        RETURN CAST(moStore:Get(pcContractId), CollectionInstruction).
    END METHOD.

END CLASS.
