USING domain.entities.CollectionInstruction.
USING domain.interfaces.IRepository.

INTERFACE domain.interfaces.ICollectionRepository INHERITS IRepository:

    METHOD PUBLIC VOID Save (INPUT poInstruction AS CollectionInstruction).

    METHOD PUBLIC VOID Update (INPUT poInstruction AS CollectionInstruction).

    METHOD PUBLIC CollectionInstruction GetByContractId (INPUT pcContractId AS CHARACTER).

END INTERFACE.
