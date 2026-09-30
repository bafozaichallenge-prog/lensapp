/*------------------------------------------------------------------------
    Class:    Contract
    Purpose:  The central aggregate root of the New Business process. It
              represents a policy/contract being taken out by a
              prospective client and owns every rule governing its own
              lifecycle - campaign linkage, ownership, benefits,
              collection instruction and, most importantly, its status
              transitions.

    Requirements:
        BR-001 - Create Contract
        BR-002 - Link Campaign
        BR-003 - Capture Client Details (ownership linkage)
        BR-004 - Link Benefits
        BR-005 - Capture Collection Details
        BR-006 - Validate New Business
        BR-007 - Activate Contract

    Responsibilities:
        - Maintain contract state (NEW / VALIDATION_FAILED / IN-FORCE /
          CANCELLED / LAPSED) and enforce legal transitions itself -
          external code must call Activate()/Cancel()/Lapse(), never
          assign Status directly (Section 8, Section 45).
        - Own the composed ContractBenefit collection and
          CollectionInstruction.
        - Cache the last ValidationSummary produced against it and
          detect when that result has gone stale because the contract
          was mutated afterwards (Edge Case 47).

    Dependencies: ContractBenefit, CollectionInstruction,
        domain.interfaces.IContractValidator, domain.validation.*,
        exceptions.ContractStateException, exceptions.ValidationException
------------------------------------------------------------------------*/

USING domain.entities.AbstractDomainEntity.
USING domain.entities.ContractBenefit.
USING domain.entities.CollectionInstruction.
USING domain.interfaces.IContractValidator.
USING domain.validation.ValidationSummary.
USING exceptions.ContractStateException.
USING exceptions.ValidationException.
USING OpenEdge.Core.Collections.ArrayList.

