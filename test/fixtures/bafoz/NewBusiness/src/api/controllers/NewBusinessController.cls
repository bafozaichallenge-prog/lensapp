/*------------------------------------------------------------------------
    Class:    NewBusinessController
    Purpose:  Thin HTTP-facing entry point for the New Business process
              (Section 29 - API Layer, Section 31 - Example API
              Endpoints). Contains NO business rules - its only
              responsibilities are: deserialize the inbound JSON into a
              DTO, call NewBusinessService, and serialize the resulting
              domain object back out as a DTO.

              In a PASOE deployment this class is wired to
              /api/new-business/* */ via a REST resource mapping (each
              public method below corresponds 1:1 to one endpoint in
              Section 31); the mapping itself is transport plumbing and
              intentionally kept outside this class.

    Requirements:  Section 29, Section 31
    Dependencies (constructor-injected): NewBusinessService, IUserContext
------------------------------------------------------------------------*/

USING application.services.NewBusinessService.
USING domain.entities.Contract.
USING domain.entities.Person.
USING domain.entities.ContractBenefit.
USING domain.entities.CollectionInstruction.
USING domain.validation.ValidationSummary.
USING infrastructure.security.IUserContext.
USING api.dto.CreateContractRequest.
USING api.dto.ContractResponse.
USING api.dto.CapturePersonRequest.
USING api.dto.AddBenefitRequest.
USING api.dto.CollectionInstructionRequest.
USING api.dto.ValidationResponse.
USING api.dto.ActivationResponse.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.controllers.NewBusinessController:

    DEFINE PRIVATE VARIABLE moNewBusinessService AS NewBusinessService NO-UNDO.

    CONSTRUCTOR PUBLIC NewBusinessController (INPUT poNewBusinessService AS NewBusinessService):
        moNewBusinessService = poNewBusinessService.
    END CONSTRUCTOR.

    /* POST /api/new-business/contracts */
    METHOD PUBLIC JsonObject CreateContract (INPUT poRequestJson AS JsonObject, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oRequest  AS CreateContractRequest NO-UNDO.
        DEFINE VARIABLE oContract AS Contract               NO-UNDO.

        oRequest  = CreateContractRequest:FromJson(poRequestJson).
        oContract = moNewBusinessService:CreateContract(poUser:GetUserId()).

        IF oRequest:CampaignId <> "" AND oRequest:CampaignId <> ? THEN DO:
            moNewBusinessService:LinkCampaign(oContract:ContractId, oRequest:CampaignId, poUser:GetUserId()).
            oContract = moNewBusinessService:GetContract(oContract:ContractId).
        END.

        RETURN ContractResponse:FromContract(oContract):ToJsonObject().
    END METHOD.

    /* POST /api/new-business/contracts/{contractId}/person */
    METHOD PUBLIC JsonObject CapturePerson (INPUT pcContractId AS CHARACTER, INPUT poRequestJson AS JsonObject, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oRequest AS CapturePersonRequest NO-UNDO.
        DEFINE VARIABLE oPerson  AS Person                NO-UNDO.
        DEFINE VARIABLE oJson    AS JsonObject             NO-UNDO.

        oRequest = CapturePersonRequest:FromJson(poRequestJson).

        oPerson = moNewBusinessService:CapturePerson(
            pcContractId, oRequest:FirstName, oRequest:Surname, oRequest:DateOfBirth,
            oRequest:IDNumber, oRequest:Email, oRequest:MobileNumber, oRequest:Address,
            poUser:GetUserId()).

        oJson = NEW JsonObject().
        oJson:Add("personId", oPerson:PersonId).
        oJson:Add("contractId", pcContractId).
        RETURN oJson.
    END METHOD.

    /* POST /api/new-business/contracts/{contractId}/benefits */
    METHOD PUBLIC JsonObject AddBenefit (INPUT pcContractId AS CHARACTER, INPUT poRequestJson AS JsonObject, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oRequest AS AddBenefitRequest NO-UNDO.
        DEFINE VARIABLE oCB      AS ContractBenefit    NO-UNDO.
        DEFINE VARIABLE oJson    AS JsonObject          NO-UNDO.

        oRequest = AddBenefitRequest:FromJson(poRequestJson).
        oCB      = moNewBusinessService:AddBenefit(pcContractId, oRequest:BenefitId, poUser:GetUserId()).

        oJson = NEW JsonObject().
        oJson:Add("contractId", pcContractId).
        oJson:Add("benefitCode", oCB:BenefitCode).
        oJson:Add("premium", oCB:Premium).
        RETURN oJson.
    END METHOD.

    /* POST /api/new-business/contracts/{contractId}/collection */
    METHOD PUBLIC JsonObject CaptureCollection (INPUT pcContractId AS CHARACTER, INPUT poRequestJson AS JsonObject, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oRequest AS CollectionInstructionRequest NO-UNDO.
        DEFINE VARIABLE oJson    AS JsonObject                    NO-UNDO.

        oRequest = CollectionInstructionRequest:FromJson(poRequestJson).

        moNewBusinessService:SetCollectionInstruction(
            pcContractId, oRequest:CollectionMethod, oRequest:CollectionDay,
            oRequest:AccountNumber, oRequest:BankCode, oRequest:AccountHolderName,
            poUser:GetUserId()).

        oJson = NEW JsonObject().
        oJson:Add("contractId", pcContractId).
        oJson:Add("collectionMethod", oRequest:CollectionMethod).
        RETURN oJson.
    END METHOD.

    /* POST /api/new-business/contracts/{contractId}/validate */
    METHOD PUBLIC JsonObject ValidateContract (INPUT pcContractId AS CHARACTER, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oSummary AS ValidationSummary NO-UNDO.
        oSummary = moNewBusinessService:Validate(pcContractId, poUser:GetUserId()).
        RETURN ValidationResponse:FromSummary(oSummary):ToJsonObject().
    END METHOD.

    /* POST /api/new-business/contracts/{contractId}/activate
       Idempotent - see Contract:Activate() (Section 48). */
    METHOD PUBLIC JsonObject ActivateContract (INPUT pcContractId AS CHARACTER, INPUT poUser AS IUserContext):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        oContract = moNewBusinessService:Activate(pcContractId, poUser).
        RETURN ActivationResponse:FromContract(oContract):ToJsonObject().
    END METHOD.

END CLASS.
