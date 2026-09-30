/*------------------------------------------------------------------------
    Class:    Benefit
    Purpose:  Represents a product/cover option that can be sold on a
              contract (LIFE, FUNERAL, ACCIDENT, DISABILITY,
              CRITICAL_ILLNESS, HOSPITAL).

    Requirements:  BR-004 - Link Benefits, BRULE-005
    Schema:     Benefit.CoverAmount added by
                database/delta/002_benefit_cover_amount.df
------------------------------------------------------------------------*/

USING domain.entities.AbstractDomainEntity.

CLASS domain.entities.Benefit INHERITS AbstractDomainEntity:

    DEFINE PUBLIC STATIC PROPERTY STATUS_ACTIVE   AS CHARACTER NO-UNDO INITIAL "ACTIVE"   GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_INACTIVE AS CHARACTER NO-UNDO INITIAL "INACTIVE" GET.

    DEFINE PUBLIC PROPERTY BenefitId   AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BenefitCode AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BenefitName AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Description AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Premium     AS DECIMAL   NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Status      AS CHARACTER NO-UNDO GET. PRIVATE SET.

    /* Default sum assured for this benefit (database/delta 002). Set
       at catalogue level via SetCoverAmount(); ContractBenefit keeps
       its own premium snapshot, so changing this later does not
       retro-alter contracts already sold. */
    DEFINE PUBLIC PROPERTY CoverAmount AS DECIMAL   NO-UNDO INITIAL 0 GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC Benefit ( ):
        SUPER ().
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE CHARACTER GetEntityName ( ):
        RETURN "Benefit".
    END METHOD.

    METHOD PUBLIC VOID Create
        ( INPUT pcBenefitId   AS CHARACTER,
          INPUT pcBenefitCode AS CHARACTER,
          INPUT pcBenefitName AS CHARACTER,
          INPUT pcDescription AS CHARACTER,
          INPUT pdPremium     AS DECIMAL,
          INPUT pcStatus      AS CHARACTER,
          INPUT pcUserId      AS CHARACTER ):

        BenefitId   = pcBenefitId.
        BenefitCode = pcBenefitCode.
        BenefitName = pcBenefitName.
        Description = pcDescription.
        Premium     = pdPremium.
        Status      = pcStatus.
        THIS-OBJECT:StampCreated(pcUserId).
    END METHOD.

    /* Sets the default sum assured. Kept as its own mutator (rather
       than extending Create()) so existing Benefit:Create() call sites
       in seed data and the test suite are unaffected. */
    METHOD PUBLIC VOID SetCoverAmount (INPUT pdCoverAmount AS DECIMAL):
        IF pdCoverAmount < 0 THEN
            UNDO, THROW NEW exceptions.BusinessRuleException(
                SUBSTITUTE("Cover amount for benefit &1 cannot be negative.", BenefitCode),
                "NB-BENEFIT-005").
        CoverAmount = pdCoverAmount.
        THIS-OBJECT:Touch("catalogue").
    END METHOD.

    METHOD PUBLIC LOGICAL IsActive ( ):
        RETURN Status = STATUS_ACTIVE.
    END METHOD.

    /* Placeholder for future rating logic (loadings, discounts, age
       banding, etc). Today the benefit's base Premium is the
       calculated premium - kept as its own method so ContractBenefit
       and rating rules have a single seam to extend later without
       touching the aggregate. */
    METHOD PUBLIC DECIMAL CalculatePremium ( ):
        RETURN Premium.
    END METHOD.

    METHOD PUBLIC LOGICAL Validate (OUTPUT pcReason AS CHARACTER):
        IF BenefitId = "" OR BenefitId = ? THEN DO:
            pcReason = "Benefit identifier is required.".
            RETURN FALSE.
        END.
        IF NOT THIS-OBJECT:IsActive() THEN DO:
            pcReason = SUBSTITUTE("Benefit &1 is not active.", BenefitCode).
            RETURN FALSE.
        END.
        IF Premium < 0 THEN DO:
            pcReason = SUBSTITUTE("Benefit &1 has a negative premium.", BenefitCode).
            RETURN FALSE.
        END.
        IF CoverAmount < 0 THEN DO:
            pcReason = SUBSTITUTE("Benefit &1 has a negative cover amount.", BenefitCode).
            RETURN FALSE.
        END.
        pcReason = "".
        RETURN TRUE.
    END METHOD.

END CLASS.
