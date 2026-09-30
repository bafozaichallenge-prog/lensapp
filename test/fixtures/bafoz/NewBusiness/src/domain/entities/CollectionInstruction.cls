/*------------------------------------------------------------------------
    Class:    CollectionInstruction
    Purpose:  Represents how and when premiums will be collected from
              the client (DEBIT_ORDER, EFT, CARD, PAYROLL, CASH).

    Requirements:  BR-005 - Capture Collection Details, BRULE-006,
                   BRULE-007, BRULE-008
    Security:  Do not expose AccountNumber/BankCode unnecessarily
               through API responses (Section 13) - see
               api.dto.CollectionInstructionRequest / ContractResponse,
               which deliberately omit or mask these fields.
------------------------------------------------------------------------*/

USING domain.entities.AbstractDomainEntity.

CLASS domain.entities.CollectionInstruction INHERITS AbstractDomainEntity:

    DEFINE PUBLIC STATIC PROPERTY METHOD_DEBIT_ORDER AS CHARACTER NO-UNDO INITIAL "DEBIT_ORDER" GET.
    DEFINE PUBLIC STATIC PROPERTY METHOD_EFT          AS CHARACTER NO-UNDO INITIAL "EFT"         GET.
    DEFINE PUBLIC STATIC PROPERTY METHOD_CARD         AS CHARACTER NO-UNDO INITIAL "CARD"        GET.
    DEFINE PUBLIC STATIC PROPERTY METHOD_PAYROLL      AS CHARACTER NO-UNDO INITIAL "PAYROLL"     GET.
    DEFINE PUBLIC STATIC PROPERTY METHOD_CASH         AS CHARACTER NO-UNDO INITIAL "CASH"        GET.

    DEFINE PUBLIC PROPERTY ContractId        AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CollectionMethod  AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CollectionDay     AS INTEGER   NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY AccountNumber     AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BankCode          AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY AccountHolderName AS CHARACTER NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC CollectionInstruction ( ):
        SUPER ().
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE CHARACTER GetEntityName ( ):
        RETURN "CollectionInstruction".
    END METHOD.

    METHOD PUBLIC VOID Create
        ( INPUT pcContractId        AS CHARACTER,
          INPUT pcCollectionMethod  AS CHARACTER,
          INPUT piCollectionDay     AS INTEGER,
          INPUT pcAccountNumber     AS CHARACTER,
          INPUT pcBankCode          AS CHARACTER,
          INPUT pcAccountHolderName AS CHARACTER,
          INPUT pcUserId            AS CHARACTER ):

        ContractId        = pcContractId.
        CollectionMethod  = pcCollectionMethod.
        CollectionDay     = piCollectionDay.
        AccountNumber     = pcAccountNumber.
        BankCode          = pcBankCode.
        AccountHolderName = pcAccountHolderName.
        THIS-OBJECT:StampCreated(pcUserId).
    END METHOD.

    /* BRULE-006 */
    METHOD PUBLIC LOGICAL IsValidCollectionMethod ( ):
        RETURN LOOKUP(CollectionMethod,
            METHOD_DEBIT_ORDER + "," + METHOD_EFT + "," + METHOD_CARD + "," + METHOD_PAYROLL + "," + METHOD_CASH) > 0.
    END METHOD.

    /* Recurring monthly collection methods - the instruction fires
       every calendar month, so the day must exist in EVERY month. */
    METHOD PUBLIC LOGICAL IsRecurringMonthly ( ):
        RETURN LOOKUP(CollectionMethod, METHOD_DEBIT_ORDER + "," + METHOD_PAYROLL) > 0.
    END METHOD.

    /* BRULE-007 / BRULE-008 - Collection day must be 1-31 and must
       actually exist on every calendar run for recurring monthly
       methods. A debit-order day of 29/30/31 fails in February (and
       30/31 in the shorter months), so recurring methods are limited
       to 1-28. One-off methods (EFT, CARD, CASH) keep the full 1-31. */
    METHOD PUBLIC LOGICAL IsValidCollectionDay ( ):
        DEFINE VARIABLE iMaxDay AS INTEGER NO-UNDO INITIAL 31.

        IF CollectionDay = ? THEN
            RETURN FALSE.

        IF THIS-OBJECT:IsRecurringMonthly() THEN
            iMaxDay = 28.

        RETURN CollectionDay >= 1 AND CollectionDay <= iMaxDay.
    END METHOD.

    METHOD PUBLIC LOGICAL Validate (OUTPUT pcReason AS CHARACTER):
        IF CollectionMethod = "" OR CollectionMethod = ? THEN DO:
            pcReason = "Collection method is required.".
            RETURN FALSE.
        END.
        IF NOT THIS-OBJECT:IsValidCollectionMethod() THEN DO:
            pcReason = SUBSTITUTE("Collection method &1 is not supported.", CollectionMethod).
            RETURN FALSE.
        END.
        IF NOT THIS-OBJECT:IsValidCollectionDay() THEN DO:
            IF THIS-OBJECT:IsRecurringMonthly() THEN
                pcReason = "Collection day must be between 1 and 28 for monthly debit-order/payroll collections.".
            ELSE
                pcReason = "Collection day must be between 1 and 31.".
            RETURN FALSE.
        END.
        pcReason = "".
        RETURN TRUE.
    END METHOD.

END CLASS.
