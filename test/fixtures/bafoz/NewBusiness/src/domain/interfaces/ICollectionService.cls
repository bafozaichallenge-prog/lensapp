USING domain.entities.CollectionInstruction.

INTERFACE domain.interfaces.ICollectionService:

    METHOD PUBLIC CollectionInstruction CaptureCollection
        ( INPUT pcContractId        AS CHARACTER,
          INPUT pcCollectionMethod  AS CHARACTER,
          INPUT piCollectionDay     AS INTEGER,
          INPUT pcAccountNumber     AS CHARACTER,
          INPUT pcBankCode          AS CHARACTER,
          INPUT pcAccountHolderName AS CHARACTER,
          INPUT pcUserId            AS CHARACTER ).

END INTERFACE.
