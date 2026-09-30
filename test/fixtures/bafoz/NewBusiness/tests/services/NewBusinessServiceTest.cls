/*------------------------------------------------------------------------
    Test:     NewBusinessServiceTest
    Covers:   application.services.NewBusinessService (full orchestration)
    Requirement:  Section 41 - Required Test Scenarios,
                   Section 53 - Example End-to-End Scenario

    Each test builds its own Bootstrap so repositories/state never leak
    between tests (Section 40 - "each rule/scenario must be
    independently testable").
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING Bootstrap.
USING domain.entities.Contract.
USING domain.entities.CollectionInstruction.
USING domain.validation.ValidationSummary.
USING infrastructure.security.UserContext.
USING infrastructure.security.IUserContext.
USING exceptions.ValidationException.
USING exceptions.BusinessRuleException.

CLASS tests.services.NewBusinessServiceTest:

    METHOD PRIVATE Bootstrap NewSeededBootstrap ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap NO-UNDO.
        oBootstrap = NEW Bootstrap().
        oBootstrap:SeedMockData().
        RETURN oBootstrap.
    END METHOD.

    /* ---- Section 53 - Example End-to-End Scenario -------------------- */
    @Test.
    METHOD PUBLIC VOID FullNewBusinessFlow_ActivatesContract ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap          NO-UNDO.
        DEFINE VARIABLE oContract  AS Contract            NO-UNDO.
        DEFINE VARIABLE oSummary   AS ValidationSummary   NO-UNDO.
        DEFINE VARIABLE oSupervisor AS IUserContext        NO-UNDO.

        oBootstrap = THIS-OBJECT:NewSeededBootstrap().
        oSupervisor = NEW UserContext("U001", "supervisor1", UserContext:ROLE_SUPERVISOR).

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract:ContractId, "John", "Doe", 01/01/1990, "9001015009087",
            "john@example.com", "0820000000", "1 Main Street", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1"). /* LIFE */
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN002", "agent1"). /* FUNERAL */
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "John Doe", "agent1").

        oSummary = oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").
        Assert:IsTrue(oSummary:IsValid(), "Fully-captured contract should pass validation").

        oContract = oBootstrap:NewBusinessService:Activate(oContract:ContractId, oSupervisor).
        Assert:Equals(Contract:STATUS_IN_FORCE, oContract:Status).

        /* Idempotency - Section 48 */
        oContract = oBootstrap:NewBusinessService:Activate(oContract:ContractId, oSupervisor).
        Assert:Equals(Contract:STATUS_IN_FORCE, oContract:Status).
    END METHOD.

    /* ---- Missing Campaign --------------------------------------------- */
    @Test.
    METHOD PUBLIC VOID Validate_Fails_WhenCampaignMissing ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap        NO-UNDO.
        DEFINE VARIABLE oContract  AS Contract          NO-UNDO.
        DEFINE VARIABLE oSummary   AS ValidationSummary NO-UNDO.

        oBootstrap = THIS-OBJECT:NewSeededBootstrap().

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract:ContractId, "Jane", "Smith", 05/05/1985, "8505055009087",
            "jane@example.com", "0821111111", "2 Main Street", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Jane Smith", "agent1").

        oSummary = oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

        Assert:IsFalse(oSummary:IsValid(), "Contract with no campaign must fail validation").
        Assert:Equals(Contract:STATUS_NEW, oBootstrap:NewBusinessService:GetContract(oContract:ContractId):Status).
    END METHOD.

    /* ---- Missing Person ------------------------------------------------ */
    @Test.
    METHOD PUBLIC VOID Validate_Fails_WhenPersonMissing ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap        NO-UNDO.
        DEFINE VARIABLE oContract  AS Contract          NO-UNDO.
        DEFINE VARIABLE oSummary   AS ValidationSummary NO-UNDO.

        oBootstrap = THIS-OBJECT:NewSeededBootstrap().

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Unknown", "agent1").

        oSummary = oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

        Assert:IsFalse(oSummary:IsValid(), "Contract with no owner must fail validation").
    END METHOD.

    /* ---- Missing Benefit ------------------------------------------------ */
    @Test.
    METHOD PUBLIC VOID Validate_Fails_WhenNoBenefitSelected ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap        NO-UNDO.
        DEFINE VARIABLE oContract  AS Contract          NO-UNDO.
        DEFINE VARIABLE oSummary   AS ValidationSummary NO-UNDO.

        oBootstrap = THIS-OBJECT:NewSeededBootstrap().

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract:ContractId, "Sam", "Jones", 03/03/1980, "8003035009087",
            "sam@example.com", "0823333333", "3 Main Street", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Sam Jones", "agent1").

        oSummary = oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

        Assert:IsFalse(oSummary:IsValid(), "Contract with no benefits must fail validation").
    END METHOD.

    /* ---- Invalid Collection Day ------------------------------------------ */
    @Test.
    METHOD PUBLIC VOID Validate_Fails_WhenCollectionDayIsZero ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap        NO-UNDO.
        DEFINE VARIABLE oContract  AS Contract          NO-UNDO.
        DEFINE VARIABLE oSummary   AS ValidationSummary NO-UNDO.

        oBootstrap = THIS-OBJECT:NewSeededBootstrap().

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract:ContractId, "Amy", "Lee", 07/07/1992, "9207075009087",
            "amy@example.com", "0824444444", "4 Main Street", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 0, "1234567890", "001", "Amy Lee", "agent1").

        oSummary = oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

        Assert:IsFalse(oSummary:IsValid(), "Collection day 0 must fail validation").
    END METHOD.

    /* ---- Activation Without Validation ------------------------------------ */
    @Test.
    METHOD PUBLIC VOID Activate_Throws_WhenValidationFailed ( ):
        DEFINE VARIABLE oBootstrap  AS Bootstrap    NO-UNDO.
        DEFINE VARIABLE oContract   AS Contract      NO-UNDO.
        DEFINE VARIABLE oSupervisor AS IUserContext  NO-UNDO.
        DEFINE VARIABLE lCaught     AS LOGICAL       NO-UNDO.

        oBootstrap  = THIS-OBJECT:NewSeededBootstrap().
        oSupervisor = NEW UserContext("U001", "supervisor1", UserContext:ROLE_SUPERVISOR).

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        /* Deliberately incomplete - no campaign, no person, no benefit */
        oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

        DO:
            oBootstrap:NewBusinessService:Activate(oContract:ContractId, oSupervisor).
            CATCH ex AS ValidationException:
                lCaught = TRUE.
            END CATCH.
        END.

        Assert:IsTrue(lCaught, "Activating a contract that failed validation must raise ValidationException").
    END METHOD.

    /* ---- Insufficient permission to activate (Section 38) ------------------ */
    @Test.
    METHOD PUBLIC VOID Activate_Throws_WhenUserLacksSupervisorRole ( ):
        DEFINE VARIABLE oBootstrap AS Bootstrap   NO-UNDO.
        DEFINE VARIABLE oContract  AS Contract     NO-UNDO.
        DEFINE VARIABLE oAgent     AS IUserContext NO-UNDO.
        DEFINE VARIABLE lCaught    AS LOGICAL      NO-UNDO.

        oBootstrap = THIS-OBJECT:NewSeededBootstrap().
        oAgent     = NEW UserContext("U002", "agent1", UserContext:ROLE_AGENT).

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract:ContractId, "Kim", "Park", 09/09/1995, "9509095009087",
            "kim@example.com", "0825555555", "5 Main Street", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Kim Park", "agent1").
        oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").

        DO:
            oBootstrap:NewBusinessService:Activate(oContract:ContractId, oAgent).
            CATCH ex AS BusinessRuleException:
                lCaught = TRUE.
            END CATCH.
        END.

        Assert:IsTrue(lCaught, "A plain agent must not be able to activate a contract").
    END METHOD.

END CLASS.
