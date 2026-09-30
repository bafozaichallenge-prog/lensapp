/*------------------------------------------------------------------------
    Interface: IContractService
    Purpose:   Application-layer abstraction for contract lifecycle
              operations, consumed by NewBusinessService and the API
              controllers rather than the concrete ContractService.

    Requirements:  Section 25
------------------------------------------------------------------------*/

USING domain.entities.Contract.

INTERFACE domain.interfaces.IContractService:

    METHOD PUBLIC Contract CreateContract (INPUT pcUserId AS CHARACTER).

    METHOD PUBLIC Contract GetContract (INPUT pcContractId AS CHARACTER).

    METHOD PUBLIC VOID AssignCampaign (INPUT pcContractId AS CHARACTER, INPUT pcCampaignId AS CHARACTER).

    METHOD PUBLIC VOID AssignOwner (INPUT pcContractId AS CHARACTER, INPUT pcPersonId AS CHARACTER).

    METHOD PUBLIC VOID Activate (INPUT pcContractId AS CHARACTER, INPUT pcUserId AS CHARACTER).

END INTERFACE.