CLASS domain.entities.Contract INHERITS AbstractDomainEntity:

    /* ---- Status constants (BR-010, Section 8) --------------------- */
    DEFINE PUBLIC STATIC PROPERTY STATUS_NEW               AS CHARACTER NO-UNDO INITIAL "NEW"               GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_VALIDATION_FAILED AS CHARACTER NO-UNDO INITIAL "VALIDATION_FAILED" GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_IN_FORCE          AS CHARACTER NO-UNDO INITIAL "IN-FORCE"          GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_CANCELLED         AS CHARACTER NO-UNDO INITIAL "CANCELLED"         GET.
    DEFINE PUBLIC STATIC PROPERTY STATUS_LAPSED            AS CHARACTER NO-UNDO INITIAL "LAPSED"            GET.

    DEFINE PUBLIC PROPERTY ContractId    AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Status        AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CampaignId    AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY OwnerPersonId AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY TotalPremium  AS DECIMAL   NO-UNDO INITIAL 0 GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY ActivatedDate AS DATETIME  NO-UNDO GET. PRIVATE SET.

    /* Timestamp of the last mutating operation - used to detect a
       stale ValidationSummary (Edge Case 47). */
    DEFINE PUBLIC PROPERTY LastMutatedDate AS DATETIME NO-UNDO GET. PRIVATE SET.

    /* Cached result of the most recent Validate() call. */
    DEFINE PUBLIC PROPERTY LastValidationSummary AS ValidationSummary NO-UNDO GET. PRIVATE SET.

    /* Idempotency guard for Activate() - Section 48 */
    DEFINE PUBLIC PROPERTY ActivationRequestCount AS INTEGER NO-UNDO INITIAL 0 GET. PRIVATE SET.

    DEFINE PRIVATE VARIABLE moBenefits AS ArrayList NO-UNDO.

    CONSTRUCTOR PUBLIC Contract ( ):
        SUPER ().
        moBenefits = NEW ArrayList().
        Status     = STATUS_NEW.
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE CHARACTER GetEntityName ( ):
        RETURN "Contract".
    END METHOD.

    /* ---------------------------------------------------------------
       BR-001 - Create Contract. The contract identifier is generated
       upstream by the repository/service (e.g. CON-000001) so that ID
       generation strategy can vary (sequence, GUID, DB trigger) without
       the aggregate caring how it was produced.
       --------------------------------------------------------------- */
    METHOD PUBLIC VOID Create (INPUT pcContractId AS CHARACTER, INPUT pcUserId AS CHARACTER):
        IF pcContractId = "" OR pcContractId = ? THEN
            UNDO, THROW NEW exceptions.BusinessRuleException("Contract identifier is required.", "NB-CONTRACT-001").

        ContractId      = pcContractId.
        Status          = STATUS_NEW.
        LastMutatedDate = NOW.
        THIS-OBJECT:StampCreated(pcUserId).
    END METHOD.

    /* ---- BR-002 - Link Campaign ------------------------------------
       A contract may only have one primary campaign; calling this
       again simply replaces the previous campaign linkage (the
       CampaignRequiredRule / campaign-active checks happen during
       Validate(), not here, keeping this method a simple mutator). */
    METHOD PUBLIC VOID AssignCampaign (INPUT pcCampaignId AS CHARACTER):
        THIS-OBJECT:GuardMutable().
        CampaignId      = pcCampaignId.
        LastMutatedDate = NOW.
    END METHOD.

    /* ---- BR-003 - Capture Client Details (ownership linkage) ------- */
    METHOD PUBLIC VOID AssignOwner (INPUT pcPersonId AS CHARACTER):
        THIS-OBJECT:GuardMutable().
        OwnerPersonId   = pcPersonId.
        LastMutatedDate = NOW.
    END METHOD.

    /* ---- BR-004 - Link Benefits ------------------------------------
       Rejects an exact duplicate benefit code (Edge Case: "Duplicate
       benefit added"). */
    METHOD PUBLIC VOID AddBenefit (INPUT poContractBenefit AS ContractBenefit):
        DEFINE VARIABLE i AS INTEGER NO-UNDO.

        THIS-OBJECT:GuardMutable().

        DO i = 1 TO moBenefits:Size:
            IF CAST(moBenefits:Get(i), ContractBenefit):BenefitCode = poContractBenefit:BenefitCode THEN
                UNDO, THROW NEW exceptions.BusinessRuleException(
                    SUBSTITUTE("Benefit &1 has already been added to this contract.", poContractBenefit:BenefitCode),
                    "NB-BENEFIT-002").
        END.

        moBenefits:Add(poContractBenefit).
        THIS-OBJECT:RecalculatePremium().
        LastMutatedDate = NOW.
    END METHOD.

    METHOD PUBLIC ArrayList GetBenefits ( ):
        RETURN moBenefits.
    END METHOD.

    METHOD PUBLIC INTEGER GetBenefitCount ( ):
        RETURN moBenefits:Size.
    END METHOD.

    METHOD PRIVATE VOID RecalculatePremium ( ):
        DEFINE VARIABLE i        AS INTEGER NO-UNDO.
        DEFINE VARIABLE dPremium AS DECIMAL NO-UNDO INITIAL 0.
        DO i = 1 TO moBenefits:Size:
            dPremium = dPremium + CAST(moBenefits:Get(i), ContractBenefit):Premium.
        END.
        TotalPremium = dPremium.
    END METHOD.

    /* ---- BR-005 - Capture Collection Details ----------------------- */
    DEFINE PUBLIC PROPERTY CollectionInstructionRef AS CollectionInstruction NO-UNDO GET. PRIVATE SET.

    METHOD PUBLIC VOID SetCollectionInstruction (INPUT poInstruction AS CollectionInstruction):
        THIS-OBJECT:GuardMutable().
        CollectionInstructionRef = poInstruction.
        LastMutatedDate          = NOW.
    END METHOD.

    /* ---- BR-006 - Validate New Business -----------------------------
       Delegates rule execution to the injected validator (dependency
       inversion - Section 39) and caches the result so Activate() can
       check it was both passing AND fresh. */
    METHOD PUBLIC ValidationSummary Validate (INPUT poValidator AS IContractValidator):
        LastValidationSummary = poValidator:ValidateContract(THIS-OBJECT).
        RETURN LastValidationSummary.
    END METHOD.

    /* ---- BR-007 / BRULE-010 / BRULE-011 - Activate Contract ---------
       Only a NEW contract with a passing, non-stale ValidationSummary
       may transition to IN-FORCE. Repeated activation requests against
       an already-activated contract are idempotent no-ops rather than
       errors (Section 48 - Idempotency). */
    METHOD PUBLIC VOID Activate ( ):
        ActivationRequestCount = ActivationRequestCount + 1.

        /* Idempotency: activating an already IN-FORCE contract twice
           must not create a second activation event or raise an error. */
        IF Status = STATUS_IN_FORCE THEN
            RETURN.

        IF Status <> STATUS_NEW THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Contract &1 cannot be activated from status &2.", ContractId, Status),
                Status, STATUS_IN_FORCE).

        IF NOT VALID-OBJECT(LastValidationSummary) THEN
            UNDO, THROW NEW ContractStateException(
                "Contract cannot be activated before it has been validated.",
                Status, STATUS_IN_FORCE).

        IF LastValidationSummary:IsStaleAsOf(LastMutatedDate) THEN
            UNDO, THROW NEW ValidationException(
                "Validation result is stale - the contract was modified after validation. Re-validate before activating.",
                LastValidationSummary).

        IF NOT LastValidationSummary:IsValid() THEN
            UNDO, THROW NEW ValidationException(
                "Contract failed new-business validation and cannot be activated.",
                LastValidationSummary).

        Status        = STATUS_IN_FORCE.
        ActivatedDate = NOW.
    END METHOD.

    /* Explicit "failed validation" marker state, independent of the
       Activate() guard above (BR-007 requires the contract to simply
       REMAIN NEW when an activation attempt fails - see Activate()).
       This transition exists for workflow-level reporting only, e.g.
       an agent explicitly parking a contract that repeatedly fails
       validation, and can always be reversed via ResetForRecapture(). */
    METHOD PUBLIC VOID MarkValidationFailed ( ):
        IF Status <> STATUS_NEW THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Contract &1 cannot be marked VALIDATION_FAILED from status &2.", ContractId, Status),
                Status, STATUS_VALIDATION_FAILED).
        Status = STATUS_VALIDATION_FAILED.
    END METHOD.

    METHOD PUBLIC VOID ResetForRecapture ( ):
        IF Status <> STATUS_VALIDATION_FAILED THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Contract &1 cannot be reset from status &2.", ContractId, Status),
                Status, STATUS_NEW).
        Status = STATUS_NEW.
    END METHOD.

    METHOD PUBLIC VOID Cancel ( ):
        IF Status <> STATUS_NEW AND Status <> STATUS_IN_FORCE THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Contract &1 cannot be cancelled from status &2.", ContractId, Status),
                Status, STATUS_CANCELLED).
        Status = STATUS_CANCELLED.
    END METHOD.

    METHOD PUBLIC VOID Lapse ( ):
        IF Status <> STATUS_IN_FORCE THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Contract &1 cannot lapse from status &2.", ContractId, Status),
                Status, STATUS_LAPSED).
        Status = STATUS_LAPSED.
    END METHOD.

    /* Guards mutating operations (campaign/owner/benefit/collection
       changes) against being applied to a contract that is no longer
       editable - Edge Case: "Contract already activated",
       "Contract cancelled". */
    METHOD PRIVATE VOID GuardMutable ( ):
        IF Status <> STATUS_NEW AND Status <> STATUS_VALIDATION_FAILED THEN
            UNDO, THROW NEW ContractStateException(
                SUBSTITUTE("Contract &1 can no longer be modified in status &2.", ContractId, Status),
                Status, "MODIFY").
    END METHOD.

    /* ---- Persistence rehydration seams ------------------------------
       Used ONLY by DB-backed repositories (DbContractRepository) when
       rebuilding an aggregate from stored rows. Rehydration is not a
       business mutation, so these methods deliberately bypass
       GuardMutable() and do not stamp audit fields - an IN-FORCE
       contract read back from the table must come out IN-FORCE, with
       its stored timestamps, not be re-created through mutators that
       would throw ContractStateException. */
    METHOD PUBLIC VOID RestorePersistedState
        ( INPUT pcStatus        AS CHARACTER,
          INPUT pcCampaignId    AS CHARACTER,
          INPUT pcOwnerPersonId AS CHARACTER,
          INPUT pdTotalPremium  AS DECIMAL,
          INPUT ptActivatedDate AS DATETIME,
          INPUT ptLastMutated   AS DATETIME,
          INPUT poInstruction   AS CollectionInstruction ):

        Status                   = pcStatus.
        CampaignId               = pcCampaignId.
        OwnerPersonId            = pcOwnerPersonId.
        TotalPremium             = pdTotalPremium.
        ActivatedDate            = ptActivatedDate.
        LastMutatedDate          = ptLastMutated.
        CollectionInstructionRef = poInstruction.
        ModifiedDate             = ptLastMutated.
    END METHOD.

    /* Adds one already-persisted child row during rehydration. Skips
       GuardMutable()/RecalculatePremium(): TotalPremium is restored
       verbatim by RestorePersistedState() from the stored column. */
    METHOD PUBLIC VOID RestoreBenefit (INPUT poContractBenefit AS ContractBenefit):
        moBenefits:Add(poContractBenefit).
    END METHOD.

END CLASS.
