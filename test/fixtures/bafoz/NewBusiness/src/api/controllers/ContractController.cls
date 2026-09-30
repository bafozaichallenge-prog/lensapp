/*------------------------------------------------------------------------
    Class:    ContractController
    Purpose:  Read-side endpoint(s) for looking up a contract directly,
              independent of the new-business capture flow (e.g. for a
              servicing/admin screen). Section 29 - API Layer.
------------------------------------------------------------------------*/

USING domain.interfaces.IContractService.
USING domain.entities.Contract.
USING api.dto.ContractResponse.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.controllers.ContractController:

    DEFINE PRIVATE VARIABLE moContractService AS IContractService NO-UNDO.

    CONSTRUCTOR PUBLIC ContractController (INPUT poContractService AS IContractService):
        moContractService = poContractService.
    END CONSTRUCTOR.

    /* GET /api/contracts/{contractId} */
    METHOD PUBLIC JsonObject GetContract (INPUT pcContractId AS CHARACTER):
        DEFINE VARIABLE oContract AS Contract NO-UNDO.
        oContract = moContractService:GetContract(pcContractId).
        RETURN ContractResponse:FromContract(oContract):ToJsonObject().
    END METHOD.

END CLASS.
