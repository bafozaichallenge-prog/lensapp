/*------------------------------------------------------------------------
    Class:    ContractBenefit
    Purpose:  Represents the link/association between a Contract and a
              Benefit that has been selected for it, including the
              premium locked in at the time of selection.

    Requirements:  BR-004 - Link Benefits, Section 12
------------------------------------------------------------------------*/

USING domain.entities.AbstractDomainEntity.
USING domain.entities.Benefit.

CLASS domain.entities.ContractBenefit INHERITS AbstractDomainEntity:

    DEFINE PUBLIC PROPERTY ContractId     AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BenefitId      AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BenefitCode    AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Premium        AS DECIMAL   NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY EffectiveDate  AS DATE      NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC ContractBenefit ( ):
        SUPER ().
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE CHARACTER GetEntityName ( ):
        RETURN "ContractBenefit".
    END METHOD.

    /* Creates the association from a live Benefit entity so that the
       code/premium are captured at selection time - future changes to
       the master Benefit record must not silently alter a contract
       that has already selected it. */
    METHOD PUBLIC VOID Create
        ( INPUT pcContractId  AS CHARACTER,
          INPUT poBenefit     AS Benefit,
          INPUT pdEffective   AS DATE,
          INPUT pcUserId      AS CHARACTER ):

        DEFINE VARIABLE cReason AS CHARACTER NO-UNDO.

        IF NOT poBenefit:Validate(OUTPUT cReason) THEN
            UNDO, THROW NEW exceptions.BusinessRuleException(cReason, "NB-BENEFIT-003").

        ContractId    = pcContractId.
        BenefitId     = poBenefit:BenefitId.
        BenefitCode   = poBenefit:BenefitCode.
        Premium       = poBenefit:CalculatePremium().
        EffectiveDate = pdEffective.
        THIS-OBJECT:StampCreated(pcUserId).
    END METHOD.

    /* Persistence rehydration seam - rebuilds this link row verbatim
       from storage (DbContractRepository only). Unlike Create(), no
       Benefit entity is required and no validation runs: the stored
       row was already validated when it was written. */
    METHOD PUBLIC VOID RestorePersistedState
        ( INPUT pcContractId  AS CHARACTER,
          INPUT pcBenefitId   AS CHARACTER,
          INPUT pcBenefitCode AS CHARACTER,
          INPUT pdPremium     AS DECIMAL,
          INPUT pdEffective   AS DATE ):

        ContractId    = pcContractId.
        BenefitId     = pcBenefitId.
        BenefitCode   = pcBenefitCode.
        Premium       = pdPremium.
        EffectiveDate = pdEffective.
        THIS-OBJECT:StampCreated("db-restore").
    END METHOD.

    METHOD PUBLIC LOGICAL Validate (OUTPUT pcReason AS CHARACTER):
        IF ContractId = "" OR ContractId = ? THEN DO:
            pcReason = "ContractBenefit requires a ContractId.".
            RETURN FALSE.
        END.
        IF BenefitId = "" OR BenefitId = ? THEN DO:
            pcReason = "ContractBenefit requires a BenefitId.".
            RETURN FALSE.
        END.
        IF Premium < 0 THEN DO:
            pcReason = "ContractBenefit premium cannot be negative.".
            RETURN FALSE.
        END.
        pcReason = "".
        RETURN TRUE.
    END METHOD.

    METHOD PUBLIC DECIMAL CalculatePremium ( ):
        RETURN Premium.
    END METHOD.

END CLASS.
