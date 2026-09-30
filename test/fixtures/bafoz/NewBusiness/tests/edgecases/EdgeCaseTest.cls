/*------------------------------------------------------------------------
    Test:     EdgeCaseTest
    Covers:   A selection of the edge cases enumerated in Section 47
              that are not already exercised by the rule-level or
              service-level test suites:
                - Duplicate benefit added
                - Contract already activated (cannot be modified further)
                - Client already has an active policy (DuplicateContractRule)
------------------------------------------------------------------------*/

USING OpenEdge.Core.Assert.
USING Bootstrap.
USING domain.entities.Contract.
USING domain.entities.Benefit.
USING domain.entities.ContractBenefit.
USING domain.entities.CollectionInstruction.
USING domain.validation.ValidationSummary.
USING infrastructure.security.UserContext.
USING infrastructure.security.IUserContext.
USING exceptions.BusinessRuleException.
USING exceptions.ContractStateException.

CLASS tests.edgecases.EdgeCaseTest:

    @Test.
    METHOD PUBLIC VOID AddBenefit_Throws_WhenSameBenefitAddedTwice ( ):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        DEFINE VARIABLE oBenefit  AS Benefit  NO-UNDO.
        DEFINE VARIABLE oCB1      AS ContractBenefit NO-UNDO.
        DEFINE VARIABLE oCB2      AS ContractBenefit NO-UNDO.
        DEFINE VARIABLE lCaught   AS LOGICAL NO-UNDO.

        oContract = NEW Contract().
        oContract:Create("CON-EDGE-001", "test").

        oBenefit = NEW Benefit().
        oBenefit:Create("BEN001", "LIFE", "Life Cover", "desc", 250, Benefit:STATUS_ACTIVE, "test").

        oCB1 = NEW ContractBenefit().
        oCB1:Create("CON-EDGE-001", oBenefit, TODAY, "test").
        oContract:AddBenefit(oCB1).

        oCB2 = NEW ContractBenefit().
        oCB2:Create("CON-EDGE-001", oBenefit, TODAY, "test").

        DO:
            oContract:AddBenefit(oCB2).
            CATCH ex AS BusinessRuleException:
                lCaught = TRUE.
            END CATCH.
        END.

        Assert:IsTrue(lCaught, "Adding the same benefit code twice must raise BusinessRuleException").
        Assert:Equals(1, oContract:GetBenefitCount()).
    END METHOD.

    @Test.
    METHOD PUBLIC VOID AssignCampaign_Throws_WhenContractAlreadyActivated ( ):
        DEFINE VARIABLE oBootstrap  AS Bootstrap    NO-UNDO.
        DEFINE VARIABLE oContract   AS Contract      NO-UNDO.
        DEFINE VARIABLE oSupervisor AS IUserContext  NO-UNDO.
        DEFINE VARIABLE lCaught     AS LOGICAL       NO-UNDO.

        oBootstrap = NEW Bootstrap().
        oBootstrap:SeedMockData().
        oSupervisor = NEW UserContext("U001", "supervisor1", UserContext:ROLE_SUPERVISOR).

        oContract = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract:ContractId, "Ed", "Case", 01/01/1991, "9101015009087",
            "ed@example.com", "0826666666", "6 Main Street", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract:ContractId, "BEN001", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Ed Case", "agent1").
        oBootstrap:NewBusinessService:Validate(oContract:ContractId, "agent1").
        oContract = oBootstrap:NewBusinessService:Activate(oContract:ContractId, oSupervisor).

        DO:
            oContract:AssignCampaign("CAM002").
            CATCH ex AS ContractStateException:
                lCaught = TRUE.
            END CATCH.
        END.

        Assert:IsTrue(lCaught, "An IN-FORCE contract must not be modifiable").
    END METHOD.

    @Test.
    METHOD PUBLIC VOID Validate_Fails_WhenOwnerAlreadyHasActiveContract ( ):
        DEFINE VARIABLE oBootstrap  AS Bootstrap    NO-UNDO.
        DEFINE VARIABLE oContract1  AS Contract      NO-UNDO.
        DEFINE VARIABLE oContract2  AS Contract      NO-UNDO.
        DEFINE VARIABLE oSupervisor AS IUserContext  NO-UNDO.
        DEFINE VARIABLE oSummary2   AS ValidationSummary NO-UNDO.

        oBootstrap = NEW Bootstrap().
        oBootstrap:SeedMockData().
        oSupervisor = NEW UserContext("U001", "supervisor1", UserContext:ROLE_SUPERVISOR).

        /* First contract for the owner - fully captured and activated */
        oContract1 = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract1:ContractId, "CAM001", "agent1").
        oBootstrap:NewBusinessService:CapturePerson(
            oContract1:ContractId, "Dup", "Owner", 01/01/1988, "8801015009087",
            "dup@example.com", "0827777777", "7 Main Street", "agent1").
        oBootstrap:NewBusinessService:AddBenefit(oContract1:ContractId, "BEN001", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract1:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Dup Owner", "agent1").
        oBootstrap:NewBusinessService:Validate(oContract1:ContractId, "agent1").
        oContract1 = oBootstrap:NewBusinessService:Activate(oContract1:ContractId, oSupervisor).
        Assert:Equals(Contract:STATUS_IN_FORCE, oContract1:Status).

        /* Second contract, same owner (reuse OwnerPersonId directly since
           this test targets DuplicateContractRule, not person capture) */
        oContract2 = oBootstrap:NewBusinessService:CreateContract("agent1").
        oBootstrap:NewBusinessService:LinkCampaign(oContract2:ContractId, "CAM001", "agent1").
        oBootstrap:ContractRepo:GetById(oContract2:ContractId):AssignOwner(oContract1:OwnerPersonId).
        oBootstrap:NewBusinessService:AddBenefit(oContract2:ContractId, "BEN002", "agent1").
        oBootstrap:NewBusinessService:SetCollectionInstruction(
            oContract2:ContractId, CollectionInstruction:METHOD_DEBIT_ORDER, 25, "1234567890", "001", "Dup Owner", "agent1").

        oSummary2 = oBootstrap:NewBusinessService:Validate(oContract2:ContractId, "agent1").

        Assert:IsFalse(oSummary2:IsValid(), "A second contract for an owner with an active policy must fail validation").
    END METHOD.

END CLASS.
